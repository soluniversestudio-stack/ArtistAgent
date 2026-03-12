"""
main.py — Artist Intelligence Agent Entry Point
Run: python main.py [command]
"""
import click
import sys
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

# Force UTF-8 for Windows terminals so emojis print without crashing
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

console = Console()


@click.group()
def cli():
    """🎨 Artist Intelligence Agent — Command Center"""
    pass


# ── Engine 1: Creative ───────────────────────────────────────────────────────

@cli.command()
def capture():
    """Phase A: Log a new inspiration (location, tone, theme)."""
    from engines.creative import capture_inspiration
    capture_inspiration()


@cli.command()
@click.argument("artwork_id", default="")
def log(artwork_id):
    """Phase B: Add a studio daily log entry."""
    from engines.creative import add_studio_log
    add_studio_log(artwork_id)


@cli.command()
@click.argument("artwork_id", default="")
def document(artwork_id):
    """Phase C: Document completed artwork assets."""
    from engines.creative import document_artwork
    document_artwork(artwork_id)


@cli.command()
def artworks():
    """List all artworks in the database."""
    from engines.creative import list_artworks
    items = list_artworks()
    if not items:
        console.print("[yellow]No artworks yet. Run: python main.py log[/yellow]")
        return
    table = Table(title="🖼️  Artwork Database", show_lines=True)
    table.add_column("ID", style="dim")
    table.add_column("Title")
    table.add_column("Medium")
    table.add_column("Year")
    table.add_column("Price")
    for a in items:
        table.add_row(a.get("id",""), a.get("title","Untitled"), a.get("medium",""), str(a.get("year","")), a.get("price_usd",""))
    console.print(table)


# ── Engine 2: Content ────────────────────────────────────────────────────────

@cli.command()
@click.argument("artwork_id")
def scripts(artwork_id):
    """Generate all platform scripts for an artwork."""
    from engines.content import generate_scripts, generate_content_calendar
    from datetime import datetime
    console.print(f"\n[bold cyan]Generating scripts for {artwork_id}...[/bold cyan]")
    generate_scripts(artwork_id)
    cal = generate_content_calendar(artwork_id, datetime.now())
    console.print("\n[bold]📅 Content Calendar:[/bold]")
    for item in cal:
        console.print(f"  • {item['date']} — {item['type'].upper()} post")


# ── Engine 3: Admin ──────────────────────────────────────────────────────────

@cli.command()
@click.option("--city", default=None, help="Override current city")
def events(city):
    """Monday scan: top 5 networking events in your city."""
    from engines.admin import scan_events
    scan_events(city)


@cli.command()
def opportunities():
    """Scan and rank residency/grant opportunities in APAC."""
    from engines.admin import scan_opportunities
    scan_opportunities()


@cli.command()
@click.option("--city", default=None, help="Override current city")
def sync(city):
    """Weekly auto-sync: scan events + residencies → push to Notion + Google Calendar."""
    from engines.sync import full_weekly_sync
    console.print("\n[bold magenta]🔄 Starting weekly auto-sync...[/bold magenta]")
    result = full_weekly_sync(city)
    console.print(f"\n[bold green]✅ Sync complete![/bold green]")
    console.print(f"   Events pushed to Notion: {result['events_pushed_to_notion']}")
    console.print(f"   Residencies pushed to Notion & Calendar: {result['residencies_pushed_to_notion']}")


@cli.command()
@click.argument("opportunity_name")
@click.argument("description")
def propose(opportunity_name, description):
    """Generate a tailored proposal for a residency/grant."""
    from engines.admin import generate_proposal
    proposal = generate_proposal(opportunity_name, description)
    console.print(Panel(proposal, title=f"📄 Proposal: {opportunity_name}", border_style="green"))


@cli.command()
def followups():
    """Show all CRM contacts with follow-ups due."""
    from engines.admin import get_followups_due, generate_followup_email
    due = get_followups_due()
    if not due:
        console.print("[green]✅ No follow-ups due![/green]")
        return
    console.print(f"\n[bold red]{len(due)} follow-up(s) overdue:[/bold red]")
    for c in due:
        console.print(f"\n📧 {c['name']} ({c['role']}, {c['institution']})")
        console.print(f"   Last contact: {c['last_contact'][:10]}")
        if click.confirm(f"   Draft email for {c['name']}?"):
            email = generate_followup_email(c)
            console.print(Panel(email, title=f"Draft: {c['name']}", border_style="blue"))


# ── Notion Sync Commands ─────────────────────────────────────────────────────

@cli.command()
def notion_status():
    """Check connection status for all 6 Notion databases."""
    from utils.notion_client import check_all_databases
    console.print("\n[bold cyan]🔍 Checking Notion Connections...[/bold cyan]")
    results = check_all_databases()
    for res in results:
        if res["status"] == "ok":
            console.print(f"   [green]✅ {res['label']} DB[/green]")
        elif res["status"] == "missing":
            console.print(f"   [yellow]⚠️  {res['label']} DB[/yellow] — ID not set in .env")
        else:
            console.print(f"   [red]❌ {res['label']} DB[/red] — {res['error']}")
    console.print("\n[dim]Run 'python main.py notion-setup' if you need help sharing databases.[/dim]")


@cli.command()
def notion_setup():
    """Print instructions for sharing Notion databases with the agent."""
    console.print("\n[bold magenta]🛠️  Notion Setup Guide[/bold magenta]")
    console.print("1. Go to your Notion workspace in the browser.")
    console.print("2. Open the specific Database page (e.g. Artworks).")
    console.print("3. Click the [bold]... (three dots)[/bold] in the top right corner.")
    console.print("4. Click [bold]Connections[/bold] -> [bold]Connect to...[/bold]")
    console.print("5. Search for your integration name and select it.")
    console.print("6. Repeat for all 6 databases:\n   - Artworks\n   - Studio Logs\n   - Content Calendar\n   - Opportunities\n   - Events\n   - Contacts")
    console.print("\n[dim]Run 'python main.py notion-status' to verify.[/dim]")


@cli.command()
def notion_push():
    """Force push all local data (artworks, logs, contacts) to Notion."""
    from engines.creative import list_artworks
    from engines.admin import _load_crm
    from engines.notion_sync import push_artwork, push_studio_log, push_content_task, push_contact
    import json
    from config import cfg
    
    console.print("\n[bold cyan]📤 Pushing local data to Notion...[/bold cyan]")
    
    # Push Artworks & Studio Logs
    artworks = list_artworks()
    for art in artworks:
        art_title = art.get("title", art.get("id"))
        push_artwork(art)
        for log in art.get("studio_log", []):
            push_studio_log(art_title, log)
            
        # Push Content Tasks for this artwork
        cal_path = cfg.DATA_DIR / "content" / f"{art.get('id')}_calendar.json"
        if cal_path.exists():
            try:
                tasks = json.loads(cal_path.read_text())
                for task in tasks:
                    push_content_task(art_title, task)
            except: pass
            
    # Push Contacts
    contacts = _load_crm()
    for contact in contacts:
        push_contact(contact)
        
    console.print("[bold green]\n✅ Full push complete![/bold green]")
    
@cli.command()
def notion_pull():
    """Pull updates from Notion back to local (e.g. Content published status, CRM notes)."""
    # Placeholder for future extraction
    console.print("\n[bold yellow]🚧 Pull functionality coming soon![/bold yellow]")
    console.print("Currently sync is prioritized as one-way (Agent -> Notion).")


# ── Engine 4: Email ──────────────────────────────────────────────────────────

@cli.command()
def digest():
    """Generate today's 5-minute email digest."""
    from engines.email_intel import get_daily_digest
    console.print("\n[bold cyan]📬 Building email digest...[/bold cyan]")
    result = get_daily_digest()
    if "error" in result:
        console.print(f"[red]{result['error']}[/red]")
        return
    console.print(Panel(result.get("summary", ""), title="📬 Daily Email Digest", border_style="cyan"))
    risks = result.get("risk_flags", [])
    if risks:
        console.print(f"\n[bold red]⚠️  {len(risks)} Risk Flag(s):[/bold red]")
        for r in risks:
            console.print(f"  🔴 {r['subject']} — Keywords: {', '.join(r['risk_keywords'])}")


# ── Dashboard ────────────────────────────────────────────────────────────────

@cli.command()
def dashboard():
    """Launch the Sunday Night Command Dashboard in your browser."""
    import webbrowser, threading, time
    from config import cfg
    from dashboard.server import app
    port = cfg.DASHBOARD_PORT
    def open_browser():
        time.sleep(1.5)
        webbrowser.open(f"http://localhost:{port}")
    threading.Thread(target=open_browser, daemon=True).start()
    console.print(f"\n[bold green]🚀 Dashboard running at http://localhost:{port}[/bold green]")
    app.run(port=port, debug=False)


# ── Engine 5: Projects Agent (Studio Memory & Funnel Structuring) ────────────

@cli.command()
def projects_normalize():
    """Normalize all Projects 2026-2030: fill missing fields, enforce review dates."""
    from engines.projects_agent import normalize_all_projects, enforce_review_dates
    console.print("\n[bold cyan]🔧 Normalizing Projects 2026–2030...[/bold cyan]")
    result = normalize_all_projects()
    console.print(f"\n   Total projects scanned: {result['total_projects']}")
    console.print(f"   Projects updated: {result['projects_updated']}")
    if result["changes"]:
        for ch in result["changes"]:
            console.print(f"\n   [bold]{ch['project']}[/bold]")
            for fix in ch["fixes"]:
                console.print(f"      • {fix}")

    console.print("\n[bold cyan]📅 Enforcing review dates for Active projects...[/bold cyan]")
    updated = enforce_review_dates()
    if updated:
        for name in updated:
            console.print(f"   ✅ {name}")
    else:
        console.print("   All Active projects already have valid review dates.")
    console.print("\n[bold green]✅ Normalization complete![/bold green]")


@cli.command()
def projects_report():
    """Generate weekly Studio Ops Report from active/due projects."""
    from engines.projects_agent import generate_ops_report, format_ops_report_text
    console.print("\n[bold cyan]📋 Generating Studio Ops Report...[/bold cyan]\n")
    report = generate_ops_report()
    text = format_ops_report_text(report)
    console.print(Panel(text, title="📋 Studio Ops Report", border_style="magenta", expand=True))

    # Also save to file
    from config import cfg
    from datetime import datetime
    report_path = cfg.BASE_DIR / "data" / "reports"
    report_path.mkdir(parents=True, exist_ok=True)
    filename = report_path / f"ops_report_{datetime.now().strftime('%Y%m%d')}.txt"
    filename.write_text(text, encoding="utf-8")
    console.print(f"\n[dim]Saved to: {filename}[/dim]")


@cli.command()
@click.argument("name")
@click.option("--role", default="Both", type=click.Choice(["Sophia", "Sol", "Both"]))
@click.option("--type", "proj_type", default="Operational")
@click.option("--status", default="Pipeline", type=click.Choice(["Active", "Pipeline", "On Hold"]))
@click.option("--priority", default="Medium", type=click.Choice(["Critical", "High", "Medium", "Low", "Backlog"]))
@click.option("--timeframe", default="2026")
@click.option("--notes", default="", help="Initial context note")
def projects_create(name, role, proj_type, status, priority, timeframe, notes):
    """Create a new project in Projects 2026-2030 with full normalization."""
    from engines.projects_agent import create_project
    console.print(f"\n[bold cyan]📁 Creating project: {name}[/bold cyan]")
    page_id = create_project(
        name=name, role=role, proj_type=proj_type,
        status=status, priority=priority, timeframe=timeframe,
        context_notes=notes,
    )
    if page_id:
        console.print(f"[bold green]✅ Project created![/bold green] (Notion ID: {page_id[:8]}...)")
    else:
        console.print("[red]❌ Failed to create project.[/red]")


@cli.command()
def projects_review_enforce():
    """Ensure every Active project has a Next Review date within 7-14 days."""
    from engines.projects_agent import enforce_review_dates
    console.print("\n[bold cyan]📅 Enforcing review dates...[/bold cyan]")
    updated = enforce_review_dates()
    if updated:
        console.print(f"\n   Updated {len(updated)} project(s):")
        for name in updated:
            console.print(f"   ✅ {name}")
    else:
        console.print("   [green]All Active projects already have valid review dates.[/green]")


@cli.command()
def projects_funnel():
    """Identify underperforming content funnels and suggest structural fixes."""
    from engines.projects_agent import identify_underperforming_funnels
    console.print("\n[bold cyan]📊 Scanning funnels for structural issues...[/bold cyan]\n")
    flags = identify_underperforming_funnels()
    if not flags:
        console.print("[green]✅ No underperforming funnels detected.[/green]")
        return
    for flag in flags:
        console.print(f"[bold red]⚠️  {flag['project']}[/bold red] ({flag['role']})")
        console.print(f"   Axes: {', '.join(flag['axes'])}")
        for sig in flag["signals"]:
            console.print(f"   Signal: {sig}")
        for sug in flag["suggestions"]:
            console.print(f"   → {sug}")
        console.print()



if __name__ == "__main__":
    cli()
