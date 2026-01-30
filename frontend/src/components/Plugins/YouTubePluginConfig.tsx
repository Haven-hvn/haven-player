import React from 'react';
import {
  Box, Typography, TextField, Switch, FormControl, FormControlLabel,
  InputLabel, Select, MenuItem, Card, CardContent,
  IconButton, Button, Grid, Divider, Chip, Alert, Paper
} from '@mui/material';
import { Add, Delete, YouTube as YouTubeIcon, CheckCircle } from '@mui/icons-material';
import type { YouTubePluginConfig } from '@/types/plugin';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';
interface YouTubePluginConfigProps {
  config: YouTubePluginConfig;
  onChange: (config: YouTubePluginConfig) => void;
}

export function YouTubePluginConfig({ config, onChange }: YouTubePluginConfigProps) {
  // Ensure channels array exists
  const channels = config.channels || [];

  // Add a new channel
  const addChannel = () => {
    onChange({
      ...config,
      channels: [
        ...channels,
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
      channels: channels.filter((_, i) => i !== index),
    });
  };

  // Update channel field
  const updateChannel = (index: number, field: string, value: any) => {
    const updatedChannels = [...channels];
    updatedChannels[index] = { ...updatedChannels[index], [field]: value };
    onChange({ ...config, channels: updatedChannels });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Channel Subscriptions */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {/* Rounded square icon, not circle */}
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: liquidGlassTokens.radius.sm,
                background: 'rgba(255, 0, 0, 0.15)',
                border: '1px solid rgba(255, 0, 0, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <YouTubeIcon sx={{ color: '#FF0000', fontSize: 20 }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem' }}>
              Channel Subscriptions
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={addChannel}
            size="small"
            sx={{
              borderColor: 'rgba(255, 255, 255, 0.2)',
              color: 'rgba(255, 255, 255, 0.8)',
              textTransform: 'none',
              '&:hover': {
                borderColor: liquidGlassTokens.neon.cyan,
                backgroundColor: `${liquidGlassTokens.neon.cyan}10`,
              },
            }}
          >
            Add Channel
          </Button>
        </Box>

        {channels.length === 0 ? (
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
            <YouTubeIcon sx={{ color: 'rgba(255, 255, 255, 0.2)', fontSize: 40, mb: 1 }} />
            <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              No channels configured
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.3)', display: 'block', mt: 0.5 }}>
              Add YouTube channels to start archiving videos
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {channels.map((channel, index) => (
              <Grid size={{ xs: 12, md: 6 }} key={index}>
                <Card
                  elevation={0}
                  sx={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${channel.enabled ? 'rgba(255, 0, 0, 0.3)' : liquidGlassTokens.glass.border}`,
                    borderRadius: liquidGlassTokens.radius.md,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: channel.enabled ? 'rgba(255, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.2)',
                      background: 'rgba(255, 255, 255, 0.05)',
                    },
                  }}
                >
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {/* Small rounded square indicator instead of circle */}
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: liquidGlassTokens.radius.sm,
                            background: channel.enabled ? 'rgba(255, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${channel.enabled ? 'rgba(255, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <YouTubeIcon sx={{ color: channel.enabled ? '#FF0000' : 'rgba(255, 255, 255, 0.3)', fontSize: 16 }} />
                        </Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#fff' }}>
                          Channel {index + 1}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={channel.enabled ? 'Enabled' : 'Disabled'}
                          size="small"
                          sx={{
                            backgroundColor: channel.enabled ? `${liquidGlassTokens.neon.success}20` : 'rgba(255, 255, 255, 0.08)',
                            color: channel.enabled ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.5)',
                            border: `1px solid ${channel.enabled ? `${liquidGlassTokens.neon.success}40` : 'rgba(255, 255, 255, 0.1)'}`,
                            fontWeight: 500,
                            height: 24,
                          }}
                        />
                        <IconButton
                          size="small"
                          onClick={() => removeChannel(index)}
                          sx={{
                            color: 'rgba(255, 255, 255, 0.4)',
                            '&:hover': {
                              color: liquidGlassTokens.neon.error,
                              backgroundColor: `${liquidGlassTokens.neon.error}10`,
                            },
                          }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>

                    <TextField
                      fullWidth
                      size="small"
                      label="Channel Name"
                      value={channel.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateChannel(index, 'name', e.target.value)}
                      placeholder="e.g., TED Talks"
                      sx={{ 
                        mb: 1.5,
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          borderRadius: liquidGlassTokens.radius.sm,
                        },
                      }}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      label="Channel URL"
                      value={channel.channel_url}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateChannel(index, 'channel_url', e.target.value)}
                      placeholder="https://youtube.com/@TED"
                      helperText="YouTube channel URL"
                      sx={{ 
                        mb: 1.5,
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          borderRadius: liquidGlassTokens.radius.sm,
                        },
                        '& .MuiFormHelperText-root': {
                          color: 'rgba(255, 255, 255, 0.4)',
                        },
                      }}
                    />

                    <Grid container spacing={1}>
                      <Grid size={{ xs: 6 }}>
                        <FormControl 
                          fullWidth 
                          size="small"
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              backgroundColor: 'rgba(255, 255, 255, 0.03)',
                              borderRadius: liquidGlassTokens.radius.sm,
                            },
                          }}
                        >
                          <InputLabel sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>Video Format</InputLabel>
                          <Select
                            value={channel.video_format || 'mp4'}
                            label="Video Format"
                            onChange={(e: any) => updateChannel(index, 'video_format', e.target.value)}
                            sx={{ color: '#fff' }}
                          >
                            <MenuItem value="mp4">MP4</MenuItem>
                            <MenuItem value="webm">WebM</MenuItem>
                            <MenuItem value="mkv">MKV</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <FormControl 
                          fullWidth 
                          size="small"
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              backgroundColor: 'rgba(255, 255, 255, 0.03)',
                              borderRadius: liquidGlassTokens.radius.sm,
                            },
                          }}
                        >
                          <InputLabel sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>Quality</InputLabel>
                          <Select
                            value={channel.video_quality || 'best'}
                            label="Quality"
                            onChange={(e: any) => updateChannel(index, 'video_quality', e.target.value)}
                            sx={{ color: '#fff' }}
                          >
                            <MenuItem value="best">Best Available</MenuItem>
                            <MenuItem value="1080p">1080p</MenuItem>
                            <MenuItem value="720p">720p</MenuItem>
                            <MenuItem value="480p">480p</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                    </Grid>

                    <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={channel.enabled}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateChannel(index, 'enabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: liquidGlassTokens.neon.success,
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: `${liquidGlassTokens.neon.success}60`,
                              },
                            }}
                          />
                        }
                        label={<Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.875rem' }}>Enabled</Typography>}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={channel.download_subtitles}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateChannel(index, 'download_subtitles', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: liquidGlassTokens.neon.cyan,
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: `${liquidGlassTokens.neon.cyan}60`,
                              },
                            }}
                          />
                        }
                        label={<Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.875rem' }}>Subtitles</Typography>}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={channel.auto_archive}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateChannel(index, 'auto_archive', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: liquidGlassTokens.neon.magenta,
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: `${liquidGlassTokens.neon.magenta}60`,
                              },
                            }}
                          />
                        }
                        label={<Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.875rem' }}>Auto Archive</Typography>}
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

      <Divider sx={{ borderColor: liquidGlassTokens.glass.border }} />

      {/* Global Settings */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: liquidGlassTokens.radius.sm,
              background: 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${liquidGlassTokens.glass.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 18 }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem' }}>
            Global Settings
          </Typography>
        </Box>
        
        <Paper
          elevation={0}
          sx={{
            p: 2,
            background: 'rgba(0, 245, 255, 0.05)',
            border: `1px solid ${liquidGlassTokens.neon.cyan}30`,
            borderRadius: liquidGlassTokens.radius.md,
          }}
        >
          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
            <strong style={{ color: liquidGlassTokens.neon.cyan }}>Automatic Polling:</strong> Configure recurring jobs in the{' '}
            <strong>"Recurring Jobs"</strong> tab to automatically check for new videos on a schedule (e.g., every 15 minutes).
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}