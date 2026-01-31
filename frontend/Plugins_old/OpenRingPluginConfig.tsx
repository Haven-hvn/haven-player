import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, Grid,
  Card, CardContent, Switch, FormControlLabel,
  Chip, Alert, CircularProgress
} from '@mui/material';
import { 
  Login as LoginIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';
import { OpenRingPluginConfig as OpenRingPluginConfigType } from '@/types/plugin';
import { openringService } from '@/services/api';

interface OpenRingPluginConfigProps {
  config: OpenRingPluginConfigType;
  onChange: (newConfig: OpenRingPluginConfigType) => void;
}

export function OpenRingPluginConfig({ config, onChange }: OpenRingPluginConfigProps) {
  const [authState, setAuthState] = useState<{
    authenticated: boolean;
    status: string;
    expires_at?: string;
    loading: boolean;
  }>({ authenticated: false, status: 'unknown', loading: true });

  const [loginForm, setLoginForm] = useState({ email: '', password: '', code: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorPrompt, setTwoFactorPrompt] = useState('');

  // Check auth status on mount
  const checkAuth = useCallback(async () => {
    setAuthState(prev => ({ ...prev, loading: true }));
    try {
      const status = await openringService.getAuthStatus();
      setAuthState({
        authenticated: status.authenticated,
        status: status.status,
        expires_at: status.expires_at,
        loading: false
      });
    } catch (err) {
      console.error('Failed to check auth status:', err);
      setAuthState(prev => ({ ...prev, loading: false, status: 'error' }));
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await openringService.login(
        loginForm.email, 
        loginForm.password, 
        twoFactorRequired ? loginForm.code : undefined
      );

      if (result.success) {
        setTwoFactorRequired(false);
        setLoginForm({ email: '', password: '', code: '' });
        await checkAuth();
      } else if (result.status === 'two_factor_required') {
        setTwoFactorRequired(true);
        setTwoFactorPrompt(result.error || 'Two-factor authentication required');
        // Keep loading false so user can enter code
      } else {
        setLoginError(result.error || 'Login failed');
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await openringService.logout();
      await checkAuth();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (authState.loading) {
    return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Authentication Section */}
      <Card variant="outlined">
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Ring Account</Typography>
            <Chip 
              label={authState.authenticated ? "Connected" : "Not Connected"} 
              color={authState.authenticated ? "success" : "default"}
              variant="outlined"
            />
          </Box>

          {!authState.authenticated ? (
            <Box component="form" noValidate autoComplete="off">
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  {loginError && <Alert severity="error" sx={{ mb: 2 }}>{loginError}</Alert>}
                  {twoFactorRequired && <Alert severity="info" sx={{ mb: 2 }}>{twoFactorPrompt}</Alert>}
                </Grid>
                
                {!twoFactorRequired ? (
                  <>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        label="Email"
                        type="email"
                        value={loginForm.email}
                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                        disabled={isLoggingIn}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        label="Password"
                        type="password"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        disabled={isLoggingIn}
                      />
                    </Grid>
                  </>
                ) : (
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Verification Code"
                      value={loginForm.code}
                      onChange={(e) => setLoginForm({ ...loginForm, code: e.target.value })}
                      disabled={isLoggingIn}
                      autoFocus
                    />
                  </Grid>
                )}

                <Grid size={{ xs: 12 }}>
                  <Button
                    variant="contained"
                    startIcon={<LoginIcon />}
                    onClick={handleLogin}
                    disabled={isLoggingIn || (!twoFactorRequired && (!loginForm.email || !loginForm.password))}
                  >
                    {isLoggingIn ? 'Signing in...' : (twoFactorRequired ? 'Verify Code' : 'Sign In')}
                  </Button>
                  {twoFactorRequired && (
                    <Button 
                      onClick={() => { setTwoFactorRequired(false); setLoginError(null); }}
                      sx={{ ml: 1 }}
                    >
                      Cancel
                    </Button>
                  )}
                </Grid>
              </Grid>
            </Box>
          ) : (
            <Box display="flex" alignItems="center" gap={2}>
              <Typography variant="body2" color="text.secondary">
                Authentication active.
                {authState.expires_at && ` Expires: ${new Date(authState.expires_at).toLocaleString()}`}
              </Typography>
              <Button 
                variant="outlined" 
                color="error" 
                size="small" 
                startIcon={<LogoutIcon />}
                onClick={handleLogout}
              >
                Sign Out
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Settings Section */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Recording Settings</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Segment Duration (seconds)"
                value={config.segment_duration}
                onChange={(e) => onChange({ ...config, segment_duration: Number(e.target.value) })}
                helperText="Duration of each recorded video segment"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.auto_recording_enabled}
                    onChange={(e) => onChange({ ...config, auto_recording_enabled: e.target.checked })}
                  />
                }
                label="Enable Auto Recording"
              />
              <Typography variant="caption" display="block" color="text.secondary">
                Automatically record subscribed devices when online
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
