#!/usr/bin/env node
/**
 * weekly-report.js
 * Sol Studio Automation — Weekly Performance Report
 *
 * Reads Notion Content DB + Performance DB, computes weekly stats,
 * writes a Weekly Report page in Notion, and creates a Calendar event.
 *
 * Usage:
 *   node weekly-report.js              ← live run (writes to Notion)
 *   node weekly-report.js --dry-run   ← prints what it WOULD do, no writes
 */

"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const https = require("https");
const fs = require("fs");
const path = require("path");

// ─── Config & Flags ──────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const LOG_FILE = expandHome(process.env.LOG_FILE || "~/Google Drive/Sophia Sol Studio/00_Report/antigravity.log");

const NOTION_API_KEY = requireEnv("NOTION_API_KEY");
const NOTION_CONTENT_DB_ID = requireEnv("NOTION_CONTENT_DB_ID");
// These three are created by you in Notion — blank is OK for --dry-run
const NOTION_PERFORMANCE_DB_ID = DRY_RUN ? (process.env.NOTION_PERFORMANCE_DB_ID || "PLACEHOLDER_PERF_DB") : requireEnv("NOTION_PERFORMANCE_DB_ID");
const NOTION_WEEKLY_REPORTS_DB_ID = DRY_RUN ? (process.env.NOTION_WEEKLY_REPORTS_DB_ID || "PLACEHOLDER_REPORTS_DB") : requireEnv("NOTION_WEEKLY_REPORTS_DB_ID");
const NOTION_CALENDAR_DB_ID = DRY_RUN ? (process.env.NOTION_CALENDAR_DB_ID || "PLACEHOLDER_CAL_DB") : requireEnv("NOTION_CALENDAR_DB_ID");
const TOKEN_EXPIRY_DATE = process.env.TOKEN_EXPIRY_DATE || "not yet set";

if (DRY_RUN) {
  console.log("🔍 DRY RUN MODE — No data will be written to Notion.\n");
}

// ─── Entry Point ─────────────────────────────────────────────────────────────
(async () => {
  try {
    log(`=== Weekly Report START (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);

    const today = new Date();
    const weekEnding = formatDate(today);                     // Monday of current run
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    // ── 1. Read Content DB ─────────────────────────────────────────────────
    log("Fetching Content DB from Notion…");
    const contentRows = await notionQueryAll(NOTION_CONTENT_DB_ID);
    const statusCounts = { Posted: 0, Approved: 0, Draft: 0, Idea: 0 };
    for (const row of contentRows) {
      const status = getSelectValue(row, "Status");
      if (status && statusCounts.hasOwnProperty(status)) statusCounts[status]++;
    }
    log(`Content DB: ${JSON.stringify(statusCounts)}`);

    // ── 2. Read Performance DB ────────────────────────────────────────────
    log("Fetching Performance DB from Notion…");
    const perfRows = await notionQueryAll(NOTION_PERFORMANCE_DB_ID, {
      filter: {
        property: "Date",
        date: { on_or_after: sevenDaysAgo.toISOString().split("T")[0] }
      }
    });

    let totalReach = 0;
    let totalSaves = 0;
    let totalFollowers = 0;
    let topPost = { title: "N/A", reach: 0, saves: 0 };

    for (const row of perfRows) {
      const reach = getNumberValue(row, "Reach") || 0;
      const saves = getNumberValue(row, "Saves") || 0;
      const follows = getNumberValue(row, "Follows") || 0;
      const title = getTitleValue(row);

      totalReach += reach;
      totalSaves += saves;
      totalFollowers += follows;

      if (reach > topPost.reach) {
        topPost = { title, reach, saves };
      }
    }
    log(`Stats: reach=${totalReach} saves=${totalSaves} followers=${totalFollowers}`);
    log(`Top post: "${topPost.title}" (reach: ${topPost.reach}, saves: ${topPost.saves})`);

    // ── 3. Build Report Payload ───────────────────────────────────────────
    const reportTitle = `Weekly Report — ${weekEnding}`;
    const calEventTitle = `Weekly Report — ${weekEnding}`;
    const summary = `${statusCounts.Posted} posts published. Top post: ${topPost.title}. Reach: ${totalReach}. Followers gained: ${totalFollowers}.`;

    const reportPageBody = {
      parent: { database_id: NOTION_WEEKLY_REPORTS_DB_ID },
      properties: {
        Name: { title: [{ text: { content: reportTitle } }] },
        "Week Ending": { date: { start: weekEnding } },
        "Posts Published": { number: statusCounts.Posted },
        "Top Post": { rich_text: [{ text: { content: `${topPost.title} — Reach: ${topPost.reach} | Saves: ${topPost.saves}` } }] },
        "Total Reach": { number: totalReach },
        "Total Saves": { number: totalSaves },
        "New Followers": { number: totalFollowers },
        "Pipeline - Approved": { number: statusCounts.Approved },
        "Pipeline - Draft": { number: statusCounts.Draft },
        "Pipeline - Idea": { number: statusCounts.Idea },
        "Token Expiry": { rich_text: [{ text: { content: TOKEN_EXPIRY_DATE } }] }
      },
      children: [
        makeParagraph(`📅 Week ending: ${weekEnding}`),
        makeParagraph(`📊 Posts published this week: ${statusCounts.Posted}`),
        makeParagraph(`🏆 Top post: ${topPost.title}`),
        makeParagraph(`   ↳ Reach: ${topPost.reach} | Saves: ${topPost.saves}`),
        makeParagraph(`📈 Total reach: ${totalReach}`),
        makeParagraph(`💾 Total saves: ${totalSaves}`),
        makeParagraph(`👥 New followers: ${totalFollowers}`),
        makeHeading("Content Pipeline"),
        makeParagraph(`✅ Approved: ${statusCounts.Approved}  |  📝 Draft: ${statusCounts.Draft}  |  💡 Idea: ${statusCounts.Idea}`),
        makeHeading("Security"),
        makeParagraph(`🔑 FB Token expiry: ${TOKEN_EXPIRY_DATE}`)
      ]
    };

    // ── 4. Calendar Event (Monday after the report) ───────────────────────
    const calEventDate = weekEnding; // The Monday this runs
    const calEventBody = {
      parent: { database_id: NOTION_CALENDAR_DB_ID },
      properties: {
        "Event Name": { title: [{ text: { content: calEventTitle } }] },
        Date: {
          date: {
            start: `${calEventDate}T09:00:00`,
            end: `${calEventDate}T09:15:00`
          }
        },
        Purpose: { rich_text: [{ text: { content: summary } }] }
      }
    };

    // ── 5. Write / Print ──────────────────────────────────────────────────
    if (DRY_RUN) {
      console.log("\n📋 WOULD CREATE Notion Weekly Report page:");
      console.log("   Title:", reportTitle);
      console.log("   Posts Published:", statusCounts.Posted);
      console.log("   Top Post:", topPost.title, "| Reach:", topPost.reach, "| Saves:", topPost.saves);
      console.log("   Total Reach:", totalReach);
      console.log("   Total Saves:", totalSaves);
      console.log("   New Followers:", totalFollowers);
      console.log("   Pipeline → Approved:", statusCounts.Approved, "Draft:", statusCounts.Draft, "Idea:", statusCounts.Idea);
      console.log("   Token Expiry:", TOKEN_EXPIRY_DATE);
      console.log("\n📅 WOULD CREATE Notion Calendar event:");
      console.log("   Title:", calEventTitle);
      console.log("   Date:", calEventDate, "09:00–09:15");
      console.log("   Description:", summary);
    } else {
      log("Writing Weekly Report page to Notion…");
      const reportPage = await notionPost("/pages", reportPageBody);
      log(`Report created: ${reportPage.id}`);

      log("Creating Notion Calendar event…");
      const calEvent = await notionPost("/pages", calEventBody);
      log(`Calendar event created: ${calEvent.id}`);

      await createCalendarCompletion("weekly-report", today, summary);
    }

    log("Report written to Notion ✓");
    console.log("✅ Report written to Notion");

  } catch (err) {
    logError("weekly-report", err);
    if (!DRY_RUN) {
      await notionErrorPage("weekly-report", err).catch(() => { });
    }
    process.exit(1);
  }
})();

// ─── Notion Helpers ───────────────────────────────────────────────────────────
async function notionQueryAll(dbId, extraBody = {}) {
  let results = [], cursor = undefined;
  do {
    const body = { page_size: 100, ...extraBody };
    if (cursor) body.start_cursor = cursor;
    const res = await notionPost(`/databases/${dbId}/query`, body);
    results = results.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results;
}

function notionPost(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: "api.notion.com",
      path: `/v1${endpoint}`,
      method: "POST",
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
        try {
          const parsed = JSON.parse(raw);
          if (parsed.object === "error") reject(new Error(`Notion API: ${parsed.message}`));
          else resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function createCalendarCompletion(jobName, date, description) {
  const title = `${jobName} — Completed — ${formatDate(date)}`;
  const start = new Date(date);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  await notionPost("/pages", {
    parent: { database_id: NOTION_CALENDAR_DB_ID },
    properties: {
      "Event Name": { title: [{ text: { content: title } }] },
      "Date": { date: { start: start.toISOString(), end: end.toISOString() } },
      "Purpose": { rich_text: [{ text: { content: description } }] }
    }
  });
}

async function notionErrorPage(jobName, err) {
  const NOTION_WEEKLY_REPORTS_DB_ID = process.env.NOTION_WEEKLY_REPORTS_DB_ID;
  if (!NOTION_WEEKLY_REPORTS_DB_ID) return;
  const title = `ERROR — ${jobName} — ${formatDate(new Date())}`;
  await notionPost("/pages", {
    parent: { database_id: NOTION_WEEKLY_REPORTS_DB_ID },
    properties: {
      Name: { title: [{ text: { content: title } }] }
    },
    children: [makeParagraph(`Error: ${err.message}\n\nStack:\n${err.stack || "N/A"}`)]
  });
}

// ─── Property Extractors ──────────────────────────────────────────────────────
function getSelectValue(row, prop) {
  // Notion has two similar types: 'select' and 'status' — handle both
  return row?.properties?.[prop]?.status?.name
    || row?.properties?.[prop]?.select?.name
    || null;
}
function getNumberValue(row, prop) {
  return row?.properties?.[prop]?.number ?? 0;
}
function getTitleValue(row) {
  const title = row?.properties?.Name?.title;
  return title?.[0]?.plain_text || "Untitled";
}

// ─── Block Builders ───────────────────────────────────────────────────────────
function makeParagraph(text) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text } }] } };
}
function makeHeading(text) {
  return { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: text } }] } };
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatDate(d) {
  return d.toISOString().split("T")[0];
}

function expandHome(p) {
  if (p.startsWith("~")) return path.join(process.env.HOME || process.env.USERPROFILE || "~", p.slice(1));
  return p;
}

function requireEnv(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required .env variable: ${key}`);
  return val;
}

function log(msg) {
  const line = `[${new Date().toISOString()}] [weekly-report] ${msg}`;
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
