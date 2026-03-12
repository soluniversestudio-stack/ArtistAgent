"""
engines/email_intel.py — Engine 4: Email & Task Intelligence
- Daily 5-minute digest (Act Today / This Week / Waiting / Archive)
- Keyword risk flagging (Invoice, Due, Contract, Deadline)
NOTE: Gmail requires Google OAuth setup first. Run: python scripts/setup_google.py
"""
import json
import re
from datetime import datetime
from config import cfg
from utils.ai_client import ask_ai

RISK_KEYWORDS = [
    "invoice", "due", "contract", "deadline", "overdue", "payment",
    "urgent", "final notice", "expires", "renewal", "legal",
]

BUCKETS = ["Act Today", "Act This Week", "Waiting", "Archive"]


def get_daily_digest(limit: int = 30) -> dict:
    """Fetch recent emails, classify, flag risks, return digest."""
    emails = _fetch_emails(limit)
    if not emails:
        return {"error": "No emails fetched. Check Gmail connection in .env"}
    classified = _classify_emails(emails)
    risk_items = _flag_risks(emails)
    digest = {
        "generated_at": datetime.now().isoformat(),
        "total_emails": len(emails),
        "classified": classified,
        "risk_flags": risk_items,
        "summary": _generate_summary(classified, risk_items),
    }
    # Save digest
    from pathlib import Path
    digest_path = cfg.DATA_DIR / "digests" / f"digest_{datetime.now().strftime('%Y%m%d')}.json"
    digest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(digest_path, "w") as f:
        json.dump(digest, f, indent=2)
    return digest


def _fetch_emails(limit: int) -> list[dict]:
    """Fetch emails via Gmail API. Returns mock data if not configured."""
    if not cfg.GMAIL_REFRESH_TOKEN:
        print("⚠️  Gmail not configured yet. Returning demo emails.")
        return _demo_emails()
    try:
        from utils.google_client import get_gmail_service
        service = get_gmail_service()
        results = service.users().messages().list(userId="me", maxResults=limit).execute()
        messages = results.get("messages", [])
        emails = []
        for msg in messages[:limit]:
            detail = service.users().messages().get(
                userId="me", id=msg["id"], format="metadata",
                metadataHeaders=["From", "Subject", "Date"]
            ).execute()
            headers = {h["name"]: h["value"] for h in detail.get("payload", {}).get("headers", [])}
            snippet = detail.get("snippet", "")
            emails.append({
                "id": msg["id"],
                "from": headers.get("From", ""),
                "subject": headers.get("Subject", ""),
                "date": headers.get("Date", ""),
                "snippet": snippet,
            })
        return emails
    except Exception as e:
        print(f"⚠️  Gmail error: {e}. Using demo data.")
        return _demo_emails()


def _classify_emails(emails: list[dict]) -> dict:
    """Use AI to classify emails into the 4 buckets."""
    email_list = "\n".join(
        [f"- From: {e['from']} | Subject: {e['subject']} | Preview: {e['snippet'][:100]}"
         for e in emails]
    )
    prompt = f"""You are {cfg.ARTIST_NAME}'s executive assistant. Classify each email into EXACTLY one bucket:

ACT TODAY: Requires response or action within 24 hours
ACT THIS WEEK: Requires response or action within 7 days  
WAITING: Sent something, waiting for reply or delivery info
ARCHIVE: FYI only, newsletters, receipts, no action needed

Respond in this exact format for each email:
[BUCKET] — From: [sender name] — Subject: [subject] — Action: [1-sentence recommended action]

Emails to classify:
{email_list}"""

    classified_text = ask_ai(prompt, max_tokens=1200)
    result = {b: [] for b in BUCKETS}
    for line in classified_text.splitlines():
        for bucket in BUCKETS:
            if line.strip().startswith(f"[{bucket}]"):
                result[bucket].append(line.strip())
                break
    return result


def _flag_risks(emails: list[dict]) -> list[dict]:
    """Flag emails containing high-risk keywords."""
    flagged = []
    for e in emails:
        text = f"{e['subject']} {e['snippet']}".lower()
        matched = [kw for kw in RISK_KEYWORDS if kw in text]
        if matched:
            flagged.append({
                "from": e["from"],
                "subject": e["subject"],
                "risk_keywords": matched,
                "priority": "HIGH" if any(k in ["invoice", "contract", "legal", "overdue"] for k in matched) else "MEDIUM",
            })
    return flagged


def _generate_summary(classified: dict, risks: list) -> str:
    """Generate a 5-minute digest summary."""
    act_today = classified.get("Act Today", [])
    risk_text = "\n".join([f"⚠️ {r['subject']} ({', '.join(r['risk_keywords'])})" for r in risks])

    prompt = f"""Write a 5-bullet executive email digest for {cfg.ARTIST_NAME}.

ACT TODAY ({len(act_today)} emails):
{chr(10).join(act_today[:5])}

RISK FLAGS:
{risk_text or "None"}

Write 5 crisp bullet points: the most important items from Act Today + any risk flags.
Max 2 sentences per bullet. Start each with an emoji (🔴 urgent, 🟡 this week, ✅ done)."""

    return ask_ai(prompt, max_tokens=500)


def _demo_emails() -> list[dict]:
    """Demo emails for testing without Gmail."""
    return [
        {"id": "1", "from": "gallery@example.com", "subject": "Invoice #1042 Due Friday",
         "date": datetime.now().isoformat(), "snippet": "Please find attached invoice for your review. Due date is this Friday."},
        {"id": "2", "from": "residency@program.org", "subject": "Application Deadline Reminder",
         "date": datetime.now().isoformat(), "snippet": "Your application deadline is March 15. Please submit all materials."},
        {"id": "3", "from": "curator@museum.org", "subject": "Following up on our meeting",
         "date": datetime.now().isoformat(), "snippet": "Hi Sophia, great meeting you at the opening. Would love to see more work."},
        {"id": "4", "from": "noreply@newsletter.com", "subject": "Weekly Art News",
         "date": datetime.now().isoformat(), "snippet": "This week in contemporary art..."},
        {"id": "5", "from": "collector@private.com", "subject": "Contract for Artwork Purchase",
         "date": datetime.now().isoformat(), "snippet": "Please review and sign the attached purchase contract at your earliest convenience."},
    ]
