# Sol Studio Automation — README
**Antigravity Scheduler + Notion Integration**
*Version 1.0 — Sophia Sol / Sol Studio*

---

## What This System Does

This is a local task scheduler that runs on your Mac and automates:

| Job | Trigger | What it does |
|-----|---------|--------------|
| `post-to-instagram.js` | File drop OR 9:00 AM HST daily | Posts Approved content to Instagram |
| `post-to-threads.js` | File drop OR 9:15 AM HST daily | Posts Approved content to Threads |
| `refresh-token.js` | Every Sunday 8:00 AM HST | Refreshes your FB access token |
| `weekly-report.js` | Every Sunday 8:00 PM HST | Writes weekly stats to Notion + Calendar |
| `archive-published.js` | File drop (Status=Posted) | Moves files to `_Published/YYYY-MM/` |

Every job:
- Logs all actions to `~/Google Drive/Sophia Sol Studio/00_Report/antigravity.log`
- Creates a Notion Calendar event after successful completion
- Writes an error page to Notion Weekly Reports if it fails

---

## Installation — Step by Step

### Step 0: Prerequisites

```bash
# macOS — install Homebrew if you don't have it:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js:
brew install node

# Verify:
node --version   # should be v18+
npm --version
```

### Step 1: Place the Scheduler Folder on Your Mac

Copy the `scheduler/` folder to:
```
~/Google Drive/Sophia Sol Studio/scheduler/
```

Your final structure:
```
~/Google Drive/Sophia Sol Studio/
├── 00_Report/                  ← log files go here (auto-created)
├── 08_Contents/
│   ├── Ready to Post/          ← Antigravity watches this
│   └── _Published/             ← archive-published.js writes here
└── scheduler/
    ├── .env                    ← YOUR SECRETS (never commit!)
    ├── .env.template           ← safe template (committed)
    ├── .gitignore
    ├── antigravity-config.json
    ├── launchd-cron-setup.md
    ├── scripts/
    │   ├── post-to-instagram.js
    │   ├── post-to-threads.js
    │   ├── refresh-token.js
    │   ├── weekly-report.js
    │   └── archive-published.js
    └── plists/                 ← launchd plist files
        ├── com.solstudio.post-instagram.plist
        ├── com.solstudio.post-threads.plist
        ├── com.solstudio.refresh-token.plist
        ├── com.solstudio.weekly-report.plist
        └── com.solstudio.archive-published.plist
```

### Step 2: Create and Secure Your `.env` File

```bash
cd ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/

# Copy the template
cp .env.template .env

# Lock it down — CRITICAL!
chmod 600 .env

# Verify permissions (should show: -rw-------)
ls -la .env
```

Now open `.env` in a text editor and fill in every value.
See the [Environment Variables Reference](#environment-variables-reference) section below.

### Step 3: Install Node Dependencies

```bash
cd ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/
npm install dotenv
```

> **Note:** All scripts use only Node.js built-ins (`https`, `fs`, `path`) plus
> `dotenv`. No heavy frameworks needed.

### Step 4: Install launchd Plist Files

```bash
# Copy all plists to LaunchAgents
cp ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/plists/*.plist ~/Library/LaunchAgents/

# Load each one
launchctl load ~/Library/LaunchAgents/com.solstudio.post-instagram.plist
launchctl load ~/Library/LaunchAgents/com.solstudio.post-threads.plist
launchctl load ~/Library/LaunchAgents/com.solstudio.refresh-token.plist
launchctl load ~/Library/LaunchAgents/com.solstudio.weekly-report.plist
launchctl load ~/Library/LaunchAgents/com.solstudio.archive-published.plist
```

### Step 5: Configure Antigravity

Point Antigravity to the config:
```bash
# In Antigravity settings (or however you launch it):
antigravity --config ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/antigravity-config.json
```

---

## Testing Each Job Manually

Every script supports `--dry-run` — **always test this first!**

```bash
cd ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/

# Weekly Report — dry run (safe, prints what it would do)
node scripts/weekly-report.js --dry-run

# Archive Published — dry run (no files moved, no Notion writes)
node scripts/archive-published.js --dry-run

# Archive a specific file — dry run
node scripts/archive-published.js --dry-run --filename "my-painting.jpg"

# Instagram — dry run
node scripts/post-to-instagram.js --dry-run

# Threads — dry run
node scripts/post-to-threads.js --dry-run

# Token refresh — dry run
node scripts/refresh-token.js --dry-run
```

**Live test (writes to Notion):**
```bash
node scripts/weekly-report.js
node scripts/archive-published.js
```

---

## Verifying the System Is Running

### Check that launchd jobs are loaded:
```bash
launchctl list | grep solstudio
```
Expected output (one line per job, exit code 0 = OK):
```
-    0    com.solstudio.archive-published
-    0    com.solstudio.weekly-report
-    0    com.solstudio.refresh-token
-    0    com.solstudio.post-threads
-    0    com.solstudio.post-instagram
```

### Watch the live log:
```bash
tail -f ~/Google\ Drive/Sophia\ Sol\ Studio/00_Report/antigravity.log
```

### Manually trigger a job to test it:
```bash
launchctl start com.solstudio.weekly-report
```

### Check the last run result of a specific job:
```bash
launchctl list com.solstudio.weekly-report
# Look for "LastExitStatus" = 0 (success) or non-zero (error)
```

### Verify Antigravity is watching the right folder:
```bash
# In Antigravity's UI or logs/config, confirm:
# Watch path: ~/Google Drive/Sophia Sol Studio/08_Contents/Ready to Post/
# Config: ~/Google Drive/Sophia Sol Studio/scheduler/antigravity-config.json
```

---

## Environment Variables Reference

Fill in `scheduler/.env`:

| Variable | Value |
|----------|-------|
| `FB_ACCESS_TOKEN` | Your Facebook long-lived access token |
| `THREADS_ACCESS_TOKEN` | Your Threads API token |
| `IG_USER_ID` | `17841444855543301` (already set) |
| `THREADS_USER_ID` | `25478464395162435` (already set) |
| `TOKEN_EXPIRY_DATE` | Date your FB token expires (YYYY-MM-DD) |
| `NOTION_API_KEY` | From notion.so/my-integrations |
| `NOTION_CONTENT_DB_ID` | `359039a67fc342a4a3c64a356541132b` |
| `NOTION_PERFORMANCE_DB_ID` | Create a Performance DB, paste its ID |
| `NOTION_WEEKLY_REPORTS_DB_ID` | From the URL of your Weekly Reports DB page |
| `NOTION_CALENDAR_DB_ID` | The Notion Calendar linked database ID |
| `GOOGLE_DRIVE_ROOT` | `~/Google Drive/Sophia Sol Studio` |
| `READY_TO_POST_PATH` | `~/Google Drive/Sophia Sol Studio/08_Contents/Ready to Post` |
| `PUBLISHED_PATH` | `~/Google Drive/Sophia Sol Studio/08_Contents/_Published` |
| `LOG_FILE` | `~/Google Drive/Sophia Sol Studio/00_Report/antigravity.log` |

**How to get the Notion Calendar DB ID:**
1. Open Notion Calendar
2. Go to Settings → Connected Databases
3. Copy the database ID from the linked Notion page URL

---

## When Your FB Token Expires

1. The `refresh-token.js` job runs every Sunday automatically
2. If it's urgent, run manually:
   ```bash
   node scripts/refresh-token.js --dry-run   # check current status
   node scripts/refresh-token.js             # refresh now
   ```
3. After refresh, the script saves the new token to `.env` automatically
4. Verify:
   ```bash
   grep TOKEN_EXPIRY_DATE ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/.env
   ```
5. If the token is already expired (not just near expiry), you must re-authorize
   in Meta Business Suite and paste the new token manually into `.env`

---

## macOS Permissions Required

macOS will ask for these permissions when scripts first run. Grant them in:
**System Settings → Privacy & Security**

| Permission | Why It's Needed |
|-----------|----------------|
| **Full Disk Access** | To read/write files in Google Drive |
| **Files and Folders → Google Drive** | For Antigravity and Node scripts to access the folder |
| **Network (automatic)** | For Notion API calls and Meta API calls |
| **Automation** | If any script uses AppleScript |

**To grant Full Disk Access to Terminal:**
1. System Settings → Privacy & Security → Full Disk Access
2. Click `+` → navigate to `/Applications/Utilities/Terminal.app`
3. Toggle ON

> You may also need to grant access to the specific `node` binary.
> System Settings → Privacy & Security → Full Disk Access → add `/usr/local/bin/node`
> (or `/opt/homebrew/bin/node` on Apple Silicon)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Missing required .env variable: NOTION_API_KEY` | Fill in your `.env` file |
| `Notion API: Could not find database` | Share the Notion DB with your integration |
| Script runs but nothing posts | Check `Status` field in Notion — must be "Approved" |
| launchd job not triggering | Run `launchctl list com.solstudio.JOB-NAME` — check exit code |
| Files not being archived | Check Notion Status is exactly "Posted" (case-sensitive) |
| Google Drive files not found | Grant Full Disk Access to Terminal + node |
| Error page in Notion Weekly Reports | Check error message in Notion, check log file |

---

## Quick Reference Commands

```bash
# Watch live log
tail -f ~/Google\ Drive/Sophia\ Sol\ Studio/00_Report/antigravity.log

# Check all Sol Studio launchd jobs
launchctl list | grep solstudio

# Test weekly report safely
node ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/scripts/weekly-report.js --dry-run

# Test archive safely
node ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/scripts/archive-published.js --dry-run

# Force-run weekly report NOW
launchctl start com.solstudio.weekly-report

# Reload a plist after editing
launchctl unload ~/Library/LaunchAgents/com.solstudio.weekly-report.plist
launchctl load   ~/Library/LaunchAgents/com.solstudio.weekly-report.plist
```
