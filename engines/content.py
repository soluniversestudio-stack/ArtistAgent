"""
engines/content.py — Engine 2: Multi-Platform Content Engine
Converts studio logs into platform-ready scripts: YT, Reels, IG, Threads.
Intelligence rules: tone analysis from last 30 posts + visual guardrail scheduling.
"""
import json
from datetime import datetime, timedelta
from pathlib import Path
from config import cfg
from utils.ai_client import ask_ai
from engines.creative import list_artworks
from engines.notion_sync import push_content_task

PLATFORMS = {
    "youtube_long": {
        "name": "YouTube Long-form (15 min)",
        "instructions": "Write a full 15-minute YouTube video script with intro hook (30s), 3 main segments, and CTA outro. Include [B-ROLL] and [ON-CAMERA] cues. Tone: educational yet personal.",
        "max_tokens": 2500,
    },
    "reels_short": {
        "name": "Reels / Shorts (60s)",
        "instructions": "Write a punchy 60-second script for Instagram Reels / YouTube Shorts. Start with a visual hook in the first 3 seconds. Include on-screen text suggestions. End with a soft CTA.",
        "max_tokens": 600,
    },
    "ig_hero": {
        "name": "Instagram Hero Post (Carousel)",
        "instructions": "Write slide-by-slide copy for a 7-slide Instagram carousel. Slide 1: bold hook. Slides 2-6: one insight each. Slide 7: CTA. Each slide max 15 words.",
        "max_tokens": 500,
    },
    "ig_diary": {
        "name": "Instagram Diary Caption",
        "instructions": "Write an intimate, first-person Instagram diary caption (~150 words). Show studio reality, vulnerability, and artistic process. End with a question to invite engagement.",
        "max_tokens": 400,
    },
    "threads": {
        "name": "Threads Thread",
        "instructions": "Write a 5-post Threads thread. Post 1: hook/big idea. Posts 2-4: insights or behind-scenes. Post 5: reflection + question. Each post ≤ 280 chars.",
        "max_tokens": 400,
    },
}

CONTENT_SCHEDULE = {
    1: "carousel",    # Day 1 after artwork completion
    3: "reel",        # Day 3
    6: "reflective",  # Day 6
}


def generate_scripts(artwork_id: str, platforms: list[str] = None) -> dict:
    """Generate platform scripts from a completed artwork's studio log."""
    if platforms is None:
        platforms = list(PLATFORMS.keys())
    artwork = _load_artwork(artwork_id)
    if not artwork:
        return {"error": f"Artwork {artwork_id} not found"}
    studio_log = "\n".join(
        [f"Day {e['day']} ({e['phase']}): {e['entry']}"
         for e in artwork.get("studio_log", [])]
    )
    tone_context = _get_tone_context()
    results = {}
    for platform_key in platforms:
        if platform_key not in PLATFORMS:
            continue
        p = PLATFORMS[platform_key]
        system_prompt = f"""You are a content strategist for a contemporary visual artist named {cfg.ARTIST_NAME}.
        
TONE CONTEXT (maintain consistency with past posts):
{tone_context}

PLATFORM INSTRUCTIONS:
{p['instructions']}

GUARDRAILS:
- Never use generic art clichés ("journey", "passion", "hustle")
- Keep language precise, specific, intellectually engaged
- Reference actual locations, materials, conceptual origins when possible
- Do NOT algorithm-chase; prioritize depth over virality"""

        user_prompt = f"""Create {p['name']} content for this artwork:

Title: {artwork.get('title', 'Untitled')}
Medium: {artwork.get('medium', '')}
Series: {artwork.get('series', '')}
Location made: {artwork.get('location', cfg.ARTIST_CITY)}

Studio Log:
{studio_log}

Artist Statement snippet:
{artwork.get('ai_statement', '')[:300]}"""

        results[platform_key] = {
            "platform": p["name"],
            "content": ask_ai(user_prompt, system=system_prompt, max_tokens=p["max_tokens"]),
            "generated_at": datetime.now().isoformat(),
        }
    # Save scripts
    output_path = cfg.DATA_DIR / "content" / f"{artwork_id}_scripts.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n✅  Scripts saved to {output_path}")
    return results


def generate_content_calendar(artwork_id: str, start_date: datetime = None) -> list[dict]:
    """Generate the visual guardrail posting schedule (Day 1/3/6)."""
    if start_date is None:
        start_date = datetime.now()
    calendar = []
    for day_offset, post_type in CONTENT_SCHEDULE.items():
        post_date = start_date + timedelta(days=day_offset - 1)
        calendar.append({
            "date": post_date.strftime("%Y-%m-%d"),
            "day": day_offset,
            "type": post_type,
            "artwork_id": artwork_id,
            "status": "pending",
        })
    cal_path = cfg.DATA_DIR / "content" / f"{artwork_id}_calendar.json"
    cal_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cal_path, "w") as f:
        json.dump(calendar, f, indent=2)
        
    # Auto-push to Notion
    artwork_title = _load_artwork(artwork_id).get("title", artwork_id)
    for task in calendar:
        push_content_task(artwork_title, task)
        
    return calendar


def _get_tone_context() -> str:
    """Stub: returns tone guidelines. Replace with real post analysis when IG API is connected."""
    return """Tone established from past posts:
- Philosophical and introspective
- References specific places, light conditions, and materials
- Short, precise sentences. No fluff.
- Avoids inspirational clichés. Prefers honest uncertainty over false confidence.
- Bilingual sensibility (English primary, occasional Japanese or Korean references)"""


def _load_artwork(artwork_id: str) -> dict:
    path = cfg.ARTWORKS_DIR / f"{artwork_id}.json"
    if path.exists():
        return json.loads(path.read_text())
    return {}
