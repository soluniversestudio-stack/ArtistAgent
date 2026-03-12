"""
engines/creative.py — Engine 1: Creative Production
Handles Phase A (Inspiration Intake), Phase B (Studio Daily Log), Phase C (Artwork Documentation).
"""
import json
from datetime import datetime
from pathlib import Path
from config import cfg
from utils.ai_client import ask_ai
from engines.notion_sync import push_artwork, push_studio_log


# ── Phase A: Inspiration Intake ─────────────────────────────────────────────

def capture_inspiration() -> dict:
    """Interactive CLI: capture a new inspiration entry."""
    print("\n🎨  PHASE A — INSPIRATION CAPTURE")
    print("─" * 40)
    entry = {
        "id": datetime.now().strftime("%Y%m%d_%H%M%S"),
        "date": datetime.now().isoformat(),
        "location": input("Location (city/place): ").strip(),
        "tone": input("Tone (e.g. melancholic, vibrant): ").strip(),
        "theme": input("Theme (e.g. memory, identity): ").strip(),
        "narrative_angle": input("Narrative angle (1-2 sentences): ").strip(),
        "raw_notes": input("Any raw notes / first impressions: ").strip(),
    }
    # AI enrichment
    prompt = f"""You are an artist's creative assistant. Given this inspiration entry, 
    suggest 3 potential artwork concepts in 1 sentence each.
    
    Location: {entry['location']}
    Tone: {entry['tone']}
    Theme: {entry['theme']}
    Narrative angle: {entry['narrative_angle']}
    Notes: {entry['raw_notes']}"""
    entry["ai_concepts"] = ask_ai(prompt)
    _save_json(cfg.LOGS_DIR / f"inspiration_{entry['id']}.json", entry)
    print(f"\n✅  Inspiration saved. AI suggests:\n{entry['ai_concepts']}")
    return entry


# ── Phase B: Studio Daily Log ────────────────────────────────────────────────

STUDIO_PHASES = [
    ("Day 1 – Structural", "What structural decisions did you make today? (composition, format, scale)"),
    ("Day 2 – Compositional", "What compositional shifts happened? (color, space, balance)"),
    ("Day 3 – Emotional", "What emotional territory emerged in the work today?"),
    ("Day 4 – Complexity", "Where did complexity or tension arise? How did you respond?"),
    ("Day 5 – Resolution", "How did you resolve or finalize the work? What remains open?"),
]

def add_studio_log(artwork_id: str = "") -> dict:
    """Add a daily studio log entry."""
    print("\n📓  PHASE B — STUDIO LOG")
    print("─" * 40)
    if not artwork_id:
        artwork_id = input("Artwork ID (or press Enter to create new): ").strip()
        if not artwork_id:
            artwork_id = f"artwork_{datetime.now().strftime('%Y%m%d')}"
    existing = _load_artwork(artwork_id)
    day_num = len(existing.get("studio_log", [])) + 1
    if day_num > 5:
        print("✅  All 5 studio log days complete for this artwork!")
        return existing
    phase_name, question = STUDIO_PHASES[day_num - 1]
    print(f"\n  {phase_name}")
    response_text = input(f"  {question}\n  → ").strip()
    log_entry = {
        "day": day_num,
        "phase": phase_name,
        "date": datetime.now().isoformat(),
        "entry": response_text,
    }
    # AI reflection
    prompt = f"""As an artist's journal assistant, write a 2-sentence reflective observation 
    about this studio note. Keep the artist's voice — introspective, specific.
    
    Phase: {phase_name}
    Entry: {response_text}"""
    log_entry["ai_reflection"] = ask_ai(prompt, max_tokens=300)
    existing.setdefault("studio_log", []).append(log_entry)
    _save_artwork(artwork_id, existing)
    
    # Auto-push to Notion
    push_studio_log(existing.get("title", artwork_id), log_entry)

    print(f"\n💭  AI reflection:\n{log_entry['ai_reflection']}")
    return existing


# ── Phase C: Artwork Documentation ──────────────────────────────────────────

def document_artwork(artwork_id: str = "") -> dict:
    """Record the 8–10 structured assets for a completed artwork."""
    print("\n🖼️  PHASE C — ARTWORK DOCUMENTATION")
    print("─" * 40)
    if not artwork_id:
        artwork_id = input("Artwork ID: ").strip()
    existing = _load_artwork(artwork_id)
    info = {
        "title": input("Artwork title: ").strip(),
        "year": datetime.now().year,
        "medium": input("Medium (e.g. oil on linen): ").strip(),
        "dimensions": input("Dimensions (H × W cm): ").strip(),
        "edition": input("Edition (or 'unique'): ").strip(),
        "price_usd": input("Price (USD): ").strip(),
        "location": input("Current location: ").strip(),
        "series": input("Series name (if any): ").strip(),
        "assets": {
            "landscape_raw": input("File path – Landscape RAW: ").strip(),
            "landscape_final": input("File path – Landscape FINAL: ").strip(),
            "portrait_raw": input("File path – Portrait RAW: ").strip(),
            "portrait_final": input("File path – Portrait FINAL: ").strip(),
            "detail_shots": input("File paths – Detail shots (comma-sep): ").strip(),
            "studio_process": input("File paths – Studio process shots: ").strip(),
            "installation_view": input("File path – Installation view (if any): ").strip(),
            "certificate": input("File path – Certificate of authenticity: ").strip(),
        },
    }
    # Generate artist statement for this work
    studio_log_text = "\n".join(
        [f"Day {e['day']}: {e['entry']}" for e in existing.get("studio_log", [])]
    )
    prompt = f"""Write a 150-word artist statement for the following artwork.
    Tone: introspective, international, museum-quality language.
    Artist: {cfg.ARTIST_NAME}
    Title: {info['title']}
    Medium: {info['medium']}
    Studio notes: {studio_log_text}"""
    info["ai_statement"] = ask_ai(prompt, max_tokens=400)
    existing.update(info)
    _save_artwork(artwork_id, existing)
    
    # Auto-push to Notion
    push_artwork(existing)
    
    print(f"\n📝  Auto-generated statement:\n{info['ai_statement']}")
    return existing


def list_artworks() -> list[dict]:
    """Return all artworks as a list, scanning recursively through Studio folders."""
    artworks = []
    
    # 1. Look for structured JSON metadata anywhere in the Project path
    for f in cfg.ARTWORKS_DIR.rglob("*.json"):
        try:
            with open(f, encoding="utf-8") as fh:
                artworks.append(json.load(fh))
        except Exception:
            pass

    # 2. If no structured data yet, infer artworks from the folder structure (e.g. '2026 Artwork/Mauna #1')
    if not artworks:
        for year_dir in cfg.ARTWORKS_DIR.glob("* Artwork*"):
            if year_dir.is_dir():
                for proj_dir in year_dir.iterdir():
                    if proj_dir.is_dir() and "Photos" not in proj_dir.name:
                        year = ''.join(filter(str.isdigit, year_dir.name)) or str(datetime.now().year)
                        artworks.append({
                            "id": proj_dir.name.replace(" ", "_").lower(),
                            "title": proj_dir.name,
                            "year": year,
                            "medium": "Mixed Media",  # Placeholder
                            "ai_statement": f"Work in progress from {proj_dir.name}."
                        })
    return artworks


# ── Helpers ──────────────────────────────────────────────────────────────────

def _save_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

def _load_artwork(artwork_id: str) -> dict:
    # Look for existing json anywhere in the tree
    for path in cfg.ARTWORKS_DIR.rglob(f"{artwork_id}.json"):
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    return {"id": artwork_id}

def _save_artwork(artwork_id: str, data: dict):
    # Save agent-generated artwork logs into a dedicated folder so we don't clutter the user's Studio Drive
    agent_dir = cfg.ARTWORKS_DIR / "Agent_Metadata"
    _save_json(agent_dir / f"{artwork_id}.json", data)
