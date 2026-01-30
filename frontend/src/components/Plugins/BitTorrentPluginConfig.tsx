import React from 'react';
import {
  Box, Typography, TextField, Switch, FormControl, FormControlLabel,
  InputLabel, Select, MenuItem, Card, CardContent,
  IconButton, Button, Grid, Divider, Chip, Alert, Paper
} from '@mui/material';
import { Add, Delete, CloudDownload as TorrentIcon, Link as LinkIcon } from '@mui/icons-material';
import type { BitTorrentPluginConfig } from '@/types/plugin';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';

interface BitTorrentPluginConfigProps {
  config: BitTorrentPluginConfig;
  onChange: (config: BitTorrentPluginConfig) => void;
}

export function BitTorrentPluginConfig({ config, onChange }: BitTorrentPluginConfigProps) {
  // Ensure subscriptions array exists
  const subscriptions = config.subscriptions || [];

  // Add a new subscription
  const addSubscription = () => {
    onChange({
      ...config,
      subscriptions: [
        ...subscriptions,
        {
          search_term: '',
          enabled: true,
          auto_archive: true,
        },
      ],
    });
  };

  // Remove a subscription
  const removeSubscription = (index: number) => {
    onChange({
      ...config,
      subscriptions: subscriptions.filter((_, i) => i !== index),
    });
  };

  // Update subscription field
  const updateSubscription = (index: number, field: string, value: any) => {
    const updatedSubscriptions = [...subscriptions];
    updatedSubscriptions[index] = { ...updatedSubscriptions[index], [field]: value };
    onChange({ ...config, subscriptions: updatedSubscriptions });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Torrent Subscriptions */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {/* Rounded square icon */}
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: liquidGlassTokens.radius.sm,
                background: 'rgba(79, 195, 247, 0.15)',
                border: '1px solid rgba(79, 195, 247, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TorrentIcon sx={{ color: '#4FC3F7', fontSize: 20 }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem' }}>
              Torrent Subscriptions
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={addSubscription}
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
            Add Subscription
          </Button>
        </Box>

        {subscriptions.length === 0 ? (
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
            <TorrentIcon sx={{ color: 'rgba(255, 255, 255, 0.2)', fontSize: 40, mb: 1 }} />
            <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              No subscriptions configured
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.3)', display: 'block', mt: 0.5 }}>
              Add search terms to discover torrents via Glitter Protocol
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {subscriptions.map((subscription, index) => (
              <Grid size={{ xs: 12, md: 6 }} key={index}>
                <Card
                  elevation={0}
                  sx={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${subscription.enabled ? 'rgba(79, 195, 247, 0.3)' : liquidGlassTokens.glass.border}`,
                    borderRadius: liquidGlassTokens.radius.md,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: subscription.enabled ? 'rgba(79, 195, 247, 0.5)' : 'rgba(255, 255, 255, 0.2)',
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
                            background: subscription.enabled ? 'rgba(79, 195, 247, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${subscription.enabled ? 'rgba(79, 195, 247, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <TorrentIcon sx={{ color: subscription.enabled ? '#4FC3F7' : 'rgba(255, 255, 255, 0.3)', fontSize: 16 }} />
                        </Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#fff' }}>
                          Subscription {index + 1}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={subscription.enabled ? 'Enabled' : 'Disabled'}
                          size="small"
                          sx={{
                            backgroundColor: subscription.enabled ? `${liquidGlassTokens.neon.success}20` : 'rgba(255, 255, 255, 0.08)',
                            color: subscription.enabled ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.5)',
                            border: `1px solid ${subscription.enabled ? `${liquidGlassTokens.neon.success}40` : 'rgba(255, 255, 255, 0.1)'}`,
                            fontWeight: 500,
                            height: 24,
                          }}
                        />
                        <IconButton
                          size="small"
                          onClick={() => removeSubscription(index)}
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
                      label="Search Term"
                      value={subscription.search_term}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSubscription(index, 'search_term', e.target.value)}
                      placeholder="e.g., ubuntu iso, debian live"
                      helperText="Search term for finding torrents on Glitter Protocol"
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

                    <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={subscription.enabled}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSubscription(index, 'enabled', e.target.checked)}
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
                            checked={subscription.auto_archive}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSubscription(index, 'auto_archive', e.target.checked)}
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
                        label={<Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.875rem' }}>Auto Download</Typography>}
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
            <LinkIcon sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 18 }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem' }}>
            Global Settings
          </Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              size="small"
              label="Glitter Endpoint URL"
              value={config.glitter_endpoint}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...config, glitter_endpoint: e.target.value })}
              helperText="URL for the Glitter protocol index endpoint"
              placeholder="https://gw.magnode.ru/v1/sql/query"
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
      </Box>
    </Box>
  );
}
