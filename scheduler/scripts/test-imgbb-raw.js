const https = require("https");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const { URLSearchParams } = require("url");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

async function testUpload() {
    const dummyImage = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    
    const params = new URLSearchParams({
        key: IMGBB_API_KEY,
        image: dummyImage.toString("base64")
    });
    
    const body = params.toString();
    const req = https.request({
        hostname: "api.imgbb.com",
        path: "/1/upload",
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": body.length
        }
    }, res => {
        let raw = "";
        res.on("data", d => raw += d);
        res.on("end", () => {
            console.log("IMGBB_RESPONSE:" + raw);
        });
    });
    req.write(body);
    req.end();
}

testUpload();
