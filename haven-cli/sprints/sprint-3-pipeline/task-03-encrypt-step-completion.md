# Task 03: Encryption Pipeline Step Completion

## Assignee
Backend Developer

## Priority
High

## Estimated Effort
2 days

## Description
Complete the Lit Protocol encryption step by integrating with the JS Runtime Bridge to perform actual encryption operations.

## Current State
- `haven_cli/pipeline/steps/encrypt_step.py` has placeholder implementations:
  - `_get_js_bridge()` - Returns raw bridge, not from manager
  - `_encrypt_with_lit()` - Returns placeholder hash
  - `_get_access_conditions()` - Returns basic placeholder conditions

## Requirements

### 1. Integrate JS Bridge Manager
Use the managed bridge for reliability:

```python
async def _get_js_bridge(self) -> JSRuntimeBridge:
    """Get the JS Runtime Bridge for Lit SDK communication."""
    from haven_cli.js_runtime.manager import JSBridgeManager
    return await JSBridgeManager.get_instance().get_bridge()
```

### 2. Implement Real Encryption
Call Lit Protocol via JS bridge:

```python
async def _encrypt_with_lit(
    self,
    bridge: JSRuntimeBridge,
    video_path: str,
    access_conditions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Encrypt content using Lit Protocol via JS bridge."""
    
    # Ensure Lit is connected
    await bridge.call("lit.connect", {
        "network": self._config.get("lit_network", "datil-dev"),
    })
    
    # Read file content
    with open(video_path, "rb") as f:
        content = f.read()
    
    # Encrypt via Lit Protocol
    result = await bridge.call("lit.encrypt", {
        "data": base64.b64encode(content).decode(),
        "accessControlConditions": access_conditions,
        "chain": self._config.get("chain", "ethereum"),
    })
    
    # Store ciphertext to file
    encrypted_path = video_path + ".enc"
    with open(encrypted_path, "wb") as f:
        f.write(base64.b64decode(result["ciphertext"]))
    
    return {
        "ciphertext_path": encrypted_path,
        "data_to_encrypt_hash": result["dataToEncryptHash"],
        "access_control_condition_hash": result["accessControlConditionHash"],
        "chain": self._config.get("chain", "ethereum"),
    }
```

### 3. Configurable Access Conditions
Support various access control patterns:

```python
def _get_access_conditions(
    self,
    context: PipelineContext,
) -> List[Dict[str, Any]]:
    """Get access control conditions for encryption."""
    
    # Check for explicit conditions in context
    if "access_conditions" in context.options:
        return context.options["access_conditions"]
    
    # Check for preset patterns
    pattern = context.options.get("access_pattern", "owner_only")
    
    if pattern == "owner_only":
        return self._owner_only_conditions(context)
    elif pattern == "nft_gated":
        return self._nft_gated_conditions(context)
    elif pattern == "token_gated":
        return self._token_gated_conditions(context)
    elif pattern == "public":
        return self._public_conditions()
    else:
        raise ValueError(f"Unknown access pattern: {pattern}")

def _owner_only_conditions(self, context: PipelineContext) -> List[Dict[str, Any]]:
    """Access restricted to wallet owner."""
    wallet_address = self._config.get("owner_wallet")
    if not wallet_address:
        raise ValueError("owner_wallet required for owner_only pattern")
    
    return [{
        "contractAddress": "",
        "standardContractType": "",
        "chain": self._config.get("chain", "ethereum"),
        "method": "",
        "parameters": [":userAddress"],
        "returnValueTest": {
            "comparator": "=",
            "value": wallet_address,
        },
    }]

def _nft_gated_conditions(self, context: PipelineContext) -> List[Dict[str, Any]]:
    """Access restricted to NFT holders."""
    contract = context.options.get("nft_contract")
    if not contract:
        raise ValueError("nft_contract required for nft_gated pattern")
    
    return [{
        "contractAddress": contract,
        "standardContractType": "ERC721",
        "chain": self._config.get("chain", "ethereum"),
        "method": "balanceOf",
        "parameters": [":userAddress"],
        "returnValueTest": {
            "comparator": ">",
            "value": "0",
        },
    }]
```

### 4. Update Context with Encryption Data
Store encryption results for later steps:

```python
# After successful encryption
context.encryption_metadata = EncryptionMetadata(
    ciphertext=result["ciphertext_path"],
    data_to_encrypt_hash=result["data_to_encrypt_hash"],
    access_control_conditions=access_conditions,
    chain=result["chain"],
)

# Update video path to encrypted version
context.encrypted_video_path = result["ciphertext_path"]
```

### 5. Save Encryption Metadata
Store metadata for later decryption:

```python
async def _save_encryption_metadata(
    self,
    video_id: int,
    metadata: EncryptionMetadata,
) -> None:
    """Save encryption metadata to database."""
    from haven_cli.database.repositories import VideoRepository
    
    repo = VideoRepository()
    await repo.update(video_id, 
        encrypted=True,
        encryption_metadata=metadata.to_dict(),
    )
```

## Files to Modify

### Modify
- `haven_cli/pipeline/steps/encrypt_step.py` - Complete implementation
- `haven_cli/pipeline/context.py` - Add encrypted_video_path field

## Acceptance Criteria
- [ ] Can encrypt video files via Lit Protocol
- [ ] Access conditions configurable (owner, NFT, token)
- [ ] Encryption metadata saved to database
- [ ] Original file replaced with encrypted version in pipeline
- [ ] Decryption metadata stored for later retrieval
- [ ] Error handling for Lit connection issues
- [ ] Unit tests with mocked JS bridge

## Technical Notes
- Large files should use chunked encryption
- Consider streaming for memory efficiency
- Store original file hash for integrity verification
- Access conditions must be valid for target chain

## Dependencies
- Sprint 2 Task 01: Lit Protocol integration
- Sprint 2 Task 03: JS Bridge improvements

## Blocking
- Task 04: Upload step (uploads encrypted file)
