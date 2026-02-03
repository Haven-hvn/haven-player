# Task 03: JS Runtime Bridge Hardening

## Assignee
Backend Developer

## Priority
High

## Estimated Effort
3 days

## Description
Improve the JS Runtime Bridge to handle edge cases, implement proper connection pooling, and ensure reliable subprocess communication. The bridge is critical for all JS-dependent operations.

## Current State
- `haven_cli/js_runtime/bridge.py` - Core implementation exists but needs hardening
- `haven_cli/js_runtime/discovery.py` - Runtime discovery works
- `haven_cli/js_runtime/protocol.py` - JSON-RPC protocol implemented
- Issues:
  - No connection pooling/reuse
  - Limited error recovery
  - No health monitoring
  - Bridge is created fresh for each operation

## Requirements

### 1. Singleton Bridge Management
Create a bridge manager for connection reuse:

```python
class JSBridgeManager:
    """Manages JS runtime bridge lifecycle and connection pooling."""
    
    _instance: Optional['JSBridgeManager'] = None
    _bridge: Optional[JSRuntimeBridge] = None
    _lock: asyncio.Lock
    
    @classmethod
    def get_instance(cls) -> 'JSBridgeManager':
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    async def get_bridge(self) -> JSRuntimeBridge:
        """Get or create a bridge instance."""
        async with self._lock:
            if self._bridge is None or not self._bridge.is_ready:
                self._bridge = await self._create_bridge()
            return self._bridge
    
    async def _create_bridge(self) -> JSRuntimeBridge:
        """Create and start a new bridge."""
        config = RuntimeConfig(
            services_path=self._get_services_path(),
            startup_timeout=30.0,
            request_timeout=60.0,
        )
        bridge = JSRuntimeBridge(config)
        await bridge.start()
        return bridge
```

### 2. Health Monitoring
Implement background health checks:

```python
async def _health_check_loop(self) -> None:
    """Periodically check bridge health."""
    while self._running:
        try:
            if self._bridge and self._bridge.is_ready:
                is_healthy = await self._bridge.ping()
                if not is_healthy:
                    await self._restart_bridge()
            await asyncio.sleep(30)  # Check every 30 seconds
        except Exception as e:
            logger.warning(f"Health check failed: {e}")
```

### 3. Automatic Reconnection
Handle disconnections gracefully:

```python
async def call_with_retry(
    self,
    method: str,
    params: Optional[dict] = None,
    max_retries: int = 3,
) -> Any:
    """Call method with automatic retry on failure."""
    for attempt in range(max_retries):
        try:
            bridge = await self.get_bridge()
            return await bridge.call(method, params)
        except RuntimeError as e:
            if "not ready" in str(e).lower():
                await self._restart_bridge()
                continue
            raise
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(1 * (attempt + 1))
```

### 4. Graceful Shutdown
Ensure proper cleanup:

```python
async def shutdown(self) -> None:
    """Shutdown the bridge manager."""
    self._running = False
    if self._health_task:
        self._health_task.cancel()
    if self._bridge:
        await self._bridge.stop()
        self._bridge = None
```

### 5. Context Manager Support
Enable easy usage:

```python
async def __aenter__(self) -> 'JSBridgeManager':
    await self.get_bridge()  # Ensure bridge is ready
    return self

async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
    # Don't shutdown - just release
    pass
```

### 6. Update Pipeline Steps
Modify pipeline steps to use the bridge manager:

```python
# In encrypt_step.py
async def _get_js_bridge(self) -> JSRuntimeBridge:
    """Get the JS Runtime Bridge for Lit SDK communication."""
    from haven_cli.js_runtime.manager import JSBridgeManager
    return await JSBridgeManager.get_instance().get_bridge()
```

## Files to Create/Modify

### Create
- `haven_cli/js_runtime/manager.py` - Bridge manager with singleton pattern

### Modify
- `haven_cli/js_runtime/bridge.py` - Add reconnection logic
- `haven_cli/pipeline/steps/encrypt_step.py` - Use bridge manager
- `haven_cli/pipeline/steps/upload_step.py` - Use bridge manager
- `haven_cli/cli/download.py` - Use bridge manager

## Acceptance Criteria
- [ ] Bridge is reused across multiple operations
- [ ] Automatic reconnection on failure
- [ ] Health checks run in background
- [ ] Graceful shutdown works
- [ ] Memory usage stable over time
- [ ] Concurrent requests handled correctly
- [ ] Unit tests for reconnection logic

## Technical Notes
- Use weak references if needed to prevent memory leaks
- Consider connection timeouts for stuck processes
- Log all reconnection attempts for debugging
- Handle subprocess crashes gracefully

## Dependencies
- Sprint 1: Configuration (for runtime settings)

## Blocking
- Sprint 3: All pipeline steps using JS bridge
