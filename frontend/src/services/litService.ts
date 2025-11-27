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
 * Create an auth signature from a private key for Lit Protocol
 */
async function createAuthSigFromPrivateKey(privateKey: string): Promise<AuthSig> {
  const normalizedKey = normalizePrivateKey(privateKey);
  const wallet = new ethers.Wallet(normalizedKey);
  
  const domain = 'localhost';
  const origin = 'https://localhost';
  const statement = 'Sign this message to authenticate with Lit Protocol for video decryption.';
  
  // Create SIWE message
  const siweMessage = `${domain} wants you to sign in with your Ethereum account:
${wallet.address}

${statement}

URI: ${origin}
Version: 1
Chain ID: 1
Nonce: ${Math.random().toString(36).substring(2, 15)}
Issued At: ${new Date().toISOString()}`;

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
 */
async function getSessionSigs(
  client: LitNodeClient,
  privateKey: string
): Promise<SessionSigsMap> {
  const authSig = await createAuthSigFromPrivateKey(privateKey);
  
  // Create the resource for access control condition decryption
  const litResource = new LitAccessControlConditionResource('*');
  
  // Use LIT_ABILITY from constants - cast to avoid type conflicts between versions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decryptionAbility = (LIT_ABILITY as any).AccessControlConditionDecryption;
  
  const sessionSigs = await client.getSessionSigs({
    chain: 'ethereum',
    resourceAbilityRequests: [
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resource: litResource as any,
        ability: decryptionAbility,
      },
    ],
    authNeededCallback: async () => {
      return authSig;
    },
  });

  return sessionSigs;
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
  
  // Get session signatures for decryption
  const sessionSigs = await getSessionSigs(client, privateKey);

  onProgress?.('Decrypting video...');
  
  // Get ciphertext - either from metadata or the encrypted data itself
  const ciphertext = typeof encryptedData === 'string' 
    ? encryptedData 
    : metadata.ciphertext;

  // Decrypt the file - cast accessControlConditions to avoid version type conflicts
  const decryptResponse = await client.decrypt({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessControlConditions: metadata.accessControlConditions as any,
    chain: metadata.chain,
    ciphertext,
    dataToEncryptHash: metadata.dataToEncryptHash,
    sessionSigs,
  });

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
  
  // Get session signatures for decryption
  const sessionSigs = await getSessionSigs(client, privateKey);

  onProgress?.('Decrypting file...');
  
  // Decrypt the file using metadata's ciphertext - cast to avoid version type conflicts
  const decryptResponse = await client.decrypt({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessControlConditions: metadata.accessControlConditions as any,
    chain: metadata.chain,
    ciphertext: metadata.ciphertext,
    dataToEncryptHash: metadata.dataToEncryptHash,
    sessionSigs,
  });

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
