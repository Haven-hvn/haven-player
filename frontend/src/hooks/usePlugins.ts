import { useState, useEffect, useCallback, useRef } from 'react';
import { PluginMetadata, PluginHealth, PluginConfig, DiscoverResponse, PluginCapability } from '@/types/plugin';
import { pluginService } from '@/services/api';
import { useBackgroundThrottling } from './useBackgroundThrottling';

// Re-export usePluginOperations from its own file
export { usePluginOperations } from './usePluginOperations';

const { ipcRenderer } = require('electron');

// Exponential backoff configuration for backend availability retries
const RETRY_CONFIG = {
  initialDelay: 2000,      // Start with 2 seconds
  maxDelay: 30000,         // Cap at 30 seconds
  multiplier: 2,           // Double the delay each time
  maxRetries: 10,          // Give up after 10 attempts (prevents infinite loops)
};

export function usePlugins(backendConnected?: boolean) {
  const [plugins, setPlugins] = useState<PluginMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveredPlugins, setDiscoveredPlugins] = useState<string[]>([]);
  
  // Track if we've attempted a load while backend was offline
  const attemptedLoadRef = useRef(false);
  // Track previous backend connection state
  const prevBackendConnectedRef = useRef(backendConnected);
  
  // Exponential backoff refs
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const currentDelayRef = useRef(RETRY_CONFIG.initialDelay);

  const refreshPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await pluginService.getAll();
      setPlugins(data);
      attemptedLoadRef.current = false;
      retryCountRef.current = 0; // Reset retry count on success
      currentDelayRef.current = RETRY_CONFIG.initialDelay; // Reset delay on success
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch plugins');
      console.error('Failed to fetch plugins:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Smart retry with exponential backoff
  const scheduleRetry = useCallback(() => {
    // Clear any existing retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Don't retry if we've exceeded max retries or plugins are loaded
    if (retryCountRef.current >= RETRY_CONFIG.maxRetries || plugins.length > 0) {
      return;
    }

    const delay = Math.min(currentDelayRef.current, RETRY_CONFIG.maxDelay);
    
    console.log(`[usePlugins] Backend not available, retrying in ${delay}ms (attempt ${retryCountRef.current + 1}/${RETRY_CONFIG.maxRetries})`);
    
    retryTimeoutRef.current = setTimeout(() => {
      retryCountRef.current++;
      currentDelayRef.current *= RETRY_CONFIG.multiplier;
      refreshPlugins();
    }, delay);
  }, [plugins.length, refreshPlugins]);

  // Listen for backend-ready IPC event from main process
  useEffect(() => {
    const handleBackendReady = () => {
      console.log('[usePlugins] Backend ready event received, refreshing plugins...');
      retryCountRef.current = 0;
      currentDelayRef.current = RETRY_CONFIG.initialDelay;
      refreshPlugins();
    };

    ipcRenderer.on('backend-ready', handleBackendReady);

    return () => {
      ipcRenderer.removeListener('backend-ready', handleBackendReady);
    };
  }, [refreshPlugins]);

  const discoverPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response: DiscoverResponse = await pluginService.discover();
      if (response.success) {
        setDiscoveredPlugins(response.discovered);
        await refreshPlugins();
      }
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to discover plugins';
      setError(errorMessage);
      console.error('Failed to discover plugins:', err);
      return { success: false, discovered: [], message: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [refreshPlugins]);

  const loadPlugin = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const plugin = await pluginService.load(name);
      // Optimistically update the plugin state with the returned data
      setPlugins((prev) => prev.map((p) => (p.name === name ? plugin : p)));
      // Also refresh all plugins to ensure consistency
      await refreshPlugins();
      return { success: true, plugin };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load plugin';
      setError(errorMessage);
      console.error('Failed to load plugin:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [refreshPlugins]);

  const unloadPlugin = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const plugin = await pluginService.unload(name);
      // Optimistically update the plugin state with the returned data
      setPlugins((prev) => prev.map((p) => (p.name === name ? plugin : p)));
      // Also refresh all plugins to ensure consistency
      await refreshPlugins();
      return { success: true, plugin };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to unload plugin';
      setError(errorMessage);
      console.error('Failed to unload plugin:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [refreshPlugins]);

  const restartPlugin = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const plugin = await pluginService.restart(name);
      // Optimistically update the plugin state with the returned data
      setPlugins((prev) => prev.map((p) => (p.name === name ? plugin : p)));
      // Also refresh all plugins to ensure consistency
      await refreshPlugins();
      return { success: true, plugin };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to restart plugin';
      setError(errorMessage);
      console.error('Failed to restart plugin:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [refreshPlugins]);

  // Load plugins on mount
  useEffect(() => {
    refreshPlugins();
  }, [refreshPlugins]);

  // Refresh plugins when backend comes online
  useEffect(() => {
    // If backend just came online (was offline, now connected)
    const wasOffline = prevBackendConnectedRef.current === false;
    const isNowOnline = backendConnected === true;
    
    if (wasOffline && isNowOnline) {
      console.log('🔄 Backend came online, refreshing plugins...');
      refreshPlugins();
    }
    
    // Update the ref for next comparison
    prevBackendConnectedRef.current = backendConnected;
  }, [backendConnected, refreshPlugins]);

  // Schedule retry when backend is unavailable and we have no plugins
  useEffect(() => {
    if (error && !loading && plugins.length === 0) {
      scheduleRetry();
    }

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [error, loading, plugins.length, scheduleRetry]);

  return {
    plugins,
    loading,
    error,
    discoveredPlugins,
    refreshPlugins,
    discoverPlugins,
    loadPlugin,
    unloadPlugin,
    restartPlugin,
  };
}

// Background polling interval (null = pause completely)
const BACKGROUND_HEALTH_INTERVAL: number | null = null;

export function usePluginHealth(refreshInterval: number = 30000) {
  const [healthStatus, setHealthStatus] = useState<PluginHealth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  
  // Background throttling
  const { shouldThrottle } = useBackgroundThrottling();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await pluginService.getHealth();
      setHealthStatus(status);
      setLastCheck(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check plugin health');
      console.error('Failed to check plugin health:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Determine interval based on throttle state
    const actualInterval = shouldThrottle ? BACKGROUND_HEALTH_INTERVAL : refreshInterval;

    // Initial check
    checkHealth();

    // If interval is null (background), don't poll
    if (actualInterval === null) {
      console.log('🔇 Plugin health polling paused (app in background)');
      return;
    }

    console.log(`🔄 Plugin health polling active (interval: ${actualInterval}ms)`);
    intervalRef.current = setInterval(checkHealth, actualInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkHealth, refreshInterval, shouldThrottle]);

  return {
    healthStatus,
    loading: loading && healthStatus.length === 0,
    error,
    lastCheck,
    checkHealth,
  };
}

export function usePluginSources(pluginName?: string) {
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = pluginName 
        ? await pluginService.getPluginSources(pluginName)
        : await pluginService.getAllSources();
      setSources(response.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sources');
      console.error('Failed to fetch sources:', err);
    } finally {
      setLoading(false);
    }
  }, [pluginName]);

  useEffect(() => {
    refreshSources();
  }, [refreshSources]);

  return {
    sources,
    loading,
    error,
    refreshSources,
  };
}

export function usePluginConfig(pluginName: string) {
  const [config, setConfig] = useState<PluginConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const configData = await pluginService.getConfig(pluginName);
      setConfig(configData);
      return configData;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch plugin config');
      console.error('Failed to fetch plugin config:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [pluginName]);

  const updateConfig = useCallback(async (newConfig: PluginConfig) => {
    setLoading(true);
    setError(null);
    try {
      const updatedConfig = await pluginService.updateConfig(pluginName, newConfig);
      setConfig(updatedConfig);
      return { success: true, config: updatedConfig };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update plugin config';
      setError(errorMessage);
      console.error('Failed to update plugin config:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [pluginName]);

  const deleteConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await pluginService.deleteConfig(pluginName);
      setConfig(null);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete plugin config';
      setError(errorMessage);
      console.error('Failed to delete plugin config:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [pluginName]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return {
    config,
    loading,
    error,
    loadConfig,
    updateConfig,
    deleteConfig,
  };
}


