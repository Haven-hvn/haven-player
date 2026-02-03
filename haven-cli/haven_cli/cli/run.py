"""Haven run command - Start daemon with scheduler and pipeline processing."""

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

app = typer.Typer(help="Start Haven daemon with scheduler and pipeline processing.")
console = Console()


@app.callback(invoke_without_command=True)
def run(
    config_file: Optional[Path] = typer.Option(
        None,
        "--config",
        "-c",
        help="Path to configuration file.",
        exists=True,
        file_okay=True,
        dir_okay=False,
        resolve_path=True,
    ),
    daemon: bool = typer.Option(
        False,
        "--daemon",
        "-d",
        help="Run in background as daemon.",
    ),
    max_concurrent: int = typer.Option(
        4,
        "--max-concurrent",
        "-m",
        help="Maximum concurrent pipeline executions.",
        min=1,
        max=32,
    ),
    verbose: bool = typer.Option(
        False,
        "--verbose",
        "-v",
        help="Enable verbose logging.",
    ),
) -> None:
    """Start the Haven daemon with job scheduler and pipeline processing.
    
    This command starts the main Haven service which:
    - Loads and executes scheduled jobs (plugin polling)
    - Processes videos through the pipeline (ingest → analyze → encrypt → upload → sync)
    - Manages parallel execution of multiple pipelines
    
    Example:
        haven run --config config.yaml
        haven run --daemon --max-concurrent 8
    """
    from haven_cli.config import load_config
    from haven_cli.pipeline.manager import PipelineManager
    from haven_cli.scheduler.job_scheduler import JobScheduler

    # Load configuration
    config = load_config(config_file)
    
    console.print("[bold green]Starting Haven daemon...[/bold green]")
    
    if verbose:
        console.print(f"Config: {config_file or 'default'}")
        console.print(f"Max concurrent pipelines: {max_concurrent}")
        console.print(f"Daemon mode: {daemon}")
    
    # Initialize pipeline manager
    pipeline_manager = PipelineManager(
        max_concurrent=max_concurrent,
        config=config,
    )
    
    # Initialize job scheduler
    scheduler = JobScheduler(
        pipeline_manager=pipeline_manager,
        config=config,
    )
    
    # Start services
    # TODO: Implement actual daemon startup
    console.print("[yellow]Daemon startup not yet implemented[/yellow]")
