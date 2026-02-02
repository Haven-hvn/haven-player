/**
 * Lit Protocol Service - Lit SDK v8 (Naga) Implementation with Hybrid Encryption
 * 
 * This service provides encryption/decryption capabilities using Lit Protocol
 * with a hybrid approach (AES-256-GCM + Lit BLS-IBE).
 * 
 * Architecture:
 * - AES-256-GCM for local file encryption (hardware accelerated)
 * - Lit BLS-IBE for encrypting the AES key only (32 bytes)
 * 
 * Benefits:
 * - Can encrypt/decrypt files of any size efficiently
 * - Only 32 bytes (the AES key) is sent to Lit nodes
 * - Uses standard Web Crypto API (hardware accelerated)
 */

import { createLitClient, type LitClient } from '@lit-protocol/lit-client';
import { nagaDev } from '@lit-protocol/networks';
import { createAuthManager, storagePlugins } from '@lit-protocol/auth';
import { LitAccessControlConditionResource } from '@lit-protocol/auth-helpers';
import type { LitAuthStorageProvider } from '@lit-protocol/auth';
import type { LitAuthData } from '@lit-protocol/auth';
import type { PKPData } from '@lit-protocol/schemas';
import { ethers } from 'ethers';
import { createViemAccount } from './viemAdapter';

// Re-export hybrid encryption functions and types
export {
  // Core hybrid encryption functions
  hybridEncryptFile,
  hybridDecryptFile,
  // AES utilities (for advanced use cases)
  generateAESKey,
  generateIV,
  aesEncrypt,
  aesDecrypt,
  // Metadata utilities
  serializeHybridMetadata,
  deserializeHybridMetadata,
  isHybridMetadata,
  // Performance utilities
  getEncryptedSize,
  getOriginalSize,
  estimateProcessingTime,
  // Types
  type HybridEncryptionMetadata,
  type HybridEncryptionResult,
  type EvmBasicAccessControlCondition,
} from './hybridCrypto';

/**
 * Check if localStorage is available (browser environment)
 * Returns false in Node.js/Electron main process
 * 
 * Lit Protocol's storagePlugins.localStorage() does additional validation
 * beyond basic localStorage availability, so we need to be more strict here.
 */
function isLocalStorageAvailable(): boolean {
  try {
    // Check if localStorage is undefined
    if (typeof localStorage === 'undefined') {
      return false;
    }
    
    // Detect Electron environment - Electron has localStorage but Lit SDK
    // storagePlugins.localStorage() will fail due to additional checks
    const isElectron = (
      typeof process !== 'undefined' && 
      process.versions != null && 
      process.versions.electron != null
    );
    if (isElectron) {
      return false;
    }
    
    // Detect Node.js environment (no window object)
    if (typeof window === 'undefined') {
      return false;
    }
    
    // Test actual functionality
    const testKey = '__lit_storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a memory-based storage adapter for Node.js environments
 * This implements LitAuthStorageProvider for use when localStorage is not available
 * (e.g., Electron main process)
 * 
 * NOTE: Session data is NOT persisted - auth signatures will be recreated on each upload.
 * This is acceptable for background uploads where the wallet private key is always available.
 */
function createMemoryStorage(appName: string, networkName: string): LitAuthStorageProvider {
  // In-memory storage maps
  const authDataStore = new Map<string, LitAuthData>();
  const innerDelegationStore = new Map<string, string>();
  const pkpTokensStore = new Map<string, { tokenIds: string[]; timestamp: number }>();
  const pkpFullStore = new Map<string, { pkps: PKPData[]; timestamp: number }>();
  const pkpDetailsStore = new Map<string, { publicKey: string; ethAddress: string }>();
  const pkpAddressStore = new Map<string, { tokenIds: string[]; timestamp: number }>();

  const AUTH_PREFIX = 'lit-auth';
  const PKP_PREFIX = 'lit-pkp-tokens';
  const PKP_FULL_PREFIX = 'lit-pkp-full';
  const PKP_DETAILS_PREFIX = 'lit-pkp-details';
  const PKP_ADDRESS_PREFIX = 'lit-pkp-address';

  function buildLookupKey(address: string): string {
    return `${AUTH_PREFIX}:${appName}:${networkName}:${address}`;
  }

  function buildPKPCacheKey(authMethodType: number | bigint, authMethodId: string): string {
    return `${PKP_PREFIX}:${appName}:${networkName}:${authMethodType}:${authMethodId}`;
  }

  function buildPKPFullCacheKey(authMethodType: number | bigint, authMethodId: string): string {
    return `${PKP_FULL_PREFIX}:${appName}:${networkName}:${authMethodType}:${authMethodId}`;
  }

  function buildPKPDetailsCacheKey(tokenId: string): string {
    return `${PKP_DETAILS_PREFIX}:${appName}:${networkName}:${tokenId}`;
  }

  function buildPKPAddressCacheKey(ownerAddress: string): string {
    return `${PKP_ADDRESS_PREFIX}:${appName}:${networkName}:${ownerAddress}`;
  }

  return {
    config: { appName, networkName, storageType: 'memory' },

    async read<T extends { address: string }>(params: T): Promise<LitAuthData | null> {
      const key = buildLookupKey(params.address);
      return authDataStore.get(key) ?? null;
    },

    async write<T extends { address: string; authData: LitAuthData }>(params: T): Promise<void> {
      const key = buildLookupKey(params.address);
      authDataStore.set(key, params.authData);
    },

    async writeInnerDelegationAuthSig(params: { publicKey: string; authSig: string }): Promise<void> {
      const key = buildLookupKey(`${appName}-inner-delegation:${params.publicKey}`);
      innerDelegationStore.set(key, params.authSig);
    },

    async readInnerDelegationAuthSig(params: { publicKey: string }): Promise<string | null> {
      const key = buildLookupKey(`${appName}-inner-delegation:${params.publicKey}`);
      return innerDelegationStore.get(key) ?? null;
    },

    async writePKPTokens(params: {
      authMethodType: number | bigint;
      authMethodId: string;
      tokenIds: string[];
    }): Promise<void> {
      const key = buildPKPCacheKey(params.authMethodType, params.authMethodId);
      pkpTokensStore.set(key, { tokenIds: params.tokenIds, timestamp: Date.now() });
    },

    async readPKPTokens(params: {
      authMethodType: number | bigint;
      authMethodId: string;
    }): Promise<string[] | null> {
      const key = buildPKPCacheKey(params.authMethodType, params.authMethodId);
      const value = pkpTokensStore.get(key);
      return value?.tokenIds ?? null;
    },

    async writePKPs(params: {
      authMethodType: number | bigint;
      authMethodId: string;
      pkps: PKPData[];
    }): Promise<void> {
      const key = buildPKPFullCacheKey(params.authMethodType, params.authMethodId);
      pkpFullStore.set(key, { pkps: params.pkps, timestamp: Date.now() });
    },

    async readPKPs(params: {
      authMethodType: number | bigint;
      authMethodId: string;
    }): Promise<PKPData[] | null> {
      const key = buildPKPFullCacheKey(params.authMethodType, params.authMethodId);
      const value = pkpFullStore.get(key);
      return value?.pkps ?? null;
    },

    async writePKPDetails(params: {
      tokenId: string;
      publicKey: string;
      ethAddress: string;
    }): Promise<void> {
      const key = buildPKPDetailsCacheKey(params.tokenId);
      pkpDetailsStore.set(key, {
        publicKey: params.publicKey,
        ethAddress: params.ethAddress,
      });
    },

    async readPKPDetails(params: {
      tokenId: string;
    }): Promise<{ publicKey: string; ethAddress: string } | null> {
      const key = buildPKPDetailsCacheKey(params.tokenId);
      return pkpDetailsStore.get(key) ?? null;
    },

    async writePKPTokensByAddress(params: {
      ownerAddress: string;
      tokenIds: string[];
    }): Promise<void> {
      const key = buildPKPAddressCacheKey(params.ownerAddress);
      pkpAddressStore.set(key, { tokenIds: params.tokenIds, timestamp: Date.now() });
    },

    async readPKPTokensByAddress(params: {
      ownerAddress: string;
    }): Promise<string[] | null> {
      const key = buildPKPAddressCacheKey(params.ownerAddress);
      const value = pkpAddressStore.get(key);
      return value?.tokenIds ?? null;
    },
  };
}

// Define our own AccessControlCondition type to avoid version conflicts
interface EvmBasicAccessControlCondition {
  contractAddress: string;
  standardContractType: '' | 'PKPPermissions' | 'timestamp' | 'ERC20' | 'ERC721' | 'ERC721MetadataName' | 'ERC1155' | 'CASK' | 'Creaton' | 'POAP' | 'MolochDAOv2.1' | 'ProofOfHumanity' | 'SIWE' | 'LitAction';
  chain: 'ethereum' | 'sepolia' | 'goerli' | 'polygon' | 'mumbai' | 'bsc' | 'avalanche' | 'fuji' | 'arbitrum' | 'optimism' | 'base' | 'filecoin' | 'yellowstone' | 'fantom' | 'xdai';
  method: string;
  parameters: string[];
  returnValueTest: {
    comparator: '=' | 'contains' | '>' | '>=' | '<' | '<=';
    value: string;
  };
}

// Unified access control condition format for v8
interface UnifiedAccessControlCondition {
  conditionType: 'evmBasic';
  contractAddress: string;
  standardContractType: '' | 'PKPPermissions' | 'timestamp' | 'ERC20' | 'ERC721' | 'ERC721MetadataName' | 'ERC1155' | 'CASK' | 'Creaton' | 'POAP' | 'MolochDAOv2.1' | 'ProofOfHumanity' | 'SIWE' | 'LitAction';
  chain: 'ethereum' | 'sepolia' | 'goerli' | 'polygon' | 'mumbai' | 'bsc' | 'avalanche' | 'fuji' | 'arbitrum' | 'optimism' | 'base' | 'filecoin' | 'yellowstone' | 'fantom' | 'xdai';
  method: string;
  parameters: string[];
  returnValueTest: {
    comparator: '=' | 'contains' | '>' | '>=' | '<' | '<=';
    value: string;
  };
}

// Import HybridEncryptionMetadata from hybridCrypto for use in this file
import type { HybridEncryptionMetadata } from './hybridCrypto';

// Export the HybridEncryptionMetadata as LitEncryptionMetadata for consistency
export type LitEncryptionMetadata = HybridEncryptionMetadata;

// Lit client and auth manager singletons
let litClient: LitClient | null = null;
let authManager: ReturnType<typeof createAuthManager> | null = null;

/**
 * Normalize private key by ensuring it has 0x prefix
 */
function normalizePrivateKey(privateKey: string): string {
  const trimmed = privateKey.trim();
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return trimmed;
  }
  return `0x${trimmed}`;
}

/**
 * Get wallet address from private key
 */
export function getWalletAddressFromPrivateKey(privateKey: string): string {
  const normalizedKey = normalizePrivateKey(privateKey);
  const wallet = new ethers.Wallet(normalizedKey);
  return wallet.address;
}

// Promise to track initialization in progress (prevents race conditions)
let initPromise: Promise<LitClient> | null = null;

/**
 * Initialize or get existing Lit client
 * Uses Naga-dev network (free development network) - Lit SDK v8
 * 
 * This function handles Electron environments where localStorage may not be available
 * by falling back to memory storage automatically.
 */
export async function initLitClient(): Promise<LitClient> {
  // Return existing client if already initialized
  if (litClient && authManager) {
    return litClient;
  }

  // If initialization is already in progress, return the existing promise
  // This prevents race conditions when multiple components try to initialize simultaneously
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = (async (): Promise<LitClient> => {
    try {
      // Create Lit client for v8
      litClient = await createLitClient({
        network: nagaDev,
      });

      // Initialize AuthManager for session management
      // Use localStorage in browser, memory storage in Node.js/Electron main process
      const appName = 'haven-player';
      const networkName = 'naga-dev';
      
      // Try to use localStorage first, but wrap in try-catch because the Lit SDK
      // storagePlugins.localStorage() can throw errors in Electron environments
      // even when isLocalStorageAvailable() returns true
      let useMemoryStorage = true;
      
      if (isLocalStorageAvailable()) {
        try {
          authManager = createAuthManager({
            storage: storagePlugins.localStorage({
              appName,
              networkName,
            }),
          });
          useMemoryStorage = false;
          console.log('[Lit] Using localStorage for session caching');
        } catch (storageError) {
          console.warn('[Lit] localStorage plugin failed, falling back to memory storage:', storageError);
          useMemoryStorage = true;
        }
      }
      
      if (useMemoryStorage) {
        // Fallback to memory storage for Node.js/Electron main process
        // Session signatures will be recreated on each upload, but that's fine
        // since we have the private key available
        authManager = createAuthManager({
          storage: createMemoryStorage(appName, networkName),
        });
        console.log('[Lit] Using memory storage for session caching (Node.js/Electron environment)');
      }

      console.log('[Lit] Connected to Lit network (naga-dev) - SDK v8');
      return litClient;
    } catch (error) {
      // Reset state on error so next call can retry
      litClient = null;
      authManager = null;
      console.error('[Lit] Failed to initialize Lit client:', error);
      throw error;
    } finally {
      // Clear the promise so future calls can retry if needed
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Disconnect Lit client
 */
export async function disconnectLitClient(): Promise<void> {
  if (litClient) {
    try {
      await litClient.disconnect();
    } catch (error) {
      console.warn('[Lit] Error during disconnect:', error);
    }
    litClient = null;
    authManager = null;
    initPromise = null;
    console.log('[Lit] Disconnected from Lit network');
  }
}

/**
 * Create access control conditions for owner-only access
 * Only the wallet that encrypted can decrypt
 */
function createOwnerOnlyAccessControlConditions(
  walletAddress: string
): EvmBasicAccessControlCondition[] {
  return [
    {
      contractAddress: '',
      standardContractType: '',
      chain: 'ethereum',
      method: '',
      parameters: [':userAddress'],
      returnValueTest: {
        comparator: '=',
        value: walletAddress.toLowerCase(),
      },
    },
  ];
}

/**
 * Convert standard access control conditions to unified format (v8)
 */
function toUnifiedAccessControlConditions(
  conditions: EvmBasicAccessControlCondition[]
): UnifiedAccessControlCondition[] {
  return conditions.map(condition => ({
    conditionType: 'evmBasic',
    ...condition,
  }));
}

/**
 * Convert Uint8Array to ArrayBuffer safely for Blob constructor
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  // Create a new ArrayBuffer and copy the data to avoid SharedArrayBuffer issues
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}

/**
 * Get authentication context for Lit Protocol operations (v8)
 * Replaces the old session signatures approach with AuthManager
 */
async function getAuthContext(
  privateKey: string,
  chain: string = 'ethereum'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (!litClient || !authManager) {
    throw new Error('Lit client not initialized. Call initLitClient() first.');
  }

  const viemAccount = createViemAccount(privateKey);

  const authContext = await authManager.createEoaAuthContext({
    authConfig: {
      domain: 'haven-player.local',
      statement: 'Sign this message to authenticate with Haven Player',
      resources: [
        {
          resource: new LitAccessControlConditionResource('*'),
          ability: 'access-control-condition-decryption',
        },
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 60).toISOString(), // 1 hour
    },
    config: {
      account: viemAccount,
    },
    litClient,
  });

  return authContext;
}

/**
 * Encrypt a file using hybrid encryption (AES-256-GCM + Lit Protocol)
 * 
 * This is the primary encryption function for file storage.
 * Uses hybrid encryption for efficient handling of large files.
 * 
 * @param fileBuffer - File data to encrypt
 * @param privateKey - Private key for access control
 * @param onProgress - Optional progress callback
 * @returns Encrypted data and metadata
 */
export async function encryptFile(
  fileBuffer: ArrayBuffer,
  privateKey: string,
  onProgress?: (message: string) => void
): Promise<{
  encryptedData: Uint8Array;
  metadata: LitEncryptionMetadata;
}> {
  const { hybridEncryptFile } = await import('./hybridCrypto');
  const result = await hybridEncryptFile(
    fileBuffer,
    privateKey,
    'ethereum',
    onProgress
  );
  
  return {
    encryptedData: result.encryptedFile,
    metadata: result.metadata,
  };
}

/**
 * Decrypt a file using hybrid encryption (Lit Protocol + AES-256-GCM)
 * 
 * This is the primary decryption function for file storage.
 * 
 * @param encryptedData - Encrypted file data
 * @param metadata - Hybrid encryption metadata
 * @param privateKey - Private key for authentication
 * @param mimeType - MIME type for the decrypted file
 * @param onProgress - Optional progress callback
 * @returns Decrypted file as Blob
 */
export async function decryptFile(
  encryptedData: Uint8Array,
  metadata: LitEncryptionMetadata,
  privateKey: string,
  mimeType: string = 'video/mp4',
  onProgress?: (message: string) => void
): Promise<Blob> {
  const { hybridDecryptFile } = await import('./hybridCrypto');
  return hybridDecryptFile(
    encryptedData,
    metadata,
    privateKey,
    mimeType,
    onProgress
  );
}

/**
 * Decrypt text that was encrypted with encryptTextWithLit.
 * Returns the decrypted text string.
 */
export async function decryptTextWithLit(
  ciphertext: string,
  metadata: LitEncryptionMetadata,
  privateKey: string,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('Initializing Lit Protocol...');

  const client = await initLitClient();

  onProgress?.('Authenticating wallet...');

  // Get authentication context for decryption (v8)
  const authContext = await getAuthContext(privateKey, metadata.chain);

  onProgress?.('Decrypting text...');

  // Convert access control conditions to unified format (v8)
  const unifiedAccessControlConditions = toUnifiedAccessControlConditions(
    metadata.accessControlConditions
  );

  // Decrypt the text using v8 API
  let decrypted: Uint8Array;
  try {
    const decryptResponse = await client.decrypt({
      data: {
        ciphertext,
        dataToEncryptHash: metadata.keyHash,
      },
      unifiedAccessControlConditions,
      authContext, // v8: use authContext instead of sessionSigs
      chain: metadata.chain,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    decrypted = decryptResponse.decryptedData;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to decrypt text: ${error.message}`);
    }
    throw new Error('Unknown error during text decryption');
  }

  onProgress?.('Decryption complete');

  // Convert decrypted data to string
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Encrypt arbitrary text (e.g., CID) with Lit using owner-only access control.
 * Returns ciphertext and metadata for later decryption.
 * 
 * Note: For text encryption, we use Lit directly (not hybrid) since text is small.
 */
export async function encryptTextWithLit(
  text: string,
  privateKey: string,
  onProgress?: (message: string) => void
): Promise<{
  ciphertext: string;
  metadata: LitEncryptionMetadata;
}> {
  onProgress?.('Initializing Lit Protocol...');

  const client = await initLitClient();
  const walletAddress = getWalletAddressFromPrivateKey(privateKey);

  onProgress?.('Creating access control conditions...');
  const accessControlConditions = createOwnerOnlyAccessControlConditions(walletAddress);

  // Convert to unified access control conditions format for v8
  const unifiedAccessControlConditions = toUnifiedAccessControlConditions(accessControlConditions);

  onProgress?.('Encrypting text...');

  const encoder = new TextEncoder();
  const dataToEncrypt = encoder.encode(text);

  // Encrypt using v8 API
  const encrypted = await client.encrypt({
    dataToEncrypt: dataToEncrypt as unknown as ArrayBuffer,
    unifiedAccessControlConditions,
    chain: 'ethereum',
  });

  onProgress?.('Encryption complete');

  // Import HybridEncryptionMetadata type
  const { serializeHybridMetadata } = await import('./hybridCrypto');
  
  // Construct metadata (text uses direct Lit encryption, not hybrid)
  const metadata: LitEncryptionMetadata = {
    version: 'hybrid-v1',
    encryptedKey: encrypted.ciphertext,
    keyHash: encrypted.dataToEncryptHash,
    iv: '', // Not used for direct text encryption
    algorithm: 'AES-GCM',
    keyLength: 256,
    accessControlConditions,
    chain: 'ethereum',
  };

  return {
    ciphertext: encrypted.ciphertext,
    metadata,
  };
}

/**
 * Check if Lit client is connected and ready
 * This checks both the client and auth manager are initialized
 */
export function isLitClientConnected(): boolean {
  return litClient !== null && authManager !== null;
}

/**
 * Serialize encryption metadata to JSON string for storage
 */
export function serializeEncryptionMetadata(metadata: LitEncryptionMetadata): string {
  return JSON.stringify(metadata);
}

/**
 * Deserialize encryption metadata from JSON string
 */
export function deserializeEncryptionMetadata(metadataJson: string): LitEncryptionMetadata {
  const { deserializeHybridMetadata } = require('./hybridCrypto');
  return deserializeHybridMetadata(metadataJson);
}
