# setup-tasks-windows.ps1
# Sol Studio Automation — Windows Task Scheduler Setup (v2.0)
#
# KEY CHANGE: All tasks now use SYSTEM LOCAL TIME, not hardcoded HST.
# When you travel and change Windows timezone (Hawaii → Japan → Korea),
# tasks automatically run at the correct local time.
#
# Usage: powershell -ExecutionPolicy Bypass -File setup-tasks-windows.ps1

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCmd) { $nodeCmd.Source } else { $null }
if (-not $nodePath) { Write-Error "Node.js not found. Install from nodejs.org."; exit 1 }

$scriptDir  = "c:\ArtistAgent\scheduler"
$scriptsDir = "$scriptDir\scripts"

Write-Host "`nSol Studio Task Scheduler Setup (v2.0 - Timezone-Aware)" -ForegroundColor Cyan
Write-Host "Node.js found at: $nodePath"
Write-Host "Script folder:    $scriptDir"
Write-Host ""
Write-Host "!! All tasks use SYSTEM LOCAL TIME. When you travel:" -ForegroundColor Yellow
Write-Host "    Settings -> Time & Language -> Date & Time -> Time zone" -ForegroundColor Yellow
Write-Host ""

function Register-SolTask {
    param(
        [string]$Name,
        [string]$ScriptFile,
        [string]$Arguments = "",
        [object[]]$Triggers,
        [string]$Description = ""
    )

    $action = New-ScheduledTaskAction `
        -Execute $nodePath `
        -Argument "$scriptsDir\$ScriptFile $Arguments".Trim() `
        -WorkingDirectory $scriptDir

    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
        -RestartCount 2 `
        -RestartInterval (New-TimeSpan -Minutes 5) `
        -RunOnlyIfNetworkAvailable `
        -MultipleInstances IgnoreNew

    $principal = New-ScheduledTaskPrincipal `
        -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive `
        -RunLevel Limited

    if (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $Name -Confirm:$false
    }

    Register-ScheduledTask `
        -TaskName   $Name `
        -Action     $action `
        -Trigger    $Triggers `
        -Settings   $settings `
        -Principal  $principal `
        -Description $Description | Out-Null

    Write-Host "  >> Created: $Name"
}

# Helper: Create a repeating trigger every N minutes starting at a given time
function New-RepeatTrigger {
    param([string]$StartAt, [int]$IntervalMinutes, [int]$DurationHours)
    $t = New-ScheduledTaskTrigger -Daily -At $StartAt
    $t.Repetition = New-CimInstance -ClassName MSFT_TaskRepetitionPattern -ClientOnly `
        -Namespace Root/Microsoft/Windows/TaskScheduler `
        -Property @{
            Interval = "PT${IntervalMinutes}M"
            Duration = "PT${DurationHours}H"
        }
    return $t
}

Write-Host "Registering tasks...`n"

# ── 1. Content Assembler — every 30 min, 8 AM – midnight local
#       Handles: "Asset ready" → assemble images → create review package
#                "Rejected"    → redo with Sophia's feedback
$assemblerTrigger = New-RepeatTrigger -StartAt "8:00AM" -IntervalMinutes 30 -DurationHours 16
Register-SolTask `
    -Name        "SolStudio Content Assembler" `
    -ScriptFile  "agent-content-assembler.js" `
    -Triggers    @($assemblerTrigger) `
    -Description "Handles Asset ready + Rejected rows: parse instruction, scan Drive, select images, create review package"

# ── 2. Approve to Schedule — every 30 min, 8 AM – midnight local
#       Handles: "Approved" → "Scheduled"
$approveTrigger = New-RepeatTrigger -StartAt "8:00AM" -IntervalMinutes 30 -DurationHours 16
Register-SolTask `
    -Name        "SolStudio Approve to Schedule" `
    -ScriptFile  "agent-approve-to-schedule.js" `
    -Triggers    @($approveTrigger) `
    -Description "Moves status of Approved rows to Scheduled (they are already queued in Meta API by the assembler)"

# ── 3. Check Posted Status — Every hour, 8 AM – midnight local
$postedCheckTrigger = New-RepeatTrigger -StartAt "8:00AM" -IntervalMinutes 60 -DurationHours 16
Register-SolTask `
    -Name        "SolStudio Check Posted Status" `
    -ScriptFile  "check-posted-status.js" `
    -Triggers    @($postedCheckTrigger) `
    -Description "Hourly: finds Scheduled rows past their date, verifies post is live, marks as Posted"

# ── 5. Archive Published — Every hour (all day, light task)
$archiveTrigger = New-RepeatTrigger -StartAt "12:00AM" -IntervalMinutes 60 -DurationHours 24
Register-SolTask `
    -Name        "SolStudio Archive Published" `
    -ScriptFile  "archive-published.js" `
    -Triggers    @($archiveTrigger) `
    -Description "Moves _Scheduled folders of Posted rows to _Published"

# ── 6. Weekly Report — Every Sunday 8:00 PM local
Register-SolTask `
    -Name        "SolStudio Weekly Report" `
    -ScriptFile  "weekly-report.js" `
    -Triggers    @(New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "8:00PM") `
    -Description "Writes weekly performance stats to Notion"

# ── 7. Refresh Token — Every Sunday 8:00 AM local
Register-SolTask `
    -Name        "SolStudio Refresh Token" `
    -ScriptFile  "refresh-token.js" `
    -Triggers    @(New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "8:00AM") `
    -Description "Refreshes Meta long-lived access token before it expires"

# ── Remove old hardcoded-HST tasks if they exist
foreach ($old in @("SolStudio Post Threads")) {
    if (Get-ScheduledTask -TaskName $old -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $old -Confirm:$false
        Write-Host "  Removed: $old (on hold)"
    }
}

Write-Host "`n`nAll tasks registered. Current status:`n"
Get-ScheduledTask | Where-Object { $_.TaskName -like "SolStudio*" } |
    Select-Object TaskName, State,
        @{N = "NextRun"; E = { (Get-ScheduledTaskInfo $_.TaskName).NextRunTime }} |
    Format-Table -AutoSize

Write-Host "Test commands:"
Write-Host "  node `"$scriptsDir\timezone-helper.js`" --test"
Write-Host "  node `"$scriptsDir\agent-content-assembler.js`" --dry-run"
Write-Host "  node `"$scriptsDir\agent-approve-to-schedule.js`" --dry-run"
Write-Host "  node `"$scriptsDir\check-posted-status.js`" --dry-run"
Write-Host ""
Write-Host "Manual trigger:"
Write-Host "  Start-ScheduledTask -TaskName 'SolStudio Content Assembler'"
Write-Host ""
Write-Host "!! Reminder: When you travel, update your Windows timezone!" -ForegroundColor Yellow
Write-Host "   Settings -> Time & Language -> Date & Time -> Time zone`n" -ForegroundColor Yellow
