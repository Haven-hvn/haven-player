# Task 04: Download from Filecoin Implementation

## Assignee
Backend Developer

## Priority
High

## Estimated Effort
2 days

## Description
Implement the complete download functionality in the `haven download` CLI command, including fetching from Filecoin and optional Lit Protocol decryption.

## Current State
- `haven_cli/cli/download.py` has placeholder implementation:
  - Download logic commented out with TODO
  - JS bridge created but not used
  - Decryption not implemented
  - `info` subcommand not implemented

## Requirements

### 1. Implement Download Command
Complete the main download functionality:

```python
async def run_download() -> None:
    with Progress(...) as progress:
        task = progress.add_task("Downloading...", total=100)
        
        # Get bridge manager
        bridge = await JSBridgeManager.get_instance().get_bridge()
        
        try:
            # Connect to Synapse
            await bridge.call("synapse.connect", {
                "endpoint": config.pipeline.synapse_endpoint,
                "apiKey": config.pipeline.synapse_api_key,
            })
            
            # Download file
            progress.update(task, description="Fetching from Filecoin...")
            result = await bridge.call("synapse.download", {
                "cid": cid,
                "outputPath": str(output),
            })
            
            progress.update(task, advance=50)
            
            if decrypt:
                progress.update(task, description="Decrypting...")
                await decrypt_file(bridge, output, output)
            
            progress.update(task, advance=50)
            
            console.print(f"[green]✓[/green] Download complete: {output}")
            
        except Exception as e:
            console.print(f"[red]✗[/red] Download failed: {e}")
            raise typer.Exit(code=1)
```

### 2. Implement Decryption Flow
Add decryption support using Lit Protocol:

```python
async def decrypt_file(
    bridge: JSRuntimeBridge,
    input_path: Path,
    output_path: Path,
) -> None:
    """Decrypt a Lit-encrypted file."""
    
    # Load encryption metadata (stored alongside file or in database)
    metadata = await load_encryption_metadata(input_path)
    
    if not metadata:
        raise ValueError("No encryption metadata found for file")
    
    # Connect to Lit if needed
    await bridge.call("lit.connect", {
        "network": config.pipeline.lit_network,
    })
    
    # Decrypt
    result = await bridge.call("lit.decrypt", {
        "ciphertext": metadata.ciphertext,
        "dataToEncryptHash": metadata.data_to_encrypt_hash,
        "accessControlConditions": metadata.access_control_conditions,
        "chain": metadata.chain,
    })
    
    # Write decrypted data
    decrypted_data = base64.b64decode(result["decryptedData"])
    output_path.write_bytes(decrypted_data)
```

### 3. Implement Info Subcommand
Complete the `haven download info` command:

```python
@app.command()
def info(
    cid: str = typer.Argument(..., help="Content ID to get information about."),
) -> None:
    """Get information about a file stored on Filecoin."""
    import asyncio
    
    async def get_info() -> None:
        bridge = await JSBridgeManager.get_instance().get_bridge()
        
        await bridge.call("synapse.connect", {...})
        
        status = await bridge.call("synapse.getStatus", {"cid": cid})
        
        console.print(f"[bold]CID:[/bold] {cid}")
        console.print(f"[bold]Status:[/bold] {status['status']}")
        
        if status.get('deals'):
            table = Table(title="Storage Deals")
            table.add_column("Deal ID")
            table.add_column("Provider")
            table.add_column("Status")
            table.add_column("Start Epoch")
            table.add_column("End Epoch")
            
            for deal in status['deals']:
                table.add_row(
                    deal['dealId'],
                    deal['provider'],
                    deal['status'],
                    str(deal['startEpoch']),
                    str(deal['endEpoch']),
                )
            
            console.print(table)
    
    asyncio.run(get_info())
```

### 4. Add Encryption Metadata Storage
Store and retrieve encryption metadata:

```python
async def load_encryption_metadata(file_path: Path) -> Optional[EncryptionMetadata]:
    """Load encryption metadata for a file from database or sidecar."""
    
    # Try database first
    from haven_cli.database.repositories import VideoRepository
    video = await VideoRepository().get_by_cid(cid)
    if video and video.encryption_metadata:
        return video.encryption_metadata
    
    # Try sidecar file
    metadata_path = file_path.with_suffix(file_path.suffix + ".lit")
    if metadata_path.exists():
        data = json.loads(metadata_path.read_text())
        return EncryptionMetadata(**data)
    
    return None

async def save_encryption_metadata(
    file_path: Path,
    metadata: EncryptionMetadata,
) -> None:
    """Save encryption metadata as sidecar file."""
    metadata_path = file_path.with_suffix(file_path.suffix + ".lit")
    metadata_path.write_text(json.dumps({
        "ciphertext": metadata.ciphertext,
        "data_to_encrypt_hash": metadata.data_to_encrypt_hash,
        "access_control_conditions": metadata.access_control_conditions,
        "chain": metadata.chain,
    }))
```

## Files to Modify

### Modify
- `haven_cli/cli/download.py` - Complete implementation
- `haven_cli/js_runtime/protocol.py` - Add download method constants

### Create
- `haven_cli/crypto/__init__.py`
- `haven_cli/crypto/metadata.py` - Encryption metadata handling

## Acceptance Criteria
- [ ] `haven download <cid> --output <path>` downloads file
- [ ] Download progress displayed correctly
- [ ] `--decrypt` flag triggers Lit decryption
- [ ] `haven download info <cid>` shows storage details
- [ ] Proper error messages for missing files
- [ ] Handles network errors gracefully
- [ ] Works with files uploaded by `haven upload`

## Technical Notes
- Use streaming for large files
- Store encryption metadata in database and/or as sidecar
- Verify CID format before attempting download
- Consider caching downloaded files

## Dependencies
- Task 02: Synapse SDK integration (download method)
- Task 03: JS Bridge improvements
- Sprint 1: Database (for encryption metadata lookup)

## Blocking
- None (end of sprint 2)
