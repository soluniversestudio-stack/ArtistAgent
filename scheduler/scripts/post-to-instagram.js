/**
 * post-to-instagram.js
 * Sol Studio Automation — Meta API Scheduler Module
 *
 * Called by agent-content-assembler.js to push public image URLs
 * to the Instagram Graph API as a Scheduled Post.
 */

"use strict";

const https = require("https");
const { URLSearchParams } = require("url");

// ─── Config ───────────────────────────────────────────────────────────────────
// These will be passed in or read from process.env by the caller.

/**
 * Schedule a post to Meta (Instagram/Reel).
 * @param {Object} payload 
 * @param {string[]} payload.imageUrls  - Array of public URLs
 * @param {string} payload.caption      - The caption text
 * @param {boolean} payload.isReel      - True if it's a Reel
 * @param {string} payload.scheduledIso - ISO 8601 Date string (e.g. "2026-03-21T01:00:00.000-10:00")
 * @param {Object} credentials
 * @param {string} credentials.igUserId
 * @param {string} credentials.fbToken
 * @returns {Promise<string>} The Meta permalink (if available) or the published ID
 */
async function scheduleToMeta(payload, credentials) {
    const { imageUrls, caption, isReel, scheduledIso } = payload;
    const { igUserId, fbToken } = credentials;

    if (!igUserId || !fbToken) {
        throw new Error("Missing Meta credentials (IG_USER_ID or FB_ACCESS_TOKEN)");
    }
    if (!imageUrls || imageUrls.length === 0) {
        throw new Error("No image URLs provided for Meta upload");
    }

    const scheduledTimeUnix = Math.floor(new Date(scheduledIso).getTime() / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);
    
    // Facebook requires scheduled posts to be between 10 mins and 75 days in the future
    if (scheduledTimeUnix < nowUnix + 600) {
        throw new Error(`Scheduled time (${scheduledIso}) is too soon. Must be at least 10 minutes in the future.`);
    }

    let creationId = null;

    // ─── Step 1: Create Container(s) ──────────────────────────────────────────
    if (imageUrls.length === 1) {
        // Single Image or Reel
        const params = new URLSearchParams({
            access_token: fbToken,
            caption: caption,
            is_scheduled_publish: "true",
            scheduled_publish_time: scheduledTimeUnix.toString()
        });

        if (isReel) {
            params.append("media_type", "REELS");
            params.append("video_url", imageUrls[0]); 
            // Note: ImgBB is images only, but keeping structure generic
        } else {
            params.append("image_url", imageUrls[0]);
        }

        const container = await metaPost(`/${igUserId}/media`, params.toString());
        if (!container.id) throw new Error(`Meta container failed: ${JSON.stringify(container)}`);
        creationId = container.id;

    } else {
        // Carousel
        // Create individual item containers
        const itemIds = [];
        for (let i = 0; i < imageUrls.length; i++) {
            const itemParams = new URLSearchParams({
                access_token: fbToken,
                image_url: imageUrls[i],
                is_carousel_item: "true"
            });
            const item = await metaPost(`/${igUserId}/media`, itemParams.toString());
            if (!item.id) throw new Error(`Carousel item ${i} failed: ${JSON.stringify(item)}`);
            itemIds.push(item.id);
        }

        // Create carousel container
        const carouselParams = new URLSearchParams({
            access_token: fbToken,
            caption: caption,
            media_type: "CAROUSEL",
            children: itemIds.join(","),
            is_scheduled_publish: "true",
            scheduled_publish_time: scheduledTimeUnix.toString()
        });

        const container = await metaPost(`/${igUserId}/media`, carouselParams.toString());
        if (!container.id) throw new Error(`Carousel container failed: ${JSON.stringify(container)}`);
        creationId = container.id;
    }

    // ─── Step 2: Publish (Schedule) Container ─────────────────────────────────
    const publishParams = new URLSearchParams({
        access_token: fbToken,
        creation_id: creationId
    });

    const publish = await metaPost(`/${igUserId}/media_publish`, publishParams.toString());
    if (!publish.id) throw new Error(`Publish step failed: ${JSON.stringify(publish)}`);

    // ─── Step 3: Attempt to get Permalink ─────────────────────────────────────
    let permalink = null;
    try {
        const mediaInfo = await metaGet(`/${publish.id}?fields=permalink&access_token=${fbToken}`);
        permalink = mediaInfo.permalink || null;
    } catch (e) {
        // Not all scheduled posts return a permalink immediately
    }

    // Even if permalink fails, we return the Meta ID as a fallback URL
    return permalink || `https://instagram.com/p/${publish.id}`;
}

// ─── Meta API Helpers ─────────────────────────────────────────────────────────

function metaPost(endpoint, formBody) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(formBody);
        const req = https.request({
            hostname: "graph.facebook.com",
            path: `/v25.0${endpoint}`,
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": data.length
            }
        }, (res) => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

function metaGet(endpoint) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: "graph.facebook.com",
            path: `/v25.0${endpoint}`,
            method: "GET"
        }, (res) => {
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

module.exports = {
    scheduleToMeta
};
