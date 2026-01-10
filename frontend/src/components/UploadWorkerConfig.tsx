/**
 * UploadWorker Configuration Component
 *
 * Simple component to display and control the upload worker status and configuration.
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  Paper,
  Card,
  CardContent,
  Chip,
  Grid,
    useTheme,
  } from '@mui/material';
  import {
    CloudUpload as CloudUploadIcon,
    CheckCircle as CheckCircleIcon,
    Error as ErrorIcon,
    Info as InfoIcon,
  } from '@mui/icons-material';
import { useUploadWorker } from '@/hooks/useUploadWorker';
import { uploadCoordinatorConfigService } from '@/services/uploadCoordinatorConfigService';
import type { UploadCoordinatorConfig } from '@/types/plugin';

interface UploadWorkerConfigProps {
  filecoinConfigured: boolean;
}

const UploadWorkerConfig: React.FC<UploadWorkerConfigProps> = ({ filecoinConfigured }) => {
  const theme = useTheme();
  const {
    status,
    queueStats,
    loading,
    error,
    start,
    stop,
  } = useUploadWorker();
  const [backendConfig, setBackendConfig] = useState<UploadCoordinatorConfig | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);

  // Load backend config on mount
  useEffect(() => {
    uploadCoordinatorConfigService.getConfig()
      .then(setBackendConfig)
      .catch(console.error);
  }, []);

  const handleToggleActive = async (enabled: boolean) => {
    try {
      if (enabled) {
        if (!filecoinConfigured) {
          console.warn('Filecoin not configured, cannot start upload worker');
          return;
        }

        // First, update backend configuration
        setBackendLoading(true);
        try {
          await uploadCoordinatorConfigService.enable();
          console.log('✅ Enabled backend upload coordinator (auto-upload for plugin downloads)');
        } catch (err) {
          console.error('Failed to enable backend upload coordinator:', err);
          // Continue anyway - frontend worker can still run
        }

        // Then, start frontend upload worker
        await start({ enabled: true, pollInterval: 15000 });

        // Refresh backend config
        const updatedConfig = await uploadCoordinatorConfigService.getConfig();
        setBackendConfig(updatedConfig);
      } else {
        // First, update backend configuration
        setBackendLoading(true);
        try {
          await uploadCoordinatorConfigService.disable();
          console.log('✅ Disabled backend upload coordinator');
        } catch (err) {
          console.error('Failed to disable backend upload coordinator:', err);
          // Continue anyway
        }

        // Then, stop frontend upload worker
        await stop();

        // Refresh backend config
        const updatedConfig = await uploadCoordinatorConfigService.getConfig();
        setBackendConfig(updatedConfig);
      }
    } catch (err) {
      console.error('Failed to toggle upload worker:', err);
    } finally {
      setBackendLoading(false);
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Upload Worker Status
      </Typography>

      {!filecoinConfigured && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Filecoin not configured. Please configure Filecoin settings to enable auto-upload.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Upload worker error: {error}
        </Alert>
      )}

      <Grid container spacing={2}>
        {/* Status Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={status?.isRunning || false}
                      onChange={(e) => handleToggleActive(e.target.checked)}
                      disabled={loading || backendLoading || !filecoinConfigured}
                      color="success"
                    />
                  }
                  label={
                    <Typography sx={{ fontWeight: 600 }}>
                      {backendLoading ? 'Updating...' : (status?.isRunning ? 'Upload Worker Active' : 'Upload Worker Inactive')}
                    </Typography>
                  }
                />
              </Box>

              {/* Backend UploadCoordinator Status */}
              <Alert
                severity={backendConfig?.enabled ? 'success' : 'warning'}
                sx={{ mb: 1 }}
                variant="outlined"
                icon={<InfoIcon />}
              >
                <Typography variant="body2">
                  <strong>Backend Upload Coordinator:</strong> {backendConfig?.enabled ? '✅ Enabled (videos auto-queued after download)' : '⚠️ Disabled (no auto-queueing)'}
                  {backendConfig?.enabled && backendConfig?.plugin_overrides?.YouTubePlugin && ' | YouTube Plugin: ✅'}
                </Typography>
              </Alert>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                <Chip
                  icon={<CloudUploadIcon />}
                  label={`Frontend Worker: ${status?.config.enabled ? 'Enabled' : 'Disabled'}`}
                  size="small"
                  color={status?.config.enabled ? 'success' : 'default'}
                />
                <Chip
                  label={`Poll Interval: ${(status?.config.pollInterval ?? 15000) / 1000}s`}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  label={`Max Retries: ${status?.config.retryAttempts ?? 3}`}
                  size="small"
                  variant="outlined"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Queue Stats Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Upload Queue
              </Typography>

              {queueStats && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    label={`Pending: ${queueStats.pending}`}
                    size="small"
                    color="warning"
                  />
                  <Chip
                    label={`Processing: ${queueStats.processing}`}
                    size="small"
                    color="info"
                  />
                  <Chip
                    label={`Completed: ${queueStats.completed}`}
                    size="small"
                    color="success"
                  />
                  <Chip
                    label={`Failed: ${queueStats.failed}`}
                    size="small"
                    color="error"
                  />
                  {queueStats.retryable > 0 && (
                    <Chip
                      label={`Retryable: ${queueStats.retryable}`}
                      size="small"
                      color="secondary"
                    />
                  )}
                </Box>
              )}

              {!queueStats && (
                <Typography variant="body2" color="text.secondary">
                  No queue data available
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default UploadWorkerConfig;
