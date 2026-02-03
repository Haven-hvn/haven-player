"""
Upload command for Haven CLI.
"""

import click
import asyncio
from pathlib import Path
from typing import Optional
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from ..js_runtime.bridge import JSRuntimeBridge, JSRuntimeConfig
from ..config import load_config, save_upload_record

console = Console()


@click.command()
@click.argument("file_path", type=click.Path(exists=True, path_type=Path))
@click.option("--encrypt/--no-encrypt", default=True, help="Enable Lit encryption")
@click.option("--private-key", envvar="HAVEN_PRIVATE_KEY", help="Ethereum private key")
@click.option("--rpc-url", envvar="HAVEN_RPC_URL", help="Filecoin RPC URL")
@click.option("--dataset", help="Existing dataset ID to add to")
@click.option("--runtime", default="deno", type=click.Choice(["deno", "node"]))
@click.option("--temp-dir", type=click.Path(), help="Temporary directory for encrypted files")
@click.pass_context
def upload(
    ctx: click.Context,
    file_path: Path,
    encrypt: bool,
    private_key: Optional[str],
    rpc_url: Optional[str],
    dataset: Optional[str],
    runtime: str,
    temp_dir: Optional[str],
) -> None:
    """Upload a file to Filecoin with optional Lit encryption."""
    
    config = load_config()
    verbose = ctx.obj.get("verbose", False)
    
    # Validate inputs
    if not private_key:
        private_key = config.get("private_key")
    if not private_key:
        raise click.UsageError(
            "Private key required. Set with --private-key, HAVEN_PRIVATE_KEY, or 'haven config set private_key'"
        )
    
    if not rpc_url:
        rpc_url = config.get("rpc_url", "https://api.calibration.node.glif.io/rpc/v1")
    
    # Validate file size
    file_size = file_path.stat().st_size
    console.print(f"📁 File: [bold]{file_path.name}[/bold] ({format_size(file_size)})")
    
    # Run async upload
    asyncio.run(_upload_async(
        file_path=file_path,
        private_key=private_key,
        rpc_url=rpc_url,
        encrypt=encrypt,
        dataset=dataset,
        runtime=runtime,
        temp_dir=temp_dir,
        verbose=verbose,
    ))


async def _upload_async(
    file_path: Path,
    private_key: str,
    rpc_url: str,
    encrypt: bool,
    dataset: Optional[str],
    runtime: str,
    temp_dir: Optional[str],
    verbose: bool,
) -> None:
    """Async upload implementation."""
    
    # Initialize JS runtime bridge
    bridge = JSRuntimeBridge(JSRuntimeConfig(runtime=runtime, debug=verbose))
    
    encrypted_file_path: Optional[Path] = None
    encryption_metadata: Optional[dict] = None
    
    with bridge:
        # Encrypt if requested
        if encrypt:
            console.print("🔐 [cyan]Encrypting with Lit Protocol...[/cyan]")
            
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=console,
            ) as progress:
                task = progress.add_task("Reading file...", total=None)
                
                # Read file
                with open(file_path, "rb") as f:
                    file_data = list(f.read())
                
                progress.update(task, description="Encrypting with AES-256-GCM...")
                
                # Encrypt via Lit service
                encrypt_result = bridge.call(
                    "lit.encryptFile",
                    file_data,
                    private_key,
                )
                
                encryption_metadata = encrypt_result["metadata"]
                
                progress.update(task, description="Writing encrypted file...")
                
                # Write encrypted file
                if temp_dir:
                    temp_path = Path(temp_dir) / f"{file_path.name}.encrypted"
                else:
                    temp_path = file_path.parent / f"{file_path.name}.encrypted"
                
                encrypted_data = Uint8Array_from_base64(encrypt_result["encryptedFile"])
                with open(temp_path, "wb") as f:
                    f.write(encrypted_data)
                
                encrypted_file_path = temp_path
                progress.update(task, description="[green]Encryption complete[/green]")
            
            console.print(f"   Encrypted: [dim]{format_size(len(encrypted_data))}[/dim]")
        
        # Upload to Filecoin
        file_to_upload = encrypted_file_path or file_path
        
        console.print("📤 [cyan]Uploading to Filecoin...[/cyan]")
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task("Initializing...", total=None)
            
            def on_progress(stage: str, pct: int, message: str):
                progress.update(task, description=f"[{pct}%] {message}")
            
            # Register progress callback would go here
            # For now, we rely on console output from the service
            
            progress.update(task, description="Starting upload...")
            
            try:
                upload_result = bridge.call(
                    "synapse.uploadFile",
                    str(file_to_upload),
                    {
                        "privateKey": private_key,
                        "rpcUrl": rpc_url,
                        "dataSetId": dataset,
                        "encryptionEnabled": encrypt,
                    },
                )
                
                progress.update(task, description="[green]Upload complete![/green]")
            except Exception as e:
                progress.update(task, description=f"[red]Failed: {e}[/red]")
                raise click.ClickException(str(e))
        
        # Display results
        console.print("\n✅ [bold green]Upload successful![/bold green]")
        console.print(f"   Root CID: [cyan]{upload_result['rootCid']}[/cyan]")
        console.print(f"   Piece CID: [cyan]{upload_result['pieceCid']}[/cyan]")
        
        if upload_result.get('dataSetId'):
            console.print(f"   Dataset ID: {upload_result['dataSetId']}")
        
        if upload_result.get('transactionHash'):
            console.print(f"   Transaction: [dim]{upload_result['transactionHash']}[/dim]")
        
        if encrypt:
            console.print("   Encryption: [green]Enabled[/green]")
        
        # Save upload record
        save_upload_record({
            "rootCid": upload_result['rootCid'],
            "pieceCid": upload_result['pieceCid'],
            "pieceId": upload_result['pieceId'],
            "fileName": file_path.name,
            "fileSize": file_path.stat().st_size,
            "isEncrypted": encrypt,
            "encryptionMetadata": encryption_metadata,
            "datasetId": upload_result.get('dataSetId'),
            "transactionHash": upload_result.get('transactionHash'),
        })
        
        console.print("\n[dim]Upload record saved.[/dim]")
    
    # Cleanup
    if encrypted_file_path and encrypted_file_path.exists():
        encrypted_file_path.unlink()


def format_size(size_bytes: int) -> str:
    """Format bytes to human-readable string."""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"


def Uint8Array_from_base64(base64: str) -> bytes:
    """Convert base64 string to bytes."""
    import base64 as b64
    return b64.b64decode(base64)
