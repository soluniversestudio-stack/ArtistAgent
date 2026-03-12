"""
engines/notion_sync.py — Core Notion Sync Engine
Handles bidirectional sync between local JSON databases and Notion.
"""
from datetime import datetime
from config import cfg
from utils.notion_client import (
    get_notion, find_page_by_title,
    title_prop, text_prop, number_prop, select_prop, multi_select_prop,
    date_prop, url_prop, relation_prop, checkbox_prop
)

# ── 1. Artworks Sync ─────────────────────────────────────────────────────────

def push_artwork(artwork_data: dict) -> str:
    """Create or update an Artwork page in Notion."""
    db_id = cfg.NOTION_ARTWORKS_DB_ID
    if not db_id: return ""
    notion = get_notion()
    
    title = artwork_data.get("title", "Untitled")
    props = {
        "Title": title_prop(title),
        "Medium": select_prop(artwork_data.get("medium", "")),
        "Year": select_prop(str(artwork_data.get("year", ""))),
        "Dimensions": text_prop(artwork_data.get("dimensions", "")),
        "Price (USD)": number_prop(artwork_data.get("price_usd", None)),
        "Location": select_prop(artwork_data.get("location", "")),
        "Series": select_prop(artwork_data.get("series", "")),
        "Artist Statement": text_prop(artwork_data.get("ai_statement", "")),
    }

    page_id = find_page_by_title(notion, db_id, title)
    try:
        if page_id:
            notion.pages.update(page_id=page_id, properties=props)
            print(f"   ✅  Updated Artwork in Notion: {title}")
        else:
            page = notion.pages.create(parent={"database_id": db_id}, properties=props)
            page_id = page["id"]
            print(f"   ✅  Created Artwork in Notion: {title}")
        return page_id
    except Exception as e:
        print(f"   ⚠️  Failed to push Artwork '{title}': {e}")
        return ""

def get_artwork_notion_id(title: str) -> str:
    """Helper to find an artwork's Notion ID for relation linking."""
    if not cfg.NOTION_ARTWORKS_DB_ID: return ""
    return find_page_by_title(get_notion(), cfg.NOTION_ARTWORKS_DB_ID, title)


# ── 2. Studio Logs Sync ──────────────────────────────────────────────────────

def push_studio_log(artwork_title: str, log_entry: dict) -> str:
    """Create a Studio Log entry linked to an Artwork."""
    db_id = cfg.NOTION_STUDIO_LOGS_DB_ID
    if not db_id: return ""
    notion = get_notion()
    
    date_str = log_entry.get("date", datetime.now().isoformat())[:10]
    phase = log_entry.get("phase", f"Day {log_entry.get('day', 1)}")
    title = f"{artwork_title} — {phase} ({date_str})"
    
    artwork_page_id = get_artwork_notion_id(artwork_title)
    
    props = {
        "Name": title_prop(title),
        "Date": date_prop(date_str),
        "Phase": select_prop(phase),
        "Entry": text_prop(log_entry.get("entry", "")),
        "AI Reflection": text_prop(log_entry.get("ai_reflection", "")),
        "Artwork": relation_prop([artwork_page_id] if artwork_page_id else []),
    }

    page_id = find_page_by_title(notion, db_id, title)
    try:
        if page_id:
            notion.pages.update(page_id=page_id, properties=props)
            print(f"   ✅  Updated Studio Log in Notion: {title}")
        else:
            page = notion.pages.create(parent={"database_id": db_id}, properties=props)
            page_id = page["id"]
            print(f"   ✅  Created Studio Log in Notion: {title}")
        return page_id
    except Exception as e:
        print(f"   ⚠️  Failed to push Studio Log '{title}': {e}")
        return ""


# ── 3. Content Calendar Sync ─────────────────────────────────────────────────

def push_content_task(artwork_title: str, task: dict) -> str:
    """Create a Content Calendar task linked to an Artwork."""
    db_id = cfg.NOTION_CONTENT_CALENDAR_DB_ID
    if not db_id: return ""
    notion = get_notion()
    
    post_type = task.get("type", "post").upper()
    title = f"[{post_type}] {artwork_title}"
    date_str = task.get("date", datetime.now().isoformat())[:10]
    
    artwork_page_id = get_artwork_notion_id(artwork_title)
    
    props = {
        "Name": title_prop(title),
        "Publish Date": date_prop(date_str),
        "Platform / Type": select_prop(post_type),
        "Status": select_prop("Draft"),  # Default status
        "Artwork": relation_prop([artwork_page_id] if artwork_page_id else []),
    }

    page_id = find_page_by_title(notion, db_id, title)
    try:
        if page_id:
            notion.pages.update(page_id=page_id, properties=props)
            print(f"   ✅  Updated Content Task in Notion: {title}")
        else:
            page = notion.pages.create(parent={"database_id": db_id}, properties=props)
            page_id = page["id"]
            print(f"   ✅  Created Content Task in Notion: {title}")
        return page_id
    except Exception as e:
        print(f"   ⚠️  Failed to push Content Task '{title}': {e}")
        return ""


# ── 4. CRM / Contacts Sync ───────────────────────────────────────────────────

def push_contact(contact: dict) -> str:
    """Create or update a CRM Contact in Notion."""
    db_id = cfg.NOTION_CONTACTS_DB_ID
    if not db_id: return ""
    notion = get_notion()
    
    name = contact.get("name", "Unknown")
    props = {
        "Name": title_prop(name),
        "Role": select_prop(contact.get("role", "")),
        "Institution": select_prop(contact.get("institution", "")),
        "Email": text_prop(contact.get("email", "")),
        "Notes": text_prop(contact.get("notes", "")),
        "Next Follow-up": date_prop(contact.get("next_followup", "")),
        "Status": select_prop("Active" if contact.get("status") == "active" else "Archived"),
    }

    page_id = find_page_by_title(notion, db_id, name)
    try:
        if page_id:
            notion.pages.update(page_id=page_id, properties=props)
            print(f"   ✅  Updated Contact in Notion: {name}")
        else:
            page = notion.pages.create(parent={"database_id": db_id}, properties=props)
            page_id = page["id"]
            print(f"   ✅  Created Contact in Notion: {name}")
        return page_id
    except Exception as e:
        print(f"   ⚠️  Failed to push Contact '{name}': {e}")
        return ""


# ── 5. Opportunities Sync ────────────────────────────────────────────────────

def push_opportunity(opp: dict) -> str:
    """Create an Opportunity in Notion."""
    db_id = cfg.NOTION_OPPORTUNITIES_DB_ID
    if not db_id: return ""
    notion = get_notion()
    
    title = opp.get("name", "Unknown Opportunity")
    props = {
        "Name": title_prop(title),
        "Location": select_prop(opp.get("location", "")),
        "Deadline": date_prop(opp.get("deadline_iso")) if opp.get("deadline_iso") else {},
        "Score": number_prop(opp.get("score")),
        "Why Apply": text_prop(opp.get("why", "")),
        "URL": url_prop(opp.get("link", "")),
        "Status": select_prop("Evaluating"),
    }
    # Clean up empty date prop if None
    if not props["Deadline"]: del props["Deadline"]

    page_id = find_page_by_title(notion, db_id, title)
    try:
        if page_id:
            notion.pages.update(page_id=page_id, properties=props)
            print(f"   ✅  Updated Opportunity in Notion: {title}")
        else:
            page = notion.pages.create(parent={"database_id": db_id}, properties=props)
            page_id = page["id"]
            print(f"   ✅  Created Opportunity in Notion: {title}")
        return page_id
    except Exception as e:
        print(f"   ⚠️  Failed to push Opportunity '{title}': {e}")
        return ""
