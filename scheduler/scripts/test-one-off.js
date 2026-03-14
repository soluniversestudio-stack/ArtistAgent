const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const os = require("os");
const sharp = require("sharp");
const { uploadImages } = require("./upload-for-posting");
const { scheduleToMeta } = require("./post-to-instagram");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function runTest() {
    const filePath = "G:\\My Drive\\Sophia Sol Studio\\02_Project\\2026 Artwork\\03_Mauna #2\\Manua #2.jpg";
    const processedDir = fs.mkdtempSync(path.join(os.tmpdir(), "sol-test-"));
    const destPath = path.join(processedDir, "target_opt.jpg");

    console.log("Optimizing image...");
    await sharp(filePath)
        .resize(2160, 2160, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true })
        .toFile(destPath);

    console.log("Uploading to Cloudinary...");
    const urls = await uploadImages([destPath]);
    if (!urls || urls.length === 0) throw new Error("Upload failed");

    console.log("URL:", urls[0]);
    console.log("Waiting 10s for propagation...");
    await new Promise(r => setTimeout(r, 10000));

    console.log("Publishing to Meta (IMMEDIATE)...");
    
    try {
        const permalink = await scheduleToMeta({
            imageUrls: urls,
            caption: "Test immediate single image post #Mauna",
            isReel: false,
            scheduledIso: null
        }, {
            igUserId: process.env.IG_USER_ID,
            fbToken: process.env.FB_ACCESS_TOKEN,
            fbPageId: process.env.FB_PAGE_ID
        });
        console.log("Success! Permalink:", permalink);
    } catch (err) {
        console.error("Meta API error:", err.message);
    } finally {
        fs.rmSync(processedDir, { recursive: true, force: true });
    }
}

runTest();
