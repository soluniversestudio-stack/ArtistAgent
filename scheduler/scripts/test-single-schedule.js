const https = require("https");
const dotenv = require("dotenv");
const path = require("path");
const { URLSearchParams } = require("url");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const fbToken = process.env.FB_ACCESS_TOKEN;
const igUserId = process.env.IG_USER_ID;
const fbPageId = process.env.FB_PAGE_ID;

async function testSingleSchedule() {
    console.log("Fetching Page Token...");
    const pageToken = await getPageAccessToken(fbToken, fbPageId);
    
    // 2 days in the future
    const scheduledUnix = Math.floor(Date.now() / 1000) + (48 * 3600);

    console.log("Creating Scheduled Container (Single Image)...");
    const params = new URLSearchParams({
        access_token: pageToken,
        image_url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1000",
        caption: "Test Schedule Single",
        published: "false",
        scheduled_publish_time: scheduledUnix.toString()
    });
    
    const res = await metaPost("/" + igUserId + "/media", params.toString());
    console.log("Result:", JSON.stringify(res, null, 2));
}

async function getPageAccessToken(userToken, pageId) {
  const result = await metaGet("/" + pageId + "?fields=access_token&access_token=" + userToken);
  return result.access_token;
}

function metaPost(endpoint, body) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(body);
        const req = https.request({
            hostname: "graph.facebook.com",
            path: "/v21.0" + endpoint,
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": data.length
            }
        }, res => {
            let b = '';
            res.on('data', d => b += d);
            res.on('end', () => resolve(JSON.parse(b)));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function metaGet(endpoint) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: "graph.facebook.com",
            path: "/v21.0" + endpoint,
            method: "GET"
        }, res => {
            let b = '';
            res.on('data', d => b += d);
            res.on('end', () => resolve(JSON.parse(b)));
        });
        req.on('error', reject);
        req.end();
    });
}

testSingleSchedule();
