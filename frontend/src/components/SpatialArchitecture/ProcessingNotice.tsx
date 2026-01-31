/**
 * Processing Notice - Top Right Corner Notification
 * 
 * Shows a small, unobtrusive indicator when videos are being processed,
 * uploaded, or analyzed. Appears in the top right corner of the screen.
 */

import React from 'react';
import { Box, Typography, Chip, Tooltip, Fade } from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Psychology as AnalysisIcon,
  Storage as QueueIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import type { UploadQueueStatus } from '@/types/plugin';

interface ProcessingNoticeProps {
  queueStats: UploadQueueStatus | null;
  className?: string;
}

const ProcessingNotice: React.FC<ProcessingNoticeProps> = ({
  queueStats,
}) => {
  // Don't show if no queue stats
  if (!queueStats) return null;

  const pendingUploads = queueStats.pending || 0;
  const processingUploads = queueStats.processing || 0;
  const pendingAnalysis = queueStats.vlm_analysis_pending || 0;
  const processingAnalysis = queueStats.vlm_analysis_processing || 0;
  const failedUploads = queueStats.failed || 0;
  const failedAnalysis = queueStats.vlm_analysis_failed || 0;

  const totalActive = processingUploads + processingAnalysis;
  const totalPending = pendingUploads + pendingAnalysis;
  const totalFailed = failedUploads + failedAnalysis;

  // Don't show if nothing is happening and no errors
  if (totalActive === 0 && totalPending === 0 && totalFailed === 0) return null;

  // Priority: Errors > Active > Pending
  const getStatusIcon = () => {
    if (totalFailed > 0) return <ErrorIcon sx={{ fontSize: 14 }} />;
    if (processingUploads > 0) return <UploadIcon sx={{ fontSize: 14 }} />;
    if (processingAnalysis > 0) return <AnalysisIcon sx={{ fontSize: 14 }} />;
    if (totalPending > 0) return <QueueIcon sx={{ fontSize: 14 }} />;
    return <SuccessIcon sx={{ fontSize: 14 }} />;
  };

  const getStatusText = () => {
    if (totalFailed > 0) return `${totalFailed} error${totalFailed !== 1 ? 's' : ''}`;
    if (processingUploads > 0) return `Uploading ${processingUploads}`;
    if (processingAnalysis > 0) return `Analyzing ${processingAnalysis}`;
    if (pendingUploads > 0) return `${pendingUploads} pending upload`;
    if (pendingAnalysis > 0) return `${pendingAnalysis} pending analysis`;
    return 'Processing';
  };

  const getStatusColor = () => {
    if (totalFailed > 0) return liquidGlassTokens.neon.error;
    if (processingUploads > 0) return liquidGlassTokens.neon.cyan;
    if (processingAnalysis > 0) return liquidGlassTokens.neon.magenta;
    if (totalPending > 0) return liquidGlassTokens.neon.amber;
    return liquidGlassTokens.neon.success;
  };

  const color = getStatusColor();

  return (
    <Fade in timeout={300}>
      <Box
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          background: `linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%)`,
          backdropFilter: `blur(12px)`,
          WebkitBackdropFilter: `blur(12px)`,
          borderRadius: `${liquidGlassTokens.radius.md}px`,
          border: `1px solid ${color}40`,
          boxShadow: `${totalFailed > 0 ? glowEffects.error(0.2) : glowEffects.cyan(0.15)}, 0 4px 24px rgba(0, 0, 0, 0.3)`,
          animation: (totalActive > 0 || totalFailed > 0) ? 'pulse-subtle 2s infinite' : 'none',
          '@keyframes pulse-subtle': {
            '0%, 100%': { 
              boxShadow: `${totalFailed > 0 ? glowEffects.error(0.15) : glowEffects.cyan(0.1)}, 0 4px 24px rgba(0, 0, 0, 0.3)`,
              borderColor: `${color}30`,
            },
            '50%': { 
              boxShadow: `${totalFailed > 0 ? glowEffects.error(0.3) : glowEffects.cyan(0.25)}, 0 4px 24px rgba(0, 0, 0, 0.3)`,
              borderColor: `${color}60`,
            },
          },
        }}
      >
        <Box
          sx={{
            color: color,
            display: 'flex',
            alignItems: 'center',
            animation: totalActive > 0 ? 'spin-slow 3s linear infinite' : 'none',
            '@keyframes spin-slow': {
              '0%': { transform: 'rotate(0deg)' },
              '100%': { transform: 'rotate(360deg)' },
            },
          }}
        >
          {getStatusIcon()}
        </Box>

        <Typography
          sx={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.9)',
            whiteSpace: 'nowrap',
          }}
        >
          {getStatusText()}
        </Typography>

        {/* Show pending count chip if there are pending items */}
        {totalPending > 0 && (
          <Chip
            label={`+${totalPending}`}
            size="small"
            sx={{
              height: 18,
              fontSize: '10px',
              fontWeight: 600,
              backgroundColor: `${liquidGlassTokens.neon.amber}20`,
              color: liquidGlassTokens.neon.amber,
              border: `1px solid ${liquidGlassTokens.neon.amber}40`,
              '& .MuiChip-label': {
                px: 1,
                py: 0,
              },
            }}
          />
        )}
      </Box>
    </Fade>
  );
};

export default ProcessingNotice;
