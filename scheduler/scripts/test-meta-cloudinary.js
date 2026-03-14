const https = require("https");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const { URLSearchParams } = require("url");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const fbToken = process.env.FB_ACCESS_TOKEN;
const igUserId = process.env.IG_USER_ID;

// Use one of the cloudinary URLs from the last run
const testUrl = "https://res.cloudinary.com/dltoidsmd/image/upload/v1773463155/sol_studio_autopost/unomv4v8lmsu6as6t45n.jpg";

async function test() {
    console.log("Testing Cloudinary URL container creation...");
    const params = new URLSearchParams({
        access_token: fbToken,
        image_url: testUrl,
        is_carousel_item: "true"
    });

    const data = Buffer.from(params.toString());
    const req = https.request({
        hostname: "graph.facebook.com",
        path: "/v21.0/" + igUserId + "/media",
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": data.length
        }
    }, res => {
        let raw = "";
        res.on("data", d => raw += d);
        res.on("end", () => {
            console.log("RAW_STATUS:", res.statusCode);
            fs.writeFileSync(path.resolve(__dirname, "meta-response-cloudinary.json"), raw);
            console.log("Done. Saved to meta-response-cloudinary.json");
        });
    });
    req.on("error", (e) => console.error("REQ_ERROR:", e));
    req.write(data);
    req.end();
}

test();
