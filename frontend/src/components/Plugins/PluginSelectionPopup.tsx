import React, { useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Popover,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  Extension as PluginIcon,
} from '@mui/icons-material';
import { PluginMetadata, PluginHealth } from '@/types/plugin';
import PluginCard from './PluginCard';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';

interface PluginSelectionPopupProps {
  open: boolean;
  plugins: PluginMetadata[];
  healthStatus: PluginHealth[];
  loading: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onPluginSelect: (plugin: PluginMetadata) => void;
  onLoadPlugin: (plugin: PluginMetadata) => void;
  onUnloadPlugin: (plugin: PluginMetadata) => void;
  onRestartPlugin: (plugin: PluginMetadata) => void;
}

const PluginSelectionPopup: React.FC<PluginSelectionPopupProps> = ({
  open,
  plugins,
  healthStatus,
  loading,
  anchorEl,
  onClose,
  onPluginSelect,
  onLoadPlugin,
  onUnloadPlugin,
  onRestartPlugin,
}) => {
  // Get health for a specific plugin
  const getHealthForPlugin = (pluginName: string) => {
    return healthStatus.find((h) => h.plugin_name === pluginName);
  };

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        onClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
      transformOrigin={{
        vertical: 'bottom',
        horizontal: 'left',
      }}
      PaperProps={{
        sx: {
          width: 400,
          maxHeight: 500,
          background: liquidGlassTokens.glass.fill,
          backdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
          WebkitBackdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
          border: `1px solid ${liquidGlassTokens.glass.border}`,
          borderRadius: liquidGlassTokens.radius.lg,
          boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.5), 0 12px 48px rgba(0, 0, 0, 0.5), 0 0 24px rgba(0, 245, 255, 0.1)`,
          overflow: 'hidden',
          mt: -1,
          ml: 1,
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          maxHeight: 500,
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 2,
            borderBottom: `1px solid ${liquidGlassTokens.glass.border}`,
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <PluginIcon
                sx={{
                  color: liquidGlassTokens.neon.cyan,
                  fontSize: 20,
                  filter: `drop-shadow(0 0 4px ${liquidGlassTokens.neon.cyan})`,
                }}
              />
              <Typography
                sx={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.95)',
                }}
              >
                Plugins
              </Typography>
              <Typography
                sx={{
                  fontSize: '12px',
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                }}
              >
                ({plugins.length})
              </Typography>
            </Box>
          <IconButton
            size="small"
            onClick={onClose}
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              '&:hover': {
                color: 'rgba(255, 255, 255, 0.9)',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
              },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Content */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 1,
            minHeight: 0,
          }}
        >
            {loading ? (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  py: 8,
                }}
              >
                <CircularProgress size={24} sx={{ color: liquidGlassTokens.neon.cyan }} />
              </Box>
            ) : plugins.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 8,
                  px: 2,
                }}
              >
                <PluginIcon
                  sx={{
                    fontSize: 48,
                    color: 'rgba(255, 255, 255, 0.2)',
                    mb: 2,
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{ color: 'rgba(255, 255, 255, 0.5)' }}
                >
                  No plugins available
                </Typography>
              </Box>
            ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {plugins.map((plugin) => (
                <PluginCard
                  key={plugin.name}
                  plugin={plugin}
                  health={getHealthForPlugin(plugin.name)}
                  mode="list"
                  onLoad={() => onLoadPlugin(plugin)}
                  onUnload={() => onUnloadPlugin(plugin)}
                  onRestart={() => onRestartPlugin(plugin)}
                  onConfigure={() => onPluginSelect(plugin)}
                  onViewSources={() => onPluginSelect(plugin)}
                />
              ))}
            </Box>
          )}
        </Box>

        {/* Footer hint */}
        <Box
          sx={{
            p: 1.5,
            borderTop: `1px solid ${liquidGlassTokens.glass.border}`,
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              fontSize: '11px',
              textAlign: 'center',
              display: 'block',
            }}
          >
            Click to configure • ESC to close
          </Typography>
        </Box>
      </Box>
    </Popover>
  );
};

export default PluginSelectionPopup;