/**
 * Frontend service for interacting with the UploadWorker in Electron main process.
 *
 * This service provides methods to:
 * - Start/stop the upload worker
 * - Get upload worker status
 * - Update upload worker configuration
 */

import type {
  UploadWorkerConfig,
  UploadQueueStatus,
  UploadQueueEntry,
} from '../types/plugin';

// Re-export types for use by other modules
export type { UploadQueueStatus, UploadQueueEntry };

export interface UploadWorkerStatus {
  isRunning: boolean;
  config: UploadWorkerConfig;
  currentOperation?: {
    id: number;
    videoPath: string;
    stage: string;
  };
  recentErrors: Array<{
    id: number;
    videoPath: string;
    stage: string;
    message: string;
    timestamp: string;
  }>;
  errorCounts: Record<string, number>;
}

export interface UploadWorkerStartResponse {
  success: boolean;
  isRunning: boolean;
  config: UploadWorkerConfig;
  filecoinConfigured: boolean;
  message: string;
}

export interface UploadWorkerStopResponse {
  success: boolean;
  isRunning: boolean;
  message: string;
}

const { ipcRenderer } = require('electron');

export class UploadWorkerService {
  /**
   * Start the upload worker.
   *
   * @param config - Optional configuration for the upload worker
   * @returns Promise with start response
   */
  async start(config?: Partial<UploadWorkerConfig>): Promise<UploadWorkerStartResponse> {
    try {
      const response = await ipcRenderer.invoke('upload-worker:start', config);
      return response;
    } catch (error) {
      console.error('[UploadWorkerService] Failed to start upload worker:', error);
      throw error;
    }
  }

  /**
   * Stop the upload worker.
   *
   * @returns Promise with stop response
   */
  async stop(): Promise<UploadWorkerStopResponse> {
    try {
      const response = await ipcRenderer.invoke('upload-worker:stop');
      return response;
    } catch (error) {
      console.error('[UploadWorkerService] Failed to stop upload worker:', error);
      throw error;
    }
  }

  /**
   * Get the current status of the upload worker.
   *
   * @returns Promise with upload worker status
   */
  async getStatus(): Promise<UploadWorkerStatus> {
    try {
      const status = await ipcRenderer.invoke('upload-worker:get-status');
      return status;
    } catch (error) {
      console.error('[UploadWorkerService] Failed to get upload worker status:', error);
      throw error;
    }
  }

  /**
   * Update the upload worker configuration.
   *
   * @param newConfig - Partial configuration to update
   * @returns Promise with success status and updated config
   */
  async updateConfig(newConfig: Partial<UploadWorkerConfig>): Promise<{
    success: boolean;
    config: UploadWorkerConfig;
    message: string;
  }> {
    try {
      const response = await ipcRenderer.invoke('upload-worker:update-config', newConfig);
      return response;
    } catch (error) {
      console.error('[UploadWorkerService] Failed to update upload worker config:', error);
      throw error;
    }
  }

  /**
   * Get upload queue statistics from backend.
   *
   * @returns Promise with queue statistics
   */
  async getQueueStats(): Promise<UploadQueueStatus> {
    try {
      const response = await fetch('http://localhost:8000/api/upload-queue/stats');
      if (!response.ok) {
        throw new Error(`Failed to get queue stats: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[UploadWorkerService] Failed to get queue stats:', error);
      throw error;
    }
  }

  /**
   * Get upload queue entries from backend.
   *
   * @param status - Optional status filter
   * @returns Promise with queue entries
   */
  async getQueueEntries(status?: string): Promise<UploadQueueEntry[]> {
    try {
      const url = status
        ? `http://localhost:8000/api/upload-queue?status=${status}`
        : 'http://localhost:8000/api/upload-queue';

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to get queue entries: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[UploadWorkerService] Failed to get queue entries:', error);
      throw error;
    }
  }
}

// Singleton instance
export const uploadWorkerService = new UploadWorkerService();
