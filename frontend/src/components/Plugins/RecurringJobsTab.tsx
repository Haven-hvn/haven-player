import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  IconButton,
  CircularProgress,
  Alert,
  FormHelperText,
  Paper,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  PlayCircle as PlayIcon,
  Pause as PauseIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayArrowIcon,
  Info as InfoIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { useRecurringJobs } from '@/hooks/useRecurringJobs';
import { RecurringJob, RecurringJobCreate } from '@/types/plugin';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';

interface RecurringJobsTabProps {
  pluginName: string;
  onNotification?: (severity: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

export const RecurringJobsTab: React.FC<RecurringJobsTabProps> = ({ pluginName, onNotification }) => {
  const {
    jobs,
    schedulerStatus,
    loading: jobsLoading,
    createJob,
    deleteJob,
    pauseJob,
    resumeJob,
    runJobNow,
  } = useRecurringJobs(pluginName);

  const [showJobForm, setShowJobForm] = useState(false);
  const [newJob, setNewJob] = useState<RecurringJobCreate>({
    plugin_name: pluginName,
    job_name: '',
    schedule: '0 * * * *',
    method: 'discover_sources',
    on_success: 'log_only',
    config: {},
  });

  const handleCreateJob = async () => {
    if (!newJob.job_name.trim()) {
      onNotification?.('error', 'Job name is required');
      return;
    }

    const result = await createJob(newJob);
    if (result.success) {
      onNotification?.('success', 'Job created successfully');
      setShowJobForm(false);
      setNewJob({
        plugin_name: pluginName,
        job_name: '',
        schedule: '0 * * * *',
        method: 'discover_sources',
        on_success: 'log_only',
        config: {},
      });
    } else {
      onNotification?.('error', result.error || 'Failed to create job');
    }
  };

  const handleDeleteJob = async (jobId: number) => {
    const result = await deleteJob(jobId);
    if (result.success) {
      onNotification?.('success', 'Job deleted successfully');
    } else {
      onNotification?.('error', result.error || 'Failed to delete job');
    }
  };

  const handleToggleJob = async (job: RecurringJob) => {
    if (job.enabled) {
      const result = await pauseJob(job.id);
      if (result.success) {
        onNotification?.('success', 'Job paused successfully');
      } else {
        onNotification?.('error', result.error || 'Failed to pause job');
      }
    } else {
      const result = await resumeJob(job.id);
      if (result.success) {
        onNotification?.('success', 'Job resumed successfully');
      } else {
        onNotification?.('error', result.error || 'Failed to resume job');
      }
    }
  };

  const handleRunJobNow = async (jobId: number) => {
    const result = await runJobNow(jobId);
    if (result.success) {
      onNotification?.('success', 'Job triggered successfully');
    } else {
      onNotification?.('error', result.error || 'Failed to trigger job');
    }
  };

  const getSchedulePresetLabel = (schedule: string) => {
    const presets: Record<string, string> = {
      '*/5 * * * *': 'Every 5 minutes',
      '*/15 * * * *': 'Every 15 minutes',
      '*/30 * * * *': 'Every 30 minutes',
      '0 * * * *': 'Every hour',
      '0 */2 * * *': 'Every 2 hours',
      '0 */6 * * *': 'Every 6 hours',
      '0 0 * * *': 'Daily at midnight',
      '0 12 * * *': 'Daily at noon',
    };
    return presets[schedule] || schedule;
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Rounded square icon */}
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: liquidGlassTokens.radius.sm,
              background: `${liquidGlassTokens.neon.cyan}15`,
              border: `1px solid ${liquidGlassTokens.neon.cyan}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ScheduleIcon sx={{ color: liquidGlassTokens.neon.cyan, fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem' }}>
              Recurring Jobs
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Scheduler is {schedulerStatus?.running ? 'running' : 'stopped'} • {jobs.length} job(s) configured
            </Typography>
          </Box>
        </Box>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setShowJobForm(true)}
          disabled={showJobForm}
          sx={{
            borderColor: liquidGlassTokens.neon.cyan,
            color: liquidGlassTokens.neon.cyan,
            textTransform: 'none',
            '&:hover': {
              backgroundColor: `${liquidGlassTokens.neon.cyan}10`,
              borderColor: liquidGlassTokens.neon.cyan,
            },
            '&:disabled': {
              borderColor: 'rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.3)',
            },
          }}
        >
          Add Job
        </Button>
      </Box>

      {jobsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8, gap: 2 }}>
          <CircularProgress size={24} sx={{ color: liquidGlassTokens.neon.cyan }} />
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>Loading jobs...</Typography>
        </Box>
      ) : jobs.length === 0 && !showJobForm ? (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.02)',
            border: `1px dashed ${liquidGlassTokens.glass.border}`,
            borderRadius: liquidGlassTokens.radius.md,
          }}
        >
          <ScheduleIcon sx={{ color: 'rgba(255, 255, 255, 0.2)', fontSize: 40, mb: 1 }} />
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)', mb: 0.5 }}>
            No recurring jobs configured
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.3)', display: 'block', mb: 2 }}>
            Add a job to automatically run plugin operations on a schedule
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setShowJobForm(true)}
            sx={{
              borderColor: liquidGlassTokens.neon.cyan,
              color: liquidGlassTokens.neon.cyan,
              textTransform: 'none',
              '&:hover': {
                backgroundColor: `${liquidGlassTokens.neon.cyan}10`,
              },
            }}
          >
            Add Your First Job
          </Button>
        </Paper>
      ) : (
        <Box display="grid" gap={2}>
          {jobs.map((job, index) => (
            <Card
              key={job.id}
              elevation={0}
              sx={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${job.enabled ? `${liquidGlassTokens.neon.success}30` : liquidGlassTokens.glass.border}`,
                borderRadius: liquidGlassTokens.radius.md,
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: job.enabled ? `${liquidGlassTokens.neon.success}50` : 'rgba(255, 255, 255, 0.2)',
                  background: 'rgba(255, 255, 255, 0.05)',
                },
              }}
            >
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#fff' }}>
                        {job.job_name}
                      </Typography>
                      <Chip
                        label={job.enabled ? 'Enabled' : 'Paused'}
                        size="small"
                        sx={{
                          backgroundColor: job.enabled ? `${liquidGlassTokens.neon.success}20` : 'rgba(255, 255, 255, 0.08)',
                          color: job.enabled ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.5)',
                          border: `1px solid ${job.enabled ? `${liquidGlassTokens.neon.success}40` : 'rgba(255, 255, 255, 0.1)'}`,
                          fontWeight: 500,
                          height: 22,
                        }}
                      />
                      {job.is_running && (
                        <Chip
                          label="Running"
                          size="small"
                          sx={{
                            backgroundColor: `${liquidGlassTokens.neon.cyan}20`,
                            color: liquidGlassTokens.neon.cyan,
                            border: `1px solid ${liquidGlassTokens.neon.cyan}40`,
                            fontWeight: 500,
                            height: 22,
                          }}
                        />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                      <Chip
                        label={getSchedulePresetLabel(job.schedule)}
                        size="small"
                        sx={{
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${liquidGlassTokens.glass.border}`,
                          color: 'rgba(255, 255, 255, 0.7)',
                          height: 24,
                        }}
                      />
                      <Chip
                        label={`Method: ${job.method}`}
                        size="small"
                        sx={{
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${liquidGlassTokens.glass.border}`,
                          color: 'rgba(255, 255, 255, 0.7)',
                          height: 24,
                        }}
                      />
                      <Chip
                        label={`On success: ${job.on_success}`}
                        size="small"
                        sx={{
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${liquidGlassTokens.glass.border}`,
                          color: 'rgba(255, 255, 255, 0.7)',
                          height: 24,
                        }}
                      />
                    </Box>
                    {job.last_run_at && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Last run: {new Date(job.last_run_at).toLocaleString()}
                      </Typography>
                    )}
                    {job.next_run_at && (
                      <Typography variant="body2" color="text.secondary">
                        Next run: {new Date(job.next_run_at).toLocaleString()}
                      </Typography>
                    )}
                    {job.last_error && (
                      <Alert
                        severity="error"
                        sx={{
                          mt: 1,
                          backgroundColor: `${liquidGlassTokens.neon.error}10`,
                          border: `1px solid ${liquidGlassTokens.neon.error}30`,
                          color: liquidGlassTokens.neon.error,
                          fontSize: '0.8rem',
                        }}
                      >
                        {job.last_error}
                      </Alert>
                    )}
                    <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="caption" color="text.secondary">
                        Total runs: {job.total_runs}
                      </Typography>
                      <Typography variant="caption" color="success.main">
                        Success: {job.successful_runs}
                      </Typography>
                      <Typography variant="caption" color="error.main">
                        Failed: {job.failed_runs}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, ml: 2 }}>
                    <Tooltip title={job.enabled ? 'Pause job' : 'Resume job'}>
                      <IconButton
                        size="small"
                        onClick={() => handleToggleJob(job)}
                        sx={{
                          color: job.enabled ? liquidGlassTokens.neon.amber : liquidGlassTokens.neon.success,
                          '&:hover': {
                            backgroundColor: job.enabled ? `${liquidGlassTokens.neon.amber}10` : `${liquidGlassTokens.neon.success}10`,
                          },
                        }}
                      >
                        {job.enabled ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Run now">
                      <IconButton
                        size="small"
                        onClick={() => handleRunJobNow(job.id)}
                        sx={{
                          color: liquidGlassTokens.neon.cyan,
                          '&:hover': {
                            backgroundColor: `${liquidGlassTokens.neon.cyan}10`,
                          },
                        }}
                      >
                        <PlayArrowIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete job">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteJob(job.id)}
                        sx={{
                          color: 'rgba(255, 255, 255, 0.4)',
                          '&:hover': {
                            color: liquidGlassTokens.neon.error,
                            backgroundColor: `${liquidGlassTokens.neon.error}10`,
                          },
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Job Creation Form */}
      {showJobForm && (
        <Card
          elevation={0}
          sx={{
            mb: 2,
            background: 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${liquidGlassTokens.neon.cyan}40`,
            borderRadius: liquidGlassTokens.radius.md,
          }}
        >
          <CardContent sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#fff', mb: 2 }}>
              Create New Recurring Job
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                fullWidth
                size="small"
                label="Job Name"
                value={newJob.job_name}
                onChange={(e) => setNewJob({ ...newJob, job_name: e.target.value })}
                placeholder="e.g., poll_youtube_channel"
                required
              />
              <FormControl fullWidth size="small">
                <InputLabel>Schedule</InputLabel>
                <Select
                  value={newJob.schedule}
                  label="Schedule"
                  onChange={(e) => setNewJob({ ...newJob, schedule: e.target.value })}
                >
                  <MenuItem value="*/5 * * * *">Every 5 minutes</MenuItem>
                  <MenuItem value="*/15 * * * *">Every 15 minutes</MenuItem>
                  <MenuItem value="*/30 * * * *">Every 30 minutes</MenuItem>
                  <MenuItem value="0 * * * *">Every hour</MenuItem>
                  <MenuItem value="0 */2 * * *">Every 2 hours</MenuItem>
                  <MenuItem value="0 */6 * * *">Every 6 hours</MenuItem>
                  <MenuItem value="0 0 * * *">Daily at midnight</MenuItem>
                  <MenuItem value="0 12 * * *">Daily at noon</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Method</InputLabel>
                <Select
                  value={newJob.method}
                  label="Method"
                  onChange={(e) => setNewJob({ ...newJob, method: e.target.value })}
                >
                  <MenuItem value="discover_sources">
                    Discover Sources
                  </MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>On Success</InputLabel>
                <Select
                  value={newJob.on_success}
                  label="On Success"
                  onChange={(e) => setNewJob({ ...newJob, on_success: e.target.value })}
                >
                  <MenuItem value="log_only">
                    Log Only (just record discoveries)
                  </MenuItem>
                  <MenuItem value="archive_all">
                    Archive All (download all discovered sources)
                  </MenuItem>
                  <MenuItem value="archive_new">
                    Archive New Only (download newly discovered sources)
                  </MenuItem>
                </Select>
                <FormHelperText>
                  {newJob.on_success === 'log_only' && 'Only log discoveries without downloading'}
                  {newJob.on_success === 'archive_all' && 'Automatically download all discovered videos'}
                  {newJob.on_success === 'archive_new' && 'Download newly discovered videos (plugin filters out already-seen videos)'}
                </FormHelperText>
              </FormControl>
            </Box>

            {/* Info box explaining the pattern */}
            <Alert
              severity="info"
              icon={<InfoIcon />}
              sx={{
                mt: 2,
                backgroundColor: `${liquidGlassTokens.neon.cyan}08`,
                border: `1px solid ${liquidGlassTokens.neon.cyan}30`,
                color: 'rgba(255, 255, 255, 0.8)',
                '& .MuiAlert-icon': {
                  color: liquidGlassTokens.neon.cyan,
                },
              }}
            >
              <Typography variant="body2">
                <strong style={{ color: liquidGlassTokens.neon.cyan }}>How it works:</strong> The job will call <code>discover_sources()</code> to find new content,
                then the <strong>On Success</strong> action determines what happens next.
                The plugin tracks seen videos, so repeated runs won't re-download the same content.
              </Typography>
            </Alert>
            <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button onClick={() => setShowJobForm(false)}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleCreateJob}
                disabled={!newJob.job_name.trim()}
              >
                Create Job
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default RecurringJobsTab;
