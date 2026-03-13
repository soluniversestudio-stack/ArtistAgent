#!/usr/bin/env node
/**
 * agent-content-assembler.js
 * Sol Studio Automation — Autonomous Content Assembly
 *
 * TRIGGER: Notion Content DB rows with Status = "Asset ready"
 *
 * What this does (fully autonomous):
 *   1. Reads "Note to Agent" from each "Asset ready" row
 *   2. Parses natural language instructions → image requirements per folder
 *   3. Scans Google Drive folders for candidate images
 *   4. Scores and selects best images using image-selector-ai.js
 *   5. Crops images to 4:5 (posts) or 9:16 (reels) using smart-crop-autonomous.js
 *   6. Updates Notion: Status → "Scheduling", Link to Meta filled
 *
 * Also handles Status = "Rejected" (re-runs with feedback from Note to Agent)
 *
 * Usage:
 *   node agent-content-assembler.js           ← live run
 *   node agent-content-assembler.js --dry-run ← preview, no files/Notion writes
 */

"use strict";

const dotenv = require("dotenv");
const path   = require("path");
const fs     = require("fs");
const https  = require("https");

const ENV_PATH = path.resolve(__dirname, "../.env");
dotenv.config({ path: ENV_PATH });

// ─── Local modules ─────────────────────────────────────────────────────────────
const { isWithinActiveHours, getTimezoneLabel, getLocalTimeString } = require("./timezone-helper");
const { selectImages, scanForImages }                               = require("./image-selector-ai");
const { cropBatch }                                                 = require("./smart-crop-autonomous");
const { uploadImages }                                               = require("./upload-for-posting");
const { scheduleToMeta }                                             = require("./post-to-instagram");
const os                                                             = require("os");

// ─── Config ───────────────────────────────────────────────────────────────────
const DRY_RUN             = process.argv.includes("--dry-run");
const NOTION_API_KEY      = requireEnv("NOTION_API_KEY");
const NOTION_CONTENT_DB_ID= requireEnv("NOTION_CONTENT_DB_ID");
const DRIVE_FIELD_PHOTOS  = process.env.DRIVE_FIELD_PHOTOS_PATH  || "";
const DRIVE_ARTWORK       = process.env.DRIVE_ARTWORK_2026_PATH  || "";
const MAX_CAROUSEL        = parseInt(process.env.MAX_CAROUSEL_IMAGES || "10", 10);
const LOG_FILE            = process.env.LOG_FILE || "G:\\My Drive\\Sophia Sol Studio\\00_Report\\antigravity.log";

if (DRY_RUN) console.log("🔍 DRY RUN MODE — No files created, no Notion writes.\n");

// ─── Entry Point ──────────────────────────────────────────────────────────────
(async () => {
    try {
        // ── Timezone / active hours check ─────────────────────────────────────
        const tzLabel = getTimezoneLabel();
        log(`=== Content Assembler START (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);
        log(`Timezone: ${tzLabel} — Local time: ${getLocalTimeString()}`);

        if (!isWithinActiveHours()) {
            log(`Outside active hours (8 AM – midnight local). Exiting.`);
            console.log(`ℹ️  Outside active hours [${tzLabel}]. Agent not running.`);
            return;
        }

        // ── Query Notion for "Asset ready" rows ───────────────────────────────
        const assetReadyRows = await notionQuery(NOTION_CONTENT_DB_ID, {
            filter: { property: "Status", status: { equals: "Asset ready" } }
        });

        // ── Query Notion for "Rejected" rows (re-run with feedback) ───────────
        const rejectedRows = await notionQuery(NOTION_CONTENT_DB_ID, {
            filter: { property: "Status", status: { equals: "Rejected" } }
        });

        const allRows = [
            ...assetReadyRows.map(r => ({ ...r, _trigger: "asset-ready" })),
            ...rejectedRows.map(r   => ({ ...r, _trigger: "rejected"    }))
        ];

        log(`Found: ${assetReadyRows.length} "Asset ready", ${rejectedRows.length} "Rejected"`);

        if (allRows.length === 0) {
            console.log("ℹ️  No rows to process. Nothing to assemble.");
            return;
        }

        const results = { assembled: 0, skipped: 0, errors: 0 };

        for (const row of allRows) {
            try {
                await processRow(row, results);
            } catch (err) {
                log(`  ERROR on row "${getTitle(row)}": ${err.message}`);
                console.error(`❌ Error on "${getTitle(row)}": ${err.message}`);
                results.errors++;
            }
        }

        const summary = `Content Assembler: ${results.assembled} assembled, ${results.skipped} skipped, ${results.errors} errors.`;
        log(`\n${summary}`);
        console.log(`\n📦 ${summary}`);
        log(`=== Content Assembler END ===`);

    } catch (err) {
        log(`FATAL: ${err.message}\n${err.stack || ""}`);
        console.error("❌ Fatal error:", err.message);
        process.exit(1);
    }
})();

// ─── Process a single Notion row ──────────────────────────────────────────────
async function processRow(row, results) {
    const rowId      = row.id;
    const trigger    = row._trigger;
    const title      = getTitle(row) || "(no title)";
    const platform   = getMultiSelect(row, "Platform")?.[0] || "Instagram";
    const schedDate  = getDateStart(row, "Scheduled Date");
    const noteRaw    = getText(row, "Note to Agent") || "";
    const revCount   = getNumber(row, "Revision Count") || 0;
    const isReel     = /reel/i.test(platform) || /reel/i.test(noteRaw);
    const ratio      = isReel ? "9:16" : "4:5";

    log(`\n[${trigger.toUpperCase()}] Processing: "${title}"`);
    log(`  Platform: ${platform} | Date: ${schedDate || "(none)"} | Revision: ${revCount}`);
    if (noteRaw) log(`  Note: ${noteRaw.slice(0, 120)}`);

    if (!noteRaw) {
        log(`  ⚠️ SKIP — "Note to Agent" field is empty. Please add instructions.`);
        console.log(`⚠️  Skipped "${title}" — Note to Agent is empty.`);
        results.skipped++;
        return;
    }

    // ── 1. Parse "Note to Agent" ──────────────────────────────────────────────
    const requirements = parseInstruction(noteRaw, title);
    log(`  Parsed ${requirements.length} image requirement group(s)`);

    if (DRY_RUN) {
        console.log(`\n📋 Would process: "${title}"`);
        for (const req of requirements) {
            console.log(`   • ${req.count === "rest" ? "Remaining slots" : req.count + " image(s)"} — ${req.category} from "${req.folderHint}"`);
        }
    }

    // ── 2. Scan folders & select images ──────────────────────────────────────
    const allSelected = [];
    let slotsRemaining = MAX_CAROUSEL;

    for (const req of requirements) {
        const folders = resolveFolders(req.folderHint, title);
        if (folders.length === 0) {
            log(`  ⚠️  No folder found for hint: "${req.folderHint}" — skipping`);
            continue;
        }

        let candidates = [];
        for (const dir of folders) {
            log(`  Scanning: ${dir}`);
            // Always scan recursively so we catch subfolders like "Hawaii - Kaena Point"
            const imgs = scanForImages(dir, true);
            log(`    → ${imgs.length} images found`);
            if (DRY_RUN) console.log(`   📂 Would scan: ${dir} (${imgs.length} images found)`);
            candidates.push(...imgs);
        }

        const needed = req.count === "rest"
            ? slotsRemaining
            : Math.min(req.count, slotsRemaining);

        if (needed <= 0) break;

        const selected = selectImages(candidates, needed, req.category);

        for (let i = 0; i < selected.length; i++) {
            allSelected.push({
                ...selected[i],
                category: req.category,
                number:   allSelected.length + 1
            });
        }

        slotsRemaining -= selected.length;
        log(`  Selected ${selected.length} ${req.category} image(s) (${slotsRemaining} slots left)`);
        if (DRY_RUN) {
            selected.forEach(s => console.log(`   ✅ Would select: ${path.basename(s.path)} (score: ${s.score})`));
        }
    }

    if (allSelected.length === 0) {
        log(`  ⚠️  SKIP — No images found matching requirements. Check Drive folder paths.`);
        console.log(`⚠️  Skipped "${title}" — no matching images found.`);
        results.skipped++;
        return;
    }

    log(`  Total selected: ${allSelected.length} image(s)`);

    // ── Confidence = average score × 100 ─────────────────────────────────────
    const avgScore   = allSelected.reduce((s, i) => s + i.score, 0) / allSelected.length;
    const confidence = Math.round(avgScore * 100);

    if (DRY_RUN) {
        console.log(`   📐 Would crop, compress and upload ${allSelected.length} images to ImgBB`);
        console.log(`   📅 Would schedule to Meta API for ${schedDate}`);
        console.log(`   🔄 Would update Notion: Status → "Scheduling", Link to Meta → (url)`);
        results.assembled++;
        return;
    }

    // ── 3. Smart Crop & Compress ─────────────────────────────────────────────
    log(`  Cropping and Compressing ${allSelected.length} images...`);
    const processedDir = fs.mkdtempSync(path.join(os.tmpdir(), "sol-process-"));
    
    // Step A: Crop
    const cropResults = await cropBatch(allSelected, processedDir, ratio);
    const croppedPaths = cropResults.map(r => r.cropped).filter(Boolean);
    
    if (croppedPaths.length === 0) {
        throw new Error("Cropping failed for all images.");
    }

    // Step B: Final Compress/Optimize for Meta
    log(`  Optimizing ${croppedPaths.length} images for Meta upload...`);
    const finalPaths = [];
    const sharp = require("sharp");

    for (const cropPath of croppedPaths) {
        const destPath = cropPath.replace(".jpg", "_opt.jpg");
        await sharp(cropPath)
            .resize(2160, 2160, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 82, progressive: true })
            .toFile(destPath);
        finalPaths.push(destPath);
    }

    // ── 4. Upload Optimized Images to ImgBB ───────────────────────────────────
    log(`  Uploading ${finalPaths.length} optimized images to ImgBB...`);
    const publicUrls = await uploadImages(finalPaths);
    log(`  ImgBB URLs generated: ${publicUrls.length}`);

    // ── 5. Schedule to Meta Graph API ─────────────────────────────────────────
    const existingCaption = getText(row, "Description") || "";
    const existingHashtags = getText(row, "Hashtags") || "";
    const finalCaption = `${existingCaption}\n\n${existingHashtags}`.trim();

    log(`  Scheduling to Meta...`);
    const fbToken = requireEnv("FB_ACCESS_TOKEN");
    const igUserId = requireEnv("IG_USER_ID");

    const metaPermalink = await scheduleToMeta({
        imageUrls: publicUrls,
        caption: finalCaption,
        isReel: isReel,
        scheduledIso: schedDate
    }, { igUserId, fbToken });

    log(`  Meta Scheduled! Permalink/ID: ${metaPermalink}`);

    // ── 6. Update Notion ──────────────────────────────────────────────────────
    const notionProps = {
        "Status":              { status: { name: "Scheduling" } },
        "Link to Meta":        { url: metaPermalink },
        "AI Reasoning":        { rich_text: [{ text: { content: buildReasoningSummary(allSelected) } }] },
        "AI Confidence":       { number: confidence }
    };

    // On rejection, also increment revision count
    if (trigger === "rejected") {
        notionProps["Revision Count"] = { number: revCount + 1 };
    }

    await notionPatch(`/pages/${rowId}`, { properties: notionProps });
    log(`  Notion → Status=Scheduling, Link to Meta=${metaPermalink}`);
    console.log(`✅ Scheduled successfully: "${title}" → ${metaPermalink} (${allSelected.length} images)`);
    results.assembled++;
}

// ─── NLP Instruction Parser ────────────────────────────────────────────────────
/**
 * Parses a "Note to Agent" string into structured requirements.
 * Handles patterns like:
 *   "1 photo: mountain in Hawaii (from field photos)"
 *   "2 photos: me painting in studio"
 *   "rest: iteration sketches from Kaena folder"
 *   "3 sketches from the Kaena folder, 1 mountain shot"
 *
 * @returns {Array<{count: number|"rest", category: string, folderHint: string}>}
 */
function parseInstruction(note, rowTitle = "") {
    const requirements = [];
    const lines = note.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

    for (const line of lines) {
        const lower = line.toLowerCase();

        // Match: "N photo(s)/image(s)/shot(s): description"
        const countMatch = line.match(/^(\d+)\s+(?:photo|image|shot|sketch|drawing|pic)\w*:?\s*(.*)/i);
        // Match: "rest: description" or "remaining: description" or "the rest: ..."
        const restMatch  = line.match(/^(?:rest|remaining|the rest|rest of|fill):?\s*(.*)/i);

        if (countMatch) {
            const count = parseInt(countMatch[1], 10);
            const desc  = countMatch[2] || "";
            requirements.push({
                count,
                category:   detectCategory(desc + " " + lower),
                folderHint: extractFolderHint(desc + " " + lower, rowTitle)
            });
        } else if (restMatch) {
            const desc = restMatch[1] || "";
            requirements.push({
                count:      "rest",
                category:   detectCategory(desc + " " + lower),
                folderHint: extractFolderHint(desc + " " + lower, rowTitle)
            });
        } else {
            // Try to extract any numeric + description from less structured lines
            const looseMatch = line.match(/(\d+)?\s*(sketch|studio|mountain|landscape|field|portrait|drawing|photo|image|shot)\w*/i);
            if (looseMatch) {
                const count = looseMatch[1] ? parseInt(looseMatch[1], 10) : "rest";
                requirements.push({
                    count,
                    category:   detectCategory(lower),
                    folderHint: extractFolderHint(lower, rowTitle)
                });
            }
        }
    }

    // If nothing parsed at all, treat whole note as "rest" with generic search
    if (requirements.length === 0) {
        requirements.push({ count: "rest", category: "any", folderHint: extractFolderHint(note, rowTitle) });
    }

    return requirements;
}

/**
 * Detect image category from description text.
 */
function detectCategory(text) {
    const t = text.toLowerCase();
    if (/mountain|landscape|field|nature|hawaii|hike|outdoors|horizon/.test(t)) return "landscape";
    if (/studio|me\s+paint|self|portrait|working|session|artist/.test(t))        return "studio";
    if (/sketch|drawing|pencil|charcoal|study|draft|iteration/.test(t))          return "sketch";
    if (/detail|close.?up|crop|zoom|macro/.test(t))                              return "detail";
    return "any";
}

/**
 * Extract folder hint keywords from description text.
 * These keywords are matched against known Drive folder names.
 */
function extractFolderHint(text, rowTitle = "") {
    // Look for explicit "from X folder" patterns
    const fromMatch = text.match(/from\s+([^,;.]+?)(?:\s+folder)?(?:[,;.]|$)/i);
    if (fromMatch) return fromMatch[1].trim();

    // Look for artwork name in parentheses: "(from Kaena folder)"
    const parenMatch = text.match(/\(from\s+([^)]+)\)/i);
    if (parenMatch) return parenMatch[1].trim();

    // Keyword matching
    const t = text.toLowerCase();
    if (/field.?photo|outdoors|hawaii|mountain|hike|nature/.test(t)) return "field photos";
    if (/studio|me\s+paint|working|session/.test(t)) {
        // Try to find artwork name from row title
        const artworkFromTitle = extractArtworkFromTitle(rowTitle);
        return artworkFromTitle ? `${artworkFromTitle}/studio` : "studio shots";
    }
    if (/sketch|kaena|drawing|iteration/.test(t)) {
        const artworkFromTitle = extractArtworkFromTitle(rowTitle);
        return artworkFromTitle ? `${artworkFromTitle}/sketches` : "sketches";
    }
    return "general";
}

/**
 * Extract artwork folder name from the Notion row title.
 * e.g., "Studio Diary — Kaena Progress" → "Kaena"
 * e.g., "Process: Kaimana Series" → "Kaimana"
 */
function extractArtworkFromTitle(title) {
    // Look for known artwork name patterns in the title
    const patterns = [
        /[—\-–:]\s*([A-Z][a-zA-Z\s#]+?)(?:\s+Progress|\s+Diary|\s+Process|\s+Series|$)/,
        /(?:Studio|Process|Diary)[:\s]+([A-Z][a-zA-Z\s#]+)/
    ];
    for (const p of patterns) {
        const m = title.match(p);
        if (m) return m[1].trim();
    }
    return null;
}

// ─── Drive Folder Resolver ────────────────────────────────────────────────────
/**
 * Map a folder hint to actual Drive paths.
 * Searches the artwork folder structure dynamically.
 */
function resolveFolders(hint, rowTitle = "") {
    const h = (hint || "").toLowerCase();
    const folders = [];

    // Extract artwork name (e.g., "Kaena #1" -> "Kaena")
    const artworkName = extractArtworkFromHint(hint) || extractArtworkFromTitle(rowTitle);
    const baseArtworkName = artworkName ? artworkName.replace(/#\d+/g, '').replace(/[^a-zA-Z0-9\s]/g, '').trim() : null;

    // Strategy 1: Direct field photos
    if (/field.?photo|outdoors|hawaii|mountain|landscape/.test(h)) {
        if (DRIVE_FIELD_PHOTOS && fs.existsSync(DRIVE_FIELD_PHOTOS)) {
            // If the row relates to a specific artwork, check if there's a matching field photo folder
            if (baseArtworkName) {
                const sub = findSubfolder(DRIVE_FIELD_PHOTOS, baseArtworkName);
                if (sub) {
                    folders.push(sub);
                    return folders;
                }
            }
            // Fallback to the root field photos folder
            folders.push(DRIVE_FIELD_PHOTOS);
        }
        return folders;
    }

    // Strategy 2: Artwork subfolder (studio/sketches)
    // Try to find by artwork name in the hint or the row title

    if (artworkName && DRIVE_ARTWORK) {
        const subfolderType = /studio/.test(h) ? "Studio shots"
            : /sketch/.test(h) ? "Sketches"
            : null;

        // Search for matching artwork folder
        const artworkFolder = findArtworkFolder(artworkName);
        if (artworkFolder) {
            if (subfolderType) {
                const sub = path.join(artworkFolder, subfolderType);
                if (fs.existsSync(sub)) {
                    folders.push(sub);
                } else {
                    // Try case-insensitive sub-folder search
                    const found = findSubfolder(artworkFolder, subfolderType);
                    if (found) folders.push(found);
                    else folders.push(artworkFolder); // fallback to artwork root
                }
            } else {
                folders.push(artworkFolder);
            }
        }
    }

    // Strategy 3: Fallback — use artwork root with subdirectory matching
    if (folders.length === 0 && DRIVE_ARTWORK) {
        if (fs.existsSync(DRIVE_ARTWORK)) {
            // Just search the top-level artwork folder
            folders.push(DRIVE_ARTWORK);
        }
    }

    return folders;
}

function extractArtworkFromHint(hint) {
    // "Kaena folder" → "Kaena"
    // "05_Kaena #1" → "05_Kaena #1"
    const m = hint.match(/([A-Z][a-zA-Z0-9\s#_]+?)(?:\s+folder|\/|\s+sketch|\s+studio|$)/i);
    return m ? m[1].trim() : null;
}

/**
 * Find a folder in DRIVE_ARTWORK whose name fuzzy-matches the artwork name.
 */
function findArtworkFolder(artworkName) {
    if (!DRIVE_ARTWORK || !fs.existsSync(DRIVE_ARTWORK)) return null;
    const name = artworkName.toLowerCase().replace(/[^a-z0-9]/g, "");

    try {
        const entries = fs.readdirSync(DRIVE_ARTWORK, { withFileTypes: true });
        for (const e of entries) {
            if (!e.isDirectory()) continue;
            const eName = e.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (eName.includes(name) || name.includes(eName.replace(/^\d+/, ""))) {
                return path.join(DRIVE_ARTWORK, e.name);
            }
        }
    } catch (_) { }
    return null;
}

/**
 * Find a subfolder by case-insensitive name within a parent.
 */
function findSubfolder(parentDir, name) {
    const target = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    try {
        const entries = fs.readdirSync(parentDir, { withFileTypes: true });
        for (const e of entries) {
            if (e.isDirectory()) {
                const eName = e.name.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (eName.includes(target) || target.includes(eName)) {
                    return path.join(parentDir, e.name);
                }
            }
        }
    } catch (_) { }
    return null;
}

function buildReasoningSummary(images) {
    const summary = images.map(img =>
        `#${img.number} ${path.basename(img.path)}: ${img.reason} (score: ${img.score})`
    ).join("\n");
    return summary.slice(0, 2000); // Notion rich_text limit
}

// ─── Notion Helpers ───────────────────────────────────────────────────────────
async function notionQuery(dbId, body) {
    const result = await notionPost(`/databases/${dbId}/query`, body);
    if (result.object === "error") throw new Error(`Notion API: ${result.message}`);
    let rows = result.results || [];
    let cursor = result.next_cursor;
    while (cursor) {
        const more = await notionPost(`/databases/${dbId}/query`, { ...body, start_cursor: cursor });
        rows = rows.concat(more.results || []);
        cursor = more.has_more ? more.next_cursor : null;
    }
    return rows;
}

function notionPost(endpoint, body)  { return notionRequest("POST",  endpoint, body); }
function notionPatch(endpoint, body) { return notionRequest("PATCH", endpoint, body); }

function notionRequest(method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req  = https.request({
            hostname: "api.notion.com",
            path:     `/v1${endpoint}`,
            method,
            headers: {
                "Authorization":  `Bearer ${NOTION_API_KEY}`,
                "Notion-Version": "2022-06-28",
                "Content-Type":   "application/json",
                "Content-Length": Buffer.byteLength(data)
            }
        }, res => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

// ─── Property Extractors ──────────────────────────────────────────────────────
function getTitle(row)           { const p = row?.properties?.Title || row?.properties?.Name; return p?.title?.[0]?.plain_text || null; }
function getText(row, prop)      { return row?.properties?.[prop]?.rich_text?.[0]?.plain_text || null; }
function getMultiSelect(row, p)  { return row?.properties?.[p]?.multi_select?.map(o => o.name) || []; }
function getDateStart(row, prop) { return row?.properties?.[prop]?.date?.start || null; }
function getNumber(row, prop)    { return row?.properties?.[prop]?.number ?? null; }

// ─── Utilities ────────────────────────────────────────────────────────────────
function requireEnv(key) {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
}
function log(msg) {
    const line = `[${new Date().toISOString()}] [assembler] ${msg}`;
    console.error(line);
    try {
        const dir = path.dirname(LOG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(LOG_FILE, line + "\n");
    } catch (_) { }
}
