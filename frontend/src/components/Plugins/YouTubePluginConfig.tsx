import React from 'react';
import {
  Box, Typography, TextField, Switch, FormControl, FormControlLabel,
  InputLabel, Select, MenuItem, Card, CardContent,
  IconButton, Button, Grid, Divider, Chip, Alert
} from '@mui/material';
import { Add, Delete, YouTube as YouTubeIcon } from '@mui/icons-material';
import { YouTubePluginConfig } from '@/types/plugin';

interface YouTubePluginConfigProps {
  config: YouTubePluginConfig;
  onChange: (config: YouTubePluginConfig) => void;
}

export function YouTubePluginConfig({ config, onChange }: YouTubePluginConfigProps) {
  // Add a new channel
  const addChannel = () => {
    onChange({
      ...config,
      channels: [
        ...config.channels,
        {
          name: '',
          channel_url: '',
          enabled: true,
          video_format: 'mp4',
          video_quality: 'best',
          download_subtitles: false,
          auto_archive: true,
        },
      ],
    });
  };

  // Remove a channel
  const removeChannel = (index: number) => {
    onChange({
      ...config,
      channels: config.channels.filter((_, i) => i !== index),
    });
  };

  // Update channel field
  const updateChannel = (index: number, field: string, value: any) => {
    const updatedChannels = [...config.channels];
    updatedChannels[index] = { ...updatedChannels[index], [field]: value };
    onChange({ ...config, channels: updatedChannels });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Channel Subscriptions */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <YouTubeIcon color="error" />
            Channel Subscriptions
          </Typography>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={addChannel}
            size="small"
          >
            Add Channel
          </Button>
        </Box>

        {config.channels.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            No channels configured. Add channels to start archiving.
          </Alert>
        ) : (
          <Grid container spacing={2}>
            {config.channels.map((channel, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <YouTubeIcon color="error" fontSize="small" />
                        <Typography variant="subtitle2">Channel {index + 1}</Typography>
                      </Box>
                      <div>
                        <Chip
                          label={channel.enabled ? 'Enabled' : 'Disabled'}
                          size="small"
                          color={channel.enabled ? 'success' : 'default'}
                          sx={{ mr: 1 }}
                        />
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeChannel(index)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </div>
                    </Box>

                    <TextField
                      fullWidth
                      size="small"
                      label="Channel Name"
                      value={channel.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateChannel(index, 'name', e.target.value)}
                      placeholder="e.g., TED Talks"
                      sx={{ mb: 1.5 }}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      label="Channel URL"
                      value={channel.channel_url}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateChannel(index, 'channel_url', e.target.value)}
                      placeholder="https://youtube.com/@TED"
                      helperText="YouTube channel URL"
                      sx={{ mb: 1.5 }}
                    />

                    <Grid container spacing={1}>
                      <Grid item xs={6}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Video Format</InputLabel>
                          <Select
                            value={channel.video_format || 'mp4'}
                            label="Video Format"
                            onChange={(e: any) => updateChannel(index, 'video_format', e.target.value)}
                          >
                            <MenuItem value="mp4">MP4</MenuItem>
                            <MenuItem value="webm">WebM</MenuItem>
                            <MenuItem value="mkv">MKV</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={6}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Quality</InputLabel>
                          <Select
                            value={channel.video_quality || 'best'}
                            label="Quality"
                            onChange={(e: any) => updateChannel(index, 'video_quality', e.target.value)}
                          >
                            <MenuItem value="best">Best Available</MenuItem>
                            <MenuItem value="1080p">1080p</MenuItem>
                            <MenuItem value="720p">720p</MenuItem>
                            <MenuItem value="480p">480p</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                    </Grid>

                    <Box sx={{ mt: 2 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={channel.enabled}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateChannel(index, 'enabled', e.target.checked)}
                          />
                        }
                        label="Enabled"
                        sx={{ mr: 2 }}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={channel.download_subtitles}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateChannel(index, 'download_subtitles', e.target.checked)}
                          />
                        }
                        label="Download Subtitles"
                        sx={{ mr: 2 }}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={channel.auto_archive}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateChannel(index, 'auto_archive', e.target.checked)}
                          />
                        }
                        label="Auto Archive"
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      <Divider />

      {/* Global Settings */}
      <Box>
        <Typography variant="h6" gutterBottom>Global Settings</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Poll Interval (minutes)"
              value={config.poll_interval_minutes}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...config, poll_interval_minutes: Number(e.target.value) })}
              helperText="How often to check for new videos"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Max Concurrent Downloads"
              value={config.max_concurrent_downloads}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...config, max_concurrent_downloads: Number(e.target.value) })}
              helperText="Maximum simultaneous downloads"
            />
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}