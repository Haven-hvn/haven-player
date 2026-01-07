# Frontend Implementation Guide: Dynamic Subscription Plugin Display

## Overview

The backend plugin system has been redesigned with a **standardized operation model** using mixins. This guide provides step-by-step instructions for implementing dynamic UI that adapts to plugin capabilities, with special focus on subscription-based plugins like YouTubePlugin.

## Backend Architecture Changes

### 1. Universal Plugin API
- **GET `/api/plugins/{plugin_name}/operations`** - Lists available operations for a plugin
- **POST `/api/plugins/execute`** - Universal endpoint to execute ANY plugin operation

### 2. Plugin Mixins (Capabilities)
Plugins advertise capabilities through inheritance:
- **CollectionPluginMixin** - subscribe, unsubscribe, list_subscriptions
- **ConfigurablePluginMixin** - get_config, update_config
- **SourcePluginMixin** - list_sources, get_source_status
- **ObservablePluginMixin** - add_event_callback (real-time events)

### 3. Standardized Operations
- Core: `discover_sources`, `archive`, `health_check`
- Collection: `subscribe`, `unsubscribe`, `list_subscriptions`, `get_subscription`, `discover_from_subscription`, `archive_from_subscription`
- Config: `get_config`, `update_config`, `get_default_config`

## Implementation Phase 1: Type Definitions

**File**: `frontend/src/types/plugin.ts`

Add these types to support the new architecture:

```typescript
// ========== Plugin Capabilities ==========

export type PluginCapability = 
  | 'collections'      // Can subscribe to collections (channels, trackers)
  | 'configuration'    // Supports runtime configuration
  | 'sources'          // Manages individual sources
  | 'archival';        // Core archival capability

// Update PluginMetadata interface
export interface PluginMetadata {
  // Existing fields
  name: string;
  version: string;
  description: string;
  media_types: string[];
  loaded: boolean;
  enabled: boolean;
  config?: Record<string, any>;
  priority?: number;
  created_at?: string;
  updated_at?: string;
  
  // NEW: Capabilities fields
  capabilities?: PluginCapability[];
  supports_collections?: boolean;
  has_subscriptions?: boolean;
  subscription_count?: number;
}

// ========== Plugin Operations ==========

export type OperationType = 'query' | 'command';

export interface PluginOperation {
  name: string;
  type: OperationType;
  description: string;
  params: Record<string, string>;
  returns: string;
}

export interface PluginOperationsResponse {
  plugin: string;
  operations: PluginOperation[];
}

// ========== Universal Execution ==========

export interface ExecutePluginOperationRequest {
  plugin_name: string;
  operation: string;
  params?: Record<string, any>;
}

export interface ExecutePluginOperationResult {
  success: boolean;
  plugin: string;
  operation: string;
  result?: any;
  error?: string;
}

// ========== Collection/Subscription Types ==========

export interface Subscription {
  collection_id: string;
  collection_name: string;
  collection_uri: string;
  enabled: boolean;
  created_at: string;
  last_polled_at?: string;
  last_video_count?: number;
  source_count?: number;
  metadata?: {
    [key: string]: any;
    // YouTube-specific
    video_format?: string;
    download_subtitles?: boolean;
    auto_archive?: boolean;
    // BitTorrent-specific
    seeders?: number;
    leechers?: number;
    category?: string;
  };
  videos?: SubscriptionVideo[];
}

export interface SubscriptionVideo {
  source_id: string;
  title?: string;
  download_status: 'pending' | 'downloading' | 'completed' | 'failed';
  upload_date?: string;
  metadata?: Record<string, any>;
}

export interface SubscribeResponse {
  success: boolean;
  collection_id: string;
  collection_name: string;
  collection_uri: string;
  created_at: string;
  error?: string;
}
```

## Implementation Phase 2: Update API Service

**File**: `frontend/src/services/api.ts`

Add these methods to `pluginService`:

```typescript
export const pluginService = {
  // ... existing methods ...
  
  // ========== Operation Discovery ==========
  
  getPluginOperations: async (pluginName: string): Promise<PluginOperationsResponse> => {
    const response = await api.get<PluginOperationsResponse>(`/plugins/${encodeURIComponent(pluginName)}/operations`);
    return response.data;
  },
  
  executeOperation: async (request: ExecutePluginOperationRequest): Promise<ExecutePluginOperationResult> => {
    const response = await api.post<ExecutePluginOperationResult>('/plugins/execute', request);
    return response.data;
  },
  
  // ========== Subscription Methods ==========
  
  subscribe: async (
    pluginName: string,
    collectionUri: string,
    config?: Record<string, any>
  ): Promise<SubscribeResponse> => {
    const result = await this.executeOperation({
      plugin_name: pluginName,
      operation: 'subscribe',
      params: {
        collection_uri: collectionUri,
        config: config || {},
      },
    });
    
    if (!result.success || !result.result) {
      throw new Error(result.error || 'Failed to subscribe');
    }
    
    return result.result;
  },
  
  unsubscribe: async (pluginName: string, collectionId: string): Promise<{ success: boolean }> => {
    const result = await this.executeOperation({
      plugin_name: pluginName,
      operation: 'unsubscribe',
      params: { collection_id: collectionId },
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to unsubscribe');
    }
    
    return { success: true };
  },
  
  listSubscriptions: async (pluginName: string): Promise<Subscription[]> => {
    const result = await this.executeOperation({
      plugin_name: pluginName,
      operation: 'list_subscriptions',
      params: {},
    });
    
    if (!result.success || !result.result) {
      throw new Error(result.error || 'Failed to list subscriptions');
    }
    
    return result.result;
  },
  
  getSubscription: async (pluginName: string, collectionId: string): Promise<Subscription | null> => {
    const result = await this.executeOperation({
      plugin_name: pluginName,
      operation: 'get_subscription',
      params: { collection_id: collectionId },
    });
    
    if (!result.success || !result.result) {
      return null;
    }
    
    return result.result;
  },
  
  discoverFromSubscription: async (pluginName: string, collectionId: string): Promise<any[]> => {
    const result = await this.executeOperation({
      plugin_name: pluginName,
      operation: 'discover_from_subscription',
      params: { collection_id: collectionId },
    });
    
    if (!result.success || !result.result) {
      throw new Error(result.error || 'Failed to discover');
    }
    
    return result.result;
  },
  
  archiveFromSubscription: async (
    pluginName: string,
    collectionId: string
  ): Promise<any[]> => {
    const result = await this.executeOperation({
      plugin_name: pluginName,
      operation: 'archive_from_subscription',
      params: { collection_id: collectionId },
    });
    
    if (!result.success || !result.result) {
      throw new Error(result.error || 'Failed to archive');
    }
    
    return result.result;
  },
  
  // ========== Enhanced Plugin List ==========
  
  getPluginsWithCapabilities: async (): Promise<PluginMetadata[]> => {
    const plugins = await this.getAll();
    
    const enhancedPlugins = await Promise.all(
      plugins.map(async (plugin) => {
        if (!plugin.loaded) {
          return plugin;
        }
        
        try {
          const operations = await this.getPluginOperations(plugin.name);
          const operationNames = operations.operations.map(op => op.name);
          
          const capabilities: PluginCapability[] = [];
          if (operationNames.includes('subscribe')) capabilities.push('collections');
          if (operationNames.includes('get_config')) capabilities.push('configuration');
          if (operationNames.includes('list_sources')) capabilities.push('sources');
          if (operationNames.includes('archive')) capabilities.push('archival');
          
          const supportsCollections = capabilities.includes('collections');
          let subscriptionCount = 0;
          
          if (supportsCollections) {
            try {
              const subscriptions = await this.listSubscriptions(plugin.name);
              subscriptionCount = subscriptions.length;
            } catch (err) {
              console.warn(`Failed to load subscriptions for ${plugin.name}:`, err);
            }
          }
          
          return {
            ...plugin,
            capabilities,
            supports_collections: supportsCollections,
            has_subscriptions: supportsCollections && subscriptionCount > 0,
            subscription_count: subscriptionCount,
          };
        } catch (err) {
          console.warn(`Failed to load capabilities for ${plugin.name}:`, err);
          return plugin;
        }
      })
    );
    
    return enhancedPlugins;
  },
};
```

## Implementation Phase 3: Create Custom Hook

**File**: `frontend/src/hooks/usePluginSubscriptions.ts` (NEW)

```typescript
import { useState, useEffect, useCallback } from 'react';
import { Subscription, SubscribeResponse } from '@/types/plugin';
import { pluginService } from '@/services/api';

interface UsePluginSubscriptionsOptions {
  pluginName: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function usePluginSubscriptions(options: UsePluginSubscriptionsOptions) {
  const { pluginName, autoRefresh = true, refreshInterval = 30000 } = options;
  
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const subs = await pluginService.listSubscriptions(pluginName);
      setSubscriptions(subs);
      return subs;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load';
      setError(errorMessage);
      return [];
    } finally {
      setLoading(false);
    }
  }, [pluginName]);

  const subscribe = useCallback(async (
    collectionUri: string,
    config?: Record<string, any>
  ): Promise<SubscribeResponse> => {
    const result = await pluginService.subscribe(pluginName, collectionUri, config);
    await loadSubscriptions();
    return result;
  }, [pluginName, loadSubscriptions]);

  const unsubscribe = useCallback(async (collectionId: string): Promise<void> => {
    await pluginService.unsubscribe(pluginName, collectionId);
    await loadSubscriptions();
  }, [pluginName, loadSubscriptions]);

  const refreshSubscription = useCallback(async (collectionId: string): Promise<Subscription | null> => {
    await pluginService.discoverFromSubscription(pluginName, collectionId);
    const subscription = await pluginService.getSubscription(pluginName, collectionId);
    
    if (subscription) {
      setSubscriptions(prev => 
        prev.map(sub => sub.collection_id === collectionId ? subscription : sub)
      );
    }
    
    return subscription;
  }, [pluginName]);

  const archiveSubscription = useCallback(async (collectionId: string): Promise<any[]> => {
    const results = await pluginService.archiveFromSubscription(pluginName, collectionId);
    await refreshSubscription(collectionId);
    return results;
  }, [pluginName, refreshSubscription]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadSubscriptions, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, loadSubscriptions]);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  return {
    subscriptions,
    loading,
    error,
    loadSubscriptions,
    subscribe,
    unsubscribe,
    refreshSubscription,
    archiveSubscription,
  };
}
```

## Implementation Phase 4: Update PluginManagementPage

**File**: `frontend/src/components/Plugins/PluginManagementPage.tsx`

Update to use enhanced plugin data and show subscription info:

```typescript
// Import the new hook
import { usePluginSubscriptions } from '@/hooks/usePluginSubscriptions';

// In PluginCard component, add subscription indicator:
<Chip
  label={`${plugin.subscription_count || 0} subscriptions`}
  color={plugin.has_subscriptions ? 'primary' : 'default'}
  size="small"
  sx={{ mr: 1 }}
/>

// Show "View Subscriptions" button for collection plugins:
{plugin.supports_collections && (
  <Button
    size="small"
    onClick={() => navigate(`/plugins/${plugin.name}/subscriptions`)}
  >
    View Subscriptions
  </Button>
)}
```

## Implementation Phase 5: Create Subscription View Component

**File**: `frontend/src/components/Plugins/PluginSubscriptionsView.tsx` (NEW)

```typescript
import React, { useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Chip, Grid,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, CircularProgress, Tooltip, Divider
} from '@mui/material';
import {
  Refresh, Archive, Delete, Add, VideoLibrary
} from '@mui/icons-material';
import { Subscription } from '@/types/plugin';
import { usePluginSubscriptions } from '@/hooks/usePluginSubscriptions';

interface PluginSubscriptionsViewProps {
  pluginName: string;
  pluginDisplayName: string;
}

export function PluginSubscriptionsView({ pluginName, pluginDisplayName }: PluginSubscriptionsViewProps) {
  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const [collectionUri, setCollectionUri] = useState('');
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  const {
    subscriptions,
    loading,
    error,
    loadSubscriptions,
    subscribe,
    unsubscribe,
    refreshSubscription,
    archiveSubscription,
  } = usePluginSubscriptions({ pluginName });

  const handleSubscribe = async () => {
    if (!collectionUri.trim()) return;
    setSubscribeError(null);
    try {
      await subscribe(collectionUri);
      setSubscribeDialogOpen(false);
      setCollectionUri('');
    } catch (err: any) {
      setSubscribeError(err.message || 'Failed to subscribe');
    }
  };

  const handleUnsubscribe = async (collectionId: string) => {
    if (!confirm('Unsubscribe?')) return;
    try {
      await unsubscribe(collectionId);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5">{pluginDisplayName} Subscriptions</Typography>
          <Typography variant="body2" color="text.secondary">
            {subscriptions.length} {subscriptions.length === 1 ? 'subscription' : 'subscriptions'}
          </Typography>
        </Box>
        
        <Button variant="contained" startIcon={<Add />} onClick={() => setSubscribeDialogOpen(true)}>
          Add Subscription
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Subscriptions List */}
      {subscriptions.length === 0 ? (
        <Card>
          <Box p={6} textAlign="center">
            <VideoLibraryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">No Subscriptions</Typography>
            <Typography variant="body2" color="text.secondary">
              Subscribe to {pluginDisplayName} channels to start archiving
            </Typography>
          </Box>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {subscriptions.map((sub) => (
            <Grid item xs={12} md={6} lg={4} key={sub.collection_id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={1}>
                    <Typography variant="h6" noWrap>{sub.collection_name}</Typography>
                    <Chip
                      label={sub.enabled ? 'Enabled' : 'Disabled'}
                      color={sub.enabled ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {sub.source_count} sources • Last poll: {sub.last_polled_at || 'Never'}
                  </Typography>

                  <Box display="flex" gap={1} flexWrap="wrap">
                    <IconButton onClick={() => refreshSubscription(sub.collection_id)}>
                      <Refresh />
                    </IconButton>
                    <IconButton onClick={() => archiveSubscription(sub.collection_id)}>
                      <Archive />
                    </IconButton>
                    <IconButton onClick={() => handleUnsubscribe(sub.collection_id)}>
                      <Delete />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Subscribe Dialog */}
      <Dialog open={subscribeDialogOpen} onClose={() => setSubscribeDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Subscription</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Channel/Collection URL"
            fullWidth
            variant="outlined"
            value={collectionUri}
            onChange={(e) => setCollectionUri(e.target.value)}
            placeholder="https://youtube.com/@example"
          />
          {subscribeError && (
            <Alert severity="error" sx={{ mt: 2 }} >{subscribeError}</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubscribeDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSubscribe} variant="contained">Subscribe</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

## Implementation Phase 6: Add Routes

**File**: `frontend/src/App.tsx` (or routing file)

```typescript
import { PluginSubscriptionsView } from '@/components/Plugins/PluginSubscriptionsView';

// Add route:
<Route path="/plugins/:pluginName/subscriptions" element={
  <PluginSubscriptionsView pluginName={params.pluginName} pluginDisplayName="YouTube" />
} />
```

## Implementation Phase 7: Update usePlugins Hook

**File**: `frontend/src/hooks/usePlugins.ts`

```typescript
// Add method to get enhanced plugins:
const getPluginsWithCapabilities = useCallback(async () => {
  return await pluginService.getPluginsWithCapabilities();
}, []);
```

## Testing

### 1. Test Operation Discovery
```typescript
// Test that YouTubePlugin reports collections capability
const operations = await pluginService.getPluginOperations('YouTubePlugin');
expect(operations.operations.find(op => op.name === 'subscribe')).toBeDefined();
```

### 2. Test Subscription Flow
```typescript
// Subscribe to channel
const result = await pluginService.subscribe('YouTubePlugin', 'https://youtube.com/@TED', {});
expect(result.success).toBe(true);

// List subscriptions
const subscriptions = await pluginService.listSubscriptions('YouTubePlugin');
expect(subscriptions.length).toBeGreaterThan(0);
```

### 3. Test Dynamic UI
- Load plugin management page
- Verify YouTubePlugin shows subscription count
- Click "View Subscriptions"
- Verify subscription list displays
- Add new subscription
- Verify it appears in list

## Key Benefits

✅ **Dynamic UI**: Automatically adapts to plugin capabilities
✅ **No Hardcoding**: No plugin-specific components needed
✅ **Universal API**: Single endpoint for all operations
✅ **Extensible**: New plugin types work automatically
✅ **Self-Documenting**: Operation discovery API
✅ **Consistent**: All plugins work the same way

## Summary

Implement these 7 phases to add dynamic subscription plugin support:

1. ✅ Update type definitions with capabilities and subscription types
2. ✅ Enhance API service with universal execution and subscription methods
3. ✅ Create usePluginSubscriptions hook
4. ✅ Update PluginManagementPage to show plugin capabilities
5. ✅ Create PluginSubscriptionsView component
6. ✅ Add subscription routes
7. ✅ Update usePlugins hook with enhanced plugin loading

The frontend will now dynamically adapt to any plugin's capabilities, making subscription-based plugins like YouTubePlugin fully functional with a clean, consistent interface.