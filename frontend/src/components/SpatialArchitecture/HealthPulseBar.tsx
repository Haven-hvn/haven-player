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
  Popover,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Wifi as ConnectedIcon,
  WifiOff as DisconnectedIcon,
  VpnKey as KeyIcon,
  Lock as EncryptedIcon,
  LockOpen as UnencryptedIcon,
  LocalFireDepartment as StreakIcon,
  Stars as PointsIcon,
  FiberManualRecord as StatusDotIcon,
  Extension as PluginIcon,
} from '@mui/icons-material';
// Vault icon component (bank vault style)
const VaultIcon: React.FC<{ fontSize?: 'small' | 'medium' | 'large' }> = ({ fontSize = 'small' }) => (
  <svg
    width={fontSize === 'small' ? 16 : fontSize === 'medium' ? 20 : 24}
    height={fontSize === 'small' ? 16 : fontSize === 'medium' ? 20 : 24}
    viewBox="0 0 24 24"
    fill="currentColor"
    style={{ display: 'block' }}
  >
    {/* Vault door circle */}
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
    {/* Inner circle */}
    <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    {/* Spokes */}
    <line x1="12" y1="3" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" />
    <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="1.5" />
    <line x1="3" y1="12" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" />
    <line x1="17" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.5" />
    {/* Center bolt */}
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);
// Vault off icon for disconnected state
const VaultOffIcon: React.FC<{ fontSize?: 'small' | 'medium' | 'large' }> = ({ fontSize = 'small' }) => (
  <svg
    width={fontSize === 'small' ? 16 : fontSize === 'medium' ? 20 : 24}
    height={fontSize === 'small' ? 16 : fontSize === 'medium' ? 20 : 24}
    viewBox="0 0 24 24"
    fill="none"
    style={{ display: 'block' }}
  >
    {/* Vault door circle */}
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
    {/* Inner circle */}
    <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
    {/* Spokes */}
    <line x1="12" y1="3" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" />
    <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="1.5" />
    <line x1="3" y1="12" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" />
    <line x1="17" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.5" />
    {/* Center bolt */}
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    {/* Diagonal slash for disconnected */}
    <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import type { SystemHealth, QueueStats, PipelineStatus } from '@/types/transformation';
import type { LayoutMode } from './hooks/useLayoutMode';
import type { PluginHealth } from '@/types/plugin';
import { PipelineStageIndicator } from './PipelineStageIndicator';
import RewardsTooltip from './RewardsTooltip';

interface HealthPulseBarProps {
  // System state
  systemHealth: SystemHealth;
  queueStats: QueueStats;
  activeRecordingCount: number;
  
  // Plugin health
  pluginHealthStatus?: PluginHealth[];
  
  // Pipeline status (encrypting, uploading, analyzing, syncing)
  pipelineStatus?: PipelineStatus;
  
  // Search (filtering, not action)
  searchQuery: string;
  onSearchChange: (query: string) => void;
  
  // Mode context
  mode: LayoutMode;
  overheadContent?: string;
  
  // Optional callback for opening settings (e.g., when clicking encryption indicator)
  onOpenSettings?: (tab?: string) => void;
}

const HealthPulseBar: React.FC<HealthPulseBarProps> = ({
  systemHealth,
  queueStats,
  activeRecordingCount,
  pluginHealthStatus = [],
  pipelineStatus,
  searchQuery,
  onSearchChange,
  mode,
  overheadContent,
  onOpenSettings,
}) => {
  const [searchFocused, setSearchFocused] = useState(false);
  const [rewardsAnchorEl, setRewardsAnchorEl] = useState<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleRewardsEnter = (event: React.MouseEvent<HTMLElement>) => {
    setRewardsAnchorEl(event.currentTarget);
  };

  const handleRewardsLeave = () => {
    setRewardsAnchorEl(null);
  };

  const rewardsOpen = Boolean(rewardsAnchorEl);

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
        background: `${liquidGlassTokens.canvas.elevated}99`, // 60% opacity - allows circuit substrate to show through
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

        {/* Backend Status - Vault icon for bank vault metaphor */}
        <HealthIndicator
          icon={
            systemHealth.backendStatus === 'loading' ? (
              <CircularProgress size={14} thickness={4} sx={{ color: liquidGlassTokens.neon.cyan }} />
            ) : systemHealth.backendConnected ? (
              <VaultIcon />
            ) : (
              <VaultOffIcon />
            )
          }
          label="Backend"
          status={
            systemHealth.backendStatus === 'loading'
              ? 'loading'
              : systemHealth.backendConnected
              ? 'connected'
              : 'disconnected'
          }
          tooltip={
            systemHealth.backendStatus === 'loading'
              ? 'Backend vault connecting...'
              : systemHealth.backendConnected
              ? 'Backend vault secured'
              : 'Backend vault disconnected'
          }
        />

        {/* Wallet Status - Key icon for physical key metaphor */}
        <HealthIndicator
          icon={<KeyIcon />}
          label={systemHealth.walletConnected ? truncateAddress(systemHealth.walletAddress) : 'Not Connected'}
          status={systemHealth.walletConnected ? 'connected' : 'warning'}
          tooltip={
            systemHealth.walletConnected
              ? `Key: ${truncateAddress(systemHealth.walletAddress)}`
              : 'Key not connected'
          }
        />

        {/* Encryption Status - green only if encryption enabled AND wallet connected */}
        <HealthIndicator
          icon={(systemHealth.encryptionEnabled && systemHealth.walletConnected) ? <EncryptedIcon /> : <UnencryptedIcon />}
          label="Encryption"
          status={(systemHealth.encryptionEnabled && systemHealth.walletConnected) ? 'connected' : 'warning'}
          tooltip={
            (systemHealth.encryptionEnabled && systemHealth.walletConnected)
              ? 'Content encryption enabled (Lit Protocol)'
              : !systemHealth.walletConnected
              ? 'Key not connected - Configure key in Settings > Filecoin'
              : 'Encryption not configured - Configure in Settings > Encryption'
          }
          onClick={() => {
            // Click to open settings to appropriate tab
            if (onOpenSettings) {
              if (!systemHealth.walletConnected) {
                onOpenSettings('filecoin');
              } else if (!systemHealth.encryptionEnabled) {
                onOpenSettings('encryption');
              }
            }
          }}
          clickable={(!systemHealth.walletConnected || !systemHealth.encryptionEnabled) && !!onOpenSettings}
        />

        {/* Plugin Health Status */}
        {pluginHealthStatus.length > 0 && (
          <HealthIndicator
            icon={<PluginIcon />}
            label="Plugins"
            status={pluginHealthStatus.some(h => !h.healthy) ? 'warning' : 'connected'}
            tooltip={
              pluginHealthStatus.some(h => !h.healthy)
                ? `${pluginHealthStatus.filter(h => !h.healthy).length} of ${pluginHealthStatus.length} plugins unhealthy`
                : `${pluginHealthStatus.length} plugins healthy`
            }
          />
        )}

        {/* Pipeline Stage Indicator - Shows encrypting, uploading, analyzing, syncing */}
        {pipelineStatus && pipelineStatus.hasActivity && (
          <Box sx={{ ml: 1 }}>
            <PipelineStageIndicator 
              pipelineStatus={pipelineStatus} 
              compact={true}
            />
          </Box>
        )}
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

        {/* Rewards Display with Hover Tooltip */}
        {(systemHealth.points !== undefined || systemHealth.streak !== undefined) && (
          <Box
            onMouseEnter={handleRewardsEnter}
            onMouseLeave={handleRewardsLeave}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              cursor: 'pointer',
            }}
          >
            {/* Points (read-only indicator) */}
            {systemHealth.points !== undefined && (
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
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    background: `${liquidGlassTokens.neon.amber}15`,
                    borderColor: `${liquidGlassTokens.neon.amber}50`,
                  },
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
            )}

            {/* Streak (read-only indicator) */}
            {systemHealth.streak !== undefined && systemHealth.streak > 0 && (
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
            )}

            {/* Rewards Tooltip Popover */}
            <Popover
              open={rewardsOpen}
              anchorEl={rewardsAnchorEl}
              onClose={handleRewardsLeave}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              PaperProps={{
                sx: {
                  background: 'transparent',
                  boxShadow: 'none',
                  overflow: 'visible',
                  mt: 1,
                },
              }}
              disableRestoreFocus
            >
              <RewardsTooltip
                points={systemHealth.points || 0}
                streak={systemHealth.streak || 0}
                level={systemHealth.level || Math.floor((systemHealth.points || 0) / 1000) + 1}
                tier={systemHealth.tier || 'Observer'}
              />
            </Popover>
          </Box>
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
  status: 'connected' | 'warning' | 'disconnected' | 'loading';
  tooltip: string;
  onClick?: () => void;
  clickable?: boolean;
}

const HealthIndicator: React.FC<HealthIndicatorProps> = ({
  icon,
  label,
  status,
  tooltip,
  onClick,
  clickable,
}) => {
  const statusColors = {
    connected: liquidGlassTokens.neon.success,
    warning: liquidGlassTokens.neon.amber,
    disconnected: liquidGlassTokens.neon.error,
    loading: liquidGlassTokens.neon.cyan,
  };

  const color = statusColors[status];

  return (
    <Tooltip title={tooltip}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: clickable ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
          ...(clickable && {
            '&:hover': {
              opacity: 0.8,
              '& .MuiTypography-root': {
                textDecoration: 'underline',
              },
            },
          }),
        }}
        onClick={onClick}
      >
        {status !== 'loading' && (
          <StatusDotIcon
            sx={{
              fontSize: 8,
              color: color,
              filter: `drop-shadow(0 0 3px ${color})`,
            }}
          />
        )}
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
