# Task 02: Plugin CLI Commands

## Assignee
Backend Developer

## Priority
High

## Estimated Effort
2 days

## Description
Complete the plugin management CLI commands to list, configure, and test plugins.

## Current State
- `haven_cli/cli/plugins.py` has placeholder implementations:
  - `list_plugins()` - Shows placeholder data
  - `plugin_info()` - Shows placeholder info
  - `configure_plugin()` - Prints message only
  - `test_plugin()` - Prints "not yet implemented"

## Requirements

### 1. List Plugins Command
Show real discovered plugins:

```python
@app.command("list")
def list_plugins() -> None:
    """List all available plugins."""
    from haven_cli.plugins.registry import get_registry
    from haven_cli.plugins.manager import get_plugin_manager
    
    registry = get_registry()
    manager = get_plugin_manager()
    
    # Discover all plugins
    registry.discover_all()
    
    table = Table(title="Available Plugins")
    table.add_column("Name", style="cyan")
    table.add_column("Version", style="green")
    table.add_column("Status", style="bold")
    table.add_column("Description")
    
    for plugin_info in registry.get_all_info():
        # Check if loaded in manager
        plugin = manager.get_plugin(plugin_info.name)
        if plugin:
            status = "[green]loaded[/green]"
            if plugin._initialized:
                status = "[green]active[/green]"
        else:
            status = "[dim]available[/dim]"
        
        table.add_row(
            plugin_info.name,
            plugin_info.version,
            status,
            plugin_info.description[:50] + "..." if len(plugin_info.description) > 50 else plugin_info.description,
        )
    
    console.print(table)
    
    if not registry.get_all_info():
        console.print("[yellow]No plugins found.[/yellow]")
        console.print("Install plugins or add plugin directories to config.")
```

### 2. Plugin Info Command
Show detailed plugin information:

```python
@app.command("info")
def plugin_info(
    name: str = typer.Argument(..., help="Plugin name"),
) -> None:
    """Show detailed information about a plugin."""
    from haven_cli.plugins.registry import get_registry
    from haven_cli.plugins.manager import get_plugin_manager
    
    registry = get_registry()
    info = registry.get_info(name)
    
    if not info:
        console.print(f"[red]Plugin not found: {name}[/red]")
        raise typer.Exit(code=1)
    
    console.print(f"[bold cyan]{info.name}[/bold cyan] v{info.version}")
    console.print(f"[dim]by {info.author}[/dim]")
    console.print()
    console.print(info.description)
    console.print()
    
    # Capabilities
    console.print("[bold]Capabilities:[/bold]")
    for cap in info.capabilities:
        console.print(f"  • {cap}")
    console.print()
    
    # Configuration
    manager = get_plugin_manager()
    plugin = manager.get_plugin(name)
    
    if plugin:
        console.print("[bold]Current Configuration:[/bold]")
        config = plugin._config or {}
        if config:
            for key, value in config.items():
                # Mask sensitive values
                if "key" in key.lower() or "secret" in key.lower() or "password" in key.lower():
                    value = "***"
                console.print(f"  {key}: {value}")
        else:
            console.print("  [dim]No configuration set[/dim]")
    else:
        console.print("[bold]Status:[/bold] Not loaded")
```

### 3. Configure Plugin Command
Set plugin configuration:

```python
@app.command("configure")
def configure_plugin(
    name: str = typer.Argument(..., help="Plugin name"),
    key: str = typer.Argument(..., help="Configuration key"),
    value: str = typer.Argument(..., help="Configuration value"),
) -> None:
    """Configure a plugin setting."""
    from haven_cli.plugins.manager import get_plugin_manager
    from haven_cli.config import get_config, save_config
    
    manager = get_plugin_manager()
    
    # Ensure plugin exists
    plugin = manager.get_plugin(name)
    if not plugin:
        # Try to load it
        from haven_cli.plugins.registry import get_registry
        registry = get_registry()
        plugin_class = registry.load(name)
        if not plugin_class:
            console.print(f"[red]Plugin not found: {name}[/red]")
            raise typer.Exit(code=1)
        manager.register(plugin_class)
        plugin = manager.get_plugin(name)
    
    # Parse value (handle lists, bools, numbers)
    parsed_value = _parse_config_value(value)
    
    # Update plugin config
    if plugin._config is None:
        plugin._config = {}
    plugin._config[key] = parsed_value
    
    # Persist to config file
    config = get_config()
    if not hasattr(config, 'plugins'):
        config.plugins = {}
    if name not in config.plugins:
        config.plugins[name] = {}
    config.plugins[name][key] = parsed_value
    save_config(config)
    
    console.print(f"[green]✓[/green] Set {name}.{key} = {parsed_value}")

def _parse_config_value(value: str) -> Any:
    """Parse configuration value string to appropriate type."""
    # Boolean
    if value.lower() in ("true", "yes", "1"):
        return True
    if value.lower() in ("false", "no", "0"):
        return False
    
    # Number
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        pass
    
    # List (comma-separated)
    if "," in value:
        return [v.strip() for v in value.split(",")]
    
    # String
    return value
```

### 4. Test Plugin Command
Test plugin functionality:

```python
@app.command("test")
def test_plugin(
    name: str = typer.Argument(..., help="Plugin name"),
    discover: bool = typer.Option(False, "--discover", "-d", help="Test discovery"),
    archive_url: Optional[str] = typer.Option(None, "--archive", "-a", help="Test archiving URL"),
) -> None:
    """Test a plugin's functionality."""
    import asyncio
    from haven_cli.plugins.manager import get_plugin_manager
    
    manager = get_plugin_manager()
    plugin = manager.get_plugin(name)
    
    if not plugin:
        console.print(f"[red]Plugin not found or not loaded: {name}[/red]")
        raise typer.Exit(code=1)
    
    async def run_tests() -> None:
        # Initialize
        console.print(f"[bold]Testing {name}...[/bold]")
        console.print()
        
        # Health check
        console.print("Health check... ", end="")
        try:
            if not plugin._initialized:
                await plugin.initialize()
            healthy = await plugin.health_check()
            if healthy:
                console.print("[green]✓ passed[/green]")
            else:
                console.print("[red]✗ failed[/red]")
                return
        except Exception as e:
            console.print(f"[red]✗ error: {e}[/red]")
            return
        
        # Discovery test
        if discover:
            console.print("Discovery... ", end="")
            try:
                sources = await plugin.discover_sources()
                console.print(f"[green]✓ found {len(sources)} sources[/green]")
                
                if sources:
                    console.print()
                    table = Table(title="Discovered Sources")
                    table.add_column("ID")
                    table.add_column("Type")
                    table.add_column("Title")
                    
                    for source in sources[:5]:  # Show first 5
                        title = source.metadata.get("title", "")[:40]
                        table.add_row(source.source_id[:12], source.media_type, title)
                    
                    console.print(table)
                    if len(sources) > 5:
                        console.print(f"[dim]... and {len(sources) - 5} more[/dim]")
            except Exception as e:
                console.print(f"[red]✗ error: {e}[/red]")
        
        # Archive test
        if archive_url:
            console.print(f"Archive test ({archive_url})... ", end="")
            try:
                from haven_cli.plugins.base import MediaSource
                source = MediaSource(
                    source_id="test",
                    media_type="test",
                    uri=archive_url,
                )
                result = await plugin.archive(source)
                if result.success:
                    console.print(f"[green]✓ archived to {result.output_path}[/green]")
                else:
                    console.print(f"[red]✗ failed: {result.error}[/red]")
            except Exception as e:
                console.print(f"[red]✗ error: {e}[/red]")
        
        console.print()
        console.print("[green]All tests completed.[/green]")
    
    asyncio.run(run_tests())
```

### 5. Enable/Disable Commands
Manage plugin state:

```python
@app.command("enable")
def enable_plugin(name: str = typer.Argument(...)) -> None:
    """Enable a plugin."""
    from haven_cli.plugins.manager import get_plugin_manager
    from haven_cli.plugins.registry import get_registry
    
    manager = get_plugin_manager()
    
    if manager.get_plugin(name):
        console.print(f"[yellow]Plugin already enabled: {name}[/yellow]")
        return
    
    registry = get_registry()
    plugin_class = registry.load(name)
    
    if not plugin_class:
        console.print(f"[red]Plugin not found: {name}[/red]")
        raise typer.Exit(code=1)
    
    manager.register(plugin_class)
    console.print(f"[green]✓[/green] Plugin enabled: {name}")

@app.command("disable")
def disable_plugin(name: str = typer.Argument(...)) -> None:
    """Disable a plugin."""
    from haven_cli.plugins.manager import get_plugin_manager
    
    manager = get_plugin_manager()
    
    if not manager.get_plugin(name):
        console.print(f"[yellow]Plugin not enabled: {name}[/yellow]")
        return
    
    manager.unregister(name)
    console.print(f"[green]✓[/green] Plugin disabled: {name}")
```

## Files to Modify

### Modify
- `haven_cli/cli/plugins.py` - Complete all command implementations
- `haven_cli/plugins/manager.py` - Add `get_plugin_manager()` singleton

## Acceptance Criteria
- [ ] `haven plugins list` shows real plugins
- [ ] `haven plugins info <name>` shows detailed info
- [ ] `haven plugins configure` persists settings
- [ ] `haven plugins test` runs actual tests
- [ ] `haven plugins enable/disable` manages state
- [ ] Error messages are helpful
- [ ] Works with YouTube plugin

## Technical Notes
- Plugin configuration should persist to config file
- Consider plugin dependencies
- Handle async plugin operations properly

## Dependencies
- Task 01: YouTube plugin (for testing)

## Blocking
- None
