import React from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Extension as PluginIcon,
  Visibility as ViewSourcesIcon,
  PlayArrow as LoadIcon,
  Stop as UnloadIcon,
  RestartAlt as RestartIcon,
  Settings as SettingsIcon,
  CheckCircle as HealthyIcon,
  Error as ErrorIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { PluginMetadata, PluginHealth } from '@/types/plugin';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';

// Glass card styles
const glassCardStyles = {
  background: liquidGlassTokens.glass.fill,
  backdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
  WebkitBackdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
  border: `1px solid ${liquidGlassTokens.glass.border}`,
  borderRadius: liquidGlassTokens.radius.lg,
  boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.5), 0 8px 32px rgba(0, 0, 0, 0.4)`,
  transition: `all ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
  '&:hover': {
    background: liquidGlassTokens.glass.fillHover,
    transform: 'translateY(-2px)',
    boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.5), 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 245, 255, 0.1)`,
  },
};

// Glass button styles
const glassButtonStyles = {
  primary: {
    background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}25 0%, ${liquidGlassTokens.neon.cyan}15 100%)`,
    border: `1px solid ${liquidGlassTokens.neon.cyan}50`,
    color: liquidGlassTokens.neon.cyan,
    borderRadius: liquidGlassTokens.radius.sm,
    textTransform: 'none',
    transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
    '&:hover': {
      background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}35 0%, ${liquidGlassTokens.neon.cyan}20 100%)`,
      boxShadow: glowEffects.cyan(0.25),
    },
    '&:disabled': {
      background: 'rgba(255, 255, 255, 0.05)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      color: 'rgba(255, 255, 255, 0.3)',
    },
  },
  secondary: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${liquidGlassTokens.glass.border}`,
    color: 'rgba(255, 255, 255, 0.7)',
    borderRadius: liquidGlassTokens.radius.sm,
    textTransform: 'none',
    transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
    '&:hover': {
      background: 'rgba(255, 255, 255, 0.1)',
      color: '#fff',
    },
  },
};

export type PluginCardMode = 'list' | 'single' | 'grid';

interface PluginCardProps {
  plugin: PluginMetadata;
  health: PluginHealth | undefined;
  mode: PluginCardMode;
  onLoad: () => void;
  onUnload: () => void;
  onRestart: () => void;
  onConfigure: () => void;
  onViewSources: () => void;
}

const PluginCard: React.FC<PluginCardProps> = ({
  plugin,
  health,
  mode,
  onLoad,
  onUnload,
  onRestart,
  onConfigure,
  onViewSources,
}) => {
  const getStatusColor = (): string => {
    if (!plugin.loaded) return 'rgba(255, 255, 255, 0.3)';
    if (health?.healthy) return liquidGlassTokens.neon.success;
    return liquidGlassTokens.neon.error;
  };

  const getStatusBgColor = (): string => {
    if (!plugin.loaded) return 'rgba(255, 255, 255, 0.05)';
    if (health?.healthy) return `${liquidGlassTokens.neon.success}15`;
    return `${liquidGlassTokens.neon.error}15`;
  };

  const getStatusIcon = () => {
    if (!plugin.loaded) return <SyncIcon fontSize="small" sx={{ color: 'rgba(255, 255, 255, 0.4)' }} />;
    if (health?.healthy) return <HealthyIcon fontSize="small" sx={{ color: liquidGlassTokens.neon.success }} />;
    return <ErrorIcon fontSize="small" sx={{ color: liquidGlassTokens.neon.error }} />;
  };

  // List mode - compact horizontal layout
  if (mode === 'list') {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          p: 2,
          background: 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${plugin.loaded ? `${liquidGlassTokens.neon.success}40` : liquidGlassTokens.glass.border}`,
          borderRadius: liquidGlassTokens.radius.sm,
          cursor: 'pointer',
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
          '&:hover': {
            background: 'rgba(255, 255, 255, 0.06)',
            borderColor: liquidGlassTokens.neon.cyan,
          },
        }}
        onClick={onConfigure}
      >
        {/* Icon */}
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: liquidGlassTokens.radius.sm,
            background: plugin.loaded ? `${liquidGlassTokens.neon.success}20` : 'rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <PluginIcon sx={{ fontSize: 20, color: plugin.loaded ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.4)' }} />
        </Box>

        {/* Name and version */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>
            {plugin.name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
            v{plugin.version}
          </Typography>
        </Box>

        {/* Status */}
        <Tooltip title={health?.healthy ? 'Healthy' : health ? 'Error' : 'Not loaded'}>
          <Chip
            icon={getStatusIcon()}
            label={plugin.loaded ? (health?.healthy ? 'Active' : 'Error') : 'Inactive'}
            size="small"
            sx={{
              backgroundColor: getStatusBgColor(),
              color: getStatusColor(),
              border: `1px solid ${getStatusColor()}40`,
              '& .MuiChip-label': { fontWeight: 500 },
            }}
          />
        </Tooltip>
      </Box>
    );
  }

  // Single mode - full card with all controls
  if (mode === 'single') {
    return (
      <Card
        sx={{
          ...glassCardStyles,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          border: plugin.loaded ? `1px solid ${liquidGlassTokens.neon.success}40` : `1px solid ${liquidGlassTokens.glass.border}`,
        }}
      >
        <CardContent sx={{ flexGrow: 1, p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: liquidGlassTokens.radius.sm,
                  background: plugin.loaded ? `${liquidGlassTokens.neon.success}20` : 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: plugin.loaded ? `0 0 12px ${liquidGlassTokens.neon.success}30` : 'none',
                }}
              >
                <PluginIcon sx={{ fontSize: 26, color: plugin.loaded ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.4)' }} />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 600, fontSize: '1.25rem', color: '#fff' }}>
                  {plugin.name}
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                  v{plugin.version}
                </Typography>
              </Box>
            </Box>
            <Tooltip title={health?.healthy ? 'Healthy' : health ? 'Error' : 'Not loaded'}>
              <Chip
                icon={getStatusIcon()}
                label={plugin.loaded ? (health?.healthy ? 'Active' : 'Error') : 'Inactive'}
                size="small"
                sx={{
                  backgroundColor: getStatusBgColor(),
                  color: getStatusColor(),
                  border: `1px solid ${getStatusColor()}40`,
                  '& .MuiChip-label': { fontWeight: 500 },
                }}
              />
            </Tooltip>
          </Box>

          <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 3 }}>
            {plugin.description}
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 3 }}>
            {(plugin.media_types || []).map((type) => (
              <Chip
                key={type}
                label={type?.toUpperCase() || 'UNKNOWN'}
                size="small"
                sx={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: 'rgba(255, 255, 255, 0.7)',
                  border: `1px solid ${liquidGlassTokens.glass.border}`,
                  fontSize: '0.7rem',
                  fontWeight: 500,
                }}
              />
            ))}
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              pt: 2,
              borderTop: `1px solid ${liquidGlassTokens.glass.border}`,
            }}
          >
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.4)' }}>
              Priority: {plugin.priority ?? 0}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.2)' }}>
              •
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: plugin.enabled ?? true ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.4)' }}
            >
              {plugin.enabled ?? true ? 'Enabled' : 'Disabled'}
            </Typography>
          </Box>
        </CardContent>

        <Box
          sx={{
            p: 2,
            borderTop: `1px solid ${liquidGlassTokens.glass.border}`,
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          {plugin.loaded ? (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ViewSourcesIcon />}
                onClick={onViewSources}
                sx={{ ...glassButtonStyles.secondary, flexGrow: 1, fontSize: '0.8rem' }}
              >
                Sources
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SettingsIcon />}
                onClick={onConfigure}
                sx={{ ...glassButtonStyles.secondary, flexGrow: 1, fontSize: '0.8rem' }}
              >
                Configure
              </Button>
              <Tooltip title="Restart Plugin">
                <IconButton
                  size="small"
                  onClick={onRestart}
                  sx={{ color: liquidGlassTokens.neon.cyan, '&:hover': { backgroundColor: `${liquidGlassTokens.neon.cyan}15` } }}
                >
                  <RestartIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Unload Plugin">
                <IconButton
                  size="small"
                  onClick={onUnload}
                  sx={{ color: liquidGlassTokens.neon.error, '&:hover': { backgroundColor: `${liquidGlassTokens.neon.error}15` } }}
                >
                  <UnloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Button
              size="small"
              variant="contained"
              startIcon={<LoadIcon />}
              onClick={onLoad}
              fullWidth
              sx={{ ...glassButtonStyles.primary, fontSize: '0.8rem' }}
            >
              Load Plugin
            </Button>
          )}
        </Box>
      </Card>
    );
  }

  // Grid mode - current card layout (for backward compatibility)
  return (
    <Card
      sx={{
        ...glassCardStyles,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: plugin.loaded ? `1px solid ${liquidGlassTokens.neon.success}40` : `1px solid ${liquidGlassTokens.glass.border}`,
      }}
    >
      <CardContent sx={{ flexGrow: 1, p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: liquidGlassTokens.radius.sm,
                background: plugin.loaded ? `${liquidGlassTokens.neon.success}20` : 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: plugin.loaded ? `0 0 12px ${liquidGlassTokens.neon.success}30` : 'none',
              }}
            >
              <PluginIcon sx={{ fontSize: 22, color: plugin.loaded ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.4)' }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>
                {plugin.name}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                v{plugin.version}
              </Typography>
            </Box>
          </Box>
          <Tooltip title={health?.healthy ? 'Healthy' : health ? 'Error' : 'Not loaded'}>
            <Chip
              icon={getStatusIcon()}
              label={plugin.loaded ? (health?.healthy ? 'Active' : 'Error') : 'Inactive'}
              size="small"
              sx={{
                backgroundColor: getStatusBgColor(),
                color: getStatusColor(),
                border: `1px solid ${getStatusColor()}40`,
                '& .MuiChip-label': { fontWeight: 500 },
              }}
            />
          </Tooltip>
        </Box>

        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', mb: 2, minHeight: 48 }}>
          {plugin.description}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
          {(plugin.media_types || []).map((type) => (
            <Chip
              key={type}
              label={type?.toUpperCase() || 'UNKNOWN'}
              size="small"
              sx={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: 'rgba(255, 255, 255, 0.7)',
                border: `1px solid ${liquidGlassTokens.glass.border}`,
                fontSize: '0.65rem',
                fontWeight: 500,
              }}
            />
          ))}
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 2,
            pt: 2,
            borderTop: `1px solid ${liquidGlassTokens.glass.border}`,
          }}
        >
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.4)' }}>
            Priority: {plugin.priority ?? 0}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.2)' }}>
            •
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: plugin.enabled ?? true ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.4)' }}
          >
            {plugin.enabled ?? true ? 'Enabled' : 'Disabled'}
          </Typography>
        </Box>
      </CardContent>

      <Box
        sx={{
          p: 2,
          borderTop: `1px solid ${liquidGlassTokens.glass.border}`,
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {plugin.loaded ? (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ViewSourcesIcon />}
              onClick={onViewSources}
              sx={{ ...glassButtonStyles.secondary, flexGrow: 1, fontSize: '0.75rem' }}
            >
              Sources
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<SettingsIcon />}
              onClick={onConfigure}
              sx={{ ...glassButtonStyles.secondary, flexGrow: 1, fontSize: '0.75rem' }}
            >
              Configure
            </Button>
            <Tooltip title="Restart Plugin">
              <IconButton
                size="small"
                onClick={onRestart}
                sx={{ color: liquidGlassTokens.neon.cyan, '&:hover': { backgroundColor: `${liquidGlassTokens.neon.cyan}15` } }}
              >
                <RestartIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Unload Plugin">
              <IconButton
                size="small"
                onClick={onUnload}
                sx={{ color: liquidGlassTokens.neon.error, '&:hover': { backgroundColor: `${liquidGlassTokens.neon.error}15` } }}
              >
                <UnloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <Button
            size="small"
            variant="contained"
            startIcon={<LoadIcon />}
            onClick={onLoad}
            fullWidth
            sx={{ ...glassButtonStyles.primary, fontSize: '0.75rem' }}
          >
            Load Plugin
          </Button>
        )}
      </Box>
    </Card>
  );
};

export default PluginCard;