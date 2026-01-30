/**
 * Detail Panel - Zone 5 (Right "Breathing" Margin)
 * 
 * "Detail appears when attention narrows." The Margin doesn't exist until you need it.
 * 
 * Design Philosophy:
 * - Hidden by default (0px width) - interface "breathes" with user attention
 * - Appears on hover-intent or selection (320px for full, 280px for preview)
 * - Creates rhythm: wide view (gestalt) ↔ narrow view (focus)
 * - Stage expands to fill space when margin hidden
 * - Preview state (partial info on hover) vs full state (complete info on click)
 * 
 * ANTI-PATTERN AVOIDED: Modal Settings as Default
 * - Problem: Context-switching friction
 * - Solution: Margin surfaces common info inline; modal only for complex operations
 * 
 * This component should:
 * - Be invisible until summoned by hover or selection
 * - Show preview on hover-intent (300ms delay)
 * - Show full details on click/selection
 * - Animate smoothly (<300ms transitions)
 */

import React, { useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Divider,
  Chip,
  Button,
  Tooltip,
  Link,
  Fade,
} from '@mui/material';
import {
  Close as CloseIcon,
  PlayArrow as PlayIcon,
  CloudUpload as UploadIcon,
  ContentCopy as CopyIcon,
  Lock as EncryptedIcon,
  OpenInNew as ExternalLinkIcon,
  Token as TokenIcon,
  Schedule as TimeIcon,
  Storage as StorageIcon,
  Sync as SyncIcon,
  Analytics as AnalyticsIcon,
  Extension as PluginIcon,
} from '@mui/icons-material';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import type { TransformationItem, TransformationState } from '@/types/transformation';
import { STATE_COLORS } from '@/hooks/useTransformationPipeline';
import PluginSourcesPanel from '@/components/Plugins/PluginSourcesPanel';
import PluginOperationsPanel from '@/components/Plugins/PluginOperationsPanel';
import OperationsPanel from './OperationsPanel';
import type { MediaSource, DePinActiveOperation, PluginMetadata } from '@/types/plugin';

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

interface DetailPanelProps {
  // Content
  item: TransformationItem | null;
  
  // Plugin sources content
  contentType?: 'video' | 'plugin-sources' | 'plugin-operations' | 'operations';
  pluginName?: string;
  plugin?: PluginMetadata | null | undefined;
  pluginSources?: MediaSource[];
  pluginSourcesLoading?: boolean;
  pluginSourcesError?: string | null;
  onRefreshPluginSources?: () => void;
  
  // Operations content
  operations?: DePinActiveOperation[];
  operationsLoading?: boolean;
  onStopOperation?: (operationId: string) => void;
  onPauseOperation?: (operationId: string, paused: boolean) => void;
  
  // Visibility state (controlled by useLayoutMode)
  visible: boolean;
  preview: boolean;  // Preview mode (hover) vs full mode (click)
  width: number;     // 0, 280 (preview), or 320 (full)
  
  // Callbacks
  onClose: () => void;
  onPlay: (item: TransformationItem) => void;
  onUpload: (item: TransformationItem) => void;
  onAnalyze: (item: TransformationItem) => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({
  item,
  contentType = 'video',
  pluginName,
  plugin,
  pluginSources = [],
  pluginSourcesLoading = false,
  pluginSourcesError = null,
  onRefreshPluginSources,
  operations = [],
  operationsLoading = false,
  onStopOperation,
  onPauseOperation,
  visible,
  preview,
  width,
  onClose,
  onPlay,
  onUpload,
  onAnalyze,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Format duration
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format date
  const formatDate = (dateString?: string): string => {
    if (!dateString) return '--';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '--';
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Don't render anything if not visible
  if (!visible) {
    return null;
  }

  // Don't render if no content
  if (contentType === 'video' && !item) {
    return null;
  }

  if (contentType === 'plugin-sources' && !pluginName) {
    return null;
  }

  // Check if plugin has operation capabilities
  const hasOperationCapability = plugin?.capabilities?.some(
    (cap) => cap.operations && cap.operations.length > 0
  );

  // Render plugin operations panel (for plugins with operation capabilities like subscription)
  if (contentType === 'plugin-operations' || (contentType === 'plugin-sources' && hasOperationCapability)) {
    return (
      <Box
        ref={panelRef}
        sx={{
          width: width,
          height: '100%',
          background: 'rgba(10, 10, 15, 0.7)',
          borderLeft: `1px solid rgba(255, 255, 255, 0.06)`,
          backdropFilter: 'blur(20px) saturate(180%)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: `width ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
          boxShadow: visible ? '-8px 0 32px rgba(0, 0, 0, 0.2)' : 'none',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: preview ? 2 : 3,
            borderBottom: `1px solid rgba(255, 255, 255, 0.06)`,
            minHeight: preview ? 48 : 56,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PluginIcon
              sx={{
                color: liquidGlassTokens.neon.cyan,
                fontSize: preview ? 18 : 20,
              }}
            />
            <Typography
              sx={{
                fontSize: preview ? '14px' : '16px',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.95)',
              }}
            >
              {pluginName}
            </Typography>
          </Box>
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              '&:hover': {
                color: 'rgba(255, 255, 255, 0.9)',
              },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'hidden', p: preview ? 2 : 3 }}>
          <PluginOperationsPanel
            plugin={plugin}
            pluginName={pluginName!}
          />
        </Box>
      </Box>
    );
  }

  // Render plugin sources panel (legacy - for plugins without operation capabilities)
  if (contentType === 'plugin-sources') {
    return (
      <Box
        ref={panelRef}
        sx={{
          width: width,
          height: '100%',
          background: 'rgba(10, 10, 15, 0.7)',
          borderLeft: `1px solid rgba(255, 255, 255, 0.06)`,
          backdropFilter: 'blur(20px) saturate(180%)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: `width ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
          boxShadow: visible ? '-8px 0 32px rgba(0, 0, 0, 0.2)' : 'none',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: preview ? 2 : 3,
            borderBottom: `1px solid rgba(255, 255, 255, 0.06)`,
            minHeight: preview ? 48 : 56,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PluginIcon
              sx={{
                color: liquidGlassTokens.neon.cyan,
                fontSize: preview ? 18 : 20,
              }}
            />
            <Typography
              sx={{
                fontSize: preview ? '14px' : '16px',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.95)',
              }}
            >
              Plugin Sources
            </Typography>
          </Box>
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              '&:hover': {
                color: 'rgba(255, 255, 255, 0.9)',
              },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'hidden', p: preview ? 2 : 3 }}>
          <PluginSourcesPanel
            pluginName={pluginName!}
            sources={pluginSources}
            loading={pluginSourcesLoading}
            error={pluginSourcesError}
            onRefresh={onRefreshPluginSources || (() => {})}
          />
        </Box>
      </Box>
    );
  }

  // Render operations panel
  if (contentType === 'operations') {
    return (
      <Box
        ref={panelRef}
        sx={{
          width: width,
          height: '100%',
          background: 'rgba(10, 10, 15, 0.7)',
          borderLeft: `1px solid rgba(255, 255, 255, 0.06)`,
          backdropFilter: 'blur(20px) saturate(180%)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: `width ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
          boxShadow: visible ? '-8px 0 32px rgba(0, 0, 0, 0.2)' : 'none',
        }}
      >
        <OperationsPanel
          operations={operations}
          onStop={onStopOperation || (() => {})}
          onPause={onPauseOperation || (() => {})}
          loading={operationsLoading}
        />
      </Box>
    );
  }

  if (!item) {
    return null;
  }

  const stateColor = STATE_COLORS[item.state];
  const canPlay = item.state !== 'discovering';
  const canUpload = item.state === 'pending';

  return (
    <Box
      ref={panelRef}
      sx={{
        width: width,
        height: '100%',
        background: liquidGlassTokens.canvas.base,
        borderLeft: `1px solid rgba(255, 255, 255, 0.06)`,
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: `width ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
        
        // Subtle glow when appearing
        boxShadow: visible ? '-8px 0 32px rgba(0, 0, 0, 0.2)' : 'none',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: preview ? 2 : 3,
          borderBottom: `1px solid rgba(255, 255, 255, 0.06)`,
          minHeight: preview ? 48 : 56,
        }}
      >
        <Typography
          sx={{
            fontSize: preview ? '14px' : '16px',
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.95)',
            transition: `font-size ${liquidGlassTokens.motion.durationFast} ease`,
          }}
        >
          {preview ? 'Preview' : 'Details'}
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            '&:hover': {
              color: 'rgba(255, 255, 255, 0.9)',
            },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Content - scrollable */}
      <Box sx={{ flex: 1, overflow: 'auto', p: preview ? 2 : 3 }}>
        {/* State Badge */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            mb: preview ? 2 : 3,
            px: 2,
            py: preview ? 1 : 1.5,
            background: `${stateColor}10`,
            border: `1px solid ${stateColor}30`,
            borderRadius: `${liquidGlassTokens.radius.md}px`,
          }}
        >
          <Box
            sx={{
              width: preview ? 8 : 10,
              height: preview ? 8 : 10,
              borderRadius: '50%',
              background: stateColor,
              boxShadow: `0 0 8px ${stateColor}`,
            }}
          />
          <Typography
            sx={{
              fontSize: preview ? '12px' : '14px',
              fontWeight: 600,
              color: stateColor,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            {item.state in STATE_LABELS ? STATE_LABELS[item.state] : item.state}
          </Typography>
          {item.isEncrypted && (
            <Tooltip title="Content encrypted">
              <EncryptedIcon
                sx={{
                  fontSize: preview ? 14 : 16,
                  color: liquidGlassTokens.neon.cyan,
                  marginLeft: 'auto',
                }}
              />
            </Tooltip>
          )}
        </Box>

        {/* Title */}
        <Typography
          sx={{
            fontSize: preview ? '15px' : '18px',
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.95)',
            mb: 2,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: preview ? 2 : 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {item.title}
        </Typography>

        {/* Token Info (if available) */}
        {item.tokenInfo && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              mb: preview ? 2 : 3,
              p: 1.5,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: `${liquidGlassTokens.radius.sm}px`,
            }}
          >
            <TokenIcon
              sx={{
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                fontSize: preview ? 18 : 20,
              }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'rgba(255, 255, 255, 0.9)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.tokenInfo?.name || item.tokenInfo?.symbol || 'Unknown Token'}
              </Typography>
              {item.tokenInfo?.mintId && !preview && (
                <Typography
                  sx={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  }}
                >
                  {item.tokenInfo?.mintId?.slice(0, 12)}...
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* Quick Actions - Always visible */}
        <Box sx={{ display: 'flex', gap: 2, mb: preview ? 2 : 3 }}>
          {canPlay && (
            <Button
              variant="contained"
              startIcon={<PlayIcon />}
              onClick={() => onPlay(item)}
              size={preview ? 'small' : 'medium'}
              sx={{
                flex: 1,
                background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}25 0%, ${liquidGlassTokens.neon.cyan}15 100%)`,
                border: `1px solid ${liquidGlassTokens.neon.cyan}40`,
                color: liquidGlassTokens.neon.cyan,
                fontSize: preview ? '12px' : '14px',
                '&:hover': {
                  background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}35 0%, ${liquidGlassTokens.neon.cyan}20 100%)`,
                  boxShadow: glowEffects.cyan(0.3),
                },
              }}
            >
              Play
            </Button>
          )}
          {canUpload && (
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={() => onUpload(item)}
              size={preview ? 'small' : 'medium'}
              sx={{
                flex: 1,
                background: `linear-gradient(135deg, ${liquidGlassTokens.neon.magenta}25 0%, ${liquidGlassTokens.neon.magenta}15 100%)`,
                border: `1px solid ${liquidGlassTokens.neon.magenta}40`,
                color: liquidGlassTokens.neon.magenta,
                fontSize: preview ? '12px' : '14px',
                '&:hover': {
                  background: `linear-gradient(135deg, ${liquidGlassTokens.neon.magenta}35 0%, ${liquidGlassTokens.neon.magenta}20 100%)`,
                  boxShadow: glowEffects.magenta(0.3),
                },
              }}
            >
              Upload
            </Button>
          )}
        </Box>

        {/* Full details - only in non-preview mode */}
        {!preview && (
          <Fade in={!preview} timeout={200}>
            <Box>
              <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.06)', mb: 3 }} />

              {/* Metadata Section */}
              <Typography
                sx={{
                  fontSize: '11px',
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  mb: 2,
                }}
              >
                Metadata
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
                <MetadataRow
                  icon={<TimeIcon />}
                  label="Duration"
                  value={formatDuration(item.duration)}
                />
                <MetadataRow
                  icon={<TimeIcon />}
                  label="Discovered"
                  value={formatDate(item.discoveredAt)}
                />
                {item.uploadedAt && (
                  <MetadataRow
                    icon={<UploadIcon />}
                    label="Uploaded"
                    value={formatDate(item.uploadedAt)}
                  />
                )}
                <MetadataRow
                  icon={<StorageIcon />}
                  label="Source"
                  value={item.sourceType.toUpperCase()}
                />
              </Box>

              {/* Filecoin CID */}
              {item.filecoinCid && (
                <>
                  <Typography
                    sx={{
                      fontSize: '11px',
                      color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      mb: 2,
                    }}
                  >
                    Filecoin Storage
                  </Typography>

                  <Box
                    sx={{
                      p: 2,
                      background: `${liquidGlassTokens.neon.success}08`,
                      border: `1px solid ${liquidGlassTokens.neon.success}20`,
                      borderRadius: `${liquidGlassTokens.radius.sm}px`,
                      mb: 4,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography
                        sx={{
                          fontSize: '11px',
                          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                        }}
                      >
                        CID
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => item.filecoinCid && copyToClipboard(item.filecoinCid)}
                        sx={{
                          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                          width: 20,
                          height: 20,
                          '&:hover': { color: liquidGlassTokens.neon.cyan },
                        }}
                      >
                        <CopyIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                    </Box>
                    <Typography
                      sx={{
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        color: liquidGlassTokens.neon.success,
                        wordBreak: 'break-all',
                      }}
                    >
                      {item.filecoinCid}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                      <Tooltip title="View on IPFS Gateway">
                        <Button
                          size="small"
                          startIcon={<ExternalLinkIcon sx={{ fontSize: 14 }} />}
                          component={Link}
                          href={`https://gateway.pinata.cloud/ipfs/${item.filecoinCid || ''}`}
                          target="_blank"
                          sx={{
                            fontSize: '11px',
                            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                            '&:hover': { color: liquidGlassTokens.neon.cyan },
                          }}
                        >
                          IPFS
                        </Button>
                      </Tooltip>
                      <Tooltip title="View on Filfox">
                        <Button
                          size="small"
                          startIcon={<ExternalLinkIcon sx={{ fontSize: 14 }} />}
                          component={Link}
                          href={`https://filfox.info/en/deal?cid=${item.filecoinCid || ''}`}
                          target="_blank"
                          sx={{
                            fontSize: '11px',
                            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                            '&:hover': { color: liquidGlassTokens.neon.cyan },
                          }}
                        >
                          Filfox
                        </Button>
                      </Tooltip>
                    </Box>
                  </Box>
                </>
              )}

              {/* Arkiv Sync */}
              {item.arkivEntityKey && (
                <>
                  <Typography
                    sx={{
                      fontSize: '11px',
                      color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      mb: 2,
                    }}
                  >
                    Blockchain Verification
                  </Typography>

                  <Box
                    sx={{
                      p: 2,
                      background: `${liquidGlassTokens.neon.amber}08`,
                      border: `1px solid ${liquidGlassTokens.neon.amber}20`,
                      borderRadius: `${liquidGlassTokens.radius.sm}px`,
                      mb: 4,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <SyncIcon sx={{ fontSize: 14, color: liquidGlassTokens.neon.amber }} />
                      <Typography
                        sx={{
                          fontSize: '12px',
                          color: liquidGlassTokens.neon.amber,
                          fontWeight: 500,
                        }}
                      >
                        Synced to Arkiv
                      </Typography>
                    </Box>
                    <Typography
                      sx={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                        wordBreak: 'break-all',
                      }}
                    >
                      {item.arkivEntityKey || ''}
                    </Typography>
                  </Box>
                </>
              )}

              {/* Error Info */}
              {item?.state === 'failed' && item?.errorMessage && (
                <>
                  <Typography
                    sx={{
                      fontSize: '11px',
                      color: liquidGlassTokens.neon.error,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      mb: 2,
                    }}
                  >
                    Error Details
                  </Typography>

                  <Box
                    sx={{
                      p: 2,
                      background: `${liquidGlassTokens.neon.error}08`,
                      border: `1px solid ${liquidGlassTokens.neon.error}30`,
                      borderRadius: `${liquidGlassTokens.radius.sm}px`,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '13px',
                        color: liquidGlassTokens.neon.error,
                      }}
                    >
                      {item.errorMessage || ''}
                    </Typography>
                  </Box>
                </>
              )}

              {/* Analyze Action */}
              <Box sx={{ mt: 3 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<AnalyticsIcon />}
                  onClick={() => item && onAnalyze(item)}
                  sx={{
                    color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    '&:hover': {
                      borderColor: liquidGlassTokens.neon.amber,
                      color: liquidGlassTokens.neon.amber,
                      background: `${liquidGlassTokens.neon.amber}10`,
                    },
                  }}
                >
                  Analyze with VLM
                </Button>
              </Box>
            </Box>
          </Fade>
        )}
      </Box>
    </Box>
  );
};

// Metadata Row Component
interface MetadataRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const MetadataRow: React.FC<MetadataRowProps> = ({ icon, label, value }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
    <Box
      sx={{
        color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
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
        color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
        minWidth: 80,
      }}
    >
      {label}
    </Typography>
    <Typography
      sx={{
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.9)',
        fontWeight: 500,
      }}
    >
      {value}
    </Typography>
  </Box>
);

export default DetailPanel;
