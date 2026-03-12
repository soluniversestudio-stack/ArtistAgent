#!/usr/bin/env node
/**
 * upload-for-posting.js
 * Sol Studio Automation — Image Upload to Public CDN for Meta API
 *
 * Called by Antigravity's "Execute Command" node (or standalone for testing).
 * Reads all .jpg/.jpeg/.png images from a _Review/cropped folder,
 * uploads each to ImgBB (free, 7-day lifespan), and returns public URLs.
 *
 * Usage (called by Antigravity):
 *   node upload-for-posting.js --folder "G:\...\02_Project\_Review\20260320_Instagram\cropped"
 *
 * Output (last line of stdout, parsed by Antigravity Function node):
 *   URLS_JSON:["https://i.ibb.co/...", "https://i.ibb.co/..."]
 *
 * Standalone test:
 *   node upload-for-posting.js --folder "G:\...\cropped" --dry-run
 *
 * Requires:
 *   npm install axios dotenv         (already in package.json)
 *   IMGBB_API_KEY in scheduler/.env
 */

"use strict";

const dotenv = require("dotenv");
const path   = require("path");
const fs     = require("fs");
const https  = require("https");
const http   = require("http");
const { URLSearchParams } = require("url");

const ENV_PATH = path.resolve(__dirname, "../.env");
dotenv.config({ path: ENV_PATH });

// ─── Config ───────────────────────────────────────────────────────────────────
const IMGBB_API_KEY  = process.env.IMGBB_API_KEY || null;
const DRY_RUN        = process.argv.includes("--dry-run");
const LOG_FILE       = process.env.LOG_FILE || "G:\\My Drive\\Sophia Sol Studio\\00_Report\\antigravity.log";

// Image expiration: 7 days (604800 sec) — enough window for a 1-2 week schedule
const EXPIRATION_SEC = 604800;

async function uploadImages(imageFiles) {
    if (!IMGBB_API_KEY) {
        throw new Error("IMGBB_API_KEY not set in .env. Get a free key at: https://imgbb.com/api");
    }

    const urls = [];
    for (let i = 0; i < imageFiles.length; i++) {
        const filePath = imageFiles[i];
        const basename = path.basename(filePath);
        console.error(`   [${i + 1}/${imageFiles.length}] Uploading ${basename}…`);
        log(`  Uploading: ${basename}`);

        const url = await uploadToImgBB(filePath);
        urls.push(url);
        log(`  Uploaded:  ${basename} → ${url}`);
        console.error(`   ✅ ${basename} → ${url}`);

        // Brief pause between uploads to be respectful to the free API
        if (i < imageFiles.length - 1) {
            await sleep(500);
        }
    }
    return urls;
}

if (require.main === module) {
    (async () => {
        try {
            // Parse --folder argument
            const folderIdx = process.argv.indexOf("--folder");
            const folder    = folderIdx !== -1 ? process.argv[folderIdx + 1] : null;

            if (!folder) {
                console.error("Usage: node upload-for-posting.js --folder \"path/to/cropped\"");
                process.exit(1);
            }

            if (!fs.existsSync(folder)) {
                console.error(`❌ Folder not found: ${folder}`);
                process.exit(1);
            }

            log(`=== Upload for Posting START ===`);
            log(`Folder: ${folder}`);

            // Find images (sorted numerically by filename prefix)
            const imageFiles = fs.readdirSync(folder)
                .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
                .sort()
                .map(f => path.join(folder, f));

            if (imageFiles.length === 0) {
                console.error(`❌ No images found in: ${folder}`);
                process.exit(1);
            }

            log(`Found ${imageFiles.length} image(s) to upload`);
            console.error(`📤 Uploading ${imageFiles.length} image(s)...`);

            if (DRY_RUN) {
                console.error("🔍 DRY RUN — would upload these files:");
                imageFiles.forEach((f, i) => console.error(`   ${i + 1}. ${path.basename(f)}`));
                // Output mock URLs so Antigravity parser can be tested
                const mockUrls = imageFiles.map((f, i) => `https://i.ibb.co/MOCK${i + 1}/${path.basename(f)}`);
                console.log("URLS_JSON:" + JSON.stringify(mockUrls));
                return;
            }

            const urls = await uploadImages(imageFiles);

            log(`Uploaded ${urls.length} image(s) successfully`);
            log(`=== Upload for Posting END ===`);

            // ── Output: Antigravity's Function node reads the last URLS_JSON: line ──
            console.log("URLS_JSON:" + JSON.stringify(urls));

        } catch (err) {
            log(`ERROR: ${err.message}`);
            console.error("❌ Upload failed:", err.message);
            process.exit(1);
        }
    })();
}

module.exports = {
    uploadImages
};

// ─── ImgBB Upload ─────────────────────────────────────────────────────────────
/**
 * Upload one image file to ImgBB.
 * Uses the v1 API: https://api.imgbb.com/1/upload
 * Returns the public direct image URL (not the page URL).
 *
 * @param {string} filePath  - absolute path to image
 * @returns {Promise<string>} - public URL like https://i.ibb.co/...
 */
async function uploadToImgBB(filePath) {
    const imageBase64 = fs.readFileSync(filePath, { encoding: "base64" });
    const name        = path.basename(filePath, path.extname(filePath))
        .replace(/[^a-zA-Z0-9_-]/g, "_");

    const params = new URLSearchParams();
    params.set("key",        IMGBB_API_KEY);
    params.set("image",      imageBase64);
    params.set("name",       name);
    params.set("expiration", String(EXPIRATION_SEC));

    const body    = params.toString();
    const result  = await httpsPost("api.imgbb.com", "/1/upload", body, {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body)
    });

    if (!result.success) {
        throw new Error(`ImgBB error: ${result.error?.message || JSON.stringify(result)}`);
    }

    // Return direct image URL (not the display page)
    return result.data.image?.url || result.data.url;
}

// ─── HTTPS helper ─────────────────────────────────────────────────────────────
function httpsPost(hostname, pathname, body, headers) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(body);
        const req  = https.request({
            hostname,
            path:   pathname,
            method: "POST",
            headers: { ...headers, "Content-Length": data.length }
        }, res => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error(`JSON parse failed: ${raw.slice(0, 200)}`)); }
            });
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function log(msg) {
    const line = `[${new Date().toISOString()}] [upload] ${msg}`;
    console.error(line);
    try {
        const dir = path.dirname(LOG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(LOG_FILE, line + "\n");
    } catch (_) { }
}
