export interface IpfsGatewayConfig {
  baseUrl: string;
}

interface PlaybackSourceBase {
  isEncrypted: boolean;
  litEncryptionMetadata?: string | null;
}

export interface LocalPlaybackSource extends PlaybackSourceBase {
  type: "local";
  uri: string;
  reason: "local-exists";
}

export interface IpfsGatewayPlaybackSource extends PlaybackSourceBase {
  type: "ipfs";
  uri: string;
  gatewayBase: string;
  cid: string;
}

export interface BothPlaybackSources extends PlaybackSourceBase {
  type: "both";
  local: {
    uri: string;
    reason: "local-exists";
  };
  ipfs: {
    uri: string;
    gatewayBase: string;
    cid: string;
  };
}

export type PlaybackSource = LocalPlaybackSource | IpfsGatewayPlaybackSource | BothPlaybackSources;

export interface PlaybackResolutionInput {
  videoPath: string;
  rootCid?: string | null;
  gatewayConfig: IpfsGatewayConfig;
  checkFileExists: (path: string) => Promise<boolean>;
  isEncrypted?: boolean;
  litEncryptionMetadata?: string | null;
}

export interface PlaybackResolutionFailure {
  type: "unavailable";
  reason: "missing-file-and-cid";
}

export type PlaybackResolution = PlaybackSource | PlaybackResolutionFailure;

export type SelectedSource = "local" | "ipfs";

