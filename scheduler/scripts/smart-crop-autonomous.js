#!/usr/bin/env node
/**
 * smart-crop-autonomous.js
 * Sol Studio Automation — Context-Aware Image Cropping
 *
 * Crops images to Instagram-ready aspect ratios WITHOUT loading heavy ML models.
 * Uses sharp (pure-JS) for actual pixel manipulation.
 *
 * Crop strategies by image category:
 *   landscape / field  → rule-of-thirds: keep top 4/5 (horizon preservation)
 *   studio / portrait  → center-weighted: keep upper-center (face + artwork)
 *   sketch / detail    → true center crop (flat subject)
 *   default            → center crop
 *
 * Target ratios:
 *   post / carousel  → 4:5  (1080 × 1350)
 *   reel             → 9:16 (1080 × 1920)
 *
 * Usage:
 *   node smart-crop-autonomous.js --test-image "G:\...\photo.jpg" --category landscape
 *
 * Module exports:
 *   cropImage(srcPath, destPath, category, format)
 *   → Promise<{ width, height, destPath }>
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ─── Target dimensions ────────────────────────────────────────────────────────
const RATIOS = {
    "4:5":  { width: 1080, height: 1350 },  // posts, carousels
    "9:16": { width: 1080, height: 1920 },  // reels
    "1:1":  { width: 1080, height: 1080 },  // square
};

/**
 * Crop a single image for Instagram.
 *
 * @param {string} srcPath     - Absolute path to source image
 * @param {string} destPath    - Absolute path to save cropped image (will overwrite)
 * @param {string} category    - "landscape"|"studio"|"sketch"|"detail"|"any"
 * @param {string} ratio       - "4:5"|"9:16"|"1:1" (default: "4:5")
 * @returns {Promise<{width, height, destPath, strategy}>}
 */
async function cropImage(srcPath, destPath, category = "any", ratio = "4:5") {
    let sharp;
    try {
        sharp = require("sharp");
    } catch (e) {
        throw new Error(
            "sharp is not installed. Run: cd c:\\ArtistAgent\\scheduler && npm install sharp\n" +
            "Original error: " + e.message
        );
    }

    const target = RATIOS[ratio] || RATIOS["4:5"];
    const { width: tW, height: tH } = target;

    // Get original image metadata
    const meta = await sharp(srcPath).metadata();
    const srcW = meta.width;
    const srcH = meta.height;

    // ── Determine crop region ─────────────────────────────────────────────────
    // We need to extract a region of srcW×srcH that has the target aspect ratio,
    // then resize it to tW×tH.

    const targetAspect = tW / tH;
    const srcAspect    = srcW / srcH;

    let cropW, cropH, left, top;
    const strategy = getCropStrategy(category, srcAspect, targetAspect);

    if (srcAspect > targetAspect) {
        // Source is wider than target — crop horizontally
        cropH = srcH;
        cropW = Math.round(srcH * targetAspect);
        left  = getCropLeft(strategy, srcW, cropW);
        top   = 0;
    } else {
        // Source is taller than target — crop vertically
        cropW = srcW;
        cropH = Math.round(srcW / targetAspect);
        left  = 0;
        top   = getCropTop(strategy, srcH, cropH);
    }

    // Ensure bounds
    left = Math.max(0, Math.min(left, srcW - cropW));
    top  = Math.max(0, Math.min(top,  srcH - cropH));

    // Ensure destination directory exists
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    await sharp(srcPath)
        .extract({ left, top, width: cropW, height: cropH })
        .resize(tW, tH, { fit: "fill" })
        .jpeg({ quality: 92, progressive: true })
        .toFile(destPath);

    return { width: tW, height: tH, destPath, strategy };
}

/**
 * Decide the overall crop strategy name for logging.
 */
function getCropStrategy(category, srcAspect, targetAspect) {
    const cat = (category || "any").toLowerCase();
    if (cat === "landscape" || cat === "field") return "rule-of-thirds-top";
    if (cat === "studio"    || cat === "portrait") return "center-upper";
    if (cat === "sketch"    || cat === "detail")   return "true-center";
    return "center";
}

/**
 * Horizontal crop: where to start the left edge.
 * For most categories, center is correct.
 */
function getCropLeft(strategy, srcW, cropW) {
    return Math.round((srcW - cropW) / 2); // always center horizontally
}

/**
 * Vertical crop: where to start the top edge.
 * This is where we preserve the most important parts.
 */
function getCropTop(strategy, srcH, cropH) {
    switch (strategy) {
        case "rule-of-thirds-top":
            // Keep top 70% of the image (horizon, mountains, sky)
            // The "interesting" part is usually in the upper half for landscapes
            return Math.round(srcH * 0.05); // start 5% from top

        case "center-upper":
            // Keep upper-center: shift crop up by 15%
            // This keeps face + artwork in frame for studio shots
            return Math.round((srcH - cropH) * 0.35); // 35% from top

        case "true-center":
        case "center":
        default:
            // True center crop
            return Math.round((srcH - cropH) / 2);
    }
}

/**
 * Process a batch of images.
 *
 * @param {Array<{path, category, number}>} items   - source images with metadata
 * @param {string} destDir                           - folder to save cropped images
 * @param {string} ratio                             - "4:5" or "9:16"
 * @returns {Promise<Array<{original, cropped, strategy}>>}
 */
async function cropBatch(items, destDir, ratio = "4:5") {
    const results = [];
    for (const item of items) {
        const basename  = `${String(item.number).padStart(2, "0")}_crop_${path.basename(item.path, path.extname(item.path))}.jpg`;
        const destPath  = path.join(destDir, basename);
        try {
            const result = await cropImage(item.path, destPath, item.category, ratio);
            results.push({ original: item.path, cropped: result.destPath, strategy: result.strategy });
        } catch (err) {
            results.push({ original: item.path, cropped: null, error: err.message, strategy: "failed" });
        }
    }
    return results;
}

module.exports = { cropImage, cropBatch, RATIOS };

// ─── Standalone test ──────────────────────────────────────────────────────────
if (require.main === module) {
    const imgArg = process.argv.find(a => a.startsWith("--test-image="))?.split("=").slice(1).join("=")
        || (() => {
            const idx = process.argv.indexOf("--test-image");
            return idx !== -1 ? process.argv[idx + 1] : null;
        })();

    const catArg = process.argv.find(a => a.startsWith("--category="))?.split("=")[1]
        || (() => {
            const idx = process.argv.indexOf("--category");
            return idx !== -1 ? process.argv[idx + 1] : "any";
        })();

    const ratioArg = process.argv.find(a => a.startsWith("--ratio="))?.split("=")[1] || "4:5";

    if (!imgArg) {
        console.log("Usage: node smart-crop-autonomous.js --test-image \"path/to/image.jpg\" [--category landscape] [--ratio 4:5]");
        console.log("Categories: landscape, studio, sketch, detail, any");
        console.log("Ratios:     4:5 (posts), 9:16 (reels), 1:1 (square)");
        process.exit(1);
    }

    const destFile = path.join(
        path.dirname(imgArg),
        `_TEST_CROP_${catArg}_${path.basename(imgArg, path.extname(imgArg))}.jpg`
    );

    console.log(`\n🖼  Source   : ${imgArg}`);
    console.log(`📐 Category : ${catArg}`);
    console.log(`📏 Ratio    : ${ratioArg}`);
    console.log(`💾 Output   : ${destFile}\n`);

    cropImage(imgArg, destFile, catArg, ratioArg)
        .then(result => {
            console.log(`✅ Cropped! → ${result.destPath}`);
            console.log(`   Strategy : ${result.strategy}`);
            console.log(`   Output   : ${result.width}×${result.height}px`);
        })
        .catch(err => {
            console.error("❌", err.message);
            process.exit(1);
        });
}
