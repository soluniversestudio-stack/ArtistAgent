/**
 * post-to-instagram.js  [FIXED v4 — TRUE META SCHEDULING]
 * Sol Studio Automation — Meta API Scheduler Module
 *
 * Uses Instagram Graph API via Meta, API version v25.0.
 * Schedules single images or carousels using the correct 3-param flow:
 *   1. Create container with  published=false + scheduled_publish_time
 *   2. Poll container until FINISHED
 *   3. Publish via media_publish (Meta fires it at scheduled_publish_time)
 *
 * FIXES vs previous version:
 *   - Uses Page Access Token (not User token) — required by Meta
 *   - Correct scheduling params: published=false + scheduled_publish_time
 *     (is_scheduled_publish was an old/undocumented param that no longer works)
 *   - Container status polling before publish call
 *   - Add FB_PAGE_ID=1042016035659143 to your .env
 */

"use strict";

const https = require("https");
const { URLSearchParams } = require("url");

const META_API_VERSION = "v21.0";

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Schedule OR immediately publish a post to Instagram via Meta Graph API.
 *
 * If scheduledIso is ≥10 min in the future, the post is SCHEDULED —
 * Meta holds it and publishes automatically at that time.
 * If scheduledIso is missing or too close, it publishes immediately.
 *
 * @param {Object}   payload
 * @param {string[]} payload.imageUrls      - Public HTTPS JPEG URLs
 * @param {string}   payload.caption        - Post caption
 * @param {boolean}  payload.isReel         - True for Reels
 * @param {string}   [payload.scheduledIso] - ISO 8601 future date (for scheduling)
 * @param {Object}   credentials
 * @param {string}   credentials.igUserId   - IG Business Account ID  (IG_USER_ID in .env)
 * @param {string}   credentials.fbToken    - Long-lived User Access Token (FB_ACCESS_TOKEN in .env)
 * @param {string}   credentials.fbPageId   - Facebook Page ID (FB_PAGE_ID in .env)
 * @returns {Promise<string>} permalink or fallback URL
 */
async function scheduleToMeta(payload, credentials) {
  const { imageUrls, caption, isReel, scheduledIso } = payload;
  const { igUserId, fbToken, fbPageId } = credentials;

  if (!igUserId || !fbToken) {
    throw new Error("Missing Meta credentials: IG_USER_ID or FB_ACCESS_TOKEN");
  }
  if (!fbPageId) {
    throw new Error(
      "Missing FB_PAGE_ID in .env — add your Facebook Page ID.\n" +
      "Your Page ID is: 1042016035659143 (Sol Studio — confirmed in your debug log)"
    );
  }
  if (!imageUrls || imageUrls.length === 0) {
    throw new Error("No image URLs provided for Meta upload");
  }

  // ── Determine schedule time ────────────────────────────────────────────────
  let scheduledUnix = null;
  if (scheduledIso) {
    const t = Math.floor(new Date(scheduledIso).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isNaN(t) && t >= now + 600) {
      scheduledUnix = t; // Valid future time — will schedule
    } else {
      console.error(`  [Meta] ⚠️  Scheduled time too soon or invalid (${scheduledIso}) — will publish immediately`);
    }
  }

  const mode = scheduledUnix ? `SCHEDULED for ${scheduledIso}` : "IMMEDIATE";
  console.error(`  [Meta] Mode: ${mode}`);

  // ── Step 0: Exchange User token → Page Access Token ────────────────────────
  // Meta REQUIRES a Page token (not User token) to post to Instagram via Facebook Login.
  console.error(`  [Meta] Fetching Page Access Token for page ${fbPageId}...`);
  const pageToken = await getPageAccessToken(fbToken, fbPageId);
  console.error(`  [Meta] Page token obtained ✅`);

  // ── Step 1: Create media container(s) ─────────────────────────────────────
  let creationId;

  if (imageUrls.length === 1) {
    creationId = await createSingleContainer({
      igUserId, pageToken, imageUrls, caption, isReel, scheduledUnix
    });
  } else {
    creationId = await createCarouselContainer({
      igUserId, pageToken, imageUrls, caption, scheduledUnix
    });
  }

  console.error(`  [Meta] Container created: ${creationId}`);

  // ── Step 2: Poll until container status = FINISHED ─────────────────────────
  // Must do this before calling media_publish or it fails with "container not ready"
  console.error(`  [Meta] Waiting for container to be ready...`);
  await waitForContainerReady(creationId, pageToken);

  // ── Step 3: Publish ────────────────────────────────────────────────────────
  // For scheduled posts: Meta receives the call now but holds the post until
  // scheduled_publish_time. For immediate posts: goes live right away.
  console.error(`  [Meta] Calling media_publish...`);
  const publishParams = new URLSearchParams({
    access_token: pageToken,
    creation_id:  creationId,
  });

  const publish = await metaPost(`/${igUserId}/media_publish`, publishParams.toString());
  if (!publish.id) {
    console.error(`❌ Publish failed:`, JSON.stringify(publish, null, 2));
    throw new Error(`Meta media_publish failed: ${JSON.stringify(publish)}`);
  }

  console.error(`  [Meta] ✅ ${scheduledUnix ? "Scheduled" : "Published"}! Media ID: ${publish.id}`);

  // ── Step 4: Get permalink ──────────────────────────────────────────────────
  // Note: scheduled posts often return no permalink until the post actually goes live.
  let permalink = null;
  try {
    const info = await metaGet(
      `/${publish.id}?fields=permalink&access_token=${encodeURIComponent(pageToken)}`
    );
    permalink = info.permalink || null;
  } catch (_) { /* expected for scheduled posts */ }

  return permalink || `https://www.instagram.com/p/${publish.id}`;
}

// ─── Container creation helpers ───────────────────────────────────────────────

async function createSingleContainer({ igUserId, pageToken, imageUrls, caption, isReel, scheduledUnix }) {
  const params = new URLSearchParams({
    access_token: pageToken,
    caption:      caption,
  });

  if (isReel) {
    params.append("media_type", "REELS");
    params.append("video_url",  imageUrls[0]);
  } else {
    params.append("image_url", imageUrls[0]);
  }

  // ✅ CORRECT scheduling params (NOT is_scheduled_publish which is deprecated/broken)
  if (scheduledUnix) {
    params.append("published",              "false");
    params.append("scheduled_publish_time", scheduledUnix.toString());
  }

  console.error(`  [Meta] Creating single${isReel ? " reel" : " image"} container...`);
  const result = await metaPost(`/${igUserId}/media`, params.toString());
  if (!result.id) throw new Error(`Single container creation failed: ${JSON.stringify(result)}`);
  return result.id;
}

async function createCarouselContainer({ igUserId, pageToken, imageUrls, caption, scheduledUnix }) {
  // Create individual item containers first (no scheduling params on items)
  const itemIds = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const itemParams = new URLSearchParams({
      access_token:     pageToken,
      image_url:        imageUrls[i],
      is_carousel_item: "true",
    });
    console.error(`  [Meta] Carousel item [${i + 1}/${imageUrls.length}]: ${imageUrls[i]}`);
    const item = await metaPost(`/${igUserId}/media`, itemParams.toString());
    if (!item.id) {
      console.error(`❌ Carousel item ${i + 1} failed:`, JSON.stringify(item, null, 2));
      throw new Error(`Carousel item ${i + 1} failed: ${JSON.stringify(item)}`);
    }
    itemIds.push(item.id);
    if (i < imageUrls.length - 1) await sleep(1000); // rate limit buffer
  }

  // Create the carousel container with scheduling params
  const carouselParams = new URLSearchParams({
    access_token: pageToken,
    media_type:   "CAROUSEL",
    caption:      caption,
    children:     itemIds.join(","),
  });

  if (scheduledUnix) {
    carouselParams.append("published",              "false");
    carouselParams.append("scheduled_publish_time", scheduledUnix.toString());
  }

  console.error(`  [Meta] Creating carousel container (${itemIds.length} items)...`);
  const result = await metaPost(`/${igUserId}/media`, carouselParams.toString());
  if (!result.id) {
    console.error(`❌ Carousel container failed:`, JSON.stringify(result, null, 2));
    throw new Error(`Carousel container creation failed: ${JSON.stringify(result)}`);
  }
  return result.id;
}

// ─── Page token exchange ──────────────────────────────────────────────────────

async function getPageAccessToken(userToken, pageId) {
  const result = await metaGet(
    `/${pageId}?fields=access_token&access_token=${encodeURIComponent(userToken)}`
  );
  if (!result.access_token) {
    throw new Error(
      `Could not get Page Access Token for page ${pageId}.\n` +
      `Response: ${JSON.stringify(result)}\n` +
      `Ensure your token has pages_show_list + pages_read_engagement permissions.`
    );
  }
  return result.access_token;
}

// ─── Container status polling ─────────────────────────────────────────────────

async function waitForContainerReady(containerId, pageToken, maxAttempts = 10) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const status = await metaGet(
        `/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(pageToken)}`
      );
      const code = status.status_code;
      console.error(`  [Meta] Container status: ${code} (attempt ${attempt}/${maxAttempts})`);

      if (code === "FINISHED")  return;
      if (code === "PUBLISHED") return;
      if (code === "ERROR")     throw new Error(`Container errored: ${status.status || "unknown"}`);
      if (code === "EXPIRED")   throw new Error(`Container expired before publishing`);
      // IN_PROGRESS — keep polling
    } catch (err) {
      if (err.message.startsWith("Container")) throw err; // Re-throw our own errors
      console.error(`  [Meta] Status poll attempt ${attempt} failed: ${err.message}`);
    }
    await sleep(3000);
  }
  console.error(`  [Meta] ⚠️ Container not confirmed FINISHED after ${maxAttempts} attempts — proceeding anyway`);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function metaPost(endpoint, formBody) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(formBody);
    const req  = https.request({
      hostname: "graph.facebook.com",
      path:     `/${META_API_VERSION}${endpoint}`,
      method:   "POST",
      headers: {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": data.length,
      },
      timeout: 30000,
    }, (res) => {
      let raw = "";
      res.on("data",  d => raw += d);
      res.on("end",   () => {
        try   { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`Non-JSON response on POST ${endpoint}: ${raw.slice(0, 300)}`)); }
      });
    });
    req.on("error",   reject);
    req.on("timeout", () => { req.destroy(); reject(new Error(`POST timeout: ${endpoint}`)); });
    req.write(data);
    req.end();
  });
}

function metaGet(endpoint) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "graph.facebook.com",
      path:     `/${META_API_VERSION}${endpoint}`,
      method:   "GET",
      timeout:  30000,
    }, (res) => {
      let raw = "";
      res.on("data",  d => raw += d);
      res.on("end",   () => {
        try   { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`Non-JSON response on GET ${endpoint}: ${raw.slice(0, 300)}`)); }
      });
    });
    req.on("error",   reject);
    req.on("timeout", () => { req.destroy(); reject(new Error(`GET timeout: ${endpoint}`)); });
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { scheduleToMeta };
