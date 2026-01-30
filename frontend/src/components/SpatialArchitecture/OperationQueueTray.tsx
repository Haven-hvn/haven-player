/**
 * Operation Queue Tray - Zone 4 (Bottom Dock)
 * 
 * Persistent but non-dominant display of active operations.
 * Shows upload queue, recording sessions, sync status, and per-plugin job status.
 * Expandable for details, collapsible for focus.
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  LinearProgress,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CloudUpload as UploadIcon,
  Sync as SyncIcon,
  FiberManualRecord as RecordingIcon,
  CheckCircle as CompleteIcon,
  Error as ErrorIcon,
  Pending as PendingIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
  Extension as PluginIcon,
} from '@mui/icons-material';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import type { QueueStats, RecordingSession, PluginJobStatus } from '@/types/transformation';

interface OperationQueueTrayProps {
  queueStats: QueueStats;
  recordingSessions: RecordingSession[];
  pluginJobs?: PluginJobStatus[];
  expanded: boolean;
  onToggleExpand: () => void;
}

const OperationQueueTray: React.FC<OperationQueueTrayProps> = ({
  queueStats,
  recordingSessions,
  pluginJobs = [],
  expanded,
  onToggleExpand,
}) => {
  const hasActiveOperations = queueStats.uploading > 0 || recordingSessions.length > 0;
  const hasErrors = queueStats.failed > 0;
  const hasPending = queueStats.pending > 0 || queueStats.syncPending > 0;
  const hasPluginJobs = pluginJobs.length > 0 && pluginJobs.some(j => j.totalActive > 0);

  // If nothing to show, return minimal bar
  if (!hasActiveOperations && !hasErrors && !hasPending && !hasPluginJobs && queueStats.completed === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'relative',
        background: liquidGlassTokens.canvas.elevated,
        borderTop: `1px solid rgba(255, 255, 255, 0.06)`,
        transition: `all ${liquidGlassTokens.motion.durationNormal} ease`,
      }}
    >
      {/* Collapsed Bar */}
      <Box
        onClick={onToggleExpand}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 1.5,
          cursor: 'pointer',
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
          '&:hover': {
            background: 'rgba(255, 255, 255, 0.02)',
          },
        }}
      >
        {/* Left - Quick Stats */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {/* Upload Stats */}
          <QueueStatPill
            icon={<UploadIcon />}
            label="Upload"
            active={queueStats.uploading}
            pending={queueStats.pending}
            completed={queueStats.completed}
            failed={queueStats.failed}
          />

          {/* Arkiv Sync Stats */}
          {(queueStats.syncPending > 0 || queueStats.syncCompleted > 0) && (
            <QueueStatPill
              icon={<SyncIcon />}
              label="Arkiv Sync"
              active={0}
              pending={queueStats.syncPending}
              completed={queueStats.syncCompleted}
              failed={0}
            />
          )}

          {/* Active Recordings */}
          {recordingSessions.length > 0 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.5,
                background: `${liquidGlassTokens.neon.magenta}10`,
                border: `1px solid ${liquidGlassTokens.neon.magenta}30`,
                borderRadius: `${liquidGlassTokens.radius.sm}px`,
              }}
            >
              <RecordingIcon
                sx={{
                  fontSize: 10,
                  color: liquidGlassTokens.neon.magenta,
                  animation: 'pulse 1.5s infinite',
                }}
              />
              <Typography
                sx={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: liquidGlassTokens.neon.magenta,
                }}
              >
                {recordingSessions.length} Recording
              </Typography>
            </Box>
          )}

          {/* Per-Plugin Job Status */}
          {hasPluginJobs && pluginJobs.map((plugin) => (
            <PluginJobPill key={plugin.pluginName} plugin={plugin} />
          ))}
        </Box>

        {/* Right - Expand Toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            sx={{
              fontSize: '11px',
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </Typography>
          <IconButton
            size="small"
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              width: 24,
              height: 24,
            }}
          >
            {expanded ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
          </IconButton>
        </Box>
      </Box>

      {/* Expanded Content */}
      <Collapse in={expanded}>
        <Box
          sx={{
            px: 3,
            pb: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            maxHeight: '280px',
            overflow: 'auto',
          }}
        >
          {/* Plugin Jobs Section */}
          {hasPluginJobs && (
            <Box>
              <Typography
                sx={{
                  fontSize: '11px',
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  mb: 1,
                }}
              >
                Plugin Activity
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {pluginJobs.map((plugin) => (
                  <PluginJobDetailItem key={plugin.pluginName} plugin={plugin} />
                ))}
              </Box>
            </Box>
          )}

          {/* Active Recordings Section */}
          {recordingSessions.length > 0 && (
            <Box>
              <Typography
                sx={{
                  fontSize: '11px',
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  mb: 1,
                }}
              >
                Active Recordings
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {recordingSessions.map((session) => (
                  <RecordingSessionItem key={session.id} session={session} />
                ))}
              </Box>
            </Box>
          )}

          {/* Upload Queue Section */}
          {(queueStats.uploading > 0 || queueStats.pending > 0) && (
            <Box>
              <Typography
                sx={{
                  fontSize: '11px',
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  mb: 1,
                }}
              >
                Upload Queue
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <QueueDetailBox
                  label="Uploading"
                  count={queueStats.uploading}
                  color={liquidGlassTokens.neon.cyan}
                  animated
                />
                <QueueDetailBox
                  label="Pending"
                  count={queueStats.pending}
                  color="rgba(255, 255, 255, 0.5)"
                />
                <QueueDetailBox
                  label="Completed"
                  count={queueStats.completed}
                  color={liquidGlassTokens.neon.success}
                />
                {queueStats.failed > 0 && (
                  <QueueDetailBox
                    label="Failed"
                    count={queueStats.failed}
                    color={liquidGlassTokens.neon.error}
                  />
                )}
              </Box>
            </Box>
          )}

          {/* Arkiv Sync Section */}
          {(queueStats.syncPending > 0 || queueStats.syncCompleted > 0) && (
            <Box>
              <Typography
                sx={{
                  fontSize: '11px',
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  mb: 1,
                }}
              >
                Arkiv Sync
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <QueueDetailBox
                  label="Pending"
                  count={queueStats.syncPending}
                  color={liquidGlassTokens.neon.amber}
                />
                <QueueDetailBox
                  label="Synced"
                  count={queueStats.syncCompleted}
                  color={liquidGlassTokens.neon.success}
                />
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

// Plugin Job Pill - Compact display for collapsed bar
interface PluginJobPillProps {
  plugin: PluginJobStatus;
}

const PluginJobPill: React.FC<PluginJobPillProps> = ({ plugin }) => {
  const tooltipText = [
    plugin.recording > 0 && `${plugin.recording} recording`,
    plugin.downloading > 0 && `${plugin.downloading} downloading`,
  ].filter(Boolean).join(', ');

  return (
    <Tooltip title={`${plugin.pluginDisplayName}: ${tooltipText || 'active'}`}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.5,
          background: `${plugin.color}10`,
          border: `1px solid ${plugin.color}30`,
          borderRadius: `${liquidGlassTokens.radius.sm}px`,
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
          '&:hover': {
            background: `${plugin.color}15`,
            borderColor: `${plugin.color}50`,
          },
        }}
      >
        <PluginIcon
          sx={{
            fontSize: 12,
            color: plugin.color,
            animation: 'pulse 1.5s infinite',
          }}
        />
        <Typography
          sx={{
            fontSize: '12px',
            fontWeight: 500,
            color: plugin.color,
          }}
        >
          {plugin.totalActive} {plugin.pluginDisplayName.split(' ')[0]}
        </Typography>
      </Box>
    </Tooltip>
  );
};

// Plugin Job Detail Item - Expanded view
interface PluginJobDetailItemProps {
  plugin: PluginJobStatus;
}

const PluginJobDetailItem: React.FC<PluginJobDetailItemProps> = ({ plugin }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1,
        background: `${plugin.color}08`,
        border: `1px solid ${plugin.color}20`,
        borderRadius: `${liquidGlassTokens.radius.sm}px`,
      }}
    >
      <PluginIcon
        sx={{
          fontSize: 14,
          color: plugin.color,
        }}
      />
      <Typography
        sx={{
          flex: 1,
          fontSize: '13px',
          fontWeight: 500,
          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.primary})`,
        }}
      >
        {plugin.pluginDisplayName}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {plugin.recording > 0 && (
          <Chip
            size="small"
            icon={<RecordingIcon sx={{ fontSize: 10, color: plugin.color }} />}
            label={`${plugin.recording} recording`}
            sx={{
              height: 22,
              fontSize: '11px',
              fontWeight: 500,
              background: `${plugin.color}15`,
              color: plugin.color,
              border: `1px solid ${plugin.color}30`,
              '& .MuiChip-icon': {
                marginLeft: '6px',
                color: plugin.color,
              },
            }}
          />
        )}
        {plugin.downloading > 0 && (
          <Chip
            size="small"
            icon={<DownloadIcon sx={{ fontSize: 10, color: plugin.color }} />}
            label={`${plugin.downloading} downloading`}
            sx={{
              height: 22,
              fontSize: '11px',
              fontWeight: 500,
              background: `${plugin.color}15`,
              color: plugin.color,
              border: `1px solid ${plugin.color}30`,
              '& .MuiChip-icon': {
                marginLeft: '6px',
                color: plugin.color,
              },
            }}
          />
        )}
      </Box>
    </Box>
  );
};

// Queue Stat Pill Component
interface QueueStatPillProps {
  icon: React.ReactNode;
  label: string;
  active: number;
  pending: number;
  completed: number;
  failed: number;
}

const QueueStatPill: React.FC<QueueStatPillProps> = ({
  icon,
  label,
  active,
  pending,
  completed,
  failed,
}) => {
  const hasActivity = active > 0 || pending > 0;
  const primaryColor = active > 0
    ? liquidGlassTokens.neon.cyan
    : failed > 0
    ? liquidGlassTokens.neon.error
    : `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box
        sx={{
          color: primaryColor,
          display: 'flex',
          alignItems: 'center',
          '& > svg': {
            fontSize: 16,
            ...(active > 0 && {
              animation: 'pulse 1.5s infinite',
            }),
          },
        }}
      >
        {icon}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {active > 0 && (
          <Tooltip title={`${active} ${label.toLowerCase()} in progress`}>
            <Chip
              size="small"
              label={active}
              sx={{
                height: 20,
                minWidth: 28,
                fontSize: '11px',
                fontWeight: 600,
                background: `${liquidGlassTokens.neon.cyan}15`,
                color: liquidGlassTokens.neon.cyan,
                border: `1px solid ${liquidGlassTokens.neon.cyan}30`,
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          </Tooltip>
        )}

        {pending > 0 && (
          <Tooltip title={`${pending} pending`}>
            <Chip
              size="small"
              label={pending}
              sx={{
                height: 20,
                minWidth: 28,
                fontSize: '11px',
                fontWeight: 500,
                background: 'rgba(255, 255, 255, 0.05)',
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          </Tooltip>
        )}

        {completed > 0 && (
          <Tooltip title={`${completed} completed`}>
            <Typography
              sx={{
                fontSize: '11px',
                color: liquidGlassTokens.neon.success,
                fontWeight: 500,
              }}
            >
              ✓{completed}
            </Typography>
          </Tooltip>
        )}

        {failed > 0 && (
          <Tooltip title={`${failed} failed`}>
            <Typography
              sx={{
                fontSize: '11px',
                color: liquidGlassTokens.neon.error,
                fontWeight: 500,
              }}
            >
              ✕{failed}
            </Typography>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

// Recording Session Item Component
interface RecordingSessionItemProps {
  session: RecordingSession;
}

const RecordingSessionItem: React.FC<RecordingSessionItemProps> = ({ session }) => {
  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1,
        background: `${liquidGlassTokens.neon.magenta}08`,
        border: `1px solid ${liquidGlassTokens.neon.magenta}20`,
        borderRadius: `${liquidGlassTokens.radius.sm}px`,
      }}
    >
      <RecordingIcon
        sx={{
          fontSize: 12,
          color: liquidGlassTokens.neon.magenta,
          animation: 'pulse 1.5s infinite',
        }}
      />
      <Typography
        sx={{
          flex: 1,
          fontSize: '13px',
          color: 'rgba(255, 255, 255, 0.9)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {session.title}
      </Typography>
      <Typography
        sx={{
          fontSize: '12px',
          fontFamily: 'monospace',
          color: liquidGlassTokens.neon.magenta,
          fontWeight: 500,
        }}
      >
        {formatDuration(session.duration)}
      </Typography>
    </Box>
  );
};

// Queue Detail Box Component
interface QueueDetailBoxProps {
  label: string;
  count: number;
  color: string;
  animated?: boolean;
}

const QueueDetailBox: React.FC<QueueDetailBoxProps> = ({ label, count, color, animated }) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      px: 2,
      py: 1,
      background: `${color}10`,
      border: `1px solid ${color}20`,
      borderRadius: `${liquidGlassTokens.radius.sm}px`,
      minWidth: 60,
    }}
  >
    <Typography
      sx={{
        fontSize: '18px',
        fontWeight: 600,
        color: color,
        ...(animated && {
          animation: 'pulse 1.5s infinite',
        }),
      }}
    >
      {count}
    </Typography>
    <Typography
      sx={{
        fontSize: '10px',
        color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {label}
    </Typography>
  </Box>
);

export default OperationQueueTray;
