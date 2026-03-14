const https = require("https");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const fbToken = process.env.FB_ACCESS_TOKEN;
const appId = process.env.FB_APP_ID;
const appSecret = process.env.FB_APP_SECRET;

async function debugToken() {
    console.log("Debugging token...");
    // Use app_id|app_secret as the input_token to debug the user/page token
    const endpoint = `/debug_token?input_token=${fbToken}&access_token=${appId}|${appSecret}`;
    const result = await metaGet(endpoint);
    console.log("Debug Token Result:", JSON.stringify(result, null, 2));
}

function metaGet(endpoint) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: "graph.facebook.com",
            path: `/v21.0${endpoint}`,
            method: "GET"
        }, res => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.end();
    });
}

debugToken();
