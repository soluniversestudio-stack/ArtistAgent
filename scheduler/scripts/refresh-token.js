#!/usr/bin/env node
/**
 * refresh-token.js
 * Sol Studio Automation — Facebook Token Refresh
 *
 * Checks if the FB long-lived token expires within 7 days.
 * If so, exchanges it for a fresh 60-day token via the Graph API
 * and saves it back to .env automatically.
 *
 * Usage:
 *   node refresh-token.js              ← live run
 *   node refresh-token.js --dry-run   ← prints what it WOULD do, no writes
 *
 * Refresh endpoint:
 *   POST https://graph.facebook.com/v25.0/oauth/access_token
 *   ?grant_type=fb_exchange_token
 *   &client_id={FB_APP_ID}
 *   &client_secret={FB_APP_SECRET}
 *   &fb_exchange_token={FB_ACCESS_TOKEN}
 */

"use strict";

const dotenv = require("dotenv");
const path = require("path");
const https = require("https");
const fs = require("fs");

const ENV_PATH = path.resolve(__dirname, "../.env");
dotenv.config({ path: ENV_PATH });

// ─── Config & Flags ───────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const LOG_FILE = expandHome(process.env.LOG_FILE || "G:\\My Drive\\Sophia Sol Studio\\00_Report\\antigravity.log");

const FB_APP_ID = requireEnv("FB_APP_ID");
const FB_APP_SECRET = requireEnv("FB_APP_SECRET");
const FB_ACCESS_TOKEN = requireEnv("FB_ACCESS_TOKEN");
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY_DATE || "";

const WARN_DAYS_BEFORE = 7; // refresh if expiring within this many days

if (DRY_RUN) {
    console.log("🔍 DRY RUN MODE — No token changes will be written.\n");
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
(async () => {
    try {
        log(`=== Token Refresh START (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);

        // ── 1. Check expiry ───────────────────────────────────────────────────────
        const today = new Date();
        const expiryDate = TOKEN_EXPIRY ? new Date(TOKEN_EXPIRY) : null;
        const daysLeft = expiryDate
            ? Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24))
            : null;

        if (daysLeft === null) {
            log("TOKEN_EXPIRY_DATE not set in .env — refreshing anyway as a precaution.");
        } else {
            log(`Token expires: ${TOKEN_EXPIRY} (${daysLeft} days left)`);
        }

        const shouldRefresh = daysLeft === null || daysLeft <= WARN_DAYS_BEFORE;

        if (!shouldRefresh) {
            log(`✅ Token is healthy — ${daysLeft} days remaining. No refresh needed.`);
            console.log(`✅ Token is healthy — ${daysLeft} days left (expires ${TOKEN_EXPIRY}). No action taken.`);
            return;
        }

        log(`⚠️  Token expiring soon (${daysLeft ?? "unknown"} days) — initiating refresh…`);

        // ── 2. Refresh token via Graph API ────────────────────────────────────────
        if (DRY_RUN) {
            console.log("  WOULD call: POST https://graph.facebook.com/v25.0/oauth/access_token");
            console.log(`  WOULD send: client_id=${FB_APP_ID}, fb_exchange_token=***`);
            console.log("  WOULD receive: new access_token + expires_in");
            const futureExpiry = new Date(today);
            futureExpiry.setDate(today.getDate() + 60);
            console.log(`  WOULD update .env: FB_ACCESS_TOKEN=new_token, TOKEN_EXPIRY_DATE=${formatDate(futureExpiry)}`);
            console.log("\n✅ Dry run complete — token would be refreshed.");
            return;
        }

        const params = new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: FB_APP_ID,
            client_secret: FB_APP_SECRET,
            fb_exchange_token: FB_ACCESS_TOKEN
        });

        const result = await httpsGet(
            `https://graph.facebook.com/v25.0/oauth/access_token?${params.toString()}`
        );

        if (result.error) {
            throw new Error(`Graph API error: ${result.error.message} (code ${result.error.code})`);
        }

        const newToken = result.access_token;
        const expiresIn = result.expires_in; // seconds
        const newExpiry = new Date(today.getTime() + expiresIn * 1000);
        const newExpiryStr = formatDate(newExpiry);

        log(`New token received. Expires in: ${expiresIn}s → ${newExpiryStr}`);

        // ── 3. Update .env file ───────────────────────────────────────────────────
        let envContent = fs.readFileSync(ENV_PATH, "utf8");

        // Replace FB_ACCESS_TOKEN line
        envContent = envContent.replace(
            /^FB_ACCESS_TOKEN=.*/m,
            `FB_ACCESS_TOKEN=${newToken}`
        );

        // Replace or add TOKEN_EXPIRY_DATE line
        if (/^TOKEN_EXPIRY_DATE=/m.test(envContent)) {
            envContent = envContent.replace(
                /^TOKEN_EXPIRY_DATE=.*/m,
                `TOKEN_EXPIRY_DATE=${newExpiryStr}`
            );
        } else {
            envContent += `\nTOKEN_EXPIRY_DATE=${newExpiryStr}\n`;
        }

        fs.writeFileSync(ENV_PATH, envContent, "utf8");
        log(`✅ .env updated: TOKEN_EXPIRY_DATE=${newExpiryStr}`);
        console.log(`✅ Token refreshed! New expiry: ${newExpiryStr}`);
        console.log("   .env has been updated automatically.");

        // ── 4. Notify via Notion Calendar ─────────────────────────────────────────
        const NOTION_API_KEY = process.env.NOTION_API_KEY;
        const NOTION_CALENDAR_DB_ID = process.env.NOTION_CALENDAR_DB_ID;
        if (NOTION_API_KEY && NOTION_CALENDAR_DB_ID) {
            await notionCalendarEvent(
                NOTION_API_KEY,
                NOTION_CALENDAR_DB_ID,
                today,
                `FB Token Refreshed — new expiry: ${newExpiryStr}`
            );
            log("Notion Calendar event created for token refresh.");
        }

    } catch (err) {
        logError("refresh-token", err);
        // Attempt to log error to Notion
        const key = process.env.NOTION_API_KEY;
        const dbId = process.env.NOTION_WEEKLY_REPORTS_DB_ID;
        if (key && dbId && !DRY_RUN) {
            await notionErrorPage(key, dbId, "refresh-token", err).catch(() => { });
        }
        process.exit(1);
    }
})();

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────
function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(e); }
            });
        }).on("error", reject);
    });
}

function notionPost(apiKey, endpoint, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = https.request({
            hostname: "api.notion.com",
            path: `/v1${endpoint}`,
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
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

async function notionCalendarEvent(apiKey, calDbId, date, description) {
    const start = new Date(date);
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    await notionPost(apiKey, "/pages", {
        parent: { database_id: calDbId },
        properties: {
            Name: { title: [{ text: { content: `FB Token Refresh — Completed — ${formatDate(date)}` } }] },
            Date: { date: { start: start.toISOString(), end: end.toISOString() } },
            Description: { rich_text: [{ text: { content: description } }] }
        }
    });
}

async function notionErrorPage(apiKey, dbId, jobName, err) {
    const title = `ERROR — ${jobName} — ${formatDate(new Date())}`;
    await notionPost(apiKey, "/pages", {
        parent: { database_id: dbId },
        properties: { Name: { title: [{ text: { content: title } }] } },
        children: [{
            object: "block", type: "paragraph",
            paragraph: { rich_text: [{ type: "text", text: { content: `Error: ${err.message}\n\n${err.stack || ""}` } }] }
        }]
    });
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatDate(d) {
    return d instanceof Date ? d.toISOString().split("T")[0] : String(d);
}
function expandHome(p) {
    if (!p) return "";
    if (p.match(/^[A-Za-z]:\\/)) return p;
    if (p.startsWith("~")) return path.join(process.env.HOME || process.env.USERPROFILE || "C:\\Users\\sophi", p.slice(1));
    return p;
}
function requireEnv(key) {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required .env variable: ${key}`);
    return val;
}
function log(msg) {
    const line = `[${new Date().toISOString()}] [refresh-token] ${msg}`;
    console.log(line);
    try {
        const logDir = path.dirname(LOG_FILE);
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(LOG_FILE, line + "\n");
    } catch (_) { }
}
function logError(jobName, err) {
    log(`ERROR in ${jobName}: ${err.message}`);
    log(err.stack || "");
}
