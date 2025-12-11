import { loadGatewayConfig, saveGatewayConfig, fileExistsViaIpc } from "@/services/playbackConfig";
import { DEFAULT_IPFS_GATEWAY } from "@/services/playbackResolver";
import type { IpfsGatewayConfig } from "@/types/playback";

const mockInvoke = jest.fn();

jest.mock("electron", () => ({
  ipcRenderer: { invoke: mockInvoke },
}), { virtual: true });

const mockGatewayGet = jest.fn();
const mockGatewayUpdate = jest.fn();

jest.mock("@/services/api", () => ({
  gatewayService: {
    get: mockGatewayGet,
    update: mockGatewayUpdate,
  },
}));

describe("playbackConfig service", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockGatewayGet.mockReset();
    mockGatewayUpdate.mockReset();
  });

  it("loads gateway config preferring backend value when available", async () => {
    mockInvoke.mockResolvedValue({ baseUrl: "https://ipc.gateway" });
    mockGatewayGet.mockResolvedValue({ baseUrl: "https://backend.gateway" });

    const config = await loadGatewayConfig();

    expect(config.baseUrl).toBe("https://backend.gateway/ipfs/");
    expect(mockInvoke).toHaveBeenCalledWith("playback:get-gateway-config");
    expect(mockGatewayGet).toHaveBeenCalled();
  });

  it("falls back to default when IPC and backend fail", async () => {
    mockInvoke.mockRejectedValue(new Error("ipc failure"));
    mockGatewayGet.mockRejectedValue(new Error("backend failure"));

    const config = await loadGatewayConfig();

    expect(config.baseUrl).toBe(DEFAULT_IPFS_GATEWAY);
  });

  it("saves gateway config via IPC then backend", async () => {
    mockInvoke.mockResolvedValue({ baseUrl: "https://ipc-saved" });
    mockGatewayUpdate.mockResolvedValue({ baseUrl: "https://backend.gateway/ipfs/" });

    const payload: IpfsGatewayConfig = { baseUrl: "https://custom.gateway" };
    const result = await saveGatewayConfig(payload);

    expect(mockInvoke).toHaveBeenCalledWith("playback:set-gateway-config", {
      baseUrl: "https://custom.gateway/ipfs/",
    });
    expect(mockGatewayUpdate).toHaveBeenCalledWith({
      baseUrl: "https://custom.gateway/ipfs/",
    });
    expect(result.baseUrl).toBe("https://backend.gateway/ipfs/");
  });

  it("returns IPC file existence checks", async () => {
    mockInvoke.mockResolvedValueOnce(true);
    const exists = await fileExistsViaIpc("/tmp/test.mp4");
    expect(exists).toBe(true);
  });

  it("returns false when IPC check fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("fail"));
    const exists = await fileExistsViaIpc("/tmp/test.mp4");
    expect(exists).toBe(false);
  });
});

