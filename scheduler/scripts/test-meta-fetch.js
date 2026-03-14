"use strict";
const https = require("https");
const { URLSearchParams } = require("url");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const fbToken = process.env.FB_ACCESS_TOKEN;
const igUserId = process.env.IG_USER_ID;

// Use the last-uploaded URL from the logs
const TEST_URL = "https://i.ibb.co/6mqkb7z9/10-crop-DSC02007-opt.jpg";

async function testSingleContainer() {
    console.log(`Testing Meta fetch for: ${TEST_URL}`);
    
    const params = new URLSearchParams({
        access_token: fbToken,
        image_url: TEST_URL,
        caption: "Test fetch from ImgBB"
    });

    const url = `https://graph.facebook.com/v21.0/${igUserId}/media`;
    
    return new Promise((resolve, reject) => {
        const data = Buffer.from(params.toString());
        const req = https.request(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": data.length
            }
        }, (res) => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                const json = JSON.parse(raw);
                console.log("Meta Response:", JSON.stringify(json, null, 2));
                resolve(json);
            });
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

testSingleContainer();
