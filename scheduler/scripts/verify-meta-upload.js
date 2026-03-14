const https = require("https");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const fbToken = process.env.FB_ACCESS_TOKEN;
const igUserId = process.env.IG_USER_ID;

async function verifyUpload() {
    console.log(`Targeting IG User ID: ${igUserId}`);
    // Use a stable, high-reliability image URL
    const imageUrl = "https://raw.githubusercontent.com/fomantic/Fomantic-UI/master/test/images/image.png";
    
    console.log(`Testing Media Container creation with URL: ${imageUrl}`);
    
    const params = new URLSearchParams({
        access_token: fbToken,
        image_url: imageUrl,
        caption: "Test Upload " + new Date().toISOString()
    });

    const result = await metaPost(`/${igUserId}/media`, params.toString());
    console.log("Result:", JSON.stringify(result, null, 2));
}

function metaPost(endpoint, formBody) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(formBody);
        const req = https.request({
            hostname: "graph.facebook.com",
            path: `/v21.0${endpoint}`,
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": data.length
            }
        }, (res) => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

verifyUpload();
