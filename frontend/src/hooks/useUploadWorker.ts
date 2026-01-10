/**
 * React hook for interacting with the UploadWorker.
 *
 * This hook provides a simple interface for:
 * - Starting/stopping the upload worker
 * - Getting upload worker status
 * - Updating configuration
 * - Getting queue statistics
 */

import { useState, useEffect, useCallback } from 'react';
import {
  uploadWorkerService,
  type UploadWorkerStatus,
  type UploadWorkerStartResponse,
  type UploadQueueStatus,
  type UploadQueueEntry,
} from '@/services/uploadWorkerService';
import type { UploadWorkerConfig } from '@/types/plugin';

export interface UseUploadWorkerReturn {
  // Status
  status: UploadWorkerStatus | null;
  queueStats: UploadQueueStatus | null;
  loading: boolean;
  error: string | null;

  // Actions
  start: (config?: Partial<UploadWorkerConfig>) => Promise<UploadWorkerStartResponse>;
  stop: () => Promise<void>;
  updateConfig: (newConfig: Partial<UploadWorkerConfig>) => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshQueueStats: () => Promise<void>;
}

export function useUploadWorker(): UseUploadWorkerReturn {
  const [status, setStatus] = useState<UploadWorkerStatus | null>(null);
  const [queueStats, setQueueStats] = useState<UploadQueueStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh upload worker status
  const refreshStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const currentStatus = await uploadWorkerService.getStatus();
      setStatus(currentStatus);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get upload worker status';
      setError(errorMessage);
      console.error('[useUploadWorker] Failed to get status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh queue statistics
  const refreshQueueStats = useCallback(async () => {
    try {
      const stats = await uploadWorkerService.getQueueStats();
      setQueueStats(stats);
    } catch (err) {
      console.error('[useUploadWorker] Failed to get queue stats:', err);
    }
  }, []);

  // Start upload worker
  const start = useCallback(async (
    config?: Partial<UploadWorkerConfig>
  ): Promise<UploadWorkerStartResponse> => {
    try {
      setLoading(true);
      setError(null);
      const response = await uploadWorkerService.start(config);

      // Refresh status after starting
      await refreshStatus();

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start upload worker';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refreshStatus]);

  // Stop upload worker
  const stop = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await uploadWorkerService.stop();

      // Refresh status after stopping
      await refreshStatus();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop upload worker';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refreshStatus]);

  // Update configuration
  const updateConfig = useCallback(async (
    newConfig: Partial<UploadWorkerConfig>
  ) => {
    try {
      setLoading(true);
      setError(null);
      await uploadWorkerService.updateConfig(newConfig);

      // Refresh status after updating config
      await refreshStatus();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update upload worker config';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refreshStatus]);

  // Initial load
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Poll queue stats periodically when worker is running
  useEffect(() => {
    if (!status?.isRunning) {
      return;
    }

    // Refresh queue stats every 10 seconds
    const intervalId = setInterval(() => {
      refreshQueueStats();
    }, 10000);

    // Initial refresh
    refreshQueueStats();

    return () => clearInterval(intervalId);
  }, [status?.isRunning, refreshQueueStats]);

  return {
    status,
    queueStats,
    loading,
    error,
    start,
    stop,
    updateConfig,
    refreshStatus,
    refreshQueueStats,
  };
}

export default useUploadWorker;
