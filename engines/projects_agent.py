"""
engines/projects_agent.py — Studio Memory & Funnel Structuring Agent

Manages the "Projects 2026–2030" Notion database as the single source of truth
for all medium- to long-horizon projects across two roles:
  • Sophia — architecture, finance, contracts, property, immigration, asset positioning
  • Sol    — fine art practice, exhibitions, residencies, content, institutional positioning

Responsibilities:
  1. Normalize new/existing projects (Type, Status, Phase, Strategic Axis, Priority, etc.)
  2. Maintain persistent memory via Context Notes
  3. Integrate funnel & analytics context (structural, not creative)
  4. Prepare weekly material for Studio Ops Reports

This agent is STRUCTURAL only — it never generates narrative copy unless explicitly asked.
"""

from __future__ import annotations
import json
from datetime import datetime, timedelta
from typing import Optional
from config import cfg
from utils.notion_client import (
    get_notion, find_page_by_title,
    title_prop, text_prop, number_prop, select_prop, multi_select_prop,
    date_prop, url_prop, checkbox_prop,
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CONSTANTS & SCHEMA
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Valid values for normalization enforcement
VALID_ROLES       = {"Sophia", "Sol", "Both"}
VALID_TYPES       = {"Strategic", "Operational", "Creative", "Financial", "Legal", "Content", "Infrastructure"}
VALID_STATUSES    = {"Active", "Pipeline", "On Hold", "Completed", "Archived", "Blocked"}
VALID_PRIORITIES  = {"Critical", "High", "Medium", "Low", "Backlog"}
VALID_PHASES      = {"Ideation", "Planning", "In Progress", "Review", "Execution", "Monitoring", "Closing"}
VALID_TIMEFRAMES  = {"Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026",
                      "Q1 2027", "Q2 2027", "Q3 2027", "Q4 2027",
                      "2026", "2027", "2028", "2029", "2030",
                      "2026-2027", "2028-2030", "Ongoing"}
VALID_AXES        = {"Cashflow", "Reputation", "Legal Safety", "Asset Building",
                      "Network", "Skill Development", "Immigration", "Content Funnel"}
VALID_EFFORT      = {"Low", "Medium", "High", "Very High"}
VALID_VALUE       = {"Low", "Medium", "High", "Very High"}
VALID_RISK        = {"Low", "Medium", "High", "Critical"}

TODAY = datetime.now().strftime("%Y-%m-%d")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  1. CORE: Read all projects from Notion
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _get_db_id() -> str:
    """Return the Projects 2026-2030 database ID."""
    db_id = cfg.NOTION_PROJECTS_DB_ID
    if not db_id:
        raise RuntimeError(
            "NOTION_PROJECTS_DB_ID not set in .env\n"
            "Add the database ID from your 'Projects 2026–2030' Notion database."
        )
    return db_id


def fetch_all_projects() -> list[dict]:
    """
    Pull every project from the Projects 2026-2030 DB.
    Returns a list of simplified dicts with all properties extracted.
    """
    notion = get_notion()
    db_id = _get_db_id()
    all_pages = []
    has_more = True
    start_cursor = None

    while has_more:
        kwargs = {"database_id": db_id}
        if start_cursor:
            kwargs["start_cursor"] = start_cursor
        response = notion.databases.query(**kwargs)
        all_pages.extend(response.get("results", []))
        has_more = response.get("has_more", False)
        start_cursor = response.get("next_cursor")

    return [_extract_project(page) for page in all_pages]


def _extract_project(page: dict) -> dict:
    """Extract a project dict from a raw Notion page object."""
    props = page.get("properties", {})
    return {
        "page_id":           page["id"],
        "name":              _read_title(props.get("Name", {})),
        "role":              _read_select(props.get("Role", {})),
        "type":              _read_select(props.get("Type", {})),
        "status":            _read_select(props.get("Status", {})),
        "priority":          _read_select(props.get("Priority", {})),
        "timeframe":         _read_select(props.get("Timeframe", {})),
        "phase":             _read_select(props.get("Phase", {})),
        "strategic_axis":    _read_multi_select(props.get("Strategic Axis", {})),
        "owner":             _read_select(props.get("Owner", {})),
        "next_review":       _read_date(props.get("Next Review", {})),
        "last_update":       _read_date(props.get("Last Update", {})),
        "effort":            _read_select(props.get("Effort", {})),
        "value":             _read_select(props.get("Value", {})),
        "risk":              _read_select(props.get("Risk", {})),
        "context_notes":     _read_text(props.get("Context Notes", {})),
        "key_counterparties": _read_text(props.get("Key Counterparties", {})),
        "hard_deadlines":    _read_text(props.get("Hard Deadlines", {})),
        "links":             _read_url(props.get("Links", {})),
        "performance_note":  _read_text(props.get("Latest Performance Note", {})),
        "last_edited":       page.get("last_edited_time", ""),
    }


# ── Notion property readers ─────────────────────────────────────────────────

def _read_title(prop: dict) -> str:
    try:
        return prop["title"][0]["plain_text"]
    except (KeyError, IndexError, TypeError):
        return ""

def _read_select(prop: dict) -> str:
    try:
        return prop["select"]["name"]
    except (KeyError, TypeError):
        return ""

def _read_multi_select(prop: dict) -> list[str]:
    try:
        return [item["name"] for item in prop["multi_select"]]
    except (KeyError, TypeError):
        return []

def _read_date(prop: dict) -> str:
    try:
        return prop["date"]["start"] or ""
    except (KeyError, TypeError):
        return ""

def _read_text(prop: dict) -> str:
    try:
        return "".join(rt["plain_text"] for rt in prop["rich_text"])
    except (KeyError, TypeError):
        return ""

def _read_url(prop: dict) -> str:
    try:
        return prop["url"] or ""
    except (KeyError, TypeError):
        return ""


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  2. NORMALIZE: Ensure every project has valid structured fields
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def normalize_all_projects() -> dict:
    """
    Scan every project and fix missing/inconsistent fields.
    Returns a summary of changes made.
    """
    projects = fetch_all_projects()
    notion = get_notion()
    db_id = _get_db_id()
    changes = []

    for proj in projects:
        updates = {}
        issues = []

        # — Role
        if not proj["role"] or proj["role"] not in VALID_ROLES:
            inferred = _infer_role(proj)
            updates["Role"] = select_prop(inferred)
            issues.append(f"Role: '' → '{inferred}'")

        # — Type
        if not proj["type"] or proj["type"] not in VALID_TYPES:
            inferred = _infer_type(proj)
            updates["Type"] = select_prop(inferred)
            issues.append(f"Type: '' → '{inferred}'")

        # — Status (default to Pipeline if empty)
        if not proj["status"] or proj["status"] not in VALID_STATUSES:
            updates["Status"] = select_prop("Pipeline")
            issues.append(f"Status: '' → 'Pipeline'")

        # — Priority (default to Medium)
        if not proj["priority"] or proj["priority"] not in VALID_PRIORITIES:
            updates["Priority"] = select_prop("Medium")
            issues.append(f"Priority: '' → 'Medium'")

        # — Phase (default to Planning)
        if not proj["phase"] or proj["phase"] not in VALID_PHASES:
            updates["Phase"] = select_prop("Planning")
            issues.append(f"Phase: '' → 'Planning'")

        # — Timeframe (default to current year)
        if not proj["timeframe"]:
            updates["Timeframe"] = select_prop("2026")
            issues.append(f"Timeframe: '' → '2026'")

        # — Strategic Axis (default from context signals)
        if not proj["strategic_axis"]:
            inferred_axes = _infer_axes(proj)
            if inferred_axes:
                updates["Strategic Axis"] = multi_select_prop(inferred_axes)
                issues.append(f"Strategic Axis: '' → {inferred_axes}")

        # — Active projects MUST have a Next Review date
        status = proj["status"]
        if updates.get("Status"):
            # Use the corrected status
            status = "Pipeline"
        if status == "Active" and not proj["next_review"]:
            review_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
            updates["Next Review"] = date_prop(review_date)
            issues.append(f"Next Review: '' → '{review_date}' (enforced for Active)")

        # — Owner (default to match Role)
        if not proj.get("owner"):
            owner = proj.get("role") or "Both"
            if owner == "Both":
                owner = "Sophia"  # Default primary owner
            updates["Owner"] = select_prop(owner)
            issues.append(f"Owner: '' → '{owner}'")

        # Apply updates if any
        if updates:
            updates["Last Update"] = date_prop(TODAY)
            try:
                notion.pages.update(page_id=proj["page_id"], properties=updates)
                changes.append({
                    "project": proj["name"],
                    "fixes": issues,
                })
                print(f"   ✅  Normalized: {proj['name']} ({len(issues)} fixes)")
            except Exception as e:
                changes.append({
                    "project": proj["name"],
                    "fixes": [f"ERROR: {e}"],
                })
                print(f"   ⚠️  Failed to normalize '{proj['name']}': {e}")

    return {
        "total_projects": len(projects),
        "projects_updated": len(changes),
        "changes": changes,
    }


def _infer_role(proj: dict) -> str:
    """Infer Sophia vs Sol from project name and context."""
    text = (proj["name"] + " " + proj["context_notes"]).lower()
    sophia_keywords = {"architect", "finance", "contract", "property", "immigration",
                       "asset", "legal", "tax", "visa", "mortgage", "investment",
                       "compliance", "accounting", "insurance"}
    sol_keywords = {"art", "exhibition", "residency", "gallery", "painting", "sculpture",
                    "studio", "curator", "Instagram", "content", "collection", "portfolio",
                    "commission", "museum", "biennale"}
    sophia_score = sum(1 for kw in sophia_keywords if kw in text)
    sol_score = sum(1 for kw in sol_keywords if kw in text)
    if sophia_score > sol_score:
        return "Sophia"
    elif sol_score > sophia_score:
        return "Sol"
    return "Both"


def _infer_type(proj: dict) -> str:
    """Infer project type from name and context."""
    text = (proj["name"] + " " + proj["context_notes"]).lower()
    if any(kw in text for kw in ["finance", "cash", "revenue", "invoice", "budget", "tax"]):
        return "Financial"
    if any(kw in text for kw in ["contract", "legal", "visa", "compliance", "immigration"]):
        return "Legal"
    if any(kw in text for kw in ["content", "post", "reel", "video", "social", "instagram"]):
        return "Content"
    if any(kw in text for kw in ["exhibition", "gallery", "painting", "sculpture", "residency"]):
        return "Creative"
    if any(kw in text for kw in ["system", "setup", "infrastructure", "tool", "automation"]):
        return "Infrastructure"
    if any(kw in text for kw in ["strategy", "plan", "roadmap", "position"]):
        return "Strategic"
    return "Operational"


def _infer_axes(proj: dict) -> list[str]:
    """Infer strategic axes from name and context."""
    text = (proj["name"] + " " + proj["context_notes"]).lower()
    axes = []
    if any(kw in text for kw in ["cash", "revenue", "income", "sales", "monetize"]):
        axes.append("Cashflow")
    if any(kw in text for kw in ["reputation", "profile", "brand", "visibility", "exhibition"]):
        axes.append("Reputation")
    if any(kw in text for kw in ["legal", "contract", "compliance", "visa", "insurance"]):
        axes.append("Legal Safety")
    if any(kw in text for kw in ["asset", "property", "investment", "equity"]):
        axes.append("Asset Building")
    if any(kw in text for kw in ["network", "curator", "gallery", "collector"]):
        axes.append("Network")
    if any(kw in text for kw in ["content", "funnel", "social", "audience"]):
        axes.append("Content Funnel")
    if any(kw in text for kw in ["immigration", "visa", "residence permit"]):
        axes.append("Immigration")
    return axes or ["Reputation"]  # Default axis


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  3. CONTEXT NOTES: Persistent memory management
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def append_context_note(project_name: str, note: str) -> bool:
    """
    Append a timestamped note to a project's Context Notes.
    Never deletes prior context — always appends.
    """
    notion = get_notion()
    db_id = _get_db_id()
    page_id = find_page_by_title(notion, db_id, project_name)

    if not page_id:
        print(f"   ⚠️  Project not found: {project_name}")
        return False

    # Read existing context
    page = notion.pages.retrieve(page_id=page_id)
    existing = _read_text(page.get("properties", {}).get("Context Notes", {}))

    # Build updated note — compact, factual, timestamped
    timestamp = datetime.now().strftime("%Y-%m-%d")
    new_entry = f"\n[{timestamp}] {note.strip()}"
    updated = (existing + new_entry).strip()

    # Truncate if approaching Notion's 2000-char limit for rich_text
    if len(updated) > 1900:
        # Keep most recent entries, trim oldest
        lines = updated.split("\n")
        while len("\n".join(lines)) > 1900 and len(lines) > 3:
            lines.pop(0)
        updated = "...\n" + "\n".join(lines)

    try:
        notion.pages.update(
            page_id=page_id,
            properties={
                "Context Notes": text_prop(updated),
                "Last Update": date_prop(TODAY),
            }
        )
        print(f"   ✅  Context updated: {project_name}")
        return True
    except Exception as e:
        print(f"   ⚠️  Failed to update context for '{project_name}': {e}")
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  4. PERFORMANCE NOTES: Funnel & analytics integration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def update_performance_note(project_name: str, note: str) -> bool:
    """
    Write a one-line performance note for a content-linked project.
    This goes into "Latest Performance Note" property (or appended to Context Notes
    if the property doesn't exist).
    """
    notion = get_notion()
    db_id = _get_db_id()
    page_id = find_page_by_title(notion, db_id, project_name)

    if not page_id:
        print(f"   ⚠️  Project not found: {project_name}")
        return False

    timestamp = datetime.now().strftime("%Y-%m-%d")
    perf_note = f"[{timestamp}] {note.strip()}"

    try:
        # Try writing to dedicated property first
        notion.pages.update(
            page_id=page_id,
            properties={
                "Latest Performance Note": text_prop(perf_note),
                "Last Update": date_prop(TODAY),
            }
        )
        print(f"   ✅  Performance note set: {project_name}")
        return True
    except Exception:
        # Fall back to appending to Context Notes
        return append_context_note(
            project_name,
            f"[PERF] {note.strip()}"
        )


def identify_underperforming_funnels() -> list[dict]:
    """
    Scan projects with Strategic Axis including Cashflow or Reputation
    and flag those whose performance note suggests underperformance.
    Returns structural action suggestions (never creative copy).
    """
    projects = fetch_all_projects()
    flagged = []

    for proj in projects:
        axes = proj.get("strategic_axis", [])
        if not any(a in axes for a in ["Cashflow", "Reputation", "Content Funnel"]):
            continue
        if proj["status"] not in ("Active", "Pipeline"):
            continue

        perf_note = proj.get("performance_note", "").lower()
        context = proj.get("context_notes", "").lower()

        # Detect underperformance signals
        underperforming = False
        signals = []

        if any(kw in perf_note for kw in ["underperform", "decline", "low engagement",
                                            "below average", "dropping", "stagnant"]):
            underperforming = True
            signals.append("Performance note flags underperformance")

        if "no content" in context or "no posts" in context:
            underperforming = True
            signals.append("No content output detected in context")

        if underperforming:
            suggestions = _generate_structural_suggestions(proj, signals)
            flagged.append({
                "project": proj["name"],
                "role": proj["role"],
                "axes": axes,
                "signals": signals,
                "suggestions": suggestions,
            })

    return flagged


def _generate_structural_suggestions(proj: dict, signals: list[str]) -> list[str]:
    """
    Generate STRUCTURAL (not creative) suggestions for underperforming projects.
    Focus on frequency, sequencing, series grouping, scoping.
    """
    suggestions = []
    name = proj["name"].lower()
    axes = proj.get("strategic_axis", [])

    if "Cashflow" in axes:
        suggestions.append(
            f"Increase posting frequency for content tied to '{proj['name']}' — "
            f"consider 2x/week minimum for cashflow-linked projects."
        )
        suggestions.append(
            "Review call-to-action placement and funnel step sequencing."
        )

    if "Reputation" in axes:
        suggestions.append(
            f"Split '{proj['name']}' into a front-facing content series if it "
            f"currently shares visibility with other projects."
        )
        suggestions.append(
            "Evaluate whether institutional vs. audience-facing framing needs separation."
        )

    if "Content Funnel" in axes:
        suggestions.append(
            "Audit funnel steps: identify which step has the highest drop-off and "
            "consider restructuring or retiring that step."
        )

    if not suggestions:
        suggestions.append(
            f"Review project scope — consider whether '{proj['name']}' should be "
            f"narrowed, paused, or merged with a related project."
        )

    return suggestions


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  5. WEEKLY OPS REPORT: Prepare context for Studio Ops Report
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def generate_ops_report() -> dict:
    """
    Build a structured weekly ops report for all due/active projects.
    Returns a dict suitable for rendering or passing to the Studio Ops Report agent.
    """
    projects = fetch_all_projects()
    today = datetime.now().strftime("%Y-%m-%d")

    report_projects = []

    for proj in projects:
        # Include project if: Active, Pipeline, or Next Review is due
        include = False
        reason = []

        if proj["status"] in ("Active", "Pipeline"):
            include = True
            reason.append(f"Status: {proj['status']}")

        if proj["next_review"] and proj["next_review"] <= today:
            include = True
            reason.append(f"Review due: {proj['next_review']}")

        if not include:
            continue

        # Extract last 2-3 context note entries
        context_lines = proj["context_notes"].strip().split("\n") if proj["context_notes"] else []
        recent_changes = context_lines[-3:] if len(context_lines) > 3 else context_lines

        # Determine primary concern
        role = proj["role"] or "Both"
        concern = _determine_concern(role, proj["type"])

        report_projects.append({
            "name": proj["name"],
            "role": role,
            "concern": concern,
            "phase": proj["phase"] or "Unknown",
            "status": proj["status"],
            "priority": proj["priority"],
            "strategic_axis": proj["strategic_axis"],
            "recent_changes": recent_changes,
            "hard_deadlines": proj["hard_deadlines"],
            "next_review": proj["next_review"],
            "inclusion_reason": reason,
            "performance_note": proj.get("performance_note", ""),
        })

    # Sort: Critical/High priority first, then by review date
    priority_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Backlog": 4}
    report_projects.sort(key=lambda p: (
        priority_order.get(p["priority"], 5),
        p.get("next_review") or "9999",
    ))

    # Identify underperforming funnels
    funnel_flags = identify_underperforming_funnels()

    return {
        "report_date": today,
        "total_active": sum(1 for p in report_projects if p["status"] == "Active"),
        "total_pipeline": sum(1 for p in report_projects if p["status"] == "Pipeline"),
        "reviews_due": sum(1 for p in report_projects if "Review due" in " ".join(p["inclusion_reason"])),
        "sophia_projects": [p for p in report_projects if p["concern"] in ("Sophia", "Both")],
        "sol_projects": [p for p in report_projects if p["concern"] in ("Sol", "Both")],
        "all_projects": report_projects,
        "funnel_flags": funnel_flags,
    }


def _determine_concern(role: str, proj_type: str) -> str:
    """Tag whether a project primarily concerns Sophia, Sol, or Both."""
    if role in ("Sophia", "Sol"):
        return role
    # For "Both", use type as tiebreaker
    sophia_types = {"Financial", "Legal", "Infrastructure"}
    sol_types = {"Creative", "Content"}
    if proj_type in sophia_types:
        return "Sophia"
    if proj_type in sol_types:
        return "Sol"
    return "Both"


def format_ops_report_text(report: dict) -> str:
    """
    Format the ops report dict into a human-readable text summary
    suitable for the weekly Studio Ops Report.
    """
    lines = []
    lines.append(f"═══ STUDIO OPS REPORT — {report['report_date']} ═══")
    lines.append("")
    lines.append(f"Active: {report['total_active']}  │  Pipeline: {report['total_pipeline']}  │  Reviews Due: {report['reviews_due']}")
    lines.append("")

    # Sophia's projects
    if report["sophia_projects"]:
        lines.append("── SOPHIA ──────────────────────────────────────────")
        for p in report["sophia_projects"]:
            lines.append(_format_project_entry(p))
        lines.append("")

    # Sol's projects
    if report["sol_projects"]:
        lines.append("── SOL ─────────────────────────────────────────────")
        for p in report["sol_projects"]:
            lines.append(_format_project_entry(p))
        lines.append("")

    # Funnel flags
    if report["funnel_flags"]:
        lines.append("── FUNNEL ALERTS ───────────────────────────────────")
        for flag in report["funnel_flags"]:
            lines.append(f"  ⚠️  {flag['project']} ({', '.join(flag['axes'])})")
            for sig in flag["signals"]:
                lines.append(f"      Signal: {sig}")
            for sug in flag["suggestions"]:
                lines.append(f"      → {sug}")
            lines.append("")

    return "\n".join(lines)


def _format_project_entry(p: dict) -> str:
    """Format a single project for the ops report."""
    parts = []
    parts.append(f"  ▸ {p['name']}")
    parts.append(f"    Phase: {p['phase']}  │  Priority: {p['priority']}  │  Status: {p['status']}")

    if p["strategic_axis"]:
        parts.append(f"    Axes: {', '.join(p['strategic_axis'])}")

    if p["hard_deadlines"]:
        parts.append(f"    ⏰ Deadlines: {p['hard_deadlines']}")

    if p["next_review"]:
        parts.append(f"    📅 Next Review: {p['next_review']}")

    if p["recent_changes"]:
        parts.append(f"    Recent:")
        for change in p["recent_changes"]:
            parts.append(f"      {change.strip()}")

    if p["performance_note"]:
        parts.append(f"    📊 {p['performance_note']}")

    return "\n".join(parts) + "\n"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  6. PROJECT CREATION: Normalized by default
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def create_project(
    name: str,
    role: str = "Both",
    proj_type: str = "Operational",
    status: str = "Pipeline",
    priority: str = "Medium",
    timeframe: str = "2026",
    phase: str = "Planning",
    strategic_axis: list[str] | None = None,
    owner: str = "",
    context_notes: str = "",
    key_counterparties: str = "",
    hard_deadlines: str = "",
    links: str = "",
    effort: str = "Medium",
    value: str = "Medium",
    risk: str = "Low",
) -> str:
    """
    Create a new project with full normalization enforced at creation time.
    Returns the Notion page ID.
    """
    notion = get_notion()
    db_id = _get_db_id()

    # Enforce defaults
    if not owner:
        owner = role if role in ("Sophia", "Sol") else "Sophia"
    if strategic_axis is None:
        strategic_axis = ["Reputation"]
    if status == "Active":
        next_review = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
    else:
        next_review = ""

    # Check for existing project
    existing_id = find_page_by_title(notion, db_id, name)
    if existing_id:
        print(f"   ⚠️  Project already exists: {name} (updating instead)")
        return _update_project_fields(existing_id, locals())

    # Build properties
    props = {
        "Name": title_prop(name),
        "Role": select_prop(role),
        "Type": select_prop(proj_type),
        "Status": select_prop(status),
        "Priority": select_prop(priority),
        "Timeframe": select_prop(timeframe),
        "Phase": select_prop(phase),
        "Strategic Axis": multi_select_prop(strategic_axis),
        "Owner": select_prop(owner),
        "Last Update": date_prop(TODAY),
        "Effort": select_prop(effort),
        "Value": select_prop(value),
        "Risk": select_prop(risk),
    }

    if context_notes:
        props["Context Notes"] = text_prop(f"[{TODAY}] {context_notes}")
    if key_counterparties:
        props["Key Counterparties"] = text_prop(key_counterparties)
    if hard_deadlines:
        props["Hard Deadlines"] = text_prop(hard_deadlines)
    if links:
        props["Links"] = url_prop(links)
    if next_review:
        props["Next Review"] = date_prop(next_review)

    try:
        page = notion.pages.create(parent={"database_id": db_id}, properties=props)
        page_id = page["id"]
        print(f"   ✅  Created project: {name}")
        return page_id
    except Exception as e:
        print(f"   ⚠️  Failed to create project '{name}': {e}")
        return ""


def _update_project_fields(page_id: str, fields: dict) -> str:
    """Update an existing project page with provided fields."""
    notion = get_notion()
    props = {"Last Update": date_prop(TODAY)}

    field_map = {
        "role": ("Role", select_prop),
        "proj_type": ("Type", select_prop),
        "status": ("Status", select_prop),
        "priority": ("Priority", select_prop),
        "timeframe": ("Timeframe", select_prop),
        "phase": ("Phase", select_prop),
        "owner": ("Owner", select_prop),
        "effort": ("Effort", select_prop),
        "value": ("Value", select_prop),
        "risk": ("Risk", select_prop),
    }

    for key, (prop_name, builder) in field_map.items():
        if fields.get(key):
            props[prop_name] = builder(fields[key])

    if fields.get("strategic_axis"):
        props["Strategic Axis"] = multi_select_prop(fields["strategic_axis"])
    if fields.get("hard_deadlines"):
        props["Hard Deadlines"] = text_prop(fields["hard_deadlines"])
    if fields.get("links"):
        props["Links"] = url_prop(fields["links"])

    try:
        notion.pages.update(page_id=page_id, properties=props)
        print(f"   ✅  Updated project: {page_id}")
        return page_id
    except Exception as e:
        print(f"   ⚠️  Failed to update project: {e}")
        return ""


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  7. ENFORCE REVIEW DATES: Active projects must have Next Review
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def enforce_review_dates() -> list[str]:
    """
    Scan all Active projects and ensure Next Review is set within 7-14 days.
    Returns list of projects that were updated.
    """
    projects = fetch_all_projects()
    notion = get_notion()
    updated = []

    for proj in projects:
        if proj["status"] != "Active":
            continue

        needs_update = False
        if not proj["next_review"]:
            needs_update = True
        else:
            # Check if review date is in the past
            try:
                review_dt = datetime.strptime(proj["next_review"][:10], "%Y-%m-%d")
                if review_dt.date() < datetime.now().date():
                    needs_update = True
            except ValueError:
                needs_update = True

        if needs_update:
            new_review = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
            try:
                notion.pages.update(
                    page_id=proj["page_id"],
                    properties={
                        "Next Review": date_prop(new_review),
                        "Last Update": date_prop(TODAY),
                    }
                )
                updated.append(proj["name"])
                print(f"   ✅  Review date set for: {proj['name']} → {new_review}")
            except Exception as e:
                print(f"   ⚠️  Failed to set review for '{proj['name']}': {e}")

    return updated
