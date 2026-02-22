import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, FormControlLabel, Switch,
  Select, MenuItem, FormControl, InputLabel,
  Box, Typography, Alert, Divider, Grid,
  CircularProgress, IconButton, Tooltip, Chip,
  Tabs, Tab, Paper, Breadcrumbs,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Schedule as ScheduleIcon,
  Build as BuildIcon,
  YouTube as YouTubeBrandIcon,
  CloudDownload as TorrentBrandIcon,
  Videocam as RingBrandIcon,
  Extension as GenericPluginIcon,
  CheckCircle as HealthyIcon,
  Error as ErrorIcon,
  NavigateNext as NavigateNextIcon,
  Extension as ExtensionIcon,
  Language as LanguageIcon,
} from '@mui/icons-material';
import { PluginConfigSchema, PluginConfigField, YouTubePluginConfig, BitTorrentPluginConfig, OpenRingPluginConfig, WebVideoPluginConfig } from '@/types/plugin';
import { usePluginConfiguration } from '@/hooks/usePluginConfiguration';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import { YouTubePluginConfig as YouTubeConfig } from './YouTubePluginConfig';
import { BitTorrentPluginConfig as BitTorrentConfig } from './BitTorrentPluginConfig';
import { OpenRingPluginConfig as OpenRingConfig } from './OpenRingPluginConfig';
import { WebVideoPluginConfig as WebVideoConfig } from './WebVideoPluginConfig';
import { RecurringJobsTab } from './RecurringJobsTab';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
};

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
  const [tabValue, setTabValue] = useState(0);
  const [notification, setNotification] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }>({
    open: false,
    message: '',
    severity: 'info',
  });

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
    handleConfigChange,
  } = usePluginConfiguration(pluginName);

  useEffect(() => {
    if (open) {
      loadConfigSchema();
      setTabValue(0);
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

  const handleNotification = (severity: 'success' | 'error' | 'warning' | 'info', message: string) => {
    setNotification({ open: true, message, severity });
  };

  const handleClose = () => {
    onClose();
    setNotification({ open: false, message: '', severity: 'info' });
  };

  const renderConfigField = (field: PluginConfigField) => {
    const configObj = config as Record<string, any>;
    const value = configObj[field.name] !== undefined ? configObj[field.name] : field.default;

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

  // Get plugin icon and color based on plugin name
  const getPluginIcon = () => {
    const iconSx = { fontSize: 28 };
    if (pluginName.toLowerCase().includes('youtube')) {
      return <YouTubeBrandIcon sx={{ ...iconSx, color: '#FF0000' }} />;
    }
    if (pluginName.toLowerCase().includes('torrent') || pluginName.toLowerCase().includes('bittorrent')) {
      return <TorrentBrandIcon sx={{ ...iconSx, color: '#4FC3F7' }} />;
    }
    if (pluginName.toLowerCase().includes('ring') || pluginName.toLowerCase().includes('openring')) {
      return <RingBrandIcon sx={{ ...iconSx, color: '#2196F3' }} />;
    }
    if (pluginName.toLowerCase().includes('webvideo')) {
      return <LanguageIcon sx={{ ...iconSx, color: '#0096FF' }} />;
    }
    return <GenericPluginIcon sx={{ ...iconSx, color: 'rgba(255, 255, 255, 0.7)' }} />;
  };

  const getPluginAccentColor = () => {
    if (pluginName.toLowerCase().includes('youtube')) return '#FF0000';
    if (pluginName.toLowerCase().includes('torrent') || pluginName.toLowerCase().includes('bittorrent')) return '#4FC3F7';
    if (pluginName.toLowerCase().includes('ring') || pluginName.toLowerCase().includes('openring')) return '#2196F3';
    if (pluginName.toLowerCase().includes('webvideo')) return '#0096FF';
    return liquidGlassTokens.neon.cyan;
  };

  const accentColor = getPluginAccentColor();

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: {
          background: liquidGlassTokens.canvas.elevated,
          border: `1px solid ${liquidGlassTokens.glass.border}`,
          borderRadius: liquidGlassTokens.radius.lg,
          overflow: 'hidden',
        }
      }}
    >
      {/* Header with gradient background */}
      <DialogTitle 
        sx={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: 2,
          background: `linear-gradient(135deg, ${accentColor}15 0%, transparent 60%)`,
          borderBottom: `1px solid ${liquidGlassTokens.glass.border}`,
          p: 3,
        }}
      >
        {/* Breadcrumb Navigation */}
        <Breadcrumbs
          separator={<NavigateNextIcon sx={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.3)' }} />}
          sx={{
            '& .MuiBreadcrumbs-ol': {
              alignItems: 'center',
            },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '0.8rem',
            }}
          >
            <ExtensionIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption" sx={{ color: 'inherit' }}>
              Plugins
            </Typography>
          </Box>
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.8rem',
              fontWeight: 500,
            }}
          >
            {pluginDisplayName}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: accentColor,
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            {tabValue === 0 ? 'Configuration' : 'Recurring Jobs'}
          </Typography>
        </Breadcrumbs>

        {/* Plugin Header Row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Plugin Icon Container - Rounded square, not circle */}
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: liquidGlassTokens.radius.md,
              background: `${accentColor}20`,
              border: `1px solid ${accentColor}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 20px ${accentColor}20`,
            }}
          >
            {getPluginIcon()}
          </Box>
          
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', fontSize: '1.25rem' }}>
              {pluginDisplayName}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Plugin Configuration
            </Typography>
          </Box>

          {/* Status indicator */}
          {configSchema && (
            <Chip
              icon={<SettingsIcon fontSize="small" />}
              label="Configured"
              size="small"
              sx={{
                backgroundColor: `${accentColor}20`,
                color: accentColor,
                border: `1px solid ${accentColor}40`,
                fontWeight: 500,
              }}
            />
          )}
        </Box>
      </DialogTitle>

      <DialogContent 
        sx={{ 
          p: 0,
          background: liquidGlassTokens.canvas.base,
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8, gap: 2 }}>
            <CircularProgress size={24} sx={{ color: accentColor }} />
            <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>Loading configuration...</Typography>
          </Box>
        ) : error ? (
          <Box sx={{ p: 3 }}>
            <Alert 
              severity="error"
              sx={{
                backgroundColor: `${liquidGlassTokens.neon.error}10`,
                border: `1px solid ${liquidGlassTokens.neon.error}30`,
                color: liquidGlassTokens.neon.error,
              }}
            >
              {error}
            </Alert>
          </Box>
        ) : (
          <>
            {/* Tabs */}
            <Box sx={{ 
              borderBottom: `1px solid ${liquidGlassTokens.glass.border}`,
              background: liquidGlassTokens.canvas.elevated,
            }}>
              <Tabs 
                value={tabValue} 
                onChange={(_, newValue) => setTabValue(newValue)}
                sx={{
                  '& .MuiTabs-indicator': {
                    backgroundColor: accentColor,
                    height: 2,
                  },
                  '& .MuiTab-root': {
                    color: 'rgba(255, 255, 255, 0.5)',
                    textTransform: 'none',
                    minHeight: 48,
                    '&.Mui-selected': {
                      color: accentColor,
                    },
                  },
                }}
              >
                <Tab 
                  icon={<BuildIcon sx={{ fontSize: 18 }} />} 
                  label="Configuration" 
                  iconPosition="start"
                />
                <Tab 
                  icon={<ScheduleIcon sx={{ fontSize: 18 }} />} 
                  label="Recurring Jobs" 
                  iconPosition="start"
                />
              </Tabs>
            </Box>

            {/* Configuration Tab */}
            <TabPanel value={tabValue} index={0}>
              {configSchema ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 3 }}>
                  {/* Info Card */}
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${liquidGlassTokens.glass.border}`,
                      borderRadius: liquidGlassTokens.radius.md,
                    }}
                  >
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                      {configSchema.description || `Configure ${pluginDisplayName} settings below. Changes will be saved to the plugin configuration file.`}
                    </Typography>
                  </Paper>

                  {error && (
                    <Alert 
                      severity="error"
                      sx={{
                        backgroundColor: `${liquidGlassTokens.neon.error}10`,
                        border: `1px solid ${liquidGlassTokens.neon.error}30`,
                        color: liquidGlassTokens.neon.error,
                      }}
                    >
                      {error}
                    </Alert>
                  )}

                  {/* Render custom configuration components based on pluginName */}
                  {pluginName === 'YouTubePlugin' && (
                    <YouTubeConfig
                      config={config as YouTubePluginConfig}
                      onChange={handleConfigChange}
                    />
                  )}
                  {pluginName === 'BitTorrentPlugin' && (
                    <BitTorrentConfig
                      config={config as BitTorrentPluginConfig}
                      onChange={handleConfigChange}
                    />
                  )}
                  {pluginName === 'OpenRingPlugin' && (
                    <OpenRingConfig
                      config={config as OpenRingPluginConfig}
                      onChange={handleConfigChange}
                    />
                  )}
                  {pluginName === 'WebVideoPlugin' && (
                    <WebVideoConfig
                      config={config as WebVideoPluginConfig}
                      onChange={handleConfigChange}
                    />
                  )}

                  {/* Fallback to schema-driven rendering for other plugins */}
                  {!(pluginName === 'YouTubePlugin' || pluginName === 'BitTorrentPlugin' || pluginName === 'OpenRingPlugin' || pluginName === 'WebVideoPlugin') && (
                    <Grid container spacing={2}>
                      {configSchema.config_schema.map((field) => (
                        <Grid size={{ xs: 12, sm: 6 }} key={field.name}>
                          {renderConfigField(field)}
                        </Grid>
                      ))}
                    </Grid>
                  )}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No configuration available for this plugin.
                </Typography>
              )}
            </TabPanel>

            {/* Recurring Jobs Tab */}
            <TabPanel value={tabValue} index={1}>
              <Box sx={{ p: 3 }}>
                <RecurringJobsTab pluginName={pluginName} onNotification={handleNotification} />
              </Box>
            </TabPanel>
          </>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          p: 3,
          background: liquidGlassTokens.canvas.elevated,
          borderTop: `1px solid ${liquidGlassTokens.glass.border}`,
          gap: 1,
        }}
      >
        {tabValue === 0 && configSchema ? (
          <>
            <Button 
              onClick={handleReset}
              sx={{
                color: 'rgba(255, 255, 255, 0.5)',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: 'rgba(255, 255, 255, 0.8)',
                },
              }}
            >
              Reset to Defaults
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button 
              onClick={handleClose}
              sx={{
                color: 'rgba(255, 255, 255, 0.7)',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={saving}
              sx={{
                background: `linear-gradient(135deg, ${accentColor}40 0%, ${accentColor}20 100%)`,
                border: `1px solid ${accentColor}60`,
                color: '#fff',
                textTransform: 'none',
                px: 3,
                '&:hover': {
                  background: `linear-gradient(135deg, ${accentColor}50 0%, ${accentColor}30 100%)`,
                  boxShadow: `0 0 20px ${accentColor}30`,
                },
                '&:disabled': {
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  color: 'rgba(255, 255, 255, 0.3)',
                },
              }}
            >
              {saving ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : 'Save Configuration'}
            </Button>
          </>
        ) : (
          <Button 
            onClick={handleClose}
            variant="contained"
            sx={{
              background: `linear-gradient(135deg, ${accentColor}40 0%, ${accentColor}20 100%)`,
              border: `1px solid ${accentColor}60`,
              color: '#fff',
              textTransform: 'none',
              px: 3,
            }}
          >
            Close
          </Button>
        )}
      </DialogActions>

      {/* Notification */}
      {notification.open && (
        <Alert
          severity={notification.severity}
          onClose={() => setNotification({ ...notification, open: false })}
          sx={{ position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 1 }}
        >
          {notification.message}
        </Alert>
      )}
    </Dialog>
  );
}