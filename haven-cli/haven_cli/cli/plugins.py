"""Haven plugins command - Manage plugins."""

from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(help="Manage archiver plugins.")
console = Console()


@app.command("list")
def list_plugins(
    show_disabled: bool = typer.Option(
        False,
        "--all",
        "-a",
        help="Show disabled plugins as well.",
    ),
) -> None:
    """List available plugins.
    
    Example:
        haven plugins list
        haven plugins list --all
    """
    from haven_cli.plugins.registry import PluginRegistry
    
    # TODO: Get actual plugins from registry
    # This is skeleton code - actual implementation deferred
    
    table = Table(title="Available Plugins")
    table.add_column("Name", style="cyan")
    table.add_column("Type", style="magenta")
    table.add_column("Status", style="bold")
    table.add_column("Description")
    
    # Placeholder data
    plugins_data = [
        ("YouTubePlugin", "archiver", True, "Archive videos from YouTube channels/playlists"),
        ("BitTorrentPlugin", "archiver", True, "Archive torrents from feeds/DHT"),
        ("PumpFunPlugin", "archiver", False, "Record PumpFun live streams"),
        ("OpenRingPlugin", "archiver", False, "Capture WebRTC streams"),
        ("WebVideoPlugin", "archiver", True, "Archive videos from web APIs using direct downloads"),
    ]
    
    for name, ptype, enabled, desc in plugins_data:
        if enabled or show_disabled:
            status = "[green]enabled[/green]" if enabled else "[dim]disabled[/dim]"
            table.add_row(name, ptype, status, desc)
    
    console.print(table)


@app.command("enable")
def enable_plugin(
    name: str = typer.Argument(
        ...,
        help="Name of the plugin to enable.",
    ),
) -> None:
    """Enable a plugin.
    
    Example:
        haven plugins enable PumpFunPlugin
    """
    from haven_cli.plugins.manager import PluginManager
    
    console.print(f"[bold]Enabling plugin:[/bold] {name}")
    
    # TODO: Enable plugin
    # This is skeleton code - actual implementation deferred
    
    console.print(f"[green]✓[/green] Plugin '{name}' enabled")


@app.command("disable")
def disable_plugin(
    name: str = typer.Argument(
        ...,
        help="Name of the plugin to disable.",
    ),
) -> None:
    """Disable a plugin.
    
    Example:
        haven plugins disable PumpFunPlugin
    """
    from haven_cli.plugins.manager import PluginManager
    
    console.print(f"[bold]Disabling plugin:[/bold] {name}")
    
    # TODO: Disable plugin
    
    console.print(f"[green]✓[/green] Plugin '{name}' disabled")


@app.command("config")
def configure_plugin(
    name: str = typer.Argument(
        ...,
        help="Name of the plugin to configure.",
    ),
    key: Optional[str] = typer.Option(
        None,
        "--set",
        "-s",
        help="Set a configuration value (format: key=value).",
    ),
    show: bool = typer.Option(
        False,
        "--show",
        help="Show current configuration.",
    ),
) -> None:
    """Configure a plugin.
    
    Example:
        haven plugins config YouTubePlugin --show
        haven plugins config YouTubePlugin --set api_key=YOUR_API_KEY
    """
    from haven_cli.plugins.manager import PluginManager
    
    if show:
        console.print(f"[bold]Configuration for {name}:[/bold]")
        
        # Placeholder config display
        table = Table()
        table.add_column("Key", style="cyan")
        table.add_column("Value", style="green")
        table.add_column("Required", style="yellow")
        
        table.add_row("api_key", "********", "Yes")
        table.add_row("channel_ids", "[]", "No")
        table.add_row("max_concurrent", "4", "No")
        
        console.print(table)
        return
    
    if key:
        if "=" not in key:
            console.print("[red]Invalid format. Use --set key=value[/red]")
            raise typer.Exit(code=1)
        
        k, v = key.split("=", 1)
        console.print(f"[bold]Setting {name}.{k}:[/bold] {v}")
        
        # TODO: Set plugin config
        
        console.print(f"[green]✓[/green] Configuration updated")
    else:
        console.print("[yellow]Use --show to view config or --set key=value to update[/yellow]")


@app.command("test")
def test_plugin(
    name: str = typer.Argument(
        ...,
        help="Name of the plugin to test.",
    ),
) -> None:
    """Test a plugin's discover_sources functionality.
    
    Example:
        haven plugins test YouTubePlugin
    """
    import asyncio
    from haven_cli.plugins.manager import PluginManager
    
    console.print(f"[bold]Testing plugin:[/bold] {name}")
    
    async def run_test() -> None:
        # TODO: Actually test plugin
        console.print("  Calling discover_sources()...")
        console.print("  [green]✓[/green] Plugin responded successfully")
        console.print("  Found 5 sources")
    
    asyncio.run(run_test())


@app.command("info")
def plugin_info(
    name: str = typer.Argument(
        ...,
        help="Name of the plugin to get info about.",
    ),
) -> None:
    """Show detailed information about a plugin.
    
    Example:
        haven plugins info YouTubePlugin
    """
    from haven_cli.plugins.registry import PluginRegistry
    
    console.print(f"[bold cyan]{name}[/bold cyan]")
    console.print()
    
    # Placeholder info
    console.print("[bold]Type:[/bold] archiver")
    console.print("[bold]Version:[/bold] 1.0.0")
    console.print("[bold]Author:[/bold] Haven Team")
    console.print()
    console.print("[bold]Description:[/bold]")
    console.print("  Archive videos from YouTube channels and playlists.")
    console.print("  Supports channel monitoring, playlist tracking, and")
    console.print("  automatic quality selection.")
    console.print()
    console.print("[bold]Capabilities:[/bold]")
    console.print("  • discover_sources() - Find new videos")
    console.print("  • archive(source) - Download video")
    console.print("  • health_check() - Verify connectivity")
