import { useState, useEffect, useCallback } from 'react';
import { PluginMetadata, PluginHealth, PluginConfig, DiscoverResponse } from '@/types/plugin';
import { pluginService } from '@/services/api';

export function usePlugins() {
  const [plugins, setPlugins] = useState<PluginMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveredPlugins, setDiscoveredPlugins] = useState<string[]>([]);

  const refreshPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await pluginService.getAll();
      setPlugins(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch plugins');
      console.error('Failed to fetch plugins:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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
      setPlugins((prev: PluginMetadata[]) => 
        prev.map((p: PluginMetadata) => p.name === name ? plugin : p)
      );
      return { success: true, plugin };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load plugin';
      setError(errorMessage);
      console.error('Failed to load plugin:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const unloadPlugin = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const plugin = await pluginService.unload(name);
      setPlugins((prev: PluginMetadata[]) => 
        prev.map((p: PluginMetadata) => p.name === name ? plugin : p)
      );
      return { success: true, plugin };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to unload plugin';
      setError(errorMessage);
      console.error('Failed to unload plugin:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const restartPlugin = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const plugin = await pluginService.restart(name);
      setPlugins((prev: PluginMetadata[]) => 
        prev.map((p: PluginMetadata) => p.name === name ? plugin : p)
      );
      return { success: true, plugin };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to restart plugin';
      setError(errorMessage);
      console.error('Failed to restart plugin:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  // Load plugins on mount
  useEffect(() => {
    refreshPlugins();
  }, [refreshPlugins]);

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

export function usePluginHealth(refreshInterval: number = 30000) {
  const [healthStatus, setHealthStatus] = useState<PluginHealth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

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
    checkHealth();
    const interval = setInterval(checkHealth, refreshInterval);
    return () => clearInterval(interval);
  }, [checkHealth, refreshInterval]);

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
