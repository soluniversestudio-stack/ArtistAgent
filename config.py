import os
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

class Config:
    # AI Backend: "ollama" (free, local), "anthropic" (paid API), or "auto" (try ollama first)
    AI_BACKEND: str        = os.getenv("AI_BACKEND", "auto")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str    = os.getenv("OPENAI_API_KEY", "")
    AI_MODEL: str          = os.getenv("AI_MODEL", "claude-haiku-4-5")

    # Ollama (local, free — https://ollama.com)
    OLLAMA_HOST: str       = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    OLLAMA_MODEL: str      = os.getenv("OLLAMA_MODEL", "llama3.1")

    # Search
    TAVILY_API_KEY: str    = os.getenv("TAVILY_API_KEY", "")

    # Google
    GOOGLE_CLIENT_ID: str     = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str  = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8080")
    GMAIL_REFRESH_TOKEN_STUDIO: str = os.getenv("GMAIL_REFRESH_TOKEN_STUDIO", "")
    SHEETS_ARTWORK_ID: str    = os.getenv("GOOGLE_SHEETS_ARTWORK_ID", "")
    SHEETS_CRM_ID: str        = os.getenv("GOOGLE_SHEETS_CRM_ID", "")

    # Notion — all 8 databases
    NOTION_TOKEN: str                  = os.getenv("NOTION_TOKEN", "")
    NOTION_ARTWORKS_DB_ID: str         = os.getenv("NOTION_ARTWORKS_DB_ID", "")
    NOTION_STUDIO_LOGS_DB_ID: str      = os.getenv("NOTION_STUDIO_LOGS_DB_ID", "")
    NOTION_CONTENT_CALENDAR_DB_ID: str = os.getenv("NOTION_CONTENT_CALENDAR_DB_ID", "")
    NOTION_RESIDENCY_DB_ID: str        = os.getenv("NOTION_RESIDENCY_DB_ID", "")
    NOTION_OPENCALLS_DB_ID: str        = os.getenv("NOTION_OPENCALLS_DB_ID", "")
    NOTION_EVENTS_DB_ID: str           = os.getenv("NOTION_EVENTS_DB_ID", "")
    NOTION_CONTACTS_DB_ID: str         = os.getenv("NOTION_CONTACTS_DB_ID", "")
    NOTION_OPERATIONS_DB_ID: str       = os.getenv("NOTION_OPERATIONS_DB_ID", "")
    NOTION_PROJECTS_DB_ID: str         = os.getenv("NOTION_PROJECTS_DB_ID", "")

    # Artist profile
    ARTIST_NAME: str     = os.getenv("ARTIST_NAME", "Sophia")
    ARTIST_EMAIL: str    = os.getenv("ARTIST_EMAIL", "")
    ARTIST_CITY: str     = os.getenv("ARTIST_CITY", "Honolulu")
    ARTIST_TIMEZONE: str = os.getenv("ARTIST_TIMEZONE", "Pacific/Honolulu")

    # Server
    DASHBOARD_PORT: int  = int(os.getenv("DASHBOARD_PORT", "5050"))

    # Paths
    BASE_DIR: Path       = Path(__file__).parent
    DATA_DIR: Path       = Path(r"C:\Users\sophi\Documents\Sophia Sol Studio 2026")
    ARTWORKS_DIR: Path   = DATA_DIR / "02_Project"
    CV_DIR: Path         = DATA_DIR / "03_Professional"
    LOGS_DIR: Path       = BASE_DIR / "data" / "logs"
    CRM_DIR: Path        = BASE_DIR / "data" / "crm"

cfg = Config()

# Ensure agent data directories exist
for d in [cfg.LOGS_DIR, cfg.CRM_DIR]:
    d.mkdir(parents=True, exist_ok=True)
