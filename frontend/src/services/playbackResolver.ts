import {
  IpfsGatewayConfig,
  PlaybackResolution,
  PlaybackResolutionInput,
} from "@/types/playback";

export const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

const ensureTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value : `${value}/`;

export const normalizeGatewayBase = (baseUrl: string): string => {
  try {
    const trimmed = baseUrl.trim();
    const url = new URL(trimmed);
    const hasIpfsPath = url.pathname.includes("/ipfs");
    const pathname = hasIpfsPath
      ? ensureTrailingSlash(url.pathname)
      : `${ensureTrailingSlash(url.pathname)}ipfs/`;
    url.pathname = pathname;
    return url.toString();
  } catch {
    return DEFAULT_IPFS_GATEWAY;
  }
};

export const normalizeCid = (cid: string): string =>
  cid
    .trim()
    .replace(/^ipfs:\/\//i, "")
    .replace(/^\/?ipfs\//i, "")
    .replace(/^\//, "");

export const buildIpfsGatewayUrl = (
  cid: string,
  gatewayConfig: IpfsGatewayConfig
): { uri: string; gatewayBase: string } => {
  const gatewayBase = normalizeGatewayBase(gatewayConfig.baseUrl || DEFAULT_IPFS_GATEWAY);
  const normalizedCid = normalizeCid(cid);
  
  // With bare: true option, the CID points directly to the file (no directory wrapper)
  // So we can access it directly without needing a filename
  return { uri: `${gatewayBase}${normalizedCid}`, gatewayBase };
};


export const resolvePlaybackSource = async (
  input: PlaybackResolutionInput
): Promise<PlaybackResolution> => {
  const {
    videoPath,
    rootCid,
    gatewayConfig,
    checkFileExists,
    isEncrypted = false,
    litEncryptionMetadata = null,
    title,
    fileExtension,
  } = input;

  const fileExists = await checkFileExists(videoPath);
  const hasIpfsCid = Boolean(rootCid);

  // With bare: true option, the CID points directly to the file (no directory wrapper)
  // No filename needed - we can access the file directly via the CID

  // If both local and IPFS are available, return both
  if (fileExists && hasIpfsCid) {
    const { uri, gatewayBase } = buildIpfsGatewayUrl(rootCid!, gatewayConfig);
    return {
      type: "both",
      local: {
        uri: videoPath,
        reason: "local-exists",
      },
      ipfs: {
        uri,
        gatewayBase,
        cid: normalizeCid(rootCid!),
      },
      isEncrypted,
      litEncryptionMetadata,
    };
  }

  // If only local is available
  if (fileExists) {
    return {
      type: "local",
      uri: videoPath,
      reason: "local-exists",
      isEncrypted,
      litEncryptionMetadata,
    };
  }

  // If only IPFS is available
  if (hasIpfsCid) {
    const { uri, gatewayBase } = buildIpfsGatewayUrl(rootCid!, gatewayConfig);
    return {
      type: "ipfs",
      uri,
      gatewayBase,
      cid: normalizeCid(rootCid!),
      isEncrypted,
      litEncryptionMetadata,
    };
  }

  // Neither available
  return { type: "unavailable", reason: "missing-file-and-cid" };
};

