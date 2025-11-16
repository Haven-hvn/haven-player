import { createCarFromFile } from 'filecoin-pin/core';
import { 
  initializeSynapse as initSynapse, 
  createStorageContext,
  cleanupSynapseService,
  type SynapseService,
  type Synapse 
} from 'filecoin-pin/core/synapse';
import { executeUpload, checkUploadReadiness } from 'filecoin-pin/core/upload';
import type { CID } from 'multiformats/cid';
import type { FilecoinUploadResult, FilecoinConfig } from '@/types/filecoin';

// Simple logger for browser environment
const createLogger = () => ({
  info: (data: unknown, msg: string) => console.log(`[Filecoin] ${msg}`, data),
  warn: (data: unknown, msg: string) => console.warn(`[Filecoin] ${msg}`, data),
  error: (data: unknown, msg: string) => console.error(`[Filecoin] ${msg}`, data),
  debug: (data: unknown, msg: string) => console.debug(`[Filecoin] ${msg}`, data),
});

export interface UploadProgress {
  stage: 'preparing' | 'creating-car' | 'checking-payments' | 'uploading' | 'validating' | 'completed';
  progress: number; // 0-100
  message: string;
}

export interface UploadOptions {
  file: File;
  config: FilecoinConfig;
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * Create a CAR file from a video file
 */
async function createCarFromVideo(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<{ carBytes: Uint8Array; rootCid: CID }> {
  onProgress?.({
    stage: 'creating-car',
    progress: 0,
    message: 'Creating CAR file from video...',
  });

  let carProgress = 0;
  const result = await createCarFromFile(file, {
    onProgress: (bytesProcessed: number, totalBytes: number) => {
      carProgress = Math.round((bytesProcessed / totalBytes) * 100);
      onProgress?.({
        stage: 'creating-car',
        progress: carProgress,
        message: `Creating CAR file... ${carProgress}%`,
      });
    },
  });

  return {
    carBytes: result.carBytes,
    rootCid: result.rootCid,
  };
}

/**
 * Initialize Synapse SDK (without storage context)
 * Storage context should be created after payment validation
 * This matches the pattern from filecoin-pin/src/add/add.ts
 */
async function initializeSynapseSDK(
  config: FilecoinConfig,
  logger: ReturnType<typeof createLogger>
): Promise<Synapse> {
  return await initSynapse(
    {
      privateKey: config.privateKey,
      rpcUrl: config.rpcUrl,
      telemetry: {
        sentryInitOptions: {
          enabled: false, // Disable telemetry in browser
        },
      },
    },
    logger
  );
}

/**
 * Upload a video file to Filecoin
 */
export async function uploadVideoToFilecoin(
  options: UploadOptions
): Promise<FilecoinUploadResult> {
  const logger = createLogger();
  const { file, config, onProgress } = options;

  try {
    // Step 1: Create CAR file
    onProgress?.({
      stage: 'preparing',
      progress: 5,
      message: 'Preparing video for upload...',
    });

    const { carBytes, rootCid } = await createCarFromVideo(file, onProgress);

    onProgress?.({
      stage: 'checking-payments',
      progress: 50,
      message: 'Initializing Filecoin connection...',
    });

    // Step 2: Initialize Synapse SDK (without storage context)
    // This matches filecoin-pin pattern: initialize first, validate payments, then create storage context
    const synapse = await initializeSynapseSDK(config, logger);

    // Step 3: Check upload readiness (payment validation)
    // This validates payments BEFORE creating storage context (filecoin-pin pattern)
    const readiness = await checkUploadReadiness({
      synapse,
      fileSize: carBytes.length,
      autoConfigureAllowances: true,
      onProgress: (event: { type: string }) => {
        if (event.type === 'checking-balances') {
          onProgress?.({
            stage: 'checking-payments',
            progress: 55,
            message: 'Checking wallet balances...',
          });
        } else if (event.type === 'checking-allowances') {
          onProgress?.({
            stage: 'checking-payments',
            progress: 60,
            message: 'Checking allowances...',
          });
        } else if (event.type === 'configuring-allowances') {
          onProgress?.({
            stage: 'checking-payments',
            progress: 65,
            message: 'Configuring allowances...',
          });
        } else if (event.type === 'validating-capacity') {
          onProgress?.({
            stage: 'checking-payments',
            progress: 70,
            message: 'Validating payment capacity...',
          });
        }
      },
    });

    if (readiness.status === 'blocked') {
      const errorMessage =
        readiness.validation.errorMessage ||
        readiness.suggestions.join('. ') ||
        'Upload blocked: Payment setup incomplete';
      throw new Error(errorMessage);
    }

    onProgress?.({
      stage: 'checking-payments',
      progress: 75,
      message: 'Creating storage context...',
    });

    // Step 4: Create storage context AFTER payment validation passes
    // This matches filecoin-pin pattern from add.ts line 160-180
    const { storage, providerInfo } = await createStorageContext(
      synapse,
      logger,
      config.dataSetId
        ? {
            dataset: {
              useExisting: config.dataSetId,
            },
          }
        : undefined
    );

    const synapseService: SynapseService = { synapse, storage, providerInfo };

    onProgress?.({
      stage: 'uploading',
      progress: 80,
      message: 'Uploading to Filecoin...',
    });

    // Step 5: Execute upload
    const uploadResult = await executeUpload(synapseService, carBytes, rootCid, {
      logger,
      contextId: file.name,
      onProgress: (event: { type: string; data?: { retryCount?: number } }) => {
        switch (event.type) {
          case 'onUploadComplete': {
            onProgress?.({
              stage: 'uploading',
              progress: 85,
              message: 'Upload complete, adding to dataset...',
            });
            break;
          }
          case 'onPieceAdded': {
            onProgress?.({
              stage: 'validating',
              progress: 90,
              message: 'Piece added to dataset, confirming...',
            });
            break;
          }
          case 'onPieceConfirmed': {
            onProgress?.({
              stage: 'validating',
              progress: 95,
              message: 'Piece confirmed on-chain, validating IPNI...',
            });
            break;
          }
          case 'ipniAdvertisement.retryUpdate': {
            const attemptCount = event.data.retryCount === 0 ? 1 : event.data.retryCount + 1;
            onProgress?.({
              stage: 'validating',
              progress: 95,
              message: `Checking IPNI advertisement (attempt ${attemptCount})...`,
            });
            break;
          }
          case 'ipniAdvertisement.complete': {
            onProgress?.({
              stage: 'validating',
              progress: 98,
              message: 'IPNI advertisement successful. IPFS retrieval available.',
            });
            break;
          }
          case 'ipniAdvertisement.failed': {
            // Don't fail the upload, just warn - IPNI can take time
            onProgress?.({
              stage: 'validating',
              progress: 97,
              message: 'IPNI advertisement pending (upload successful)',
            });
            break;
          }
        }
      },
      ipniValidation: {
        enabled: true,
      },
    });

    onProgress?.({
      stage: 'completed',
      progress: 100,
      message: 'Upload completed successfully!',
    });

    return {
      rootCid: rootCid.toString(),
      pieceCid: uploadResult.pieceCid,
      pieceId: uploadResult.pieceId,
      dataSetId: uploadResult.dataSetId,
      transactionHash: uploadResult.transactionHash,
      providerInfo: uploadResult.providerInfo,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error({ error }, 'Upload failed');
    throw new Error(`Filecoin upload failed: ${errorMessage}`);
  } finally {
    // Always cleanup WebSocket providers to allow process termination (filecoin-pin pattern)
    // This matches the cleanup pattern from filecoin-pin/src/add/add.ts line 217
    try {
      await cleanupSynapseService();
    } catch (cleanupError) {
      logger.warn({ error: cleanupError }, 'Cleanup warning');
    }
  }
}

