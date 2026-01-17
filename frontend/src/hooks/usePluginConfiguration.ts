import { useState, useCallback, useEffect } from 'react';
import { PluginConfigSchema, PumpFunPluginConfig, PluginConfig, YouTubePluginConfig, BitTorrentPluginConfig, OpenRingPluginConfig } from '@/types/plugin';
import { pluginService } from '@/services/api';

const defaultPumpFunConfig: PumpFunPluginConfig = {
  livekit_url: 'wss://pump-prod-tg2x8veh.livekit.cloud',
  output_format: 'webm',
  video_quality: 'best',
  discover_limit: 20,
};

const defaultYouTubeConfig: YouTubePluginConfig = {
  channels: [],
};

const defaultBitTorrentConfig: BitTorrentPluginConfig = {
  subscriptions: [],
  glitter_endpoint: 'https://gw.magnode.ru/v1/sql/query',
};

const defaultOpenRingConfig: OpenRingPluginConfig = {
  segment_duration: 30,
  auto_recording_enabled: true,
  refresh_buffer_seconds: 60,
  devices: [],
};

export function usePluginConfiguration(pluginName: string) {
  const [configSchema, setConfigSchema] = useState<PluginConfigSchema | null>(null);
  const [config, setConfig] = useState<PluginConfig | Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const getConfigWithDefaults = (currentConfig: Record<string, any>): PluginConfig => {
    // Extract the actual config object from the response
    // The backend returns { name, enabled, config, priority, ... } where 'config' is the actual plugin config
    const actualConfig = currentConfig.config || currentConfig;

    if (pluginName.toLowerCase().includes('pumpfun')) {
      return { ...defaultPumpFunConfig, ...actualConfig } as PumpFunPluginConfig;
    }

    if (pluginName.toLowerCase().includes('youtube')) {
      return { ...defaultYouTubeConfig, ...actualConfig } as YouTubePluginConfig;
    }

    if (pluginName.toLowerCase().includes('bittorrent')) {
      return { ...defaultBitTorrentConfig, ...actualConfig } as BitTorrentPluginConfig;
    }

    if (pluginName.toLowerCase().includes('openring')) {
      // Filter out sensitive token fields if they exist in the config
      const { access_token, refresh_token, ...safeConfig } = actualConfig;
      return { ...defaultOpenRingConfig, ...safeConfig } as OpenRingPluginConfig;
    }

    return actualConfig as PluginConfig;
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

    // Fields to skip as they are metadata, not actual config
    const skipFields = ['name', 'enabled', 'priority', 'created_at', 'updated_at', 'is_default'];

    if (!currentConfig) {
      return schema;
    }

    for (const [key, value] of Object.entries(currentConfig)) {
      // Skip metadata fields
      if (skipFields.includes(key)) {
        continue;
      }

      // Infer field type based on value
      let type = 'text';
      if (typeof value === 'boolean') {
        type = 'boolean';
      } else if (typeof value === 'number') {
        type = 'number';
      } else if (Array.isArray(value)) {
        // Skip arrays (like channels/subscriptions) as they're handled by custom components
        continue;
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
