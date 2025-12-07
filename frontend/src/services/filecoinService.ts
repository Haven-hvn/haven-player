import { createCarFromPath } from 'filecoin-pin/core';
import {
  initializeSynapse as initSynapse,
  createStorageContext,
  cleanupSynapseService,
  type SynapseService,
} from 'filecoin-pin/core/synapse';
// Import the actual Synapse type from the package if available, otherwise infer it
// TypeScript may not be able to properly infer this, so we'll use type assertions where needed
type Synapse = Awaited<ReturnType<typeof initSynapse>>;
import { executeUpload, checkUploadReadiness } from 'filecoin-pin/core/upload';
// Use CID from multiformats - type assertion needed due to version mismatch
import type { CID } from 'multiformats/cid';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { FilecoinUploadResult, FilecoinConfig } from '@/types/filecoin';
import { 
  encryptFileForStorage, 
  serializeEncryptionMetadata,
  type LitEncryptionMetadata,
} from '@/services/litService';

// Simple logger for browser environment that matches filecoin-pin's Logger interface
// LogFn expects (msg: string, ...args: unknown[]) signature
// But filecoin-pin may call it with objects, so we handle both cases
const createLogger = () => {
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
    silent: false as const,
    msgPrefix: '[Filecoin]',
  } as const;
};

export interface UploadProgress {
  stage: 'preparing' | 'encrypting' | 'creating-car' | 'checking-payments' | 'uploading' | 'validating' | 'completed';
  progress: number; // 0-100
  message: string;
}

export interface UploadOptions {
  file: File;
  config: FilecoinConfig;
  filePath?: string; // optional original path when available (used for CAR creation when not encrypted)
  onProgress?: (progress: UploadProgress) => void;
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
  filePath?: string,
  isEncrypted: boolean = false,
  logger?: ReturnType<typeof createLogger>
): Promise<{ carBytes: Uint8Array; rootCid: CID; pieceCid?: CID | string }> {
  onProgress?.({
    stage: 'creating-car',
    progress: 0,
    message: 'Creating CAR file from video...',
  });

  const buildCarFromPath = async (pathToUse: string) => {
    // Some versions return { car }, others { carBytes }, others write to disk and return a path.
    const result = await (createCarFromPath as unknown as (p: string) => Promise<Record<string, unknown>>)(
      pathToUse
    );
    
    // Log what we got for debugging
    logger?.info('createCarFromPath result', {
      keys: Object.keys(result),
      hasRootCid: !!(result as { rootCid?: CID }).rootCid,
      hasPieceCid: !!(result as { pieceCid?: CID | string }).pieceCid,
    });
    
    const rootCid = (result as { rootCid?: CID }).rootCid;
    const pieceCid = (result as { pieceCid?: CID | string }).pieceCid;
    const rawCar =
      (result as { carBytes?: Uint8Array }).carBytes ??
      (result as { car?: Uint8Array | string }).car ??
      (result as { carFile?: Uint8Array | string }).carFile ??
      (result as { carPath?: string }).carPath ??
      (result as { carFilePath?: string }).carFilePath;

    let carBytes: Uint8Array | undefined;
    if (rawCar instanceof Uint8Array) {
      carBytes = rawCar;
    } else if (typeof rawCar === 'string') {
      carBytes = fs.readFileSync(rawCar);
    }

    if (!carBytes || !rootCid) {
      logger?.error('[Filecoin] createCarFromPath returned unexpected shape', {
        keys: Object.keys(result),
        rootCid: !!rootCid,
        hasCarBytes: !!carBytes,
        rawCarType: typeof rawCar,
      });
      throw new Error('Failed to build CAR: missing car bytes or rootCid');
    }

    // Return pieceCid if available (some versions compute it)
    return { carBytes, rootCid, pieceCid };
  };

  // If not encrypted and we have the original file path, prefer the path-based CAR builder.
  if (!isEncrypted && filePath) {
    return buildCarFromPath(filePath);
  }

  // Fallback: write the File to a temp path and build CAR from path (works for encrypted blobs too)
  const tempPath = path.join(os.tmpdir(), `haven-upload-${Date.now()}-${file.name}.car-source`);
  try {
    const fileBuffer = new Uint8Array(await file.arrayBuffer());
    fs.writeFileSync(tempPath, fileBuffer);
    return await buildCarFromPath(tempPath);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // ignore cleanup errors
    }
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
  const { file, config, onProgress } = options;
  
  // Track encryption metadata if encryption is enabled
  let encryptionMetadata: LitEncryptionMetadata | undefined;
  let isEncrypted = false;

  try {
    // Step 1: Prepare file (encrypt if enabled)
    onProgress?.({
      stage: 'preparing',
      progress: 5,
      message: 'Preparing video for upload...',
    });

    let fileToUpload: File = file;
    
    // Step 1a: Encrypt if encryption is enabled
    if (config.encryptionEnabled) {
      logger.info('Encryption enabled, encrypting video with Lit Protocol...');
      isEncrypted = true;
      
      onProgress?.({
        stage: 'encrypting',
        progress: 10,
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
              progress: 20,
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
          progress: 35,
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
    const { carBytes, rootCid, pieceCid } = await createCarFromVideo(
      fileToUpload,
      onProgress,
      options.filePath,
      isEncrypted,
      logger
    );
    
    // Log CAR creation result for debugging
    logger.info('CAR created', {
      carSize: carBytes.length,
      rootCid: rootCid.toString(),
      pieceCid: pieceCid ? (typeof pieceCid === 'string' ? pieceCid : pieceCid.toString()) : 'not provided',
    });

    onProgress?.({
      stage: 'checking-payments',
      progress: 50,
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
        synapse: synapse as unknown as Parameters<typeof checkUploadReadiness>[0]['synapse'],
        fileSize: carBytes.length,
        autoConfigureAllowances: true,
        onProgress: (event: { type: string }) => {
          logger.info('Upload readiness progress', { eventType: event.type });
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
      progress: 75,
      message: 'Creating storage context...',
    });

    // Step 4: Create storage context AFTER payment validation passes
    // This matches filecoin-pin pattern from add.ts line 160-180
    const { storage, providerInfo } = await createStorageContext(
      synapse as unknown as Parameters<typeof createStorageContext>[0],
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error - Logger interface expects silent to be LogFn, but boolean works at runtime
      logger,
      config.dataSetId
        ? {
            dataset: {
              useExisting: config.dataSetId,
            },
          }
        : undefined
    );

    const synapseService: SynapseService = { 
      synapse: synapse as unknown as SynapseService['synapse'], 
      storage, 
      providerInfo 
    };

    onProgress?.({
      stage: 'uploading',
      progress: 80,
      message: 'Uploading to Filecoin...',
    });

    // Step 5: Execute upload
    // Type assertion needed due to multiformats version mismatch between root and filecoin-pin's nested multiformats
    // Both CID types are structurally compatible, just from different package versions
    const uploadResult = await executeUpload(synapseService, carBytes, rootCid, {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error - Logger interface expects silent to be LogFn, but boolean works at runtime
      logger,
      contextId: file.name,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error - ProgressEventHandler expects specific event types, but our handler works with all event types at runtime
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
            const retryCount = event.data?.retryCount ?? 0;
            const attemptCount = retryCount === 0 ? 1 : retryCount + 1;
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
      message: isEncrypted 
        ? 'Upload completed successfully! Video is encrypted.' 
        : 'Upload completed successfully!',
    });

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
    };
  } catch (error) {
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
    // Always cleanup WebSocket providers to allow process termination (filecoin-pin pattern)
    // This matches the cleanup pattern from filecoin-pin/src/add/add.ts line 217
    try {
      await cleanupSynapseService();
    } catch (cleanupError) {
      logger.warn('Cleanup warning', { error: cleanupError });
    }
  }
}

