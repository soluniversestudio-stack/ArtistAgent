"use strict";
const https = require("https");
const { URLSearchParams } = require("url");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

async function testImgBBUpload() {
    // Just use any small jpg from the system if available, or create a dummy one
    const dummyPath = path.resolve(__dirname, "dummy.jpg");
    // Create a 1x1 black dot jpg if possible? No, I'll just find one in the workspace.
    // Actually, I'll just use one of the images the assembler just tried to upload.
    const testLocalPath = "C:\\Users\\sophi\\AppData\\Local\\Temp\\sol-crop-7IGBRb\\01_crop_DSC02004_opt.jpg"; 
    // Wait, the assembler deleted those or they are in a temp folder.
    // I'll just use a file I know exists.
    
    console.log("Testing ImgBB Upload...");
    
    console.log("Testing ImgBB Upload with dummy 1x1 pixel...");
    
    // A 1x1 blue pixel transparent png base64
    const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA6ic39AAAAABJRU5ErkJggg==";
    
    const params = new URLSearchParams({
        key: IMGBB_API_KEY,
        image: imageBase64,
        expiration: "3600"
    });

    const body = params.toString();
    
    const options = {
        hostname: "api.imgbb.com",
        path: "/1/upload",
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body)
        }
    };

    const req = https.request(options, (res) => {
        let raw = "";
        res.on("data", d => raw += d);
        res.on("end", () => {
            const json = JSON.parse(raw);
            console.log("ImgBB Response:", JSON.stringify(json, null, 2));
        });
    });

    req.on("error", (e) => console.error(e));
    req.write(body);
    req.end();
}

testImgBBUpload();
