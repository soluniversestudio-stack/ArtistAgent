"""
engines/sync.py — Automated Sync Engine
Pushes newly discovered Events and Residency/Grant opportunities into:
  1. The artist's Notion Tracker databases
  2. The studio's Google Calendar (sol.universe.studio@gmail.com)

Usage (called automatically after scan_events / scan_opportunities):
    from engines.sync import push_events_to_notion, push_opportunities_to_notion
    from engines.sync import push_opportunity_deadlines_to_calendar
"""
import os
import json
import re
from datetime import datetime
from pathlib import Path
from config import cfg
from engines.notion_sync import push_opportunity

# ── Notion IDs ────────────────────────────────────────────────────────────────
# Parsed from the Notion share URLs provided by the user.
# URL format: https://www.notion.so/<page-id>?v=<view-id>
NOTION_RESIDENCY_DB_ID = "5b22b57f3c60413690db39941fca38a5"
NOTION_EVENTS_DB_ID    = "667cea93bd0f4f929f2c946034dd0b1e"


def _get_calendar_service():
    """Return an authorized Calendar service for the studio account."""
    try:
        from utils.google_client import get_calendar_service
        return get_calendar_service("studio")
    except Exception as e:
        print(f"⚠️  Calendar not connected yet ({e}). Run: py scripts/setup_google.py")
        return None


def _parse_date(date_str: str | None) -> str | None:
    """Try several date format patterns and return ISO 8601 date string or None."""
    if not date_str:
        return None
    # Strip extra noise
    clean = re.sub(r"\(.*?\)", "", str(date_str)).strip()
    formats = ["%Y-%m-%d", "%d/%m/%Y", "%B %d, %Y", "%d %B %Y", "%b %d, %Y", "%Y/%m/%d"]
    for fmt in formats:
        try:
            return datetime.strptime(clean[:20], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


# ── Notion Writers ────────────────────────────────────────────────────────────

def push_events_to_notion(events_text: str, city: str = None) -> list[str]:
    """
    Parse raw AI text output from scan_events and create Notion pages.
    Returns list of created page IDs.
    """
    city = city or cfg.ARTIST_CITY
    print("\n📤  Pushing events to Notion Events Tracker...")
    try:
        notion = _get_notion_client()
        props_schema = _notion_get_db_properties(notion, NOTION_EVENTS_DB_ID)
    except Exception as e:
        print(f"⚠️  Notion unavailable: {e}")
        return []

    # Split the AI text into individual event blocks
    blocks = re.split(r"\n(?=\d+\.\s+Event:|\d+\.)", events_text.strip())
    created = []

    for block in blocks:
        if not block.strip():
            continue

        # Extract fields using flexible regex
        name_m    = re.search(r"Event:\s*(.+?)(?:\n|$)", block, re.I)
        date_m    = re.search(r"Date[/\-\w]*:\s*(.+?)(?:\n|$)", block, re.I)
        venue_m   = re.search(r"Venue:\s*(.+?)(?:\n|$)", block, re.I)
        why_m     = re.search(r"Why it matters?:\s*(.+?)(?:\n|$)", block, re.I)
        action_m  = re.search(r"Action\s*[Rr]ecommended:\s*(.+?)(?:\n|$)", block, re.I)

        title = name_m.group(1).strip() if name_m else block[:60].strip()
        date_iso = _parse_date(date_m.group(1) if date_m else None)
        venue = venue_m.group(1).strip() if venue_m else city
        notes = (why_m.group(1).strip() if why_m else "") + " | " + (action_m.group(1).strip() if action_m else "")

        # Build Notion page properties (adapt to what exists in the DB schema)
        page_props: dict = {}

        # Title (Name) — always required
        title_prop = next((k for k, v in props_schema.items() if v["type"] == "title"), "Name")
        page_props[title_prop] = {"title": [{"text": {"content": title}}]}

        # Date
        if date_iso and "Date" in props_schema:
            page_props["Date"] = {"date": {"start": date_iso}}

        # Location / Venue
        for loc_key in ["Location", "Venue", "City", "Place"]:
            if loc_key in props_schema and props_schema[loc_key]["type"] == "rich_text":
                page_props[loc_key] = {"rich_text": [{"text": {"content": venue[:100]}}]}
                break

        # Notes / Description
        for note_key in ["Notes", "Description", "Why"]:
            if note_key in props_schema and props_schema[note_key]["type"] == "rich_text":
                page_props[note_key] = {"rich_text": [{"text": {"content": notes[:500]}}]}
                break

        # Status
        if "Status" in props_schema and props_schema["Status"]["type"] == "select":
            page_props["Status"] = {"select": {"name": "Upcoming"}}

        try:
            page = notion.pages.create(
                parent={"database_id": NOTION_EVENTS_DB_ID},
                properties=page_props,
            )
            created.append(page["id"])
            print(f"   ✅  Created event: {title}")
        except Exception as e:
            print(f"   ⚠️  Failed to create event '{title}': {e}")

    print(f"\n📤  {len(created)} event(s) pushed to Notion.")
    return created


def push_opportunities_to_notion(opps_text: str) -> list[str]:
    """
    Parse raw AI text output from scan_opportunities and create Notion pages.
    Returns list of created page IDs (via notion_sync).
    """
    print("\n📤  Pushing residencies/grants to Notion Residency Tracker...")
    
    blocks = re.split(r"\n(?=\d+\.\s+(?:Name|Opportunity|Residency|Grant):|\d+\.)", opps_text.strip())
    created = []

    for block in blocks:
        if not block.strip():
            continue

        name_m      = re.search(r"(?:Name|Opportunity|Residency|Grant):\s*(.+?)(?:\n|$)", block, re.I)
        location_m  = re.search(r"Location:\s*(.+?)(?:\n|$)", block, re.I)
        deadline_m  = re.search(r"Deadline:\s*(.+?)(?:\n|$)", block, re.I)
        score_m     = re.search(r"Score[:\s]+(\d+)", block, re.I)
        why_m       = re.search(r"Why apply:\s*(.+?)(?:\n|$)", block, re.I)
        link_m      = re.search(r"Link:\s*(https?://\S+)", block, re.I)

        title = name_m.group(1).strip() if name_m else block[:60].strip()
        location = location_m.group(1).strip() if location_m else ""
        deadline_raw = deadline_m.group(1).strip() if deadline_m else None
        deadline_iso = _parse_date(deadline_raw)
        score = score_m.group(1) if score_m else ""
        why = why_m.group(1).strip() if why_m else ""
        link = link_m.group(1).strip() if link_m else ""

        opp_dict = {
            "name": title,
            "location": location,
            "deadline_iso": deadline_iso,
            "score": score,
            "why": why,
            "link": link
        }

        try:
            page_id = push_opportunity(opp_dict)
            if page_id: created.append(page_id)

            # Push deadline to Google Calendar
            if deadline_iso and link_m:
                push_deadline_to_calendar(title, location, deadline_iso, link)

        except Exception as e:
            print(f"   ⚠️  Failed to create residency '{title}': {e}")

    print(f"\n📤  {len(created)} residency/grant(s) pushed to Notion.")
    return created


# ── Google Calendar Writer ────────────────────────────────────────────────────

def push_deadline_to_calendar(title: str, location: str, deadline_iso: str, url: str = "") -> bool:
    """
    Create a Google Calendar all-day event on the deadline date for the studio account.
    """
    service = _get_calendar_service()
    if not service:
        return False

    event = {
        "summary": f"📋 DEADLINE: {title}",
        "location": location,
        "description": f"Application deadline\n\nMore info: {url}",
        "start": {"date": deadline_iso},
        "end":   {"date": deadline_iso},
        "colorId": "11",  # Red
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "email",  "minutes": 7 * 24 * 60},  # 1 week before
                {"method": "popup",  "minutes": 3 * 24 * 60},  # 3 days before
            ],
        },
    }

    try:
        result = service.events().insert(calendarId="primary", body=event).execute()
        print(f"   📅  Calendar event created: {title} on {deadline_iso}")
        return True
    except Exception as e:
        print(f"   ⚠️  Calendar push failed for '{title}': {e}")
        return False


# ── Weekly Auto-Sync (called by main.py auto-scan) ────────────────────────────

def full_weekly_sync(city: str = None) -> dict:
    """
    Run a complete weekly sync:
    1. Scan for upcoming local events → push to Notion Events + no calendar
    2. Scan for APAC residencies/grants → push to Notion Residency + Calendar deadlines
    """
    from engines.admin import scan_events, scan_opportunities

    print("\n" + "═" * 60)
    print("  🔄  WEEKLY AUTO-SYNC — Artist Agent")
    print("═" * 60)

    # 1. Events
    events_data = scan_events(city)
    events_text = events_data.get("events", "")
    events_created = push_events_to_notion(events_text, city or cfg.ARTIST_CITY)

    # 2. Opportunities
    opps_data = scan_opportunities()
    opps_text = opps_data.get("opportunities", "")
    opps_created = push_opportunities_to_notion(opps_text)

    summary = {
        "synced_at": datetime.now().isoformat(),
        "events_pushed_to_notion": len(events_created),
        "residencies_pushed_to_notion": len(opps_created),
    }

    print("\n" + "═" * 60)
    print(f"  ✅  Sync complete: {len(events_created)} events + {len(opps_created)} residencies pushed")
    print("═" * 60 + "\n")

    return summary
