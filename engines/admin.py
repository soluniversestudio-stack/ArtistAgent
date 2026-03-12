"""
engines/admin.py — Engine 3: Administrative Intelligence
- Weekly city event scanner (Mondays, top 5)
- Residency/Grant opportunity ranker
- Auto-proposal generator
- CRM with 45-day follow-up triggers
"""
import json
from datetime import datetime, timedelta
from pathlib import Path
from config import cfg
from utils.ai_client import ask_ai
from utils.search_client import search, search_text
from engines.notion_sync import push_contact


# ── Event Scanner ────────────────────────────────────────────────────────────

def scan_events(city: str = None) -> dict:
    """Scan for top 5 art/networking events in the artist's current city."""
    city = city or cfg.ARTIST_CITY
    today_dt = datetime.now()
    today_str = today_dt.strftime("%B %Y")
    next_month_str = (today_dt.replace(day=28) + timedelta(days=4)).strftime("%B %Y")
    print(f"\n📍  Scanning events in {city} — upcoming for {today_str} / {next_month_str}...")

    query = f"upcoming contemporary art networking events openings galleries {city} {today_str} OR {next_month_str}"
    raw = search(query, max_results=10)

    prompt = f"""You are an art world strategist for {cfg.ARTIST_NAME}, a contemporary visual artist 
    targeting institutional credibility (Tier 1 residencies, museum-adjacent exhibitions).
    
    Today's date is {today_dt.strftime('%Y-%m-%d')}.
    From these search results, pick the TOP 5 most relevant UPCOMING networking events in {city}.
    CRITICAL RULE: DO NOT INCLUDE ANY EVENT THAT HAS ALREADY PASSED. IF THE DATE IS BEFORE TODAY, DISCARD IT.
    
    Rank by: institutional weight > collector access > peer network value.
    
    For each event return:
    - Name
    - Date/time
    - Venue
    - Why it matters (1 sentence)
    - Action recommended (attend / submit / reach out)
    
    Search results:
    {json.dumps(raw, indent=2)}"""

    ranked = ask_ai(prompt, max_tokens=1000)
    output = {
        "city": city,
        "scanned_at": datetime.now().isoformat(),
        "events": ranked,
    }
    _save_data("events", f"events_{datetime.now().strftime('%Y%m%d')}.json", output)
    print(ranked)
    return output


# ── Residency / Grant Pipeline ───────────────────────────────────────────────

PRESTIGE_WEIGHTS = {
    "alumni_strength": 0.35,
    "institutional_affiliation": 0.30,
    "stipend_and_support": 0.20,
    "geographic_fit": 0.15,  # APAC priority
}

def scan_opportunities(focus_geo: list[str] = None) -> dict:
    """Search and rank residencies and grants by prestige weight."""
    focus_geo = focus_geo or ["Australia", "Japan", "Korea", "Singapore", "Taiwan", "China"]
    print("\n🏛️  Scanning residency & grant opportunities in APAC...")

    all_results = []
    for geo in focus_geo:
        query = f"artist residency grant 2026 application open {geo} contemporary visual art"
        results = search(query, max_results=5)
        all_results.extend(results)

    prompt = f"""You are an art career strategist. Rank these opportunities for {cfg.ARTIST_NAME},
    a contemporary visual artist targeting institutional credibility.
    Geographic priorities (APAC Focus): {", ".join(focus_geo)}.
    
    Score each on:
    - Alumni strength (35%): Do notable artists have this on their CV?
    - Institutional affiliation (30%): Museum, university, or government backing?
    - Stipend & support (20%): Does it provide living stipend + studio?
    - Geographic fit (15%): Does it match the APAC strategy?
    
    Return TOP 10 opportunities with: Name, Location, Deadline, Score (1-10), Why apply, Link.
    
    Results to evaluate:
    {json.dumps(all_results, indent=2)}"""

    ranked = ask_ai(prompt, max_tokens=1500)
    output = {
        "scanned_at": datetime.now().isoformat(),
        "focus_geo": focus_geo,
        "opportunities": ranked,
    }
    _save_data("opportunities", f"opps_{datetime.now().strftime('%Y%m%d')}.json", output)
    print(ranked)
    return output


# ── Auto-Proposal Generator ──────────────────────────────────────────────────

def generate_proposal(opportunity_name: str, opportunity_description: str) -> str:
    """Draft a tailored proposal using the artist's CV, statement, and artwork database."""
    cv_text = _load_cv()
    artworks = _load_artworks_summary()

    prompt = f"""You are writing an artist application for {cfg.ARTIST_NAME}.
    
OPPORTUNITY: {opportunity_name}
DESCRIPTION: {opportunity_description}

ARTIST CV:
{cv_text}

RECENT ARTWORKS (titles, media, statements):
{artworks}

Write a tailored application that includes:
1. Opening paragraph (2-3 sentences): Why THIS residency for THIS artist right now
2. Project proposal (150 words): What work will be made during the residency
3. Artistic context (100 words): How this fits the arc of the artist's practice  
4. Closing statement (50 words): Specific to this program's mission

Tone: Museum-quality, specific, intellectually grounded. No clichés."""

    proposal = ask_ai(prompt, max_tokens=1200)
    filename = opportunity_name.lower().replace(" ", "_")[:40]
    _save_data("proposals", f"{filename}_{datetime.now().strftime('%Y%m%d')}.txt", proposal, text=True)
    return proposal


# ── CRM: Curator & Collector Tracker ─────────────────────────────────────────

def add_contact(name: str, role: str, institution: str, email: str, notes: str = "") -> dict:
    """Add a new curator/collector to the CRM."""
    contacts = _load_crm()
    contact = {
        "id": f"{name.lower().replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}",
        "name": name,
        "role": role,
        "institution": institution,
        "email": email,
        "notes": notes,
        "first_contact": datetime.now().isoformat(),
        "last_contact": datetime.now().isoformat(),
        "next_followup": (datetime.now() + timedelta(days=45)).strftime("%Y-%m-%d"),
        "status": "active",
    }
    contacts.append(contact)
    _save_crm(contacts)
    
    # Auto-push to Notion
    try: push_contact(contact)
    except: pass
    
    print(f"✅  Contact added: {name} — follow-up due {contact['next_followup']}")
    return contact


def get_followups_due() -> list[dict]:
    """Return contacts whose 45-day follow-up is due today or overdue."""
    contacts = _load_crm()
    today = datetime.now().strftime("%Y-%m-%d")
    due = [c for c in contacts if c.get("next_followup", "9999") <= today and c.get("status") == "active"]
    return due


def generate_followup_email(contact: dict) -> str:
    """AI-draft a follow-up email for a contact."""
    cv_text = _load_cv()[:500]
    prompt = f"""Draft a brief, warm follow-up email from {cfg.ARTIST_NAME} ({cfg.ARTIST_EMAIL}) 
    to {contact['name']}, {contact['role']} at {contact['institution']}.
    
    Context from last interaction: {contact.get('notes', 'Initial introduction')}
    
    Guidelines:
    - 3 paragraphs max
    - Lead with something specific (a show, an article, their institution's recent news if possible)
    - Mention one current artwork or upcoming opportunity relevant to them
    - Soft, non-pushy CTA (studio visit, coffee, sharing new work)
    - Tone: confident, collegial, not desperate
    
    Artist background snippet: {cv_text}"""
    return ask_ai(prompt, max_tokens=400)


def log_interaction(contact_id: str, notes: str):
    """Record an interaction and reset the 45-day follow-up clock."""
    contacts = _load_crm()
    for c in contacts:
        if c["id"] == contact_id:
            c["last_contact"] = datetime.now().isoformat()
            c["next_followup"] = (datetime.now() + timedelta(days=45)).strftime("%Y-%m-%d")
            c["notes"] = notes
            # Auto-push to Notion
            try: push_contact(c)
            except: pass
            break
    _save_crm(contacts)
    print(f"✅  Interaction logged. Next follow-up reset to 45 days.")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _load_cv() -> str:
    # First check for the primary Portfolio PDF in the Studio folder
    pdf_path = cfg.CV_DIR / "Art portfolio - Sol (EN).pdf"
    if pdf_path.exists():
        try:
            import fitz
            doc = fitz.open(pdf_path)
            text = ""
            for page in doc:
                text += page.get_text() + "\n"
            return text
        except Exception as e:
            print(f"Warning: Failed to read Portfolio PDF: {e}")

    # Fallback to older text/md logic
    for ext in ["txt", "md"]:
        cv_path = cfg.CV_DIR / f"cv.{ext}"
        if cv_path.exists():
            return cv_path.read_text(encoding="utf-8")
    return f"{cfg.ARTIST_NAME} — Artist CV (not yet found in {cfg.CV_DIR})"


def _load_artworks_summary() -> str:
    from engines.creative import list_artworks
    artworks = list_artworks()
    if not artworks:
        return "No artworks in database yet."
    lines = []
    for a in artworks[:10]:
        lines.append(f"- {a.get('title', 'Untitled')} ({a.get('medium', '')}, {a.get('year', '')}): {a.get('ai_statement', '')[:100]}")
    return "\n".join(lines)


def _load_crm() -> list:
    crm_path = cfg.CRM_DIR / "contacts.json"
    if crm_path.exists():
        return json.loads(crm_path.read_text())
    return []


def _save_crm(contacts: list):
    crm_path = cfg.CRM_DIR / "contacts.json"
    with open(crm_path, "w") as f:
        json.dump(contacts, f, indent=2)


def _save_data(folder: str, filename: str, data, text: bool = False):
    path = cfg.DATA_DIR / folder / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    if text:
        path.write_text(str(data), encoding="utf-8")
    else:
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
