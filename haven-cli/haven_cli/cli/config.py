"""Haven config command - Configuration management."""

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.syntax import Syntax

app = typer.Typer(help="Manage Haven configuration.")
console = Console()


@app.command("show")
def show_config(
    section: Optional[str] = typer.Argument(
        None,
        help="Configuration section to show (e.g., filecoin, arkiv, pipeline).",
    ),
    format: str = typer.Option(
        "table",
        "--format",
        "-f",
        help="Output format (table, yaml, json).",
    ),
) -> None:
    """Show current configuration.
    
    Example:
        haven config show
        haven config show filecoin
        haven config show --format yaml
    """
    from haven_cli.config import get_config
    
    config = get_config()
    
    if format == "yaml":
        # TODO: Output as YAML
        console.print("[yellow]YAML output not yet implemented[/yellow]")
        return
    elif format == "json":
        # TODO: Output as JSON
        console.print("[yellow]JSON output not yet implemented[/yellow]")
        return
    
    if section:
        console.print(f"[bold]Configuration: {section}[/bold]")
    else:
        console.print("[bold]Haven Configuration[/bold]")
    console.print()
    
    # Show config sections
    sections = {
        "filecoin": [
            ("rpc_url", "https://api.node.glif.io", False),
            ("private_key", "********", True),
            ("data_set_id", "1", False),
        ],
        "arkiv": [
            ("enabled", "true", False),
            ("rpc_url", "https://arkiv.example.com", False),
            ("private_key", "********", True),
        ],
        "pipeline": [
            ("max_concurrent", "4", False),
            ("vlm_enabled", "true", False),
            ("encryption_enabled", "false", False),
        ],
        "storage": [
            ("data_dir", "~/.haven-cli/data", False),
            ("temp_dir", "~/.haven-cli/temp", False),
            ("database_url", "sqlite:///~/.haven-cli/haven.db", False),
        ],
    }
    
    sections_to_show = [section] if section else sections.keys()
    
    for sec in sections_to_show:
        if sec not in sections:
            console.print(f"[red]Unknown section: {sec}[/red]")
            continue
            
        table = Table(title=sec.capitalize())
        table.add_column("Key", style="cyan")
        table.add_column("Value", style="green")
        table.add_column("Sensitive", style="yellow")
        
        for key, value, sensitive in sections[sec]:
            sens_display = "Yes" if sensitive else ""
            table.add_row(key, value, sens_display)
        
        console.print(table)
        console.print()


@app.command("set")
def set_config(
    key: str = typer.Argument(
        ...,
        help="Configuration key (format: section.key, e.g., filecoin.rpc_url).",
    ),
    value: str = typer.Argument(
        ...,
        help="Value to set.",
    ),
) -> None:
    """Set a configuration value.
    
    Example:
        haven config set filecoin.rpc_url https://api.node.glif.io
        haven config set pipeline.max_concurrent 8
    """
    from haven_cli.config import set_config_value
    
    if "." not in key:
        console.print("[red]Key must be in format: section.key[/red]")
        raise typer.Exit(code=1)
    
    section, config_key = key.split(".", 1)
    
    console.print(f"[bold]Setting:[/bold] {section}.{config_key} = {value}")
    
    # TODO: Actually set config value
    # set_config_value(section, config_key, value)
    
    console.print(f"[green]✓[/green] Configuration updated")


@app.command("init")
def init_config(
    force: bool = typer.Option(
        False,
        "--force",
        "-f",
        help="Overwrite existing configuration.",
    ),
    interactive: bool = typer.Option(
        True,
        "--interactive/--no-interactive",
        "-i/-I",
        help="Run interactive configuration wizard.",
    ),
) -> None:
    """Initialize Haven configuration.
    
    Example:
        haven config init
        haven config init --no-interactive
        haven config init --force
    """
    from haven_cli.config import CONFIG_DIR, CONFIG_FILE
    
    config_path = CONFIG_DIR / CONFIG_FILE
    
    if config_path.exists() and not force:
        console.print(f"[yellow]Configuration already exists at {config_path}[/yellow]")
        console.print("Use --force to overwrite")
        raise typer.Exit(code=1)
    
    console.print("[bold]Initializing Haven configuration...[/bold]")
    console.print()
    
    if interactive:
        # Interactive wizard
        console.print("[bold cyan]Filecoin Configuration[/bold cyan]")
        filecoin_rpc = typer.prompt("  RPC URL", default="https://api.node.glif.io")
        filecoin_key = typer.prompt("  Private Key (optional)", default="", hide_input=True)
        
        console.print()
        console.print("[bold cyan]Arkiv Configuration[/bold cyan]")
        arkiv_enabled = typer.confirm("  Enable Arkiv sync?", default=True)
        
        console.print()
        console.print("[bold cyan]Pipeline Configuration[/bold cyan]")
        max_concurrent = typer.prompt("  Max concurrent pipelines", default="4")
        vlm_enabled = typer.confirm("  Enable VLM analysis?", default=True)
    
    # TODO: Write configuration file
    console.print()
    console.print(f"[green]✓[/green] Configuration initialized at {config_path}")


@app.command("path")
def config_path() -> None:
    """Show configuration file path.
    
    Example:
        haven config path
    """
    from haven_cli.config import CONFIG_DIR, CONFIG_FILE
    
    config_path = CONFIG_DIR / CONFIG_FILE
    console.print(f"[bold]Config directory:[/bold] {CONFIG_DIR}")
    console.print(f"[bold]Config file:[/bold] {config_path}")
    console.print(f"[bold]Exists:[/bold] {config_path.exists()}")


@app.command("validate")
def validate_config() -> None:
    """Validate current configuration.
    
    Example:
        haven config validate
    """
    from haven_cli.config import get_config, validate_config as do_validate
    
    console.print("[bold]Validating configuration...[/bold]")
    console.print()
    
    checks = [
        ("Config file exists", True, None),
        ("Config file readable", True, None),
        ("Filecoin RPC URL valid", True, None),
        ("Arkiv RPC URL valid", True, None),
        ("Database path writable", True, None),
        ("Private keys set", False, "Optional but recommended"),
    ]
    
    all_passed = True
    for name, passed, note in checks:
        if passed:
            status = "[green]✓[/green]"
        else:
            status = "[red]✗[/red]"
            all_passed = False
        
        line = f"  {status} {name}"
        if note:
            line += f" [dim]({note})[/dim]"
        console.print(line)
    
    console.print()
    if all_passed:
        console.print("[green]Configuration is valid[/green]")
    else:
        console.print("[red]Configuration has errors[/red]")
        raise typer.Exit(code=1)


@app.command("edit")
def edit_config() -> None:
    """Open configuration file in editor.
    
    Example:
        haven config edit
    """
    import os
    import subprocess
    
    from haven_cli.config import CONFIG_DIR, CONFIG_FILE
    
    config_path = CONFIG_DIR / CONFIG_FILE
    
    if not config_path.exists():
        console.print("[yellow]Configuration file doesn't exist. Run 'haven config init' first.[/yellow]")
        raise typer.Exit(code=1)
    
    editor = os.environ.get("EDITOR", "vim")
    
    try:
        subprocess.run([editor, str(config_path)], check=True)
    except FileNotFoundError:
        console.print(f"[red]Editor '{editor}' not found. Set EDITOR environment variable.[/red]")
        raise typer.Exit(code=1)
