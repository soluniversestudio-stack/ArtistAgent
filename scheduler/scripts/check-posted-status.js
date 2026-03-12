#!/usr/bin/env node
/**
 * check-posted-status.js
 * Sol Studio Automation — Auto-update "Scheduled" → "Posted"
 *
 * Runs HOURLY via Task Scheduler.
 * Finds "Schedulling" Content DB rows where Scheduled Date ≤ now (local time).
 * Verifies the post is live on Instagram via Meta Graph API.
 * Updates Notion Status → "Posted" when confirmed.
 *
 * Usage:
 *   node check-posted-status.js           ← live
 *   node check-posted-status.js --dry-run ← preview only
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
const NOTION_API_KEY      = requireEnv("NOTION_API_KEY");
const NOTION_CONTENT_DB_ID= requireEnv("NOTION_CONTENT_DB_ID");
const FB_ACCESS_TOKEN     = process.env.FB_ACCESS_TOKEN || null;
const LOG_FILE            = process.env.LOG_FILE || "G:\\My Drive\\Sophia Sol Studio\\00_Report\\antigravity.log";

if (DRY_RUN) console.log("🔍 DRY RUN MODE — No Notion writes.\n");

// ─── Entry Point ──────────────────────────────────────────────────────────────
(async () => {
    try {
        log(`=== Check Posted Status START (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);
        log(`Timezone: ${getTimezoneLabel()} | ${getLocalTimeString()}`);

        if (!isWithinActiveHours()) {
            log(`Outside active hours. Exiting.`);
            return;
        }

        const nowISO = new Date().toISOString();

        // Find all Schedulling rows where Scheduled Date ≤ now
        const rows = await notionQuery(NOTION_CONTENT_DB_ID, {
            filter: {
                and: [
                    { property: "Status",          status: { equals: "Schedulling" } },
                    { property: "Scheduled Date",   date:   { on_or_before: nowISO } }
                ]
            }
        });

        log(`Found ${rows.length} overdue Schedulling row(s)`);

        if (rows.length === 0) {
            console.log("ℹ️  No overdue Schedulling rows.");
            return;
        }

        let updated = 0, skipped = 0;

        for (const row of rows) {
            const rowId       = row.id;
            const title       = getTitle(row) || "(no title)";
            const schedDate   = getDateStart(row, "Scheduled Date");
            const metaLink    = getUrl(row, "Link to Meta");
            const ytLink      = getUrl(row, "Link to YT");

            log(`\nChecking: "${title}" (was scheduled: ${schedDate})`);

            if (DRY_RUN) {
                console.log(`✅ WOULD mark as Posted: "${title}"`);
                updated++;
                continue;
            }

            // Optionally verify post is live on Meta Graph API
            let isLive = true; // default: trust the schedule
            if (FB_ACCESS_TOKEN && metaLink) {
                try {
                    const igPostId = extractInstagramPostId(metaLink);
                    if (igPostId) {
                        const media = await metaGet(`/${igPostId}?fields=id,timestamp&access_token=${FB_ACCESS_TOKEN}`);
                        isLive = !!media.id;
                        log(`  Meta API: post ${igPostId} is ${isLive ? "live ✅" : "not found ⚠️"}`);
                    }
                } catch (e) {
                    log(`  Meta API check failed: ${e.message} — marking Posted anyway`);
                    isLive = true; // fail open: trust the schedule
                }
            }

            if (!isLive) {
                log(`  ⚠️  SKIP — post not yet live on Instagram`);
                skipped++;
                continue;
            }

            // Move the hidden "Link to X" over to the public "IG/YT Link" fields
            const propsToUpdate = {
                "Status": { status: { name: "Posted" } }
            };
            if (metaLink) propsToUpdate["IG Link"] = { url: metaLink };
            if (ytLink)   propsToUpdate["YT link"] = { url: ytLink };

            await notionPatch(`/pages/${rowId}`, { properties: propsToUpdate });
            log(`  ✅ Notion → Status=Posted, Links migrated`);
            console.log(`✅ Marked Posted: "${title}"`);
            updated++;
        }

        log(`\n=== Done: ${updated} marked Posted, ${skipped} skipped ===`);
        console.log(`\n📋 ${updated} marked Posted, ${skipped} skipped.`);
        log(`=== Check Posted Status END ===`);

    } catch (err) {
        log(`ERROR: ${err.message}\n${err.stack || ""}`);
        console.error("❌ Fatal error:", err.message);
        process.exit(1);
    }
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractInstagramPostId(url) {
    if (!url) return null;
    // https://www.instagram.com/p/XXXXX/ → XXXXX
    const m = url.match(/instagram\.com\/p\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
}

function metaGet(endpoint) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: "graph.facebook.com",
            path:     `/v25.0${endpoint}`,
            method:   "GET"
        }, res => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.end();
    });
}

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
                try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

function getTitle(row)           { const p = row?.properties?.Title || row?.properties?.Name; return p?.title?.[0]?.plain_text || null; }
function getUrl(row, prop)       { return row?.properties?.[prop]?.url || null; }
function getDateStart(row, prop) { return row?.properties?.[prop]?.date?.start || null; }

function requireEnv(key) {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
}
function log(msg) {
    const line = `[${new Date().toISOString()}] [check-posted] ${msg}`;
    console.error(line);
    try {
        const dir = path.dirname(LOG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(LOG_FILE, line + "\n");
    } catch (_) { }
}
