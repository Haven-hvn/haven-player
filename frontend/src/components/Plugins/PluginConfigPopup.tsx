import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  ClickAwayListener,
  Fade,
  Dialog,
} from '@mui/material';
import {
  Close as CloseIcon,
  Extension as PluginIcon,
} from '@mui/icons-material';
import { PluginMetadata, PluginHealth } from '@/types/plugin';
import PluginCard from './PluginCard';
import { PluginConfigurationModal } from './PluginConfigurationModal';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';

interface PluginConfigPopupProps {
  open: boolean;
  plugin: PluginMetadata | null;
  health: PluginHealth | undefined;
  onClose: () => void;
  onLoadPlugin: (plugin: PluginMetadata) => void;
  onUnloadPlugin: (plugin: PluginMetadata) => void;
  onRestartPlugin: (plugin: PluginMetadata) => void;
  onViewSources: (plugin: PluginMetadata) => void;
  onConfigSaved: () => void;
}

const PluginConfigPopup: React.FC<PluginConfigPopupProps> = ({
  open,
  plugin,
  health,
  onClose,
  onLoadPlugin,
  onUnloadPlugin,
  onRestartPlugin,
  onViewSources,
  onConfigSaved,
}) => {
  const [configModalOpen, setConfigModalOpen] = useState(false);

  // Reset config modal state when popup closes
  useEffect(() => {
    if (!open) {
      setConfigModalOpen(false);
    }
  }, [open]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open && !configModalOpen) {
        onClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, configModalOpen]);

  const handleConfigure = () => {
    setConfigModalOpen(true);
  };

  const handleConfigSave = () => {
    setConfigModalOpen(false);
    onConfigSaved();
  };

  if (!open || !plugin) {
    return null;
  }

  return (
    <>
      <ClickAwayListener onClickAway={onClose}>
        <Fade in={open} timeout={200}>
          <Box
            sx={{
              position: 'absolute',
              left: 80,
              top: 80,
              width: 420,
              maxHeight: 600,
              background: liquidGlassTokens.glass.fill,
              backdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
              WebkitBackdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
              border: `1px solid ${liquidGlassTokens.glass.border}`,
              borderRadius: liquidGlassTokens.radius.lg,
              boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.5), 0 12px 48px rgba(0, 0, 0, 0.5), 0 0 24px rgba(0, 245, 255, 0.1)`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              zIndex: 1001,
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
                  {plugin.name}
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
                p: 2,
              }}
            >
              <PluginCard
                plugin={plugin}
                health={health}
                mode="single"
                onLoad={() => onLoadPlugin(plugin)}
                onUnload={() => onUnloadPlugin(plugin)}
                onRestart={() => onRestartPlugin(plugin)}
                onConfigure={handleConfigure}
                onViewSources={() => onViewSources(plugin)}
              />
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
                ESC to close
              </Typography>
            </Box>
          </Box>
        </Fade>
      </ClickAwayListener>

      {/* Configuration Modal */}
      {plugin && (
        <PluginConfigurationModal
          open={configModalOpen}
          pluginName={plugin.name}
          pluginDisplayName={plugin.name}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleConfigSave}
        />
      )}
    </>
  );
};

export default PluginConfigPopup;