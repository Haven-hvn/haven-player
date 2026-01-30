import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  TextField,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
} from '@mui/material';
import {
  LiveTv as LiveIcon,
  CheckCircle as ActiveIcon,
  Error as ErrorIcon,
  Search as SearchIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { usePluginOperations } from '@/hooks/usePlugins';
import { PluginMetadata } from '@/types/plugin';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';

interface PluginOperationsPanelProps {
  plugin?: PluginMetadata | null;
  pluginName: string;
}

/**
 * Generic Plugin Operations Panel
 * 
 * Renders plugin-specific operations based on the plugin's declared capabilities.
 * This is a generic component that works with any plugin that declares operations
 * in its capabilities metadata.
 */
const PluginOperationsPanel: React.FC<PluginOperationsPanelProps> = ({
  plugin,
  pluginName,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    sources,
    subscriptions,
    loading,
    error,
    refresh,
    subscribe,
    unsubscribe,
    executeOperation,
  } = usePluginOperations(pluginName, plugin?.capabilities);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    const items = activeTab === 0 ? sources : subscriptions;
    if (!searchQuery) return items;
    
    const query = searchQuery.toLowerCase();
    return items.filter((item: any) => {
      const name = item.name || item.stream_name || item.device_name || '';
      const id = item.stream_id || item.device_id || item.source_id || '';
      return (
        name.toLowerCase().includes(query) ||
        id.toLowerCase().includes(query)
      );
    });
  }, [sources, subscriptions, activeTab, searchQuery]);

  // Get capability info for display
  const capabilityInfo = useMemo(() => {
    if (!plugin?.capabilities) return null;
    return plugin.capabilities.find((cap) => 
      cap.operations?.includes('subscribe') || 
      cap.operations?.includes('list_subscriptions')
    );
  }, [plugin?.capabilities]);

  const handleSubscribe = useCallback(async (item: any) => {
    await subscribe(item);
    // Switch to subscriptions tab after subscribing
    setActiveTab(1);
  }, [subscribe]);

  const handleUnsubscribe = useCallback(async (item: any) => {
    await unsubscribe(item);
  }, [unsubscribe]);

  const isSubscribed = useCallback((item: any) => {
    return subscriptions.some((sub: any) => {
      const subId = sub.stream_id || sub.device_id || sub.source_id;
      const itemId = item.stream_id || item.device_id || item.source_id;
      return subId === itemId;
    });
  }, [subscriptions]);

  const getSubscription = useCallback((item: any) => {
    return subscriptions.find((sub: any) => {
      const subId = sub.stream_id || sub.device_id || sub.source_id;
      const itemId = item.stream_id || item.device_id || item.source_id;
      return subId === itemId;
    });
  }, [subscriptions]);

  if (loading && sources.length === 0 && subscriptions.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress size={24} sx={{ color: liquidGlassTokens.neon.cyan }} />
      </Box>
    );
  }

  // If no capabilities with operations, show error
  if (!capabilityInfo) {
    return (
      <Alert
        severity="warning"
        sx={{
          backgroundColor: `${liquidGlassTokens.neon.amber}10`,
          border: `1px solid ${liquidGlassTokens.neon.amber}30`,
          color: liquidGlassTokens.neon.amber,
          fontSize: '0.8rem',
        }}
      >
        This plugin does not declare any capabilities with operations.
      </Alert>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Description */}
      {capabilityInfo.description && (
        <Typography
          variant="caption"
          sx={{
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            mb: 2,
            display: 'block',
          }}
        >
          {capabilityInfo.description}
        </Typography>
      )}

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Chip
          size="small"
          icon={<LiveIcon sx={{ fontSize: 14 }} />}
          label={`${sources.length} Available`}
          sx={{
            backgroundColor: `${liquidGlassTokens.neon.cyan}15`,
            color: liquidGlassTokens.neon.cyan,
            fontSize: '0.7rem',
            height: 24,
          }}
        />
        <Chip
          size="small"
          icon={<ActiveIcon sx={{ fontSize: 14 }} />}
          label={`${subscriptions.length} Active`}
          sx={{
            backgroundColor: `${liquidGlassTokens.neon.success}15`,
            color: liquidGlassTokens.neon.success,
            fontSize: '0.7rem',
            height: 24,
          }}
        />
      </Box>

      {/* Search */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          InputProps={{
            startAdornment: (
              <SearchIcon
                sx={{
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  mr: 1,
                  fontSize: 18,
                }}
              />
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: `${liquidGlassTokens.radius.sm}px`,
              '& fieldset': {
                borderColor: 'rgba(255, 255, 255, 0.1)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(255, 255, 255, 0.2)',
              },
              '&.Mui-focused': {
                background: `${liquidGlassTokens.neon.cyan}08`,
                '& fieldset': {
                  borderColor: liquidGlassTokens.neon.cyan,
                },
              },
            },
            '& .MuiInputBase-input': {
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: '13px',
              '&::placeholder': {
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              },
            },
          }}
        />
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'rgba(255, 255, 255, 0.1)', mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              textTransform: 'none',
              fontSize: '0.8rem',
              minHeight: 40,
              py: 0,
              '&.Mui-selected': {
                color: liquidGlassTokens.neon.cyan,
              },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: liquidGlassTokens.neon.cyan,
            },
          }}
        >
          <Tab label="Available" />
          <Tab label="Subscribed" />
        </Tabs>
      </Box>

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 2,
            backgroundColor: `${liquidGlassTokens.neon.error}10`,
            border: `1px solid ${liquidGlassTokens.neon.error}30`,
            color: liquidGlassTokens.neon.error,
            fontSize: '0.8rem',
          }}
        >
          {error}
        </Alert>
      )}

      {/* Items List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {filteredItems.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography
              variant="body2"
              sx={{ color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` }}
            >
              {searchQuery
                ? 'No matching items'
                : activeTab === 0
                ? 'No items available'
                : 'No active subscriptions'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filteredItems.map((item: any) => {
              const subscribed = isSubscribed(item);
              const subscription = getSubscription(item);
              const isEnabled = subscription?.enabled ?? true;
              const isRecording = subscription?.recording_status === 'recording' ||
                subscription?.is_currently_recording;

              return (
                <Box
                  key={item.stream_id || item.device_id || item.source_id}
                  sx={{
                    p: 1.5,
                    background: isRecording
                      ? `${liquidGlassTokens.neon.magenta}10`
                      : subscribed
                      ? `${liquidGlassTokens.neon.success}08`
                      : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${
                      isRecording
                        ? `${liquidGlassTokens.neon.magenta}30`
                        : subscribed
                        ? `${liquidGlassTokens.neon.success}20`
                        : 'rgba(255, 255, 255, 0.08)'
                    }`,
                    borderRadius: `${liquidGlassTokens.radius.sm}px`,
                  }}
                >
                  {/* Header */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: 'rgba(255, 255, 255, 0.9)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '13px',
                        }}
                      >
                        {item.name || item.stream_name || item.device_name || 'Unnamed'}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                          fontSize: '0.7rem',
                        }}
                      >
                        {item.symbol || item.stream_id?.slice(0, 12) || item.device_id?.slice(0, 12)}...
                      </Typography>
                    </Box>
                    {item.is_currently_live && (
                      <Chip
                        size="small"
                        icon={<LiveIcon sx={{ fontSize: 12 }} />}
                        label="LIVE"
                        sx={{
                          backgroundColor: `${liquidGlassTokens.neon.error}20`,
                          color: liquidGlassTokens.neon.error,
                          fontSize: '0.6rem',
                          height: 18,
                        }}
                      />
                    )}
                    {isRecording && (
                      <Chip
                        size="small"
                        label="REC"
                        sx={{
                          backgroundColor: `${liquidGlassTokens.neon.magenta}20`,
                          color: liquidGlassTokens.neon.magenta,
                          fontSize: '0.6rem',
                          height: 18,
                        }}
                      />
                    )}
                  </Box>

                  {/* Stats row */}
                  {(item.num_participants !== undefined || item.market_cap !== undefined) && (
                    <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                      {item.num_participants !== undefined && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                            fontSize: '0.7rem',
                          }}
                        >
                          {item.num_participants.toLocaleString()} participants
                        </Typography>
                      )}
                      {item.market_cap !== undefined && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                            fontSize: '0.7rem',
                          }}
                        >
                          ${(item.market_cap / 1000000).toFixed(1)}M cap
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Actions */}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {subscribed ? (
                      <>
                        <Button
                          variant={isEnabled ? 'contained' : 'outlined'}
                          size="small"
                          onClick={() => executeOperation(
                            isEnabled ? 'disable' : 'enable',
                            { [item.stream_id ? 'collection_id' : 'device_id']: item.stream_id || item.device_id }
                          )}
                          sx={{
                            flex: 1,
                            fontSize: '0.7rem',
                            py: 0.5,
                            minHeight: 28,
                            ...(isEnabled
                              ? {
                                  backgroundColor: `${liquidGlassTokens.neon.success}20`,
                                  color: liquidGlassTokens.neon.success,
                                  borderColor: `${liquidGlassTokens.neon.success}40`,
                                }
                              : {
                                  color: 'rgba(255, 255, 255, 0.5)',
                                  borderColor: 'rgba(255, 255, 255, 0.2)',
                                }),
                          }}
                        >
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          onClick={() => handleUnsubscribe(item)}
                          startIcon={<DeleteIcon sx={{ fontSize: 14 }} />}
                          sx={{
                            flex: 1,
                            fontSize: '0.7rem',
                            py: 0.5,
                            minHeight: 28,
                          }}
                        >
                          Remove
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleSubscribe(item)}
                        disabled={!item.is_currently_live}
                        startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                        fullWidth
                        sx={{
                          fontSize: '0.7rem',
                          py: 0.5,
                          minHeight: 28,
                          backgroundColor: item.is_currently_live
                            ? `${liquidGlassTokens.neon.cyan}20`
                            : 'rgba(255, 255, 255, 0.05)',
                          color: item.is_currently_live
                            ? liquidGlassTokens.neon.cyan
                            : 'rgba(255, 255, 255, 0.3)',
                          borderColor: item.is_currently_live
                            ? `${liquidGlassTokens.neon.cyan}40`
                            : 'transparent',
                        }}
                      >
                        {item.is_currently_live ? 'Subscribe' : 'Offline'}
                      </Button>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default PluginOperationsPanel;
