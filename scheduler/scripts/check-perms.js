const https = require("https");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const fbToken = process.env.FB_ACCESS_TOKEN;

async function checkPermissions() {
    console.log("Checking /me/permissions...");
    const result = await metaGet("/me/permissions");
    console.log("Permissions Result:", JSON.stringify(result, null, 2));
}

function metaGet(endpoint) {
    return new Promise((resolve, reject) => {
        const separator = endpoint.includes("?") ? "&" : "?";
        const req = https.request({
            hostname: "graph.facebook.com",
            path: `/v21.0${endpoint}${separator}access_token=${fbToken}`,
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

checkPermissions();
