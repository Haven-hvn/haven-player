/**
 * OperationsPanel - Active operations monitoring in Detail Panel
 * 
 * Displays active DePIN operations with:
 * - Progress bars for each operation
 * - Pause, Resume, and Stop controls
 * - Real-time status updates
 * 
 * This component is designed to be used within the DetailPanel
 * when contentType is 'operations'.
 */

import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Button,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Extension as PluginIcon,
  PlayArrow,
  CloudUpload,
  VideoLibrary,
} from '@mui/icons-material';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import type { DePinActiveOperation } from '@/types/plugin';

interface OperationsPanelProps {
  operations: DePinActiveOperation[];
  onStop: (operationId: string) => void;
  onPause: (operationId: string, paused: boolean) => void;
  loading?: boolean;
}

const OperationsPanel: React.FC<OperationsPanelProps> = ({
  operations,
  onStop,
  onPause,
  loading = false,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return liquidGlassTokens.neon.success;
      case 'paused': return liquidGlassTokens.neon.amber;
      case 'completed': return liquidGlassTokens.neon.cyan;
      case 'failed': return liquidGlassTokens.neon.error;
      default: return `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`;
    }
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'real-time': return <PlayArrow sx={{ fontSize: 18 }} />;
      case 'subscription': return <VideoLibrary sx={{ fontSize: 18 }} />;
      case 'download': return <CloudUpload sx={{ fontSize: 18 }} />;
      default: return <PluginIcon sx={{ fontSize: 18 }} />;
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          p: 3,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: `2px solid ${liquidGlassTokens.neon.cyan}30`,
            borderTopColor: liquidGlassTokens.neon.cyan,
            animation: 'spin 1s linear infinite',
          }}
        />
        <Typography
          sx={{
            fontSize: '14px',
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
          }}
        >
          Loading operations...
        </Typography>
      </Box>
    );
  }

  if (operations.length === 0) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          p: 3,
          textAlign: 'center',
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '16px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PluginIcon
            sx={{
              fontSize: 28,
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            }}
          />
        </Box>
        <Typography
          sx={{
            fontSize: '16px',
            fontWeight: 500,
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
          }}
        >
          No Active Operations
        </Typography>
        <Typography
          sx={{
            fontSize: '13px',
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            maxWidth: 240,
          }}
        >
          Operations will appear here when the DePIN node is active and archiving content.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 3,
          borderBottom: `1px solid rgba(255, 255, 255, 0.06)`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <PluginIcon
            sx={{
              fontSize: 20,
              color: liquidGlassTokens.neon.cyan,
            }}
          />
          <Typography
            sx={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.95)',
            }}
          >
            Active Operations
          </Typography>
        </Box>
        <Typography
          sx={{
            fontSize: '13px',
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
          }}
        >
          {operations.length} operation{operations.length !== 1 ? 's' : ''} running
        </Typography>
      </Box>

      {/* Operations List */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {operations.map((operation) => {
          const statusColor = getStatusColor(operation.status);

          return (
            <Box
              key={operation.operation_id}
              sx={{
                p: 2.5,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: `${liquidGlassTokens.radius.md}px`,
                transition: 'all 0.2s ease',
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                },
              }}
            >
              {/* Header */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: `${liquidGlassTokens.radius.sm}px`,
                      background: `${liquidGlassTokens.neon.cyan}15`,
                      border: `1px solid ${liquidGlassTokens.neon.cyan}30`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: liquidGlassTokens.neon.cyan,
                    }}
                  >
                    {getOperationIcon(operation.operation_type)}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'rgba(255, 255, 255, 0.95)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {operation.plugin_display_name}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: '12px',
                        color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {operation.source_name}
                    </Typography>
                  </Box>
                </Box>
                <Chip
                  label={operation.status}
                  size="small"
                  sx={{
                    background: `${statusColor}15`,
                    border: `1px solid ${statusColor}40`,
                    color: statusColor,
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    height: 24,
                    '& .MuiChip-label': {
                      px: 1,
                    },
                  }}
                />
              </Box>

              {/* Progress */}
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography
                    sx={{
                      fontSize: '11px',
                      color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                    }}
                  >
                    {formatDuration(operation.duration_seconds)}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '11px',
                      color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                    }}
                  >
                    {operation.progress}%
                  </Typography>
                </Box>
                <Box
                  sx={{
                    height: 4,
                    borderRadius: 2,
                    background: 'rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      width: `${operation.progress}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${liquidGlassTokens.neon.cyan}, ${liquidGlassTokens.neon.magenta})`,
                      borderRadius: 2,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </Box>
              </Box>

              {/* Controls */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <IconButton
                  size="small"
                  onClick={() => onPause(operation.operation_id, operation.status === 'running')}
                  sx={{
                    width: 32,
                    height: 32,
                    color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                    '&:hover': {
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: liquidGlassTokens.neon.cyan,
                    },
                  }}
                >
                  {operation.status === 'running' ? (
                    <PauseIcon fontSize="small" />
                  ) : (
                    <PlayIcon fontSize="small" />
                  )}
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => onStop(operation.operation_id)}
                  sx={{
                    width: 32,
                    height: 32,
                    color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                    '&:hover': {
                      background: `${liquidGlassTokens.neon.error}15`,
                      color: liquidGlassTokens.neon.error,
                    },
                  }}
                >
                  <StopIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// Format duration helper
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default OperationsPanel;
