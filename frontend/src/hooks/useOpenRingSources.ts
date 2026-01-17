import { useState, useCallback, useEffect } from "react";
import { MediaSource } from "@/types/plugin";
import { openringService } from "@/services/api";

interface UseOpenRingSourcesOptions {
  pluginName?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export default function useOpenRingSources({
  pluginName = "OpenRingPlugin",
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
}: UseOpenRingSourcesOptions = {}) {
  const [devices, setDevices] = useState<MediaSource[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]); // Use appropriate type if available
  const [loading, setLoading] = useState<{ devices: boolean; subscriptions: boolean }>({
    devices: false,
    subscriptions: false,
  });
  const [error, setError] = useState<{ devices: string | null; subscriptions: string | null }>({
    devices: null,
    subscriptions: null,
  });

  const loadDevices = useCallback(async () => {
    setLoading((prev) => ({ ...prev, devices: true }));
    setError((prev) => ({ ...prev, devices: null }));
    try {
      const result = await openringService.discoverDevices(true); // Include offline devices
      setDevices(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load devices";
      setError((prev) => ({ ...prev, devices: errorMessage }));
      console.error("Error loading devices:", err);
      setDevices([]);
    } finally {
      setLoading((prev) => ({ ...prev, devices: false }));
    }
  }, []);

  const loadSubscriptions = useCallback(async () => {
    setLoading((prev) => ({ ...prev, subscriptions: true }));
    setError((prev) => ({ ...prev, subscriptions: null }));
    try {
      const result = await openringService.listSubscriptions();
      setSubscriptions(Array.isArray(result) ? result : []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load subscriptions";
      setError((prev) => ({ ...prev, subscriptions: errorMessage }));
      console.error("Error loading subscriptions:", err);
      setSubscriptions([]);
    } finally {
      setLoading((prev) => ({ ...prev, subscriptions: false }));
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadDevices(), loadSubscriptions()]);
  }, [loadDevices, loadSubscriptions]);

  const subscribe = useCallback(
    async (device: MediaSource) => {
      try {
        const deviceName = device.metadata.device_name || device.source_id;
        await openringService.subscribe(device.source_id, deviceName);
        await loadSubscriptions();
      } catch (error) {
        console.error("Error subscribing to device:", error);
        throw error;
      }
    },
    [loadSubscriptions]
  );

  const unsubscribe = useCallback(
    async (device: MediaSource) => {
      try {
        await openringService.unsubscribe(device.source_id);
        await loadSubscriptions();
      } catch (error) {
        console.error("Error unsubscribing from device:", error);
        throw error;
      }
    },
    [loadSubscriptions]
  );

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    refresh();

    const intervalId = setInterval(refresh, refreshInterval);
    return () => clearInterval(intervalId);
  }, [autoRefresh, refresh, refreshInterval]);

  // Manual refresh on mount
  useEffect(() => {
    if (devices.length === 0 && subscriptions.length === 0) {
      refresh();
    }
  }, [devices.length, subscriptions.length, refresh]);

  return {
    devices,
    subscriptions,
    loading: loading.devices || loading.subscriptions,
    loadingDevices: loading.devices,
    loadingSubscriptions: loading.subscriptions,
    error: error.devices || error.subscriptions,
    refresh,
    subscribe,
    unsubscribe,
  };
}
