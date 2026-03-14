const https = require("https");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const userToken = process.env.FB_ACCESS_TOKEN;
const pageId = process.env.FB_PAGE_ID;
const appId = process.env.FB_APP_ID;
const appSecret = process.env.FB_APP_SECRET;

async function debugPageToken() {
    console.log("Fetching Page Access Token for Page " + pageId + "...");
    const res = await metaGet("/" + pageId + "?fields=access_token&access_token=" + userToken);
    const pageToken = res.access_token;

    if (!pageToken) {
        console.error("Failed to get Page Token:", JSON.stringify(res, null, 2));
        return;
    }

    console.log("Debugging Page Token...");
    const debug = await metaGet("/debug_token?input_token=" + pageToken + "&access_token=" + appId + "|" + appSecret);
    console.log("Debug Page Token Result:", JSON.stringify(debug, null, 2));
}

function metaGet(endpoint) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: "graph.facebook.com",
            path: "/v21.0" + endpoint,
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

debugPageToken();
