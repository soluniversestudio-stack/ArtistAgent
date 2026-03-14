#!/usr/bin/env node
/**
 * agent-content-assembler.js  [FIXED v2 — COMPLETE]
 * Sol Studio Automation — Autonomous Content Assembly
 */

"use strict";

const dotenv = require("dotenv");
const path   = require("path");
const fs     = require("fs");
const https  = require("https");
const os     = require("os");

const ENV_PATH = path.resolve(__dirname, "../.env");
dotenv.config({ path: ENV_PATH });

const { isWithinActiveHours, getTimezoneLabel, getLocalTimeString } = require("./timezone-helper");
const { selectImages, scanForImages }                               = require("./image-selector-ai");
const { uploadImages }                                              = require("./upload-for-posting");
const { scheduleToMeta }                                            = require("./post-to-instagram");

const DRY_RUN              = process.argv.includes("--dry-run");
const NOTION_API_KEY       = requireEnv("NOTION_API_KEY");
const NOTION_CONTENT_DB_ID = requireEnv("NOTION_CONTENT_DB_ID");
const DRIVE_FIELD_PHOTOS   = process.env.DRIVE_FIELD_PHOTOS_PATH  || "";
const DRIVE_ARTWORK        = process.env.DRIVE_ARTWORK_2026_PATH  || "";
const MAX_CAROUSEL         = parseInt(process.env.MAX_CAROUSEL_IMAGES || "10", 10);
const LOG_FILE             = process.env.LOG_FILE
    || "G:\\My Drive\\Sophia Sol Studio\\00_Report\\antigravity.log";

if (DRY_RUN) console.log("🔍 DRY RUN MODE — No files created, no Notion writes.\n");

// ─── Entry Point ──────────────────────────────────────────────────────────────
(async () => {
    try {
        const tzLabel = getTimezoneLabel();
        log(`=== Content Assembler START (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);
        log(`Timezone: ${tzLabel} — Local time: ${getLocalTimeString()}`);

        if (!isWithinActiveHours()) {
            log("Outside active hours (8 AM – midnight local). Exiting.");
            console.log(`ℹ️  Outside active hours [${tzLabel}]. Agent not running.`);
            return;
        }

        const assetReadyRows = await notionQuery(NOTION_CONTENT_DB_ID, {
            filter: { property: "Status", status: { equals: "Asset ready" } }
        });

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
            log("=== Content Assembler END (nothing to do) ===");
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
        log("=== Content Assembler END ===");

    } catch (err) {
        log(`FATAL: ${err.message}\n${err.stack || ""}`);
        console.error("❌ Fatal error:", err.message);
        process.exit(1);
    }
})();

// ─── Process a single Notion row ─────────────────────────────────────────────
async function processRow(row, results) {
    const rowId     = row.id;
    const trigger   = row._trigger;
    const title     = getTitle(row) || "(no title)";
    const platform  = getMultiSelect(row, "Platform")?.[0] || "Instagram";
    const schedDate = getDateStart(row, "Scheduled Date");
    const noteRaw   = getText(row, "Note to Agent") || "";
    const isReel    = /reel/i.test(platform) || /reel/i.test(noteRaw);

    log(`\n[${trigger.toUpperCase()}] Processing: "${title}"`);
    log(`  Platform: ${platform} | Date: ${schedDate || "(none)"}`);
    if (noteRaw) log(`  Note: ${noteRaw.slice(0, 120)}`);

    if (!schedDate) {
        log(`  ⚠️ SKIP — "Scheduled Date" is empty.`);
        console.log(`⚠️  Skipped "${title}" — Scheduled Date is empty.`);
        results.skipped++;
        return;
    }

    const scheduledTimeUnix = Math.floor(new Date(schedDate).getTime() / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);
    // Skip rows whose scheduled time is more than 2 hours in the past — too stale.
    // Rows scheduled for the future OR within the past 2 hours will be processed
    // (the Meta API accepts scheduled_publish_time up to 75 days in the future).
    if (scheduledTimeUnix < nowUnix - 7200) {
        log(`  ⚠️ SKIP — Scheduled Date is more than 2 hours in the past (${schedDate}).`);
        console.log(`⚠️  Skipped "${title}" — Scheduled Date is too far in the past.`);
        results.skipped++;
        return;
    }

    if (!noteRaw) {
        log(`  ⚠️ SKIP — "Note to Agent" is empty.`);
        console.log(`⚠️  Skipped "${title}" — Note to Agent is empty.`);
        results.skipped++;
        return;
    }

    // ── 1. Parse Note to Agent ────────────────────────────────────────────────
    const requirements = parseInstruction(noteRaw, title);
    log(`  Parsed ${requirements.length} image requirement group(s)`);

    if (DRY_RUN) {
        console.log(`\n📋 Would process: "${title}"`);
        for (const req of requirements) {
            console.log(`   • ${req.count === "rest" ? "Remaining" : req.count} image(s) — ${req.category} from "${req.folderHint}"`);
        }
    }

    // ── 2. Scan & select images ───────────────────────────────────────────────
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
            const imgs = scanForImages(dir, true);
            log(`    → ${imgs.length} images found`);
            if (DRY_RUN) console.log(`   📂 Would scan: ${dir} (${imgs.length} images found)`);
            candidates.push(...imgs);
        }

        const needed = req.count === "rest" ? slotsRemaining : Math.min(req.count, slotsRemaining);
        if (needed <= 0) break;

        const selected = selectImages(candidates, needed, req.category);
        for (let i = 0; i < selected.length; i++) {
            allSelected.push({ ...selected[i], category: req.category, number: allSelected.length + 1 });
        }
        slotsRemaining -= selected.length;
        log(`  Selected ${selected.length} ${req.category} image(s) (${slotsRemaining} slots left)`);
        if (DRY_RUN) selected.forEach(s => console.log(`   ✅ Would select: ${path.basename(s.path)} (score: ${s.score})`));
    }

    if (allSelected.length === 0) {
        log(`  ⚠️  SKIP — No images found. Check Drive folder paths in .env.`);
        console.log(`⚠️  Skipped "${title}" — no matching images found.`);
        results.skipped++;
        return;
    }

    log(`  Total selected: ${allSelected.length} image(s)`);

    if (DRY_RUN) {
        console.log(`   📐 Would compress and upload ${allSelected.length} images`);
        console.log(`   📅 Would schedule to Meta API for ${schedDate}`);
        console.log(`   🔄 Would update Notion: Status → "Scheduling", IG Link → (url)`);
        results.assembled++;
        return;
    }

    // ── 3. Compress for Meta ──────────────────────────────────────────────────
    log(`  Compressing ${allSelected.length} images for Meta...`);
    const processedDir = fs.mkdtempSync(path.join(os.tmpdir(), "sol-process-"));
    const finalPaths = [];
    const sharp = require("sharp");

    for (const item of allSelected) {
        const destPath = path.join(processedDir, `${String(item.number).padStart(2, "0")}_opt.jpg`);
        await sharp(item.path)
            .resize(2160, 2160, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 82, progressive: true })
            .toFile(destPath);
        finalPaths.push(destPath);
    }

    // ── 4. Upload to Cloudinary via upload-for-posting.js ────────────────────
    log(`  Uploading ${finalPaths.length} images to Cloudinary...`);
    const publicUrls = await uploadImages(finalPaths);
    log(`  Cloudinary URLs: ${publicUrls.length}`);

    // ── 5. Schedule to Meta ───────────────────────────────────────────────────
    const caption = `${getText(row, "Description") || ""}\n\n${getText(row, "Hashtags") || ""}`.trim();
    log(`  Waiting 10s for Cloudinary URLs to propagate...`);
    await new Promise(r => setTimeout(r, 10000));

    const metaPermalink = await scheduleToMeta({
        imageUrls:    publicUrls,
        caption,
        isReel,
        scheduledIso: schedDate
    }, {
        igUserId: requireEnv("IG_USER_ID"),
        fbToken:  requireEnv("FB_ACCESS_TOKEN"),
        fbPageId: requireEnv("FB_PAGE_ID")
    });

    log(`  Meta Scheduled! Permalink/ID: ${metaPermalink}`);

    // ── 6. Update Notion ──────────────────────────────────────────────────────
    await notionPatch(`/pages/${rowId}`, {
        properties: {
            "Status":  { status: { name: "Scheduling" } },
            "IG Link": { url: metaPermalink }
        }
    });

    log(`  Notion updated → Status=Scheduling, IG Link=${metaPermalink}`);
    console.log(`✅ Scheduled: "${title}" → ${metaPermalink} (${allSelected.length} images)`);
    results.assembled++;

    try { fs.rmSync(processedDir, { recursive: true, force: true }); } catch (_) {}
}

// ─── NLP Instruction Parser ───────────────────────────────────────────────────
function parseInstruction(note, rowTitle = "") {
    const requirements = [];
    const lines = note.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
        const lower = line.toLowerCase();
        const countMatch = line.match(/^(\d+)\s+(?:photo|image|shot|sketch|drawing|pic)\w*:?\s*(.*)/i);
        const restMatch  = line.match(/^(?:rest|remaining|the rest|rest of|fill):?\s*(.*)/i);
        if (countMatch) {
            requirements.push({ count: parseInt(countMatch[1], 10), category: detectCategory(countMatch[2] + " " + lower), folderHint: extractFolderHint(countMatch[2] + " " + lower, rowTitle) });
        } else if (restMatch) {
            requirements.push({ count: "rest", category: detectCategory(restMatch[1] + " " + lower), folderHint: extractFolderHint(restMatch[1] + " " + lower, rowTitle) });
        } else {
            const looseMatch = line.match(/(\d+)?\s*(sketch|studio|mountain|landscape|field|portrait|drawing|photo|image|shot)\w*/i);
            if (looseMatch) {
                requirements.push({ count: looseMatch[1] ? parseInt(looseMatch[1], 10) : "rest", category: detectCategory(lower), folderHint: extractFolderHint(lower, rowTitle) });
            }
        }
    }
    if (requirements.length === 0) {
        requirements.push({ count: "rest", category: "any", folderHint: extractFolderHint(note, rowTitle) });
    }
    return requirements;
}

function detectCategory(text) {
    const t = text.toLowerCase();
    if (/mountain|landscape|field|nature|hawaii|hike|outdoors|horizon/.test(t)) return "landscape";
    if (/studio|me\s+paint|self|portrait|working|session|artist/.test(t)) return "studio";
    if (/sketch|drawing|pencil|charcoal|study|draft|iteration/.test(t)) return "sketch";
    if (/detail|close.?up|crop|zoom|macro/.test(t)) return "detail";
    return "any";
}

function extractFolderHint(text, rowTitle = "") {
    const fromMatch = text.match(/from\s+([^,;.]+?)(?:\s+folder)?(?:[,;.]|$)/i);
    if (fromMatch) return fromMatch[1].trim();
    const parenMatch = text.match(/\(from\s+([^)]+)\)/i);
    if (parenMatch) return parenMatch[1].trim();
    const t = text.toLowerCase();
    if (/field.?photo|outdoors|hawaii|mountain|hike|nature/.test(t)) return "field photos";
    if (/studio|me\s+paint|working|session/.test(t)) {
        const art = extractArtworkFromTitle(rowTitle);
        return art ? `${art}/studio` : "studio shots";
    }
    if (/sketch|kaena|drawing|iteration/.test(t)) {
        const art = extractArtworkFromTitle(rowTitle);
        return art ? `${art}/sketches` : "sketches";
    }
    return "general";
}

function extractArtworkFromTitle(title) {
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

function resolveFolders(hint, rowTitle = "") {
    const h = (hint || "").toLowerCase();
    const folders = [];
    const artworkName = extractArtworkFromHint(hint) || extractArtworkFromTitle(rowTitle);
    const baseArtworkName = artworkName
        ? artworkName.replace(/#\d+/g, "").replace(/[^a-zA-Z0-9\s]/g, "").trim()
        : null;

    if (/field.?photo|outdoors|hawaii|mountain|landscape/.test(h)) {
        if (DRIVE_FIELD_PHOTOS && fs.existsSync(DRIVE_FIELD_PHOTOS)) {
            if (baseArtworkName) {
                const sub = findSubfolder(DRIVE_FIELD_PHOTOS, baseArtworkName);
                if (sub) { folders.push(sub); return folders; }
            }
            folders.push(DRIVE_FIELD_PHOTOS);
            return folders;
        }
    }

    if (artworkName && DRIVE_ARTWORK) {
        const subfolderType = /studio/.test(h) ? "Studio shots" : /sketch/.test(h) ? "Sketches" : null;
        const artworkFolder = findArtworkFolder(artworkName);
        if (artworkFolder) {
            if (subfolderType) {
                const sub = path.join(artworkFolder, subfolderType);
                if (fs.existsSync(sub)) {
                    folders.push(sub);
                } else {
                    const found = findSubfolder(artworkFolder, subfolderType);
                    folders.push(found || artworkFolder);
                }
            } else {
                folders.push(artworkFolder);
            }
        }
    }

    if (folders.length === 0 && DRIVE_ARTWORK && fs.existsSync(DRIVE_ARTWORK)) {
        folders.push(DRIVE_ARTWORK);
    }
    return folders;
}

function extractArtworkFromHint(hint) {
    const m = (hint || "").match(/([A-Z][a-zA-Z0-9\s#_]+?)(?:\s+folder|\/|\s+sketch|\s+studio|$)/i);
    return m ? m[1].trim() : null;
}

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
    } catch (_) {}
    return null;
}

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
    } catch (_) {}
    return null;
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
        const req = https.request({
            hostname: "api.notion.com",
            path:     `/v1${endpoint}`,
            method,
            headers: {
                "Authorization":  `Bearer ${NOTION_API_KEY}`,
                "Notion-Version": "2022-06-28",
                "Content-Type":   "application/json",
                "Content-Length": Buffer.byteLength(data)
            },
            timeout: 30000
        }, res => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("Notion API request timed out")); });
        req.write(data);
        req.end();
    });
}

// ─── Property Extractors ──────────────────────────────────────────────────────
function getTitle(row)           { const p = row?.properties?.Title || row?.properties?.Name; return p?.title?.[0]?.plain_text || null; }
function getText(row, prop)      { return row?.properties?.[prop]?.rich_text?.[0]?.plain_text || null; }
function getMultiSelect(row, p)  { return row?.properties?.[p]?.multi_select?.map(o => o.name) || []; }
function getDateStart(row, prop) { return row?.properties?.[prop]?.date?.start || null; }

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
    } catch (_) {}
}
