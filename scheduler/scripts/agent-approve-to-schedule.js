#!/usr/bin/env node
/**
 * agent-approve-to-schedule.js
 * Sol Studio Automation — Approved → Scheduled Transition
 *
 * Runs every 30 minutes via Task Scheduler.
 * Finds Notion Content DB rows where Status = "Approved".
 * Updates Notion Status → "Scheduled" since the post is already 
 * safely in the Meta Graph API queue (pushed by assembler).
 *
 * Usage:
 *   node agent-approve-to-schedule.js
 */

"use strict";

const dotenv = require("dotenv");
const path   = require("path");
const fs     = require("fs");
const https  = require("https");

const ENV_PATH = path.resolve(__dirname, "../.env");
dotenv.config({ path: ENV_PATH });

const { isWithinActiveHours, getTimezoneLabel, getLocalTimeString } = require("./timezone-helper");

// ─── Config ───────────────────────────────────────────────────────────────────
const DRY_RUN             = process.argv.includes("--dry-run");
const NOTION_API_KEY      = process.env.NOTION_API_KEY;
const NOTION_CONTENT_DB_ID= process.env.NOTION_CONTENT_DB_ID;
const LOG_FILE            = process.env.LOG_FILE || "G:\\My Drive\\Sophia Sol Studio\\00_Report\\antigravity.log";

// ─── Entry Point ──────────────────────────────────────────────────────────────
(async () => {
    try {
        log(`=== Approve to Schedule START (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);

        if (!isWithinActiveHours()) {
            log(`Outside active hours. Exiting.`)
            return;
        }

        // Find all "Approved" rows
        const rows = await notionQuery(NOTION_CONTENT_DB_ID, {
            filter: { property: "Status", status: { equals: "Approved" } }
        });

        if (rows.length === 0) return;
        let updated = 0;

        for (const row of rows) {
            const title = getTitle(row) || "(no title)";
            log(`\nPromoting: "${title}" (Approved -> Scheduled)`);

            if (DRY_RUN) {
                updated++;
                continue;
            }

            await notionPatch(`/pages/${row.id}`, { 
                properties: { "Status": { status: { name: "Scheduled" } } }
            });

            log(`  ✅ Notion → Status=Scheduled`);
            console.log(`✅ Marked Scheduled: "${title}"`);
            updated++;
        }

        log(`\n=== Done: ${updated} marked Scheduled ===`);

    } catch (err) {
        log(`ERROR: ${err.message}`);
        console.error("❌ Fatal error:", err.message);
        process.exit(1);
    }
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function notionQuery(dbId, body) {
    const result = await notionPost(`/databases/${dbId}/query`, body);
    if (result.object === "error") throw new Error(result.message);
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
                try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

function getTitle(row) { 
    const p = row?.properties?.Title || row?.properties?.Name; 
    return p?.title?.[0]?.plain_text || null; 
}

function log(msg) {
    const line = `[${new Date().toISOString()}] [approve->sched] ${msg}`;
    console.error(line);
    try {
        const dir = path.dirname(LOG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(LOG_FILE, line + "\n");
    } catch (_) { }
}
