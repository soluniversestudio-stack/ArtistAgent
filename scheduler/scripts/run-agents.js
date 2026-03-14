#!/usr/bin/env node
/**
 * run-agents.js
 * Sol Studio Automation — Master Agent Runner
 *
 * Runs ALL agents in the correct order in a single process.
 * Designed to be triggered by Windows Task Scheduler every 30 minutes.
 *
 * Agent schedule:
 *   Every 30 min  → agent-content-assembler    (Asset ready / Rejected → schedule to Meta)
 *   Every 30 min  → agent-approve-to-schedule  (Approved → Scheduled in Notion)
 *   Every 60 min  → check-posted-status        (Scheduled + past date → Posted)
 *   Every 60 min  → archive-published          (Posted → move to _Published folder)
 *   Every Sunday  → weekly-report              (Weekly stats to Notion)
 *
 * Usage:
 *   node run-agents.js           ← live
 *   node run-agents.js --dry-run ← dry run all agents
 */

"use strict";

const { execFileSync } = require("child_process");
const path = require("path");
const fs   = require("fs");
const dotenv = require("dotenv");

const ENV_PATH = path.resolve(__dirname, "../.env");
dotenv.config({ path: ENV_PATH });

const DRY_RUN  = process.argv.includes("--dry-run");
const LOG_FILE = process.env.LOG_FILE || "G:\\My Drive\\Sophia Sol Studio\\00_Report\\antigravity.log";
const SCRIPTS  = __dirname;

// ─── Timing state file ────────────────────────────────────────────────────────
// Tracks last-run times so we don't run hourly/weekly tasks too often.
const STATE_FILE = path.join(path.dirname(LOG_FILE), "agent-state.json");

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch (_) {}
    return {};
}

function saveState(state) {
    try {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (_) {}
}

function minutesSince(isoString) {
    if (!isoString) return Infinity;
    return (Date.now() - new Date(isoString).getTime()) / 60000;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function log(msg) {
    const line = `[${new Date().toISOString()}] [runner] ${msg}`;
    console.log(line);
    try {
        fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
        fs.appendFileSync(LOG_FILE, line + "\n");
    } catch (_) {}
}

function runScript(scriptName, label) {
    const scriptPath = path.join(SCRIPTS, scriptName);
    if (!fs.existsSync(scriptPath)) {
        log(`⚠️  SKIP — ${scriptName} not found`);
        return false;
    }

    const args = DRY_RUN ? ["--dry-run"] : [];
    log(`▶  Running: ${label}${DRY_RUN ? " (dry run)" : ""}...`);

    try {
        const output = execFileSync(process.execPath, [scriptPath, ...args], {
            encoding: "utf8",
            timeout:  5 * 60 * 1000,  // 5 min max per script
            env: process.env,
        });
        if (output.trim()) {
            output.trim().split("\n").forEach(line => log(`   ${line}`));
        }
        log(`✅ Done: ${label}`);
        return true;
    } catch (err) {
        const out = (err.stdout || "") + (err.stderr || "");
        if (out.trim()) out.trim().split("\n").forEach(line => log(`   ${line}`));
        log(`❌ Error in ${label}: ${err.message}`);
        return false;
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    log(`=== Sol Studio Agent Runner START (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);

    const state = loadState();
    const now   = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday

    // ── Every 30 min: Content Assembler ───────────────────────────────────────
    runScript("agent-content-assembler.js", "Content Assembler");

    // ── Every 30 min: Approve → Schedule ──────────────────────────────────────
    runScript("agent-approve-to-schedule.js", "Approve to Schedule");

    // ── Every 60 min: Check Posted Status ─────────────────────────────────────
    if (minutesSince(state.lastPostedCheck) >= 58) {
        runScript("check-posted-status.js", "Check Posted Status");
        state.lastPostedCheck = now.toISOString();
        saveState(state);
    } else {
        log(`⏭  Skipping Check Posted Status — ran ${Math.round(minutesSince(state.lastPostedCheck))}m ago`);
    }

    // ── Every 60 min: Archive Published ───────────────────────────────────────
    if (minutesSince(state.lastArchive) >= 58) {
        runScript("archive-published.js", "Archive Published");
        state.lastArchive = now.toISOString();
        saveState(state);
    } else {
        log(`⏭  Skipping Archive Published — ran ${Math.round(minutesSince(state.lastArchive))}m ago`);
    }

    // ── Weekly (Sunday): Weekly Report ────────────────────────────────────────
    if (dayOfWeek === 0 && minutesSince(state.lastWeeklyReport) >= 23 * 60) {
        runScript("weekly-report.js", "Weekly Report");
        state.lastWeeklyReport = now.toISOString();
        saveState(state);
    } else if (dayOfWeek === 0) {
        log(`⏭  Skipping Weekly Report — already ran today`);
    }

    log(`=== Sol Studio Agent Runner END ===\n`);
})();
