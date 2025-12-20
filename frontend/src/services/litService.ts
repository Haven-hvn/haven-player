import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LIT_NETWORK, LIT_ABILITY } from '@lit-protocol/constants';
import { LitAccessControlConditionResource } from '@lit-protocol/auth-helpers';
import type {
  SessionSigsMap,
  AuthSig,
} from '@lit-protocol/types';
import { ethers } from 'ethers';

// Define our own AccessControlCondition type to avoid version conflicts
interface EvmBasicAccessControlCondition {
  contractAddress: string;
  standardContractType: string;
  chain: string;
  method: string;
  parameters: string[];
  returnValueTest: {
    comparator: string;
    value: string;
  };
}

// Lit encryption metadata stored alongside the encrypted file
export interface LitEncryptionMetadata {
  ciphertext: string;
  dataToEncryptHash: string;
  accessControlConditions: EvmBasicAccessControlCondition[];
  chain: string;
}

// Result of encrypting a video file
export interface EncryptVideoResult {
  encryptedBlob: Blob;
  metadata: LitEncryptionMetadata;
}

// Lit client singleton
let litNodeClient: LitNodeClient | null = null;

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
 * Initialize or get existing Lit Node client
 * Uses Datil-dev network (free development network)
 */
export async function initLitClient(): Promise<LitNodeClient> {
  if (litNodeClient && litNodeClient.ready) {
    return litNodeClient;
  }

  // Use DatilDev network - cast to any to avoid type conflicts between versions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const network = (LIT_NETWORK as any).DatilDev || 'datil-dev';

  litNodeClient = new LitNodeClient({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    litNetwork: network as any,
    debug: false,
  });

  await litNodeClient.connect();
  console.log(`[Lit] Connected to Lit network (${network})`);

  return litNodeClient;
}

/**
 * Disconnect Lit client
 */
export async function disconnectLitClient(): Promise<void> {
  if (litNodeClient) {
    await litNodeClient.disconnect();
    litNodeClient = null;
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
 * Parameters passed to authNeededCallback by Lit Protocol
 */
interface AuthCallbackParams {
  chain?: string;
  resources?: string[];
  expiration?: string;
  uri?: string;
  nonce?: string;
  statement?: string;
}

/**
 * Generate a random nonce for SIWE messages
 */
function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Create an auth signature from a private key for Lit Protocol
 * The callback receives params from Lit nodes that MUST be included in the signed message
 */
async function createAuthSigFromPrivateKey(
  privateKey: string,
  params: AuthCallbackParams
): Promise<AuthSig> {
  const normalizedKey = normalizePrivateKey(privateKey);
  const wallet = new ethers.Wallet(normalizedKey);
  
  const domain = 'localhost';
  const statement = params.statement || 'Sign this message to authenticate with Lit Protocol.';
  
  // Use the URI from params (session public key) - this is CRITICAL
  // The Lit nodes verify that we signed the correct session key
  const uri = params.uri || 'https://localhost/login';
  const expiration = params.expiration || new Date(Date.now() + 1000 * 60 * 60).toISOString();
  const nonce = params.nonce || generateNonce();
  const issuedAt = new Date().toISOString();
  
  // Format resources if provided - must be in correct SIWE format
  const resourcesLines = params.resources && params.resources.length > 0
    ? params.resources.map(r => `- ${r}`).join('\n')
    : '';
  const resourcesSection = resourcesLines ? `\nResources:\n${resourcesLines}` : '';
  
  // Create SIWE message - format must be EXACT for Lit Protocol
  // See: https://eips.ethereum.org/EIPS/eip-4361
  const siweMessage = `${domain} wants you to sign in with your Ethereum account:
${wallet.address}

${statement}

URI: ${uri}
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expiration}${resourcesSection}`;

  console.log('[Lit] Signing SIWE message for address:', wallet.address);
  console.log('[Lit] SIWE URI (session key):', uri);
  
  const signature = await wallet.signMessage(siweMessage);
  
  return {
    sig: signature,
    derivedVia: 'web3.eth.personal.sign',
    signedMessage: siweMessage,
    address: wallet.address,
  };
}

/**
 * Get session signatures for Lit Protocol operations
 * @param client - Lit Node Client instance
 * @param privateKey - Private key for authentication
 * @param accessControlConditions - Access control conditions to create resource from
 * @param chain - Chain name (default: 'ethereum')
 */
async function getSessionSigs(
  client: LitNodeClient,
  privateKey: string,
  accessControlConditions: EvmBasicAccessControlCondition[],
  chain: string = 'ethereum'
): Promise<SessionSigsMap> {
  const normalizedKey = normalizePrivateKey(privateKey);
  
  // Create the resource from access control conditions
  // For access control condition decryption, we can use '*' as a wildcard
  const litResource = new LitAccessControlConditionResource('*');
  
  // Use LIT_ABILITY from constants - cast to avoid type conflicts between versions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decryptionAbility = (LIT_ABILITY as any).AccessControlConditionDecryption;
  
  const expiration = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour
  
  console.log('[Lit] Getting session signatures for chain:', chain);
  
  try {
    const sessionSigs = await client.getSessionSigs({
      chain,
      expiration,
      resourceAbilityRequests: [
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resource: litResource as any,
          ability: decryptionAbility,
        },
      ],
      // authNeededCallback receives params from Lit nodes including the session public key
      // We MUST sign a message that includes this session key (params.uri)
      authNeededCallback: async (params: AuthCallbackParams) => {
        console.log('[Lit] authNeededCallback called with params:', JSON.stringify({
          chain: params.chain,
          uri: params.uri,
          expiration: params.expiration,
          nonce: params.nonce,
          resources: params.resources,
        }, null, 2));
        
        // Create AuthSig using the params from Lit nodes - this includes the session key URI
        const authSig = await createAuthSigFromPrivateKey(normalizedKey, params);
        
        console.log('[Lit] Created AuthSig for address:', authSig.address);
        
        return authSig;
      },
    });

    console.log('[Lit] Session signatures obtained successfully');
    return sessionSigs;
  } catch (error) {
    // Better error handling for DOMException and other errors
    if (error instanceof DOMException) {
      console.error('[Lit] DOMException:', error.name, error.message);
      throw new Error(`Failed to create session signatures: ${error.message}`);
    }
    if (error instanceof Error) {
      console.error('[Lit] Session signature error:', error.message);
      throw error;
    }
    throw new Error('Unknown error creating session signatures');
  }
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
 * Encrypt a video file using Lit Protocol
 * Only the owner wallet can decrypt
 */
export async function encryptVideo(
  file: File,
  privateKey: string,
  onProgress?: (message: string) => void
): Promise<EncryptVideoResult> {
  onProgress?.('Initializing Lit Protocol...');
  
  const client = await initLitClient();
  const walletAddress = getWalletAddressFromPrivateKey(privateKey);
  
  onProgress?.('Creating access control conditions...');
  
  const accessControlConditions = createOwnerOnlyAccessControlConditions(walletAddress);
  
  onProgress?.('Encrypting video file...');
  
  // Read file as ArrayBuffer
  const fileBuffer = await file.arrayBuffer();
  const fileUint8Array = new Uint8Array(fileBuffer);
  
  // Encrypt the file - cast accessControlConditions to avoid version type conflicts
  const encryptResponse = await client.encrypt({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessControlConditions: accessControlConditions as any,
    dataToEncrypt: fileUint8Array,
  });

  onProgress?.('Encryption complete');
  
  // Create blob from ciphertext for storage
  const encryptedBlob = new Blob([encryptResponse.ciphertext], {
    type: 'application/octet-stream',
  });

  const metadata: LitEncryptionMetadata = {
    ciphertext: encryptResponse.ciphertext,
    dataToEncryptHash: encryptResponse.dataToEncryptHash,
    accessControlConditions,
    chain: 'ethereum',
  };

  return {
    encryptedBlob,
    metadata,
  };
}

/**
 * Decrypt a video file using Lit Protocol
 * Requires the private key of the wallet that encrypted
 */
export async function decryptVideo(
  encryptedData: Uint8Array | string,
  metadata: LitEncryptionMetadata,
  privateKey: string,
  onProgress?: (message: string) => void
): Promise<Blob> {
  onProgress?.('Initializing Lit Protocol...');
  
  const client = await initLitClient();
  
  onProgress?.('Authenticating wallet...');
  
  // Get session signatures for decryption with matching access control conditions
  const sessionSigs = await getSessionSigs(
    client,
    privateKey,
    metadata.accessControlConditions,
    metadata.chain
  );

  onProgress?.('Decrypting video...');
  
  // Get ciphertext - either from metadata or the encrypted data itself
  // Ensure it's a string (Lit Protocol expects string, not Uint8Array)
  let ciphertext: string;
  if (typeof encryptedData === 'string') {
    ciphertext = encryptedData;
  } else {
    // Use metadata ciphertext (should be a string)
    ciphertext = typeof metadata.ciphertext === 'string' 
      ? metadata.ciphertext 
      : new TextDecoder().decode(metadata.ciphertext as unknown as Uint8Array);
  }

  // Decrypt the file - cast accessControlConditions to avoid version type conflicts
  let decryptResponse;
  try {
    decryptResponse = await client.decrypt({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accessControlConditions: metadata.accessControlConditions as any,
      chain: metadata.chain,
      ciphertext,
      dataToEncryptHash: metadata.dataToEncryptHash,
      sessionSigs,
    });
  } catch (error) {
    // Better error handling for decrypt errors
    if (error instanceof DOMException) {
      console.error('[Lit] DOMException during decryption:', error.message, error);
      throw new Error(`Decryption failed: ${error.message}. Please verify your access control conditions and wallet configuration.`);
    }
    if (error instanceof Error) {
      // Check for specific Lit Protocol errors
      if (error.message.includes('session key') || error.message.includes('signing shares')) {
        console.error('[Lit] Session signature error:', error.message, error);
        throw new Error(`Authentication failed: ${error.message}. Please verify your wallet private key matches the encryption key.`);
      }
      throw error;
    }
    throw new Error('Unknown error during decryption');
  }

  onProgress?.('Decryption complete');
  
  // Convert decrypted data to blob using safe buffer conversion
  const decryptedBuffer = toArrayBuffer(decryptResponse.decryptedData);
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
  
  onProgress?.('Encrypting file...');
  
  const fileUint8Array = new Uint8Array(fileBuffer);
  
  // Encrypt the file - cast accessControlConditions to avoid version type conflicts
  const encryptResponse = await client.encrypt({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessControlConditions: accessControlConditions as any,
    dataToEncrypt: fileUint8Array,
  });

  onProgress?.('Encryption complete');
  
  // Convert ciphertext string to Uint8Array for storage
  const encoder = new TextEncoder();
  const encryptedData = encoder.encode(encryptResponse.ciphertext);

  const metadata: LitEncryptionMetadata = {
    ciphertext: encryptResponse.ciphertext,
    dataToEncryptHash: encryptResponse.dataToEncryptHash,
    accessControlConditions,
    chain: 'ethereum',
  };

  return {
    encryptedData,
    metadata,
  };
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

  onProgress?.('Encrypting text...');

  const encoder = new TextEncoder();
  const dataToEncrypt = encoder.encode(text);

  const encryptResponse = await client.encrypt({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessControlConditions: accessControlConditions as any,
    dataToEncrypt,
  });

  onProgress?.('Encryption complete');

  const metadata: LitEncryptionMetadata = {
    ciphertext: encryptResponse.ciphertext,
    dataToEncryptHash: encryptResponse.dataToEncryptHash,
    accessControlConditions,
    chain: 'ethereum',
  };

  return {
    ciphertext: encryptResponse.ciphertext,
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
  
  // Get session signatures for decryption with matching access control conditions
  const sessionSigs = await getSessionSigs(
    client,
    privateKey,
    metadata.accessControlConditions,
    metadata.chain
  );

  onProgress?.('Decrypting file...');
  
  // Use encryptedData from Filecoin if available (preferred - avoids duplication)
  // Fallback to metadata.ciphertext for backward compatibility
  // Lit Protocol expects ciphertext as a string
  let ciphertext: string;
  if (encryptedData && encryptedData.length > 0) {
    // Convert Uint8Array from Filecoin to string
    // The encryptedData is the same as metadata.ciphertext, just in Uint8Array format
    ciphertext = new TextDecoder().decode(encryptedData);
  } else if (typeof metadata.ciphertext === 'string') {
    // Fallback: use metadata.ciphertext if encryptedData is not available (backward compatibility)
    ciphertext = metadata.ciphertext;
  } else {
    // Last resort: try to convert metadata.ciphertext if it's not a string
    console.warn('[Lit] Ciphertext is not a string, attempting conversion');
    ciphertext = new TextDecoder().decode(metadata.ciphertext as unknown as Uint8Array);
  }
  
  // Decrypt the file - cast accessControlConditions to avoid version type conflicts
  let decryptResponse;
  try {
    decryptResponse = await client.decrypt({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accessControlConditions: metadata.accessControlConditions as any,
      chain: metadata.chain,
      ciphertext,
      dataToEncryptHash: metadata.dataToEncryptHash,
      sessionSigs,
    });
  } catch (error) {
    // Better error handling for decrypt errors
    if (error instanceof DOMException) {
      console.error('[Lit] DOMException during decryption:', error.message, error);
      throw new Error(`Decryption failed: ${error.message}. Please verify your access control conditions and wallet configuration.`);
    }
    if (error instanceof Error) {
      // Check for specific Lit Protocol errors
      if (error.message.includes('session key') || error.message.includes('signing shares')) {
        console.error('[Lit] Session signature error:', error.message, error);
        throw new Error(`Authentication failed: ${error.message}. Please verify your wallet private key matches the encryption key.`);
      }
      throw error;
    }
    throw new Error('Unknown error during decryption');
  }

  onProgress?.('Decryption complete');
  
  // Convert decrypted data to blob using safe buffer conversion
  const decryptedBuffer = toArrayBuffer(decryptResponse.decryptedData);
  const decryptedBlob = new Blob([decryptedBuffer], {
    type: mimeType,
  });

  return decryptedBlob;
}

/**
 * Check if Lit client is connected
 */
export function isLitClientConnected(): boolean {
  return litNodeClient !== null && litNodeClient.ready;
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
  return JSON.parse(metadataJson) as LitEncryptionMetadata;
}
