# 🎨 Artist Intelligence Agent

A private, local AI agent that automates creative production, content generation, administrative tasks, and email management for visual artists.

## Quick Start

```bash
# 1. Install Ollama (FREE local AI)
#    Download from https://ollama.com, then:
ollama pull llama3.1

# 2. Install Python dependencies
cd C:\ArtistAgent
pip install -r requirements.txt

# 3. Run a command
python main.py --help
python main.py digest          # Email digest (demo mode)
python main.py events          # Scan events in your city
python main.py dashboard       # Launch Sunday Night Dashboard
```

## AI Backend

The agent supports two AI backends:

| Backend | Cost | Speed | Setup |
|---------|------|-------|-------|
| **Ollama** (default) | FREE | Depends on hardware | `ollama pull llama3.1` |
| **Claude** (fallback) | ~$0.001/query | Fast | API key in `.env` |

Set `AI_BACKEND` in `.env`:
- `auto` — tries Ollama first, falls back to Claude *(default)*
- `ollama` — Ollama only
- `anthropic` — Claude only

## Engines

### Engine 1: Creative Production (`engines/creative.py`)
- `python main.py capture` — Log inspiration (location, tone, theme)
- `python main.py log` — Daily studio log (5-day structured process)
- `python main.py document` — Document completed artwork assets
- `python main.py artworks` — List all artworks

### Engine 2: Content Generation (`engines/content.py`)
- `python main.py scripts <artwork_id>` — Generate platform scripts (YT, Reels, IG, Threads)

### Engine 3: Admin Intelligence (`engines/admin.py`)
- `python main.py events` — Scan top 5 networking events (uses Tavily search)
- `python main.py opportunities` — Find and rank residencies/grants
- `python main.py propose "<name>" "<desc>"` — Generate a tailored proposal
- `python main.py followups` — CRM follow-up tracker (45-day rule)

### Engine 4: Email Intelligence (`engines/email_intel.py`)
- `python main.py digest` — 5-minute email digest with risk flagging

### Dashboard
- `python main.py dashboard` — Launch the Sunday Night Dashboard at http://localhost:5050

## File Structure

```
C:\ArtistAgent\
├── .env                    # API keys & config (never commit!)
├── .gitignore
├── config.py               # Loads env vars
├── main.py                 # CLI entry point
├── requirements.txt
├── README.md
├── engines/
│   ├── creative.py         # Engine 1: Inspiration, studio log, artwork docs
│   ├── content.py          # Engine 2: Multi-platform content scripts
│   ├── admin.py            # Engine 3: Events, opportunities, proposals, CRM
│   └── email_intel.py      # Engine 4: Email digest + risk flags
├── utils/
│   ├── ai_client.py        # Ollama (primary) + Claude (fallback) wrapper
│   ├── search_client.py    # Tavily web search wrapper
│   └── google_client.py    # Gmail & Sheets OAuth2 helper
├── dashboard/
│   ├── server.py           # Flask backend
│   └── index.html          # Dashboard UI
├── scripts/
│   └── setup_google.py     # Google OAuth setup wizard
└── data/
    ├── artworks/           # Artwork JSON files
    ├── logs/               # Inspiration entries
    ├── cv/                 # Your CV (add cv.txt here)
    └── crm/                # Contact database
```

## Google Setup (Optional)

To enable Gmail digest with real emails:

```bash
python scripts/setup_google.py
```

This wizard walks you through:
1. Enabling Gmail + Sheets APIs in Google Cloud Console
2. Creating OAuth credentials
3. Authorizing your Google account

## Artist Profile

Edit `.env` to customize:
```
ARTIST_NAME=Sophia
ARTIST_EMAIL=sol.universe.studio@gmail.com
ARTIST_CITY=Honolulu
ARTIST_TIMEZONE=Pacific/Honolulu
```

## Your CV

Add your CV to `data/cv/cv.txt` — the proposal generator uses it to tailor applications.
