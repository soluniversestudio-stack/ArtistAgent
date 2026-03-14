const https = require("https");
const dotenv = require("dotenv");
const path = require("path");
const { URLSearchParams } = require("url");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const fbToken = process.env.FB_ACCESS_TOKEN;
const igUserId = process.env.IG_USER_ID;

// Public working URL from Unsplash
const testUrl = "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1000";

async function test() {
    console.log("RE-VERIFYING Meta API with Unsplash URL...");
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
            console.log("RESPONSE:", raw);
        });
    });
    req.on("error", (e) => console.error("REQ_ERROR:", e));
    req.write(data);
    req.end();
}

test();
