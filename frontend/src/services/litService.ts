/**
 * Lit Protocol Service - Lit SDK v8 (Naga) Implementation
 * 
 * This service provides encryption/decryption capabilities using Lit Protocol.
 * Migrated from SDK v7 (Datil) to SDK v8 (Naga).
 * 
 * Key changes in v8:
 * - Uses createLitClient instead of LitNodeClient class
 * - Uses AuthManager with viem accounts instead of manual session signatures
 * - Network changed from datil-dev to nagaDev
 * - Encryption/decryption APIs updated for unified access control conditions
 */

import { createLitClient, type LitClient } from '@lit-protocol/lit-client';
import { nagaDev } from '@lit-protocol/networks';
import { createAuthManager, storagePlugins } from '@lit-protocol/auth';
import { LitAccessControlConditionResource } from '@lit-protocol/auth-helpers';
import { ethers } from 'ethers';
import { createViemAccount } from './viemAdapter';

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

// Lit encryption metadata stored alongside the encrypted file
// NOTE: ciphertext is NEVER stored in metadata - it's only stored on IPFS/Filecoin
// The encrypted data itself must be downloaded from IPFS/Filecoin for decryption
export interface LitEncryptionMetadata {
  // ciphertext is NOT included - it's stored on IPFS/Filecoin only
  dataToEncryptHash: string;
  accessControlConditions: EvmBasicAccessControlCondition[];
  chain: string;
  // Version field for future compatibility checks
  version?: 'v8';
}

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

/**
 * Initialize or get existing Lit client
 * Uses Naga-dev network (free development network) - Lit SDK v8
 */
export async function initLitClient(): Promise<LitClient> {
  if (litClient) {
    return litClient;
  }

  // Create Lit client for v8
  litClient = await createLitClient({
    network: nagaDev,
  });

  // Initialize AuthManager for session management
  // Using localStorage for session caching
  authManager = createAuthManager({
    storage: storagePlugins.localStorage({
      appName: 'haven-player',
      networkName: 'naga-dev',
    }),
  });

  console.log('[Lit] Connected to Lit network (naga-dev) - SDK v8');
  return litClient;
}

/**
 * Disconnect Lit client
 */
export async function disconnectLitClient(): Promise<void> {
  if (litClient) {
    await litClient.disconnect();
    litClient = null;
    authManager = null;
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
 * Get authentication context for Lit Protocol operations (v8)
 * Replaces the old session signatures approach with AuthManager
 */
async function getAuthContext(
  privateKey: string,
  chain: string = 'ethereum'
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
 * Convert Uint8Array to ArrayBuffer safely for Blob constructor
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  // Create a new ArrayBuffer and copy the data to avoid SharedArrayBuffer issues
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}

/**
 * Decrypt a video file using Lit Protocol
 * Requires the private key of the wallet that encrypted
 * NOTE: encryptedData must be provided - ciphertext is never stored in metadata
 */
export async function decryptVideo(
  encryptedData: Uint8Array,
  metadata: LitEncryptionMetadata,
  privateKey: string,
  onProgress?: (message: string) => void
): Promise<Blob> {
  onProgress?.('Initializing Lit Protocol...');

  const client = await initLitClient();

  onProgress?.('Authenticating wallet...');

  // Get authentication context for decryption (v8)
  const authContext = await getAuthContext(privateKey, metadata.chain);

  onProgress?.('Decrypting video...');

  // Decode encryptedData from IPFS (UTF-8 bytes) back to base64 string
  // Lit Protocol returns base64 string, which we encode as UTF-8 bytes for IPFS storage
  let ciphertext: string;
  if (!encryptedData || encryptedData.length === 0) {
    throw new Error(
      'No encrypted data provided. Cannot decrypt video. ' +
      'The video may be missing the encrypted file on Filecoin/IPFS.'
    );
  }

  try {
    // Decode UTF-8 bytes back to base64 string
    ciphertext = new TextDecoder('utf-8', { fatal: true }).decode(encryptedData);
  } catch (decodeError) {
    throw new Error(
      `Failed to decode encrypted data: ${decodeError instanceof Error ? decodeError.message : 'unknown error'}. ` +
      'The encrypted file may be corrupted or incomplete.'
    );
  }

  // Convert access control conditions to unified format (v8)
  const unifiedAccessControlConditions = toUnifiedAccessControlConditions(
    metadata.accessControlConditions
  );

  // Decrypt the file using v8 API
  let decrypted: Uint8Array;
  try {
    const decryptResponse = await client.decrypt({
      data: {
        ciphertext,
        dataToEncryptHash: metadata.dataToEncryptHash,
      },
      unifiedAccessControlConditions,
      authContext, // v8: use authContext instead of sessionSigs
      chain: metadata.chain,
    });
    decrypted = decryptResponse.decryptedData;
  } catch (error) {
    // Better error handling for decrypt errors
    if (error instanceof DOMException) {
      console.error('[Lit] DOMException during decryption:', error.message, error);
      throw new Error(
        `Decryption failed: ${error.message}. ` +
        'Please verify your access control conditions and wallet configuration.'
      );
    }
    if (error instanceof Error) {
      // Check for specific Lit Protocol errors
      if (error.message.includes('auth') || error.message.includes('authentication')) {
        console.error('[Lit] Authentication error:', error.message, error);
        throw new Error(
          `Authentication failed: ${error.message}. ` +
          'Please verify your wallet private key matches the encryption key.'
        );
      }
      if (error.message.includes('unified access control')) {
        console.error('[Lit] Access control error:', error.message, error);
        throw new Error(
          'Invalid encryption format. This video may need to be re-uploaded with the current SDK version.'
        );
      }
      throw error;
    }
    throw new Error('Unknown error during decryption');
  }

  onProgress?.('Decryption complete');

  // Convert decrypted data to blob using safe buffer conversion
  const decryptedBuffer = toArrayBuffer(decrypted);
  const decryptedBlob = new Blob([decryptedBuffer], {
    type: 'video/mp4',
  });

  return decryptedBlob;
}

/**
 * Encrypt a file and return both the encrypted blob and metadata as separate items
 * This is useful for storing the encrypted file on Filecoin and metadata in database
 */
export async function encryptFileForStorage(
  fileBuffer: ArrayBuffer,
  privateKey: string,
  onProgress?: (message: string) => void
): Promise<{
  encryptedData: Uint8Array;
  metadata: LitEncryptionMetadata;
}> {
  onProgress?.('Initializing Lit Protocol...');

  const client = await initLitClient();
  const walletAddress = getWalletAddressFromPrivateKey(privateKey);

  onProgress?.('Creating access control conditions...');

  const accessControlConditions = createOwnerOnlyAccessControlConditions(walletAddress);

  // Convert to unified access control conditions format for v8
  const unifiedAccessControlConditions = toUnifiedAccessControlConditions(accessControlConditions);

  onProgress?.('Encrypting file...');

  const fileUint8Array = new Uint8Array(fileBuffer);

  // Encrypt the file using v8 API
  const encrypted = await client.encrypt({
    dataToEncrypt: fileUint8Array,
    unifiedAccessControlConditions,
    chain: 'ethereum',
  });

  onProgress?.('Encryption complete');

  // Lit Protocol returns ciphertext as a base64 string
  // Encode it as UTF-8 bytes for IPFS storage
  const encoder = new TextEncoder();
  const encryptedData = encoder.encode(encrypted.ciphertext);

  // Verify the encoding is reversible (sanity check)
  const decoder = new TextDecoder('utf-8');
  const decodedBack = decoder.decode(encryptedData);
  if (decodedBack !== encrypted.ciphertext) {
    throw new Error('Failed to properly encode ciphertext for storage - encoding/decoding mismatch');
  }

  // Don't store ciphertext in metadata - it's only stored on IPFS
  // This ensures consistent behavior: always decode from IPFS, not from metadata
  const metadata: LitEncryptionMetadata = {
    // ciphertext is intentionally omitted - it's stored on IPFS only
    dataToEncryptHash: encrypted.dataToEncryptHash,
    accessControlConditions,
    chain: 'ethereum',
    version: 'v8', // Mark as v8 for future compatibility
  };

  return {
    encryptedData,
    metadata,
  };
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
        dataToEncryptHash: metadata.dataToEncryptHash,
      },
      unifiedAccessControlConditions,
      authContext, // v8: use authContext instead of sessionSigs
      chain: metadata.chain,
    });
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
    dataToEncrypt,
    unifiedAccessControlConditions,
    chain: 'ethereum',
  });

  onProgress?.('Encryption complete');

  // Don't store ciphertext in metadata - it's returned separately
  const metadata: LitEncryptionMetadata = {
    // ciphertext is intentionally omitted - it's returned separately
    dataToEncryptHash: encrypted.dataToEncryptHash,
    accessControlConditions,
    chain: 'ethereum',
    version: 'v8', // Mark as v8 for future compatibility
  };

  return {
    ciphertext: encrypted.ciphertext,
    metadata,
  };
}

/**
 * Decrypt data that was encrypted with encryptFileForStorage
 */
export async function decryptFileFromStorage(
  encryptedData: Uint8Array,
  metadata: LitEncryptionMetadata,
  privateKey: string,
  mimeType: string = 'video/mp4',
  onProgress?: (message: string) => void
): Promise<Blob> {
  onProgress?.('Initializing Lit Protocol...');

  const client = await initLitClient();

  onProgress?.('Authenticating wallet...');

  // Get authentication context for decryption (v8)
  const authContext = await getAuthContext(privateKey, metadata.chain);

  onProgress?.('Decrypting file...');

  // Lit Protocol expects ciphertext as a base64 string
  // Decode encryptedData from IPFS (UTF-8 bytes) back to base64 string
  // The encryptedData was stored using TextEncoder, so we decode it back
  if (!encryptedData || encryptedData.length === 0) {
    throw new Error(
      'No encrypted data provided. Cannot decrypt video. ' +
      'The video may be missing the encrypted file on Filecoin/IPFS.'
    );
  }

  let ciphertext: string;
  try {
    // Decode UTF-8 bytes back to base64 string
    ciphertext = new TextDecoder('utf-8', { fatal: true }).decode(encryptedData);

    // Validate the decoded ciphertext looks reasonable
    if (ciphertext.length < 10) {
      throw new Error('Decoded ciphertext appears invalid (too short)');
    }
  } catch (decodeError) {
    throw new Error(
      `Failed to decode encrypted data from IPFS: ${decodeError instanceof Error ? decodeError.message : 'unknown error'}. ` +
      'The encrypted file may be corrupted or incomplete. Please ensure the video was properly uploaded to Filecoin.'
    );
  }

  // Convert access control conditions to unified format (v8)
  const unifiedAccessControlConditions = toUnifiedAccessControlConditions(
    metadata.accessControlConditions
  );

  // Decrypt the file using v8 API
  let decrypted: Uint8Array;
  try {
    const decryptResponse = await client.decrypt({
      data: {
        ciphertext,
        dataToEncryptHash: metadata.dataToEncryptHash,
      },
      unifiedAccessControlConditions,
      authContext, // v8: use authContext instead of sessionSigs
      chain: metadata.chain,
    });
    decrypted = decryptResponse.decryptedData;
  } catch (error) {
    // Better error handling for decrypt errors
    if (error instanceof DOMException) {
      console.error('[Lit] DOMException during decryption:', error.message, error);
      throw new Error(
        `Decryption failed: ${error.message}. Please verify your access control conditions and wallet configuration.`
      );
    }
    if (error instanceof Error) {
      // Check for specific Lit Protocol errors
      if (error.message.includes('auth') || error.message.includes('authentication')) {
        console.error('[Lit] Authentication error:', error.message, error);
        throw new Error(
          `Authentication failed: ${error.message}. Please verify your wallet private key matches the encryption key.`
        );
      }
      if (error.message.includes('unified access control')) {
        console.error('[Lit] Access control error:', error.message, error);
        throw new Error(
          'Invalid encryption format. This video may need to be re-uploaded with the current SDK version.'
        );
      }
      throw error;
    }
    throw new Error('Unknown error during decryption');
  }

  onProgress?.('Decryption complete');

  // Convert decrypted data to blob using safe buffer conversion
  const decryptedBuffer = toArrayBuffer(decrypted);
  const decryptedBlob = new Blob([decryptedBuffer], {
    type: mimeType,
  });

  return decryptedBlob;
}

/**
 * Check if Lit client is connected
 */
export function isLitClientConnected(): boolean {
  return litClient !== null;
}

/**
 * Serialize encryption metadata to JSON string for storage
 * Validates that ciphertext is not present (it should only be on IPFS)
 */
export function serializeEncryptionMetadata(metadata: LitEncryptionMetadata): string {
  // Ensure ciphertext is never included in metadata
  if ('ciphertext' in metadata && (metadata as Record<string, unknown>).ciphertext !== undefined) {
    throw new Error(
      'Cannot serialize metadata with ciphertext - ciphertext must only be stored on IPFS, not in metadata'
    );
  }
  return JSON.stringify(metadata);
}

/**
 * Deserialize encryption metadata from JSON string
 */
export function deserializeEncryptionMetadata(metadataJson: string): LitEncryptionMetadata {
  return JSON.parse(metadataJson) as LitEncryptionMetadata;
}

/**
 * Check if metadata is from v8 SDK
 * Useful for detecting compatibility issues
 */
export function isV8Metadata(metadata: LitEncryptionMetadata): boolean {
  return metadata.version === 'v8';
}
