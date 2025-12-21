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
  expirationWeeks?: number; // How long (in weeks) videos will be able to be restored
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
// NOTE: ciphertext is NEVER stored in metadata - it's only stored on IPFS/Filecoin
// The encrypted data itself must be downloaded from IPFS/Filecoin for decryption
export interface LitEncryptionMetadata {
  // ciphertext is NOT included - it's stored on IPFS/Filecoin only
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

