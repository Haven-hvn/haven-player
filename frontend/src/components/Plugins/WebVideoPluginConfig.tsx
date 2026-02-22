import React from 'react';
import {
  Box, Typography, TextField, Switch, FormControl, FormControlLabel,
  InputLabel, Select, MenuItem, Card, CardContent,
  IconButton, Button, Grid, Divider, Chip, Alert, Paper
} from '@mui/material';
import { Add, Delete, Language, CheckCircle, Label } from '@mui/icons-material';
import type { WebVideoPluginConfig as WebVideoPluginConfigType } from '@/types/plugin';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';

interface WebVideoPluginConfigProps {
  config: WebVideoPluginConfigType;
  onChange: (config: WebVideoPluginConfigType) => void;
}

export function WebVideoPluginConfig({ config, onChange }: WebVideoPluginConfigProps) {
  // Ensure config has default values
  const safeConfig = {
    domain: '',
    api_endpoint: 'api/videos',
    tags: [],
    ...config,
  };

  const tags = safeConfig.tags || [];

  // Update domain
  const updateDomain = (domain: string) => {
    onChange({ ...safeConfig, domain });
  };

  // Update API endpoint
  const updateApiEndpoint = (api_endpoint: string) => {
    onChange({ ...safeConfig, api_endpoint });
  };

  // Add a new tag subscription
  const addTag = () => {
    const newTag = {
      name: '',
      enabled: true,
      video_format: 'mp4' as const,
      video_quality: 'best' as const,
      download_subtitles: false,
      auto_archive: true,
    };
    onChange({
      ...safeConfig,
      tags: [...tags, newTag],
    });
  };

  // Remove a tag
  const removeTag = (index: number) => {
    onChange({
      ...safeConfig,
      tags: tags.filter((_, i) => i !== index),
    });
  };

  // Update tag field
  const updateTag = (index: number, field: string, value: any) => {
    const updatedTags = [...tags];
    updatedTags[index] = { ...updatedTags[index], [field]: value };
    onChange({ ...safeConfig, tags: updatedTags });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Domain Configuration */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: liquidGlassTokens.radius.sm,
              background: 'rgba(0, 150, 255, 0.15)',
              border: '1px solid rgba(0, 150, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Language sx={{ color: '#0096FF', fontSize: 20 }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem' }}>
            API Configuration
          </Typography>
        </Box>

        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            background: 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${liquidGlassTokens.glass.border}`,
            borderRadius: liquidGlassTokens.radius.md,
          }}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="Domain"
                value={safeConfig.domain}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateDomain(e.target.value)}
                placeholder="example.com or https://example.com"
                helperText="Domain of the video website API"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: liquidGlassTokens.radius.sm,
                  },
                  '& .MuiFormHelperText-root': {
                    color: 'rgba(255, 255, 255, 0.4)',
                  },
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="API Endpoint"
                value={safeConfig.api_endpoint}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateApiEndpoint(e.target.value)}
                placeholder="api/videos"
                helperText="API endpoint path (default: api/videos)"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: liquidGlassTokens.radius.sm,
                  },
                  '& .MuiFormHelperText-root': {
                    color: 'rgba(255, 255, 255, 0.4)',
                  },
                }}
              />
            </Grid>
          </Grid>

          <Alert
            severity="info"
            sx={{
              mt: 2,
              backgroundColor: 'rgba(0, 150, 255, 0.1)',
              border: '1px solid rgba(0, 150, 255, 0.2)',
              color: 'rgba(255, 255, 255, 0.8)',
              '& .MuiAlert-icon': {
                color: '#0096FF',
              },
            }}
          >
            The plugin will use the standardized endpoint pattern:{' '}
            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>
              {'{domain}/{endpoint}?limit=32&page=1&tags={tag}&tagMode=OR&expandTags=false'}
            </code>
          </Alert>
        </Paper>
      </Box>

      <Divider sx={{ borderColor: liquidGlassTokens.glass.border }} />

      {/* Tag Subscriptions */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: liquidGlassTokens.radius.sm,
                background: 'rgba(156, 39, 176, 0.15)',
                border: '1px solid rgba(156, 39, 176, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Label sx={{ color: '#9C27B0', fontSize: 20 }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem' }}>
              Tag Subscriptions
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={addTag}
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
            Add Tag
          </Button>
        </Box>

        {tags.length === 0 ? (
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
            <Label sx={{ color: 'rgba(255, 255, 255, 0.2)', fontSize: 40, mb: 1 }} />
            <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              No tags configured
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.3)', display: 'block', mt: 0.5 }}>
              Add tags to start archiving videos by category
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {tags.map((tag, index) => (
              <Grid size={{ xs: 12, md: 6 }} key={index}>
                <Card
                  elevation={0}
                  sx={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${tag.enabled ? 'rgba(156, 39, 176, 0.3)' : liquidGlassTokens.glass.border}`,
                    borderRadius: liquidGlassTokens.radius.md,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: tag.enabled ? 'rgba(156, 39, 176, 0.5)' : 'rgba(255, 255, 255, 0.2)',
                      background: 'rgba(255, 255, 255, 0.05)',
                    },
                  }}
                >
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: liquidGlassTokens.radius.sm,
                            background: tag.enabled ? 'rgba(156, 39, 176, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${tag.enabled ? 'rgba(156, 39, 176, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Label sx={{ color: tag.enabled ? '#9C27B0' : 'rgba(255, 255, 255, 0.3)', fontSize: 16 }} />
                        </Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#fff' }}>
                          Tag {index + 1}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={tag.enabled ? 'Enabled' : 'Disabled'}
                          size="small"
                          sx={{
                            backgroundColor: tag.enabled ? `${liquidGlassTokens.neon.success}20` : 'rgba(255, 255, 255, 0.08)',
                            color: tag.enabled ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.5)',
                            border: `1px solid ${tag.enabled ? `${liquidGlassTokens.neon.success}40` : 'rgba(255, 255, 255, 0.1)'}`,
                            fontWeight: 500,
                            height: 24,
                          }}
                        />
                        <IconButton
                          size="small"
                          onClick={() => removeTag(index)}
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
                      label="Tag Name"
                      value={tag.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTag(index, 'name', e.target.value)}
                      placeholder="e.g., Action, Tutorial, Music"
                      sx={{ 
                        mb: 1.5,
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          borderRadius: liquidGlassTokens.radius.sm,
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
                            value={tag.video_format || 'mp4'}
                            label="Video Format"
                            onChange={(e: any) => updateTag(index, 'video_format', e.target.value)}
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
                            value={tag.video_quality || 'best'}
                            label="Quality"
                            onChange={(e: any) => updateTag(index, 'video_quality', e.target.value)}
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
                            checked={tag.enabled}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTag(index, 'enabled', e.target.checked)}
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
                            checked={tag.auto_archive}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTag(index, 'auto_archive', e.target.checked)}
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
