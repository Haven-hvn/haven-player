/**
 * VideoItemBase - Shared base component for video item rendering
 * 
 * Consolidates common logic between VideoAnalysisItem (grid) and VideoListItem (list)
 * to reduce code duplication and ensure consistent behavior.
 * 
 * Performance optimized with:
 * - React.memo for preventing unnecessary re-renders
 * - Memoized computations for expensive operations
 * - Stable callback references
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Alert,
  Tooltip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  OpenInNew as OpenInNewIcon,
  ContentCopy as ContentCopyIcon,
  RemoveCircleOutline as RemoveIcon,
} from '@mui/icons-material';
import { Video, Timestamp } from '@/types/video';
import type { IpfsGatewayConfig } from '@/types/playback';
import { buildIpfsGatewayUrl } from '@/services/playbackResolver';

// Types
export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'error' | 'downloading';

export interface UploadStatusType {
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
  rootCid?: string;
}

export interface AnalysisSegment {
  start: number;
  end: number;
  type: 'analyzed' | 'unanalyzed';
  confidence?: number;
}

export interface StatusConfig {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  label: string;
  chipColor: 'default' | 'warning' | 'success' | 'error' | 'info';
}

// Shared Props Interface
export interface VideoItemBaseProps {
  video: Video;
  timestamps: Timestamp[];
  analysisStatus: AnalysisStatus;
  jobProgress?: number;
  uploadStatus?: UploadStatusType;
  gatewayConfig: IpfsGatewayConfig;
  onPlay: (video: Video) => void;
  onAnalyze: (video: Video) => void;
  onRemove: (video: Video) => void;
  onUpload?: (video: Video) => void;
  onToggleShare?: (video: Video, share: boolean) => void;
}

// Shared utility functions
export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const generateAnalysisSegments = (
  timestamps: Timestamp[],
  duration: number
): AnalysisSegment[] => {
  if (!timestamps.length) {
    return [{ start: 0, end: duration, type: 'unanalyzed' }];
  }

  const segments: AnalysisSegment[] = [];
  const sortedTimestamps = [...timestamps].sort(
    (a, b) => a.start_time - b.start_time
  );

  let currentTime = 0;

  sortedTimestamps.forEach((timestamp) => {
    if (timestamp.start_time > currentTime) {
      segments.push({
        start: currentTime,
        end: timestamp.start_time,
        type: 'unanalyzed',
      });
    }

    segments.push({
      start: timestamp.start_time,
      end: timestamp.end_time || timestamp.start_time + 1,
      type: 'analyzed',
      confidence: timestamp.confidence,
    });

    currentTime = timestamp.end_time || timestamp.start_time + 1;
  });

  if (currentTime < duration) {
    segments.push({
      start: currentTime,
      end: duration,
      type: 'unanalyzed',
    });
  }

  return segments;
};

export const getStatusConfig = (analysisStatus: AnalysisStatus): Omit<StatusConfig, 'icon'> => {
  switch (analysisStatus) {
    case 'pending':
      return {
        color: '#6B6B6B',
        bgColor: '#F7F7F7',
        label: 'Pending',
        chipColor: 'default',
      };
    case 'analyzing':
      return {
        color: '#F9A825',
        bgColor: '#FFF9E6',
        label: 'Analyzing',
        chipColor: 'warning',
      };
    case 'completed':
      return {
        color: '#4CAF50',
        bgColor: '#F1F8E9',
        label: 'Completed',
        chipColor: 'success',
      };
    case 'error':
      return {
        color: '#FF4D4D',
        bgColor: '#FFEBEE',
        label: 'Error',
        chipColor: 'error',
      };
    case 'downloading':
      return {
        color: '#2196F3',
        bgColor: '#E3F2FD',
        label: 'Downloading',
        chipColor: 'info',
      };
    default:
      return {
        color: '#6B6B6B',
        bgColor: '#F7F7F7',
        label: 'Unknown',
        chipColor: 'default',
      };
  }
};

// Shared hook for video item logic
export interface UseVideoItemLogicReturn {
  contextMenu: { mouseX: number; mouseY: number } | null;
  isHovered: boolean;
  copyNotificationOpen: boolean;
  segments: AnalysisSegment[];
  statusConfig: Omit<StatusConfig, 'icon'>;
  analysisPercentage: number;
  handleContextMenu: (event: React.MouseEvent) => void;
  handleClose: () => void;
  handleRemoveClick: () => void;
  handleOpenRemote: () => void;
  handleCopyCid: () => Promise<void>;
  handlePlayClick: (e: React.MouseEvent) => void;
  handleUploadClick: () => void;
  setIsHovered: (hovered: boolean) => void;
  setCopyNotificationOpen: (open: boolean) => void;
}

export const useVideoItemLogic = (
  props: VideoItemBaseProps
): UseVideoItemLogicReturn => {
  const {
    video,
    timestamps,
    analysisStatus,
    uploadStatus,
    gatewayConfig,
    onPlay,
    onAnalyze,
    onRemove,
    onUpload,
  } = props;

  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [copyNotificationOpen, setCopyNotificationOpen] = useState(false);

  // Memoized computations
  const segments = useMemo(
    () => generateAnalysisSegments(timestamps, video.duration),
    [timestamps, video.duration]
  );

  const statusConfig = useMemo(
    () => getStatusConfig(analysisStatus),
    [analysisStatus]
  );

  const analysisPercentage = useMemo(() => {
    if (segments.length === 0) return 0;
    return Math.round(
      (segments
        .filter((s) => s.type === 'analyzed')
        .reduce((acc, s) => acc + (s.end - s.start), 0) /
        video.duration) *
        100
    );
  }, [segments, video.duration]);

  // Callbacks
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 6,
          }
        : null
    );
  }, [contextMenu]);

  const handleClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleRemoveClick = useCallback(() => {
    onRemove(video);
    handleClose();
  }, [onRemove, video, handleClose]);

  const handleOpenRemote = useCallback(() => {
    if (uploadStatus?.rootCid) {
      const { uri } = buildIpfsGatewayUrl(uploadStatus.rootCid, gatewayConfig);
      window.open(uri, '_blank');
      handleClose();
    }
  }, [uploadStatus?.rootCid, gatewayConfig, handleClose]);

  const handleCopyCid = useCallback(async () => {
    if (uploadStatus?.rootCid) {
      try {
        await navigator.clipboard.writeText(uploadStatus.rootCid);
        setCopyNotificationOpen(true);
        handleClose();
      } catch (error) {
        console.error('Failed to copy CID to clipboard:', error);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = uploadStatus.rootCid;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          setCopyNotificationOpen(true);
          handleClose();
        } catch (fallbackError) {
          console.error('Fallback copy failed:', fallbackError);
        }
        document.body.removeChild(textArea);
      }
    }
  }, [uploadStatus?.rootCid, handleClose]);

  const handlePlayClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (analysisStatus === 'completed') {
        onPlay(video);
      } else {
        onAnalyze(video);
      }
    },
    [analysisStatus, onPlay, onAnalyze, video]
  );

  const handleUploadClick = useCallback(() => {
    if (onUpload) {
      onUpload(video);
      handleClose();
    }
  }, [onUpload, video, handleClose]);

  return {
    contextMenu,
    isHovered,
    copyNotificationOpen,
    segments,
    statusConfig,
    analysisPercentage,
    handleContextMenu,
    handleClose,
    handleRemoveClick,
    handleOpenRemote,
    handleCopyCid,
    handlePlayClick,
    handleUploadClick,
    setIsHovered,
    setCopyNotificationOpen,
  };
};

// Shared Context Menu Component
interface VideoItemContextMenuProps {
  contextMenu: { mouseX: number; mouseY: number } | null;
  uploadStatus?: UploadStatusType;
  video: Video;
  onClose: () => void;
  onUpload?: () => void;
  onToggleShare?: () => void;
  onOpenRemote: () => void;
  onCopyCid: () => void;
  onRemove: () => void;
}

export const VideoItemContextMenu: React.FC<VideoItemContextMenuProps> = ({
  contextMenu,
  uploadStatus,
  video,
  onClose,
  onUpload,
  onToggleShare,
  onOpenRemote,
  onCopyCid,
  onRemove,
}) => {
  return (
    <Menu
      open={contextMenu !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        contextMenu !== null
          ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
          : undefined
      }
      slotProps={{
        paper: {
          sx: {
            backgroundColor: '#FFFFFF',
            border: '1px solid #F0F0F0',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            minWidth: 160,
          },
        },
      }}
    >
      {onUpload && (
        <MenuItem
          onClick={onUpload}
          sx={{
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
            fontSize: '14px',
            color: '#000000',
            '&:hover': { backgroundColor: '#F5F5F5' },
          }}
        >
          <ListItemIcon>
            <UploadIcon sx={{ color: '#2196F3', fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText
            primary="Upload to Filecoin"
            sx={{
              '& .MuiTypography-root': {
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontSize: '14px',
                fontWeight: 400,
              },
            }}
          />
        </MenuItem>
      )}
      {onToggleShare && (
        <MenuItem
          onClick={onToggleShare}
          sx={{
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
            fontSize: '14px',
            color: '#000000',
            '&:hover': { backgroundColor: '#F5F5F5' },
          }}
        >
          <ListItemIcon>
            <ContentCopyIcon
              sx={{
                color: video.share_to_arkiv ? '#FF9800' : '#4CAF50',
                fontSize: 18,
              }}
            />
          </ListItemIcon>
          <ListItemText
            primary={video.share_to_arkiv ? 'Keep Local Only' : 'Share to Arkiv'}
            sx={{
              '& .MuiTypography-root': {
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontSize: '14px',
                fontWeight: 400,
              },
            }}
          />
        </MenuItem>
      )}
      {uploadStatus?.status === 'completed' && uploadStatus?.rootCid && (
        <MenuItem
          onClick={onOpenRemote}
          sx={{
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
            fontSize: '14px',
            color: '#000000',
            '&:hover': { backgroundColor: '#F5F5F5' },
          }}
        >
          <ListItemIcon>
            <OpenInNewIcon sx={{ color: '#4CAF50', fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText
            primary="Open Remote (IPFS)"
            sx={{
              '& .MuiTypography-root': {
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontSize: '14px',
                fontWeight: 400,
              },
            }}
          />
        </MenuItem>
      )}
      {uploadStatus?.status === 'completed' && uploadStatus?.rootCid && (
        <MenuItem
          onClick={onCopyCid}
          sx={{
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
            fontSize: '14px',
            color: '#000000',
            '&:hover': { backgroundColor: '#F5F5F5' },
          }}
        >
          <ListItemIcon>
            <ContentCopyIcon sx={{ color: '#2196F3', fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText
            primary="Copy IPFS CID"
            sx={{
              '& .MuiTypography-root': {
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontSize: '14px',
                fontWeight: 400,
              },
            }}
          />
        </MenuItem>
      )}
      <MenuItem
        onClick={onRemove}
        sx={{
          fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          fontSize: '14px',
          color: '#FF4D4D',
          '&:hover': { backgroundColor: '#FFEBEE' },
        }}
      >
        <ListItemIcon>
          <RemoveIcon sx={{ color: '#FF4D4D', fontSize: 18 }} />
        </ListItemIcon>
        <ListItemText
          primary="Remove from list"
          sx={{
            '& .MuiTypography-root': {
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: '14px',
              fontWeight: 400,
            },
          }}
        />
      </MenuItem>
    </Menu>
  );
};

// Shared Copy Notification Component
interface CopyNotificationProps {
  open: boolean;
  onClose: () => void;
}

export const CopyNotification: React.FC<CopyNotificationProps> = ({
  open,
  onClose,
}) => {
  return (
    <Snackbar
      open={open}
      autoHideDuration={3000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert onClose={onClose} severity="success" sx={{ width: '100%' }}>
        IPFS CID copied to clipboard
      </Alert>
    </Snackbar>
  );
};

// Analysis Progress Bar Component
interface AnalysisProgressBarProps {
  segments: AnalysisSegment[];
  duration: number;
  percentage: number;
  maxWidth?: number | string;
}

export const AnalysisProgressBar: React.FC<AnalysisProgressBarProps> = ({
  segments,
  duration,
  percentage,
  maxWidth,
}) => {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4px',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            color: '#6B6B6B',
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Analysis Coverage
        </span>
        <span
          style={{
            fontSize: '10px',
            color: '#000000',
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
            fontWeight: 500,
          }}
        >
          {percentage}%
        </span>
      </div>
      <div
        style={{
          height: '4px',
          backgroundColor: '#F0F0F0',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative',
          maxWidth: maxWidth,
        }}
      >
        {segments.map((segment, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: `${(segment.start / duration) * 100}%`,
              width: `${((segment.end - segment.start) / duration) * 100}%`,
              height: '100%',
              backgroundColor:
                segment.type === 'analyzed' ? '#4CAF50' : '#E0E0E0',
              opacity: segment.confidence
                ? Math.max(0.7, segment.confidence)
                : 1,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default {
  useVideoItemLogic,
  VideoItemContextMenu,
  CopyNotification,
  AnalysisProgressBar,
  formatDuration,
  generateAnalysisSegments,
  getStatusConfig,
};
