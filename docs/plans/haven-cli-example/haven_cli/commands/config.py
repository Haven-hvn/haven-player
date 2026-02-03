"""
Configuration management for Haven CLI.
"""

import click
from rich.console import Console
from rich.table import Table
from ..config import load_config, set_config, get_config_path

console = Console()


@click.group()
def config():
    """Manage Haven CLI configuration."""
    pass


@config.command()
@click.argument("key")
@click.argument("value")
def set(key: str, value: str) -> None:
    """Set a configuration value."""
    set_config(key, value)
    console.print(f"✅ Set [cyan]{key}[/cyan] = [green]{mask_sensitive(key, value)}[/green]")


@config.command()
def show() -> None:
    """Show current configuration."""
    cfg = load_config()
    
    table = Table(title="Haven CLI Configuration")
    table.add_column("Key", style="cyan")
    table.add_column("Value", style="green")
    
    for key, value in sorted(cfg.items()):
        table.add_row(key, mask_sensitive(key, str(value)))
    
    console.print(table)
    console.print(f"\n[dim]Config file: {get_config_path()}[/dim]")


@config.command()
def path() -> None:
    """Show configuration file path."""
    console.print(get_config_path())


def mask_sensitive(key: str, value: str) -> str:
    """Mask sensitive values like private keys."""
    if "key" in key.lower() or "secret" in key.lower() or "password" in key.lower():
        if len(value) > 10:
            return value[:6] + "..." + value[-4:]
        return "***"
    return value
