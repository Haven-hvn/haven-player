import { useState, useEffect, useCallback, useRef } from 'react';
import { PluginCapability } from '@/types/plugin';
import { pluginService } from '@/services/api';

/**
 * Hook for managing plugin operations (subscriptions, sources, etc.)
 * 
 * This is a generic hook that works with any plugin that declares
 * operation capabilities like 'subscribe', 'list_subscriptions', etc.
 */
export function usePluginOperations(
  pluginName: string,
  capabilities?: PluginCapability[]
) {
  const [sources, setSources] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Extract available operations from capabilities
  const availableOperations = capabilities?.flatMap(
    (cap) => cap.operations || []
  ) || [];

  const hasSubscribeCapability = availableOperations.includes('subscribe');
  const hasListSubscriptionsCapability = availableOperations.includes('list_subscriptions');
  const hasListSourcesCapability = availableOperations.includes('list_sources') || 
    availableOperations.includes('discover_sources');

  /**
   * Fetch available sources from the plugin
   */
  const fetchSources = useCallback(async () => {
    if (!hasListSourcesCapability) return;
    
    try {
      const operation = availableOperations.includes('discover_sources') 
        ? 'discover_sources' 
        : 'list_sources';
      
      const result = await pluginService.executeOperation(pluginName, operation, {});
      
      // Handle different response formats
      if (Array.isArray(result)) {
        setSources(result);
      } else if (result?.sources && Array.isArray(result.sources)) {
        setSources(result.sources);
      } else if (result?.streams && Array.isArray(result.streams)) {
        // PumpFun-specific format
        setSources(result.streams);
      } else {
        setSources([]);
      }
    } catch (err) {
      console.error('Failed to fetch sources:', err);
      // Don't set error for sources - they're optional
    }
  }, [pluginName, availableOperations, hasListSourcesCapability]);

  /**
   * Fetch current subscriptions
   */
  const fetchSubscriptions = useCallback(async () => {
    if (!hasListSubscriptionsCapability) return;
    
    try {
      const result = await pluginService.executeOperation(
        pluginName,
        'list_subscriptions',
        {}
      );
      
      // Handle different response formats
      if (Array.isArray(result)) {
        setSubscriptions(result);
      } else if (result?.subscriptions && Array.isArray(result.subscriptions)) {
        setSubscriptions(result.subscriptions);
      } else {
        setSubscriptions([]);
      }
    } catch (err) {
      console.error('Failed to fetch subscriptions:', err);
      setSubscriptions([]);
    }
  }, [pluginName, hasListSubscriptionsCapability]);

  /**
   * Refresh all data
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchSources(),
        fetchSubscriptions(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      setLoading(false);
    }
  }, [fetchSources, fetchSubscriptions]);

  /**
   * Subscribe to an item
   */
  const subscribe = useCallback(async (item: any, priority?: number) => {
    if (!hasSubscribeCapability) {
      return { success: false, error: 'Plugin does not support subscribe operation' };
    }

    try {
      const idField = item.stream_id ? 'collection_uri' : 'collection_uri';
      const configField = item.stream_id 
        ? {
            stream_id: item.stream_id,
            stream_name: item.name || item.stream_name || item.stream_id,
            priority: priority || 5,
          }
        : {
            device_id: item.device_id,
            device_name: item.device_name || item.device_id,
          };

      await pluginService.executeOperation(pluginName, 'subscribe', {
        [idField]: item.stream_id || item.device_id || item.uri,
        config: configField,
      });

      // Refresh subscriptions after subscribing
      await fetchSubscriptions();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to subscribe';
      return { success: false, error: message };
    }
  }, [pluginName, hasSubscribeCapability, fetchSubscriptions]);

  /**
   * Unsubscribe from an item
   */
  const unsubscribe = useCallback(async (item: any) => {
    try {
      const id = item.stream_id || item.device_id || item.source_id;
      await pluginService.executeOperation(pluginName, 'unsubscribe', {
        collection_id: id,
      });

      // Refresh subscriptions after unsubscribing
      await fetchSubscriptions();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unsubscribe';
      return { success: false, error: message };
    }
  }, [pluginName, fetchSubscriptions]);

  /**
   * Execute a generic plugin operation
   */
  const executeOperation = useCallback(async (
    operation: string,
    params: Record<string, any>
  ) => {
    try {
      const result = await pluginService.executeOperation(
        pluginName,
        operation,
        params
      );
      
      // Refresh data after state-changing operations
      if (['subscribe', 'unsubscribe', 'enable', 'disable'].includes(operation)) {
        await fetchSubscriptions();
      }
      
      return { success: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to execute ${operation}`;
      return { success: false, error: message };
    }
  }, [pluginName, fetchSubscriptions]);

  // Initial fetch
  useEffect(() => {
    if (pluginName && capabilities) {
      refresh();
    }
  }, [pluginName, capabilities, refresh]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  return {
    sources,
    subscriptions,
    loading,
    error,
    refresh,
    subscribe,
    unsubscribe,
    executeOperation,
    availableOperations,
  };
}
