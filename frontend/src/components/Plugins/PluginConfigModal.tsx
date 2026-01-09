import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  FormatAlignLeft as FormIcon,
  Code as CodeIcon,
  Save as SaveIcon,
  Restore as RestoreIcon,
  Close as CloseIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { usePluginConfig } from '@/hooks/usePlugins';
import { PluginMetadata, PluginConfig } from '@/types/plugin';
import { PluginHealth } from '@/types/plugin';

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

const PluginConfigModal: React.FC<{
  open: boolean;
  onClose: () => void;
  plugin: PluginMetadata;
  health?: PluginHealth;
}> = ({ open, onClose, plugin, health }) => {
  const { config, loading, updateConfig, deleteConfig } = usePluginConfig(plugin.name);
  const [tabValue, setTabValue] = useState(0);
  const [formConfig, setFormConfig] = useState<Record<string, any>>({});
  const [jsonConfig, setJsonConfig] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }>({
    open: false,
    message: '',
    severity: 'info',
  });

  // Initialize form and JSON when config loads
  useEffect(() => {
    if (config) {
      setFormConfig(config);
      setJsonConfig(JSON.stringify(config, null, 2));
    } else {
      setFormConfig({});
      setJsonConfig('{}');
    }
  }, [config]);

  // Generate form fields dynamically based on config
  const generateFormFields = () => {
    const entries = Object.entries(formConfig);
    
    if (entries.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">
            No configuration available. Use the JSON editor to add configuration.
          </Typography>
        </Box>
      );
    }

    return entries.map(([key, value]) => (
      <Box key={key} mb={2}>
        <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 500 }}>
          {key}
        </Typography>
        {typeof value === 'boolean' ? (
          <Button
            variant={value ? 'contained' : 'outlined'}
            onClick={() => setFormConfig({ ...formConfig, [key]: !value })}
            fullWidth
            sx={{ justifyContent: 'flex-start' }}
          >
            {value ? 'Enabled' : 'Disabled'}
          </Button>
        ) : typeof value === 'number' ? (
          <TextField
            type="number"
            value={value}
            onChange={(e) => setFormConfig({ ...formConfig, [key]: parseFloat(e.target.value) })}
            fullWidth
            size="small"
          />
        ) : (
          <TextField
            type="text"
            value={value}
            onChange={(e) => setFormConfig({ ...formConfig, [key]: e.target.value })}
            fullWidth
            size="small"
            multiline={typeof value === 'string' && value.length > 50}
            rows={typeof value === 'string' && value.length > 50 ? 3 : 1}
          />
        )}
      </Box>
    ));
  };

  const handleJsonChange = (value: string) => {
    setJsonConfig(value);
    try {
      const parsed = JSON.parse(value);
      setJsonError(null);
      setFormConfig(parsed);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  const handleSave = async () => {
    if (jsonError) {
      setNotification({ open: true, message: 'Please fix JSON errors before saving', severity: 'error' });
      return;
    }

    setSaving(true);
    try {
      const result = await updateConfig(formConfig as PluginConfig);
      if (result.success) {
        setNotification({ open: true, message: 'Configuration saved successfully', severity: 'success' });
      } else {
        setNotification({ open: true, message: result.error || 'Failed to save configuration', severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to save configuration', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await deleteConfig();
      setFormConfig({});
      setJsonConfig('{}');
      setNotification({ open: true, message: 'Configuration reset to defaults', severity: 'success' });
    } catch (error) {
      setNotification({ open: true, message: 'Failed to reset configuration', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset state after close
    setTimeout(() => {
      setTabValue(0);
      setJsonError(null);
      setNotification({ open: false, message: '', severity: 'info' });
    }, 300);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Configure {plugin.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {plugin.version} • {Array.isArray(plugin.media_types) ? plugin.media_types.join(', ').toUpperCase() : 'N/A'}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Plugin Status */}
        {health && (
          <Alert
            severity={health.healthy ? 'success' : 'error'}
            sx={{ mb: 2 }}
            icon={health.healthy ? <CheckIcon /> : <CloseIcon />}
          >
            {health.healthy ? 'Plugin is healthy and running' : `Plugin error: ${health.error || 'Unknown error'}`}
          </Alert>
        )}

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
            <Tab icon={<FormIcon />} label="Form" />
            <Tab icon={<CodeIcon />} label="JSON" />
          </Tabs>
        </Box>

        {/* Form Tab */}
        <TabPanel value={tabValue} index={0}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Configure plugin settings using the form below. For advanced configuration, use the JSON editor.
              </Typography>
              {generateFormFields()}
            </Box>
          )}
        </TabPanel>

        {/* JSON Tab */}
        <TabPanel value={tabValue} index={1}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Edit configuration directly as JSON. This is useful for advanced configurations not supported by the form.
          </Typography>
          <TextField
            value={jsonConfig}
            onChange={(e) => handleJsonChange(e.target.value)}
            fullWidth
            multiline
            rows={12}
            error={!!jsonError}
            helperText={jsonError || ''}
            InputProps={{
              sx: {
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                backgroundColor: jsonError ? '#FEF2F2' : '#F9F9F9',
              },
            }}
          />
          {jsonError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {jsonError}
            </Alert>
          )}
        </TabPanel>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={handleReset} color="warning" startIcon={<RestoreIcon />} disabled={saving || !config}>
          Reset to Defaults
        </Button>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          disabled={saving || !!jsonError}
        >
          Save Configuration
        </Button>
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
};

export default PluginConfigModal;
