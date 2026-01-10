/**
 * Service for controlling the backend UploadCoordinator configuration.
 *
 * This service allows the frontend to enable/disable auto-upload
 * for plugin downloads by updating the backend configuration.
 */

import type { UploadCoordinatorConfig } from '@/types/plugin';

export class UploadCoordinatorConfigService {
  /**
   * Get the current backend upload coordinator configuration.
   *
   * @returns Promise with configuration
   */
  async getConfig(): Promise<UploadCoordinatorConfig> {
    try {
      const response = await fetch('http://localhost:8000/api/upload-coordinator/config');
      if (!response.ok) {
        throw new Error(`Failed to get upload coordinator config: ${response.status}`);
      }
      return await response.json() as UploadCoordinatorConfig;
    } catch (error) {
      console.error('[UploadCoordinatorConfigService] Failed to get config:', error);
      throw error;
    }
  }

  /**
   * Update the backend upload coordinator configuration.
   *
   * @param config - Configuration to update
   * @returns Promise with updated configuration
   */
  async updateConfig(config: Partial<UploadCoordinatorConfig>): Promise<UploadCoordinatorConfig> {
    try {
      const response = await fetch('http://localhost:8000/api/upload-coordinator/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update upload coordinator config: ${response.status} - ${errorText}`);
      }

      return await response.json() as UploadCoordinatorConfig;
    } catch (error) {
      console.error('[UploadCoordinatorConfigService] Failed to update config:', error);
      throw error;
    }
  }

  /**
   * Enable auto-upload for plugin downloads.
   *
   * @returns Promise with updated configuration
   */
  async enable(): Promise<UploadCoordinatorConfig> {
    return this.updateConfig({ enabled: true });
  }

  /**
   * Disable auto-upload for plugin downloads.
   *
   * @returns Promise with updated configuration
   */
  async disable(): Promise<UploadCoordinatorConfig> {
    return this.updateConfig({ enabled: false });
  }
}

// Singleton instance
export const uploadCoordinatorConfigService = new UploadCoordinatorConfigService();
