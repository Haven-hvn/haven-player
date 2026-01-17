import { renderHook, waitFor } from "@testing-library/react";
import useOpenRingSources from "../useOpenRingSources";
import type { MediaSource, OpenRingDevice } from "@/types/plugin";

const mockDiscoverDevices = jest.fn<Promise<MediaSource[]>, [boolean]>();
const mockListSubscriptions = jest.fn<Promise<OpenRingDevice[]>, []>();

jest.mock("@/services/api", () => ({
  openringService: {
    discoverDevices: (...args: [boolean]) => mockDiscoverDevices(...args),
    listSubscriptions: () => mockListSubscriptions(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  },
}));

describe("useOpenRingSources", () => {
  const device: MediaSource = {
    plugin: "OpenRingPlugin",
    source_id: "123",
    media_type: "webrtc",
    uri: "webrtc://ring/123",
    metadata: { device_name: "Front Door", is_online: true, kind: "doorbell" },
    priority: "medium",
  };

  beforeEach(() => {
    mockDiscoverDevices.mockReset();
    mockListSubscriptions.mockReset();
  });

  it("loads devices and subscriptions", async () => {
    mockDiscoverDevices.mockResolvedValueOnce([device]);
    mockListSubscriptions.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useOpenRingSources({ autoRefresh: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.devices).toEqual([device]);
    expect(result.current.subscriptions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("sets error when discoverDevices fails", async () => {
    mockDiscoverDevices.mockRejectedValueOnce(
      new Error("Unexpected OpenRing discover_sources response")
    );
    mockListSubscriptions.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useOpenRingSources({ autoRefresh: false }));

    await waitFor(() => {
      expect(result.current.error).toBe("Unexpected OpenRing discover_sources response");
    });

    expect(result.current.devices).toEqual([]);
  });
});
