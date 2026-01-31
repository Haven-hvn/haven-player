/**
 * Pipeline Stage Indicator - Zone 3 (Top Header)
 * 
 * Shows real-time pipeline status with color-coded stages:
 * - Encrypting (magenta/purple)
 * - Uploading (cyan)
 * - Analyzing (amber)
 * - Syncing (green)
 * - Downloading (cyan pulse)
 * 
 * Displays as a compact, glanceable indicator next to other health indicators.
 */

import React from 'react';
import { Box, Typography, Tooltip, Chip } from '@mui/material';
import {
  Lock as LockIcon,
  CloudUpload as UploadIcon,
  Psychology as AIIcon,
  Sync as SyncIcon,
  Download as DownloadIcon,
  CheckCircle as CheckIcon,
  FiberManualRecord as StatusDotIcon,
} from '@mui/icons-material';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import type { PipelineStatus, PipelineStage } from '@/types/transformation';

interface PipelineStageIndicatorProps {
  pipelineStatus: PipelineStatus;
  compact?: boolean; // If true, shows only the most active stage
}

// Icon mapping for stages
const STAGE_ICONS: Record<PipelineStage, React.ReactNode> = {
  encrypting: <LockIcon sx={{ fontSize: 14 }} />,
  uploading: <UploadIcon sx={{ fontSize: 14 }} />,
  analyzing: <AIIcon sx={{ fontSize: 14 }} />,
  syncing: <SyncIcon sx={{ fontSize: 14 }} />,
  downloading: <DownloadIcon sx={{ fontSize: 14 }} />,
  idle: <CheckIcon sx={{ fontSize: 14 }} />,
};

// Stage descriptions for tooltips
const STAGE_DESCRIPTIONS: Record<PipelineStage, string> = {
  encrypting: 'Content being encrypted with Lit Protocol',
  uploading: 'Uploading to Filecoin network',
  analyzing: 'AI video analysis in progress',
  syncing: 'Syncing to Arkiv blockchain',
  downloading: 'Downloading from source',
  idle: 'No active pipeline operations',
};

export const PipelineStageIndicator: React.FC<PipelineStageIndicatorProps> = ({
  pipelineStatus,
  compact = false,
}) => {
  const { stages, hasActivity, totalActive } = pipelineStatus;

  // Filter out idle stage for display
  const activeStages = stages.filter(s => s.stage !== 'idle');

  // If compact mode, show only the most important active stage
  if (compact && activeStages.length > 0) {
    // Priority: encrypting > uploading > analyzing > syncing > downloading
    const priority: PipelineStage[] = ['encrypting', 'uploading', 'analyzing', 'syncing', 'downloading'];
    const primaryStage = activeStages
      .sort((a, b) => priority.indexOf(a.stage) - priority.indexOf(b.stage))[0];

    return (
      <Tooltip title={`${STAGE_DESCRIPTIONS[primaryStage.stage]} (${primaryStage.count} active)`}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 0.75,
            background: `${primaryStage.color}15`,
            border: `1px solid ${primaryStage.color}40`,
            borderRadius: `${liquidGlassTokens.radius.sm}px`,
            transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
            animation: hasActivity ? 'pulse 2s infinite' : 'none',
            '&:hover': {
              background: `${primaryStage.color}20`,
              borderColor: `${primaryStage.color}60`,
            },
          }}
        >
          <StatusDotIcon
            sx={{
              fontSize: 8,
              color: primaryStage.color,
              filter: `drop-shadow(0 0 4px ${primaryStage.color})`,
              animation: 'pulse 1.5s infinite',
            }}
          />
          <Box
            sx={{
              color: primaryStage.color,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {STAGE_ICONS[primaryStage.stage]}
          </Box>
          <Typography
            sx={{
              fontSize: '12px',
              fontWeight: 600,
              color: primaryStage.color,
            }}
          >
            {primaryStage.label}
          </Typography>
          <Chip
            size="small"
            label={primaryStage.count}
            sx={{
              height: 18,
              minWidth: 22,
              fontSize: '11px',
              fontWeight: 700,
              background: `${primaryStage.color}30`,
              color: primaryStage.color,
              border: `1px solid ${primaryStage.color}50`,
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
        </Box>
      </Tooltip>
    );
  }

  // Full mode: show all active stages as individual pills
  if (activeStages.length === 0) {
    return (
      <Tooltip title="No active pipeline operations">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            opacity: 0.5,
          }}
        >
          <StatusDotIcon
            sx={{
              fontSize: 8,
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            }}
          />
          <Typography
            sx={{
              fontSize: '12px',
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            }}
          >
            Idle
          </Typography>
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      {activeStages.map((stage) => (
        <Tooltip key={stage.stage} title={STAGE_DESCRIPTIONS[stage.stage]}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 0.5,
              background: `${stage.color}12`,
              border: `1px solid ${stage.color}30`,
              borderRadius: `${liquidGlassTokens.radius.sm}px`,
              transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
              '&:hover': {
                background: `${stage.color}18`,
                borderColor: `${stage.color}50`,
              },
            }}
          >
            <StatusDotIcon
              sx={{
                fontSize: 6,
                color: stage.color,
                filter: `drop-shadow(0 0 3px ${stage.color})`,
                animation: 'pulse 1.5s infinite',
              }}
            />
            <Box
              sx={{
                color: stage.color,
                display: 'flex',
                alignItems: 'center',
                opacity: 0.9,
              }}
            >
              {STAGE_ICONS[stage.stage]}
            </Box>
            <Typography
              sx={{
                fontSize: '11px',
                fontWeight: 500,
                color: stage.color,
              }}
            >
              {stage.count}
            </Typography>
          </Box>
        </Tooltip>
      ))}
      
      {totalActive > 0 && (
        <Tooltip title={`${totalActive} total active operations`}>
          <Chip
            size="small"
            label={`${totalActive} total`}
            sx={{
              height: 20,
              fontSize: '10px',
              fontWeight: 500,
              background: 'rgba(255, 255, 255, 0.05)',
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              '& .MuiChip-label': { px: 1 },
            }}
          />
        </Tooltip>
      )}
    </Box>
  );
};

// Single stage pill component for use in other contexts
interface StagePillProps {
  stage: PipelineStage;
  count: number;
  color: string;
  label: string;
  animated?: boolean;
}

export const StagePill: React.FC<StagePillProps> = ({
  stage,
  count,
  color,
  label,
  animated = true,
}) => {
  return (
    <Tooltip title={STAGE_DESCRIPTIONS[stage]}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 0.75,
          background: `${color}15`,
          border: `1px solid ${color}40`,
          borderRadius: `${liquidGlassTokens.radius.sm}px`,
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
          ...(animated && {
            animation: 'pulse 2s infinite',
          }),
          '&:hover': {
            background: `${color}20`,
            borderColor: `${color}60`,
            boxShadow: `0 0 12px ${color}20`,
          },
        }}
      >
        <StatusDotIcon
          sx={{
            fontSize: 8,
            color: color,
            filter: `drop-shadow(0 0 4px ${color})`,
            ...(animated && {
              animation: 'pulse 1.5s infinite',
            }),
          }}
        />
        <Box
          sx={{
            color: color,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {STAGE_ICONS[stage]}
        </Box>
        <Typography
          sx={{
            fontSize: '13px',
            fontWeight: 600,
            color: color,
          }}
        >
          {label}
        </Typography>
        <Chip
          size="small"
          label={count}
          sx={{
            height: 18,
            minWidth: 22,
            fontSize: '11px',
            fontWeight: 700,
            background: `${color}30`,
            color: color,
            border: `1px solid ${color}50`,
            '& .MuiChip-label': { px: 0.75 },
          }}
        />
      </Box>
    </Tooltip>
  );
};
