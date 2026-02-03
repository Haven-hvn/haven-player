# Task 05: Arkiv Blockchain Sync Step

## Assignee
Web3 Developer

## Priority
High

## Estimated Effort
3 days

## Description
Complete the Arkiv blockchain synchronization step to create permanent, queryable records of archived content on-chain.

## Current State
- `haven_cli/pipeline/steps/sync_step.py` has placeholder implementations:
  - `_get_arkiv_client()` - Returns None
  - `_find_existing_entity()` - Returns None (always creates new)
  - `_create_entity()` - Returns fake entity key
  - `_update_entity()` - Returns fake entity key
  - `_update_database()` - No-op
- `js-services/main.ts` has placeholder Arkiv methods:
  - `arkiv.sync` - Returns random txHash
  - `arkiv.verify` - Returns verified: true
  - `arkiv.getRecord` - Returns found: false

## Requirements

### 1. Arkiv Client Implementation
Create client for blockchain interaction:

```typescript
// In js-services/arkiv-wrapper.ts
export interface ArkivWrapper {
  readonly isConnected: boolean;
  connect(params: ArkivConnectParams): Promise<ArkivConnectResult>;
  createEntity(params: CreateEntityParams): Promise<EntityResult>;
  updateEntity(params: UpdateEntityParams): Promise<EntityResult>;
  getEntity(params: GetEntityParams): Promise<Entity | null>;
  queryEntities(params: QueryParams): Promise<Entity[]>;
}

class ArkivWrapperImpl implements ArkivWrapper {
  private provider: ethers.Provider | null = null;
  private contract: ethers.Contract | null = null;
  
  async connect(params: ArkivConnectParams): Promise<ArkivConnectResult> {
    this.provider = new ethers.JsonRpcProvider(params.rpcUrl);
    
    const signer = new ethers.Wallet(params.privateKey, this.provider);
    
    this.contract = new ethers.Contract(
      params.contractAddress,
      ARKIV_ABI,
      signer
    );
    
    return { connected: true };
  }
  
  async createEntity(params: CreateEntityParams): Promise<EntityResult> {
    const tx = await this.contract.createEntity(
      params.payload,
      params.attributes,
      params.expiration
    );
    
    const receipt = await tx.wait();
    const entityKey = this.extractEntityKey(receipt);
    
    return {
      entityKey,
      transactionHash: receipt.hash,
    };
  }
}
```

### 2. Python Step Integration
Complete the sync step:

```python
async def _get_arkiv_client(self, config: Dict[str, Any]) -> JSRuntimeBridge:
    """Get Arkiv client via JS bridge."""
    from haven_cli.js_runtime.manager import JSBridgeManager
    
    bridge = await JSBridgeManager.get_instance().get_bridge()
    
    # Connect to Arkiv
    await bridge.call("arkiv.connect", {
        "rpcUrl": config["rpc_url"],
        "privateKey": config["private_key"],
        "contractAddress": config.get("contract_address"),
    })
    
    return bridge

async def _find_existing_entity(
    self,
    client: JSRuntimeBridge,
    cid_hash: str,
) -> Optional[Dict[str, Any]]:
    """Find existing entity by CID hash."""
    result = await client.call("arkiv.getRecord", {
        "attribute": "cid_hash",
        "value": cid_hash,
    })
    
    if result.get("found"):
        return result["entity"]
    return None

async def _create_entity(
    self,
    client: JSRuntimeBridge,
    payload: Dict[str, Any],
    attributes: Dict[str, str],
) -> Dict[str, Any]:
    """Create a new entity on Arkiv."""
    config = self._get_arkiv_config()
    
    result = await client.call("arkiv.sync", {
        "payload": payload,
        "attributes": attributes,
        "expiration": config.get("expiration_seconds", 31536000),
    })
    
    return {
        "entity_key": result["recordId"],
        "transaction_hash": result["txHash"],
    }
```

### 3. Payload Construction
Build comprehensive entity payload:

```python
def _build_payload(self, context: PipelineContext) -> Dict[str, Any]:
    """Build the entity payload for Arkiv."""
    payload = {
        "version": "1.0",
        "type": "video",
        "archived_at": datetime.utcnow().isoformat(),
    }
    
    # Video metadata
    if context.video_metadata:
        payload.update({
            "title": context.video_metadata.title,
            "duration": context.video_metadata.duration,
            "file_size": context.video_metadata.file_size,
            "mime_type": context.video_metadata.mime_type,
            "phash": context.video_metadata.phash,
            "creator_handle": context.video_metadata.creator_handle,
            "source_uri": context.video_metadata.source_uri,
        })
    
    # Upload result
    if context.upload_result:
        payload.update({
            "root_cid": context.upload_result.root_cid,
            "piece_cid": context.upload_result.piece_cid,
        })
    
    # Analysis result
    if context.analysis_result:
        payload.update({
            "has_ai_data": True,
            "tag_count": len(context.analysis_result.tags),
            "timestamp_count": len(context.analysis_result.timestamps),
            "analysis_confidence": context.analysis_result.confidence,
        })
    
    # Encryption info
    if context.encryption_metadata:
        payload.update({
            "encrypted": True,
            "encryption_chain": context.encryption_metadata.chain,
        })
    
    return payload
```

### 4. Attribute Indexing
Build searchable attributes:

```python
def _build_attributes(self, context: PipelineContext) -> Dict[str, str]:
    """Build entity attributes for Arkiv indexing."""
    attributes = {}
    
    # CID hash for duplicate detection
    if context.upload_result:
        cid_hash = hashlib.sha256(
            context.upload_result.root_cid.encode()
        ).hexdigest()
        attributes["cid_hash"] = cid_hash
        attributes["root_cid"] = context.upload_result.root_cid
    
    # pHash for content matching
    if context.video_metadata and context.video_metadata.phash:
        attributes["phash"] = context.video_metadata.phash
    
    # Source URI for provenance
    if context.video_metadata and context.video_metadata.source_uri:
        attributes["source_uri"] = context.video_metadata.source_uri
    
    # Content type
    if context.video_metadata:
        attributes["mime_type"] = context.video_metadata.mime_type
    
    return attributes
```

### 5. Database Update
Save entity key:

```python
async def _update_database(
    self,
    video_path: str,
    entity_key: str,
) -> None:
    """Update database with entity key."""
    from haven_cli.database.repositories import VideoRepository
    
    repo = VideoRepository()
    video = await repo.get_by_path(video_path)
    
    if video:
        await repo.update(video.id, arkiv_entity_key=entity_key)
```

## Files to Create/Modify

### Create
- `js-services/arkiv-wrapper.ts` - Arkiv blockchain client

### Modify
- `haven_cli/pipeline/steps/sync_step.py` - Complete implementation
- `js-services/main.ts` - Add Arkiv wrapper integration
- `js-services/types.ts` - Add Arkiv types

## Acceptance Criteria
- [ ] Can connect to Arkiv smart contract
- [ ] Entity created with video metadata
- [ ] Attributes indexed for search
- [ ] Existing entities detected and updated
- [ ] Transaction hash recorded
- [ ] Database updated with entity key
- [ ] Integration test with testnet

## Technical Notes
- Use appropriate gas settings for transactions
- Implement transaction confirmation waiting
- Handle nonce management for concurrent uploads
- Consider batching for multiple videos

## Code Reuse from Electron App

### HIGH REUSE - Complete Production Implementation Available
The electron app backend has a **complete, production-tested Arkiv sync implementation** (~700 lines):

#### Source Files to Reference:
1. **`backend/app/services/arkiv_sync.py`** - Complete ArkivSyncClient
   - Uses `arkiv` Python SDK directly (no JS bridge needed!)
   - Entity creation and update
   - Payload and attribute building
   - Transaction logging with block explorer hints
   - Catalog restore from Arkiv
   - **Reuse Level: 90%** - Nearly direct port

2. **`backend/app/services/evm_utils.py`** - EVM utilities
   - Gas error handling
   - Wallet address extraction
   - Chain detection
   - **Reuse Level: 85%** - Direct port

#### Key Code to Port:

```python
# From backend/app/services/arkiv_sync.py - Client setup
from arkiv import Arkiv
from arkiv.account import NamedAccount
from arkiv.provider import ProviderBuilder
from arkiv.types import Attributes, EntityKey

class ArkivSyncClient:
    def __init__(self, config: ArkivSyncConfig):
        self.config = config
    
    def _get_client(self) -> Arkiv:
        provider = ProviderBuilder().custom(self.config.rpc_url).build()
        account = NamedAccount.from_private_key("haven-node", self.config.private_key)
        return Arkiv(provider=provider, account=account)
```

```python
# From backend/app/services/arkiv_sync.py - Payload building
def _build_payload(video: Video, segment_payload) -> dict:
    """Build optimized payload for Arkiv entity."""
    payload = {}
    
    # For encrypted videos: store CID encryption metadata
    if video.is_encrypted:
        if video.cid_encryption_metadata:
            payload["cid_encryption_metadata"] = video.cid_encryption_metadata
        if video.lit_encryption_metadata:
            payload["lit_encryption_metadata"] = video.lit_encryption_metadata
    else:
        if video.filecoin_root_cid:
            payload["filecoin_root_cid"] = video.filecoin_root_cid
    
    if video.cid_hash:
        payload["cid_hash"] = video.cid_hash
    if video.vlm_json_cid:
        payload["vlm_json_cid"] = video.vlm_json_cid
    
    payload["is_encrypted"] = video.is_encrypted
    return payload
```

```python
# From backend/app/services/arkiv_sync.py - Attribute building
def _build_attributes(video: Video) -> dict[str, str | int]:
    """Public attributes sent to Arkiv."""
    attributes = {}
    if video.title:
        attributes["title"] = video.title
    if video.creator_handle:
        attributes["creator_handle"] = video.creator_handle
    if video.mint_id:
        attributes["mint_id"] = video.mint_id
    if video.is_encrypted:
        attributes["is_encrypted"] = 1
        if video.encrypted_filecoin_cid:
            attributes["encrypted_cid"] = video.encrypted_filecoin_cid
    if video.phash:
        attributes["phash"] = video.phash
    return attributes
```

```python
# From backend/app/services/arkiv_sync.py - Sync operation
def sync_video(self, db_session, video, segment_payload=None) -> EntityKey | None:
    if not self.config.enabled or not video.share_to_arkiv:
        return None
    
    client = self._get_client()
    payload = _build_payload(video, segment_payload)
    attributes = _build_attributes(video)
    payload_bytes = json.dumps(payload).encode("utf-8")
    
    if video.arkiv_entity_key:
        # Update existing entity
        receipt = client.arkiv.update_entity(
            EntityKey(video.arkiv_entity_key),
            payload=payload_bytes,
            content_type="application/json",
            attributes=Attributes(attributes),
            expires_in=self.config.expires_in,
        )
        return EntityKey(video.arkiv_entity_key)
    else:
        # Create new entity
        entity_key, receipt = client.arkiv.create_entity(
            payload=payload_bytes,
            content_type="application/json",
            attributes=Attributes(attributes),
            expires_in=self.config.expires_in,
        )
        video.arkiv_entity_key = str(entity_key)
        db_session.commit()
        return entity_key
```

### Implementation Strategy
1. **Use** `arkiv` Python SDK directly (no JS bridge needed!)
2. **Copy** `backend/app/services/arkiv_sync.py` → `haven_cli/services/arkiv_sync.py`
3. **Copy** `backend/app/services/evm_utils.py` → `haven_cli/services/evm_utils.py`
4. **Adapt** database access for CLI's repository pattern
5. **Remove** JS bridge approach (Python SDK is simpler)

### Key Insight: No JS Bridge Needed!
The electron app uses the `arkiv` Python SDK directly, not a JS bridge. This simplifies the CLI implementation significantly:
- Install: `pip install arkiv`
- Direct Python calls, no IPC overhead
- Same code as electron app backend

### What's NOT Reusable
- FastAPI session management
- Some video fields specific to electron app

### What's NEW for CLI
- CLI-specific configuration loading
- Integration with CLI pipeline context

## Dependencies
- Task 04: Upload step (CID needed for sync)
- Sprint 1: Database

## Blocking
- None (final pipeline step)
