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
  encryptionMetadata?: string; // JSON-serialized LitEncryptionMetadata
  encryptedRootCid?: string; // Lit-encrypted root CID (ciphertext) for Arkiv sync
}

// Lit Protocol encryption metadata stored with encrypted videos
export interface LitEncryptionMetadata {
  ciphertext: string;
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

