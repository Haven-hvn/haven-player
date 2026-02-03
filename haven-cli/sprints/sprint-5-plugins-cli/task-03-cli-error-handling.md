# Task 03: CLI Error Handling & UX

## Assignee
Backend Developer

## Priority
High

## Estimated Effort
2 days

## Description
Improve error handling, user feedback, and overall UX across all CLI commands for production readiness.

## Current State
- Many commands have basic error handling
- Error messages are inconsistent
- No global exception handling
- Progress indicators incomplete
- Exit codes not standardized

## Requirements

### 1. Global Exception Handler
Create centralized error handling:

```python
# haven_cli/cli/error_handler.py

from functools import wraps
from typing import Callable, TypeVar
import typer
from rich.console import Console

console = Console(stderr=True)

class HavenError(Exception):
    """Base exception for Haven CLI."""
    exit_code: int = 1
    
class ConfigurationError(HavenError):
    """Configuration-related error."""
    exit_code = 2

class PluginError(HavenError):
    """Plugin-related error."""
    exit_code = 3

class PipelineError(HavenError):
    """Pipeline processing error."""
    exit_code = 4

class NetworkError(HavenError):
    """Network/connectivity error."""
    exit_code = 5

class StorageError(HavenError):
    """Storage/Filecoin error."""
    exit_code = 6

def handle_errors(func: Callable) -> Callable:
    """Decorator for consistent error handling."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except HavenError as e:
            console.print(f"[red]Error:[/red] {e}")
            raise typer.Exit(code=e.exit_code)
        except KeyboardInterrupt:
            console.print("\n[yellow]Operation cancelled.[/yellow]")
            raise typer.Exit(code=130)
        except Exception as e:
            console.print(f"[red]Unexpected error:[/red] {e}")
            console.print("[dim]Run with --verbose for more details[/dim]")
            raise typer.Exit(code=1)
    return wrapper
```

### 2. Verbose Mode
Add global verbose flag:

```python
# In haven_cli/cli/main.py

import logging

@app.callback()
def main(
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Enable verbose output"),
    debug: bool = typer.Option(False, "--debug", help="Enable debug mode"),
) -> None:
    """Haven CLI - Decentralized video archival."""
    if debug:
        logging.basicConfig(level=logging.DEBUG)
    elif verbose:
        logging.basicConfig(level=logging.INFO)
    else:
        logging.basicConfig(level=logging.WARNING)
```

### 3. Progress Indicators
Standardize progress display:

```python
# haven_cli/cli/progress.py

from contextlib import contextmanager
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.console import Console

console = Console()

@contextmanager
def spinner(message: str):
    """Show a spinner for indeterminate operations."""
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        transient=True,
    ) as progress:
        progress.add_task(description=message, total=None)
        yield

@contextmanager
def progress_bar(total: int, description: str = "Processing"):
    """Show a progress bar for determinate operations."""
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
    ) as progress:
        task = progress.add_task(description, total=total)
        yield lambda n=1: progress.update(task, advance=n)

def status_message(message: str, status: str = "info"):
    """Print a status message."""
    icons = {
        "info": "[blue]ℹ[/blue]",
        "success": "[green]✓[/green]",
        "warning": "[yellow]⚠[/yellow]",
        "error": "[red]✗[/red]",
    }
    console.print(f"{icons.get(status, '')} {message}")
```

### 4. Confirmation Prompts
Standardize dangerous operations:

```python
# haven_cli/cli/prompts.py

import typer
from rich.console import Console

console = Console()

def confirm_dangerous(message: str, default: bool = False) -> bool:
    """Confirm a dangerous operation."""
    return typer.confirm(
        f"[yellow]⚠[/yellow] {message}",
        default=default,
    )

def confirm_with_input(message: str, expected: str) -> bool:
    """Confirm by typing expected value."""
    console.print(f"[yellow]⚠[/yellow] {message}")
    response = typer.prompt(f"Type '{expected}' to confirm")
    return response == expected
```

### 5. Help Text Improvements
Enhance command help:

```python
# Update all commands with better help text

@app.command()
def upload(
    file: Path = typer.Argument(
        ...,
        help="Path to video file to upload",
        exists=True,
        file_okay=True,
        dir_okay=False,
        readable=True,
    ),
    encrypt: bool = typer.Option(
        False,
        "--encrypt", "-e",
        help="Encrypt video using Lit Protocol before upload",
    ),
    analyze: bool = typer.Option(
        True,
        "--analyze/--no-analyze",
        help="Run VLM analysis to generate timestamps",
    ),
    sync: bool = typer.Option(
        True,
        "--sync/--no-sync",
        help="Sync metadata to Arkiv blockchain",
    ),
) -> None:
    """
    Upload a video to Filecoin storage.
    
    This command processes the video through the Haven pipeline:
    
    1. Ingest: Extract metadata and calculate pHash
    2. Analyze: Generate AI timestamps (if --analyze)
    3. Encrypt: Encrypt with Lit Protocol (if --encrypt)
    4. Upload: Store on Filecoin via Synapse
    5. Sync: Record on Arkiv blockchain (if --sync)
    
    Examples:
    
        haven upload video.mp4
        haven upload video.mp4 --encrypt
        haven upload video.mp4 --no-analyze --no-sync
    """
```

### 6. Exit Code Documentation
Standardize exit codes:

```python
# haven_cli/cli/exit_codes.py

class ExitCode:
    """Standard exit codes for Haven CLI."""
    
    SUCCESS = 0
    GENERAL_ERROR = 1
    CONFIGURATION_ERROR = 2
    PLUGIN_ERROR = 3
    PIPELINE_ERROR = 4
    NETWORK_ERROR = 5
    STORAGE_ERROR = 6
    INVALID_ARGUMENT = 7
    NOT_FOUND = 8
    PERMISSION_DENIED = 9
    CANCELLED = 130  # Ctrl+C
```

### 7. Output Formatting
Consistent output formats:

```python
# haven_cli/cli/output.py

import json
from typing import Any, Dict, List
from rich.console import Console
from rich.table import Table

console = Console()

def print_json(data: Any) -> None:
    """Print data as formatted JSON."""
    console.print_json(json.dumps(data, indent=2, default=str))

def print_table(
    data: List[Dict[str, Any]],
    columns: List[str],
    title: str = None,
) -> None:
    """Print data as a table."""
    table = Table(title=title)
    
    for col in columns:
        table.add_column(col.replace("_", " ").title())
    
    for row in data:
        table.add_row(*[str(row.get(col, "")) for col in columns])
    
    console.print(table)

def print_result(success: bool, message: str, details: Dict[str, Any] = None) -> None:
    """Print operation result."""
    if success:
        console.print(f"[green]✓[/green] {message}")
    else:
        console.print(f"[red]✗[/red] {message}")
    
    if details:
        for key, value in details.items():
            console.print(f"  {key}: {value}")
```

## Files to Create/Modify

### Create
- `haven_cli/cli/error_handler.py` - Exception classes and handler
- `haven_cli/cli/progress.py` - Progress utilities
- `haven_cli/cli/prompts.py` - Confirmation prompts
- `haven_cli/cli/output.py` - Output formatting
- `haven_cli/cli/exit_codes.py` - Exit code constants

### Modify
- `haven_cli/cli/main.py` - Add global options
- All command files - Apply error handler decorator, improve help text

## Acceptance Criteria
- [ ] All commands use consistent error handling
- [ ] Exit codes are standardized
- [ ] Progress indicators work correctly
- [ ] Verbose mode shows additional info
- [ ] Help text is comprehensive
- [ ] Dangerous operations require confirmation
- [ ] Output is consistently formatted

## Technical Notes
- Use Rich library for all terminal output
- Consider --quiet flag for scripting
- Log errors to file in addition to console
- Support --json flag for machine-readable output

## Dependencies
None

## Blocking
- None
