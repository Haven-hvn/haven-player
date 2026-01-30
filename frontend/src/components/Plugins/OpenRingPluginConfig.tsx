import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, Grid,
  Card, CardContent, Switch, FormControlLabel,
  Chip, Alert, CircularProgress, Paper
} from '@mui/material';
import { 
  Login as LoginIcon,
  Logout as LogoutIcon,
  Videocam as RingIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { OpenRingPluginConfig as OpenRingPluginConfigType } from '@/types/plugin';
import { openringService } from '@/services/api';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';

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
      <Card
        elevation={0}
        sx={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${authState.authenticated ? `${liquidGlassTokens.neon.success}30` : liquidGlassTokens.glass.border}`,
          borderRadius: liquidGlassTokens.radius.md,
        }}
      >
        <CardContent sx={{ p: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={ 2}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: liquidGlassTokens.radius.sm,
                  background: authState.authenticated ? `${liquidGlassTokens.neon.success}15` : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${authState.authenticated ? `${liquidGlassTokens.neon.success}30` : liquidGlassTokens.glass.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RingIcon sx={{ color: authState.authenticated ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.5)', fontSize: 20 }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem' }}>
                Ring Account
              </Typography>
            </Box>
            <Chip
              label={authState.authenticated ? "Connected" : "Not Connected"}
              size="small"
              sx={{
                backgroundColor: authState.authenticated ? `${liquidGlassTokens.neon.success}20` : 'rgba(255, 255, 255, 0.08)',
                color: authState.authenticated ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.5)',
                border: `1px solid ${authState.authenticated ? `${liquidGlassTokens.neon.success}40` : 'rgba(255, 255, 255, 0.1)'}`,
                fontWeight: 500,
              }}
            />
          </Box>

          {!authState.authenticated ? (
            <Box component="form" noValidate autoComplete="off">
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  {loginError && (
                    <Alert
                      severity="error"
                      sx={{
                        mb: 2,
                        backgroundColor: `${liquidGlassTokens.neon.error}10`,
                        border: `1px solid ${liquidGlassTokens.neon.error}30`,
                        color: liquidGlassTokens.neon.error,
                      }}
                    >
                      {loginError}
                    </Alert>
                  )}
                  {twoFactorRequired && (
                    <Alert
                      severity="info"
                      sx={{
                        mb: 2,
                        backgroundColor: `${liquidGlassTokens.neon.cyan}10`,
                        border: `1px solid ${liquidGlassTokens.neon.cyan}30`,
                        color: liquidGlassTokens.neon.cyan,
                      }}
                    >
                      {twoFactorPrompt}
                    </Alert>
                  )}
                </Grid>

                {!twoFactorRequired ? (
                  <>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Email"
                        type="email"
                        value={loginForm.email}
                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                        disabled={isLoggingIn}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: liquidGlassTokens.radius.sm,
                          },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Password"
                        type="password"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        disabled={isLoggingIn}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: liquidGlassTokens.radius.sm,
                          },
                        }}
                      />
                    </Grid>
                  </>
                ) : (
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Verification Code"
                      value={loginForm.code}
                      onChange={(e) => setLoginForm({ ...loginForm, code: e.target.value })}
                      disabled={isLoggingIn}
                      autoFocus
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          borderRadius: liquidGlassTokens.radius.sm,
                        },
                      }}
                    />
                  </Grid>
                )}

                <Grid size={{ xs: 12 }}>
                  <Button
                    variant="contained"
                    startIcon={<LoginIcon />}
                    onClick={handleLogin}
                    disabled={isLoggingIn || (!twoFactorRequired && (!loginForm.email || !loginForm.password))}
                    sx={{
                      background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}40 0%, ${liquidGlassTokens.neon.cyan}20 100%)`,
                      border: `1px solid ${liquidGlassTokens.neon.cyan}60`,
                      color: '#fff',
                      textTransform: 'none',
                      '&:hover': {
                        background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}50 0%, ${liquidGlassTokens.neon.cyan}30 100%)`,
                      },
                      '&:disabled': {
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                      },
                    }}
                  >
                    {isLoggingIn ? 'Signing in...' : (twoFactorRequired ? 'Verify Code' : 'Sign In')}
                  </Button>
                  {twoFactorRequired && (
                    <Button
                      onClick={() => { setTwoFactorRequired(false); setLoginError(null); }}
                      sx={{
                        ml: 1,
                        color: 'rgba(255, 255, 255, 0.5)',
                        textTransform: 'none',
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </Grid>
              </Grid>
            </Box>
          ) : (
            <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
              <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                Authentication active.
                {authState.expires_at && ` Expires: ${new Date(authState.expires_at).toLocaleString()}`}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<LogoutIcon />}
                onClick={handleLogout}
                sx={{
                  borderColor: liquidGlassTokens.neon.error,
                  color: liquidGlassTokens.neon.error,
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: `${liquidGlassTokens.neon.error}10`,
                    borderColor: liquidGlassTokens.neon.error,
                  },
                }}
              >
                Sign Out
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Settings Section */}
      <Card
        elevation={0}
        sx={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${liquidGlassTokens.glass.border}`,
          borderRadius: liquidGlassTokens.radius.md,
        }}
      >
        <CardContent sx={{ p: 2 }}>
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
              <SettingsIcon sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 18 }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem' }}>
              Recording Settings
            </Typography>
          </Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Segment Duration (seconds)"
                value={config.segment_duration}
                onChange={(e) => onChange({ ...config, segment_duration: Number(e.target.value) })}
                helperText="Duration of each recorded video segment"
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
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.auto_recording_enabled}
                    onChange={(e) => onChange({ ...config, auto_recording_enabled: e.target.checked })}
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
                label={<Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.875rem' }}>Enable Auto Recording</Typography>}
              />
              <Typography variant="caption" display="block" sx={{ color: 'rgba(255, 255, 255, 0.4)', mt: 0.5 }}>
                Automatically record subscribed devices when online
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
