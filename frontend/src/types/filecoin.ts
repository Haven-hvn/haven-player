export interface FilecoinUploadStatus {
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number; // 0-100
  error?: string;
  rootCid?: string;
  pieceCid?: string;
  pieceId?: number;
  dataSetId?: string;
  transactionHash?: string;
  isEncrypted?: boolean;
}

export interface FilecoinConfig {
  privateKey: string;
  rpcUrl?: string;
  dataSetId?: number;
  encryptionEnabled: boolean;
}

export interface ArkivConfig {
  rpcUrl?: string;
  enabled?: boolean; // Computed from whether private key exists (shared with Filecoin)
  syncEnabled: boolean; // User toggle to enable/disable Arkiv sync
}

export interface FilecoinUploadResult {
  rootCid: string;
  pieceCid: string;
  pieceId?: number;
  dataSetId: string;
  transactionHash?: string;
  providerInfo?: {
    name?: string;
    serviceProvider?: string;
  };
  isEncrypted?: boolean;
  encryptionMetadata?: string; // JSON-serialized LitEncryptionMetadata (for video file)
  encryptedRootCid?: string; // Lit-encrypted root CID (ciphertext) for Arkiv sync
  cidEncryptionMetadata?: string; // JSON-serialized LitEncryptionMetadata (for CID encryption)
}

// Lit Protocol encryption metadata stored with encrypted videos
// Note: ciphertext is optional - when syncing to Arkiv, ciphertext is removed to reduce payload size
// The encrypted data itself is stored on Filecoin/IPFS and should be used for decryption
export interface LitEncryptionMetadata {
  ciphertext?: string // Optional - removed from Arkiv payload, available from Filecoin/IPFS;
  dataToEncryptHash: string;
  accessControlConditions: AccessControlCondition[];
  chain: string;
}

// Access control condition for Lit Protocol
export interface AccessControlCondition {
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

