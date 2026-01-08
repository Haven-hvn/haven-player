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
  Warning as WarningIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { usePlugins, usePluginHealth } from '@/hooks/usePlugins';
import { PluginMetadata, PluginHealth } from '@/types/plugin';

const PluginCard: React.FC<{
  plugin: PluginMetadata;
  health: PluginHealth | undefined;
  onLoad: () => void;
  onUnload: () => void;
  onRestart: () => void;
  onConfigure: () => void;
  onViewSources: () => void;
}> = ({ plugin, health, onLoad, onUnload, onRestart, onConfigure, onViewSources }) => {
  const getStatusColor = () => {
    if (!plugin.loaded) return 'default';
    if (health?.healthy) return 'success';
    return 'error';
  };

  const getStatusIcon = () => {
    if (!plugin.loaded) return <SyncIcon fontSize="small" />;
    if (health?.healthy) return <HealthyIcon fontSize="small" />;
    return <ErrorIcon fontSize="small" />;
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: plugin.loaded ? '2px solid #4CAF50' : '1px solid #E0E0E0',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PluginIcon sx={{ fontSize: 28, color: plugin.loaded ? '#4CAF50' : '#9E9E9E' }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                {plugin.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                v{plugin.version}
              </Typography>
            </Box>
          </Box>
          <Tooltip title={health?.healthy ? 'Healthy' : health ? 'Error' : 'Not loaded'}>
            <Chip
              icon={getStatusIcon()}
              label={plugin.loaded ? (health?.healthy ? 'Active' : 'Error') : 'Inactive'}
              color={getStatusColor() as any}
              size="small"
              variant="outlined"
            />
          </Tooltip>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 48 }}>
          {plugin.description}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
          {plugin.media_types.map((type) => (
            <Chip
              key={type}
              label={type.toUpperCase()}
              size="small"
              sx={{
                backgroundColor: '#F5F5F5',
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
            gap: 0.5,
            mt: 2,
            pt: 2,
            borderTop: '1px solid #F0F0F0',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Priority: {plugin.priority || 0}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            •
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {plugin.enabled ? 'Enabled' : 'Disabled'}
          </Typography>
        </Box>
      </CardContent>

      <Box
        sx={{
          p: 1.5,
          borderTop: '1px solid #F0F0F0',
          display: 'flex',
          gap: 0.5,
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
              sx={{ flexGrow: 1, fontSize: '0.75rem' }}
            >
              Sources
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<SettingsIcon />}
              onClick={onConfigure}
              sx={{ flexGrow: 1, fontSize: '0.75rem' }}
            >
              Configure
            </Button>
            <Tooltip title="Restart Plugin">
              <IconButton size="small" onClick={onRestart} color="primary">
                <RestartIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Unload Plugin">
              <IconButton size="small" onClick={onUnload} color="error">
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
            sx={{ fontSize: '0.75rem' }}
          >
            Load Plugin
          </Button>
        )}
      </Box>
    </Card>
  );
};

const PluginManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { plugins, loading, error, refreshPlugins, discoverPlugins, loadPlugin, unloadPlugin, restartPlugin } =
    usePlugins();
  const { healthStatus } = usePluginHealth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlugin, setSelectedPlugin] = useState<PluginMetadata | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [discoverDialogOpen, setDiscoverDialogOpen] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<{ success: boolean; message: string; discovered: string[] } | null>(null);
  const [notification, setNotification] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const filteredPlugins = plugins.filter((plugin) =>
    plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plugin.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getHealthForPlugin = (pluginName: string) => {
    return healthStatus.find((h) => h.plugin_name === pluginName);
  };

  const handleLoadPlugin = async (plugin: PluginMetadata) => {
    const result = await loadPlugin(plugin.name);
    if (result.success) {
      setNotification({ open: true, message: `Successfully loaded ${plugin.name}`, severity: 'success' });
    } else {
      setNotification({ open: true, message: `Failed to load ${plugin.name}: ${result.error}`, severity: 'error' });
    }
  };

  const handleUnloadPlugin = async (plugin: PluginMetadata) => {
    const result = await unloadPlugin(plugin.name);
    if (result.success) {
      setNotification({ open: true, message: `Successfully unloaded ${plugin.name}`, severity: 'success' });
    } else {
      setNotification({ open: true, message: `Failed to unload ${plugin.name}: ${result.error}`, severity: 'error' });
    }
  };

  const handleRestartPlugin = async (plugin: PluginMetadata) => {
    const result = await restartPlugin(plugin.name);
    if (result.success) {
      setNotification({ open: true, message: `Successfully restarted ${plugin.name}`, severity: 'success' });
    } else {
      setNotification({ open: true, message: `Failed to restart ${plugin.name}: ${result.error}`, severity: 'error' });
    }
  };

  const handleDiscoverPlugins = async () => {
    const result = await discoverPlugins();
    setDiscoverResult(result);
    if (result.success) {
      setNotification({
        open: true,
        message: `Discovered ${result.discovered.length} new plugin(s)`,
        severity: 'success',
      });
    } else {
      setNotification({ open: true, message: result.message, severity: 'error' });
    }
  };

  const handleConfigurePlugin = (plugin: PluginMetadata) => {
    setSelectedPlugin(plugin);
    setConfigDialogOpen(true);
  };

  const handleViewSources = (plugin: PluginMetadata) => {
    navigate(`/plugins/${encodeURIComponent(plugin.name)}/sources`);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 0.5 }}>
            Plugins
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage media archiver plugins and configurations
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<DiscoverIcon />}
            onClick={() => setDiscoverDialogOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            Discover Plugins
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={refreshPlugins}
            disabled={loading}
            sx={{ textTransform: 'none' }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Search Bar */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Box sx={{ flexGrow: 1, position: 'relative' }}>
          <SearchIcon
            sx={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9E9E9E',
            }}
          />
          <TextField
            fullWidth
            placeholder="Search plugins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            inputProps={{
              sx: {
                pl: 4,
                py: 1,
              },
            }}
            sx={{
              backgroundColor: '#FAFAFA',
              '& .MuiOutlinedInput-root': {
                borderRadius: '8px',
                '& fieldset': {
                  borderColor: '#E0E0E0',
                },
              },
            }}
            size="small"
          />
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setNotification({ ...notification, open: false })}>
          {error}
        </Alert>
      )}

      {/* Statistics */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Card sx={{ p: 2, backgroundColor: '#F9F9F9' }}>
            <Typography variant="caption" color="text.secondary">
              Total Plugins
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5 }}>
              {plugins.length}
            </Typography>
          </Card>
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Card sx={{ p: 2, backgroundColor: '#F0FDF4' }}>
            <Typography variant="caption" color="text.secondary">
              Active Plugins
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5, color: '#16A34A' }}>
              {plugins.filter((p) => p.loaded).length}
            </Typography>
          </Card>
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Card sx={{ p: 2, backgroundColor: '#FEF2F2' }}>
            <Typography variant="caption" color="text.secondary">
              Unhealthy Plugins
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5, color: '#DC2626' }}>
              {healthStatus.filter((h) => !h.healthy).length}
            </Typography>
          </Card>
        </Box>
      </Box>

      {/* Plugin Cards Grid */}
      {loading && plugins.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1, minHeight: 400 }}>
          <CircularProgress />
        </Box>
      ) : filteredPlugins.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <PluginIcon sx={{ fontSize: 64, color: '#E0E0E0', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No plugins found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {searchQuery ? 'Try adjusting your search query' : 'Click "Discover Plugins" to find available plugins'}
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {filteredPlugins.map((plugin) => (
            <Grid item xs={12} sm={6} md={4} key={plugin.name}>
              <PluginCard
                plugin={plugin}
                health={getHealthForPlugin(plugin.name)}
                onLoad={() => handleLoadPlugin(plugin)}
                onUnload={() => handleUnloadPlugin(plugin)}
                onRestart={() => handleRestartPlugin(plugin)}
                onConfigure={() => handleConfigurePlugin(plugin)}
                onViewSources={() => handleViewSources(plugin)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Discover Plugins Dialog */}
      <Dialog open={discoverDialogOpen} onClose={() => setDiscoverDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Discover Plugins</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Scan plugin directories for new archiver plugins. This will search in the built-in plugins directory
            and any external plugin directories configured in the backend.
          </Typography>
          {!discoverResult ? (
            <Button
              variant="contained"
              onClick={handleDiscoverPlugins}
              disabled={loading}
              fullWidth
              startIcon={<DiscoverIcon />}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Start Discovery'}
            </Button>
          ) : (
            <Alert severity={discoverResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
              {discoverResult.message}
              {discoverResult.discovered.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" fontWeight={600}>
                    Discovered plugins:
                  </Typography>
                  <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                    {discoverResult.discovered.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </Box>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscoverDialogOpen(false)}>
            Close
          </Button>
          {discoverResult && (
            <Button onClick={handleDiscoverPlugins} variant="outlined" disabled={loading}>
              Scan Again
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Notification */}
      {notification.open && (
        <Box sx={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999 }}>
          <Alert
            severity={notification.severity}
            onClose={() => setNotification({ ...notification, open: false })}
            sx={{ minWidth: 300 }}
          >
            {notification.message}
          </Alert>
        </Box>
      )}
    </Box>
  );
};

export default PluginManagementPage;
