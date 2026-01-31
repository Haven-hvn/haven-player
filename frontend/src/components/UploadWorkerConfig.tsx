/**
 * UploadWorker Status Component
 *
 * Displays the upload worker status and queue statistics.
 * The worker auto-starts with the backend - no manual control needed.
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Alert,
  Card,
  CardContent,
  Chip,
  Grid,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useUploadWorker } from '@/hooks/useUploadWorker';
import { uploadCoordinatorConfigService } from '@/services/uploadCoordinatorConfigService';
import type { UploadCoordinatorConfig } from '@/types/plugin';

interface UploadWorkerConfigProps {
  filecoinConfigured: boolean;
}

const UploadWorkerConfig: React.FC<UploadWorkerConfigProps> = ({ filecoinConfigured }) => {
  const {
    status,
    queueStats,
    error,
  } = useUploadWorker();
  const [backendConfig, setBackendConfig] = useState<UploadCoordinatorConfig | null>(null);

  // Load backend config on mount
  useEffect(() => {
    uploadCoordinatorConfigService.getConfig()
      .then(setBackendConfig)
      .catch(console.error);
  }, []);

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
                <CloudUploadIcon 
                  sx={{ 
                    color: status?.isRunning ? 'success.main' : 'text.secondary',
                    fontSize: 28 
                  }} 
                />
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>
                    {status?.isRunning ? 'Upload Worker Running' : 'Upload Worker Stopped'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {status?.isRunning 
                      ? 'Automatically processing pending uploads' 
                      : 'Will start automatically when backend is ready'}
                  </Typography>
                </Box>
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

        {/* Queue Stats Card - Shows VLM analysis status */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Upload Queue
              </Typography>

              {queueStats && (
                <>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
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
                  </Box>

                  {/* VLM Analysis Sub-section */}
                  <Typography variant="caption" sx={{ display: 'block', mt: 1, mb: 0.5, fontWeight: 600 }}>
                    VLM Analysis
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                      label={`Pending: ${queueStats.vlm_analysis_pending ?? 0}`}
                      size="small"
                      variant="outlined"
                    />
                    <Chip
                      label={`Processing: ${queueStats.vlm_analysis_processing ?? 0}`}
                      size="small"
                      variant="outlined"
                      color="info"
                    />
                    <Chip
                      label={`Completed: ${queueStats.vlm_analysis_completed ?? 0}`}
                      size="small"
                      variant="outlined"
                      color="success"
                    />
                    <Chip
                      label={`Failed: ${queueStats.vlm_analysis_failed ?? 0}`}
                      size="small"
                      variant="outlined"
                      color="error"
                    />
                  </Box>

                  {queueStats.retryable > 0 && (
                    <Chip
                      label={`Retryable: ${queueStats.retryable}`}
                      size="small"
                      color="secondary"
                      sx={{ mt: 1 }}
                    />
                  )}
                </>
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
