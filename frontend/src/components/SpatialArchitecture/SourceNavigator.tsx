/**
 * Source Navigator - Zone 1 (Left Spine)
 * 
 * A 64px collapsed spine that expands on hover, not a fat persistent sidebar.
 * 
 * ANTI-PATTERN AVOIDED: Fat Left Sidebar (>200px persistent)
 * - Problem: Steals Stage space for low-frequency navigation
 * - Solution: 64px collapsed Spine, expand to ~240px on hover
 * 
 * Design Philosophy:
 * - Collapsed: Shows icons only, brand logo, essential at-a-glance info
 * - Expanded: Full labels, filters, actions on hover
 * - Transition: Smooth expand/collapse (<300ms)
 * - Settings lives here (low-frequency action, not in header)
 */

import React, { useState, useCallback, useRef } from 'react';
import appIcon from '../../../appicon.png';
import {
  Box,
  Typography,
  Collapse,
  Badge,
  IconButton,
  Tooltip,
  Fade,
  Switch,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Token as TokenIcon,
  YouTube as YouTubeIcon,
  CloudDownload as BitTorrentIcon,
  Devices as OpenRingIcon,
  UploadFile as ManualIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  Help as HelpIcon,
  FiberManualRecord as StatusDotIcon,
  Storage as StorageIcon,
  FilterList as FilterIcon,
  Extension as PluginIcon,
  CloudUpload as UploadIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import { CircuitSubstrateSimple } from '@/components/LiquidGlass';
import type { Source, SourceType, StateFilter } from '@/types/transformation';
import type { PluginHealth } from '@/types/plugin';

// Constants for spine dimensions
const SPINE_COLLAPSED_WIDTH = 64;
const SPINE_EXPANDED_WIDTH = 240;
const HOVER_DELAY = 150; // ms delay before expanding

// Icon mapping for source types
const SOURCE_ICONS: Record<SourceType, React.ReactNode> = {
  pumpfun: <TokenIcon />,
  youtube: <YouTubeIcon />,
  bittorrent: <BitTorrentIcon />,
  openring: <OpenRingIcon />,
  manual: <ManualIcon />,
};

// Display names for source types
const SOURCE_NAMES: Record<SourceType, string> = {
  pumpfun: 'PumpFun',
  youtube: 'YouTube',
  bittorrent: 'BitTorrent',
  openring: 'OpenRing',
  manual: 'Manual',
};

interface SourceNavigatorProps {
  sources: Source[];
  stateFilters: StateFilter[];
  activeSourceFilter: SourceType | 'all';
  activeStateFilter: string;
  onSourceFilterChange: (source: SourceType | 'all') => void;
  onStateFilterChange: (state: string) => void;
  onRefresh: () => void;
  onSettings: () => void;
  onPluginConfig?: (anchorEl: HTMLElement) => void;
  // Node/Upload Worker props
  pluginHealthStatus?: PluginHealth[];
  nodeActive?: boolean;
  filecoinConfigured?: boolean;
  onNodeToggle?: (active: boolean) => void;
}

const SourceNavigator: React.FC<SourceNavigatorProps> = ({
  sources,
  stateFilters,
  activeSourceFilter,
  activeStateFilter,
  onSourceFilterChange,
  onStateFilterChange,
  onRefresh,
  onSettings,
  onPluginConfig,
  pluginHealthStatus = [],
  nodeActive = false,
  filecoinConfigured = false,
  onNodeToggle,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pluginsButtonRef = useRef<HTMLDivElement>(null);

  // Handle mouse enter with delay
  const handleMouseEnter = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
      setIsExpanded(true);
    }, HOVER_DELAY);
  }, []);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(false);
    setIsExpanded(false);
  }, []);

  // Calculate totals
  const totalItems = sources.reduce((sum, s) => sum + s.itemCount, 0);
  const activeRecordings = sources.reduce((sum, s) => sum + s.activeCount, 0);
  const totalErrors = sources.reduce((sum, s) => sum + s.errorCount, 0);

  const width = isExpanded ? SPINE_EXPANDED_WIDTH : SPINE_COLLAPSED_WIDTH;

  return (
    <Box
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        width: width,
        height: '100vh',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid rgba(255, 255, 255, 0.06)`,
        position: 'relative',
        overflow: 'hidden',
        transition: `width ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
        zIndex: 20, // Above canvas when expanded
      }}
    >
      {/* Circuit substrate background */}
      <CircuitSubstrateSimple
        color={liquidGlassTokens.neon.cyan}
        opacity={0.06}
        animated={true}
      />

      {/* Vertical circuit line accent */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: '80px',
          bottom: '80px',
          width: '2px',
          background: `linear-gradient(180deg, transparent, ${liquidGlassTokens.neon.cyan}40, transparent)`,
          opacity: isExpanded ? 0.7 : 0.4,
          transition: `opacity ${liquidGlassTokens.motion.durationFast} ease`,
        }}
      />

      {/* Brand Logo */}
      <Box
        sx={{
          p: isExpanded ? 3 : 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          position: 'relative',
          zIndex: 1,
          justifyContent: isExpanded ? 'flex-start' : 'center',
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            minWidth: 40,
            background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}30 0%, ${liquidGlassTokens.neon.magenta}20 100%)`,
            border: `1px solid ${liquidGlassTokens.neon.cyan}40`,
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: glowEffects.cyan(0.2),
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '50%',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)',
            },
          }}
        >
          <Box
            component="img"
            src={appIcon}
            alt="Haven"
            sx={{
              width: 28,
              height: 28,
              objectFit: 'contain',
              filter: `drop-shadow(0 0 4px ${liquidGlassTokens.neon.cyan})`,
            }}
          />
        </Box>
        
        {/* Brand text - only when expanded */}
        <Fade in={isExpanded} timeout={200}>
          <Box sx={{ display: isExpanded ? 'block' : 'none' }}>
            <Typography
              sx={{
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                fontWeight: 600,
                fontSize: '18px',
                color: 'rgba(255, 255, 255, 0.95)',
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}
            >
              Haven
            </Typography>
            <Typography
              sx={{
                fontSize: '11px',
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
              }}
            >
              Digital Preservation
            </Typography>
          </Box>
        </Fade>
      </Box>

      {/* Quick Stats - Collapsed: icons only, Expanded: with labels */}
      <Box
        sx={{
          mx: isExpanded ? 2 : 1,
          mb: 2,
          p: isExpanded ? 2 : 1,
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: `${liquidGlassTokens.radius.md}px`,
          border: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: isExpanded ? 'row' : 'column',
          justifyContent: 'space-around',
          alignItems: 'center',
          gap: isExpanded ? 0 : 2,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <StatItem 
          value={totalItems} 
          label="Total" 
          expanded={isExpanded}
        />
        {isExpanded && (
          <Box sx={{ width: '1px', height: 24, background: 'rgba(255, 255, 255, 0.08)' }} />
        )}
        <StatItem 
          value={activeRecordings} 
          label="Recording" 
          expanded={isExpanded}
          color={activeRecordings > 0 ? liquidGlassTokens.neon.magenta : undefined}
        />
        {isExpanded && (
          <Box sx={{ width: '1px', height: 24, background: 'rgba(255, 255, 255, 0.08)' }} />
        )}
        <StatItem 
          value={totalErrors} 
          label="Errors" 
          expanded={isExpanded}
          color={totalErrors > 0 ? liquidGlassTokens.neon.error : undefined}
        />
      </Box>

      {/* Sources Section */}
      <Box sx={{ px: isExpanded ? 2 : 1, mb: 2, position: 'relative', zIndex: 1 }}>
        {isExpanded && (
          <Fade in={isExpanded} timeout={200}>
            <Typography
              sx={{
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                fontWeight: 500,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                mb: 1,
                px: 1,
              }}
            >
              Sources
            </Typography>
          </Fade>
        )}
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {/* All Sources option */}
          <SourceItem
            icon={<StorageIcon />}
            label="All"
            count={totalItems}
            active={activeSourceFilter === 'all'}
            expanded={isExpanded}
            onClick={() => onSourceFilterChange('all')}
          />
          
          {/* Individual sources */}
          {sources.map((source) => (
            <SourceItem
              key={source.id}
              icon={SOURCE_ICONS[source.type]}
              label={SOURCE_NAMES[source.type]}
              count={source.itemCount}
              active={activeSourceFilter === source.type}
              activeCount={source.activeCount}
              errorCount={source.errorCount}
              enabled={source.enabled}
              expanded={isExpanded}
              onClick={() => onSourceFilterChange(source.type)}
            />
          ))}
        </Box>
      </Box>

      {/* State Filters Section - Only when expanded */}
      {isExpanded && (
        <Fade in={isExpanded} timeout={200}>
          <Box sx={{ px: 2, mb: 2, position: 'relative', zIndex: 1 }}>
            <Typography
              sx={{
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                fontWeight: 500,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                mb: 1,
                px: 1,
              }}
            >
              Filter by State
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {stateFilters.map((filter) => (
                <StateFilterItem
                  key={filter.id}
                  label={filter.label}
                  count={filter.count}
                  color={filter.color}
                  active={activeStateFilter === filter.id}
                  onClick={() => onStateFilterChange(filter.id)}
                />
              ))}
            </Box>
          </Box>
        </Fade>
      )}

      {/* Spacer */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Node Section - Only show if upload plugins are enabled */}
      {hasUploadPlugins(pluginHealthStatus) && (
        <Fade in={isExpanded} timeout={200}>
          <Box
            sx={{
              px: isExpanded ? 2 : 1,
              mb: 2,
              display: isExpanded ? 'block' : 'none',
            }}
          >
            <Typography
              sx={{
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                fontWeight: 500,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                mb: 1,
                px: 1,
              }}
            >
              DePIN Node
            </Typography>
            
            <Box
              sx={{
                p: 2,
                background: nodeActive 
                  ? `${liquidGlassTokens.neon.success}10` 
                  : filecoinConfigured 
                    ? 'rgba(255, 255, 255, 0.03)' 
                    : `${liquidGlassTokens.neon.amber}10`,
                borderRadius: `${liquidGlassTokens.radius.md}px`,
                border: nodeActive 
                  ? `1px solid ${liquidGlassTokens.neon.success}30` 
                  : filecoinConfigured 
                    ? '1px solid rgba(255, 255, 255, 0.08)' 
                    : `1px solid ${liquidGlassTokens.neon.amber}30`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <UploadIcon
                  sx={{
                    fontSize: 18,
                    color: nodeActive 
                      ? liquidGlassTokens.neon.success 
                      : filecoinConfigured 
                        ? `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})` 
                        : liquidGlassTokens.neon.amber,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: nodeActive 
                      ? liquidGlassTokens.neon.success 
                      : 'rgba(255, 255, 255, 0.95)',
                  }}
                >
                  Upload Worker
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Switch
                  checked={nodeActive}
                  onChange={(e) => onNodeToggle?.(e.target.checked)}
                  disabled={!filecoinConfigured}
                  size="small"
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: liquidGlassTokens.neon.success,
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: `${liquidGlassTokens.neon.success}60`,
                    },
                  }}
                />
              </Box>

              {/* Status indicator */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StatusDotIcon
                  sx={{
                    fontSize: 8,
                    color: nodeActive 
                      ? liquidGlassTokens.neon.success 
                      : filecoinConfigured 
                        ? `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` 
                        : liquidGlassTokens.neon.amber,
                    animation: nodeActive ? 'pulse 1.5s infinite' : 'none',
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '12px',
                    color: nodeActive 
                      ? liquidGlassTokens.neon.success 
                      : `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  }}
                >
                  {nodeActive 
                    ? 'Active - Earning rewards' 
                    : filecoinConfigured 
                      ? 'Inactive - Start to earn' 
                      : 'Configure Filecoin first'}
                </Typography>
              </Box>

              {/* Warning if Filecoin not configured */}
              {!filecoinConfigured && (
                <Box
                  sx={{
                    mt: 1.5,
                    p: 1,
                    background: `${liquidGlassTokens.neon.amber}15`,
                    borderRadius: `${liquidGlassTokens.radius.sm}px`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <WarningIcon
                    sx={{
                      fontSize: 14,
                      color: liquidGlassTokens.neon.amber,
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: '11px',
                      color: liquidGlassTokens.neon.amber,
                    }}
                  >
                    Filecoin not configured
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Fade>
      )}

      {/* Divider */}
      <Box
        sx={{
          mx: isExpanded ? 2 : 1,
          my: 2,
          height: '1px',
          background: `linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)`,
        }}
      />

      {/* Bottom Actions */}
      <Box
        sx={{
          px: isExpanded ? 2 : 1,
          pb: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <BottomAction 
          icon={<RefreshIcon />} 
          label="Refresh" 
          expanded={isExpanded}
          onClick={onRefresh} 
        />
        <BottomAction 
          icon={<SettingsIcon />} 
          label="Settings" 
          expanded={isExpanded}
          onClick={onSettings} 
        />
        {onPluginConfig && (
          <Box ref={pluginsButtonRef}>
            <BottomAction 
              icon={<PluginIcon />} 
              label="Plugins" 
              expanded={isExpanded}
              onClick={() => pluginsButtonRef.current && onPluginConfig(pluginsButtonRef.current)} 
            />
          </Box>
        )}
        <BottomAction 
          icon={<HelpIcon />} 
          label="Help" 
          expanded={isExpanded}
        />
      </Box>
    </Box>
  );
};

// Stat Item Component
const StatItem: React.FC<{
  value: number;
  label: string;
  expanded: boolean;
  color?: string;
}> = ({ value, label, expanded, color }) => (
  <Tooltip title={expanded ? '' : `${value} ${label}`} placement="right">
    <Box sx={{ textAlign: 'center', minWidth: expanded ? 'auto' : 40 }}>
      <Typography
        sx={{
          fontSize: expanded ? '18px' : '14px',
          fontWeight: 600,
          color: color || 'rgba(255, 255, 255, 0.9)',
          lineHeight: 1,
        }}
      >
        {value}
      </Typography>
      {expanded && (
        <Typography
          sx={{
            fontSize: '10px',
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            mt: 0.5,
          }}
        >
          {label}
        </Typography>
      )}
    </Box>
  </Tooltip>
);

// Source Item Component
const SourceItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  activeCount?: number;
  errorCount?: number;
  enabled?: boolean;
  expanded: boolean;
  onClick: () => void;
}> = ({ icon, label, count, active, activeCount = 0, errorCount = 0, enabled = true, expanded, onClick }) => (
  <Tooltip title={expanded ? '' : `${label} (${count})`} placement="right">
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: expanded ? 2 : 0,
        py: 1.5,
        borderRadius: `${liquidGlassTokens.radius.sm}px`,
        cursor: 'pointer',
        backgroundColor: active ? `${liquidGlassTokens.neon.cyan}15` : 'transparent',
        border: active ? `1px solid ${liquidGlassTokens.neon.cyan}30` : '1px solid transparent',
        opacity: enabled ? 1 : 0.5,
        transition: `all ${liquidGlassTokens.motion.durationFast} ${liquidGlassTokens.motion.enter}`,
        justifyContent: expanded ? 'flex-start' : 'center',
        position: 'relative',
        overflow: 'hidden',

        ...(active && {
          boxShadow: glowEffects.cyan(0.1),
        }),

        '&:hover': {
          backgroundColor: active ? `${liquidGlassTokens.neon.cyan}20` : 'rgba(255, 255, 255, 0.04)',
          borderColor: active ? `${liquidGlassTokens.neon.cyan}40` : 'rgba(255, 255, 255, 0.08)',
        },

        '&::before': active
          ? {
              content: '""',
              position: 'absolute',
              left: 0,
              top: '20%',
              bottom: '20%',
              width: '2px',
              background: liquidGlassTokens.neon.cyan,
              borderRadius: '0 2px 2px 0',
              boxShadow: `0 0 8px ${liquidGlassTokens.neon.cyan}`,
            }
          : {},
      }}
      onClick={onClick}
    >
      <Box
        sx={{
          color: active
            ? liquidGlassTokens.neon.cyan
            : `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
          display: 'flex',
          alignItems: 'center',
          minWidth: 24,
          justifyContent: 'center',
          '& > svg': {
            fontSize: 18,
            transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
            ...(active && {
              filter: `drop-shadow(0 0 4px ${liquidGlassTokens.neon.cyan})`,
            }),
          },
        }}
      >
        {icon}
      </Box>

      {expanded && (
        <>
          <Typography
            sx={{
              flex: 1,
              fontSize: '13px',
              fontWeight: active ? 500 : 400,
              color: active
                ? 'rgba(255, 255, 255, 0.95)'
                : `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
              transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </Typography>

          {/* Activity indicators */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {activeCount > 0 && (
              <Badge
                badgeContent={activeCount}
                sx={{
                  '& .MuiBadge-badge': {
                    background: liquidGlassTokens.neon.magenta,
                    color: '#000',
                    fontSize: '10px',
                    minWidth: '16px',
                    height: '16px',
                    animation: 'pulse 2s infinite',
                  },
                }}
              />
            )}
            {errorCount > 0 && (
              <Badge
                badgeContent={errorCount}
                sx={{
                  '& .MuiBadge-badge': {
                    background: liquidGlassTokens.neon.error,
                    color: '#fff',
                    fontSize: '10px',
                    minWidth: '16px',
                    height: '16px',
                  },
                }}
              />
            )}
            <Typography
              sx={{
                fontSize: '12px',
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                fontWeight: 500,
                minWidth: '20px',
                textAlign: 'right',
              }}
            >
              {count}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  </Tooltip>
);

// State Filter Item Component
const StateFilterItem: React.FC<{
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, color, active, onClick }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      px: 2,
      py: 1,
      borderRadius: `${liquidGlassTokens.radius.sm}px`,
      cursor: 'pointer',
      backgroundColor: active ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
      transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
      '&:hover': {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
      },
    }}
    onClick={onClick}
  >
    <StatusDotIcon
      sx={{
        fontSize: 10,
        color: color,
        filter: active ? `drop-shadow(0 0 4px ${color})` : 'none',
      }}
    />
    <Typography
      sx={{
        flex: 1,
        fontSize: '13px',
        fontWeight: active ? 500 : 400,
        color: active ? 'rgba(255, 255, 255, 0.9)' : `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
      }}
    >
      {label}
    </Typography>
    <Typography
      sx={{
        fontSize: '12px',
        color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
        fontWeight: 500,
      }}
    >
      {count}
    </Typography>
  </Box>
);

// Helper function to check if any upload-capable plugins are enabled
function hasUploadPlugins(pluginHealthStatus: PluginHealth[]): boolean {
  // For now, consider any healthy plugin as potentially having upload capability
  // This could be refined based on plugin capabilities
  return pluginHealthStatus.length > 0;
}

// Bottom Action Component
const BottomAction: React.FC<{
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
  onClick?: () => void;
}> = ({ icon, label, expanded, onClick }) => (
  <Tooltip title={expanded ? '' : label} placement="right">
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: expanded ? 2 : 0,
        py: 1.5,
        borderRadius: `${liquidGlassTokens.radius.sm}px`,
        cursor: 'pointer',
        justifyContent: expanded ? 'flex-start' : 'center',
        transition: `all ${liquidGlassTokens.motion.durationFast} ${liquidGlassTokens.motion.enter}`,
        '&:hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          '& .action-icon': {
            color: liquidGlassTokens.neon.cyan,
          },
          '& .action-label': {
            color: 'rgba(255, 255, 255, 0.9)',
          },
        },
      }}
    >
      <Box
        className="action-icon"
        sx={{
          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
          display: 'flex',
          alignItems: 'center',
          minWidth: 24,
          justifyContent: 'center',
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
          '& > svg': { fontSize: 18 },
        }}
      >
        {icon}
      </Box>
      {expanded && (
        <Typography
          className="action-label"
          sx={{
            fontSize: '14px',
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
            transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Typography>
      )}
    </Box>
  </Tooltip>
);

export default SourceNavigator;
