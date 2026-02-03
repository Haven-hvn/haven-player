# Task 04: Upload Pipeline Step Completion

## Assignee
Backend Developer

## Priority
Critical

## Estimated Effort
2 days

## Description
Complete the Filecoin upload step by integrating with the Synapse SDK via the JS Runtime Bridge to perform actual file uploads.

## Current State
- `haven_cli/pipeline/steps/upload_step.py` has placeholder implementations:
  - `_get_js_bridge()` - Returns raw bridge
  - `_upload_to_filecoin()` - Returns fake CID
  - `_get_filecoin_config()` - Returns basic config
  - `_update_database()` - No-op

## Requirements

### 1. Integrate JS Bridge Manager
Use managed bridge:

```python
async def _get_js_bridge(self) -> JSRuntimeBridge:
    """Get the JS Runtime Bridge for Synapse SDK communication."""
    from haven_cli.js_runtime.manager import JSBridgeManager
    return await JSBridgeManager.get_instance().get_bridge()
```

### 2. Implement Real Upload
Upload to Filecoin via Synapse SDK:

```python
async def _upload_to_filecoin(
    self,
    bridge: JSRuntimeBridge,
    video_path: str,
    config: Dict[str, Any],
    encryption_metadata: Optional[EncryptionMetadata],
    on_progress: Callable[[str, int], Awaitable[None]],
) -> Dict[str, Any]:
    """Upload content to Filecoin via Synapse SDK."""
    
    # Ensure Synapse is connected
    await bridge.call("synapse.connect", {
        "endpoint": config.get("synapse_endpoint"),
        "apiKey": config.get("synapse_api_key"),
    })
    
    await on_progress("preparing", 10)
    
    # Determine file to upload (encrypted or original)
    file_to_upload = video_path
    
    # Upload to Filecoin
    await on_progress("uploading", 20)
    
    result = await bridge.call("synapse.upload", {
        "filePath": file_to_upload,
        "metadata": {
            "encrypted": encryption_metadata is not None,
            "dataSetId": config.get("data_set_id"),
        },
        "onProgress": True,  # Enable progress notifications
    })
    
    await on_progress("confirming", 90)
    
    # Wait for deal confirmation (optional)
    if config.get("wait_for_deal", False):
        status = await bridge.call("synapse.getStatus", {"cid": result["cid"]})
        while status["status"] == "pending":
            await asyncio.sleep(5)
            status = await bridge.call("synapse.getStatus", {"cid": result["cid"]})
    
    await on_progress("complete", 100)
    
    return {
        "root_cid": result["cid"],
        "piece_cid": result.get("pieceCid", ""),
        "deal_id": result.get("dealId", ""),
        "transaction_hash": result.get("txHash", ""),
    }
```

### 3. Handle Progress Notifications
Listen for progress events from JS runtime:

```python
async def process(self, context: PipelineContext) -> StepResult:
    # ... setup ...
    
    # Set up progress tracking
    progress_future = asyncio.Future()
    
    def handle_progress(params: dict) -> None:
        percentage = params.get("percentage", 0)
        if percentage < 100:
            # Emit pipeline event
            asyncio.create_task(
                self._emit_event(EventType.UPLOAD_PROGRESS, context, {
                    "video_path": video_path,
                    "progress_percent": percentage,
                })
            )
    
    # Register for progress notifications
    unregister = bridge.on_notification("synapse.uploadProgress", handle_progress)
    
    try:
        result = await self._upload_to_filecoin(...)
    finally:
        unregister()
```

### 4. Configuration Loading
Load Filecoin config from context and config:

```python
def _get_filecoin_config(self, context: PipelineContext) -> Dict[str, Any]:
    """Get Filecoin configuration."""
    from haven_cli.config import get_config
    
    config = get_config()
    
    return {
        "synapse_endpoint": config.pipeline.synapse_endpoint,
        "synapse_api_key": config.pipeline.synapse_api_key,
        "data_set_id": context.options.get("dataset_id") or self._config.get("data_set_id", 1),
        "wait_for_deal": self._config.get("wait_for_deal", False),
    }
```

### 5. Database Update
Save upload results:

```python
async def _update_database(
    self,
    video_path: str,
    result: UploadResult,
) -> None:
    """Update database with upload result."""
    from haven_cli.database.repositories import VideoRepository
    
    repo = VideoRepository()
    video = await repo.get_by_path(video_path)
    
    if video:
        await repo.update(video.id,
            cid=result.root_cid,
            piece_cid=result.piece_cid,
        )
```

### 6. Retry Logic Enhancement
Improve error categorization and retry:

```python
def _categorize_error(self, error: Exception) -> ErrorCategory:
    """Categorize error for retry decisions."""
    error_str = str(error).lower()
    
    # Transient errors (retry)
    transient = ["timeout", "connection", "network", "rate limit", "502", "503", "504"]
    if any(p in error_str for p in transient):
        return ErrorCategory.TRANSIENT
    
    # Permanent errors (no retry)
    permanent = ["invalid", "not found", "unauthorized", "forbidden", "400", "401", "403"]
    if any(p in error_str for p in permanent):
        return ErrorCategory.PERMANENT
    
    return ErrorCategory.UNKNOWN

async def process(self, context: PipelineContext) -> StepResult:
    """Process with retry logic."""
    last_error = None
    
    for attempt in range(self.max_retries + 1):
        try:
            return await self._do_upload(context)
        except Exception as e:
            last_error = e
            category = self._categorize_error(e)
            
            if category == ErrorCategory.PERMANENT:
                break  # Don't retry permanent errors
            
            if attempt < self.max_retries:
                await asyncio.sleep(self.retry_delay_seconds * (attempt + 1))
    
    return StepResult.fail(
        self.name,
        StepError.from_exception(last_error, code="UPLOAD_ERROR"),
    )
```

## Files to Modify

### Modify
- `haven_cli/pipeline/steps/upload_step.py` - Complete implementation

## Acceptance Criteria
- [ ] Files uploaded to Filecoin via Synapse
- [ ] Valid CID returned for uploaded files
- [ ] Progress events emitted during upload
- [ ] Database updated with CID
- [ ] Retry logic works for transient errors
- [ ] Large files handled efficiently
- [ ] Integration test with actual storage

## Technical Notes
- Consider chunked uploads for large files
- Implement upload cancellation support
- Store deal ID for future reference
- Handle network interruptions gracefully

## Dependencies
- Sprint 2 Task 02: Synapse SDK integration
- Sprint 2 Task 03: JS Bridge improvements
- Task 03: Encryption step (encrypted file path)

## Blocking
- Task 05: Arkiv sync (needs CID)
