"""
Haven CLI Main Entry Point

A headless CLI for encrypted video storage using Lit Protocol and Filecoin.
Inspired by yt-dlp's JavaScript runtime abstraction.
"""

import click
from rich.console import Console
from rich.panel import Panel

from .commands.upload import upload
from .commands.download import download
from .commands.config import config
from .commands.record import record

console = Console()


@click.group()
@click.version_option(version=\"0.1.0\", prog_name=\"haven\")
@click.option("--verbose", "-v", is_flag=True, help=\"Enable verbose output\")
@click.option("--runtime", default=\"deno\", type=click.Choice([\"deno\", \"node\"]),
              help=\"JavaScript runtime to use\")
@click.pass_context
def cli(ctx: click.Context, verbose: bool, runtime: str) -> None:
    \"\"\"Haven CLI - Headless encrypted video storage.\n    
    \b
    Examples:
        haven upload ./video.mp4 --private-key $KEY
        haven download <cid> --output ./restored.mp4
        haven record start <stream-url> --auto-upload
    \"\"\"
    ctx.ensure_object(dict)
    ctx.obj["verbose"] = verbose
    ctx.obj["runtime"] = runtime
    
    if verbose:
        console.print(f\"[dim]Using runtime: {runtime}[/dim]\")


# Register commands
cli.add_command(upload)
cli.add_command(download)
cli.add_command(config)
cli.add_command(record)


@cli.command()
def hello() -> None:
    \"\"\"Display welcome message and system info.\"\"\"
    console.print(Panel.fit(
        \"\"\"[bold blue]Welcome to Haven CLI[/bold blue]
        
        A headless tool for encrypted video storage using:
        • [green]Lit Protocol[/green] - Decentralized encryption
        • [green]Filecoin[/green] - Decentralized storage
        
        Run [yellow]haven --help[/yellow] for available commands.
        \"\"\",
        title=\"Haven Player CLI v0.1.0\",
        border_style=\"blue\",
    ))


if __name__ == \"__main__\":
    cli()
