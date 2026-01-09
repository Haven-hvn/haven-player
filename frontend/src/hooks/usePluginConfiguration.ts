import { useState, useCallback, useEffect } from 'react';
import { PluginConfigSchema, WebRTCPluginConfig, PluginConfig, YouTubePluginConfig, BitTorrentPluginConfig } from '@/types/plugin';
import { pluginService } from '@/services/api';

const defaultWebRTCConfig: WebRTCPluginConfig = {
  livekit_url: 'wss://pump-prod-tg2x8veh.livekit.cloud',
  output_format: 'webm',
  video_quality: 'best',
  discover_limit: 20,
};

export function usePluginConfiguration(pluginName: string) {
  const [configSchema, setConfigSchema] = useState<PluginConfigSchema | null>(null);
  const [config, setConfig] = useState<PluginConfig | Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const getConfigWithDefaults = (currentConfig: Record<string, any>): PluginConfig => {
    if (pluginName.toLowerCase().includes('webrtc')) {
      return { ...defaultWebRTCConfig, ...currentConfig } as WebRTCPluginConfig;
    }
    return currentConfig as PluginConfig;
  };

  // Load plugin configuration schema
  const loadConfigSchema = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const currentConfigResult = await pluginService.getConfig(pluginName);
      const configWithDefaults = getConfigWithDefaults(currentConfigResult || {});
      setConfig(configWithDefaults);

      setConfigSchema({
        plugin_name: pluginName,
        display_name: pluginName,
        description: `Configuration for ${pluginName}`,
        version: '1.0.0',
        config_schema: buildConfigSchema(configWithDefaults),
        current_config: configWithDefaults,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load config';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [pluginName]);

  // Helper function to build config schema from current config
  const buildConfigSchema = (currentConfig: PluginConfig | Record<string, any> | null) => {
    const schema: any[] = [];
    
    if (!currentConfig) {
      return schema;
    }
    
    for (const [key, value] of Object.entries(currentConfig)) {
      // Infer field type based on value
      let type = 'text';
      if (typeof value === 'boolean') {
        type = 'boolean';
      } else if (typeof value === 'number') {
        type = 'number';
      } else if (Array.isArray(value)) {
        type = 'select';
      } else if (typeof value === 'string' && value.startsWith('http')) {
        type = 'url';
      } else if (key.includes('channel') && typeof value === 'string') {
        type = 'channel-url';
      }
      
      schema.push({
        name: key,
        type: type as any,
        label: formatLabel(key),
        description: `Configuration for ${formatLabel(key)}`,
        default: value,
        required: false,
      });
    }
    
    return schema;
  };

  // Format key to readable label
  const formatLabel = (key: string) => {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Update configuration value
  const updateConfigValue = useCallback((field_name: string, value: any) => {
    setConfig((prev: PluginConfig | Record<string, any>) => ({ ...prev, [field_name]: value }));
  }, []);

  const handleConfigChange = useCallback((newConfig: YouTubePluginConfig | BitTorrentPluginConfig | Record<string, any>) => {
    setConfig(newConfig);
  }, []);

  // Save configuration
  const saveConfig = useCallback(async () => {
    setSaving(true);
    setError(null);
    
    try {
      await pluginService.updateConfig(pluginName, config as PluginConfig);
      setSaving(false);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save config';
      setError(errorMessage);
      setSaving(false);
      return { success: false, error: errorMessage };
    }
  }, [pluginName, config]);

  // Reset to defaults
  const resetToDefaults = useCallback(async () => {
    setLoading(true);
    try {
      // In a real scenario, this might delete the config file on the backend
      // and then reload the default. For this hook, we'll just reset to the
      // initial default state.
      const defaultConfig = getConfigWithDefaults({});
      setConfig(defaultConfig);
      await pluginService.updateConfig(pluginName, defaultConfig);

      setConfigSchema((prevSchema: PluginConfigSchema | null) => prevSchema ? {
        ...prevSchema,
        current_config: defaultConfig,
        config_schema: buildConfigSchema(defaultConfig),
      } : null);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset config';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [pluginName]);

  return {
    configSchema,
    config,
    loading,
    error,
    saving,
    loadConfigSchema,
    updateConfigValue,
    saveConfig,
    resetToDefaults,
    handleConfigChange,
  };
}
