# launchd Cron Setup for Sol Studio Automation
# macOS uses `launchd` (not cron) for scheduled jobs. This guide provides
# a .plist file for each job and the exact terminal commands to install them.

---

## Prerequisites

```bash
# Install Node.js (if not already installed)
brew install node

# Verify
node --version
npm --version
```

---

## Job 1 — post-to-instagram (Daily 09:00 HST = 19:00 UTC)

### File: `~/Library/LaunchAgents/com.solstudio.post-instagram.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.solstudio.post-instagram</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/sophi/Google Drive/Sophia Sol Studio/scheduler/scripts/post-to-instagram.js</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/scheduler</string>

  <!-- Run daily at 19:00 UTC (09:00 HST) -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>19</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/00_Report/instagram.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/00_Report/instagram-error.log</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
```

### Install:
```bash
cp ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/plists/com.solstudio.post-instagram.plist \
   ~/Library/LaunchAgents/

launchctl load ~/Library/LaunchAgents/com.solstudio.post-instagram.plist
```

---

## Job 2 — post-to-threads (Daily 09:15 HST = 19:15 UTC)

### File: `~/Library/LaunchAgents/com.solstudio.post-threads.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.solstudio.post-threads</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/sophi/Google Drive/Sophia Sol Studio/scheduler/scripts/post-to-threads.js</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/scheduler</string>

  <!-- Run daily at 19:15 UTC (09:15 HST) -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>19</integer>
    <key>Minute</key>
    <integer>15</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/00_Report/threads.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/00_Report/threads-error.log</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
```

### Install:
```bash
cp ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/plists/com.solstudio.post-threads.plist \
   ~/Library/LaunchAgents/

launchctl load ~/Library/LaunchAgents/com.solstudio.post-threads.plist
```

---

## Job 3 — refresh-token (Every Sunday 08:00 HST = 18:00 UTC)

### File: `~/Library/LaunchAgents/com.solstudio.refresh-token.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.solstudio.refresh-token</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/sophi/Google Drive/Sophia Sol Studio/scheduler/scripts/refresh-token.js</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/scheduler</string>

  <!-- Every Sunday (Weekday 0) at 18:00 UTC (08:00 HST) -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>0</integer>
    <key>Hour</key>
    <integer>18</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/00_Report/refresh-token.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/00_Report/refresh-token-error.log</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
```

### Install:
```bash
cp ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/plists/com.solstudio.refresh-token.plist \
   ~/Library/LaunchAgents/

launchctl load ~/Library/LaunchAgents/com.solstudio.refresh-token.plist
```

---

## Job 4 — weekly-report (Every Monday 06:00 UTC = Sunday 20:00 HST)

### File: `~/Library/LaunchAgents/com.solstudio.weekly-report.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.solstudio.weekly-report</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/sophi/Google Drive/Sophia Sol Studio/scheduler/scripts/weekly-report.js</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/scheduler</string>

  <!-- Every Monday at 06:00 UTC (Sunday 20:00 HST) -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>1</integer>
    <key>Hour</key>
    <integer>6</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/00_Report/weekly-report.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/00_Report/weekly-report-error.log</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
```

### Install:
```bash
cp ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/plists/com.solstudio.weekly-report.plist \
   ~/Library/LaunchAgents/

launchctl load ~/Library/LaunchAgents/com.solstudio.weekly-report.plist
```

---

## Job 5 — archive-published (File watcher fallback — manual trigger)

> ⚠️ The archive-published job is primarily triggered by Antigravity's file watcher.
> The launchd plist below is a **fallback** that runs it hourly to catch
> any files the watcher may have missed (e.g. if Antigravity was offline).

### File: `~/Library/LaunchAgents/com.solstudio.archive-published.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.solstudio.archive-published</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/sophi/Google Drive/Sophia Sol Studio/scheduler/scripts/archive-published.js</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/scheduler</string>

  <!-- Runs every hour as a safety net sweep -->
  <key>StartInterval</key>
  <integer>3600</integer>

  <key>StandardOutPath</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/00_Report/archive-published.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/sophi/Google Drive/Sophia Sol Studio/00_Report/archive-published-error.log</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
```

### Install:
```bash
cp ~/Google\ Drive/Sophia\ Sol\ Studio/scheduler/plists/com.solstudio.archive-published.plist \
   ~/Library/LaunchAgents/

launchctl load ~/Library/LaunchAgents/com.solstudio.archive-published.plist
```

---

## Managing All Jobs

```bash
# ── Check all Sol Studio jobs are loaded ──────────────────────────────
launchctl list | grep solstudio

# ── Unload a job (disable it) ─────────────────────────────────────────
launchctl unload ~/Library/LaunchAgents/com.solstudio.weekly-report.plist

# ── Reload after editing a plist ─────────────────────────────────────
launchctl unload ~/Library/LaunchAgents/com.solstudio.weekly-report.plist
launchctl load   ~/Library/LaunchAgents/com.solstudio.weekly-report.plist

# ── Manually trigger a job right now (for testing) ───────────────────
launchctl start com.solstudio.weekly-report

# ── Check last exit code (0 = success) ───────────────────────────────
launchctl list com.solstudio.weekly-report
```

> **Note on node path:** If you installed Node via nvm or Homebrew M1 (Apple Silicon),
> the node binary may be at `/opt/homebrew/bin/node` instead of `/usr/local/bin/node`.
> Run `which node` in Terminal and update the plist `ProgramArguments` accordingly.

```bash
# Find your node path:
which node
# e.g. /opt/homebrew/bin/node  ← use this in your plists if so
```
