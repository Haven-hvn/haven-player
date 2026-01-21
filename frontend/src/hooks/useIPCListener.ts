import { useEffect, useRef } from 'react';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
