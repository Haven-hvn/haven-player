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
import { uploadVideoToFilecoin, validateFileForFilecoinUpload } from './filecoinService';
import type { FilecoinConfig } from '../types/filecoin';
import type { UploadWorkerConfig } from '../types/plugin';

export interface UploadQueueEntry {
  id: number;
  video_path: string;
  status: string;
  priority: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  source: string;
  arkiv_sync_status: string | null;
  arkiv_sync_started_at: string | null;
  arkiv_sync_completed_at: string | null;
  arkiv_sync_error: string | null;
  
  // VLM analysis status
  vlm_analysis_status: string | null;
  vlm_analysis_started_at: string | null;
  vlm_analysis_completed_at: string | null;
  vlm_analysis_error: string | null;
  
  // NEW: VLM JSON upload status
  vlm_json_upload_status: string | null;
  vlm_json_upload_started_at: string | null;
  vlm_json_upload_completed_at: string | null;
  vlm_json_upload_error: string | null;
}

export interface UploadError {
  id: number;
  videoPath: string;
  stage: string;
  message: string;
  timestamp: Date;
}

export interface UploadWorkerStatus {
  isRunning: boolean;
  config: UploadWorkerConfig;
  currentOperation?: {
    id: number;
    videoPath: string;
    stage: string;
  };
  recentErrors: UploadError[];
  errorCounts: Record<string, number>;
}

export class UploadWorker {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private config: UploadWorkerConfig;
  private isRunning = false;
  private recentErrors: UploadError[] = [];
  private errorCounts: Record<string, number> = {};
  private currentOperation?: {
    id: number;
    videoPath: string;
    stage: string;
  };

  constructor(config?: Partial<UploadWorkerConfig>) {
    this.config = {
      enabled: config?.enabled ?? false,
      pollInterval: config?.pollInterval ?? 300000,  // Default 5 minutes
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

    // Random startup delay (0-60s) to stagger from other workers
    const startupDelay = Math.floor(Math.random() * 60000);
    console.log(`[UploadWorker] Starting upload worker (staggered startup: ${startupDelay}ms)...`);
    console.log(`[UploadWorker] Config: enabled=${this.config.enabled}, pollInterval=${this.config.pollInterval}ms`);

    await new Promise(resolve => setTimeout(resolve, startupDelay));

    this.isRunning = true;
    
    // Start the polling loop with random intervals
    this.runPollingLoop();
  }

  async processQueue(): Promise<void> {
    // Only process one upload (video OR JSON) at a time
    if (this.isProcessing) {
      console.log('[UploadWorker] Already processing, skipping this poll');
      return;
    }

    if (!this.config.enabled) {
      console.log('[UploadWorker] Worker disabled, skipping queue check');
      return;
    }

    this.isProcessing = true;

    try {
      console.log('[UploadWorker] Checking upload queue...');

      // Priority 1: Process JSON upload jobs
      let jsonResponse;
      try {
        jsonResponse = await fetch('http://localhost:8000/api/upload-queue/vlm-json/pop');
      } catch (fetchError) {
        console.error('[UploadWorker] Failed to connect to backend for JSON queue check:', fetchError);
        return;
      }

      if (jsonResponse.ok && jsonResponse.status !== 204) {
        let jsonEntry: UploadQueueEntry | null = null;
        try {
          jsonEntry = await jsonResponse.json();
        } catch (parseError) {
          console.error('[UploadWorker] Failed to parse JSON queue response:', parseError);
          return;
        }

        if (jsonEntry && jsonEntry.video_path && jsonEntry.id) {
          console.log(`[UploadWorker] Processing JSON upload: ${jsonEntry.video_path} (id=${jsonEntry.id})`);

          const success = await this.processJsonUpload(jsonEntry);

          if (success) {
            console.log(`[UploadWorker] JSON upload complete: ${jsonEntry.video_path}`);
          } else {
            console.log(`[UploadWorker] JSON upload failed: ${jsonEntry.video_path}`);
          }
          return; // Process one job per cycle
        }
      }

      // Priority 2: Process regular video uploads
      let response;
      try {
        response = await fetch('http://localhost:8000/api/upload-queue/pop');
      } catch (fetchError) {
        console.error('[UploadWorker] Failed to connect to backend for video queue check:', fetchError);
        return;
      }

      if (!response.ok || response.status === 204) {
        // No pending uploads or error
        if (response.status !== 204) {
          const errorText = await response.text();
          console.error(`[UploadWorker] Error getting next upload: ${response.status} - ${errorText}`);
        } else {
          console.log('[UploadWorker] No pending uploads in queue');
        }
        return;
      }

      let queueEntry: UploadQueueEntry | null = null;
      try {
        queueEntry = await response.json();
      } catch (parseError) {
        console.error('[UploadWorker] Failed to parse video queue response:', parseError);
        return;
      }

      // No queue entry available (queue is empty)
      if (!queueEntry) {
        console.log('[UploadWorker] Queue entry is null');
        return;
      }

      // Validate the queue entry has required fields
      if (!queueEntry.video_path || !queueEntry.id) {
        console.error('[UploadWorker] Invalid queue entry received (missing required fields):', queueEntry);
        return;
      }

      console.log(`[UploadWorker] Processing video upload: ${queueEntry.video_path} (id=${queueEntry.id})`);

      // Track current operation
      this.currentOperation = {
        id: queueEntry.id,
        videoPath: queueEntry.video_path,
        stage: 'starting',
      };

      const success = await this.processUpload(queueEntry, (stage) => {
        // Update current operation stage
        if (this.currentOperation) {
          this.currentOperation.stage = stage;
        }
      });

      // Clear current operation
      this.currentOperation = undefined;

      if (success) {
        console.log(`[UploadWorker] Video upload complete: ${queueEntry.video_path}`);
      } else {
        console.log(`[UploadWorker] Video upload failed: ${queueEntry.video_path}`);
      }

    } catch (error) {
      console.error('[UploadWorker] Error processing queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processUpload(
    queueEntry: UploadQueueEntry,
    onStageChange?: (stage: string) => void
  ): Promise<boolean> {
    console.log(`[UploadWorker] Starting processUpload for id=${queueEntry.id}, path=${queueEntry.video_path}`);
    
    // Track which stage we're in for error reporting
    let currentStage: 'config' | 'file-check' | 'file-read' | 'encryption' | 'upload' | 'status-update' = 'config';
    
    const updateStage = (stage: typeof currentStage) => {
      currentStage = stage;
      onStageChange?.(stage);
    };
    
    try {
      // Load Filecoin config
      updateStage('config');
      console.log('[UploadWorker] Loading Filecoin config...');
      const config = await this.loadFilecoinConfig();
      if (!config) {
        console.error('[UploadWorker] Filecoin config not available - cannot upload');
        throw new Error('Filecoin config not available');
      }
      console.log('[UploadWorker] Filecoin config loaded successfully');

      // Verify video file exists
      updateStage('file-check');
      console.log(`[UploadWorker] Checking if file exists: ${queueEntry.video_path}`);
      if (!fs.existsSync(queueEntry.video_path)) {
        console.error(`[UploadWorker] Video file not found: ${queueEntry.video_path}`);
        throw new Error(`Video file not found: ${queueEntry.video_path}`);
      }
      console.log('[UploadWorker] File exists, proceeding with upload');

      // Read video file
      updateStage('file-read');
      console.log('[UploadWorker] Reading video file...');
      const file = this.readFileAsFile(queueEntry.video_path);
      console.log(`[UploadWorker] File read: ${file.name}, size: ${file.size} bytes`);

      // Validate file size before upload
      updateStage('file-read');
      console.log('[UploadWorker] Validating file size for Filecoin upload...');
      const sizeValidation = validateFileForFilecoinUpload(file, config.encryptionEnabled);
      
      if (!sizeValidation.valid) {
        console.error('[UploadWorker] Size validation failed:', sizeValidation.errorMessage);
        
        // Track as size validation error
        this.trackError(
          queueEntry.id,
          queueEntry.video_path,
          'size_validation',
          sizeValidation.userMessage || sizeValidation.errorMessage || 'File size validation failed'
        );
        
        // Update status to failed with size validation error
        try {
          console.log(`[UploadWorker] Updating queue status to failed for id=${queueEntry.id} (size_validation)`);
          await fetch(
            `http://localhost:8000/api/upload-queue/${queueEntry.id}/status`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'failed',
                error: sizeValidation.userMessage || sizeValidation.errorMessage,
                error_stage: 'size_validation',
              }),
            }
          );
        } catch (updateError) {
          console.error('[UploadWorker] Failed to update failed status:', updateError);
        }
        
        return false;
      }
      
      console.log('[UploadWorker] Size validation passed:', {
        originalSize: sizeValidation.originalSize,
        projectedSize: sizeValidation.projectedSize,
        maxAllowed: sizeValidation.maxAllowed,
      });

      // Perform upload (reusing existing logic)
      updateStage(config.encryptionEnabled ? 'encryption' : 'upload');
      console.log(`[UploadWorker] Calling uploadVideoToFilecoin for ${queueEntry.video_path}...`);
      const result = await uploadVideoToFilecoin({
        file,
        config,
        filePath: queueEntry.video_path,
        onProgress: (progress) => {
          // Track stage from progress
          if (progress.stage === 'encrypting') updateStage('encryption');
          else if (progress.stage === 'uploading') updateStage('upload');
          
          // Log progress periodically
          if (progress.progress % 10 === 0 || progress.stage === 'completed') {
            console.log(`[UploadWorker] Upload progress: ${progress.progress}% (${progress.stage})`);
          }
        },
      });

      console.log(`[UploadWorker] Upload successful: CID=${result.rootCid}, pieceId=${result.pieceId}`);

      // Update status to completed with FileCoin metadata
      updateStage('status-update');
      console.log(`[UploadWorker] Updating queue status to completed for id=${queueEntry.id}`);
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
              lit_encryption_metadata: result.encryptionMetadata,
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

      console.log(`[UploadWorker] Status updated successfully for id=${queueEntry.id}`);
      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[UploadWorker] Upload failed at stage '${currentStage}' for ${queueEntry.video_path}:`, error);

      // Track the error locally
      this.trackError(queueEntry.id, queueEntry.video_path, currentStage, errorMessage);

      // Update status to failed with stage information
      try {
        console.log(`[UploadWorker] Updating queue status to failed for id=${queueEntry.id} (stage: ${currentStage})`);
        await fetch(
          `http://localhost:8000/api/upload-queue/${queueEntry.id}/status`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'failed',
              error: errorMessage,
              error_stage: currentStage,
            }),
          }
        );
      } catch (updateError) {
        console.error('[UploadWorker] Failed to update failed status:', updateError);
      }

      return false;
    }
  }

  private async processJsonUpload(queueEntry: UploadQueueEntry): Promise<boolean> {
    try {
      // Load Filecoin config
      const config = await this.loadFilecoinConfig();
      if (!config) {
        throw new Error('Filecoin config not available');
      }

      // Verify JSON file exists: {video_path}.AI.json
      const jsonFilePath = `${queueEntry.video_path}.AI.json`;
      if (!fs.existsSync(jsonFilePath)) {
        throw new Error(`VLM JSON file not found: ${jsonFilePath}`);
      }

      // Read JSON file
      const jsonFile = this.readFileAsFile(jsonFilePath);

      console.log(`[UploadWorker] Starting VLM JSON upload for ${queueEntry.video_path}...`);
      
      // Upload JSON to FileCoin (skip encryption for JSON files)
      const result = await uploadVideoToFilecoin({
        file: jsonFile,
        config: { ...config, encryptionEnabled: false }, // JSON files not encrypted
        filePath: jsonFilePath,
        onProgress: (progress) => {
          if (progress.progress % 20 === 0 || progress.stage === 'completed') {
            console.log(`[UploadWorker] JSON upload progress: ${progress.progress}% (${progress.stage})`);
          }
        },
      });

      console.log(`[UploadWorker] JSON upload successful: CID=${result.rootCid}`);

      // Update status to completed with JSON CID
      const updateResponse = await fetch(
        `http://localhost:8000/api/upload-queue/${queueEntry.id}/vlm-json-upload`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vlm_json_upload_status: 'completed',
            vlm_json_cid: result.rootCid,
          }),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error(`[UploadWorker] Failed to update JSON upload status: ${updateResponse.status} - ${errorText}`);
        return false;
      }

      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[UploadWorker] JSON upload failed for ${queueEntry.video_path}:`, error);

      // Update status to failed
      try {
        await fetch(
          `http://localhost:8000/api/upload-queue/${queueEntry.id}/vlm-json-upload`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vlm_json_upload_status: 'failed',
              vlm_json_upload_error: errorMessage,
            }),
          }
        );
      } catch (updateError) {
        console.error('[UploadWorker] Failed to update JSON upload failed status:', updateError);
      }

      return false;
    }
  }

  private async loadFilecoinConfig(): Promise<FilecoinConfig | null> {
    try {
      // In main process, import electron directly
      const { safeStorage, app } = require('electron');
      const path = require('path');

      const configPath = path.join(app.getPath('userData'), 'filecoin-config.json');
      
      console.log('[UploadWorker] Loading Filecoin config from:', configPath);

      if (!fs.existsSync(configPath)) {
        console.log('[UploadWorker] Filecoin config file not found at:', configPath);
        return null;
      }

      const fileBuffer = fs.readFileSync(configPath);
      const data = fileBuffer.toString('utf-8');
      const config = JSON.parse(data);

      console.log('[UploadWorker] Filecoin config loaded, checking encrypted private key...');

      // Decrypt private key if available
      if (!config.encryptedPrivateKey) {
        console.log('[UploadWorker] No encrypted private key in config');
        return null;
      }

      if (!safeStorage.isEncryptionAvailable()) {
        console.log('[UploadWorker] Safe storage not available');
        return null;
      }

      try {
        const encryptedBuffer = Buffer.from(config.encryptedPrivateKey, 'base64');
        const privateKey = safeStorage.decryptString(encryptedBuffer);

        console.log('[UploadWorker] Filecoin config loaded successfully');

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
      '.json': 'application/json',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private async runPollingLoop(): Promise<void> {
    /**
     * Main polling loop with random intervals (30s to 300s).
     * Uses setTimeout recursively to vary the interval each time.
     */
    while (this.isRunning) {
      await this.processQueue();
      
      // Random interval between 30s (30000ms) and 300s (300000ms)
      const randomInterval = Math.floor(Math.random() * 270000) + 30000;
      console.log(`[UploadWorker] Next poll in ${randomInterval}ms (${(randomInterval/1000).toFixed(1)}s)`);
      
      await new Promise(resolve => setTimeout(resolve, randomInterval));
    }
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

  /**
   * Track an error for display in the UI
   */
  private trackError(id: number, videoPath: string, stage: string, message: string): void {
    const error: UploadError = {
      id,
      videoPath,
      stage,
      message,
      timestamp: new Date(),
    };

    // Add to recent errors (keep last 10)
    this.recentErrors.unshift(error);
    if (this.recentErrors.length > 10) {
      this.recentErrors = this.recentErrors.slice(0, 10);
    }

    // Update error counts by stage
    this.errorCounts[stage] = (this.errorCounts[stage] || 0) + 1;

    console.error(`[UploadWorker] Error tracked - Stage: ${stage}, Message: ${message}`);
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.recentErrors = [];
    this.errorCounts = {};
    console.log('[UploadWorker] Error history cleared');
  }

  /**
   * Get detailed worker status including errors
   */
  getDetailedStatus(): UploadWorkerStatus {
    return {
      isRunning: this.isRunning,
      config: this.getConfig(),
      currentOperation: this.currentOperation,
      recentErrors: [...this.recentErrors],
      errorCounts: { ...this.errorCounts },
    };
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
