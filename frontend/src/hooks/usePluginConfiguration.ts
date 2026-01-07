import { useState, useCallback } from 'react';
import { PluginConfigSchema } from '@/types/plugin';
import { pluginService } from '@/services/api';

export function usePluginConfiguration(pluginName: string) {
  const [configSchema, setConfigSchema] = useState<PluginConfigSchema | null>(null);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load plugin configuration schema
  const loadConfigSchema = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get current config
      const currentConfigResult = await pluginService.getConfig(pluginName);

      if (currentConfigResult) {
        setConfig(currentConfigResult);
      }

      // Build config schema from the config
      // This is a simplified approach - in a real implementation, the backend
      // would provide a schema definition
      setConfigSchema({
        plugin_name: pluginName,
        display_name: pluginName,
        description: `Configuration for ${pluginName}`,
        version: '1.0.0',
        config_schema: buildConfigSchema(currentConfigResult),
        current_config: currentConfigResult,
      });

      setLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load config';
      setError(errorMessage);
      setLoading(false);
    }
  }, [pluginName, config]);

  // Helper function to build config schema from current config
  const buildConfigSchema = (currentConfig: Record<string, any>) => {
    const schema: any[] = [];
    
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
    setConfig((prev: Record<string, any>) => ({ ...prev, [field_name]: value }));
  }, []);

  // Save configuration
  const saveConfig = useCallback(async () => {
    setSaving(true);
    setError(null);
    
    try {
      await pluginService.updateConfig(pluginName, config);
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
      // Reload current config
      const currentConfigResult = await pluginService.getConfig(pluginName);
      
      if (currentConfigResult) {
        setConfig(currentConfigResult);
        
        setConfigSchema({
          plugin_name: pluginName,
          display_name: pluginName,
          description: `Configuration for ${pluginName}`,
          version: '1.0.0',
          config_schema: buildConfigSchema(currentConfigResult),
          current_config: currentConfigResult,
        });
      }

      setLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset config';
      setError(errorMessage);
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
  };
}