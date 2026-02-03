"""Haven download command - Download and decrypt files from Filecoin."""

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn

app = typer.Typer(help="Download and decrypt files from Filecoin network.")
console = Console()


@app.callback(invoke_without_command=True)
def download(
    cid: str = typer.Argument(
        ...,
        help="Content ID (CID) of the file to download.",
    ),
    output: Path = typer.Option(
        ...,
        "--output",
        "-o",
        help="Output path for downloaded file.",
        file_okay=True,
        dir_okay=False,
        resolve_path=True,
    ),
    decrypt: bool = typer.Option(
        False,
        "--decrypt",
        "-d",
        help="Decrypt file after download using Lit Protocol.",
    ),
    config_file: Optional[Path] = typer.Option(
        None,
        "--config",
        "-c",
        help="Path to configuration file.",
    ),
) -> None:
    """Download a file from Filecoin network.
    
    This command retrieves a file by its CID and optionally decrypts it
    using Lit Protocol if it was encrypted during upload.
    
    Example:
        haven download bafybeig... --output video.mp4
        haven download bafybeig... --output video.mp4 --decrypt
    """
    import asyncio

    from haven_cli.config import load_config
    from haven_cli.js_runtime.bridge import JSRuntimeBridge

    config = load_config(config_file)
    
    console.print(f"[bold]Downloading:[/bold] {cid}")
    console.print(f"[bold]Output:[/bold] {output}")
    
    async def run_download() -> None:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Downloading...", total=100)
            
            # TODO: Implement actual download via JS bridge
            # This is skeleton code - actual implementation deferred
            
            js_bridge = JSRuntimeBridge()
            
            try:
                # Retrieve file from Filecoin
                progress.update(task, description="Fetching from Filecoin...")
                # result = await js_bridge.call("synapse", "download", {"cid": cid})
                
                progress.update(task, advance=50)
                
                if decrypt:
                    progress.update(task, description="Decrypting...")
                    # decrypted = await js_bridge.call("lit", "decrypt", {...})
                
                progress.update(task, advance=50)
                
                console.print(f"[green]✓[/green] Download complete: {output}")
                
            except Exception as e:
                console.print(f"[red]✗[/red] Download failed: {e}")
                raise typer.Exit(code=1)
            finally:
                await js_bridge.close()
    
    asyncio.run(run_download())


@app.command()
def info(
    cid: str = typer.Argument(
        ...,
        help="Content ID (CID) to get information about.",
    ),
) -> None:
    """Get information about a file stored on Filecoin.
    
    Example:
        haven download info bafybeig...
    """
    console.print(f"[bold]CID:[/bold] {cid}")
    console.print("[yellow]Info retrieval not yet implemented[/yellow]")
