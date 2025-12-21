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
// Note: ciphertext is optional - when syncing to Arkiv, ciphertext is removed to reduce payload size
// The encrypted data itself is stored on Filecoin/IPFS and should be used for decryption
export interface LitEncryptionMetadata {
  ciphertext?: string; // Optional - removed from Arkiv payload, available from Filecoin/IPFS
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
  
  // Log what Lit Protocol returns to understand the format
  console.log('[Lit Encryption] encryptResponse type:', typeof encryptResponse.ciphertext);
  console.log('[Lit Encryption] encryptResponse.ciphertext length:', encryptResponse.ciphertext?.length);
  if (encryptResponse.ciphertext) {
    console.log('[Lit Encryption] encryptResponse.ciphertext first 100 chars:', encryptResponse.ciphertext.substring(0, 100));
    console.log('[Lit Encryption] encryptResponse.ciphertext last 100 chars:', encryptResponse.ciphertext.substring(Math.max(0, encryptResponse.ciphertext.length - 100)));
    console.log('[Lit Encryption] encryptResponse.ciphertext starts with {:', encryptResponse.ciphertext.trim().startsWith('{'));
    console.log('[Lit Encryption] encryptResponse.ciphertext ends with }:', encryptResponse.ciphertext.trim().endsWith('}'));
  }
  
  // Convert ciphertext string to Uint8Array for storage
  // IMPORTANT: Lit Protocol's ciphertext is a JSON string
  // TextEncoder.encode() converts the string to UTF-8 bytes, which is what we need
  const encoder = new TextEncoder();
  const encryptedData = encoder.encode(encryptResponse.ciphertext);
  
  // Log what we're storing to IPFS
  console.log('[Lit Encryption] Storing to IPFS:', {
    originalCiphertextLength: encryptResponse.ciphertext.length,
    encodedBytesLength: encryptedData.byteLength,
    first50BytesHex: Array.from(encryptedData.slice(0, 50)).map(b => b.toString(16).padStart(2, '0')).join(' '),
  });
  
  // Verify the encoding is reversible (for debugging)
  const decoder = new TextDecoder('utf-8');
  const decodedBack = decoder.decode(encryptedData);
  if (decodedBack !== encryptResponse.ciphertext) {
    console.error('[Lit Encryption] WARNING: Encoding/decoding mismatch!');
    console.error('[Lit Encryption] Original length:', encryptResponse.ciphertext.length);
    console.error('[Lit Encryption] Decoded length:', decodedBack.length);
    console.error('[Lit Encryption] Bytes length:', encryptedData.byteLength);
    // Check if it's just a length difference or actual content difference
    const minLength = Math.min(decodedBack.length, encryptResponse.ciphertext.length);
    const firstMismatch = decodedBack.substring(0, minLength) !== encryptResponse.ciphertext.substring(0, minLength);
    console.error('[Lit Encryption] Content differs:', firstMismatch);
    if (firstMismatch) {
      // Find where they differ
      for (let i = 0; i < minLength; i++) {
        if (decodedBack[i] !== encryptResponse.ciphertext[i]) {
          console.error('[Lit Encryption] First difference at index:', i);
          console.error('[Lit Encryption] Original char:', encryptResponse.ciphertext[i], 'Code:', encryptResponse.ciphertext.charCodeAt(i));
          console.error('[Lit Encryption] Decoded char:', decodedBack[i], 'Code:', decodedBack.charCodeAt(i));
          break;
        }
      }
    }
    throw new Error('Failed to properly encode ciphertext for storage - encoding/decoding mismatch');
  } else {
    console.log('[Lit Encryption] Encoding/decoding verified: OK', {
      originalLength: encryptResponse.ciphertext.length,
      bytesLength: encryptedData.byteLength,
    });
  }

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
  
  // Get session signatures for decryption with matching access control conditions
  const sessionSigs = await getSessionSigs(
    client,
    privateKey,
    metadata.accessControlConditions,
    metadata.chain
  );

  onProgress?.('Decrypting text...');
  
  // Decrypt the text
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
    if (error instanceof Error) {
      throw new Error(`Failed to decrypt text: ${error.message}`);
    }
    throw new Error('Unknown error during text decryption');
  }

  onProgress?.('Decryption complete');
  
  // Convert decrypted data to string
  const decoder = new TextDecoder();
  return decoder.decode(decryptResponse.decryptedData);
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
  
  // Log metadata availability for debugging
  console.log('[Lit Decryption] Metadata available:', {
    hasCiphertext: !!metadata.ciphertext,
    ciphertextType: typeof metadata.ciphertext,
    ciphertextLength: typeof metadata.ciphertext === 'string' ? metadata.ciphertext.length : 'N/A',
    hasDataToEncryptHash: !!metadata.dataToEncryptHash,
    hasAccessControlConditions: !!metadata.accessControlConditions,
    chain: metadata.chain,
    encryptedDataLength: encryptedData?.length || 0,
    encryptedDataType: encryptedData ? 'Uint8Array' : 'undefined',
  });
  
  // Lit Protocol expects ciphertext as a string
  // Priority order:
  // 1. metadata.ciphertext (if available - backward compatibility and local videos)
  // 2. encryptedData from Filecoin/IPFS (for videos restored from Arkiv without ciphertext)
  let ciphertext: string;
  let ciphertextSource: 'metadata' | 'ipfs' | 'unknown' = 'unknown';
  
  // First, try to use metadata.ciphertext if available (preferred for backward compatibility)
  if (typeof metadata.ciphertext === 'string' && metadata.ciphertext.length > 0) {
    console.log('[Lit Decryption] Using metadata.ciphertext, length:', metadata.ciphertext.length);
    ciphertext = metadata.ciphertext;
    ciphertextSource = 'metadata';
  } else if (encryptedData && encryptedData.length > 0) {
    // Fallback: decode encryptedData from Filecoin/IPFS
    // The encryptedData was stored using TextEncoder, so we decode it back
    // Note: Lit Protocol's ciphertext is a JSON string containing encrypted data
    // Add error handling for incomplete or corrupted data
    try {
      console.log('[Lit Decryption] Decoding encrypted data from IPFS, length:', encryptedData.length);
      console.log('[Lit Decryption] First 50 bytes (hex):', Array.from(encryptedData.slice(0, 50)).map(b => b.toString(16).padStart(2, '0')).join(' '));
      ciphertext = new TextDecoder('utf-8', { fatal: true }).decode(encryptedData);
      console.log('[Lit Decryption] Decoded ciphertext length:', ciphertext.length);
      ciphertextSource = 'ipfs';
      
      // Validate the decoded ciphertext looks reasonable
      // Lit Protocol ciphertext is a JSON string, so it should start with '{' and end with '}'
      // Check for valid JSON structure to catch truncation issues
      if (ciphertext.length < 10) {
        console.warn('[Lit Decryption] Decoded ciphertext seems too short');
        throw new Error('Decoded ciphertext appears invalid (too short)');
      }
      
      // Check if ciphertext appears to be valid JSON (Lit Protocol ciphertext is JSON)
      const trimmed = ciphertext.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        console.warn('[Lit Decryption] Ciphertext does not appear to be valid JSON');
        console.warn('[Lit Decryption] First 100 chars:', trimmed.substring(0, 100));
        console.warn('[Lit Decryption] Last 100 chars:', trimmed.substring(Math.max(0, trimmed.length - 100)));
        throw new Error('Decoded ciphertext does not appear to be valid JSON. The encrypted file may be corrupted or incomplete.');
      }
      
      // Try to parse as JSON to catch truncation issues early
      // Lit Protocol's ciphertext is a JSON object with encrypted data
      try {
        const parsed = JSON.parse(ciphertext);
        console.log('[Lit Decryption] Ciphertext is valid JSON, keys:', Object.keys(parsed));
        console.log('[Lit Decryption] Ciphertext structure:', {
          hasSymmetricKey: 'symmetricKey' in parsed,
          hasCiphertext: 'ciphertext' in parsed,
          hasDataToEncryptHash: 'dataToEncryptHash' in parsed,
          keyCount: Object.keys(parsed).length
        });
        // Check if required Lit Protocol fields are present
        if (!parsed.symmetricKey && !parsed.ciphertext) {
          console.warn('[Lit Decryption] Ciphertext JSON missing expected Lit Protocol fields (symmetricKey or ciphertext)');
        }
        // Check for nested JSON strings that might be truncated
        if (parsed.ciphertext && typeof parsed.ciphertext === 'string') {
          try {
            JSON.parse(parsed.ciphertext);
            console.log('[Lit Decryption] Nested ciphertext is also valid JSON');
          } catch (nestedError) {
            console.warn('[Lit Decryption] Nested ciphertext is not JSON (this is normal for base64 data)');
          }
        }
      } catch (parseError) {
        console.error('[Lit Decryption] Failed to parse ciphertext as JSON:', parseError);
        // Log more details about the ciphertext to help diagnose
        const sampleStart = ciphertext.substring(0, 200);
        const sampleEnd = ciphertext.substring(Math.max(0, ciphertext.length - 200));
        console.error('[Lit Decryption] Ciphertext start (200 chars):', sampleStart);
        console.error('[Lit Decryption] Ciphertext end (200 chars):', sampleEnd);
        console.error('[Lit Decryption] Ciphertext length:', ciphertext.length);
        // Count braces to see if JSON is balanced
        const openBraces = (ciphertext.match(/{/g) || []).length;
        const closeBraces = (ciphertext.match(/}/g) || []).length;
        console.error('[Lit Decryption] Open braces:', openBraces, 'Close braces:', closeBraces);
        throw new Error(`Ciphertext is not valid JSON: ${parseError instanceof Error ? parseError.message : 'unknown error'}. The encrypted file may be corrupted or incomplete.`);
      }
    } catch (decodeError) {
      console.error('[Lit Decryption] Error decoding encrypted data:', decodeError);
      throw new Error(`Failed to decode encrypted data from IPFS: ${decodeError instanceof Error ? decodeError.message : 'unknown error'}. The encrypted file may be corrupted or incomplete. Please ensure the video was properly uploaded to Filecoin.`);
    }
  } else {
    // Last resort: try to convert metadata.ciphertext if it's not a string
    if (metadata.ciphertext) {
    console.warn('[Lit] Ciphertext is not a string, attempting conversion');
      try {
        ciphertext = new TextDecoder('utf-8', { fatal: true }).decode(metadata.ciphertext as unknown as Uint8Array);
      } catch (decodeError) {
        throw new Error(`Failed to decode ciphertext from metadata: ${decodeError instanceof Error ? decodeError.message : 'unknown error'}. The encryption metadata may be corrupted.`);
      }
    } else {
      throw new Error('No ciphertext available. Cannot decrypt video. The video may be missing encryption metadata or the encrypted file on Filecoin/IPFS.');
    }
  }
  
  // Validate that we have a valid ciphertext
  if (!ciphertext || ciphertext.length === 0) {
    throw new Error('Ciphertext is empty or invalid. Cannot decrypt video.');
  }
  
  // Log final ciphertext info before passing to Lit Protocol
  console.log('[Lit Decryption] Final ciphertext info:', {
    source: ciphertextSource,
    length: ciphertext.length,
    firstChar: ciphertext[0],
    lastChar: ciphertext[ciphertext.length - 1],
    startsWithBrace: ciphertext.trim().startsWith('{'),
    endsWithBrace: ciphertext.trim().endsWith('}'),
    first50Chars: ciphertext.substring(0, 50),
    last50Chars: ciphertext.substring(Math.max(0, ciphertext.length - 50)),
  });
  
  // Log what we're passing to Lit Protocol
  console.log('[Lit Decryption] Calling Lit Protocol decrypt with:', {
    ciphertextLength: ciphertext.length,
    dataToEncryptHash: metadata.dataToEncryptHash,
    accessControlConditionsCount: metadata.accessControlConditions?.length || 0,
    chain: metadata.chain,
    hasSessionSigs: !!sessionSigs,
  });
  
  console.log('[Lit Decryption] Using ciphertext for decryption, length:', ciphertext.length);
  
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
