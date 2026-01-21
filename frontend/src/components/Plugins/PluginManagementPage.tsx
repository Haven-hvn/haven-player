import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  Extension as PluginIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  CloudDownload as DiscoverIcon,
  Settings as SettingsIcon,
  Visibility as ViewSourcesIcon,
  PlayArrow as LoadIcon,
  Stop as UnloadIcon,
  RestartAlt as RestartIcon,
  CheckCircle as HealthyIcon,
  Error as ErrorIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { usePlugins, usePluginHealth } from '@/hooks/usePlugins';
import { PluginMetadata, PluginHealth } from '@/types/plugin';
import { PluginConfigurationModal } from './PluginConfigurationModal';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';

// Glass panel styles for Liquid Glass design
const glassPanelStyles = {
  background: liquidGlassTokens.glass.fill,
  backdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
  WebkitBackdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
  border: `1px solid ${liquidGlassTokens.glass.border}`,
  borderRadius: liquidGlassTokens.radius.lg,
  boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.5), 0 8px 32px rgba(0, 0, 0, 0.4)`,
};

// Glass card styles
const glassCardStyles = {
  ...glassPanelStyles,
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

// Glass input styles
const glassInputStyles = {
  '& .MuiOutlinedInput-root': {
    borderRadius: liquidGlassTokens.radius.sm,
    background: 'rgba(255, 255, 255, 0.03)',
    '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
    '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
    '&.Mui-focused': {
      background: `${liquidGlassTokens.neon.cyan}08`,
      '& fieldset': { borderColor: liquidGlassTokens.neon.cyan, borderWidth: 1 },
    },
  },
  '& .MuiInputBase-input': { color: 'rgba(255, 255, 255, 0.9)' },
  '& .MuiInputBase-input::placeholder': { color: 'rgba(255, 255, 255, 0.4)' },
};

const PluginCard: React.FC<{
  plugin: PluginMetadata;
  health: PluginHealth | undefined;
  onLoad: () => void;
  onUnload: () => void;
  onRestart: () => void;
  onConfigure: () => void;
  onViewSources: () => void;
}> = ({ plugin, health, onLoad, onUnload, onRestart, onConfigure, onViewSources }) => {
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

  return (
    <Card sx={{ ...glassCardStyles, height: '100%', display: 'flex', flexDirection: 'column', border: plugin.loaded ? `1px solid ${liquidGlassTokens.neon.success}40` : `1px solid ${liquidGlassTokens.glass.border}` }}>
      <CardContent sx={{ flexGrow: 1, p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: liquidGlassTokens.radius.sm, background: plugin.loaded ? `${liquidGlassTokens.neon.success}20` : 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: plugin.loaded ? `0 0 12px ${liquidGlassTokens.neon.success}30` : 'none' }}>
              <PluginIcon sx={{ fontSize: 22, color: plugin.loaded ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.4)' }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>{plugin.name}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>v{plugin.version}</Typography>
            </Box>
          </Box>
          <Tooltip title={health?.healthy ? 'Healthy' : health ? 'Error' : 'Not loaded'}>
            <Chip icon={getStatusIcon()} label={plugin.loaded ? (health?.healthy ? 'Active' : 'Error') : 'Inactive'} size="small" sx={{ backgroundColor: getStatusBgColor(), color: getStatusColor(), border: `1px solid ${getStatusColor()}40`, '& .MuiChip-label': { fontWeight: 500 } }} />
          </Tooltip>
        </Box>

        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', mb: 2, minHeight: 48 }}>{plugin.description}</Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
          {(plugin.media_types || []).map((type) => (
            <Chip key={type} label={type?.toUpperCase() || 'UNKNOWN'} size="small" sx={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'rgba(255, 255, 255, 0.7)', border: `1px solid ${liquidGlassTokens.glass.border}`, fontSize: '0.65rem', fontWeight: 500 }} />
          ))}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, pt: 2, borderTop: `1px solid ${liquidGlassTokens.glass.border}` }}>
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.4)' }}>Priority: {plugin.priority ?? 0}</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</Typography>
          <Typography variant="caption" sx={{ color: plugin.enabled ?? true ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.4)' }}>{plugin.enabled ?? true ? 'Enabled' : 'Disabled'}</Typography>
        </Box>
      </CardContent>

      <Box sx={{ p: 2, borderTop: `1px solid ${liquidGlassTokens.glass.border}`, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {plugin.loaded ? (
          <>
            <Button size="small" variant="outlined" startIcon={<ViewSourcesIcon />} onClick={onViewSources} sx={{ ...glassButtonStyles.secondary, flexGrow: 1, fontSize: '0.75rem' }}>Sources</Button>
            <Button size="small" variant="outlined" startIcon={<SettingsIcon />} onClick={onConfigure} sx={{ ...glassButtonStyles.secondary, flexGrow: 1, fontSize: '0.75rem' }}>Configure</Button>
            <Tooltip title="Restart Plugin"><IconButton size="small" onClick={onRestart} sx={{ color: liquidGlassTokens.neon.cyan, '&:hover': { backgroundColor: `${liquidGlassTokens.neon.cyan}15` } }}><RestartIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Unload Plugin"><IconButton size="small" onClick={onUnload} sx={{ color: liquidGlassTokens.neon.error, '&:hover': { backgroundColor: `${liquidGlassTokens.neon.error}15` } }}><UnloadIcon fontSize="small" /></IconButton></Tooltip>
          </>
        ) : (
          <Button size="small" variant="contained" startIcon={<LoadIcon />} onClick={onLoad} fullWidth sx={{ ...glassButtonStyles.primary, fontSize: '0.75rem' }}>Load Plugin</Button>
        )}
      </Box>
    </Card>
  );
};

const PluginManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { plugins, loading, error, refreshPlugins, discoverPlugins, loadPlugin, unloadPlugin, restartPlugin } = usePlugins();
  const { healthStatus } = usePluginHealth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlugin, setSelectedPlugin] = useState<PluginMetadata | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [discoverDialogOpen, setDiscoverDialogOpen] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<{ success: boolean; message: string; discovered: string[] } | null>(null);
  const [notification, setNotification] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }>({ open: false, message: '', severity: 'info' });

  const filteredPlugins = plugins.filter((plugin) => (plugin.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || (plugin.description?.toLowerCase() || '').includes(searchQuery.toLowerCase()));
  const getHealthForPlugin = (pluginName: string) => healthStatus.find((h) => h.plugin_name === pluginName);

  const handleLoadPlugin = async (plugin: PluginMetadata) => {
    const result = await loadPlugin(plugin.name);
    setNotification(result.success ? { open: true, message: `Successfully loaded ${plugin.name}`, severity: 'success' } : { open: true, message: `Failed to load ${plugin.name}: ${result.error}`, severity: 'error' });
  };

  const handleUnloadPlugin = async (plugin: PluginMetadata) => {
    const result = await unloadPlugin(plugin.name);
    setNotification(result.success ? { open: true, message: `Successfully unloaded ${plugin.name}`, severity: 'success' } : { open: true, message: `Failed to unload ${plugin.name}: ${result.error}`, severity: 'error' });
  };

  const handleRestartPlugin = async (plugin: PluginMetadata) => {
    const result = await restartPlugin(plugin.name);
    setNotification(result.success ? { open: true, message: `Successfully restarted ${plugin.name}`, severity: 'success' } : { open: true, message: `Failed to restart ${plugin.name}: ${result.error}`, severity: 'error' });
  };

  const handleDiscoverPlugins = async () => {
    const result = await discoverPlugins();
    setDiscoverResult(result);
    setNotification(result.success ? { open: true, message: `Discovered ${result.discovered.length} new plugin(s)`, severity: 'success' } : { open: true, message: result.message, severity: 'error' });
  };

  const handleConfigurePlugin = (plugin: PluginMetadata) => { setSelectedPlugin(plugin); setConfigDialogOpen(true); };
  const handleViewSources = (plugin: PluginMetadata) => { navigate(`/plugins/${encodeURIComponent(plugin.name)}/sources`); };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, color: '#fff', letterSpacing: '-0.02em' }}>Plugins</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>Manage media archiver plugins and configurations</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<DiscoverIcon />} onClick={() => setDiscoverDialogOpen(true)} sx={glassButtonStyles.primary}>Discover Plugins</Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refreshPlugins} disabled={loading} sx={glassButtonStyles.secondary}>Refresh</Button>
        </Box>
      </Box>

      {/* Search Bar */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Box sx={{ flexGrow: 1, position: 'relative' }}>
          <SearchIcon sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255, 255, 255, 0.4)', zIndex: 1 }} />
          <TextField fullWidth placeholder="Search plugins..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} size="small" sx={{ ...glassInputStyles, '& .MuiOutlinedInput-input': { pl: 5 } }} />
        </Box>
      </Box>

      {/* Error Alert */}
      {error && <Alert severity="error" sx={{ mb: 3, backgroundColor: `${liquidGlassTokens.neon.error}10`, border: `1px solid ${liquidGlassTokens.neon.error}30`, color: liquidGlassTokens.neon.error }} onClose={() => setNotification({ ...notification, open: false })}>{error}</Alert>}

      {/* Statistics */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Card sx={{ ...glassPanelStyles, p: 3 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>Total Plugins</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5, color: '#fff' }}>{plugins.length}</Typography>
          </Card>
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Card sx={{ ...glassPanelStyles, p: 3, background: `${liquidGlassTokens.neon.success}08`, border: `1px solid ${liquidGlassTokens.neon.success}30` }}>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>Active Plugins</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5, color: liquidGlassTokens.neon.success }}>{plugins.filter((p) => p.loaded).length}</Typography>
          </Card>
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Card sx={{ ...glassPanelStyles, p: 3, background: `${liquidGlassTokens.neon.error}08`, border: `1px solid ${liquidGlassTokens.neon.error}30` }}>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>Unhealthy Plugins</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5, color: liquidGlassTokens.neon.error }}>{healthStatus.filter((h) => !h.healthy).length}</Typography>
          </Card>
        </Box>
      </Box>

      {/* Plugin Cards Grid */}
      {loading && plugins.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1, minHeight: 400 }}><CircularProgress sx={{ color: liquidGlassTokens.neon.cyan }} /></Box>
      ) : filteredPlugins.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <PluginIcon sx={{ fontSize: 64, color: 'rgba(255, 255, 255, 0.2)', mb: 2 }} />
          <Typography variant="h6" sx={{ color: 'rgba(255, 255, 255, 0.5)' }} gutterBottom>No plugins found</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.4)', mb: 3 }}>{searchQuery ? 'Try adjusting your search query' : 'Click "Discover Plugins" to find available plugins'}</Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {filteredPlugins.map((plugin) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={plugin.name}>
              <PluginCard plugin={plugin} health={getHealthForPlugin(plugin.name)} onLoad={() => handleLoadPlugin(plugin)} onUnload={() => handleUnloadPlugin(plugin)} onRestart={() => handleRestartPlugin(plugin)} onConfigure={() => handleConfigurePlugin(plugin)} onViewSources={() => handleViewSources(plugin)} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Discover Plugins Dialog */}
      <Dialog open={discoverDialogOpen} onClose={() => setDiscoverDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { ...glassPanelStyles, backgroundColor: liquidGlassTokens.canvas.base } }} BackdropProps={{ sx: { backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' } }}>
        <DialogTitle sx={{ color: '#fff', borderBottom: `1px solid ${liquidGlassTokens.glass.border}` }}>Discover Plugins</DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', mb: 3 }}>Scan plugin directories for new archiver plugins. This will search in the built-in plugins directory and any external plugin directories configured in the backend.</Typography>
          {!discoverResult ? (
            <Button variant="contained" onClick={handleDiscoverPlugins} disabled={loading} fullWidth startIcon={<DiscoverIcon />} sx={glassButtonStyles.primary}>{loading ? <CircularProgress size={20} color="inherit" /> : 'Start Discovery'}</Button>
          ) : (
            <Alert severity={discoverResult.success ? 'success' : 'error'} sx={{ backgroundColor: discoverResult.success ? `${liquidGlassTokens.neon.success}10` : `${liquidGlassTokens.neon.error}10`, border: `1px solid ${discoverResult.success ? liquidGlassTokens.neon.success : liquidGlassTokens.neon.error}30`, color: discoverResult.success ? liquidGlassTokens.neon.success : liquidGlassTokens.neon.error }}>
              {discoverResult.message}
              {discoverResult.discovered.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" fontWeight={600}>Discovered plugins:</Typography>
                  <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>{discoverResult.discovered.map((name) => <li key={name}>{name}</li>)}</ul>
                </Box>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${liquidGlassTokens.glass.border}`, p: 2 }}>
          <Button onClick={() => setDiscoverDialogOpen(false)} sx={glassButtonStyles.secondary}>Close</Button>
          {discoverResult && <Button onClick={handleDiscoverPlugins} disabled={loading} sx={glassButtonStyles.primary}>Scan Again</Button>}
        </DialogActions>
      </Dialog>

      {/* Configuration Modal */}
      {selectedPlugin && <PluginConfigurationModal open={configDialogOpen} pluginName={selectedPlugin.name} pluginDisplayName={selectedPlugin.name} onClose={() => setConfigDialogOpen(false)} onSave={refreshPlugins} />}

      {/* Notification */}
      {notification.open && (
        <Box sx={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999 }}>
          <Alert severity={notification.severity} onClose={() => setNotification({ ...notification, open: false })} sx={{ minWidth: 300, backgroundColor: notification.severity === 'success' ? `${liquidGlassTokens.neon.success}15` : notification.severity === 'error' ? `${liquidGlassTokens.neon.error}15` : `${liquidGlassTokens.neon.cyan}15`, border: `1px solid ${notification.severity === 'success' ? liquidGlassTokens.neon.success : notification.severity === 'error' ? liquidGlassTokens.neon.error : liquidGlassTokens.neon.cyan}40`, color: notification.severity === 'success' ? liquidGlassTokens.neon.success : notification.severity === 'error' ? liquidGlassTokens.neon.error : liquidGlassTokens.neon.cyan, backdropFilter: 'blur(12px)' }}>{notification.message}</Alert>
        </Box>
      )}
    </Box>
  );
};

export default PluginManagementPage;
