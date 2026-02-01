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
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Info as InfoIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Storage as StorageIcon,
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
  const [showErrors, setShowErrors] = useState(false);

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

      {/* Size Validation Errors */}
      {status?.recentErrors && status.recentErrors.length > 0 && (
        <Alert 
          severity="warning" 
          sx={{ mb: 2 }}
          icon={<ErrorIcon />}
          action={
            <IconButton
              size="small"
              color="inherit"
              onClick={() => setShowErrors(!showErrors)}
            >
              {showErrors ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          }
        >
          <Box>
            <Typography variant="body2" fontWeight={600}>
              Recent Upload Errors ({status.recentErrors.length})
            </Typography>
            {status.errorCounts['size_validation'] > 0 && (
              <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                <StorageIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                {status.errorCounts['size_validation']} file(s) rejected due to size limits
              </Typography>
            )}
            
            <Collapse in={showErrors}>
              <List dense sx={{ mt: 1, pl: 0 }}>
                {status.recentErrors.slice(0, 5).map((err, index) => (
                  <React.Fragment key={err.id}>
                    <ListItem sx={{ px: 0, py: 0.5 }}>
                      <ListItemText
                        primary={
                          <Typography variant="caption" fontWeight={500}>
                            {err.videoPath.split('/').pop()}
                          </Typography>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {err.stage === 'size_validation' ? 'Size limit exceeded' : err.stage}: {err.message.substring(0, 100)}{err.message.length > 100 ? '...' : ''}
                          </Typography>
                        }
                      />
                    </ListItem>
                    {index < Math.min(status.recentErrors.length, 5) - 1 && (
                      <Divider component="li" sx={{ my: 0.5 }} />
                    )}
                  </React.Fragment>
                ))}
                {status.recentErrors.length > 5 && (
                  <Typography variant="caption" color="text.secondary" sx={{ pl: 2 }}>
                    ... and {status.recentErrors.length - 5} more
                  </Typography>
                )}
              </List>
            </Collapse>
          </Box>
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
