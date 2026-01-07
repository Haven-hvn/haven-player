# DePIN Dashboard Plugin Integration Guide

## Overview

This guide explains how to completely migrate the DePIN dashboard to use the **new plugin-based architecture**. The frontend will now treat all archival operations uniformly, whether they're real-time streams (WebRTC) or subscription-based (YouTube).

**Key Principle**: The DePIN dashboard is now **plugin-agnostic** - it doesn't care which plugin is active, it just manages archival operations.

## UI/UX Design Philosophy

### User Perspective

**Before (Legacy):**
- "I'm recording PumpFun stream XYZ"
- Everything is about "mint_id" and WebRTC

**After (Plugin-Based):**
- "I'm archiving from YouTube channel: TED"
- "I'm recording live stream: XYZ"
- Clear visibility of **which plugin** is active and **what it's archiving**

### Visual Hierarchy

```
┌─────────────────────────────────────────────────┐
│  NETWORK STATUS: ACTIVE                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                 │
│  Currently Archiving:                           │
│  ┌───────────────────────────────────────────┐  │
│  │ 🎬 YouTube Plugin                          │  │
│  │    TED Talks Channel                       │  │
│  │    Archiving: "10 AI Breakthroughs"       │  │
│  │    Progress: ████████░░ 80%               │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  Active Plugins (3):                            │
│  ✓ WebRTC Archiver (Recording Stream XYZ)       │
│  ✓ YouTube Archiver (Archiving 1 video)        │
│  ✓ BitTorrent Archiver (Downloading 2 torrents) │
└─────────────────────────────────────────────────┘
```

---

## Implementation Step 1: Update Type Definitions

**File**: `frontend/src/types/plugin.ts`

Add unified types for plugin-based architecture:

```typescript
// ========== Unified DePIN Types ==========

export interface DePinActiveOperation {
  operation_id: string;        // Unique ID for this operation
  plugin_name: string;         // 'webrtc-archiver', 'youtube-archiver', etc.
  plugin_display_name: string; // 'WebRTC Recording', 'YouTube Archiver', etc.
  operation_type: 'real-time' | 'subscription' | 'download';
  
  // Source information
  source_id: string;           // mint_id, video_id, torrent_hash, etc.
  source_name: string;         // "Stream XYZ", "TED Talk", "Movie Name"
  source_uri?: string;         // URL to source
  
  // Progress tracking
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;            // 0-100
  start_time: Date;
  estimated_completion?: Date;
  
  // Metrics
  duration_seconds: number;
  file_size_bytes?: number;
  
  // Error handling
  error?: string;
}

export interface DePinDashboardState {
  // Dashboard status
  is_active: boolean;
  points: number;
  level: number;
  streak: number;
  
  // Active operations
  active_operations: DePinActiveOperation[];
  
  // Plugin status
  enabled_plugins: Array<{
    name: string;
    display_name: string;
    status: 'idle' | 'active' | 'paused' | 'error';
    active_operations_count: number;
  }>;
  
  // Overall metrics
  total_archived: number;
  total_uploaded: number;
  pending_uploads: number;
}

export interface DePinTickResponse {
  success: boolean;
  message: string;
  
  // Active operation info
  active_operation?: {
    plugin_name: string;
    source_id: string;
    source_name: string;
    operation_type: string;
    duration: number;
  };
  
  // Actions taken
  actions?: Array<{
    type: 'started' | 'stopped' | 'uploaded' | 'discovered';
    plugin_name: string;
    source_id: string;
    message: string;
  }>;
}
```

---

## Implementation Step 2: Create Unified DePIN Hook

**File**: `frontend/src/hooks/useDePinDashboard.ts` (NEW)

```typescript
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
  
  const tickIntervalRef = useRef<NodeJS.Timeout>();
  const statusIntervalRef = useRef<NodeJS.Timeout>();
  const isTickInProgressRef = useRef(false);

  // Load plugins and their status
  const loadPluginStatus = useCallback(async () => {
    try {
      const plugins = await pluginService.getPluginsWithCapabilities();
      
      // Filter to plugins with 'archival' capability
      const archivalPlugins = plugins.filter(p => 
        p.capabilities?.includes('archival')
      );
      
      // Get active status for each plugin
      const enabledPlugins = await Promise.all(
        archivalPlugins.map(async (plugin) => {
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
      
      setState(prev => ({ ...prev, enabled_plugins }));
      return enabledPlugins;
    } catch (err) {
      console.error('Failed to load plugin status:', err);
      return [];
    }
  }, []);

  // Load active operations from all plugins
  const loadActiveOperations = useCallback(async () => {
    try {
      const plugins = await pluginService.getPluginsWithCapabilities();
      const archivalPlugins = plugins.filter(p => 
        p.capabilities?.includes('archival')
      );
      
      const allOperations: DePinActiveOperation[] = [];
      
      for (const plugin of archivalPlugins) {
        try {
          const sources = await pluginService.getPluginSources(plugin.name);
          
          // Convert sources to active operations
          for (const source of sources.sources) {
            if (source.metadata?.status === 'running' || source.metadata?.status === 'archiving') {
              allOperations.push({
                operation_id: `${plugin.name}-${source.source_id}`,
                plugin_name: plugin.name,
                plugin_display_name: plugin.description || plugin.name,
                operation_type: source.metadata?.operation_type || 'real-time',
                source_id: source.source_id,
                source_name: source.metadata?.name || source.source_id,
                source_uri: source.uri,
                status: source.metadata?.status || 'running',
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
      
      setState(prev => ({ ...prev, active_operations: allOperations }));
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
    setState(prev => ({ ...prev, is_active: active }));
    
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
      const result = await pluginService.executeOperation({
        plugin_name: operationId.split('-')[0],
        operation: paused ? 'pause' : 'resume',
        params: { source_id: operationId.split('-')[1] },
      });
      
      if (result.success) {
        await loadActiveOperations();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle pause';
      setError(errorMessage);
      throw err;
    }
  }, [loadActiveOperations]);

  // Initial load
  useEffect(() => {
    loadPluginStatus();
    loadActiveOperations();
  }, [loadPluginStatus, loadActiveOperations]);

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
  };
}
```

---

## Implementation Step 3: Redesign DePinDashboard Component

**File**: `frontend/src/components/DePinDashboard.tsx`

Complete rewrite with plugin-agnostic UI:

```typescript
import React, { useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Chip,
  List, ListItem, ListItemText, LinearProgress,
  Alert, CircularProgress, IconButton, Divider,
  Grid, Badge, Tooltip
} from '@mui/material';
import {
  PlayArrow, Pause, Stop, CloudUpload, 
  Schedule, Extension, VideoLibrary, 
  Bolt, Star, Timeline, Settings
} from '@mui/icons-material';
import { useDePinDashboard } from '@/hooks/useDePinDashboard';
import { useVideos } from '@/hooks/useVideos';
import { useFilecoinUpload } from '@/hooks/useFilecoinUpload';
import { FilecoinConfig } from '@/types/filecoin';
import { SettingsTab } from '@/context/SettingsNavigationContext';

interface DePinDashboardProps {
  filecoinConfig?: FilecoinConfig | null;
  onRequireSettings?: (tab: SettingsTab) => void;
}

const DePinDashboard: React.FC<DePinDashboardProps> = ({ 
  filecoinConfig: filecoinConfigProp = null, 
  onRequireSettings 
}) => {
  const { videos, refreshVideos } = useVideos();
  const { uploadVideo } = useFilecoinUpload();
  const [filecoinConfig, setFilecoinConfig] = React.useState<FilecoinConfig | null>(filecoinConfigProp);
  
  const {
    state,
    loading,
    error,
    toggleActive,
    runTick,
    stopOperation,
    toggleOperationPause,
  } = useDePinDashboard();

  const [logs, setLogs] = React.useState<Array<{ message: string; time: string }>>([]);

  const addLog = (message: string) => {
    setLogs(prev => [{
      message,
      time: new Date().toLocaleTimeString(),
    }, ...prev].slice(0, 50));
  };

  // Load Filecoin config
  useEffect(() => {
    if (!filecoinConfigProp) {
      // Load from Electron secure storage
      window.require('electron').ipcRenderer.invoke('get-filecoin-config')
        .then(config => setFilecoinConfig(config));
    }
  }, [filecoinConfigProp]);

  // Toggle active state
  const handleToggleActive = async (active: boolean) => {
    if (active && !filecoinConfig) {
      addLog('⚠️ Filecoin config required. Opening settings...');
      onRequireSettings?.('filecoin');
      return;
    }
    
    toggleActive(active);
    addLog(active ? '🚀 DePIN Node Activated' : '⏹️  DePIN Node Deactivated');
  };

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
      
      {/* Header: Rewards Dashboard */}
      <Card sx={{ 
        background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
        color: 'white',
      }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="overline" sx={{ opacity: 0.8 }}>
                HAVEN REWARDS DASHBOARD
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, my: 1 }}>
                {state.points.toLocaleString()} PTS
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Chip icon={<Star />} label={`Level ${state.level}`} size="small" />
                <Chip icon={<Schedule />} label={`${state.streak} Day Streak`} size="small" />
              </Box>
            </Box>
            
            <Box sx={{ textAlign: 'right' }}>
              <Button
                variant={state.is_active ? 'outlined' : 'contained'}
                color={state.is_active ? 'error' : 'success'}
                size="large"
                startIcon={state.is_active ? <Stop /> : <PlayArrow />}
                onClick={() => handleToggleActive(!state.is_active)}
              >
                {state.is_active ? 'STOP NODE' : 'START NODE'}
              </Button>
              {state.is_active && (
                <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.8 }}>
                  Earning passive rewards...
                </Typography>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {!filecoinConfig && (
        <Alert severity="warning">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Filecoin configuration required to start node</span>
            <Button size="small" onClick={() => onRequireSettings?.('filecoin')}>
              Configure
            </Button>
          </Box>
        </Alert>
      )}

      {/* Active Operations Section */}
      <Typography variant="h6">Active Operations</Typography>
      
      {state.active_operations.length === 0 && state.is_active ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              Discovering and archiving content...
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Waiting for plugin operations to start
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {state.active_operations.map((operation) => (
            <Grid item xs={12} md={6} lg={4} key={operation.operation_id}>
              <OperationCard 
                operation={operation}
                onStop={() => stopOperation(operation.operation_id)}
                onPause={(paused) => toggleOperationPause(operation.operation_id, paused)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Plugin Status Section */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Plugin Status</Typography>
        <Typography variant="caption" color="text.secondary">
          {state.enabled_plugins.length} plugins installed
        </Typography>
      </Box>
      
      <Grid container spacing={2}>
        {state.enabled_plugins.map((plugin) => (
          <Grid item xs={12} sm={6} md={4} key={plugin.name}>
            <PluginStatusCard plugin={plugin} />
          </Grid>
        ))}
      </Grid>

      {/* Metrics Section */}
      <Typography variant="h6">Overall Metrics</Typography>
      
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard 
            title="Total Archived" 
            value={state.total_archived}
            icon={<Schedule />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard 
            title="Uploaded to Filecoin" 
            value={state.total_uploaded}
            icon={<CloudUpload />}
            color="secondary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard 
            title="Pending Uploads" 
            value={state.pending_uploads}
            icon={<Bolt />}
            color="warning"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard 
            title="Active Operations" 
            value={state.active_operations.length}
            icon={<Extension />}
            color="info"
          />
        </Grid>
      </Grid>

      {/* Activity Log */}
      <Card sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Timeline fontSize="small" />
            <Typography variant="subtitle2">Activity Log</Typography>
          </Box>
          
          <List sx={{ flex: 1, overflow: 'auto', bgcolor: '#f8f9fa', borderRadius: 2 }}>
            {logs.length === 0 && (
              <Box sx={{ py: 4, textAlign: 'center', opacity: 0.6 }}>
                <Typography variant="body2">No activity recorded</Typography>
              </Box>
            )}
            {logs.map((log, index) => (
              <ListItem key={index} dense sx={{ py: 0.5, borderBottom: '1px solid #eee' }}>
                <ListItemText 
                  primaryTypographyProps={{ 
                    variant: 'caption',
                    fontFamily: 'monospace'
                  }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                  primary={log.message}
                  secondary={log.time}
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    </Box>
  );
};

// Helper Components
function OperationCard({ operation, onStop, onPause }: any) {
  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'real-time': return <PlayArrow />;
      case 'subscription': return <VideoLibrary />;
      case 'download': return <CloudUpload />;
      default: return <Extension />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'success';
      case 'paused': return 'warning';
      case 'completed': return 'primary';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {getOperationIcon(operation.operation_type)}
            <Box>
              <Typography variant="subtitle2">{operation.plugin_display_name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {operation.source_name}
              </Typography>
            </Box>
          </Box>
          <Chip 
            label={operation.status} 
            size="small"
            color={getStatusColor(operation.status) as any}
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {Math.floor(operation.duration_seconds / 60)}:{(operation.duration_seconds % 60).toString().padStart(2, '0')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {operation.progress}%
            </Typography>
          </Box>
          <LinearProgress 
            variant="determinate" 
            value={operation.progress} 
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton size="small" onClick={() => onPause(operation.status === 'running')}>
            {operation.status === 'running' ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton size="small" color="error" onClick={onStop}>
            <Stop />
          </IconButton>
        </Box>
      </CardContent>
    </Card>
  );
}

function PluginStatusCard({ plugin }: any) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'paused': return 'warning';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Extension fontSize="small" />
            <Typography variant="body2">{plugin.display_name}</Typography>
          </Box>
          <Badge 
            badgeContent={plugin.active_operations_count}
            color="primary"
            sx={{ '& .MuiBadge-badge': { fontSize: 10 } }}
          >
            <Chip 
              label={plugin.status} 
              size="small"
              color={getStatusColor(plugin.status) as any}
            />
          </Badge>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {plugin.active_operations_count} active operation(s)
        </Typography>
      </CardContent>
    </Card>
  );
}

function MetricCard({ title, value, icon, color }: any) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Box sx={{ p: 1, borderRadius: 2, bgcolor: `${color}15` }}>
            {React.cloneElement(icon, { color: color as any })}
          </Box>
          <Typography variant="subtitle2" color="text.secondary">{title}</Typography>
        </Box>
        <Typography variant="h4">{value}</Typography>
      </CardContent>
    </Card>
  );
}

export default DePinDashboard;
```

---

## Implementation Step 4: Plugin Configuration System

### Configuration Types

**File**: `frontend/src/types/plugin.ts`

Add plugin configuration types:

```typescript
export interface PluginConfigField {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'url' | 'channel-url';
  label: string;
  description?: string;
  default?: any;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  validation?: RegExp;
  validation_message?: string;
}

export interface PluginConfigSchema {
  plugin_name: string;
  display_name: string;
  description: string;
  version: string;
  config_schema: PluginConfigField[];
  current_config: Record<string, any>;
}

// Plugin-specific configuration interfaces
export interface YouTubePluginConfig {
  channels: Array<{
    name: string;
    channel_url: string;
    enabled: boolean;
    video_format?: 'mp4' | 'webm' | 'mkv';
    video_quality?: 'best' | '1080p' | '720p' | '480p';
    download_subtitles: boolean;
    auto_archive: boolean;
  }>;
  poll_interval_minutes: number;
  max_concurrent_downloads: number;
}

export interface WebRTCPluginConfig {
  video_format: 'webm' | 'mp4';
  video_quality: 'best' | '1080p' | '720p' | '480p';
  audio_bitrate: number;
  record_transcode: boolean;
  max recording_duration_minutes: number;
}

export interface BitTorrentPluginConfig {
  max_active_downloads: number;
  max_upload_speed_kbps: number;
  max_download_speed_kbps: number;
  seed_ratio: number;
  min_seed_time_hours: number;
  auto_cleanup: boolean;
  download_directory: string;
}
```

---

## Implementation Step 5: Plugin Configuration Hook

**File**: `frontend/src/hooks/usePluginConfiguration.ts` (NEW)

```typescript
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
      const operations = await pluginService.getPluginOperations(pluginName);
      
      const hasConfig = operations.operations.some(op => op.name === 'get_config');
      if (!hasConfig) {
        setError('This plugin does not support configuration');
        setLoading(false);
        return;
      }

      // Get current config
      const currentConfigResult = await pluginService.executeOperation({
        plugin_name: pluginName,
        operation: 'get_config',
        params: {},
      });

      if (currentConfigResult.success && currentConfigResult.result) {
        setConfig(currentConfigResult.result);
      }

      // Get default config schema
      const defaultConfigResult = await pluginService.executeOperation({
        plugin_name: pluginName,
        operation: 'get_default_config',
        params: {},
      });

      if (defaultConfigResult.success && defaultConfigResult.result) {
        setConfigSchema({
          plugin_name: pluginName,
          display_name: pluginName,
          description: `Configuration for ${pluginName}`,
          version: '1.0.0',
          config_schema: defaultConfigResult.result.fields || [],
          current_config: config,
        });
      }

      setLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load config';
      setError(errorMessage);
      setLoading(false);
    }
  }, [pluginName, config]);

  // Update configuration value
  const updateConfigValue = useCallback((field_name: string, value: any) => {
    setConfig(prev => ({ ...prev, [field_name]: value }));
  }, []);

  // Save configuration
  const saveConfig = useCallback(async () => {
    setSaving(true);
    setError(null);
    
    try {
      const result = await pluginService.executeOperation({
        plugin_name: pluginName,
        operation: 'update_config',
        params: { config },
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save config');
      }

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
      const defaultConfigResult = await pluginService.executeOperation({
        plugin_name: pluginName,
        operation: 'get_default_config',
        params: {},
      });

      if (defaultConfigResult.success && defaultConfigResult.result) {
        setConfig(defaultConfigResult.result.defaults || {});
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
```

---

## Implementation Step 6: Plugin Configuration Modal Component

**File**: `frontend/src/components/Plugins/PluginConfigurationModal.tsx` (NEW)

```typescript
import React, { useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, FormControlLabel, Switch,
  Select, MenuItem, FormControl, InputLabel,
  Box, Typography, Alert, Divider, Grid,
  CircularProgress, IconButton, Tooltip
} from '@mui/material';
import { Add, Delete, Settings as SettingsIcon } from '@mui/icons-material';
import { PluginConfigSchema, PluginConfigField } from '@/types/plugin';
import { usePluginConfiguration } from '@/hooks/usePluginConfiguration';

interface PluginConfigurationModalProps {
  open: boolean;
  pluginName: string;
  pluginDisplayName: string;
  onClose: () => void;
  onSave: () => void;
}

export function PluginConfigurationModal({
  open,
  pluginName,
  pluginDisplayName,
  onClose,
  onSave,
}: PluginConfigurationModalProps) {
  const {
    configSchema,
    config,
    loading,
    error,
    saving,
    loadConfigSchema,
    updateConfigValue,
    saveConfig,
    resetToDefaults,
  } = usePluginConfiguration(pluginName);

  useEffect(() => {
    if (open) {
      loadConfigSchema();
    }
  }, [open, loadConfigSchema]);

  const handleSave = async () => {
    const result = await saveConfig();
    if (result.success) {
      onSave();
      onClose();
    }
  };

  const handleReset = async () => {
    await resetToDefaults();
  };

  const renderConfigField = (field: PluginConfigField) => {
    const value = config[field.name] !== undefined ? config[field.name] : field.default;

    switch (field.type) {
      case 'text':
        return (
          <TextField
            fullWidth
            label={field.label}
            value={value || ''}
            onChange={(e) => updateConfigValue(field.name, e.target.value)}
            helperText={field.description}
            required={field.required}
            error={field.required && !value}
          />
        );

      case 'number':
        return (
          <TextField
            fullWidth
            type="number"
            label={field.label}
            value={value || 0}
            onChange={(e) => updateConfigValue(field.name, Number(e.target.value))}
            helperText={field.description}
            inputProps={{ min: field.min, max: field.max }}
            required={field.required}
          />
        );

      case 'boolean':
        return (
          <FormControlLabel
            control={
              <Switch
                checked={value || false}
                onChange={(e) => updateConfigValue(field.name, e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body2">{field.label}</Typography>
                {field.description && (
                  <Typography variant="caption" color="text.secondary">
                    {field.description}
                  </Typography>
                )}
              </Box>
            }
          />
        );

      case 'select':
        return (
          <FormControl fullWidth required={field.required}>
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={value || ''}
              label={field.label}
              onChange={(e) => updateConfigValue(field.name, e.target.value)}
            >
              {field.options?.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
            {field.description && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                {field.description}
              </Typography>
            )}
          </FormControl>
        );

      case 'url':
        return (
          <TextField
            fullWidth
            type="url"
            label={field.label}
            value={value || ''}
            onChange={(e) => updateConfigValue(field.name, e.target.value)}
            helperText={field.description}
            placeholder="https://..."
            required={field.required}
            error={field.required && !value}
          />
        );

      case 'channel-url':
        return (
          <TextField
            fullWidth
            type="url"
            label={field.label}
            value={value || ''}
            onChange={(e) => updateConfigValue(field.name, e.target.value)}
            helperText={field.description}
            placeholder="https://youtube.com/@channel"
            required={field.required}
            error={field.required && !value}
          />
        );

      default:
        return (
          <Typography variant="body2" color="text.secondary">
            Unknown field type: {field.type}
          </Typography>
        );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon />
          <Typography variant="h6">{pluginDisplayName} Configuration</Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : configSchema ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography variant="body2" color="text.secondary">
              {configSchema.description}
            </Typography>

            {error && <Alert severity="error">{error}</Alert>}

            <Grid container spacing={2}>
              {configSchema.config_schema.map((field) => (
                <Grid item xs={12} sm={6} key={field.name}>
                  {renderConfigField(field)}
                </Grid>
              ))}
            </Grid>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No configuration available for this plugin.
          </Typography>
        )}
      </DialogContent>

      <DialogActions>
        {configSchema && (
          <>
            <Button onClick={handleReset} color="info">
              Reset to Defaults
            </Button>
            <Button onClick={onClose}>Cancel</Button>
            <Button 
              onClick={handleSave} 
              variant="contained" 
              disabled={saving}
            >
              {saving ? <CircularProgress size={20} /> : 'Save Configuration'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
```

---

## Implementation Step 7: YouTube-Specific Configuration Component

**File**: `frontend/src/components/Plugins/YouTubePluginConfig.tsx` (NEW)

```typescript
import React, { useState } from 'react';
import {
  Box, Typography, TextField, Switch, FormControl,
  InputLabel, Select, MenuItem, Card, CardContent,
  IconButton, Button, Grid, Divider, Chip, Alert
} from '@mui/material';
import { Add, Delete, YouTube as YouTubeIcon } from '@mui/icons-material';
import { YouTubePluginConfig } from '@/types/plugin';

interface YouTubePluginConfigProps {
  config: YouTubePluginConfig;
  onChange: (config: YouTubePluginConfig) => void;
}

export function YouTubePluginConfig({ config, onChange }: YouTubePluginConfigProps) {
  // Add a new channel
  const addChannel = () => {
    onChange({
      ...config,
      channels: [
        ...config.channels,
        {
          name: '',
          channel_url: '',
          enabled: true,
          video_format: 'mp4',
          video_quality: 'best',
          download_subtitles: false,
          auto_archive: true,
        },
      ],
    });
  };

  // Remove a channel
  const removeChannel = (index: number) => {
    onChange({
      ...config,
      channels: config.channels.filter((_, i) => i !== index),
    });
  };

  // Update channel field
  const updateChannel = (index: number, field: string, value: any) => {
    const updatedChannels = [...config.channels];
    updatedChannels[index] = { ...updatedChannels[index], [field]: value };
    onChange({ ...config, channels: updatedChannels });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Channel Subscriptions */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <YouTubeIcon color="error" />
            Channel Subscriptions
          </Typography>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={addChannel}
            size="small"
          >
            Add Channel
          </Button>
        </Box>

        {config.channels.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            No channels configured. Add channels to start archiving.
          </Alert>
        ) : (
          <Grid container spacing={2}>
            {config.channels.map((channel, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <YouTubeIcon color="error" fontSize="small" />
                        <Typography variant="subtitle2">Channel {index + 1}</Typography>
                      </Box>
                      <div>
                        <Chip
                          label={channel.enabled ? 'Enabled' : 'Disabled'}
                          size="small"
                          color={channel.enabled ? 'success' : 'default'}
                          sx={{ mr: 1 }}
                        />
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeChannel(index)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </div>
                    </Box>

                    <TextField
                      fullWidth
                      size="small"
                      label="Channel Name"
                      value={channel.name}
                      onChange={(e) => updateChannel(index, 'name', e.target.value)}
                      placeholder="e.g., TED Talks"
                      sx={{ mb: 1.5 }}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      label="Channel URL"
                      value={channel.channel_url}
                      onChange={(e) => updateChannel(index, 'channel_url', e.target.value)}
                      placeholder="https://youtube.com/@TED"
                      helperText="YouTube channel URL"
                      sx={{ mb: 1.5 }}
                    />

                    <Grid container spacing={1}>
                      <Grid item xs={6}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Video Format</InputLabel>
                          <Select
                            value={channel.video_format || 'mp4'}
                            label="Video Format"
                            onChange={(e) => updateChannel(index, 'video_format', e.target.value)}
                          >
                            <MenuItem value="mp4">MP4</MenuItem>
                            <MenuItem value="webm">WebM</MenuItem>
                            <MenuItem value="mkv">MKV</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={6}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Quality</InputLabel>
                          <Select
                            value={channel.video_quality || 'best'}
                            label="Quality"
                            onChange={(e) => updateChannel(index, 'video_quality', e.target.value)}
                          >
                            <MenuItem value="best">Best Available</MenuItem>
                            <MenuItem value="1080p">1080p</MenuItem>
                            <MenuItem value="720p">720p</MenuItem>
                            <MenuItem value="480p">480p</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                    </Grid>

                    <Box sx={{ mt: 2 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={channel.enabled}
                            onChange={(e) => updateChannel(index, 'enabled', e.target.checked)}
                          />
                        }
                        label="Enabled"
                        sx={{ mr: 2 }}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={channel.download_subtitles}
                            onChange={(e) => updateChannel(index, 'download_subtitles', e.target.checked)}
                          />
                        }
                        label="Download Subtitles"
                        sx={{ mr: 2 }}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={channel.auto_archive}
                            onChange={(e) => updateChannel(index, 'auto_archive', e.target.checked)}
                          />
                        }
                        label="Auto Archive"
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      <Divider />

      {/* Global Settings */}
      <Box>
        <Typography variant="h6" gutterBottom>Global Settings</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Poll Interval (minutes)"
              value={config.poll_interval_minutes}
              onChange={(e) => onChange({ ...config, poll_interval_minutes: Number(e.target.value) })}
              helperText="How often to check for new videos"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Max Concurrent Downloads"
              value={config.max_concurrent_downloads}
              onChange={(e) => onChange({ ...config, max_concurrent_downloads: Number(e.target.value) })}
              helperText="Maximum simultaneous downloads"
            />
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
```

---

## Implementation Step 8: Update PluginStatusCard with Config Button

**File**: `frontend/src/components/DePinDashboard.tsx`

Add configuration button to plugin status cards:

```typescript

function PluginStatusCard({ plugin, onConfig }: { 
  plugin: any; 
  onConfig: (pluginName: string) => void; 
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'paused': return 'warning';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Extension fontSize="small" />
            <Typography variant="body2">{plugin.display_name}</Typography>
          </Box>
          <Badge 
            badgeContent={plugin.active_operations_count}
            color="primary"
            sx={{ '& .MuiBadge-badge': { fontSize: 10 } }}
          >
            <Chip 
              label={plugin.status} 
              size="small"
              color={getStatusColor(plugin.status) as any}
            />
          </Badge>
        </Box>
        
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {plugin.active_operations_count} active operation(s)
        </Typography>
        
        <Button
          size="small"
          startIcon={<SettingsIcon />}
          onClick={() => onConfig(plugin.name)}
          sx={{ mt: 1 }}
        >
          Configure
        </Button>
      </CardContent>
    </Card>
  );
}

// In main component, add state for config modal:

const [configModalOpen, setConfigModalOpen] = useState(false);
const [configPlugin, setConfigPlugin] = useState<{ name: string; displayName: string } | null>(null);

// Handler functions:

const handleOpenConfig = (pluginName: string) => {
  const plugin = state.enabled_plugins.find(p => p.name === pluginName);
  if (plugin) {
    setConfigPlugin({ name: pluginName, displayName: plugin.display_name });
    setConfigModalOpen(true);
  }
};

const handleCloseConfig = () => {
  setConfigModalOpen(false);
  setConfigPlugin(null);
};

// Add config modal to JSX:

{configPlugin && (
  <PluginConfigurationModal
    open={configModalOpen}
    pluginName={configPlugin.name}
    pluginDisplayName={configPlugin.displayName}
    onClose={handleCloseConfig}
    onSave={() => {
      loadPluginStatus();
      addLog(`✅ Updated ${configPlugin.displayName} configuration`);
    }}
  />
)}

// Update plugin status card usage:

<Grid item xs={12} sm={6} md={4} key={plugin.name}>
  <PluginStatusCard 
    plugin={plugin} 
    onConfig={handleOpenConfig} 
  />
</Grid>
```

---

## UI/UX Principles Implemented

### 1. **Clear Hierarchy**
- Dashboard status at top (rewards, node toggle)
- Active operations prominently displayed
- Plugin status with **configuration access**
- Metrics for overall health

### 2. **Plugin Transparency**
- User always knows **which plugin** is working
- Operation cards show plugin name and type
- Plugin status cards show **configure button** for customization
- Color-coded status indicators

### 3. **Unified Interface**
- All operations work the same way (play/pause/stop)
- Same card design for all plugin types
- **Consistent configuration modal** for all plugins
- Generic "operation" terminology

### 4. **User-Friendly Configuration**
- **Context-aware forms** per plugin type (YouTube: channels, WebRTC: quality, etc.)
- Human-readable field labels and descriptions
- Validation and error handling
- Reset to defaults option
- Real-time config updates

### 5. **Accessible Configuration**
- Configure button on every plugin status card
- Universal modal works for all plugin types
- YouTube has specialized channel management UI
- Settings persist across sessions

### 6. **Actionable Feedback**
- Clear status indicators (running, paused, completed, failed)
- Progress bars for long operations
- Real-time duration tracking
- Configuration save confirmation
- Detailed activity log
---

## UI/UX Design Philosophy

### 1. **Clear Hierarchy**
- Dashboard status at top (rewards, node toggle)
- Active operations prominently displayed
- Plugin status with **configuration access**
- Metrics for overall health

### 2. **Plugin Transparency**
- User always knows **which plugin** is working
- Operation cards show plugin name and type
- Plugin status cards show **configure button** for customization
- Color-coded status indicators

### 3. **Unified Interface**
- All operations work the same way (play/pause/stop)
- Same card design for all plugin types
- **Consistent configuration modal** for all plugins
- Generic "operation" terminology

### 4. **User-Friendly Configuration**
- **Context-aware forms** per plugin type (YouTube: channels, WebRTC: quality, etc.)
- Human-readable field labels and descriptions
- Validation and error handling
- Reset to defaults option
- Real-time config updates

### 5. **Accessible Configuration**
- Configure button on every plugin status card
- Universal modal works for all plugin types
- YouTube has specialized channel management UI
- Settings persist across sessions

### 6. **Actionable Feedback**
- Clear status indicators (running, paused, completed, failed)
- Progress bars for long operations
- Real-time duration tracking
- Configuration save confirmation
- Detailed activity log

---

## Testing Checklist

- [ ] Node toggle works (start/stop)
- [ ] Operations display correctly from all plugins
- [ ] Plugin status cards update in real-time
- [ ] Play/pause/stop buttons work
- [ ] Progress bars update correctly
- [ ] Activity log records all events
- [ ] Metrics are accurate
- [ ] Error states display properly
- [ ] Responsive design works on all screens
- [ ] Filecoin config validation works

---

## Migration Steps

1. **Remove Legacy Code**
   - Delete old `mint_id` tracking
   - Remove hardcoded WebRTC references
   - Delete legacy tick handling

2. **Implement New Components**
   - Create `useDePinDashboard` hook
   - Build new UI components
   - Add plugin-aware cards

3. **Test All Plugins**
   - WebRTC (real-time streams)
   - YouTube (subscription-based)
   - BitTorrent (download-based)
   - Any future plugins

4. **Verify UI Clarity**
   - Test with users
   - Ensure terminology is clear
   - Verify action buttons are intuitive

5. **Documentation**
   - Update user guide
   - Document plugin development
   - Add troubleshooting section

---

## Summary

The DePIN dashboard is now **completely plugin-agnostic**:

- ✅ **Unified UI**: All plugin operations look and work the same
- ✅ **Clear Visibility**: Users always know which plugin is active
- ✅ **User-Friendly**: Human-readable names and clear status
- ✅ **Extensible**: New plugins work automatically
- ✅ **Maintainable**: Single codebase for all plugin types

The user experience is now consistent regardless of what's being archived - a YouTube video, a live stream, or a torrent download.