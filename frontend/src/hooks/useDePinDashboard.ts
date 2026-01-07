import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  DePinDashboardState, 
  DePinActiveOperation, 
  DePinTickResponse,
  PluginMetadata 
} from '@/types/plugin';
import { pluginService } from '@/services/api';

export function useDePinDashboard() {
  const [state, setState] = useState<DePinDashboardState>({
    is_active: false,
    points: 0,
    level: 1,
    streak: 0,
    active_operations: [],
    enabled_plugins: [],
    total_archived: 0,
    total_uploaded: 0,
    pending_uploads: 0,
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const tickIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const statusIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const isTickInProgressRef = useRef(false);

  // Load plugins and their status
  const loadPluginStatus = useCallback(async () => {
    try {
      const plugins = await pluginService.getAll();
      
      // Filter to plugins with 'archival' capability
      const archivalPlugins = plugins.filter((p: PluginMetadata) => 
        p.capabilities?.includes('archival')
      );
      
      // Get active status for each plugin
      const enabledPlugins = await Promise.all(
        archivalPlugins.map(async (plugin: PluginMetadata) => {
          try {
            // Get sources from this plugin
            const sources = await pluginService.getPluginSources(plugin.name);
            const activeSources = sources.sources.filter(s => 
              s.metadata?.status === 'running' || s.metadata?.status === 'archiving'
            );
            
            return {
              name: plugin.name,
              display_name: plugin.description || plugin.name,
              status: activeSources.length > 0 ? 'active' : 'idle',
              active_operations_count: activeSources.length,
            };
          } catch (err) {
            console.warn(`Failed to get status for ${plugin.name}:`, err);
            return {
              name: plugin.name,
              display_name: plugin.description || plugin.name,
              status: 'idle' as const,
              active_operations_count: 0,
            };
          }
        })
      );
      
      setState((prev: DePinDashboardState) => ({ ...prev, enabled_plugins: enabledPlugins }));
      return enabledPlugins;
    } catch (err) {
      console.error('Failed to load plugin status:', err);
      return [];
    }
  }, []);

  // Load active operations from all plugins
  const loadActiveOperations = useCallback(async () => {
    try {
      const plugins = await pluginService.getAll();
      const archivalPlugins = plugins.filter((p: PluginMetadata) => 
        p.capabilities?.includes('archival')
      );
      
      const allOperations: DePinActiveOperation[] = [];
      
      for (const plugin of archivalPlugins) {
        try {
          const sources = await pluginService.getPluginSources(plugin.name);
          
          // Convert sources to active operations
          for (const source of sources.sources) {
            if (source.metadata?.status === 'running' || source.metadata?.status === 'archiving') {
              // Map 'archiving' status to 'running' for compatibility
              const status = source.metadata?.status === 'archiving' ? 'running' : source.metadata?.status;
              allOperations.push({
                operation_id: `${plugin.name}-${source.source_id}`,
                plugin_name: plugin.name,
                plugin_display_name: plugin.description || plugin.name,
                operation_type: source.metadata?.operation_type || 'real-time',
                source_id: source.source_id,
                source_name: source.metadata?.name || source.source_id,
                source_uri: source.uri,
                status: (status as 'running' | 'paused' | 'completed' | 'failed' | 'pending') || 'running',
                progress: source.metadata?.progress || 0,
                start_time: new Date(source.metadata?.start_time || Date.now()),
                estimated_completion: source.metadata?.estimated_completion 
                  ? new Date(source.metadata.estimated_completion) 
                  : undefined,
                duration_seconds: source.metadata?.duration_seconds || 0,
                file_size_bytes: source.metadata?.file_size_bytes,
              });
            }
          }
        } catch (err) {
          console.warn(`Failed to load operations for ${plugin.name}:`, err);
        }
      }
      
      setState((prev: DePinDashboardState) => ({ ...prev, active_operations: allOperations }));
      return allOperations;
    } catch (err) {
      console.error('Failed to load active operations:', err);
      return [];
    }
  }, []);

  // Tick: Run the DePIN agent
  const runTick = useCallback(async () => {
    if (isTickInProgressRef.current) return;
    
    isTickInProgressRef.current = true;
    
    try {
      const response = await fetch('http://localhost:8000/api/depin/tick', {
        method: 'POST',
      });
      const tickData: DePinTickResponse = await response.json();
      
      if (tickData.success) {
        // Load updated active operations
        await loadActiveOperations();
        await loadPluginStatus();
        
        return {
          success: true,
          actions: tickData.actions,
          active_operation: tickData.active_operation,
        };
      } else {
        throw new Error(tickData.message);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Tick failed';
      setError(errorMessage);
      throw err;
    } finally {
      isTickInProgressRef.current = false;
    }
  }, [loadActiveOperations, loadPluginStatus]);

  // Toggle DePIN active state
  const toggleActive = useCallback(async (active: boolean) => {
    setState((prev: DePinDashboardState) => ({ ...prev, is_active: active }));
    
    if (active) {
      // Start tick loop
      runTick(); // Run immediately
      tickIntervalRef.current = setInterval(runTick, 60000); // Every minute
      
      // Start status updates (more frequent)
      await loadActiveOperations();
      statusIntervalRef.current = setInterval(loadActiveOperations, 5000);
    } else {
      // Stop tick loop
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = undefined;
      }
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = undefined;
      }
    }
  }, [runTick, loadActiveOperations]);

  // Stop a specific operation
  const stopOperation = useCallback(async (operationId: string) => {
    const [pluginName, sourceId] = operationId.split('-');
    
    try {
      // Stop the operation via plugin API
      if (pluginName === 'webrtc-archiver') {
        // WebRTC-specific stop
        await fetch('http://localhost:8000/api/recording/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mint_id: sourceId }),
        });
      } else {
        // For other plugins, archive is self-managing
        // Just mark as stopped in UI
      }
      
      // Reload operations
      await loadActiveOperations();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop';
      setError(errorMessage);
      throw err;
    }
  }, [loadActiveOperations]);

  // Pause/Resume a specific operation
  const toggleOperationPause = useCallback(async (operationId: string, paused: boolean) => {
    try {
      // For now, just reload operations - pause/resume functionality would need
      // to be implemented in the backend plugin API
      await loadActiveOperations();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle pause';
      setError(errorMessage);
      throw err;
    }
  }, [loadActiveOperations]);

  // Update metrics
  const updateMetrics = useCallback(async () => {
    try {
      // Load videos to get upload stats
      const response = await fetch('http://localhost:8000/api/videos');
      if (response.ok) {
        const videos = await response.json();
        const uploaded = videos.filter((v: any) => v.filecoin_root_cid).length;
        const pending = videos.filter((v: any) => !v.filecoin_root_cid).length;
        
        setState((prev: DePinDashboardState) => ({
          ...prev,
          total_uploaded: uploaded,
          pending_uploads: pending,
        }));
      }
    } catch (err) {
      console.error('Failed to update metrics:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPluginStatus();
    loadActiveOperations();
    updateMetrics();
  }, [loadPluginStatus, loadActiveOperations, updateMetrics]);

    return {
    state,
    loading,
    error,
    toggleActive,
    runTick,
    stopOperation,
    toggleOperationPause,
    loadActiveOperations,
    loadPluginStatus,
    updateMetrics,
  };
}
