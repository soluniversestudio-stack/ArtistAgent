const https = require("https");
const dotenv = require("dotenv");
const path = require("path");
const { URLSearchParams } = require("url");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const fbToken = process.env.FB_ACCESS_TOKEN;
const igUserId = process.env.IG_USER_ID;
const fbPageId = process.env.FB_PAGE_ID;

async function testCarousel() {
    console.log("Fetching Page Token...");
    const pageToken = await getPageAccessToken(fbToken, fbPageId);
    
    console.log("Creating item 1...");
    const item1 = await createItem(pageToken, "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1000");
    console.log("Item 1 ID:", item1);

    console.log("Creating item 2...");
    const item2 = await createItem(pageToken, "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1000");
    console.log("Item 2 ID:", item2);

    console.log("Creating Carousel Container (Immediate)...");
    const carousel = await createCarousel(pageToken, [item1, item2]);
    console.log("Carousel Container ID:", carousel);
}

async function getPageAccessToken(userToken, pageId) {
  const result = await metaGet("/" + pageId + "?fields=access_token&access_token=" + userToken);
  return result.access_token;
}

async function createItem(token, url) {
    const params = new URLSearchParams({
        access_token: token,
        image_url: url,
        is_carousel_item: "true"
    });
    const res = await metaPost("/" + igUserId + "/media", params.toString());
    return res.id;
}

async function createCarousel(token, itemIds) {
    const params = new URLSearchParams({
        access_token: token,
        media_type: "CAROUSEL",
        caption: "Test Carousel",
        children: itemIds.join(",")
    });
    const res = await metaPost("/" + igUserId + "/media", params.toString());
    if (!res.id) throw new Error(JSON.stringify(res));
    return res.id;
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

testCarousel();
