#!/usr/bin/env node
/**
 * timezone-helper.js
 * Sol Studio Automation — Timezone & Active Hours Utility
 *
 * Auto-detects system timezone via Node.js Intl API.
 * Sophia's travel schedule:
 *   Now  – Apr 9:  Hawaii (HST, UTC-10)
 *   Apr 10 – May 7: Japan (JST, UTC+9)
 *   May 8+ :        Korea  (KST, UTC+9)
 *
 * Agent active hours: 8:00 AM – 12:00 AM local time (16 h daily).
 *
 * Usage as a module (required by all agent scripts):
 *   const { getLocalTimezone, isWithinActiveHours, getLocalTime, log } = require('./timezone-helper');
 *
 * Usage as a standalone test:
 *   node timezone-helper.js --test
 */

"use strict";

// ─── Active hours config (read from .env or defaults) ─────────────────────────
const ACTIVE_START = parseInt(process.env.AGENT_ACTIVE_START ?? "8", 10);   // 8 AM
const ACTIVE_END   = parseInt(process.env.AGENT_ACTIVE_END   ?? "24", 10);  // midnight

/**
 * Returns the IANA timezone identifier from the current system.
 * Examples: "Pacific/Honolulu", "Asia/Tokyo", "Asia/Seoul"
 */
function getLocalTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Returns a Date object in local system timezone.
 * Uses Intl to obtain a "local" moment from UTC.
 */
function getLocalTime() {
    const tz = getLocalTimezone();
    // Format as ISO-like string in the local zone, then parse it back
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
    }).formatToParts(new Date());

    const get = (type) => parts.find(p => p.type === type)?.value ?? "0";
    return new Date(
        `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`
    );
}

/**
 * Returns current local hour (0-23).
 */
function getLocalHour() {
    const tz = getLocalTimezone();
    return parseInt(
        new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour: "numeric",
            hour12: false
        }).format(new Date()),
        10
    );
}

/**
 * Returns true if current local time is within the agent's active window.
 * Default: 8:00 AM (inclusive) – 12:00 AM / midnight (exclusive).
 */
function isWithinActiveHours() {
    const hour = getLocalHour();
    if (ACTIVE_END === 24) {
        return hour >= ACTIVE_START;            // 8 AM through 11:59 PM
    }
    return hour >= ACTIVE_START && hour < ACTIVE_END;
}

/**
 * Returns a human-readable string for the current timezone + offset.
 * Examples: "Pacific/Honolulu (HST, UTC-10)", "Asia/Tokyo (JST, UTC+9)"
 */
function getTimezoneLabel() {
    const tz = getLocalTimezone();
    const offset = -new Date().getTimezoneOffset();       // minutes, positive = east
    const h = Math.abs(Math.floor(offset / 60));
    const sign = offset >= 0 ? "+" : "-";
    // Short abbreviation via Intl
    const abbr = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "short"
    }).formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value ?? tz;

    return `${tz} (${abbr}, UTC${sign}${h})`;
}

/**
 * Returns a formatted local datetime string for display/logging.
 */
function getLocalTimeString() {
    const tz = getLocalTimezone();
    return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: true
    }).format(new Date());
}

// ─── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
    getLocalTimezone,
    getLocalTime,
    getLocalHour,
    isWithinActiveHours,
    getTimezoneLabel,
    getLocalTimeString
};

// ─── Standalone test mode ─────────────────────────────────────────────────────
if (require.main === module && process.argv.includes("--test")) {
    const tz    = getLocalTimezone();
    const label = getTimezoneLabel();
    const time  = getLocalTimeString();
    const hour  = getLocalHour();
    const active = isWithinActiveHours();

    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║         Timezone Detection — Diagnostic Output       ║");
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log(`║  Timezone  : ${label.padEnd(38)}║`);
    console.log(`║  Local Now : ${time.padEnd(38)}║`);
    console.log(`║  Local Hour: ${String(hour).padEnd(38)}║`);
    console.log(`║  Active hrs: ${ACTIVE_START}:00 – ${ACTIVE_END === 24 ? "00:00 (midnight)" : ACTIVE_END + ":00"}`.padEnd(55) + "║");
    console.log(`║  Status    : ${(active ? "✅ ACTIVE (agent will run)" : "⏸️  INACTIVE (outside active hours)").padEnd(38)}║`);
    console.log("╚══════════════════════════════════════════════════════╝");

    console.log("\n📍 Travel schedule reminder:");
    console.log("   Now – Apr  9 → Hawaii (HST, UTC-10)");
    console.log("   Apr 10 – May 7 → Japan (JST, UTC+9)");
    console.log("   May 8+         → Korea (KST, UTC+9)");
    console.log("\nTo simulate Japan time, change Windows timezone:");
    console.log("  Settings → Time & language → Date & time → Time zone");
    console.log("  → (UTC+09:00) Osaka, Sapporo, Tokyo\n");
}
