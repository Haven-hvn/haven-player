import {
  createUnixfsCarBuilder,
  type CarBuildResult,
  type CreateCarOptions,
  type Logger,
} from 'filecoin-pin/core/unixfs';
import {
  initializeSynapse as initSynapse,
  createStorageContext,
  cleanupSynapseService,
} from 'filecoin-pin/core/synapse';
// Import the actual Synapse type from the package if available, otherwise infer it
// TypeScript may not be able to properly infer this, so we'll use type assertions where needed
type Synapse = Awaited<ReturnType<typeof initSynapse>>;
type SynapseServiceShape = {
  synapse: Synapse;
  storage: unknown;
  providerInfo: unknown;
};
import { executeUpload, checkUploadReadiness } from 'filecoin-pin/core/upload';
import type { FilecoinUploadResult, FilecoinConfig } from '@/types/filecoin';
import {
  encryptFileForStorage, 
  serializeEncryptionMetadata,
  type LitEncryptionMetadata,
  encryptTextWithLit,
} from '@/services/litService';
import { Buffer } from 'buffer';
import { mkdtemp, readFile as readFileFromFs, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Simple logger for browser environment that matches filecoin-pin's Logger interface
// LogFn expects (msg: string, ...args: unknown[]) signature
// But filecoin-pin may call it with objects, so we handle both cases
const createLogger = (): Logger => {
  const formatMessage = (msg: unknown, ...args: unknown[]): [string, ...unknown[]] => {
    if (typeof msg === 'string') {
      return [`[Filecoin] ${msg}`, ...args];
    }
    // If msg is an object, convert it to string and use args as additional context
    return [`[Filecoin]`, msg, ...args];
  };

  return {
    level: 'info' as const,
    info: (msg: unknown, ...args: unknown[]) => {
      const [formattedMsg, ...formattedArgs] = formatMessage(msg, ...args);
      console.log(formattedMsg, ...formattedArgs);
    },
    warn: (msg: unknown, ...args: unknown[]) => {
      const [formattedMsg, ...formattedArgs] = formatMessage(msg, ...args);
      console.warn(formattedMsg, ...formattedArgs);
    },
    error: (msg: unknown, ...args: unknown[]) => {
      const [formattedMsg, ...formattedArgs] = formatMessage(msg, ...args);
      console.error(formattedMsg, ...formattedArgs);
    },
    debug: (msg: unknown, ...args: unknown[]) => {
      const [formattedMsg, ...formattedArgs] = formatMessage(msg, ...args);
      console.debug(formattedMsg, ...formattedArgs);
    },
    fatal: (msg: unknown, ...args: unknown[]) => {
      const [formattedMsg, ...formattedArgs] = formatMessage(msg, ...args);
      console.error(`[Filecoin] FATAL:`, formattedMsg, ...formattedArgs);
    },
    trace: (msg: unknown, ...args: unknown[]) => {
      const [formattedMsg, ...formattedArgs] = formatMessage(msg, ...args);
      console.trace(`[Filecoin]`, formattedMsg, ...formattedArgs);
    },
    silent: (msg: unknown, ...args: unknown[]) => {
      const [formattedMsg, ...formattedArgs] = formatMessage(msg, ...args);
      console.log(formattedMsg, ...formattedArgs);
    },
    msgPrefix: '[Filecoin]',
  } as unknown as Logger;
};

export interface UploadProgress {
  stage: 'preparing' | 'encrypting' | 'creating-car' | 'checking-payments' | 'uploading' | 'validating' | 'completed';
  progress: number; // 0-100
  message: string;
  bytesUploaded?: number; // Optional: bytes uploaded so far
  totalBytes?: number; // Optional: total bytes to upload
}

export interface UploadOptions {
  file: File;
  config: FilecoinConfig;
  filePath?: string; // optional original path when available (used for CAR creation when not encrypted)
  onProgress?: (progress: UploadProgress) => void;
}

type CleanupCallback = () => Promise<void>;

interface PreparedSourcePath {
  sourcePath: string;
  cleanup?: CleanupCallback;
}

interface CarCreationResult {
  carBytes: Uint8Array;
  rootCid: string;
  carPath: string;
  carSize?: number;
  cleanupTasks: CleanupCallback[];
}

const SOURCE_TMP_PREFIX = 'haven-filecoin-src-';

const unixfsCarBuilder = createUnixfsCarBuilder();

async function runCleanup(cleanups: CleanupCallback[], logger: ReturnType<typeof createLogger>, context: string): Promise<void> {
  // Run in reverse order to unwind resources
  const tasks = [...cleanups].reverse();
  for (const cleanup of tasks) {
    try {
      await cleanup();
    } catch (cleanupError) {
      const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      logger.warn(`Cleanup warning during ${context}`, { error: message });
    }
  }
}

async function persistFileToTempPath(
  file: File,
  logger: ReturnType<typeof createLogger>,
  reason: 'encrypted' | 'missing-file-path'
): Promise<PreparedSourcePath> {
  const tempDir = await mkdtemp(join(tmpdir(), SOURCE_TMP_PREFIX));
  const safeName = file.name && file.name.trim() ? file.name : 'upload.bin';
  const tempFilePath = join(tempDir, safeName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(tempFilePath, buffer);

  logger.info('Persisted upload file to temporary path for CAR creation', {
    tempFilePath,
    reason,
    size: buffer.byteLength,
  });

  return {
    sourcePath: tempFilePath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
      logger.debug('Cleaned up temporary upload file', { tempDir });
    },
  };
}

/**
 * Normalize private key by ensuring it has 0x prefix
 * MetaMask exports private keys without 0x, but filecoin-pin expects it
 */
function normalizePrivateKey(privateKey: string): string {
  const trimmed = privateKey.trim();
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return trimmed;
  }
  return `0x${trimmed}`;
}

/**
 * Create a CAR file from a video file
 */
async function createCarFromVideo(
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  isEncrypted: boolean = false,
  logger?: ReturnType<typeof createLogger>,
  providedFilePath?: string
): Promise<CarCreationResult> {
  if (!logger) {
    throw new Error('Logger is required for CAR creation');
  }

  const cleanupTasks: CleanupCallback[] = [];

  const needsTempSource = isEncrypted || !providedFilePath;
  const preparedSource = needsTempSource
    ? await persistFileToTempPath(file, logger, isEncrypted ? 'encrypted' : 'missing-file-path')
    : { sourcePath: providedFilePath };

  if (preparedSource.cleanup) {
    cleanupTasks.push(preparedSource.cleanup);
  }

  const createCarOptions: CreateCarOptions = { logger };

  try {
    onProgress?.({
      stage: 'creating-car',
      progress: 10,
      message: 'Creating CAR file from video...',
    });

    const carBuildResult: CarBuildResult = await unixfsCarBuilder.buildCar(
      preparedSource.sourcePath,
      createCarOptions
    );

    cleanupTasks.push(async () => {
      await unixfsCarBuilder.cleanup(carBuildResult.carPath, logger);
    });

    onProgress?.({
      stage: 'creating-car',
      progress: 11,
      message: 'CAR file created. Reading contents...',
    });

    const carBytesBuffer = await readFileFromFs(carBuildResult.carPath);
    const carBytes = new Uint8Array(carBytesBuffer);

    onProgress?.({
      stage: 'creating-car',
      progress: 13,
      message: 'CAR file ready',
    });

    const rootCid = `${carBuildResult.rootCid}`;

    return {
      carBytes,
      rootCid,
      carPath: carBuildResult.carPath,
      carSize: carBuildResult.size,
      cleanupTasks,
    };
  } catch (error) {
    await runCleanup(cleanupTasks, logger, 'CAR creation');
    throw error;
  }
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
  // Validate configuration
  if (!config.privateKey || !config.privateKey.trim()) {
    throw new Error('Private key is required');
  }

  if (!config.rpcUrl || !config.rpcUrl.trim()) {
    throw new Error('RPC URL is required');
  }

  // Normalize private key: add 0x prefix if missing (MetaMask exports without it)
  const normalizedPrivateKey = normalizePrivateKey(config.privateKey);
  
  // Validate private key format (should be 66 characters with 0x prefix, or 64 without)
  if (normalizedPrivateKey.length !== 66 || !normalizedPrivateKey.startsWith('0x')) {
    throw new Error(`Invalid private key format. Expected 66 characters with 0x prefix, got ${normalizedPrivateKey.length} characters`);
  }

  logger.info('Initializing Synapse SDK', {
    rpcUrl: config.rpcUrl,
    hasPrivateKey: !!normalizedPrivateKey,
    privateKeyLength: normalizedPrivateKey.length,
  });

  try {
    logger.info('Calling initSynapse...');
    
    // Create init config
    const initConfig = {
      privateKey: normalizedPrivateKey,
      rpcUrl: config.rpcUrl,
      telemetry: {
        sentryInitOptions: {
          enabled: false, // Disable telemetry in browser
        },
      },
    };

    // Helper to normalize initSynapse invocation across versions/signatures.
    const callInitSynapse = (): Promise<unknown> => {
      const initAsAny = initSynapse as unknown as (...args: unknown[]) => Promise<unknown>;

      // Prefer legacy signature first (config, logger) because the new signature crashes in our version.
      try {
        return initAsAny(initConfig, logger);
      } catch (legacyErrorWithLogger) {
        logger.warn('initSynapse (legacy with logger) failed, trying legacy without logger', {
          error: legacyErrorWithLogger instanceof Error ? legacyErrorWithLogger.message : legacyErrorWithLogger,
        });
      }

      // Legacy without logger
      try {
        return initAsAny(initConfig);
      } catch (legacyNoLoggerError) {
        logger.warn('initSynapse (legacy without logger) failed, trying object signature', {
          error: legacyNoLoggerError instanceof Error ? legacyNoLoggerError.message : legacyNoLoggerError,
        });
      }

      // Final fallback: new single-object signature
      const initParams: { config: typeof initConfig; logger?: ReturnType<typeof createLogger> } = {
        config: initConfig,
        logger,
      };

      return initAsAny(initParams);
    };

    const initPromise = callInitSynapse();

    logger.info('Waiting for initSynapse to resolve...');
    
    const result = await Promise.race([
      initPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Synapse SDK initialization timed out after 30 seconds. Check your RPC URL and network connection.'));
        }, 30000);
      }),
    ]);

    logger.info('Synapse SDK initialized successfully');
    
    // Type assertion needed since TypeScript can't properly infer the return type from filecoin-pin
    // We use unknown as intermediate type to safely convert between incompatible types
    return result as unknown as Synapse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to initialize Synapse SDK', { 
      error: errorMessage,
      rpcUrl: config.rpcUrl,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Upload a video file to Filecoin
 * If encryption is enabled, the video will be encrypted using Lit Protocol before upload
 */
export async function uploadVideoToFilecoin(
  options: UploadOptions
): Promise<FilecoinUploadResult> {
  const logger = createLogger();
  const { file, config, onProgress, filePath } = options;
  const cleanupTasks: CleanupCallback[] = [];
  
  // Track encryption metadata if encryption is enabled
  let encryptionMetadata: LitEncryptionMetadata | undefined;
  let isEncrypted = false;
  
  // Track upload progress interval for cleanup
  let progressInterval: NodeJS.Timeout | undefined;

  try {
    // Step 1: Prepare file (encrypt if enabled)
    onProgress?.({
      stage: 'preparing',
      progress: 2,
      message: 'Preparing video for upload...',
    });

    let fileToUpload: File = file;
    
    // Step 1a: Encrypt if encryption is enabled
    if (config.encryptionEnabled) {
      logger.info('Encryption enabled, encrypting video with Lit Protocol...');
      isEncrypted = true;
      
      onProgress?.({
        stage: 'encrypting',
        progress: 4,
        message: 'Encrypting video with Lit Protocol...',
      });
      
      try {
        // Read file as ArrayBuffer
        const fileBuffer = await file.arrayBuffer();
        
        // Encrypt the file
        const encryptResult = await encryptFileForStorage(
          fileBuffer,
          config.privateKey,
          (message: string) => {
            onProgress?.({
              stage: 'encrypting',
              progress: 8,
              message,
            });
          }
        );
        
        encryptionMetadata = encryptResult.metadata;
        
        // Create a new File from the encrypted data
        // Create a fresh ArrayBuffer to avoid SharedArrayBuffer compatibility issues
        const encryptedBuffer = new ArrayBuffer(encryptResult.encryptedData.byteLength);
        new Uint8Array(encryptedBuffer).set(encryptResult.encryptedData);
        const encryptedBlob = new Blob([encryptedBuffer], {
          type: 'application/octet-stream',
        });
        fileToUpload = new File([encryptedBlob], `${file.name}.encrypted`, {
          type: 'application/octet-stream',
        });
        
        logger.info('Video encrypted successfully', {
          originalSize: file.size,
          encryptedSize: fileToUpload.size,
        });
        
        onProgress?.({
          stage: 'encrypting',
          progress: 12,
          message: 'Encryption complete',
        });
      } catch (encryptError) {
        const errorMessage = encryptError instanceof Error 
          ? encryptError.message 
          : 'Unknown encryption error';
        logger.error('Encryption failed', { error: errorMessage });
        throw new Error(`Lit Protocol encryption failed: ${errorMessage}`);
      }
    }

    // Step 2: Create CAR file (from encrypted or original file)
    const {
      carBytes,
      rootCid,
      carPath,
      carSize,
      cleanupTasks: carCleanupTasks,
    } = await createCarFromVideo(
      fileToUpload,
      onProgress,
      isEncrypted,
      logger,
      isEncrypted ? undefined : filePath
    );

    cleanupTasks.push(...carCleanupTasks);

    // Log CAR creation result for debugging
    logger.info('CAR created', {
      carSizeBytes: carSize ?? carBytes.length,
      rootCid,
      carPath,
    });

    onProgress?.({
      stage: 'checking-payments',
      progress: 14,
      message: 'Initializing Filecoin connection...',
    });

    logger.info('Starting Synapse SDK initialization...');

    // Step 2: Initialize Synapse SDK (without storage context)
    // This matches filecoin-pin pattern: initialize first, validate payments, then create storage context
    let synapse: Synapse;
    try {
      synapse = await initializeSynapseSDK(config, logger);
      logger.info('Synapse SDK initialization completed');
    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : { error: String(error) };
      logger.error('Synapse initialization failed', errorDetails);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during Synapse initialization';
      throw new Error(`Failed to initialize Filecoin connection: ${errorMessage}`);
    }

    // Step 3: Check upload readiness (payment validation)
    // This validates payments BEFORE creating storage context (filecoin-pin pattern)
    logger.info('Checking upload readiness (payment validation)...', {
      fileSize: carBytes.length,
      fileSizeMB: (carBytes.length / 1024 / 1024).toFixed(2),
    });

    let readiness;
    try {
      readiness = await checkUploadReadiness({
        synapse: synapse as any,
        fileSize: carBytes.length,
        autoConfigureAllowances: true,
        onProgress: (event: { type: string }) => {
          logger.info('Upload readiness progress', { eventType: event.type });
          if (event.type === 'checking-balances') {
            onProgress?.({
              stage: 'checking-payments',
              progress: 15,
              message: 'Checking wallet balances...',
            });
          } else if (event.type === 'checking-allowances') {
            onProgress?.({
              stage: 'checking-payments',
              progress: 16,
              message: 'Checking allowances...',
            });
          } else if (event.type === 'configuring-allowances') {
            onProgress?.({
              stage: 'checking-payments',
              progress: 17,
              message: 'Configuring allowances...',
            });
          } else if (event.type === 'validating-capacity') {
            onProgress?.({
              stage: 'checking-payments',
              progress: 18,
              message: 'Validating payment capacity...',
            });
          }
        },
      });
      logger.info('Upload readiness check completed', { status: readiness.status });
    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : { error: String(error) };
      logger.error('Upload readiness check failed', errorDetails);
      throw error;
    }

    if (readiness.status === 'blocked') {
      const errorMessage =
        readiness.validation.errorMessage ||
        readiness.suggestions.join('. ') ||
        'Upload blocked: Payment setup incomplete';
      throw new Error(errorMessage);
    }

    onProgress?.({
      stage: 'checking-payments',
      progress: 19,
      message: 'Creating storage context...',
    });

    // Step 4: Create storage context AFTER payment validation passes
    // This matches filecoin-pin pattern from add.ts line 160-180
    const { storage, providerInfo } = await createStorageContext(
      synapse as unknown as Parameters<typeof createStorageContext>[0],
      logger,
      config.dataSetId
        ? {
            dataset: {
              useExisting: config.dataSetId,
            },
          }
        : undefined
    );

    const synapseService: SynapseServiceShape = { 
      synapse, 
      storage, 
      providerInfo 
    };

    // Step 5: Execute upload
    // The filecoin-pin package calculates piece CID internally during upload
    // Type assertion needed due to multiformats version mismatch between root and filecoin-pin's nested multiformats
    // Both CID types are structurally compatible, just from different package versions
    
    // Track upload progress with time-based estimation
    const totalBytes = carBytes.length;
    const uploadStartTime = Date.now();
    const uploadStartProgress = 20;
    const uploadEndProgress = 85;
    const progressRange = uploadEndProgress - uploadStartProgress;
    
    // Estimate upload duration based on file size (conservative estimate: ~1MB/s)
    // This is just for UI feedback - actual upload speed may vary
    const estimatedUploadDurationMs = Math.max(5000, (totalBytes / (1024 * 1024)) * 1000); // At least 5 seconds
    
    // Start simulated progress update
    const startProgressSimulation = () => {
      progressInterval = setInterval(() => {
        const elapsed = Date.now() - uploadStartTime;
        const progressRatio = Math.min(0.95, elapsed / estimatedUploadDurationMs); // Cap at 95% until actual completion
        const currentProgress = uploadStartProgress + (progressRange * progressRatio);
        const estimatedBytesUploaded = Math.floor(totalBytes * progressRatio);
        const mbUploaded = (estimatedBytesUploaded / (1024 * 1024)).toFixed(2);
        const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
        
        onProgress?.({
          stage: 'uploading',
          progress: Math.floor(currentProgress),
          message: `Uploading to Filecoin... ${mbUploaded} MB / ${totalMB} MB`,
          bytesUploaded: estimatedBytesUploaded,
          totalBytes: totalBytes,
        });
      }, 500); // Update every 500ms
    };
    
    onProgress?.({
      stage: 'uploading',
      progress: uploadStartProgress,
      message: `Uploading to Filecoin... 0 MB / ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`,
      bytesUploaded: 0,
      totalBytes: totalBytes,
    });
    
    startProgressSimulation();
    
    const uploadResult = await executeUpload(synapseService, carBytes, rootCid, {
      logger,
      contextId: file.name,
      onProgress: (event: { type: string; data?: { retryCount?: number } }) => {
        switch (event.type) {
          case 'onUploadComplete': {
            // Clear progress simulation
            if (progressInterval) {
              clearInterval(progressInterval);
            }
            onProgress?.({
              stage: 'uploading',
              progress: uploadEndProgress,
              message: `Upload complete (${(totalBytes / (1024 * 1024)).toFixed(2)} MB), adding to dataset...`,
              bytesUploaded: totalBytes,
              totalBytes: totalBytes,
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
          case 'ipniProviderResults.retryUpdate': {
            const retryCount = event.data?.retryCount ?? 0;
            const attemptCount = retryCount === 0 ? 1 : retryCount + 1;
            onProgress?.({
              stage: 'validating',
              progress: 95,
              message: `Checking IPNI advertisement (attempt ${attemptCount})...`,
            });
            break;
          }
          case 'ipniProviderResults.complete': {
            onProgress?.({
              stage: 'validating',
              progress: 98,
              message: 'IPNI advertisement successful. IPFS retrieval available.',
            });
            break;
          }
          case 'ipniProviderResults.failed': {
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
      message: isEncrypted 
        ? 'Upload completed successfully! Video is encrypted.' 
        : 'Upload completed successfully!',
    });

    // Encrypt the root CID itself when the video is encrypted to avoid leaking retrieval hints
    let encryptedRootCid: string | undefined;
    let cidEncryptionMetadata: string | undefined;
    if (isEncrypted) {
      const encryptedCid = await encryptTextWithLit(rootCid.toString(), config.privateKey, (message: string) => {
        onProgress?.({
          stage: 'encrypting',
          progress: 38,
          message: `Encrypting CID: ${message}`,
        });
      });
      encryptedRootCid = encryptedCid.ciphertext;
      // Store CID encryption metadata so we can decrypt it during restore
      cidEncryptionMetadata = serializeEncryptionMetadata(encryptedCid.metadata);
    }

    // Clear progress interval if still running
    if (progressInterval) {
      clearInterval(progressInterval);
    }

    return {
      rootCid: rootCid.toString(),
      pieceCid: uploadResult.pieceCid,
      pieceId: uploadResult.pieceId,
      dataSetId: uploadResult.dataSetId,
      transactionHash: uploadResult.transactionHash,
      providerInfo: uploadResult.providerInfo,
      isEncrypted,
      encryptionMetadata: encryptionMetadata 
        ? serializeEncryptionMetadata(encryptionMetadata) 
        : undefined,
      encryptedRootCid,
      cidEncryptionMetadata, // Metadata needed to decrypt encryptedRootCid
    };
  } catch (error) {
    // Clear progress interval on error
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    
    // Extract detailed error information
    const errorDetails = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause,
    } : {
      error: String(error),
      type: typeof error,
    };
    
    logger.error('Upload failed', errorDetails);
    
    // Create a more informative error message
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string' 
        ? error 
        : 'Unknown error occurred';
    
    throw new Error(`Filecoin upload failed: ${errorMessage}`);
  } finally {
    // Always cleanup temporary artifacts then WebSocket providers to allow process termination (filecoin-pin pattern)
    await runCleanup(cleanupTasks, logger, 'upload');
    try {
      await cleanupSynapseService();
    } catch (cleanupError) {
      logger.warn('Cleanup warning', { error: cleanupError });
    }
  }
}

