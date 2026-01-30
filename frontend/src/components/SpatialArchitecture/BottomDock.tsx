/**
 * Bottom Dock - Living Action Center
 * 
 * The Bottom Dock is where capability lives. Users learn that looking down means "what can I do?"
 * 
 * Design Philosophy:
 * - "Actions rise to meet the hand" - Bottom edge is where hands naturally rest on trackpads
 * - Collapsed (56px): Shows primary action icons
 * - Expanded (180px): Full action zone with drag/drop, file browse, URL input
 * - Context-responsive: Empty state shows "Add Your First Video", selection shows relevant actions
 * 
 * ANTI-PATTERNS AVOIDED:
 * - Action-Heavy Header: Forces eyes to leave content; conflates orientation with command
 *   Instead: Header for status only; Dock for actions
 * - Context Menu for Primary Actions: Primary actions need discoverability
 *   Instead: Dock updates with context, always visible
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  Tooltip,
  Collapse,
  Fade,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  CloudUpload as UploadIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Analytics as AnalyzeIcon,
  FolderOpen as BrowseIcon,
  Link as UrlIcon,
  DragIndicator as DragIcon,
  ExpandLess as CollapseIcon,
  ExpandMore as ExpandIcon,
  Close as CloseIcon,
  GridView as GridIcon,
  ViewModule as DensityIcon,
  Check as CheckIcon,
  VideoLibrary as VideoIcon,
} from '@mui/icons-material';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import type { LayoutMode } from './hooks/useLayoutMode';
import type { TransformationItem, QueueStats, RecordingSession, PluginJobStatus } from '@/types/transformation';
import OperationQueueTray from './OperationQueueTray';

interface BottomDockProps {
  // Mode & state
  mode: LayoutMode;
  expanded: boolean;
  minimized: boolean;
  
  // Selection context
  selectedItem: TransformationItem | null;
  selectionCount: number;
  hasItems: boolean;
  
  // Queue info
  queueStats: QueueStats;
  recordingSessions: RecordingSession[];
  pluginJobs?: PluginJobStatus[];
  
  // Actions
  onExpand: () => void;
  onCollapse: () => void;
  onToggle: () => void;
  
  // Primary actions
  onAddVideo: () => void;
  onOpenAddVideoModal: () => void;
  onSearch: () => void;
  onQuickUpload: (files: FileList) => void;
  onUrlImport: (url: string) => void;
  onAnalyzeSelected: () => void;
  onPlaySelected: () => void;
  onUploadSelected: () => void;
  
  // Batch controls (Recording/Upload modes)
  onPauseAll: () => void;
  onResumeAll: () => void;
  onStopAll: () => void;
  
  // Density control
  gridDensity: 'compact' | 'normal' | 'comfortable';
  onDensityChange: (density: 'compact' | 'normal' | 'comfortable') => void;
  
  // BitTorrent plugin
  isBitTorrentEnabled?: boolean;
}

const BottomDock: React.FC<BottomDockProps> = ({
  mode,
  expanded,
  minimized,
  selectedItem,
  selectionCount,
  hasItems,
  queueStats,
  recordingSessions,
  pluginJobs = [],
  onExpand,
  onCollapse,
  onToggle,
  onAddVideo,
  onOpenAddVideoModal,
  onSearch,
  onQuickUpload,
  onUrlImport,
  onAnalyzeSelected,
  onPlaySelected,
  onUploadSelected,
  onPauseAll,
  onResumeAll,
  onStopAll,
  gridDensity,
  onDensityChange,
  isBitTorrentEnabled = false,
}) => {
  // Local state
  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    if (!expanded) {
      onExpand();
    }
  }, [expanded, onExpand]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging false if we're leaving the dock entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onQuickUpload(files);
    }
  }, [onQuickUpload]);

  // File browse handler
  const handleFileBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onQuickUpload(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onQuickUpload]);

  // URL import handler
  const handleUrlSubmit = useCallback(() => {
    if (urlInput.trim()) {
      onUrlImport(urlInput.trim());
      setUrlInput('');
    }
  }, [urlInput, onUrlImport]);

  // Determine dock height based on state
  const getDockHeight = () => {
    if (minimized) return 48;
    if (expanded) return 180;
    return 56;
  };

  // Render context-specific actions
  const renderContextActions = () => {
    // Empty state - encourage first action
    if (!hasItems) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={onOpenAddVideoModal}
            sx={{
              background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}30 0%, ${liquidGlassTokens.neon.cyan}15 100%)`,
              border: `1px solid ${liquidGlassTokens.neon.cyan}50`,
              color: liquidGlassTokens.neon.cyan,
              fontWeight: 600,
              px: 3,
              '&:hover': {
                background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}40 0%, ${liquidGlassTokens.neon.cyan}20 100%)`,
                boxShadow: glowEffects.cyan(0.4),
              },
            }}
          >
            Add Your First Video
          </Button>
        </Box>
      );
    }

    // Selection context - show selection-relevant actions
    if (selectedItem) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Tooltip title="Play">
            <IconButton
              onClick={onPlaySelected}
              sx={{
                color: liquidGlassTokens.neon.cyan,
                background: `${liquidGlassTokens.neon.cyan}15`,
                '&:hover': {
                  background: `${liquidGlassTokens.neon.cyan}25`,
                  boxShadow: glowEffects.cyan(0.3),
                },
              }}
            >
              <PlayIcon />
            </IconButton>
          </Tooltip>
          
          {selectedItem.state === 'pending' && (
            <Tooltip title="Upload to Filecoin">
              <IconButton
                onClick={onUploadSelected}
                sx={{
                  color: liquidGlassTokens.neon.magenta,
                  background: `${liquidGlassTokens.neon.magenta}15`,
                  '&:hover': {
                    background: `${liquidGlassTokens.neon.magenta}25`,
                    boxShadow: glowEffects.magenta(0.3),
                  },
                }}
              >
                <UploadIcon />
              </IconButton>
            </Tooltip>
          )}
          
          <Tooltip title="Analyze with VLM">
            <IconButton
              onClick={onAnalyzeSelected}
              sx={{
                color: liquidGlassTokens.neon.amber,
                background: `${liquidGlassTokens.neon.amber}15`,
                '&:hover': {
                  background: `${liquidGlassTokens.neon.amber}25`,
                },
              }}
            >
              <AnalyzeIcon />
            </IconButton>
          </Tooltip>
        </Box>
      );
    }

    // Recording mode - batch controls
    if (mode === 'recording' && recordingSessions.length > 0) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip
            label={`${recordingSessions.length} Recording`}
            sx={{
              background: `${liquidGlassTokens.neon.magenta}20`,
              color: liquidGlassTokens.neon.magenta,
              border: `1px solid ${liquidGlassTokens.neon.magenta}40`,
              fontWeight: 600,
              animation: 'pulse 2s infinite',
            }}
          />
          <Button
            size="small"
            startIcon={<PauseIcon />}
            onClick={onPauseAll}
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
              '&:hover': { color: liquidGlassTokens.neon.amber },
            }}
          >
            Pause All
          </Button>
          <Button
            size="small"
            color="error"
            onClick={onStopAll}
            sx={{
              color: liquidGlassTokens.neon.error,
            }}
          >
            Stop All
          </Button>
        </Box>
      );
    }

    // Upload mode - queue controls
    if (mode === 'upload' && (queueStats.uploading > 0 || queueStats.pending > 0)) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip
            label={`Uploading ${queueStats.uploading}/${queueStats.pending + queueStats.uploading}`}
            sx={{
              background: `${liquidGlassTokens.neon.cyan}20`,
              color: liquidGlassTokens.neon.cyan,
              border: `1px solid ${liquidGlassTokens.neon.cyan}40`,
              fontWeight: 600,
            }}
          />
          <Button
            size="small"
            startIcon={<PauseIcon />}
            onClick={onPauseAll}
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
              '&:hover': { color: liquidGlassTokens.neon.amber },
            }}
          >
            Pause All
          </Button>
          <Button
            size="small"
            startIcon={<PlayIcon />}
            onClick={onResumeAll}
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
              '&:hover': { color: liquidGlassTokens.neon.success },
            }}
          >
            Resume
          </Button>
        </Box>
      );
    }

    // Default browse mode - primary actions
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Tooltip title="Add Video">
          <IconButton
            onClick={onOpenAddVideoModal}
            sx={{
              color: liquidGlassTokens.neon.cyan,
              '&:hover': {
                background: `${liquidGlassTokens.neon.cyan}15`,
              },
            }}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Search">
          <IconButton
            onClick={onSearch}
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
              '&:hover': {
                color: liquidGlassTokens.neon.cyan,
                background: 'rgba(255, 255, 255, 0.05)',
              },
            }}
          >
            <SearchIcon />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Browse Files">
          <IconButton
            onClick={handleFileBrowse}
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
              '&:hover': {
                color: liquidGlassTokens.neon.cyan,
                background: 'rgba(255, 255, 255, 0.05)',
              },
            }}
          >
            <BrowseIcon />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  // Player mode - minimized floating dock
  if (minimized) {
    return (
      <Box
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          background: `${liquidGlassTokens.canvas.elevated}99`, // 60% opacity - allows circuit to show
          backdropFilter: 'blur(20px)',
          borderRadius: `${liquidGlassTokens.radius.lg}px`,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          zIndex: 1000,
        }}
      >
        <Tooltip title="Close Player">
          <IconButton
            size="small"
            onClick={onToggle}
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
              '&:hover': { color: 'white' },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      sx={{
        position: 'relative',
        height: getDockHeight(),
        background: liquidGlassTokens.canvas.elevated,
        borderTop: `1px solid ${isDragging ? liquidGlassTokens.neon.cyan : 'rgba(255, 255, 255, 0.06)'}`,
        backdropFilter: 'blur(16px)',
        transition: `all ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
        overflow: 'hidden',
        zIndex: 100,

        // Glow effect when dragging
        ...(isDragging && {
          boxShadow: `0 -4px 24px ${liquidGlassTokens.neon.cyan}30`,
          borderColor: liquidGlassTokens.neon.cyan,
        }),

        // Top highlight
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: `linear-gradient(90deg, transparent, ${isDragging ? liquidGlassTokens.neon.cyan : 'rgba(255, 255, 255, 0.1)'}, transparent)`,
        },
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Collapsed Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 56,
          px: 3,
        }}
      >
        {/* Left: Context Actions */}
        {renderContextActions()}

        {/* Center: Drag indicator (when expanded) */}
        {expanded && (
          <Fade in={expanded}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: isDragging 
                  ? liquidGlassTokens.neon.cyan 
                  : `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              }}
            >
              <DragIcon sx={{ fontSize: 20 }} />
              <Typography sx={{ fontSize: '13px' }}>
                {isDragging ? 'Drop files here' : 'Drag files to upload'}
              </Typography>
            </Box>
          </Fade>
        )}

        {/* Right: Density Control & Expand Toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Density Control */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              p: 0.5,
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: `${liquidGlassTokens.radius.sm}px`,
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            {(['compact', 'normal', 'comfortable'] as const).map((density) => (
              <Tooltip key={density} title={`${density.charAt(0).toUpperCase() + density.slice(1)} grid`}>
                <IconButton
                  size="small"
                  onClick={() => onDensityChange(density)}
                  sx={{
                    width: 28,
                    height: 28,
                    color: gridDensity === density 
                      ? liquidGlassTokens.neon.cyan 
                      : `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                    background: gridDensity === density 
                      ? `${liquidGlassTokens.neon.cyan}15` 
                      : 'transparent',
                    '&:hover': {
                      color: liquidGlassTokens.neon.cyan,
                      background: `${liquidGlassTokens.neon.cyan}10`,
                    },
                  }}
                >
                  <GridIcon sx={{ 
                    fontSize: density === 'compact' ? 14 : density === 'normal' ? 16 : 18 
                  }} />
                </IconButton>
              </Tooltip>
            ))}
          </Box>

          {/* Expand/Collapse Toggle */}
          <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
            <IconButton
              onClick={onToggle}
              sx={{
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                '&:hover': {
                  color: 'white',
                  background: 'rgba(255, 255, 255, 0.05)',
                },
              }}
            >
              {expanded ? <CollapseIcon /> : <ExpandIcon />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Operation Queue Tray - Shows upload/processing status */}
      <OperationQueueTray
        queueStats={queueStats}
        recordingSessions={recordingSessions}
        pluginJobs={pluginJobs}
        expanded={expanded}
        onToggleExpand={onToggle}
      />

      {/* Expanded Content */}
      <Collapse in={expanded}>
        <Box
          sx={{
            px: 3,
            pb: 3,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 4,
          }}
        >
          {/* URL Import */}
          <Box sx={{ flex: 1, maxWidth: 400 }}>
            <Typography
              sx={{
                fontSize: '11px',
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                mb: 1,
              }}
            >
              Import from URL
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder={isBitTorrentEnabled ? "Paste video URL or magnet link..." : "Paste video URL..."}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <UrlIcon sx={{ 
                      color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                      fontSize: 18,
                    }} />
                  </InputAdornment>
                ),
                endAdornment: urlInput && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={handleUrlSubmit}
                      sx={{
                        color: liquidGlassTokens.neon.cyan,
                        '&:hover': {
                          background: `${liquidGlassTokens.neon.cyan}15`,
                        },
                      }}
                    >
                      <CheckIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: `${liquidGlassTokens.radius.sm}px`,
                  '& fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: liquidGlassTokens.neon.cyan,
                  },
                },
                '& .MuiInputBase-input': {
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: '14px',
                  '&::placeholder': {
                    color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                    opacity: 1,
                  },
                },
              }}
            />
          </Box>

          {/* Drop Zone Visual */}
          <Box
            sx={{
              flex: 1,
              height: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              border: `2px dashed ${isDragging ? liquidGlassTokens.neon.cyan : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: `${liquidGlassTokens.radius.md}px`,
              background: isDragging ? `${liquidGlassTokens.neon.cyan}08` : 'transparent',
              transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
              cursor: 'pointer',
              '&:hover': {
                borderColor: 'rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.02)',
              },
            }}
            onClick={handleFileBrowse}
          >
            <VideoIcon sx={{ 
              fontSize: 32, 
              color: isDragging 
                ? liquidGlassTokens.neon.cyan 
                : `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` 
            }} />
            <Box>
              <Typography sx={{ 
                fontSize: '14px', 
                color: 'rgba(255, 255, 255, 0.7)',
                fontWeight: 500,
              }}>
                Drop videos here
              </Typography>
              <Typography sx={{ 
                fontSize: '12px', 
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` 
              }}>
                or click to browse
              </Typography>
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};

export default BottomDock;
