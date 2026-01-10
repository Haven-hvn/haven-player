/**
 * Background upload worker that processes upload queue independently of UI.
 *
 * This worker:
 * - Polls backend upload queue when coordinator is enabled
 * - Uses existing uploadVideoToFilecoin() logic
 * - Runs in Electron main process (has browser environment for Lit)
 * - Works even when frontend is minimised or closed
 */

import * as fs from 'fs';
import * as path from 'path';
import { uploadVideoToFilecoin } from './filecoinService';
import type { FilecoinConfig } from '../types/filecoin';
import type { UploadWorkerConfig } from '../types/plugin';

export interface UploadQueueEntry {
  id: number;
  video_path: string;
  status: string;
  priority: number;
  created_at: string;
  source: string;
}

export class UploadWorker {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private config: UploadWorkerConfig;
  private isRunning = false;

  constructor(config?: Partial<UploadWorkerConfig>) {
    this.config = {
      enabled: config?.enabled ?? false,
      pollInterval: config?.pollInterval ?? 15000,  // Default 15s
      maxConcurrentUploads: config?.maxConcurrentUploads ?? 1,
      retryAttempts: config?.retryAttempts ?? 3,
    };
  }

  async start(config?: Partial<UploadWorkerConfig>): Promise<void> {
    // Update config if provided
    if (config) {
      this.config = { ...this.config, ...config };
    }

    if (!this.config.enabled) {
      console.log('[UploadWorker] Auto-upload disabled via configuration');
      return;
    }

    if (this.isRunning) {
      console.log('[UploadWorker] Already running, ignoring start request');
      return;
    }

    console.log('[UploadWorker] Starting upload worker...');
    console.log(`[UploadWorker] Config: enabled=${this.config.enabled}, pollInterval=${this.config.pollInterval}ms`);

    this.isRunning = true;
    this.pollingInterval = setInterval(
      () => this.processQueue(),
      this.config.pollInterval
    );

    // Process immediately on start
    await this.processQueue();
  }

  async processQueue(): Promise<void> {
    // Only process one upload at a time (concurrent uploads could be added later)
    if (this.isProcessing) {
      return;
    }

    if (!this.config.enabled) {
      return;
    }

    try {
      // Get next pending upload
      const response = await fetch('http://localhost:8000/api/upload-queue/pop');

      if (!response.ok || response.status === 204) {
        // No pending uploads or error
        if (response.status !== 204) {
          const errorText = await response.text();
          console.error(`[UploadWorker] Error getting next upload: ${response.status} - ${errorText}`);
        }
        return;
      }

      const queueEntry: UploadQueueEntry | null = await response.json();

      // No queue entry available (queue is empty)
      if (!queueEntry) {
        return;
      }

      // Validate the queue entry has required fields
      if (!queueEntry.video_path || !queueEntry.id) {
        console.error('[UploadWorker] Invalid queue entry received (missing required fields):', queueEntry);
        return;
      }

      this.isProcessing = true;

      console.log(`[UploadWorker] Processing upload: ${queueEntry.video_path} (id=${queueEntry.id})`);

      const success = await this.processUpload(queueEntry);

      if (success) {
        console.log(`[UploadWorker] ✅ Upload complete: ${queueEntry.video_path}`);
      } else {
        console.log(`[UploadWorker] ❌ Upload failed: ${queueEntry.video_path}`);
      }

    } catch (error) {
      console.error('[UploadWorker] Error processing queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processUpload(queueEntry: UploadQueueEntry): Promise<boolean> {
    try {
      // Load Filecoin config
      const config = await this.loadFilecoinConfig();
      if (!config) {
        throw new Error('Filecoin config not available');
      }

      // Verify video file exists
      if (!fs.existsSync(queueEntry.video_path)) {
        throw new Error(`Video file not found: ${queueEntry.video_path}`);
      }

      // Read video file
      const file = this.readFileAsFile(queueEntry.video_path);

      // Perform upload (reusing existing logic)
      console.log(`[UploadWorker] Starting upload for ${queueEntry.video_path}...`);
      const result = await uploadVideoToFilecoin({
        file,
        config,
        filePath: queueEntry.video_path,
        onProgress: (progress) => {
          // Log progress periodically
          if (progress.progress % 10 === 0 || progress.stage === 'completed') {
            console.log(`[UploadWorker] Upload progress: ${progress.progress}% (${progress.stage})`);
          }
        },
      });

      console.log(`[UploadWorker] Upload successful: CID=${result.rootCid}, pieceId=${result.pieceId}`);

      // Update status to completed with FileCoin metadata
      const updateResponse = await fetch(
        `http://localhost:8000/api/upload-queue/${queueEntry.id}/status`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'completed',
            filecoin_metadata: {
              root_cid: result.rootCid,
              piece_cid: result.pieceCid,
              piece_id: result.pieceId,
              data_set_id: result.dataSetId,
              transaction_hash: result.transactionHash,
              is_encrypted: result.isEncrypted ?? false,
              encryption_metadata: result.encryptionMetadata,
              encrypted_root_cid: result.encryptedRootCid,
              cid_encryption_metadata: result.cidEncryptionMetadata,
            },
          }),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error(`[UploadWorker] Failed to update status: ${updateResponse.status} - ${errorText}`);
        return false;
      }

      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[UploadWorker] Upload failed for ${queueEntry.video_path}:`, error);

      // Update status to failed
      try {
        await fetch(
          `http://localhost:8000/api/upload-queue/${queueEntry.id}/status`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'failed',
              error: errorMessage,
            }),
          }
        );
      } catch (updateError) {
        console.error('[UploadWorker] Failed to update failed status:', updateError);
      }

      return false;
    }
  }

  private async loadFilecoinConfig(): Promise<FilecoinConfig | null> {
    try {
      // In main process, we can't use ipcRenderer
      // We need to read the config directly from secure storage
      const app = await import('electron').then(e => e.default || e.app);
      const { safeStorage, app: appModule } = await import('electron');

      const configPath = await import('path').then(p => p.join(appModule.getPath('userData'), 'filecoin-config.json'));

      if (!require('fs').existsSync(configPath)) {
        return null;
      }

      const fileBuffer = require('fs').readFileSync(configPath);
      const data = fileBuffer.toString('utf-8');
      const config = JSON.parse(data);

      // Decrypt private key if available
      if (!config.encryptedPrivateKey || !safeStorage.isEncryptionAvailable()) {
        return null;
      }

      try {
        const encryptedBuffer = Buffer.from(config.encryptedPrivateKey, 'base64');
        const privateKey = safeStorage.decryptString(encryptedBuffer);

        return {
          privateKey,
          rpcUrl: config.rpcUrl,
          dataSetId: config.dataSetId,
          encryptionEnabled: config.encryptionEnabled ?? false,
        };
      } catch (error) {
        console.error('[UploadWorker] Failed to decrypt private key:', error);
        return null;
      }
    } catch (error) {
      console.error('[UploadWorker] Error loading Filecoin config:', error);
      return null;
    }
  }

  private readFileAsFile(filePath: string): File {
    const fileStats = fs.statSync(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = this.getMimeType(filePath);

    // Convert Buffer to Uint8Array before wrapping in Blob/File
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    return new File([blob], fileName, { type: mimeType });
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.ts': 'video/mp2t',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[UploadWorker] Stopping upload worker...');

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.isProcessing = false;
    this.isRunning = false;
  }

  updateConfig(newConfig: Partial<UploadWorkerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[UploadWorker] Config updated:', this.config);

    // Restart if interval changed
    if (newConfig.pollInterval && this.isRunning) {
      this.stop();
      this.start(this.config);
    }
  }

  getConfig(): UploadWorkerConfig {
    return { ...this.config };
  }

  isWorkerRunning(): boolean {
    return this.isRunning;
  }
}

// Singleton instance for main process
let uploadWorkerInstance: UploadWorker | null = null;

export function getUploadWorker(): UploadWorker {
  if (!uploadWorkerInstance) {
    uploadWorkerInstance = new UploadWorker();
  }
  return uploadWorkerInstance;
}

export function startUploadWorker(config?: Partial<UploadWorkerConfig>): UploadWorker {
  const worker = getUploadWorker();
  worker.start(config);
  return worker;
}

export function stopUploadWorker(): void {
  if (uploadWorkerInstance) {
    uploadWorkerInstance.stop();
  }
}
