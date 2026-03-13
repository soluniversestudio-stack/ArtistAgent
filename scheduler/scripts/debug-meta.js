const https = require("https");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const fbToken = process.env.FB_ACCESS_TOKEN;
const igUserId = process.env.IG_USER_ID;
const LOG_FILE = process.env.LOG_FILE || "G:\\My Drive\\Sophia Sol Studio\\00_Report\\antigravity.log";
const LOCAL_LOG = path.resolve(__dirname, "debug.log");

function log(msg) {
    const line = `[${new Date().toISOString()}] [DEBUG-META] ${msg}`;
    console.log(line);
    try {
        fs.appendFileSync(LOG_FILE, line + "\n");
    } catch (_) {}
    try {
        fs.appendFileSync(LOCAL_LOG, line + "\n");
    } catch (_) {}
}

async function debugMeta() {
    log("=== Meta Token Debug START ===");
    log(`Checking token starting with: ${fbToken ? fbToken.substring(0, 10) : "MISSING"}...`);
    log(`Targeting IG User ID: ${igUserId}`);

    if (!fbToken) {
        log("❌ FB_ACCESS_TOKEN is missing in .env");
        return;
    }

    try {
        // 1. Check Me
        log("1. Testing /me endpoint...");
        const me = await metaGet("/me?fields=id,name");
        log(`Result: ${JSON.stringify(me)}`);

        // 2. Check Permissions
        log("2. Testing /me/permissions endpoint...");
        const perms = await metaGet("/me/permissions");
        log(`Current Scopes: ${JSON.stringify(perms.data?.map(p => `${p.permission}: ${p.status}`))}`);

        // 2.5 Check Pages (me/accounts)
        log("2.5 Testing /me/accounts endpoint...");
        const pages = await metaGet("/me/accounts?fields=id,name,instagram_business_account");
        log(`Pages found: ${JSON.stringify(pages.data?.map(p => ({ id: p.id, name: p.name, ig: p.instagram_business_account?.id })))}`);

        // 3. Check IG Account visibility
        log(`3. Testing visibility of IG Account ${igUserId}...`);
        const ig = await metaGet(`/${igUserId}?fields=username,name`);
        log(`Result: ${JSON.stringify(ig)}`);
        
        log("=== Meta Token Debug END ===");

    } catch (err) {
        log(`❌ Debug step failed: ${err.message}`);
    }
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

debugMeta();
