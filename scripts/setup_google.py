"""
scripts/setup_google.py — Google OAuth Setup Wizard.

Run: python scripts/setup_google.py

Connects sol.universe.studio@gmail.com to:
  - Gmail (read emails for daily digest)
  - Google Calendar (write event/residency deadlines)
  - Google Sheets (artwork + CRM tracking)
"""
import sys
import json
import webbrowser
from pathlib import Path

# Force utf-8 encoding for Windows terminals
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar",
]


def main():
    print("""
╔══════════════════════════════════════════════════════╗
║   🔐  Google OAuth Setup Wizard — Artist Agent      ║
╚══════════════════════════════════════════════════════╝
""")
    print("This wizard will connect Gmail + Google Sheets to your Agent.\n")

    # Step 1: Check if credentials already exist
    env_path = Path(__file__).parent.parent / ".env"
    env_text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""

    if "GOOGLE_CLIENT_ID=" in env_text:
        lines = env_text.splitlines()
        client_id = ""
        for line in lines:
            if line.startswith("GOOGLE_CLIENT_ID="):
                client_id = line.split("=", 1)[1].strip()
        if client_id:
            print(f"✅  Found existing GOOGLE_CLIENT_ID: {client_id[:20]}...")
            use_existing = input("Use this? (y/n): ").strip().lower()
            if use_existing == "y":
                _do_oauth_flow(env_path, "sophia", "sophiabuhm@gmail.com")
                _do_oauth_flow(env_path, "studio", "sol.universe.studio@gmail.com")
                return

    # Step 2: Guide user to Google Cloud Console
    print("STEP 1: Enable APIs in Google Cloud Console\n")
    print("  I'll open the Google Cloud Console for you.")
    print("  Create a project (or select existing), then enable:")
    print("    • Gmail API")
    print("    • Google Sheets API\n")

    input("Press Enter to open Google Cloud Console...")
    webbrowser.open("https://console.cloud.google.com/apis/library")

    print("\n  After enabling both APIs, continue below.\n")
    input("Press Enter when APIs are enabled...")

    # Step 3: Create OAuth credentials
    print("\nSTEP 2: Create OAuth Credentials\n")
    print("  I'll open the Credentials page.")
    print("  Click '+ CREATE CREDENTIALS' → 'OAuth client ID'")
    print("  Application type: 'Desktop app'")
    print("  Name: 'ArtistAgent'\n")

    input("Press Enter to open Credentials page...")
    webbrowser.open("https://console.cloud.google.com/apis/credentials")

    print("\n  After creating the OAuth client, you'll see:")
    print("    • Client ID")
    print("    • Client Secret\n")

    client_id = input("Paste your Client ID: ").strip()
    client_secret = input("Paste your Client Secret: ").strip()

    if not client_id or not client_secret:
        print("❌  Both Client ID and Client Secret are required.")
        return

    # Write to .env
    _update_env(env_path, "GOOGLE_CLIENT_ID", client_id)
    _update_env(env_path, "GOOGLE_CLIENT_SECRET", client_secret)
    print("\n✅  Credentials saved to .env")

    # Step 4: Run OAuth flow for studio account only
    print("\nSTEP 3: Authorize your studio account\n")
    _do_oauth_flow(env_path, "studio", "sol.universe.studio@gmail.com")
    print("\n🎉  Google OAuth setup complete! Gmail, Sheets, and Calendar are connected.")


def _do_oauth_flow(env_path: Path, account_key: str, account_email: str):
    """Run the OAuth2 consent flow to get a refresh token for the specific account."""
    print(f"  > A browser window will open asking you to sign in.")
    print(f"  > PLEASE SIGN IN WITH: {account_email}\n")
    input("  Press Enter when ready...")

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow

        # Read current .env for credentials
        env_text = env_path.read_text(encoding="utf-8")
        client_id = _get_env_val(env_text, "GOOGLE_CLIENT_ID")
        client_secret = _get_env_val(env_text, "GOOGLE_CLIENT_SECRET")

        if not client_id or not client_secret:
            print("❌  GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env first.")
            return

        # Build flow from client config dict
        client_config = {
            "installed": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost:8080"],
            }
        }

        flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
        creds = flow.run_local_server(port=8080, prompt="consent")

        # Save refresh token to .env
        env_var_name = "GMAIL_REFRESH_TOKEN_SOPHIA" if account_key == "sophia" else "GMAIL_REFRESH_TOKEN_STUDIO"
        if creds.refresh_token:
            _update_env(env_path, env_var_name, creds.refresh_token)
            print(f"\n✅  Refresh token for {account_key} saved to .env!")
        else:
            print(f"\n⚠️  No refresh token received for {account_key}. If needed, revoke app access and run again.")

        # Also save full token for caching
        token_path = Path(__file__).parent.parent / "data" / f"google_token_{account_key}.json"
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json())
        print(f"✅  Token cached at {token_path}\n")

    except ImportError:
        print("❌  Missing package. Run: pip install google-auth-oauthlib")
    except Exception as e:
        print(f"❌  OAuth error: {e}")


def _update_env(env_path: Path, key: str, value: str):
    """Update or add a key=value in the .env file."""
    if not env_path.exists():
        env_path.write_text(f"{key}={value}\n")
        return
    lines = env_path.read_text(encoding="utf-8").splitlines()
    found = False
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}"
            found = True
            break
    if not found:
        lines.append(f"{key}={value}")
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _get_env_val(env_text: str, key: str) -> str:
    for line in env_text.splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return ""


if __name__ == "__main__":
    main()
