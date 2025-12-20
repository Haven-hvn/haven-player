import {
  buildIpfsGatewayUrl,
  normalizeCid,
  normalizeGatewayBase,
  resolvePlaybackSource,
} from "@/services/playbackResolver";

const makeCheck = (exists: boolean) => jest.fn().mockResolvedValue(exists);

describe("normalizeGatewayBase", () => {
  it("adds /ipfs/ when missing and preserves scheme", () => {
    const result = normalizeGatewayBase("https://example.com");
    expect(result).toBe("https://example.com/ipfs/");
  });

  it("keeps existing ipfs path and ensures trailing slash", () => {
    const result = normalizeGatewayBase("https://gw.test/ipfs");
    expect(result).toBe("https://gw.test/ipfs/");
  });

  it("falls back to default when url is invalid", () => {
    const result = normalizeGatewayBase("not a url");
    expect(result).toBe("https://ipfs.io/ipfs/");
  });
});

describe("normalizeCid", () => {
  it("strips prefixes and slashes", () => {
    expect(normalizeCid(" ipfs://QmTest ")).toBe("QmTest");
    expect(normalizeCid("/ipfs/QmTest")).toBe("QmTest");
    expect(normalizeCid("//QmTest")).toBe("QmTest");
  });
});

describe("buildIpfsGatewayUrl", () => {
  it("returns composed url and base", () => {
    const { uri, gatewayBase } = buildIpfsGatewayUrl("QmTest", {
      baseUrl: "https://custom.gateway",
    });
    expect(gatewayBase).toBe("https://custom.gateway/ipfs/");
    expect(uri).toBe("https://custom.gateway/ipfs/QmTest");
  });
});

describe("resolvePlaybackSource", () => {
  const gatewayConfig = { baseUrl: "https://custom.gateway/ipfs" };

  it("returns both when local file exists and IPFS CID is available", async () => {
    const result = await resolvePlaybackSource({
      videoPath: "/tmp/video.mp4",
      rootCid: "QmRemote",
      gatewayConfig,
      checkFileExists: makeCheck(true),
      isEncrypted: true,
      litEncryptionMetadata: "meta",
    });

    expect(result).toEqual({
      type: "both",
      local: {
        uri: "/tmp/video.mp4",
        reason: "local-exists",
      },
      ipfs: {
        uri: "https://custom.gateway/ipfs/QmRemote",
        gatewayBase: "https://custom.gateway/ipfs/",
        cid: "QmRemote",
      },
      isEncrypted: true,
      litEncryptionMetadata: "meta",
    });
  });

  it("returns local only when file exists but no CID", async () => {
    const result = await resolvePlaybackSource({
      videoPath: "/tmp/video.mp4",
      rootCid: null,
      gatewayConfig,
      checkFileExists: makeCheck(true),
      isEncrypted: false,
      litEncryptionMetadata: null,
    });

    expect(result).toEqual({
      type: "local",
      uri: "/tmp/video.mp4",
      reason: "local-exists",
      isEncrypted: false,
      litEncryptionMetadata: null,
    });
  });

  it("falls back to ipfs when local missing but cid provided", async () => {
    const result = await resolvePlaybackSource({
      videoPath: "/tmp/video.mp4",
      rootCid: "ipfs://QmRemote",
      gatewayConfig,
      checkFileExists: makeCheck(false),
    });

    expect(result).toEqual({
      type: "ipfs",
      uri: "https://custom.gateway/ipfs/QmRemote",
      gatewayBase: "https://custom.gateway/ipfs/",
      cid: "QmRemote",
      isEncrypted: false,
      litEncryptionMetadata: null,
    });
  });

  it("returns unavailable when neither local nor cid", async () => {
    const result = await resolvePlaybackSource({
      videoPath: "/tmp/missing.mp4",
      rootCid: null,
      gatewayConfig,
      checkFileExists: makeCheck(false),
    });

    expect(result).toEqual({
      type: "unavailable",
      reason: "missing-file-and-cid",
    });
  });
});

