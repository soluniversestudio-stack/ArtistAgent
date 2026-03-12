"""
utils/google_client.py — Gmail & Google Sheets OAuth2 helpers.

Setup: Run `python scripts/setup_google.py` first to get your refresh token,
then paste the values into .env.
"""
import json
from pathlib import Path
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from config import cfg

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar",
]

TOKEN_PATH = cfg.BASE_DIR / "data" / "google_token_studio.json"


def _get_credentials() -> Credentials:
    """Build OAuth2 credentials for sol.universe.studio@gmail.com."""
    token_path = TOKEN_PATH
    creds = None

    # Try cached token first
    if token_path.exists():
        info = json.loads(token_path.read_text())
        creds = Credentials.from_authorized_user_info(info, SCOPES)

    # If no cached token, build from .env refresh token
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            refresh_token = cfg.GMAIL_REFRESH_TOKEN_STUDIO
            if refresh_token and cfg.GOOGLE_CLIENT_ID:
                creds = Credentials(
                    token=None,
                    refresh_token=refresh_token,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=cfg.GOOGLE_CLIENT_ID,
                    client_secret=cfg.GOOGLE_CLIENT_SECRET,
                    scopes=SCOPES,
                )
                creds.refresh(Request())
            else:
                raise RuntimeError(
                    "Google OAuth not configured. Run: py scripts/setup_google.py"
                )

        # Cache for next time
        if creds:
            token_path.parent.mkdir(parents=True, exist_ok=True)
            token_path.write_text(creds.to_json())

    return creds


def get_gmail_service():
    """Return an authorized Gmail API service object for sol.universe.studio@gmail.com."""
    creds = _get_credentials()
    return build("gmail", "v1", credentials=creds)


def get_sheets_service():
    """Return an authorized Google Sheets API service object."""
    creds = _get_credentials()
    return build("sheets", "v4", credentials=creds)

def get_calendar_service():
    """Return an authorized Google Calendar API service object."""
    creds = _get_credentials()
    return build("calendar", "v3", credentials=creds)
