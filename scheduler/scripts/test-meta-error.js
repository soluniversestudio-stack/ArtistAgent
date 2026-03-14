const https = require("https");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const { URLSearchParams } = require("url");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const fbToken = process.env.FB_ACCESS_TOKEN;
const igUserId = process.env.IG_USER_ID;
const testUrl = "https://i.ibb.co/5hR37g3L/01-opt.jpg";

async function test() {
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
            fs.writeFileSync(path.resolve(__dirname, "meta-response-v21.json"), raw);
            console.log("Done. Saved to meta-response-v21.json");
        });
    });
    req.write(data);
    req.end();
}

test();
