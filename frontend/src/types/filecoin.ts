export interface FilecoinUploadStatus {
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number; // 0-100
  error?: string;
  rootCid?: string;
  pieceCid?: string;
  pieceId?: number;
  dataSetId?: string;
  transactionHash?: string;
}

export interface FilecoinConfig {
  privateKey: string;
  rpcUrl?: string;
  dataSetId?: number;
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
}

