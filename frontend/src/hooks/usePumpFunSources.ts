import { useState, useCallback, useEffect, useRef } from "react";
import { PumpFunStream, PumpFunSubscription } from "@/types/plugin";
import { pumpfunService } from "@/services/api";
import { useBackgroundThrottling } from "./useBackgroundThrottling";

interface UsePumpFunSourcesOptions {
  pluginName?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

// Background polling interval (5 minutes) or null to pause completely
const BACKGROUND_REFRESH_INTERVAL: number | null = null;

export default function usePumpFunSources({
  pluginName = "PumpFunPlugin",
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
}: UsePumpFunSourcesOptions = {}) {
  const [streams, setStreams] = useState<PumpFunStream[]>([]);
  const [subscriptions, setSubscriptions] = useState<PumpFunSubscription[]>([]);
  const [loading, setLoading] = useState<{ streams: boolean; subscriptions: boolean }>({
    streams: false,
    subscriptions: false,
  });
  const [error, setError] = useState<{ streams: string | null; subscriptions: string | null }>({
    streams: null,
    subscriptions: null,
  });

  // Background throttling
  const { shouldThrottle } = useBackgroundThrottling();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadStreams = useCallback(async () => {
    setLoading((prev) => ({ ...prev, streams: true }));
    setError((prev) => ({ ...prev, streams: null }));
    try {
      const result = await pumpfunService.getStreams();
      // Ensure result is an array
      setStreams(Array.isArray(result) ? result : []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load streams";
      setError((prev) => ({ ...prev, streams: errorMessage }));
      console.error("Error loading streams:", err);
      setStreams([]); // Ensure streams is always an array on error
    } finally {
      setLoading((prev) => ({ ...prev, streams: false }));
    }
  }, []);

  const loadSubscriptions = useCallback(async () => {
    setLoading((prev) => ({ ...prev, subscriptions: true }));
    setError((prev) => ({ ...prev, subscriptions: null }));
    try {
      const result = await pumpfunService.getSubscriptions();
      // Ensure result is an array
      setSubscriptions(Array.isArray(result) ? result : []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load subscriptions";
      setError((prev) => ({ ...prev, subscriptions: errorMessage }));
      console.error("Error loading subscriptions:", err);
      setSubscriptions([]); // Ensure subscriptions is always an array on error
    } finally {
      setLoading((prev) => ({ ...prev, subscriptions: false }));
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadStreams(), loadSubscriptions()]);
  }, [loadStreams, loadSubscriptions]);

  const subscribe = useCallback(
    async (stream: PumpFunStream) => {
      try {
        await pumpfunService.subscribe(stream.stream_id, {
          stream_name: stream.name,
          priority: 5,
        });
        await loadSubscriptions();
      } catch (error) {
        console.error("Error subscribing to stream:", error);
        throw error;
      }
    },
    [loadSubscriptions]
  );

  const unsubscribe = useCallback(
    async (stream: PumpFunStream) => {
      try {
        await pumpfunService.unsubscribe(stream.stream_id);
        await loadSubscriptions();
      } catch (error) {
        console.error("Error unsubscribing from stream:", error);
        throw error;
      }
    },
    [loadSubscriptions]
  );

  const updateSubscription = useCallback(
    async (subscription: PumpFunSubscription, updates: Partial<PumpFunSubscription>) => {
      if (updates.enabled !== undefined) {
        try {
          if (updates.enabled) {
            await pumpfunService.enableSubscription(subscription.stream_id);
          } else {
            await pumpfunService.disableSubscription(subscription.stream_id);
          }
        } catch (error) {
          console.error(`Error ${updates.enabled ? "enabling" : "disabling"} subscription:`, error);
          throw error;
        }
      }

      if (updates.priority !== undefined) {
        try {
          await pumpfunService.updateSubscription(subscription.stream_id, {
            priority: updates.priority,
          });
        } catch (error) {
          console.error("Error updating subscription:", error);
          throw error;
        }
      }

      await loadSubscriptions();
    },
    [loadSubscriptions]
  );

  // Background-aware auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Determine interval based on throttle state
    const actualInterval = shouldThrottle ? BACKGROUND_REFRESH_INTERVAL : refreshInterval;

    // If interval is null (background), don't poll
    if (actualInterval === null) {
      console.log('🔇 PumpFun sources polling paused (app in background)');
      return;
    }

    // Initial refresh
    refresh();

    console.log(`🔄 PumpFun sources polling active (interval: ${actualInterval}ms)`);
    intervalRef.current = setInterval(refresh, actualInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, refresh, refreshInterval, shouldThrottle]);

  // Manual refresh on mount if no data
  useEffect(() => {
    if (streams.length === 0 && subscriptions.length === 0) {
      refresh();
    }
  }, [streams.length, subscriptions.length, refresh]);

  return {
    streams,
    subscriptions,
    loading: loading.streams || loading.subscriptions,
    loadingStreams: loading.streams,
    loadingSubscriptions: loading.subscriptions,
    error: error.streams || error.subscriptions,
    errorStreams: error.streams,
    errorSubscriptions: error.subscriptions,
    refresh,
    refreshStreams: loadStreams,
    refreshSubscriptions: loadSubscriptions,
    subscribe,
    unsubscribe,
    updateSubscription,
  };
}
