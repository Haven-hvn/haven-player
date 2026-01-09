import React from 'react';
import {
  Box, Typography, TextField, Switch, FormControl, FormControlLabel,
  InputLabel, Select, MenuItem, Card, CardContent,
  IconButton, Button, Grid, Divider, Chip, Alert
} from '@mui/material';
import { Add, Delete, CloudDownload as TorrentIcon } from '@mui/icons-material';
import type { BitTorrentPluginConfig } from '@/types/plugin';

interface BitTorrentPluginConfigProps {
  config: BitTorrentPluginConfig;
  onChange: (config: BitTorrentPluginConfig) => void;
}

export function BitTorrentPluginConfig({ config, onChange }: BitTorrentPluginConfigProps) {
  // Add a new subscription
  const addSubscription = () => {
    onChange({
      ...config,
      subscriptions: [
        ...config.subscriptions,
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
      subscriptions: config.subscriptions.filter((_, i) => i !== index),
    });
  };

  // Update subscription field
  const updateSubscription = (index: number, field: string, value: any) => {
    const updatedSubscriptions = [...config.subscriptions];
    updatedSubscriptions[index] = { ...updatedSubscriptions[index], [field]: value };
    onChange({ ...config, subscriptions: updatedSubscriptions });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Torrent Subscriptions */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TorrentIcon color="primary" />
            Torrent Subscriptions
          </Typography>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={addSubscription}
            size="small"
          >
            Add Subscription
          </Button>
        </Box>

        {config.subscriptions.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            No subscriptions configured. Add search terms to start discovering torrents via Glitter Protocol.
          </Alert>
        ) : (
          <Grid container spacing={2}>
            {config.subscriptions.map((subscription, index) => (
              <Grid size={{ xs: 12, md: 6 }} key={index}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TorrentIcon color="primary" fontSize="small" />
                        <Typography variant="subtitle2">Subscription {index + 1}</Typography>
                      </Box>
                      <div>
                        <Chip
                          label={subscription.enabled ? 'Enabled' : 'Disabled'}
                          size="small"
                          color={subscription.enabled ? 'success' : 'default'}
                          sx={{ mr: 1 }}
                        />
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeSubscription(index)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </div>
                    </Box>

                    <TextField
                      fullWidth
                      size="small"
                      label="Search Term"
                      value={subscription.search_term}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSubscription(index, 'search_term', e.target.value)}
                      placeholder="e.g., ubuntu iso, debian live"
                      helperText="Search term for finding torrents on Glitter Protocol"
                      sx={{ mb: 1.5 }}
                    />

                    <Box sx={{ mt: 2 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={subscription.enabled}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSubscription(index, 'enabled', e.target.checked)}
                          />
                        }
                        label="Enabled"
                        sx={{ mr: 2 }}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={subscription.auto_archive}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSubscription(index, 'auto_archive', e.target.checked)}
                          />
                        }
                        label="Auto Download"
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
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              size="small"
              label="Glitter Endpoint URL"
              value={config.glitter_endpoint}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...config, glitter_endpoint: e.target.value })}
              helperText="URL for the Glitter protocol index endpoint"
              placeholder="https://gw.magnode.ru/v1/sql/query"
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Max Concurrent Downloads"
              value={config.max_concurrent_downloads}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...config, max_concurrent_downloads: Number(e.target.value) })}
              helperText="Maximum simultaneous torrent downloads"
              inputProps={{ min: 1, max: 10 }}
            />
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
