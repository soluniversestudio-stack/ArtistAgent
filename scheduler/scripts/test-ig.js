const https = require("https");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const fbToken = process.env.FB_ACCESS_TOKEN;

async function testIG() {
    console.log("Testing token with /me/accounts...");
    const pages = await metaGet("/me/accounts?fields=id,name,instagram_business_account");
    console.log("Pages Result:", JSON.stringify(pages, null, 2));

    if (pages.data && pages.data.length > 0) {
        for (const page of pages.data) {
            console.log(`Checking Page: ${page.name} (${page.id})`);
            if (page.instagram_business_account) {
                console.log(`  Linked IG: ${page.instagram_business_account.id}`);
            } else {
                console.log("  No linked IG account found for this page in this token's view.");
            }
        }
    } else {
        console.log("No pages found. This token might be a Page token itself.");
        const me = await metaGet("/me?fields=id,name,instagram_business_account");
        console.log("Me (as Page?):", JSON.stringify(me, null, 2));
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

testIG();
