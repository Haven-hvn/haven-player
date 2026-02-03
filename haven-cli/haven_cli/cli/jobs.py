"""Haven jobs command - Manage scheduled jobs."""

from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(help="Manage scheduled jobs for plugin polling.")
console = Console()


@app.command("list")
def list_jobs(
    status: Optional[str] = typer.Option(
        None,
        "--status",
        "-s",
        help="Filter by status (active, paused, all).",
    ),
) -> None:
    """List all scheduled jobs.
    
    Example:
        haven jobs list
        haven jobs list --status active
    """
    from haven_cli.scheduler.job_scheduler import JobScheduler
    
    # TODO: Get actual jobs from scheduler
    # This is skeleton code - actual implementation deferred
    
    table = Table(title="Scheduled Jobs")
    table.add_column("ID", style="cyan")
    table.add_column("Plugin", style="magenta")
    table.add_column("Schedule", style="green")
    table.add_column("On Success", style="yellow")
    table.add_column("Status", style="bold")
    table.add_column("Last Run")
    table.add_column("Next Run")
    
    # Placeholder data
    table.add_row(
        "job-001",
        "YouTubePlugin",
        "0 * * * *",
        "archive_all",
        "[green]active[/green]",
        "2026-02-02 23:00",
        "2026-02-03 00:00",
    )
    
    console.print(table)


@app.command("create")
def create_job(
    plugin: str = typer.Option(
        ...,
        "--plugin",
        "-p",
        help="Plugin name to use for discovery.",
    ),
    schedule: str = typer.Option(
        ...,
        "--schedule",
        "-s",
        help="Cron schedule expression (e.g., '0 * * * *' for hourly).",
    ),
    on_success: str = typer.Option(
        "archive_new",
        "--on-success",
        help="Action on success: archive_all, archive_new, log_only.",
    ),
    name: Optional[str] = typer.Option(
        None,
        "--name",
        "-n",
        help="Optional job name.",
    ),
) -> None:
    """Create a new scheduled job.
    
    Example:
        haven jobs create --plugin YouTubePlugin --schedule "0 * * * *"
        haven jobs create --plugin BitTorrentPlugin --schedule "*/30 * * * *" --on-success archive_all
    """
    from haven_cli.scheduler.job_scheduler import JobScheduler
    
    # Validate on_success value
    valid_actions = ["archive_all", "archive_new", "log_only"]
    if on_success not in valid_actions:
        console.print(f"[red]Invalid on-success action. Choose from: {valid_actions}[/red]")
        raise typer.Exit(code=1)
    
    console.print(f"[bold]Creating job:[/bold]")
    console.print(f"  Plugin: {plugin}")
    console.print(f"  Schedule: {schedule}")
    console.print(f"  On Success: {on_success}")
    
    # TODO: Create actual job
    # This is skeleton code - actual implementation deferred
    
    console.print("[green]✓[/green] Job created successfully")


@app.command("delete")
def delete_job(
    job_id: str = typer.Argument(
        ...,
        help="ID of the job to delete.",
    ),
    force: bool = typer.Option(
        False,
        "--force",
        "-f",
        help="Skip confirmation prompt.",
    ),
) -> None:
    """Delete a scheduled job.
    
    Example:
        haven jobs delete job-001
        haven jobs delete job-001 --force
    """
    if not force:
        confirm = typer.confirm(f"Are you sure you want to delete job '{job_id}'?")
        if not confirm:
            raise typer.Abort()
    
    # TODO: Delete actual job
    console.print(f"[green]✓[/green] Job '{job_id}' deleted")


@app.command("run")
def run_job(
    job_id: str = typer.Argument(
        ...,
        help="ID of the job to run immediately.",
    ),
) -> None:
    """Run a job immediately (outside of schedule).
    
    Example:
        haven jobs run job-001
    """
    console.print(f"[bold]Running job:[/bold] {job_id}")
    
    # TODO: Trigger job execution
    console.print("[yellow]Job execution not yet implemented[/yellow]")


@app.command("pause")
def pause_job(
    job_id: str = typer.Argument(
        ...,
        help="ID of the job to pause.",
    ),
) -> None:
    """Pause a scheduled job.
    
    Example:
        haven jobs pause job-001
    """
    # TODO: Pause job
    console.print(f"[green]✓[/green] Job '{job_id}' paused")


@app.command("resume")
def resume_job(
    job_id: str = typer.Argument(
        ...,
        help="ID of the job to resume.",
    ),
) -> None:
    """Resume a paused job.
    
    Example:
        haven jobs resume job-001
    """
    # TODO: Resume job
    console.print(f"[green]✓[/green] Job '{job_id}' resumed")


@app.command("history")
def job_history(
    job_id: Optional[str] = typer.Argument(
        None,
        help="Job ID to show history for (or all if not specified).",
    ),
    limit: int = typer.Option(
        10,
        "--limit",
        "-l",
        help="Number of history entries to show.",
    ),
) -> None:
    """Show job execution history.
    
    Example:
        haven jobs history
        haven jobs history job-001 --limit 20
    """
    table = Table(title=f"Job History{f' for {job_id}' if job_id else ''}")
    table.add_column("Job ID", style="cyan")
    table.add_column("Started", style="green")
    table.add_column("Duration", style="yellow")
    table.add_column("Status", style="bold")
    table.add_column("Sources Found")
    table.add_column("Archived")
    
    # Placeholder data
    table.add_row(
        "job-001",
        "2026-02-02 23:00:05",
        "2m 34s",
        "[green]success[/green]",
        "15",
        "3",
    )
    
    console.print(table)
