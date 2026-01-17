import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, FormControlLabel, Switch,
  Select, MenuItem, FormControl, InputLabel,
  Box, Typography, Alert, Divider, Grid,
  CircularProgress, IconButton, Tooltip,
  Tabs, Tab,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Schedule as ScheduleIcon,
  Build as BuildIcon,
} from '@mui/icons-material';
import { PluginConfigSchema, PluginConfigField, YouTubePluginConfig, BitTorrentPluginConfig } from '@/types/plugin';
import { usePluginConfiguration } from '@/hooks/usePluginConfiguration';
import { YouTubePluginConfig as YouTubeConfig } from './YouTubePluginConfig';
import { BitTorrentPluginConfig as BitTorrentConfig } from './BitTorrentPluginConfig';
import { OpenRingPluginConfig as OpenRingConfig } from './OpenRingPluginConfig';
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
        ) : (
          <>
            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
                <Tab icon={<BuildIcon />} label="Configuration" />
                <Tab icon={<ScheduleIcon />} label="Recurring Jobs" />
              </Tabs>
            </Box>

            {/* Configuration Tab */}
            <TabPanel value={tabValue} index={0}>
              {configSchema ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    {configSchema.description}
                  </Typography>

                  {error && <Alert severity="error">{error}</Alert>}

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

                  {/* Fallback to schema-driven rendering for other plugins */}
                  {!(pluginName === 'YouTubePlugin' || pluginName === 'BitTorrentPlugin' || pluginName === 'OpenRingPlugin') && (
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
              <RecurringJobsTab pluginName={pluginName} onNotification={handleNotification} />
            </TabPanel>
          </>
        )}
      </DialogContent>

      <DialogActions>
        {tabValue === 0 && configSchema ? (
          <>
            <Button onClick={handleReset} color="info">
              Reset to Defaults
            </Button>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={saving}
            >
              {saving ? <CircularProgress size={20} /> : 'Save Configuration'}
            </Button>
          </>
        ) : (
          <Button onClick={handleClose}>Close</Button>
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