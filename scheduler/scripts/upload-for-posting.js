#!/usr/bin/env node
/**
 * upload-for-posting.js [CLOUDINARY REST v2]
 * Sol Studio Automation — Image Upload to Cloudinary via REST API
 */

"use strict";

const dotenv = require("dotenv");
const path   = require("path");
const fs     = require("fs");
const axios  = require("axios");
const crypto = require("crypto");

// Locate .env in the parent directory of the script
const ENV_PATH = path.resolve(__dirname, "../.env");
dotenv.config({ path: ENV_PATH });

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY    = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

const LOG_FILE = process.env.LOG_FILE || "G:\\My Drive\\Sophia Sol Studio\\00_Report\\antigravity.log";

/**
 * Upload an array of local image paths to Cloudinary.
 * This is the public interface used by agent-content-assembler.js.
 * @param {string[]} imageFiles - Array of local file paths
 * @returns {Promise<string[]>} - Array of secure Cloudinary URLs
 */
async function uploadImages(imageFiles) {
    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
        throw new Error("Missing Cloudinary environment variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET)");
    }

    const urls = [];
    for (let i = 0; i < imageFiles.length; i++) {
        const filePath = imageFiles[i];
        const basename = path.basename(filePath);
        
        console.error(`  [${i + 1}/${imageFiles.length}] Uploading ${basename} to Cloudinary...`);
        log(`  Uploading: ${basename}`);

        try {
            const url = await uploadToCloudinary(filePath);
            urls.push(url);
            log(`  Uploaded: ${basename} → ${url}`);
            console.error(`  ✅ ${basename} → ${url}`);
        } catch (err) {
            log(`  ❌ Failed to upload ${basename}: ${err.message}`);
            // Fail fast as requested
            throw err;
        }

        // 500ms delay between uploads as requested
        if (i < imageFiles.length - 1) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return urls;
}

/**
 * Internal: Perform a signed upload to Cloudinary via REST API.
 * Forces format=jpg to ensure Meta compatibility.
 */
async function uploadToCloudinary(filePath) {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "sol_studio_autopost";
    const format = "jpg";

    // Parameters for signature (must be in alphabetical order)
    // 1. folder
    // 2. format
    // 3. timestamp
    const signatureStr = `folder=${folder}&format=${format}&timestamp=${timestamp}${API_SECRET}`;
    const signature = crypto.createHash("sha1").update(signatureStr).digest("hex");

    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

    // Create multipart form data
    const formData = new FormData();
    
    // Read file and append as Blob
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: "image/jpeg" });
    
    formData.append("file", blob, path.basename(filePath));
    formData.append("api_key", API_KEY);
    formData.append("timestamp", timestamp.toString());
    formData.append("folder", folder);
    formData.append("format", format);
    formData.append("signature", signature);

    try {
        const response = await axios.post(endpoint, formData, {
            timeout: 90000, // 90 second timeout
            headers: {
                "Accept": "application/json"
            }
        });

        if (response.data && response.data.secure_url) {
            // Return the secure URL. 
            // Cloudinary's secure_url with format=jpg will be a direct HTTPS JPEG link.
            return response.data.secure_url;
        } else {
            throw new Error(`Cloudinary responded without secure_url: ${JSON.stringify(response.data)}`);
        }
    } catch (err) {
        if (err.response) {
            const cloudErr = err.response.data?.error?.message || JSON.stringify(err.response.data);
            throw new Error(`Cloudinary API Error (${err.response.status}): ${cloudErr}`);
        } else if (err.code === "ECONNABORTED") {
            throw new Error("Cloudinary upload timed out after 90 seconds.");
        }
        throw err;
    }
}

/**
 * Simple logger to log file and console.error
 */
function log(msg) {
    const line = `[${new Date().toISOString()}] [upload-cloudinary] ${msg}`;
    console.error(line);
    try {
        const dir = path.dirname(LOG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(LOG_FILE, line + "\n");
    } catch (_) {
        // Ignore write errors to log file
    }
}

module.exports = { uploadImages };

// ─── Standalone mode ──────────────────────────────────────────────────────────
// Allows testing the upload logic in isolation.
if (require.main === module) {
    (async () => {
        try {
            const folderIdx = process.argv.indexOf("--folder");
            const folder = folderIdx !== -1 ? process.argv[folderIdx + 1] : null;
            const isDryRun = process.argv.includes("--dry-run");

            if (!folder) { 
                console.error('Usage: node upload-for-posting.js --folder "path" [--dry-run]'); 
                process.exit(1); 
            }
            if (!fs.existsSync(folder)) { 
                console.error(`❌ Folder not found: ${folder}`); 
                process.exit(1); 
            }

            const imageFiles = fs.readdirSync(folder)
                .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
                .sort()
                .map(f => path.join(folder, f));

            if (imageFiles.length === 0) { 
                console.error("❌ No images found in specified folder."); 
                process.exit(1); 
            }

            if (isDryRun) {
                console.error("🔍 DRY RUN: Cloudinary REST upload simulation");
                imageFiles.forEach((f, i) => console.error(`  ${i + 1}. ${path.basename(f)}`));
                const mockUrls = imageFiles.map((f, i) => {
                    const name = path.basename(f).replace(/\.[^/.]+$/, "");
                    return `https://res.cloudinary.com/${CLOUD_NAME || "demo"}/image/upload/v1/sol_studio_autopost/${name}.jpg`;
                });
                console.log("URLS_JSON:" + JSON.stringify(mockUrls));
                return;
            }

            const urls = await uploadImages(imageFiles);
            console.log("URLS_JSON:" + JSON.stringify(urls));
        } catch (err) {
            console.error("❌ Upload failed:", err.message);
            process.exit(1);
        }
    })();
}

