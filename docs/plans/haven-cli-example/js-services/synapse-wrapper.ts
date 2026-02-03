/**
 * Synapse SDK (Filecoin) Service Wrapper for Deno
 * 
 * Wraps the filecoin-pin Synapse SDK for headless operation.
 */

import {
    createUnixfsCarBuilder,
    type CarBuildResult,
} from "npm:filecoin-pin@0.14.0/core/unixfs";
import {
    initializeSynapse,
    createStorageContext,
    cleanupSynapseService,
} from "npm:filecoin-pin@0.14.0/core/synapse";
import { executeUpload, checkUploadReadiness } from "npm:filecoin-pin@0.14.0/core/upload";
import * as path from "https://deno.land/std@0.200.0/path/mod.ts";

export interface UploadConfig {
    privateKey: string;
    rpcUrl: string;
    dataSetId?: string;
    encryptionEnabled?: boolean;
}

export interface UploadResult {
    rootCid: string;
    pieceCid: string;
    pieceId: string;
    dataSetId?: string;
    transactionHash?: string;
    providerInfo: any;
    isEncrypted: boolean;
}

interface ProgressCallback {
    (stage: string, progress: number, message: string): void;
}

export class SynapseService {
    private carBuilder = createUnixfsCarBuilder();

    /**
     * Upload a file to Filecoin.
     * 
     * @param filePath - Path to the file to upload
     * @param config - Upload configuration
     * @param onProgress - Optional progress callback
     * @returns Upload result with CIDs
     */
    async uploadFile(
        filePath: string,
        config: UploadConfig,
        onProgress?: ProgressCallback
    ): Promise<UploadResult> {
        onProgress?.("reading", 5, `Reading file: ${path.basename(filePath)}`);
        
        // Verify file exists and get stats
        const fileInfo = await Deno.stat(filePath);
        if (!fileInfo.isFile) {
            throw new Error(`Not a file: ${filePath}`);
        }

        // Initialize Synapse
        onProgress?.("init", 10, "Initializing Synapse SDK...");
        const synapse = await this.initializeSynapse(config);

        // Create CAR file
        onProgress?.("car", 15, "Creating CAR file...");
        const carResult = await this.createCar(filePath);
        onProgress?.("car", 25, `CAR created: ${carResult.rootCid}`);

        // Check upload readiness
        onProgress?.("payment", 30, "Checking payment readiness...");
        const readiness = await checkUploadReadiness({
            synapse: synapse as any,
            fileSize: carResult.carBytes.length,
            autoConfigureAllowances: true,
        });

        if (readiness.status === "blocked") {
            throw new Error(
                `Upload blocked: ${readiness.validation?.errorMessage || "Payment setup incomplete"}`
            );
        }

        // Create storage context
        onProgress?.("storage", 40, "Creating storage context...");
        const { storage, providerInfo } = await createStorageContext(
            synapse as any,
            undefined, // logger
            config.dataSetId ? { dataset: { useExisting: config.dataSetId } } : undefined
        );

        // Execute upload
        onProgress?.("upload", 50, "Starting upload to Filecoin...");
        
        const synapseService = { synapse, storage, providerInfo };
        
        const uploadResult = await executeUpload(
            synapseService as any,
            carResult.carBytes,
            carResult.rootCid,
            {
                contextId: path.basename(filePath),
                onProgress: (event: { type: string; data?: any }) => {
                    switch (event.type) {
                        case "onUploadComplete":
                            onProgress?.("upload", 80, "Upload complete");
                            break;
                        case "onPieceAdded":
                            onProgress?.("confirm", 85, "Piece added to dataset");
                            break;
                        case "onPieceConfirmed":
                            onProgress?.("confirm", 90, "Piece confirmed on-chain");
                            break;
                        case "ipniProviderResults.complete":
                            onProgress?.("index", 95, "IPNI advertisement successful");
                            break;
                        case "ipniProviderResults.failed":
                            onProgress?.("index", 95, "IPNI advertisement pending");
                            break;
                    }
                },
                ipniValidation: { enabled: true },
            }
        );

        onProgress?.("complete", 100, "Upload completed successfully");

        // Cleanup
        await cleanupSynapseService();

        return {
            rootCid: carResult.rootCid,
            pieceCid: uploadResult.pieceCid,
            pieceId: uploadResult.pieceId,
            dataSetId: uploadResult.dataSetId,
            transactionHash: uploadResult.transactionHash,
            providerInfo: uploadResult.providerInfo,
            isEncrypted: config.encryptionEnabled || false,
        };
    }

    /**
     * Initialize Synapse SDK with configuration.
     */
    private async initializeSynapse(config: UploadConfig): Promise<any> {
        const normalizedKey = config.privateKey.startsWith("0x")
            ? config.privateKey
            : `0x${config.privateKey}`;

        const initConfig = {
            privateKey: normalizedKey,
            rpcUrl: config.rpcUrl,
            telemetry: {
                sentryInitOptions: { enabled: false },
            },
        };

        return await initializeSynapse(initConfig);
    }

    /**
     * Create a CAR file from a local file.
     */
    private async createCar(filePath: string): Promise<{
        carBytes: Uint8Array;
        rootCid: string;
        carPath: string;
    }> {
        // Build CAR file
        const result: CarBuildResult = await this.carBuilder.buildCar(filePath, {
            logger: undefined,
            bare: true, // Create bare file CID without directory wrapper
        });

        // Read CAR bytes
        const carBytes = await Deno.readFile(result.carPath);

        // Cleanup temp CAR file
        await Deno.remove(result.carPath);

        return {
            carBytes,
            rootCid: result.rootCid,
            carPath: result.carPath,
        };
    }

    /**
     * Get upload size limits.
     */
    getSizeLimits(): { max: number; min: number } {
        return {
            max: 1_065_353_216, // ~1 GiB (Synapse limit)
            min: 127,           // Minimum for PieceCIDv2
        };
    }

    /**
     * Calculate projected upload size.
     */
    calculateProjectedSize(fileSize: number, encryptionEnabled: boolean): number {
        const ENCRYPTION_OVERHEAD = 1.35; // ~35% for base64
        const CAR_OVERHEAD = 1.01;        // ~1% for CAR format
        const SAFETY_MARGIN = 1.05;       // 5% safety margin

        let size = fileSize;
        if (encryptionEnabled) {
            size = Math.ceil(size * ENCRYPTION_OVERHEAD);
        }
        size = Math.ceil(size * CAR_OVERHEAD * SAFETY_MARGIN);
        return size;
    }
}
