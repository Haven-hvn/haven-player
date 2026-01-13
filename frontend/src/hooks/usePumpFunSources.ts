import { useState, useCallback, useEffect } from "react";
import { PumpFunStream, PumpFunSubscription } from "@/types/plugin";
import { pumpfunService } from "@/services/api";

interface UsePumpFunSourcesOptions {
  pluginName?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

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

  const loadStreams = useCallback(async () => {
    setLoading((prev) => ({ ...prev, streams: true }));
    setError((prev) => ({ ...prev, streams: null }));
    try {
      const result = await pumpfunService.getStreams();
      setStreams(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load streams";
      setError((prev) => ({ ...prev, streams: errorMessage }));
      console.error("Error loading streams:", err);
    } finally {
      setLoading((prev) => ({ ...prev, streams: false }));
    }
  }, []);

  const loadSubscriptions = useCallback(async () => {
    setLoading((prev) => ({ ...prev, subscriptions: true }));
    setError((prev) => ({ ...prev, subscriptions: null }));
    try {
      const result = await pumpfunService.getSubscriptions();
      setSubscriptions(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load subscriptions";
      setError((prev) => ({ ...prev, subscriptions: errorMessage }));
      console.error("Error loading subscriptions:", err);
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

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    refresh();

    const intervalId = setInterval(refresh, refreshInterval);
    return () => clearInterval(intervalId);
  }, [autoRefresh, refresh, refreshInterval]);

  // Manual refresh on mount
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