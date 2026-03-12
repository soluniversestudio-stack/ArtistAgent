"""
utils/notion_client.py — Centralized Notion API Client
Wraps notion-client with deduplication, schema-aware property builders,
and per-database helpers for all 6 Sol Studio databases.
"""
from __future__ import annotations
import os
from typing import Optional
from config import cfg


def get_notion():
    """Return an authenticated Notion API client."""
    try:
        from notion_client import Client
    except ImportError:
        raise ImportError(
            "Run: pip install notion-client\n"
            "Or: pip install -r requirements.txt"
        )
    token = cfg.NOTION_TOKEN
    if not token:
        raise RuntimeError(
            "NOTION_TOKEN not set in .env\n"
            "Get it at: https://www.notion.so/my-integrations"
        )
    return Client(auth=token)


# ── DB Status Check ───────────────────────────────────────────────────────────

DB_LABELS = {
    "NOTION_ARTWORKS_DB_ID":         "Artworks",
    "NOTION_STUDIO_LOGS_DB_ID":      "Studio Logs (Thoughts)",
    "NOTION_CONTENT_CALENDAR_DB_ID": "Content Calendar",
    "NOTION_RESIDENCY_DB_ID":        "Residency",
    "NOTION_OPENCALLS_DB_ID":        "Open Calls / Exhibitions",
    "NOTION_EVENTS_DB_ID":           "Events",
    "NOTION_CONTACTS_DB_ID":         "Contacts / CRM",
    "NOTION_OPERATIONS_DB_ID":       "Business Operations",
    "NOTION_PROJECTS_DB_ID":         "Projects 2026–2030",
}

def check_all_databases() -> list[dict]:
    """
    Verify each configured DB is accessible.
    Returns list of {label, db_id, status, error} dicts.
    """
    results = []
    try:
        notion = get_notion()
    except Exception as e:
        return [{"label": k, "db_id": "", "status": "error", "error": str(e)} for k in DB_LABELS]

    for env_key, label in DB_LABELS.items():
        # In config.py, the properties are exactly the same as the env keys (e.g. cfg.NOTION_ARTWORKS_DB_ID)
        db_id = getattr(cfg, env_key, None) or ""
        if not db_id:
            results.append({"label": label, "db_id": "", "status": "missing", "error": "DB ID not set in .env"})
            continue
        try:
            notion.databases.retrieve(database_id=db_id)
            results.append({"label": label, "db_id": db_id, "status": "ok", "error": None})
        except Exception as e:
            msg = str(e)
            if "object_not_found" in msg or "404" in msg:
                msg = "Not shared with integration. Open DB in Notion → Share → invite your integration."
            results.append({"label": label, "db_id": db_id, "status": "error", "error": msg})
    return results


# ── Deduplication ─────────────────────────────────────────────────────────────

def find_page_by_title(notion, db_id: str, title: str) -> Optional[str]:
    """
    Search a Notion database for a page with the given title.
    Returns the page ID if found, or None.
    """
    try:
        response = notion.databases.query(
            database_id=db_id,
            filter={
                "property": _get_title_prop(notion, db_id),
                "title": {"equals": title},
            },
        )
        results = response.get("results", [])
        return results[0]["id"] if results else None
    except Exception:
        return None


def _get_title_prop(notion, db_id: str) -> str:
    """Return the name of the title-type property for a DB."""
    try:
        db = notion.databases.retrieve(database_id=db_id)
        for name, prop in db.get("properties", {}).items():
            if prop["type"] == "title":
                return name
    except Exception:
        pass
    return "Name"


# ── Generic Property Builders ─────────────────────────────────────────────────

def title_prop(text: str) -> dict:
    return {"title": [{"text": {"content": str(text)[:2000]}}]}

def text_prop(text: str) -> dict:
    return {"rich_text": [{"text": {"content": str(text)[:2000]}}]}

def number_prop(value) -> dict:
    try:
        return {"number": float(value)}
    except (TypeError, ValueError):
        return {"number": None}

def select_prop(name: str) -> dict:
    return {"select": {"name": str(name)[:100]}}

def multi_select_prop(names: list[str]) -> dict:
    return {"multi_select": [{"name": str(n)[:100]} for n in names]}

def date_prop(iso_date: str) -> dict:
    return {"date": {"start": iso_date}}

def url_prop(url: str) -> dict:
    return {"url": str(url)[:2000]}

def relation_prop(page_ids: list[str]) -> dict:
    return {"relation": [{"id": pid} for pid in page_ids if pid]}

def checkbox_prop(value: bool) -> dict:
    return {"checkbox": bool(value)}
