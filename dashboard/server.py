"""
dashboard/server.py — Flask backend for the Sunday Night Dashboard.
"""
import json
from datetime import datetime
from flask import Flask, jsonify, render_template_string
from flask_cors import CORS
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import cfg

app = Flask(__name__, template_folder=".")
CORS(app)


@app.route("/")
def index():
    return (Path(__file__).parent / "index.html").read_text(encoding="utf-8")


@app.route("/api/status")
def status():
    from engines.creative import list_artworks
    from engines.admin import get_followups_due
    artworks = list_artworks()
    followups = get_followups_due()
    # Load latest digest
    digest_dir = cfg.DATA_DIR / "digests"
    latest_digest = {}
    if digest_dir.exists():
        files = sorted(digest_dir.glob("*.json"), reverse=True)
        if files:
            latest_digest = json.loads(files[0].read_text())
    # Load latest events
    events_dir = cfg.DATA_DIR / "events"
    latest_events = {}
    if events_dir.exists():
        files = sorted(events_dir.glob("*.json"), reverse=True)
        if files:
            latest_events = json.loads(files[0].read_text())
    # Load latest opportunities
    opps_dir = cfg.DATA_DIR / "opportunities"
    latest_opps = {}
    if opps_dir.exists():
        files = sorted(opps_dir.glob("*.json"), reverse=True)
        if files:
            latest_opps = json.loads(files[0].read_text())
    return jsonify({
        "artist": cfg.ARTIST_NAME,
        "timestamp": datetime.now().isoformat(),
        "artworks_count": len(artworks),
        "artworks": artworks[-3:],        # last 3
        "followups_due": len(followups),
        "followups": followups,
        "digest": latest_digest,
        "events": latest_events,
        "opportunities": latest_opps,
    })


@app.route("/api/run/<engine>")
def run_engine(engine):
    try:
        if engine == "events":
            from engines.admin import scan_events
            result = scan_events()
        elif engine == "opportunities":
            from engines.admin import scan_opportunities
            result = scan_opportunities()
        elif engine == "digest":
            from engines.email_intel import get_daily_digest
            result = get_daily_digest()
        else:
            return jsonify({"error": f"Unknown engine: {engine}"}), 400
        return jsonify({"status": "ok", "result": str(result)[:2000]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
