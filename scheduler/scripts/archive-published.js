#!/usr/bin/env node
/**
 * archive-published.js
 * Sol Studio Automation — Archive Published Posts
 *
 * Runs every hour via Task Scheduler.
 * Finds Notion Content DB rows where Status = "Posted"
 * and Published Folder Path is empty.
 * Moves _Scheduled\YYYYMMDD_Platform\ → _Published\YYYYMMDD_Platform\
 * Updates Notion: Published Folder Path → full path, clears Scheduled Folder Path.
 *
 * Usage:
 *   node archive-published.js           ← live
 *   node archive-published.js --dry-run ← preview only
 */

"use strict";

const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const https = require("https");

const ENV_PATH = path.resolve(__dirname, "../.env");
dotenv.config({ path: ENV_PATH });

// ─── Config ───────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const NOTION_API_KEY = requireEnv("NOTION_API_KEY");
const NOTION_CONTENT_DB_ID = requireEnv("NOTION_CONTENT_DB_ID");
const DRIVE_SCHEDULED_PATH = requireEnv("DRIVE_SCHEDULED_PATH");
const DRIVE_PUBLISHED_PATH = requireEnv("DRIVE_PUBLISHED_PATH");
const LOG_FILE = process.env.LOG_FILE || "G:\\My Drive\\Sophia Sol Studio\\00_Report\\antigravity.log";

if (DRY_RUN) console.log("🔍 DRY RUN MODE — No files will be moved, no Notion writes.\n");

// ─── Entry Point ──────────────────────────────────────────────────────────────
(async () => {
    try {
        log(`=== Archive Published START (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);

        // Query Notion: Status=Posted AND Scheduled Folder Path is not empty
        const rows = await notionQuery(NOTION_CONTENT_DB_ID, {
            filter: {
                and: [
                    { property: "Status", status: { equals: "Posted" } },
                    { property: "Scheduled Folder Path", rich_text: { is_not_empty: true } }
                ]
            }
        });

        log(`Found ${rows.length} Posted row(s) with a Scheduled Folder Path to archive`);

        if (rows.length === 0) {
            console.log("ℹ️  No Posted rows to archive.");
            return;
        }

        let archived = 0;
        let skipped = 0;

        for (const row of rows) {
            const rowId = row.id;
            const title = getTitle(row) || "(no title)";
            const schedDate = getDateStart(row, "Scheduled Date") || new Date().toISOString().slice(0, 10);
            const platform = getMultiSelect(row, "Platform")?.[0] || "Instagram";
            const folderPath = getText(row, "Scheduled Folder Path");

            log(`\nArchiving: "${title}"`);
            log(`  Sched Date:   ${schedDate}`);
            log(`  Platform:     ${platform}`);
            log(`  Sched Folder: ${folderPath || "(empty)"}`);

            // Build destination folder name: YYYYMMDD_Platform
            const dateStr = schedDate.slice(0, 10).replace(/-/g, "");
            const folderName = `${dateStr}_${platform}`;
            const destPath = path.join(DRIVE_PUBLISHED_PATH, folderName);

            // Find the source folder
            // First try the Notion field; fall back to matching name in _Scheduled
            let srcPath = folderPath;
            if (!srcPath || !fs.existsSync(srcPath)) {
                const candidate = path.join(DRIVE_SCHEDULED_PATH, folderName);
                if (fs.existsSync(candidate)) {
                    srcPath = candidate;
                    log(`  Source found via folder name: ${srcPath}`);
                } else {
                    log(`  SKIP — No _Scheduled folder found for "${folderName}"`);
                    console.log(`⚠️  Skipped "${title}" — _Scheduled folder not found.`);
                    skipped++;
                    continue;
                }
            }

            if (DRY_RUN) {
                console.log(`✅ WOULD MOVE: ${srcPath}`);
                console.log(`           → ${destPath}`);
                console.log(`   WOULD UPDATE Notion: clear Scheduled Folder Path`);
                archived++;
                continue;
            }

            // Move folder: copy all files then remove source
            fs.mkdirSync(destPath, { recursive: true });
            for (const file of fs.readdirSync(srcPath)) {
                fs.copyFileSync(path.join(srcPath, file), path.join(destPath, file));
            }
            fs.rmSync(srcPath, { recursive: true, force: true });
            log(`  Moved → ${destPath}`);

            // Update Notion — only clear Scheduled Folder Path (archive path is internal)
            await notionPatch(`/pages/${rowId}`, {
                properties: {
                    "Scheduled Folder Path": { rich_text: [] }
                }
            });
            log(`  Notion updated`);
            console.log(`✅ Archived: "${title}" → ${folderName}`);
            archived++;
        }

        log(`\n=== Done: ${archived} archived, ${skipped} skipped ===`);
        console.log(`\n📁 ${archived} archived, ${skipped} skipped.`);

    } catch (err) {
        log(`ERROR: ${err.message}\n${err.stack || ""}`);
        console.error("❌ Fatal error:", err.message);
        process.exit(1);
    }
})();

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

function notionPost(endpoint, body) { return notionRequest("POST", endpoint, body); }
function notionPatch(endpoint, body) { return notionRequest("PATCH", endpoint, body); }

function notionRequest(method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = https.request({
            hostname: "api.notion.com",
            path: `/v1${endpoint}`,
            method,
            headers: {
                "Authorization": `Bearer ${NOTION_API_KEY}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data)
            }
        }, (res) => {
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
function getTitle(row) {
    const p = row?.properties?.Title || row?.properties?.Name;
    return p?.title?.[0]?.plain_text || null;
}
function getText(row, prop) {
    return row?.properties?.[prop]?.rich_text?.[0]?.plain_text || null;
}
function getMultiSelect(row, prop) {
    return row?.properties?.[prop]?.multi_select?.map(o => o.name) || [];
}
function getDateStart(row, prop) {
    return row?.properties?.[prop]?.date?.start || null;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function requireEnv(key) {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
}
function log(msg) {
    const line = `[${new Date().toISOString()}] [archive] ${msg}`;
    console.error(line);
    try {
        const dir = path.dirname(LOG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(LOG_FILE, line + "\n");
    } catch (_) { }
}
