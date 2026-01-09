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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import {
  FormatAlignLeft as FormIcon,
  Code as CodeIcon,
  Save as SaveIcon,
  Restore as RestoreIcon,
  Close as CloseIcon,
  Check as CheckIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { usePluginConfig } from '@/hooks/usePlugins';
import { useRecurringJobs } from '@/hooks/useRecurringJobs';
import { PluginMetadata, PluginConfig, RecurringJob, RecurringJobCreate } from '@/types/plugin';
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
  const { 
    jobs, 
    schedulerStatus, 
    loading: jobsLoading, 
    createJob, 
    deleteJob, 
    pauseJob, 
    resumeJob, 
    runJobNow 
  } = useRecurringJobs(plugin.name);
  
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

  // Job creation form state
  const [showJobForm, setShowJobForm] = useState(false);
  const [newJob, setNewJob] = useState<RecurringJobCreate>({
    plugin_name: plugin.name,
    job_name: '',
    schedule: '0 * * * *',
    method: 'discover_sources',
    on_success: 'log_only',
    config: {},
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

  const handleCreateJob = async () => {
    if (!newJob.job_name.trim()) {
      setNotification({ open: true, message: 'Job name is required', severity: 'error' });
      return;
    }

    const result = await createJob(newJob);
    if (result.success) {
      setNotification({ open: true, message: 'Job created successfully', severity: 'success' });
      setShowJobForm(false);
      setNewJob({
        plugin_name: plugin.name,
        job_name: '',
        schedule: '0 * * * *',
        method: 'discover_sources',
        on_success: 'log_only',
        config: {},
      });
    } else {
      setNotification({ open: true, message: result.error || 'Failed to create job', severity: 'error' });
    }
  };

  const handleDeleteJob = async (jobId: number) => {
    const result = await deleteJob(jobId);
    if (result.success) {
      setNotification({ open: true, message: 'Job deleted successfully', severity: 'success' });
    } else {
      setNotification({ open: true, message: result.error || 'Failed to delete job', severity: 'error' });
    }
  };

  const handleToggleJob = async (job: RecurringJob) => {
    if (job.enabled) {
      const result = await pauseJob(job.id);
      if (result.success) {
        setNotification({ open: true, message: 'Job paused successfully', severity: 'success' });
      } else {
        setNotification({ open: true, message: result.error || 'Failed to pause job', severity: 'error' });
      }
    } else {
      const result = await resumeJob(job.id);
      if (result.success) {
        setNotification({ open: true, message: 'Job resumed successfully', severity: 'success' });
      } else {
        setNotification({ open: true, message: result.error || 'Failed to resume job', severity: 'error' });
      }
    }
  };

  const handleRunJobNow = async (jobId: number) => {
    const result = await runJobNow(jobId);
    if (result.success) {
      setNotification({ open: true, message: 'Job triggered successfully', severity: 'success' });
    } else {
      setNotification({ open: true, message: result.error || 'Failed to trigger job', severity: 'error' });
    }
  };

  const formatSchedule = (schedule: string) => {
    try {
      const [minute, hour, day, month, weekday] = schedule.split(' ');
      return `${minute}:${hour} ${day}/${month} (weekday: ${weekday})`;
    } catch {
      return schedule;
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

  const handleClose = () => {
    onClose();
    // Reset state after close
    setTimeout(() => {
      setTabValue(0);
      setJsonError(null);
      setNotification({ open: false, message: '', severity: 'info' });
      setShowJobForm(false);
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
            <Tab icon={<ScheduleIcon />} label="Recurring Jobs" />
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

        {/* Recurring Jobs Tab */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="subtitle1" fontWeight="600">
                  Recurring Jobs
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Scheduler is {schedulerStatus?.running ? 'running' : 'stopped'} • {jobs.length} job(s) configured
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setShowJobForm(true)}
              >
                Add Job
              </Button>
            </Box>

            {jobsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
              </Box>
            ) : jobs.length === 0 && !showJobForm ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                No recurring jobs configured for this plugin. Add a job to automatically run plugin operations on a schedule.
              </Alert>
            ) : (
              <Grid container spacing={2}>
                {jobs.map((job) => (
                  <Grid item xs={12} key={job.id}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <Typography variant="subtitle1" fontWeight="600">
                                {job.job_name}
                              </Typography>
                              <Chip
                                label={job.enabled ? 'Enabled' : 'Paused'}
                                color={job.enabled ? 'success' : 'default'}
                                size="small"
                              />
                              {job.is_running && (
                                <Chip
                                  label="Running"
                                  color="info"
                                  size="small"
                                />
                              )}
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                              <Chip
                                label={getSchedulePresetLabel(job.schedule)}
                                size="small"
                                variant="outlined"
                              />
                              <Chip
                                label={`Method: ${job.method}`}
                                size="small"
                                variant="outlined"
                              />
                              <Chip
                                label={`On success: ${job.on_success}`}
                                size="small"
                                variant="outlined"
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
                              <Alert severity="error" sx={{ mt: 1 }} size="small">
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
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, ml: 2 }}>
                            <Tooltip title={job.enabled ? 'Pause job' : 'Resume job'}>
                              <IconButton
                                size="small"
                                onClick={() => handleToggleJob(job)}
                              >
                                {job.enabled ? <PauseIcon /> : <PlayIcon />}
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Run now">
                              <IconButton
                                size="small"
                                onClick={() => handleRunJobNow(job.id)}
                              >
                                <PlayArrowIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete job">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteJob(job.id)}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>

          {/* Job Creation Form */}
          {showJobForm && (
            <Card sx={{ mb: 2 }} variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight="600" gutterBottom>
                  Create New Recurring Job
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Job Name"
                      value={newJob.job_name}
                      onChange={(e) => setNewJob({ ...newJob, job_name: e.target.value })}
                      placeholder="e.g., poll_youtube_channel"
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
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
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Method</InputLabel>
                      <Select
                        value={newJob.method}
                        label="Method"
                        onChange={(e) => setNewJob({ ...newJob, method: e.target.value })}
                      >
                        <MenuItem value="discover_sources">Discover Sources</MenuItem>
                        <MenuItem value="archive">Archive</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>On Success</InputLabel>
                      <Select
                        value={newJob.on_success}
                        label="On Success"
                        onChange={(e) => setNewJob({ ...newJob, on_success: e.target.value })}
                      >
                        <MenuItem value="log_only">Log Only</MenuItem>
                        <MenuItem value="archive_all">Archive All</MenuItem>
                        <MenuItem value="archive_new">Archive New Only</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
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
        </TabPanel>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        {tabValue < 2 && (
          <>
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
          </>
        )}
        {tabValue === 2 && (
          <Button onClick={handleClose} disabled={saving}>
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
};

export default PluginConfigModal;
