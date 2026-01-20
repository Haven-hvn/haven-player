/**
 * Transformation Canvas - Zone 2 (Center Primary)
 * 
 * The main content area showing content in transformation.
 * Content grouped by source identity, sorted by transformation state.
 * State badges shown BEFORE metadata (transformation-first).
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Avatar,
  Chip,
  IconButton,
  LinearProgress,
  Collapse,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  PlayArrow as PlayIcon,
  CloudUpload as UploadIcon,
  Visibility as ViewIcon,
  MoreVert as MoreIcon,
  Lock as EncryptedIcon,
  Token as TokenIcon,
  FiberManualRecord as StatusDotIcon,
  Error as ErrorIcon,
  CheckCircle as SuccessIcon,
  Schedule as PendingIcon,
} from '@mui/icons-material';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import type { TransformationItem, TransformationState, SourceType } from '@/types/transformation';
import { STATE_COLORS } from '@/hooks/useTransformationPipeline';

// State labels for display
const STATE_LABELS: Record<TransformationState, string> = {
  discovering: 'Discovering',
  recording: 'Recording',
  pending: 'Pending Upload',
  uploading: 'Uploading',
  preserved: 'Preserved',
  syncing: 'Syncing',
  synced: 'Synced',
  failed: 'Failed',
  encrypted: 'Encrypted',
};

interface TransformationCanvasProps {
  items: TransformationItem[];
  loading: boolean;
  onItemClick: (item: TransformationItem) => void;
  onItemPlay: (item: TransformationItem) => void;
  onItemUpload: (item: TransformationItem) => void;
}

const TransformationCanvas: React.FC<TransformationCanvasProps> = ({
  items,
  loading,
  onItemClick,
  onItemPlay,
  onItemUpload,
}) => {
  // Group items by source identity (token/channel)
  const groupedItems = React.useMemo(() => {
    const groups: Map<string, TransformationItem[]> = new Map();
    
    items.forEach(item => {
      // Group by token info if available, otherwise by source identity
      const groupKey = item.tokenInfo?.mintId || item.sourceIdentity;
      const existing = groups.get(groupKey) || [];
      existing.push(item);
      groups.set(groupKey, existing);
    });

    // Convert to array and sort by most recent activity
    return Array.from(groups.entries())
      .map(([key, groupItems]) => ({
        key,
        items: groupItems,
        tokenInfo: groupItems[0]?.tokenInfo,
        latestActivity: groupItems.reduce((latest, item) => {
          const itemDate = new Date(item.discoveredAt || '').getTime();
          return itemDate > latest ? itemDate : latest;
        }, 0),
        hasActiveRecording: groupItems.some(i => i.state === 'recording'),
        hasErrors: groupItems.some(i => i.state === 'failed'),
      }))
      .sort((a, b) => {
        // Errors first, then active recordings, then by date
        if (a.hasErrors !== b.hasErrors) return a.hasErrors ? -1 : 1;
        if (a.hasActiveRecording !== b.hasActiveRecording) return a.hasActiveRecording ? -1 : 1;
        return b.latestActivity - a.latestActivity;
      });
  }, [items]);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
        }}
      >
        <Typography>Loading content...</Typography>
      </Box>
    );
  }

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {groupedItems.map(group => (
        <ContentGroup
          key={group.key}
          groupKey={group.key}
          items={group.items}
          tokenInfo={group.tokenInfo}
          hasActiveRecording={group.hasActiveRecording}
          hasErrors={group.hasErrors}
          onItemClick={onItemClick}
          onItemPlay={onItemPlay}
          onItemUpload={onItemUpload}
        />
      ))}
    </Box>
  );
};

// Empty State Component
const EmptyState: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 3,
    }}
  >
    <Box
      sx={{
        width: 80,
        height: 80,
        borderRadius: '20px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <TokenIcon
        sx={{
          fontSize: 40,
          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
        }}
      />
    </Box>
    <Box sx={{ textAlign: 'center' }}>
      <Typography
        sx={{
          fontSize: '18px',
          fontWeight: 500,
          color: 'rgba(255, 255, 255, 0.9)',
          mb: 1,
        }}
      >
        No content yet
      </Typography>
      <Typography
        sx={{
          fontSize: '14px',
          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
          maxWidth: 300,
        }}
      >
        Start by enabling a plugin or subscribing to a stream to begin archiving content.
      </Typography>
    </Box>
  </Box>
);

// Content Group Component (Token/Source Group)
interface ContentGroupProps {
  groupKey: string;
  items: TransformationItem[];
  tokenInfo?: TransformationItem['tokenInfo'];
  hasActiveRecording: boolean;
  hasErrors: boolean;
  onItemClick: (item: TransformationItem) => void;
  onItemPlay: (item: TransformationItem) => void;
  onItemUpload: (item: TransformationItem) => void;
}

const ContentGroup: React.FC<ContentGroupProps> = ({
  groupKey,
  items,
  tokenInfo,
  hasActiveRecording,
  hasErrors,
  onItemClick,
  onItemPlay,
  onItemUpload,
}) => {
  const [expanded, setExpanded] = useState(true);

  const getDisplayName = () => {
    if (tokenInfo?.name && tokenInfo?.symbol) {
      return `${tokenInfo.name} (${tokenInfo.symbol})`;
    }
    if (tokenInfo?.name) return tokenInfo.name;
    if (tokenInfo?.symbol) return tokenInfo.symbol;
    
    // Truncate long identifiers
    if (groupKey.length > 20) {
      return `${groupKey.slice(0, 8)}...${groupKey.slice(-6)}`;
    }
    return groupKey;
  };

  // Count states in this group
  const stateCounts = items.reduce((acc, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Box
      sx={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: `1px solid ${hasErrors ? liquidGlassTokens.neon.error + '40' : hasActiveRecording ? liquidGlassTokens.neon.magenta + '40' : 'rgba(255, 255, 255, 0.06)'}`,
        borderRadius: `${liquidGlassTokens.radius.lg}px`,
        overflow: 'hidden',
        transition: `all ${liquidGlassTokens.motion.durationNormal} ease`,
        ...(hasActiveRecording && {
          boxShadow: `0 0 20px ${liquidGlassTokens.neon.magenta}20`,
        }),
        ...(hasErrors && {
          boxShadow: `0 0 20px ${liquidGlassTokens.neon.error}20`,
        }),
      }}
    >
      {/* Group Header */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          p: 2,
          cursor: 'pointer',
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: expanded ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
          '&:hover': {
            background: 'rgba(255, 255, 255, 0.04)',
          },
        }}
      >
        {/* Avatar */}
        <Avatar
          src={tokenInfo?.imageUri}
          sx={{
            width: 44,
            height: 44,
            background: 'rgba(255, 255, 255, 0.06)',
            border: hasActiveRecording
              ? `2px solid ${liquidGlassTokens.neon.magenta}`
              : '1px solid rgba(255, 255, 255, 0.1)',
            ...(hasActiveRecording && {
              animation: 'pulse 2s infinite',
            }),
          }}
        >
          <TokenIcon sx={{ color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` }} />
        </Avatar>

        {/* Group Info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: '15px',
              fontWeight: 500,
              color: 'rgba(255, 255, 255, 0.95)',
              lineHeight: 1.3,
            }}
          >
            {getDisplayName()}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
            <Typography
              sx={{
                fontSize: '12px',
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              }}
            >
              {items.length} item{items.length !== 1 ? 's' : ''}
            </Typography>
            
            {/* State summary badges */}
            {Object.entries(stateCounts).slice(0, 3).map(([state, count]) => (
              <Chip
                key={state}
                label={`${count} ${STATE_LABELS[state as TransformationState]}`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '10px',
                  fontWeight: 500,
                  background: `${STATE_COLORS[state as TransformationState]}15`,
                  color: STATE_COLORS[state as TransformationState],
                  border: `1px solid ${STATE_COLORS[state as TransformationState]}30`,
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            ))}
          </Box>
        </Box>

        {/* Expand Icon */}
        <IconButton
          size="small"
          sx={{
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
          }}
        >
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {/* Items */}
      <Collapse in={expanded}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 2,
            p: 2,
          }}
        >
          {items.map(item => (
            <TransformationCard
              key={item.id}
              item={item}
              onClick={() => onItemClick(item)}
              onPlay={() => onItemPlay(item)}
              onUpload={() => onItemUpload(item)}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};

// Transformation Card Component
interface TransformationCardProps {
  item: TransformationItem;
  onClick: () => void;
  onPlay: () => void;
  onUpload: () => void;
}

const TransformationCard: React.FC<TransformationCardProps> = ({
  item,
  onClick,
  onPlay,
  onUpload,
}) => {
  const stateColor = STATE_COLORS[item.state];
  const isActive = item.state === 'recording' || item.state === 'uploading';
  const canUpload = item.state === 'pending';
  const canPlay = item.state !== 'discovering';

  // Format duration
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Box
      onClick={onClick}
      sx={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: `1px solid ${isActive ? stateColor + '40' : 'rgba(255, 255, 255, 0.08)'}`,
        borderRadius: `${liquidGlassTokens.radius.md}px`,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
        position: 'relative',
        '&:hover': {
          background: 'rgba(255, 255, 255, 0.05)',
          borderColor: `${stateColor}60`,
          transform: 'translateY(-2px)',
          boxShadow: `0 8px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px ${stateColor}30`,
        },
        ...(isActive && {
          animation: 'pulse 2s infinite',
        }),
      }}
    >
      {/* STATE BADGE - TRANSFORMATION FIRST */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          background: `${stateColor}10`,
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <StatusDotIcon
            sx={{
              fontSize: 10,
              color: stateColor,
              filter: `drop-shadow(0 0 4px ${stateColor})`,
              ...(isActive && {
                animation: 'pulse 1.5s infinite',
              }),
            }}
          />
          <Typography
            sx={{
              fontSize: '13px',
              fontWeight: 600,
              color: stateColor,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            {STATE_LABELS[item.state]}
            {item.progress !== undefined && item.progress < 100 && ` ${item.progress}%`}
          </Typography>
        </Box>

        {/* Encryption indicator */}
        {item.isEncrypted && (
          <Tooltip title="Content encrypted">
            <EncryptedIcon
              sx={{
                fontSize: 16,
                color: liquidGlassTokens.neon.cyan,
              }}
            />
          </Tooltip>
        )}
      </Box>

      {/* Progress bar for uploading/recording */}
      {isActive && item.progress !== undefined && (
        <LinearProgress
          variant="determinate"
          value={item.progress}
          sx={{
            height: 2,
            background: 'rgba(255, 255, 255, 0.06)',
            '& .MuiLinearProgress-bar': {
              background: stateColor,
            },
          }}
        />
      )}

      {/* Content */}
      <Box sx={{ p: 2 }}>
        <Typography
          sx={{
            fontSize: '14px',
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.9)',
            mb: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography
            sx={{
              fontSize: '12px',
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            }}
          >
            {formatDuration(item.duration)}
          </Typography>

          {item.filecoinCid && (
            <Tooltip title={`CID: ${item.filecoinCid}`}>
              <Typography
                sx={{
                  fontSize: '11px',
                  color: liquidGlassTokens.neon.success,
                  fontFamily: 'monospace',
                }}
              >
                {item.filecoinCid.slice(0, 8)}...
              </Typography>
            </Tooltip>
          )}
        </Box>

        {/* Error message if failed */}
        {item.state === 'failed' && item.errorMessage && (
          <Typography
            sx={{
              fontSize: '11px',
              color: liquidGlassTokens.neon.error,
              mt: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.errorMessage}
          </Typography>
        )}
      </Box>

      {/* Actions */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 1,
          px: 2,
          pb: 2,
        }}
      >
        {canPlay && (
          <Tooltip title="Play">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
              sx={{
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                '&:hover': {
                  color: liquidGlassTokens.neon.cyan,
                  background: `${liquidGlassTokens.neon.cyan}15`,
                },
              }}
            >
              <PlayIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {canUpload && (
          <Tooltip title="Upload to Filecoin">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onUpload();
              }}
              sx={{
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                '&:hover': {
                  color: liquidGlassTokens.neon.cyan,
                  background: `${liquidGlassTokens.neon.cyan}15`,
                },
              }}
            >
              <UploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="View details">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              '&:hover': {
                color: 'rgba(255, 255, 255, 0.9)',
                background: 'rgba(255, 255, 255, 0.08)',
              },
            }}
          >
            <ViewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default TransformationCanvas;
