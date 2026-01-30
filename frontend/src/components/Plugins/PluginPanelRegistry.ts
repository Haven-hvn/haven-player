import React from 'react';
import { PluginCapability } from '@/types/plugin';

/**
 * Props passed to all plugin panel components
 */
export interface PluginPanelProps {
  pluginName: string;
  capabilities: PluginCapability[];
  onClose?: () => void;
}

/**
 * Registry entry for a plugin panel
 */
interface PanelRegistryEntry {
  component: React.ComponentType<PluginPanelProps>;
  priority: number;
}

/**
 * Plugin Panel Registry
 * 
 * Allows plugins to register custom UI components for the detail panel.
 * Plugins can register components that will be rendered instead of the
 * generic PluginSourcesPanel when viewing plugin sources.
 * 
 * Example usage:
 * ```typescript
 * // In a plugin's UI module
 * import { pluginPanelRegistry } from './PluginPanelRegistry';
 * import { MyCustomPluginPanel } from './MyCustomPluginPanel';
 * 
 * pluginPanelRegistry.register('MyPlugin', MyCustomPluginPanel);
 * ```
 */
class PluginPanelRegistry {
  private panels = new Map<string, PanelRegistryEntry>();

  /**
   * Register a custom panel component for a plugin
   * @param pluginName - The name of the plugin (e.g., 'PumpFunPlugin')
   * @param component - The React component to render
   * @param priority - Optional priority (higher = checked first)
   */
  register(
    pluginName: string,
    component: React.ComponentType<PluginPanelProps>,
    priority = 0
  ): void {
    this.panels.set(pluginName, { component, priority });
  }

  /**
   * Unregister a plugin's custom panel
   * @param pluginName - The name of the plugin
   */
  unregister(pluginName: string): void {
    this.panels.delete(pluginName);
  }

  /**
   * Get the custom panel component for a plugin
   * @param pluginName - The name of the plugin
   * @returns The registered component or undefined
   */
  get(pluginName: string): React.ComponentType<PluginPanelProps> | undefined {
    const entry = this.panels.get(pluginName);
    return entry?.component;
  }

  /**
   * Check if a plugin has a custom panel registered
   * @param pluginName - The name of the plugin
   * @returns true if a custom panel is registered
   */
  has(pluginName: string): boolean {
    return this.panels.has(pluginName);
  }

  /**
   * Get all registered plugin names
   * @returns Array of registered plugin names
   */
  getRegisteredPlugins(): string[] {
    return Array.from(this.panels.keys());
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.panels.clear();
  }
}

// Export singleton instance
export const pluginPanelRegistry = new PluginPanelRegistry();

// Export the class for testing
export { PluginPanelRegistry };
