# IPC Listener Cleanup Plan

## Executive Summary

This document outlines a plan to address potential IPC listener accumulation issues in the Haven Player frontend. After a comprehensive audit, we found that the codebase is **largely safe** from IPC listener leaks, with only **one file** requiring attention.

## Audit Results

### Files Audited

| File | IPC Pattern | Status | Action Required |
|------|-------------|--------|-----------------|
| `App.tsx` | `ipcRenderer.invoke()` only | ✅ Safe | None |
| `DePinDashboard.tsx` | `ipcRenderer.invoke()` only | ✅ Safe | None |
| `LogViewer.tsx` | No IPC (console capture) | ✅ Safe | None |
| `RecordingMonitor.tsx` | HTTP polling only | ✅ Safe | None |
| `PluginManagementPage.tsx` | Uses hooks (no direct IPC) | ✅ Safe | None |
| `useFilecoinUpload.ts` | `ipcRenderer.on()` with manual cleanup | ⚠️ Needs Improvement | Refactor |
| `useLiveKitRecording.ts` | HTTP polling only | ✅ Safe | None |

### Key Findings

1. **Most IPC usage is safe**: The codebase primarily uses `ipcRenderer.invoke()` which is a request/response pattern that doesn't accumulate listeners.

2. **Only one listener pattern found**: `useFilecoinUpload.ts` is the only file using `ipcRenderer.on()` for event listening.

3. **Existing cleanup is partial**: The cleanup in `useFilecoinUpload.ts` happens in try/catch blocks but **not in a useEffect cleanup function**, which means:
   - If the component unmounts during an upload, the listener may not be cleaned up
   - If multiple uploads are started rapidly, listeners could accumulate

## Current Problem in `useFilecoinUpload.ts`

```typescript
// Current implementation (problematic)
const uploadVideo = useCallback(async (videoPath: string, ...) => {
  const handleProgress = (_: unknown, payload: {...}) => {
    // Handle progress updates
  };

  // ❌ Listener added inside callback, not in useEffect
  ipcRenderer.on('filecoin-upload-progress', handleProgress);

  try {
    const result = await ipcRenderer.invoke('upload-to-filecoin', {...});
    // ✅ Cleanup on success
    ipcRenderer.removeListener('filecoin-upload-progress', handleProgress);
    return result;
  } catch (error) {
    // ✅ Cleanup on error
    ipcRenderer.removeListener('filecoin-upload-progress', handleProgress);
    throw error;
  }
  // ❌ No cleanup if component unmounts during upload
}, []);
```

### Issues:
1. **No unmount cleanup**: If component unmounts during upload, listener persists
2. **Race condition potential**: Multiple rapid uploads could add multiple listeners
3. **No leak detection**: No way to know if listeners are accumulating

---

## Solution: Create `useIPCListener` Hook

### Step 1: Create the Hook

Create a new file `frontend/src/hooks/useIPCListener.ts`:

```typescript
import { useEffect, useRef, useCallback } from 'react';

const { ipcRenderer } = require('electron');

// Track active listeners in development mode for debugging
const activeListeners = new Map<string, Set<Function>>();

export interface UseIPCListenerOptions {
  /** Whether the listener is currently enabled */
  enabled?: boolean;
}

/**
 * A hook for safely managing IPC event listeners with automatic cleanup.
 * 
 * Features:
 * - Automatic cleanup on unmount
 * - Stable handler reference via useRef
 * - Development mode leak detection
 * - Optional enable/disable control
 * 
 * @param channel - The IPC channel to listen on
 * @param handler - The callback function to handle events
 * @param deps - Dependencies array (like useEffect)
 * @param options - Additional options
 * 
 * @example
 * ```tsx
 * useIPCListener('filecoin-upload-progress', (data) => {
 *   setProgress(data.progress);
 * }, []);
 * ```
 */
export function useIPCListener<T = unknown>(
  channel: string,
  handler: (event: Electron.IpcRendererEvent, data: T) => void,
  deps: React.DependencyList = [],
  options: UseIPCListenerOptions = {}
): void {
  const { enabled = true } = options;
  const handlerRef = useRef(handler);

  // Keep handler ref up to date
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    const wrappedHandler = (event: Electron.IpcRendererEvent, data: T) => {
      handlerRef.current(event, data);
    };

    // Development mode: Track active listeners for leak detection
    if (process.env.NODE_ENV === 'development') {
      if (!activeListeners.has(channel)) {
        activeListeners.set(channel, new Set());
      }
      activeListeners.get(channel)!.add(wrappedHandler);

      const listenerCount = activeListeners.get(channel)!.size;
      console.log(`[IPC] Registered listener for "${channel}". Total: ${listenerCount}`);

      if (listenerCount > 3) {
        console.warn(
          `⚠️ Multiple listeners (${listenerCount}) on "${channel}" - possible memory leak!`
        );
      }
    }

    // Register the listener
    ipcRenderer.on(channel, wrappedHandler);

    // Cleanup function
    return () => {
      ipcRenderer.removeListener(channel, wrappedHandler);

      if (process.env.NODE_ENV === 'development') {
        activeListeners.get(channel)?.delete(wrappedHandler);
        const remaining = activeListeners.get(channel)?.size || 0;
        console.log(`[IPC] Removed listener for "${channel}". Remaining: ${remaining}`);
      }
    };
  }, [channel, enabled, ...deps]);
}

/**
 * Hook for one-time IPC event listening (like ipcRenderer.once)
 * Automatically cleans up after the first event or on unmount.
 */
export function useIPCListenerOnce<T = unknown>(
  channel: string,
  handler: (event: Electron.IpcRendererEvent, data: T) => void,
  deps: React.DependencyList = [],
  options: UseIPCListenerOptions = {}
): void {
  const { enabled = true } = options;
  const handlerRef = useRef(handler);
  const hasReceivedRef = useRef(false);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled || hasReceivedRef.current) return;

    const wrappedHandler = (event: Electron.IpcRendererEvent, data: T) => {
      if (hasReceivedRef.current) return;
      hasReceivedRef.current = true;
      handlerRef.current(event, data);
      ipcRenderer.removeListener(channel, wrappedHandler);
    };

    ipcRenderer.on(channel, wrappedHandler);

    return () => {
      ipcRenderer.removeListener(channel, wrappedHandler);
    };
  }, [channel, enabled, ...deps]);
}

/**
 * Get the current count of active listeners for a channel (development only)
 */
export function getActiveListenerCount(channel: string): number {
  if (process.env.NODE_ENV !== 'development') {
    console.warn('getActiveListenerCount is only available in development mode');
    return -1;
  }
  return activeListeners.get(channel)?.size || 0;
}

/**
 * Get all active listener channels and their counts (development only)
 */
export function getAllActiveListeners(): Map<string, number> {
  if (process.env.NODE_ENV !== 'development') {
    console.warn('getAllActiveListeners is only available in development mode');
    return new Map();
  }
  const result = new Map<string, number>();
  activeListeners.forEach((listeners, channel) => {
    result.set(channel, listeners.size);
  });
  return result;
}

export default useIPCListener;
```

### Step 2: Refactor `useFilecoinUpload.ts`

The current implementation adds/removes listeners inside the `uploadVideo` callback. This is actually a valid pattern for operation-scoped listeners, but it needs improvement for unmount safety.

**Option A: Keep operation-scoped pattern (Recommended)**

Since the listener is specific to an upload operation and needs to filter by `videoPath`, we should keep the operation-scoped pattern but add unmount safety:

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';
import { videoService } from '@/services/api';
import type { FilecoinUploadStatus, FilecoinConfig, FilecoinUploadResult } from '@/types/filecoin';
import type { UploadProgress } from '@/services/filecoinService';

const { ipcRenderer } = require('electron');

export interface UseFilecoinUploadReturn {
  uploadStatus: Record<string, FilecoinUploadStatus>;
  uploadVideo: (videoPath: string, config: FilecoinConfig, onProgressLog?: (message: string) => void) => Promise<FilecoinUploadResult>;
  cancelUpload: (videoPath: string) => void;
  clearStatus: (videoPath: string) => void;
}

export const useFilecoinUpload = (): UseFilecoinUploadReturn => {
  const [uploadStatus, setUploadStatus] = useState<Record<string, FilecoinUploadStatus>>({});
  const [uploadControllers, setUploadControllers] = useState<Record<string, AbortController>>({});
  
  // Track active listeners for cleanup on unmount
  const activeListenersRef = useRef<Map<string, Function>>(new Map());
  const isMountedRef = useRef(true);

  // Cleanup all listeners on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      
      // Clean up all active listeners
      activeListenersRef.current.forEach((handler, videoPath) => {
        ipcRenderer.removeListener('filecoin-upload-progress', handler);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[IPC] Cleaned up orphaned listener for upload: ${videoPath}`);
        }
      });
      activeListenersRef.current.clear();
    };
  }, []);

  const uploadVideo = useCallback(
    async (videoPath: string, config: FilecoinConfig, onProgressLog?: (message: string) => void): Promise<FilecoinUploadResult> => {
      // Cancel any existing upload for this video
      if (uploadControllers[videoPath]) {
        uploadControllers[videoPath].abort();
      }

      const controller = new AbortController();
      setUploadControllers((prev) => ({ ...prev, [videoPath]: controller }));

      // Set initial status
      setUploadStatus((prev) => ({
        ...prev,
        [videoPath]: {
          status: 'uploading',
          progress: 0,
        },
      }));

      const handleProgress = (_: unknown, payload: { videoPath: string; progress: UploadProgress }) => {
        if (payload.videoPath !== videoPath) return;
        if (controller.signal.aborted) return;
        if (!isMountedRef.current) return; // Don't update state if unmounted

        setUploadStatus((prev) => ({
          ...prev,
          [videoPath]: {
            status: payload.progress.stage === 'completed' ? 'completed' : 'uploading',
            progress: payload.progress.progress,
          },
        }));

        if (onProgressLog && payload.progress.message) {
          const stage = payload.progress.stage;
          if (stage === 'encrypting' || stage === 'creating-car' || stage === 'checking-payments' || 
              stage === 'uploading' || stage === 'validating' || stage === 'completed') {
            const progressPercent = Math.round(payload.progress.progress);
            onProgressLog(`📤 ${payload.progress.message} (${progressPercent}%)`);
          }
        }
      };

      // Track this listener for cleanup
      activeListenersRef.current.set(videoPath, handleProgress);
      ipcRenderer.on('filecoin-upload-progress', handleProgress);

      if (process.env.NODE_ENV === 'development') {
        console.log(`[IPC] Added upload progress listener for: ${videoPath}`);
      }

      const cleanupListener = () => {
        ipcRenderer.removeListener('filecoin-upload-progress', handleProgress);
        activeListenersRef.current.delete(videoPath);
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[IPC] Removed upload progress listener for: ${videoPath}`);
        }
      };

      try {
        const result: FilecoinUploadResult = await ipcRenderer.invoke('upload-to-filecoin', {
          videoPath,
          config,
        });

        // Only update state if still mounted
        if (isMountedRef.current) {
          setUploadStatus((prev) => ({
            ...prev,
            [videoPath]: {
              status: 'completed',
              progress: 100,
              rootCid: result.rootCid,
              pieceCid: result.pieceCid,
              pieceId: result.pieceId,
              dataSetId: result.dataSetId,
              transactionHash: result.transactionHash,
              isEncrypted: result.isEncrypted,
            },
          }));
        }

        // Save metadata (can happen even if unmounted)
        try {
          await videoService.updateFilecoinMetadata(videoPath, {
            root_cid: result.rootCid,
            piece_cid: result.pieceCid,
            piece_id: result.pieceId,
            data_set_id: result.dataSetId,
            transaction_hash: result.transactionHash,
            is_encrypted: result.isEncrypted ?? false,
            lit_encryption_metadata: result.encryptionMetadata,
            encrypted_root_cid: result.encryptedRootCid,
            cid_encryption_metadata: result.cidEncryptionMetadata,
          });
          console.log(`✅ Saved Filecoin metadata for ${videoPath}`);
        } catch (error) {
          console.error(`❌ Failed to save Filecoin metadata for ${videoPath}:`, error);
        }

        // Clean up
        cleanupListener();
        if (isMountedRef.current) {
          setUploadControllers((prev) => {
            const updated = { ...prev };
            delete updated[videoPath];
            return updated;
          });
        }

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        
        console.error('[Filecoin Upload] Upload failed', {
          videoPath,
          error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        });

        if (isMountedRef.current) {
          setUploadStatus((prev) => ({
            ...prev,
            [videoPath]: {
              status: 'error',
              progress: 0,
              error: errorMessage.replace('Filecoin upload failed: ', ''),
            },
          }));

          setUploadControllers((prev) => {
            const updated = { ...prev };
            delete updated[videoPath];
            return updated;
          });
        }

        cleanupListener();
        throw error;
      }
    },
    [uploadControllers]
  );

  const cancelUpload = useCallback((videoPath: string) => {
    if (uploadControllers[videoPath]) {
      uploadControllers[videoPath].abort();
      
      // Clean up the listener for this upload
      const handler = activeListenersRef.current.get(videoPath);
      if (handler) {
        ipcRenderer.removeListener('filecoin-upload-progress', handler);
        activeListenersRef.current.delete(videoPath);
      }
      
      setUploadStatus((prev) => ({
        ...prev,
        [videoPath]: {
          status: 'error',
          progress: 0,
          error: 'Upload cancelled',
        },
      }));
      setUploadControllers((prev) => {
        const updated = { ...prev };
        delete updated[videoPath];
        return updated;
      });
    }
  }, [uploadControllers]);

  const clearStatus = useCallback((videoPath: string) => {
    setUploadStatus((prev) => {
      const updated = { ...prev };
      delete updated[videoPath];
      return updated;
    });
  }, []);

  return {
    uploadStatus,
    uploadVideo,
    cancelUpload,
    clearStatus,
  };
};
```

---

## Implementation Checklist

### Phase 1: Create Infrastructure (Priority: High)
- [x] Create `frontend/src/hooks/useIPCListener.ts` with the hook implementation
- [x] Add TypeScript types for Electron IPC events
- [x] Add unit tests for the hook

### Phase 2: Refactor Existing Code (Priority: High)
- [x] Refactor `useFilecoinUpload.ts` to use unmount-safe pattern
- [x] Add development mode logging for leak detection

### Phase 3: Documentation & Prevention (Priority: Medium)
- [ ] Add ESLint rule to warn about direct `ipcRenderer.on()` usage
- [ ] Document the `useIPCListener` hook in the codebase
- [ ] Add to code review checklist

### Phase 4: Monitoring (Priority: Low)
- [ ] Add development mode dashboard for active listeners
- [ ] Consider adding telemetry for listener counts in production

---

## ESLint Rule (Optional)

Add to `.eslintrc.js` to prevent direct IPC listener usage:

```javascript
module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "CallExpression[callee.object.name='ipcRenderer'][callee.property.name='on']",
        message: 'Use useIPCListener hook instead of ipcRenderer.on() to prevent memory leaks.'
      }
    ]
  }
};
```

---

## Testing Strategy

### Unit Tests for `useIPCListener`

```typescript
import { renderHook, act } from '@testing-library/react-hooks';
import { useIPCListener, getActiveListenerCount } from './useIPCListener';

// Mock electron
jest.mock('electron', () => ({
  ipcRenderer: {
    on: jest.fn(),
    removeListener: jest.fn(),
  },
}));

describe('useIPCListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register listener on mount', () => {
    const handler = jest.fn();
    renderHook(() => useIPCListener('test-channel', handler));
    
    expect(require('electron').ipcRenderer.on).toHaveBeenCalledWith(
      'test-channel',
      expect.any(Function)
    );
  });

  it('should remove listener on unmount', () => {
    const handler = jest.fn();
    const { unmount } = renderHook(() => useIPCListener('test-channel', handler));
    
    unmount();
    
    expect(require('electron').ipcRenderer.removeListener).toHaveBeenCalledWith(
      'test-channel',
      expect.any(Function)
    );
  });

  it('should not register listener when disabled', () => {
    const handler = jest.fn();
    renderHook(() => useIPCListener('test-channel', handler, [], { enabled: false }));
    
    expect(require('electron').ipcRenderer.on).not.toHaveBeenCalled();
  });
});
```

---

## Conclusion

The Haven Player codebase is in good shape regarding IPC listener management. The only file requiring attention is `useFilecoinUpload.ts`, which needs unmount-safe cleanup. The proposed `useIPCListener` hook provides a robust solution for future IPC listener needs with:

1. **Automatic cleanup** on component unmount
2. **Development mode leak detection** with console warnings
3. **Stable handler references** via useRef
4. **Optional enable/disable** control

This plan ensures that IPC listeners are properly managed throughout the application lifecycle, preventing memory leaks and improving application stability.
