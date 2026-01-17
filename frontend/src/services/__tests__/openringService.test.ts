import { openringService, pluginService } from "@/services/api";
import type { MediaSource } from "@/types/plugin";

describe("openringService.discoverDevices", () => {
  const device: MediaSource = {
    plugin: "OpenRingPlugin",
    source_id: "123",
    media_type: "webrtc",
    uri: "webrtc://ring/123",
    metadata: { device_name: "Front Door", is_online: true, kind: "doorbell" },
    priority: "medium",
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns raw arrays directly", async () => {
    const executeOperation = jest
      .spyOn(pluginService, "executeOperation")
      .mockResolvedValueOnce([device]);

    const result = await openringService.discoverDevices(true);

    expect(result).toEqual([device]);
    expect(executeOperation).toHaveBeenCalledWith("OpenRingPlugin", "discover_sources", {
      filter_options: { include_offline: true },
    });
  });

  it("unwraps sources from response wrapper", async () => {
    jest
      .spyOn(pluginService, "executeOperation")
      .mockResolvedValueOnce({ sources: [device], count: 1 });

    const result = await openringService.discoverDevices(false);

    expect(result).toEqual([device]);
  });

  it("throws when response format is unexpected", async () => {
    jest
      .spyOn(pluginService, "executeOperation")
      .mockResolvedValueOnce({ message: "unexpected" });

    await expect(openringService.discoverDevices()).rejects.toThrow(
      "Unexpected OpenRing discover_sources response"
    );
  });
});
