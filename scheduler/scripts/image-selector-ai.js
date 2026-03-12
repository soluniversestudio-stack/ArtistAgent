#!/usr/bin/env node
/**
 * image-selector-ai.js
 * Sol Studio Automation — Heuristic Image Scoring & Selection
 *
 * Phase 1: Rule-based scoring (no ML required).
 * Phase 2: Will be replaced by PyTorch model predictions.
 *
 * Exports: selectImages(candidates, needed, category)
 * candidates: [{ path, stat }]
 * needed:     number of images to return
 * category:   "landscape"|"studio"|"sketch"|"detail"|"any"
 *
 * Returns: [{ path, score, reason }] sorted best-first
 *
 * Usage (standalone test):
 *   node image-selector-ai.js --test-dir "G:\My Drive\...\Sketches"
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ─── Scoring weights ──────────────────────────────────────────────────────────
const W_RECENCY     = 0.40;
const W_QUALITY     = 0.30;
const W_COMPOSITION = 0.20;
const W_VARIETY     = 0.10;

// Image extensions the agent considers
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp", ".tif", ".tiff"]);

/**
 * Main export: select the top `needed` images from `candidates` for a given category.
 *
 * @param {Array<{path: string, stat: fs.Stats}>} candidates
 * @param {number} needed
 * @param {string} category  "landscape"|"studio"|"sketch"|"detail"|"any"
 * @returns {Array<{path: string, score: number, reason: string}>}
 */
function selectImages(candidates, needed, category = "any") {
    if (!candidates || candidates.length === 0) return [];

    const now = Date.now();
    const maxSize  = Math.max(...candidates.map(c => c.stat.size));
    const maxMtime = Math.max(...candidates.map(c => c.stat.mtimeMs));
    const minMtime = Math.min(...candidates.map(c => c.stat.mtimeMs));
    const timeRange = maxMtime - minMtime || 1;

    const scored = candidates.map(c => {
        const ext  = path.extname(c.path).toLowerCase();
        const base = path.basename(c.path, ext).toLowerCase();

        // ── Recency score ────────────────────────────────────────────────────
        // Files modified recently score higher.
        // Decay: linear from 1.0 (newest) to 0.1 (oldest in set)
        const recencyScore = 0.1 + 0.9 * ((c.stat.mtimeMs - minMtime) / timeRange);

        // ── File quality proxy ───────────────────────────────────────────────
        // Larger file = higher resolution = better quality proxy
        // HEIC files from iPhone are typically excellent
        const heicBonus = ext === ".heic" ? 0.1 : 0;
        const qualityScore = Math.min(1.0, (c.stat.size / maxSize) + heicBonus);

        // ── Composition hint ─────────────────────────────────────────────────
        // Without reading image dimensions (requires sharp), we guess from:
        // - Filename patterns (DSC_, IMG_, etc.)
        // - Category preference
        let compositionScore = 0.5; // neutral default

        if (category === "landscape" || category === "field") {
            // Landscape category: prefer images shot horizontally
            // Heuristic: iPhone landscape = "IMG_", Canon landscape = "DSC_"
            if (/^(img_|dsc_|dcim)/i.test(base)) compositionScore = 0.8;
            if (/mountain|horizon|field|nature|hawaii|hike/i.test(base)) compositionScore = 1.0;
        } else if (category === "studio" || category === "portrait") {
            // Studio shots: prefer portrait orientation files
            if (/studio|me|self|paint|work|session/i.test(base)) compositionScore = 0.9;
            // HEIC from phone in portrait mode = good portrait shot
            if (ext === ".heic") compositionScore = Math.min(1.0, compositionScore + 0.1);
        } else if (category === "sketch" || category === "detail") {
            // Sketches: straight-on camera shots, flat lighting = big files
            compositionScore = qualityScore * 0.9;
            if (/sketch|draw|pencil|charcoal|study/i.test(base)) compositionScore = 0.95;
        }

        // ── Total score ──────────────────────────────────────────────────────
        const total = (
            W_RECENCY     * recencyScore  +
            W_QUALITY     * qualityScore  +
            W_COMPOSITION * compositionScore
            // variety applied after sorting
        );

        // ── Reason text ──────────────────────────────────────────────────────
        const reasons = [];
        if (recencyScore > 0.7) reasons.push(`recent (${relativeAge(c.stat.mtimeMs)})`);
        if (qualityScore  > 0.8) reasons.push(`high resolution (${formatBytes(c.stat.size)})`);
        if (compositionScore > 0.8) reasons.push(`composition match for "${category}"`);
        if (ext === ".heic") reasons.push("iPhone HEIC (high quality)");

        return {
            path:  c.path,
            score: parseFloat(total.toFixed(4)),
            mtime: c.stat.mtimeMs,
            size:  c.stat.size,
            reason: reasons.length ? reasons.join("; ") : "meets baseline criteria"
        };
    });

    // Sort best-first
    scored.sort((a, b) => b.score - a.score);

    // ── Variety bonus: de-duplicate near-identical filenames / timestamps ─────
    // If two selected images have mtimes within 2 seconds, one gets penalized
    const selected = [];
    const usedTimes = new Set();

    for (const img of scored) {
        if (selected.length >= needed) break;

        // Check timestamp proximity (avoid burst-shot duplicates)
        const tKey = Math.round(img.mtime / 2000); // 2-second buckets
        if (usedTimes.has(tKey)) {
            img.score = parseFloat((img.score * (1 - W_VARIETY)).toFixed(4));
            img.reason += "; variety penalty (burst shot)";
        }
        usedTimes.add(tKey);
        selected.push(img);
    }

    return selected;
}

/**
 * Scan a directory for image files. Returns [{ path, stat }].
 * @param {string} dir
 * @param {boolean} recursive
 */
function scanForImages(dir, recursive = false) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && recursive) {
            results.push(...scanForImages(full, true));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (IMAGE_EXTS.has(ext)) {
                try {
                    const stat = fs.statSync(full);
                    results.push({ path: full, stat });
                } catch (_) { /* skip locked files */ }
            }
        }
    }
    return results;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function relativeAge(ms) {
    const days = Math.floor((Date.now() - ms) / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7)  return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

function formatBytes(b) {
    if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    if (b > 1e3) return `${(b / 1e3).toFixed(0)} KB`;
    return `${b} B`;
}

module.exports = { selectImages, scanForImages, IMAGE_EXTS };

// ─── Standalone test ──────────────────────────────────────────────────────────
if (require.main === module) {
    const dirArg = process.argv.find(a => a.startsWith("--test-dir="))?.split("=").slice(1).join("=")
        || process.argv[process.argv.indexOf("--test-dir") + 1];

    if (!dirArg) {
        console.log("Usage: node image-selector-ai.js --test-dir=\"G:\\...\\folder\"");
        process.exit(1);
    }

    console.log(`\n🔍 Scanning: ${dirArg}`);
    const candidates = scanForImages(dirArg, false);
    console.log(`   Found ${candidates.length} image(s)\n`);

    const results = selectImages(candidates, 10, "any");
    if (results.length === 0) {
        console.log("⚠️  No images found or folder is empty.");
    } else {
        console.log("Rank  Score  File");
        console.log("─────────────────────────────────────────────────────────────");
        results.forEach((r, i) => {
            console.log(`  ${String(i + 1).padStart(2)}.  ${r.score.toFixed(3)}  ${path.basename(r.path)}`);
            console.log(`        ↳ ${r.reason}`);
        });
    }
}
