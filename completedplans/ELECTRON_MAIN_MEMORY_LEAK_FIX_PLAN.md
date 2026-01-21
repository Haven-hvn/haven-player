# Electron Main Process Memory Leak Fix Plan

## Overview

This plan addresses memory leaks in the Electron main process (`frontend/src/main.ts`) caused by:
1. IPC listeners not being properly tracked and cleaned up
2. Missing memory monitoring
3. Intervals/timers not being cleared on app quit
4. Event listeners accumulating on window close/reopen cycles

## Current State Analysis

### Existing IPC Handlers (using `ipcMain.handle`)
The current implementation uses `ipcMain.handle()` which is better than `ipcMain.on()` because handlers can be removed with `ipcMain.removeHandler()`. However, there's no centralized tracking or cleanup.

**Current handlers identified:**
- `select-video`
- `add-magnet-url`
- `read-video-file`
- `get-filecoin-config`
- `upload-to-filecoin`
- `save-filecoin-config`
- `get-arkiv-config`
- `save-arkiv-config`
- `validate-evm-config`
- `check-evm-balance`
- `start-backend`
- `stop-backend`
- `restart-backend`
- `playback:file-exists`
- `playback:get-gateway-config`
- `playback:set-gateway-config`
- `decrypt-text-with-lit`
- `upload-worker:start`
- `upload-worker:stop`
- `upload-worker:get-status`
- `upload-worker:update-config`

### Potential Memory Leak Sources
1. **No IPC handler cleanup** - Handlers registered but never removed
2. **No memory monitoring** - No visibility into memory usage
3. **Event listener on webContents** - `before-input-event` listener not tracked
4. **Backend process** - Cleanup exists but could be more robust
5. **Upload worker** - No cleanup on app quit

---

## Implementation Plan

### Phase 1: Centralized IPC Handler Management

#### 1.1 Create Handler Registry
```typescript
// Add at top of main.ts after imports
const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();
```

#### 1.2 Create Registration Function
```typescript
function registerIPCHandlers(): void {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {
    'select-video': handleSelectVideo,
    'add-magnet-url': handleAddMagnetUrl,
    'read-video-file': handleReadVideoFile,
    'get-filecoin-config': handleGetFilecoinConfig,
    'upload-to-filecoin': handleUploadToFilecoin,
    'save-filecoin-config': handleSaveFilecoinConfig,
    'get-arkiv-config': handleGetArkivConfig,
    'save-arkiv-config': handleSaveArkivConfig,
    'validate-evm-config': handleValidateEvmConfig,
    'check-evm-balance': handleCheckEvmBalance,
    'start-backend': handleStartBackend,
    'stop-backend': handleStopBackend,
    'restart-backend': handleRestartBackend,
    'playback:file-exists': handlePlaybackFileExists,
    'playback:get-gateway-config': handlePlaybackGetGatewayConfig,
    'playback:set-gateway-config': handlePlaybackSetGatewayConfig,
    'decrypt-text-with-lit': handleDecryptTextWithLit,
    'upload-worker:start': handleUploadWorkerStart,
    'upload-worker:stop': handleUploadWorkerStop,
    'upload-worker:get-status': handleUploadWorkerGetStatus,
    'upload-worker:update-config': handleUploadWorkerUpdateConfig,
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
    ipcHandlers.set(channel, handler);
  }
  
  console.log(`✅ Registered ${ipcHandlers.size} IPC handlers`);
}
```

#### 1.3 Create Cleanup Function
```typescript
function cleanupIPCHandlers(): void {
  for (const channel of ipcHandlers.keys()) {
    try {
      ipcMain.removeHandler(channel);
    } catch (error) {
      console.warn(`Failed to remove handler for ${channel}:`, error);
    }
  }
  console.log(`🧹 Cleaned up ${ipcHandlers.size} IPC handlers`);
  ipcHandlers.clear();
}
```

#### 1.4 Refactor Handlers to Named Functions
Convert all inline `ipcMain.handle()` callbacks to named functions for better organization and testability.

---

### Phase 2: Memory Monitoring

#### 2.1 Add Memory Check Interval
```typescript
let memoryCheckInterval: NodeJS.Timeout | null = null;

function startMemoryMonitoring(): void {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
  }
  
  memoryCheckInterval = setInterval(() => {
    const memoryUsage = process.memoryUsage();
    
    console.log('📊 Main process memory:', {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
    });

    // Warn if heap exceeds 200MB when idle
    if (memoryUsage.heapUsed > 200 * 1024 * 1024) {
      console.warn('⚠️ Main process memory high - heap exceeds 200MB');
      
      // Trigger manual GC in development if available
      if (!app.isPackaged && global.gc) {
        console.log('🗑️ Running manual GC...');
        global.gc();
      }
    }
  }, 60000); // Every minute
}

function stopMemoryMonitoring(): void {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
    memoryCheckInterval = null;
    console.log('🛑 Memory monitoring stopped');
  }
}
```

#### 2.2 Add IPC Handler for Memory Stats (Optional)
```typescript
// Allow renderer to request memory stats
async function handleGetMemoryStats(): Promise<NodeJS.MemoryUsage> {
  return process.memoryUsage();
}
```

---

### Phase 3: Lifecycle Event Cleanup

#### 3.1 Update `app.whenReady()`
```typescript
app.whenReady().then(async () => {
  registerIPCHandlers();
  startMemoryMonitoring();
  createWindow();
  await tryStartBackend();
});
```

#### 3.2 Update `window-all-closed` Handler
```typescript
app.on('window-all-closed', () => {
  // Clean up IPC handlers when all windows close
  cleanupIPCHandlers();
  
  // Stop memory monitoring
  stopMemoryMonitoring();
  
  // Stop upload worker
  try {
    const worker = getUploadWorker();
    if (worker.isWorkerRunning()) {
      worker.stop();
      console.log('🛑 Upload worker stopped on window close');
    }
  } catch (error) {
    console.warn('Failed to stop upload worker:', error);
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

#### 3.3 Update `activate` Handler (macOS)
```typescript
app.on('activate', () => {
  if (mainWindow === null) {
    // Re-register handlers if they were cleaned up
    if (ipcHandlers.size === 0) {
      registerIPCHandlers();
      startMemoryMonitoring();
    }
    createWindow();
  }
});
```

#### 3.4 Update `will-quit` Handler
```typescript
app.on('will-quit', () => {
  // Final cleanup
  stopMemoryMonitoring();
  cleanupIPCHandlers();
  
  // Stop backend process
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    console.log('🛑 Backend process killed on quit');
  }
  
  // Stop upload worker
  try {
    const worker = getUploadWorker();
    if (worker.isWorkerRunning()) {
      worker.stop();
    }
  } catch (error) {
    // Ignore errors during quit
  }
});
```

---

### Phase 4: Window Event Listener Cleanup

#### 4.1 Track Window Event Listeners
```typescript
let webContentsListeners: Array<{ event: string; listener: (...args: unknown[]) => void }> = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  registerRenderCrashLogger(mainWindow.webContents);

  // Track the before-input-event listener
  const devToolsListener = (event: Electron.Event, input: Electron.Input) => {
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools();
      }
    }
  };
  
  mainWindow.webContents.on('before-input-event', devToolsListener);
  webContentsListeners.push({ event: 'before-input-event', listener: devToolsListener as (...args: unknown[]) => void });

  // ... rest of window setup

  mainWindow.on('closed', () => {
    // Clean up webContents listeners
    webContentsListeners = [];
    mainWindow = null;
  });
}
```

---

### Phase 5: File Structure Refactoring (Optional)

For better maintainability, consider splitting the main process code:

```
frontend/src/
├── main.ts                    # Entry point, app lifecycle
├── main/
│   ├── ipc/
│   │   ├── index.ts          # Handler registration/cleanup
│   │   ├── fileHandlers.ts   # File-related handlers
│   │   ├── configHandlers.ts # Config-related handlers
│   │   ├── backendHandlers.ts # Backend control handlers
│   │   └── uploadHandlers.ts # Upload worker handlers
│   ├── memory/
│   │   └── monitor.ts        # Memory monitoring
│   └── utils/
│       └── python.ts         # Python/venv utilities
```

---

## Implementation Checklist

### Phase 1: IPC Handler Management
- [ ] Add `ipcHandlers` Map at module level
- [ ] Create `registerIPCHandlers()` function
- [ ] Create `cleanupIPCHandlers()` function
- [ ] Refactor all inline handlers to named functions:
  - [ ] `handleSelectVideo`
  - [ ] `handleAddMagnetUrl`
  - [ ] `handleReadVideoFile`
  - [ ] `handleGetFilecoinConfig`
  - [ ] `handleUploadToFilecoin`
  - [ ] `handleSaveFilecoinConfig`
  - [ ] `handleGetArkivConfig`
  - [ ] `handleSaveArkivConfig`
  - [ ] `handleValidateEvmConfig`
  - [ ] `handleCheckEvmBalance`
  - [ ] `handleStartBackend`
  - [ ] `handleStopBackend`
  - [ ] `handleRestartBackend`
  - [ ] `handlePlaybackFileExists`
  - [ ] `handlePlaybackGetGatewayConfig`
  - [ ] `handlePlaybackSetGatewayConfig`
  - [ ] `handleDecryptTextWithLit`
  - [ ] `handleUploadWorkerStart`
  - [ ] `handleUploadWorkerStop`
  - [ ] `handleUploadWorkerGetStatus`
  - [ ] `handleUploadWorkerUpdateConfig`

### Phase 2: Memory Monitoring
- [ ] Add `memoryCheckInterval` variable
- [ ] Implement `startMemoryMonitoring()` function
- [ ] Implement `stopMemoryMonitoring()` function
- [ ] Add optional `get-memory-stats` IPC handler

### Phase 3: Lifecycle Cleanup
- [ ] Update `app.whenReady()` to call registration functions
- [ ] Update `window-all-closed` to clean up handlers
- [ ] Update `activate` to re-register handlers on macOS
- [ ] Update `will-quit` for final cleanup
- [ ] Update `before-quit` handler

### Phase 4: Window Listener Cleanup
- [ ] Track webContents event listeners
- [ ] Clean up listeners on window close

### Phase 5: Testing
- [ ] Test window close/reopen cycle on macOS
- [ ] Verify memory doesn't grow after repeated operations
- [ ] Test backend start/stop/restart cycles
- [ ] Verify all IPC handlers work after re-registration

---

## Expected Benefits

1. **Reduced Memory Leaks**: Proper cleanup prevents listener accumulation
2. **Better Visibility**: Memory monitoring helps identify issues early
3. **Improved Stability**: Clean shutdown prevents orphaned processes
4. **Maintainability**: Centralized handler management is easier to maintain
5. **macOS Support**: Proper handling of window close/reopen cycle

---

## Risk Mitigation

1. **Backward Compatibility**: All existing IPC channels remain the same
2. **Gradual Rollout**: Can implement phases incrementally
3. **Fallback**: If cleanup fails, handlers can be re-registered
4. **Logging**: Comprehensive logging helps debug issues

---

## References

- [Electron IPC Best Practices](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Node.js Memory Management](https://nodejs.org/en/docs/guides/diagnostics/memory/using-gc-traces)
- [Electron App Lifecycle](https://www.electronjs.org/docs/latest/api/app#events)
