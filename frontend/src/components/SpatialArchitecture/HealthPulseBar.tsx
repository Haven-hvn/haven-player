/**
 * Health Pulse Bar - Zone 3 (Top Header) - ORIENTATION ONLY
 * 
 * Displays system-level health indicators: backend status, wallet connection,
 * encryption status, DePIN points/streak. Glanceable without investigation.
 * 
 * ANTI-PATTERN AVOIDED: Action-Heavy Header
 * - Problem: Forces eyes to leave content; conflates orientation with command
 * - Solution: Header for status/orientation ONLY; Dock handles all actions
 * 
 * This component should NEVER contain:
 * - Add/Upload buttons (use BottomDock)
 * - Settings button (use SourceNavigator)
 * - Any action triggers that modify data
 * 
 * This component SHOULD contain:
 * - Connection status indicators
 * - System health at a glance
 * - Current context breadcrumbs
 * - Search (read-only filtering, not a primary action)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  InputAdornment,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Wifi as ConnectedIcon,
  WifiOff as DisconnectedIcon,
  AccountBalanceWallet as WalletIcon,
  Lock as EncryptedIcon,
  LockOpen as UnencryptedIcon,
  LocalFireDepartment as StreakIcon,
  Stars as PointsIcon,
  FiberManualRecord as StatusDotIcon,
} from '@mui/icons-material';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import type { SystemHealth, QueueStats } from '@/types/transformation';
import type { LayoutMode } from './hooks/useLayoutMode';

interface HealthPulseBarProps {
  // System state
  systemHealth: SystemHealth;
  queueStats: QueueStats;
  activeRecordingCount: number;
  
  // Search (filtering, not action)
  searchQuery: string;
  onSearchChange: (query: string) => void;
  
  // Mode context
  mode: LayoutMode;
  overheadContent?: string;
}

const HealthPulseBar: React.FC<HealthPulseBarProps> = ({
  systemHealth,
  queueStats,
  activeRecordingCount,
  searchQuery,
  onSearchChange,
  mode,
  overheadContent,
}) => {
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
  };

  const handleClearSearch = () => {
    onSearchChange('');
    searchInputRef.current?.focus();
  };

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (event.key === 'Escape' && searchQuery) {
        onSearchChange('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, onSearchChange]);

  // Truncate wallet address
  const truncateAddress = (address: string | undefined): string => {
    if (!address) return 'Not Connected';
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Get mode-specific header height (slightly smaller in player mode)
  const getHeaderHeight = () => {
    if (mode === 'player') return 48;
    return 56;
  };

  return (
    <Box
      sx={{
        height: getHeaderHeight(),
        background: liquidGlassTokens.canvas.elevated,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3,
        borderBottom: `1px solid rgba(255, 255, 255, 0.06)`,
        position: 'relative',
        zIndex: 10,
        backdropFilter: 'blur(12px)',
        transition: `height ${liquidGlassTokens.motion.durationFast} ease`,

        // Subtle top highlight
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent)',
        },
      }}
    >
      {/* Left side - Health Indicators */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* Active Recording Indicator */}
        {activeRecordingCount > 0 && (
          <Tooltip title={`${activeRecordingCount} active recording${activeRecordingCount > 1 ? 's' : ''}`}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 0.75,
                background: `${liquidGlassTokens.neon.magenta}15`,
                border: `1px solid ${liquidGlassTokens.neon.magenta}40`,
                borderRadius: `${liquidGlassTokens.radius.sm}px`,
                animation: 'pulse 2s infinite',
              }}
            >
              <StatusDotIcon
                sx={{
                  fontSize: 10,
                  color: liquidGlassTokens.neon.magenta,
                  animation: 'pulse 1.5s infinite',
                }}
              />
              <Typography
                sx={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: liquidGlassTokens.neon.magenta,
                }}
              >
                {activeRecordingCount} Recording
              </Typography>
            </Box>
          </Tooltip>
        )}

        {/* Mode Context / Overhead Content */}
        {overheadContent && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 0.5,
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: `${liquidGlassTokens.radius.sm}px`,
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <Typography
              sx={{
                fontSize: '13px',
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                fontWeight: 500,
              }}
            >
              {overheadContent}
            </Typography>
          </Box>
        )}

        {/* Backend Status */}
        <HealthIndicator
          icon={systemHealth.backendConnected ? <ConnectedIcon /> : <DisconnectedIcon />}
          label="Backend"
          status={systemHealth.backendConnected ? 'connected' : 'disconnected'}
          tooltip={systemHealth.backendConnected ? 'Backend connected' : 'Backend disconnected'}
        />

        {/* Wallet Status */}
        <HealthIndicator
          icon={<WalletIcon />}
          label={truncateAddress(systemHealth.walletAddress)}
          status={systemHealth.walletConnected ? 'connected' : 'warning'}
          tooltip={
            systemHealth.walletConnected
              ? `Wallet: ${systemHealth.walletAddress || 'Connected'}`
              : 'Wallet not connected'
          }
        />

        {/* Encryption Status */}
        <HealthIndicator
          icon={systemHealth.encryptionEnabled ? <EncryptedIcon /> : <UnencryptedIcon />}
          label="Encryption"
          status={systemHealth.encryptionEnabled ? 'connected' : 'warning'}
          tooltip={
            systemHealth.encryptionEnabled
              ? 'Content encryption enabled'
              : 'Encryption not configured'
          }
        />
      </Box>

      {/* Center - Search bar (filtering, not action) */}
      <Box
        sx={{
          flex: 1,
          maxWidth: 400,
          mx: 3,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <TextField
          fullWidth
          placeholder="Filter content... ⌘K"
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          size="small"
          inputRef={searchInputRef}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon
                  sx={{
                    color: searchFocused
                      ? liquidGlassTokens.neon.cyan
                      : `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                    fontSize: 20,
                    transition: `color ${liquidGlassTokens.motion.durationFast} ease`,
                  }}
                />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleClearSearch}
                  sx={{
                    color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                    width: 24,
                    height: 24,
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                    },
                  }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: `${liquidGlassTokens.radius.md}px`,
              border: `1px solid rgba(255, 255, 255, 0.08)`,
              height: 36,
              fontSize: '14px',
              transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
              '& fieldset': {
                border: 'none',
              },
              '&:hover': {
                background: 'rgba(255, 255, 255, 0.06)',
                borderColor: 'rgba(255, 255, 255, 0.12)',
              },
              '&.Mui-focused': {
                background: `${liquidGlassTokens.neon.cyan}08`,
                borderColor: `${liquidGlassTokens.neon.cyan}50`,
                boxShadow: glowEffects.cyan(0.15),
              },
            },
            '& .MuiInputBase-input': {
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.primary})`,
              '&::placeholder': {
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                opacity: 1,
                fontWeight: 400,
              },
            },
          }}
        />
      </Box>

      {/* Right side - Points, Streak, Queue Status (READ-ONLY INDICATORS) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* Queue Status Pill (read-only indicator) */}
        {(queueStats.pending > 0 || queueStats.uploading > 0) && (
          <Tooltip title={`${queueStats.uploading} uploading, ${queueStats.pending} pending`}>
            <Chip
              icon={
                <StatusDotIcon
                  sx={{
                    fontSize: 8,
                    color: liquidGlassTokens.neon.cyan,
                    animation: queueStats.uploading > 0 ? 'pulse 1.5s infinite' : 'none',
                  }}
                />
              }
              label={`${queueStats.uploading} / ${queueStats.pending}`}
              size="small"
              sx={{
                background: `${liquidGlassTokens.neon.cyan}10`,
                border: `1px solid ${liquidGlassTokens.neon.cyan}30`,
                color: liquidGlassTokens.neon.cyan,
                fontSize: '12px',
                fontWeight: 500,
                height: 28,
                '& .MuiChip-icon': {
                  marginLeft: '8px',
                },
              }}
            />
          </Tooltip>
        )}

        {/* Points (read-only indicator) */}
        {systemHealth.points !== undefined && (
          <Tooltip title="DePIN Points">
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.5,
                py: 0.5,
                background: `${liquidGlassTokens.neon.amber}10`,
                border: `1px solid ${liquidGlassTokens.neon.amber}30`,
                borderRadius: `${liquidGlassTokens.radius.sm}px`,
              }}
            >
              <PointsIcon
                sx={{
                  fontSize: 16,
                  color: liquidGlassTokens.neon.amber,
                }}
              />
              <Typography
                sx={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: liquidGlassTokens.neon.amber,
                }}
              >
                {systemHealth.points?.toLocaleString() || 0}
              </Typography>
            </Box>
          </Tooltip>
        )}

        {/* Streak (read-only indicator) */}
        {systemHealth.streak !== undefined && systemHealth.streak > 0 && (
          <Tooltip title={`${systemHealth.streak} day streak`}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <StreakIcon
                sx={{
                  fontSize: 18,
                  color: liquidGlassTokens.neon.amber,
                }}
              />
              <Typography
                sx={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: liquidGlassTokens.neon.amber,
                }}
              >
                {systemHealth.streak}
              </Typography>
            </Box>
          </Tooltip>
        )}

        {/* NOTE: Settings button REMOVED - now in SourceNavigator
         * ANTI-PATTERN: Action buttons in header
         * Settings is a low-frequency action, belongs in navigation spine
         */}
      </Box>
    </Box>
  );
};

// Health Indicator Component
interface HealthIndicatorProps {
  icon: React.ReactNode;
  label: string;
  status: 'connected' | 'warning' | 'disconnected';
  tooltip: string;
}

const HealthIndicator: React.FC<HealthIndicatorProps> = ({
  icon,
  label,
  status,
  tooltip,
}) => {
  const statusColors = {
    connected: liquidGlassTokens.neon.success,
    warning: liquidGlassTokens.neon.amber,
    disconnected: liquidGlassTokens.neon.error,
  };

  const color = statusColors[status];

  return (
    <Tooltip title={tooltip}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'default',
        }}
      >
        <StatusDotIcon
          sx={{
            fontSize: 8,
            color: color,
            filter: `drop-shadow(0 0 3px ${color})`,
          }}
        />
        <Box
          sx={{
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
            display: 'flex',
            alignItems: 'center',
            '& > svg': { fontSize: 16 },
          }}
        >
          {icon}
        </Box>
        <Typography
          sx={{
            fontSize: '12px',
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
            fontWeight: 400,
          }}
        >
          {label}
        </Typography>
      </Box>
    </Tooltip>
  );
};

export default HealthPulseBar;
