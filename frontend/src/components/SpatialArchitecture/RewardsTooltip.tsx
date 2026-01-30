/**
 * RewardsTooltip - Detailed DePIN rewards display
 * 
 * Shows comprehensive rewards information on hover:
 * - Rank title (Observer, Archivist, Signal Keeper, etc.)
 * - Level progress (0-1000 XP per level)
 * - Tier progress
 * - Streak counter
 */

import React from 'react';
import {
  Box,
  Typography,
  Divider,
} from '@mui/material';
import {
  Star as RankIcon,
  TrendingUp as LevelIcon,
  MilitaryTech as TierIcon,
  LocalFireDepartment as StreakIcon,
} from '@mui/icons-material';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';

interface RewardsTooltipProps {
  points: number;
  streak: number;
  level: number;
  tier: string;
}

const TIER_COLORS: Record<string, string> = {
  'Observer': liquidGlassTokens.neon.cyan,
  'Archivist': liquidGlassTokens.neon.success,
  'Signal Keeper': liquidGlassTokens.neon.cyan,
  'Chronicle Guardian': liquidGlassTokens.neon.magenta,
  'Mythic Librarian': liquidGlassTokens.neon.amber,
};

const RewardsTooltip: React.FC<RewardsTooltipProps> = ({
  points,
  streak,
  level,
  tier,
}) => {
  // Calculate progress within current level (0-1000 XP per level)
  const levelProgress = points % 1000;
  const levelProgressPercent = (levelProgress / 1000) * 100;

  // Calculate tier progress
  const { tierProgress, tierProgressPercent, nextTierThreshold } = calculateTierProgress(points);

  const tierColor = TIER_COLORS[tier] || liquidGlassTokens.neon.cyan;

  return (
    <Box
      sx={{
        p: 2.5,
        minWidth: 280,
        maxWidth: 320,
        background: liquidGlassTokens.canvas.elevated,
        backdropFilter: 'blur(20px)',
        borderRadius: `${liquidGlassTokens.radius.md}px`,
        border: `1px solid rgba(255, 255, 255, 0.08)`,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <RankIcon 
          sx={{ 
            fontSize: 20, 
            color: tierColor,
            filter: `drop-shadow(0 0 4px ${tierColor})`,
          }} 
        />
        <Typography
          sx={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.95)',
          }}
        >
          {tier}
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.06)', mb: 2 }} />

      {/* Level Progress */}
      <Box sx={{ mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <LevelIcon sx={{ fontSize: 14, color: liquidGlassTokens.neon.cyan }} />
          <Typography
            sx={{
              fontSize: '12px',
              fontWeight: 500,
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
            }}
          >
            Level {level}
          </Typography>
          <Typography
            sx={{
              fontSize: '11px',
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              ml: 'auto',
            }}
          >
            {levelProgress} / 1000 XP
          </Typography>
        </Box>
        <ProgressBar 
          progress={levelProgressPercent} 
          color={liquidGlassTokens.neon.cyan}
        />
      </Box>

      {/* Tier Progress */}
      <Box sx={{ mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <TierIcon sx={{ fontSize: 14, color: tierColor }} />
          <Typography
            sx={{
              fontSize: '12px',
              fontWeight: 500,
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
            }}
          >
            Tier Progress
          </Typography>
          <Typography
            sx={{
              fontSize: '11px',
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              ml: 'auto',
            }}
          >
            {nextTierThreshold > 0 ? `${tierProgress} / ${nextTierThreshold} PTS` : 'Max Tier'}
          </Typography>
        </Box>
        <ProgressBar 
          progress={tierProgressPercent} 
          color={tierColor}
        />
      </Box>

      {/* Streak */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          background: streak > 0 ? `${liquidGlassTokens.neon.amber}10` : 'rgba(255, 255, 255, 0.03)',
          borderRadius: `${liquidGlassTokens.radius.sm}px`,
          border: streak > 0 ? `1px solid ${liquidGlassTokens.neon.amber}20` : '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <StreakIcon 
          sx={{ 
            fontSize: 18, 
            color: streak > 0 ? liquidGlassTokens.neon.amber : `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
          }} 
        />
        <Box>
          <Typography
            sx={{
              fontSize: '13px',
              fontWeight: 600,
              color: streak > 0 ? liquidGlassTokens.neon.amber : `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
            }}
          >
            {streak} Day Streak
          </Typography>
          <Typography
            sx={{
              fontSize: '11px',
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            }}
          >
            {streak > 0 ? 'Keep it going!' : 'Start your streak today'}
          </Typography>
        </Box>
      </Box>

      {/* Total Points */}
      <Box
        sx={{
          mt: 2,
          pt: 2,
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography
          sx={{
            fontSize: '12px',
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
          }}
        >
          Total Points
        </Typography>
        <Typography
          sx={{
            fontSize: '18px',
            fontWeight: 700,
            color: liquidGlassTokens.neon.amber,
            textShadow: `0 0 12px ${liquidGlassTokens.neon.amber}50`,
          }}
        >
          {points.toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );
};

// Progress Bar Component
const ProgressBar: React.FC<{ progress: number; color: string }> = ({ progress, color }) => (
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
        width: `${Math.min(100, Math.max(0, progress))}%`,
        height: '100%',
        background: `linear-gradient(90deg, ${color}, ${color}80)`,
        borderRadius: 2,
        transition: 'width 0.3s ease',
        boxShadow: `0 0 8px ${color}40`,
      }}
    />
  </Box>
);

// Helper function to calculate tier progress
function calculateTierProgress(points: number): { 
  tierProgress: number; 
  tierProgressPercent: number; 
  nextTierThreshold: number;
} {
  const tiers = [
    { name: 'Observer', min: 0, max: 999 },
    { name: 'Archivist', min: 1000, max: 2499 },
    { name: 'Signal Keeper', min: 2500, max: 4999 },
    { name: 'Chronicle Guardian', min: 5000, max: 9999 },
    { name: 'Mythic Librarian', min: 10000, max: Infinity },
  ];

  const currentTier = tiers.find(t => points >= t.min && points <= t.max) || tiers[0];
  const nextTier = tiers[tiers.indexOf(currentTier) + 1];

  if (!nextTier) {
    // Max tier reached
    return { tierProgress: points, tierProgressPercent: 100, nextTierThreshold: 0 };
  }

  const range = nextTier.min - currentTier.min;
  const progress = points - currentTier.min;
  const percent = (progress / range) * 100;

  return {
    tierProgress: progress,
    tierProgressPercent: percent,
    nextTierThreshold: range,
  };
}

export default RewardsTooltip;
