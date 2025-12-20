import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, IconButton, Slider, Tooltip, Menu, MenuItem, Fade, Chip, ToggleButton, ToggleButtonGroup, CircularProgress, Alert, Divider, keyframes } from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  VolumeUp as VolumeUpIcon,
  VolumeDown as VolumeDownIcon,
  VolumeMute as VolumeMuteIcon,
  VolumeOff as VolumeOffIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  PictureInPictureAlt as PipIcon,
  Speed as SpeedIcon,
  Replay10 as Replay10Icon,
  Forward10 as Forward10Icon,
  ArrowBack as ArrowBackIcon,
  Keyboard as KeyboardIcon,
  Loop as LoopIcon,
  Lock as LockIcon,
  Storage as StorageIcon,
  CloudQueue as CloudIcon,
  Refresh as RefreshIcon,
  ErrorOutline as ErrorIcon,
} from '@mui/icons-material';
import { videoService } from '@/services/api';
import type { Video, Timestamp } from '@/types/video';
import { useLitDecryption } from '@/hooks/useLitDecryption';
import { resolvePlaybackSource } from '@/services/playbackResolver';
import type { PlaybackResolution, SelectedSource } from '@/types/playback';
import { loadGatewayConfig, fileExistsViaIpc } from '@/services/playbackConfig';
import { useVideoControls, PLAYBACK_RATES, VideoError, VideoErrorType } from '@/hooks/useVideoControls';
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';

// Error recovery constants
const MAX_SOURCE_FALLBACK_ATTEMPTS = 2;
const ERROR_DISPLAY_DURATION = 5000;

// Keyframe animations
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.3); }
  50% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.6); }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

// Time formatting utilities
const formatTime = (seconds: number, showHours = false): string => {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  
  const totalSeconds = Math.floor(Math.abs(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  const sign = seconds < 0 ? '-' : '';
  
  if (hours > 0 || showHours) {
    return `${sign}${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${sign}${minutes}:${secs.toString().padStart(2, '0')}`;
};

// Custom styled slider for the progress bar
const progressSliderStyles = {
  height: 6,
  padding: '12px 0',
  '& .MuiSlider-rail': {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    height: 6,
    borderRadius: 3,
  },
  '& .MuiSlider-track': {
    height: 6,
    borderRadius: 3,
    background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
    border: 'none',
  },
  '& .MuiSlider-thumb': {
    width: 16,
    height: 16,
    backgroundColor: '#fff',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    '&:hover, &.Mui-focusVisible': {
      boxShadow: '0 0 0 8px rgba(99, 102, 241, 0.3)',
      transform: 'scale(1.2)',
    },
    '&.Mui-active': {
      boxShadow: '0 0 0 12px rgba(99, 102, 241, 0.4)',
      transform: 'scale(1.3)',
    },
  },
  '&:hover .MuiSlider-track': {
    background: 'linear-gradient(90deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%)',
  },
};

// Volume slider styles
const volumeSliderStyles = {
  width: 100,
  height: 4,
  '& .MuiSlider-rail': {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    height: 4,
    borderRadius: 2,
  },
  '& .MuiSlider-track': {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
    border: 'none',
  },
  '& .MuiSlider-thumb': {
    width: 14,
    height: 14,
    backgroundColor: '#fff',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
    '&:hover, &.Mui-focusVisible': {
      boxShadow: '0 0 0 6px rgba(255, 255, 255, 0.2)',
    },
  },
};

// Control button styles
const controlButtonStyles = {
  color: 'rgba(255, 255, 255, 0.9)',
  transition: 'all 0.2s ease',
  '&:hover': {
    color: '#fff',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    transform: 'scale(1.1)',
  },
  '&.Mui-disabled': {
    color: 'rgba(255, 255, 255, 0.3)',
  },
};

// Keyboard shortcuts overlay component
interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const ShortcutsOverlay = ({ open, onClose }: ShortcutsOverlayProps): React.ReactElement | null => {
  if (!open) return null;

  const categories = ['playback', 'navigation', 'volume', 'display'] as const;
  const categoryLabels = {
    playback: 'Playback',
    navigation: 'Navigation',
    volume: 'Volume',
    display: 'Display',
  };

  return (
    <Fade in={open}>
      <Box
        onClick={onClose}
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          cursor: 'pointer',
        }}
      >
        <Box
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
          sx={{
            backgroundColor: 'rgba(30, 30, 40, 0.95)',
            borderRadius: 3,
            p: 4,
            maxWidth: 700,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
          }}
        >
          <Typography
            variant="h5"
            sx={{
              color: '#fff',
              mb: 3,
              fontWeight: 600,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              letterSpacing: '-0.02em',
            }}
          >
            ⌨️ Keyboard Shortcuts
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            {categories.map((category) => (
              <Box key={category}>
                <Typography
                  sx={{
                    color: '#a855f7',
                    fontWeight: 600,
                    mb: 1.5,
                    textTransform: 'uppercase',
                    fontSize: '0.75rem',
                    letterSpacing: '0.1em',
                  }}
                >
                  {categoryLabels[category]}
                </Typography>
                {KEYBOARD_SHORTCUTS.filter((s) => s.category === category).map((shortcut) => (
                  <Box
                    key={shortcut.key}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      py: 0.75,
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <Typography
                      sx={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {shortcut.description}
                    </Typography>
                    <Typography
                      sx={{
                        color: '#fff',
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontSize: '0.75rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                      }}
                    >
                      {shortcut.key}
                    </Typography>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>

          <Typography
            sx={{
              color: 'rgba(255, 255, 255, 0.4)',
              textAlign: 'center',
              mt: 3,
              fontSize: '0.75rem',
            }}
          >
            Press ESC or click outside to close
          </Typography>
        </Box>
      </Box>
    </Fade>
  );
};

// Enhanced buffering spinner with status info
interface BufferingSpinnerProps {
  isStalled?: boolean;
  retryCount?: number;
  networkState?: string;
}

const BufferingSpinner = ({ isStalled, retryCount, networkState }: BufferingSpinnerProps): React.ReactElement => (
  <Box
    sx={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
      zIndex: 5,
      gap: 2,
    }}
  >
    <Box
      sx={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        border: '3px solid rgba(255, 255, 255, 0.1)',
        borderTopColor: isStalled ? '#f59e0b' : '#a855f7',
        animation: 'spin 1s linear infinite',
        '@keyframes spin': {
          to: { transform: 'rotate(360deg)' },
        },
      }}
    />
    <Typography sx={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.875rem' }}>
      {isStalled ? 'Reconnecting...' : 'Buffering...'}
    </Typography>
    {retryCount !== undefined && retryCount > 0 && (
      <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem' }}>
        Retry attempt {retryCount}
      </Typography>
    )}
    {networkState && networkState !== 'loaded' && (
      <Typography sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
        {networkState}
      </Typography>
    )}
  </Box>
);

// Enhanced error overlay with recovery options
interface ErrorOverlayProps {
  error: VideoError;
  onRetry: () => void;
  onSwitchSource: (() => void) | null;
  onGoBack: () => void;
  canSwitchSource: boolean;
  alternateSourceName?: string;
  retryCount: number;
  maxRetries: number;
}

const ErrorOverlay = ({
  error,
  onRetry,
  onSwitchSource,
  onGoBack,
  canSwitchSource,
  alternateSourceName,
  retryCount,
  maxRetries,
}: ErrorOverlayProps): React.ReactElement => {
  const canRetry = error.recoverable && retryCount < maxRetries;

  const getErrorIcon = (type: VideoErrorType) => {
    switch (type) {
      case 'network':
        return '🌐';
      case 'decode':
        return '🔧';
      case 'format':
        return '📁';
      case 'timeout':
        return '⏱️';
      case 'stall':
        return '⏸️';
      default:
        return '⚠️';
    }
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(8px)',
        gap: 3,
        zIndex: 10,
        p: 4,
      }}
    >
      <Typography sx={{ fontSize: 64 }}>{getErrorIcon(error.type)}</Typography>
      
      <Typography
        sx={{
          color: '#fff',
          fontSize: '1.5rem',
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        {error.type === 'network' ? 'Connection Problem' :
         error.type === 'decode' ? 'Playback Error' :
         error.type === 'format' ? 'Unsupported Format' :
         error.type === 'timeout' ? 'Loading Timeout' :
         error.type === 'stall' ? 'Playback Stalled' :
         'Playback Error'}
      </Typography>
      
      <Typography
        sx={{
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '0.95rem',
          textAlign: 'center',
          maxWidth: 500,
          lineHeight: 1.6,
        }}
      >
        {error.message}
      </Typography>

      {retryCount > 0 && (
        <Typography sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.8rem' }}>
          {retryCount} of {maxRetries} recovery attempts made
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        {canRetry && (
          <IconButton
            onClick={onRetry}
            sx={{
              color: '#fff',
              backgroundColor: 'rgba(168, 85, 247, 0.3)',
              border: '1px solid rgba(168, 85, 247, 0.5)',
              borderRadius: 2,
              px: 3,
              py: 1,
              '&:hover': {
                backgroundColor: 'rgba(168, 85, 247, 0.5)',
              },
            }}
          >
            <RefreshIcon sx={{ mr: 1 }} />
            <Typography>Try Again</Typography>
          </IconButton>
        )}

        {canSwitchSource && onSwitchSource && (
          <IconButton
            onClick={onSwitchSource}
            sx={{
              color: '#fff',
              backgroundColor: 'rgba(59, 130, 246, 0.3)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: 2,
              px: 3,
              py: 1,
              '&:hover': {
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
              },
            }}
          >
            <CloudIcon sx={{ mr: 1 }} />
            <Typography>Switch to {alternateSourceName || 'alternate source'}</Typography>
          </IconButton>
        )}

        <IconButton
          onClick={onGoBack}
          sx={{
            color: 'rgba(255, 255, 255, 0.7)',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 2,
            px: 3,
            py: 1,
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
            },
          }}
        >
          <ArrowBackIcon sx={{ mr: 1 }} />
          <Typography>Go Back</Typography>
        </IconButton>
      </Box>

      {error.code !== undefined && (
        <Typography sx={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '0.7rem', mt: 2 }}>
          Error code: {error.code} | Type: {error.type}
        </Typography>
      )}
    </Box>
  );
};

// Large center play button for visual feedback
interface CenterPlayButtonProps {
  visible: boolean;
  playing: boolean;
}

const CenterPlayButton = ({ visible, playing }: CenterPlayButtonProps): React.ReactElement | null => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 400);
      return () => clearTimeout(timer);
    }
  }, [visible, playing]);

  if (!show) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      <Box
        sx={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: `${fadeOut} 0.4s ease-out forwards`,
          transform: 'scale(1)',
        }}
      >
        {playing ? (
          <PlayIcon sx={{ fontSize: 50, color: '#fff' }} />
        ) : (
          <PauseIcon sx={{ fontSize: 50, color: '#fff' }} />
        )}
      </Box>
    </Box>
  );
};

// Timestamp marker component for timeline
interface TimestampMarkerProps {
  timestamp: Timestamp;
  duration: number;
  onClick: (time: number) => void;
}

const TimestampMarker = ({ timestamp, duration, onClick }: TimestampMarkerProps): React.ReactElement => {
  const position = (timestamp.start_time / duration) * 100;
  
  return (
    <Tooltip title={`${timestamp.tag_name} (${formatTime(timestamp.start_time)})`} placement="top">
      <Box
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onClick(timestamp.start_time / duration);
        }}
        sx={{
          position: 'absolute',
          left: `${position}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: '#fbbf24',
          border: '2px solid #fff',
          cursor: 'pointer',
          transition: 'transform 0.15s ease',
          zIndex: 2,
          '&:hover': {
            transform: 'translate(-50%, -50%) scale(1.5)',
          },
        }}
      />
    </Tooltip>
  );
};

// Main VideoPlayer component
const VideoPlayer: React.FC = () => {
  const { videoPath } = useParams<{ videoPath: string }>();
  const navigate = useNavigate();
  
  // Video and source state
  const [video, setVideo] = useState<Video | null>(null);
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playbackSource, setPlaybackSource] = useState<PlaybackResolution | null>(null);
  const [selectedSource, setSelectedSource] = useState<SelectedSource>('local');
  const [playerReady, setPlayerReady] = useState(false);
  
  // UI state
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speedMenuAnchor, setSpeedMenuAnchor] = useState<null | HTMLElement>(null);
  const [showPlayFeedback, setShowPlayFeedback] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  
  // Recovery/fallback state
  const [sourceFallbackAttempts, setSourceFallbackAttempts] = useState(0);
  const [recoveryToast, setRecoveryToast] = useState<string | null>(null);
  const recoveryToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Lit Protocol decryption
  const {
    decryptedUrl,
    decryptionStatus,
    decryptVideo,
    clearDecryptedUrl,
    isEncrypted,
  } = useLitDecryption();

  // Show recovery toast
  const showRecoveryToast = useCallback((message: string) => {
    setRecoveryToast(message);
    if (recoveryToastTimeoutRef.current) {
      clearTimeout(recoveryToastTimeoutRef.current);
    }
    recoveryToastTimeoutRef.current = setTimeout(() => {
      setRecoveryToast(null);
    }, 3000);
  }, []);

  // Cleanup recovery toast timeout
  useEffect(() => {
    return () => {
      if (recoveryToastTimeoutRef.current) {
        clearTimeout(recoveryToastTimeoutRef.current);
      }
    };
  }, []);

  // Handle source fallback
  const handleSourceFallback = useCallback(() => {
    if (playbackSource?.type === 'both' && sourceFallbackAttempts < MAX_SOURCE_FALLBACK_ATTEMPTS) {
      const newSource = selectedSource === 'local' ? 'ipfs' : 'local';
      console.log(`[VideoPlayer] Falling back from ${selectedSource} to ${newSource}`);
      setSelectedSource(newSource);
      setSourceFallbackAttempts((prev: number) => prev + 1);
      setPlayerReady(false);
      showRecoveryToast(`Switched to ${newSource === 'local' ? 'local file' : 'IPFS'}`);
    }
  }, [playbackSource, selectedSource, sourceFallbackAttempts, showRecoveryToast]);

  // Video controls hook with enhanced error handling
  const {
    state,
    controls,
    playerRef,
    containerRef,
    handleReady: handleControlsReady,
    handleError: handleControlsError,
    handleBuffer,
    handleEnded,
    handleStalled,
    handleWaiting,
    handleCanPlay,
    handleCanPlayThrough,
    handleLoadStart,
    handleLoadedData,
    handleSuspend,
    handleAbort,
    setPlayed,
    setDuration,
    isRecovering,
  } = useVideoControls({
    maxRetries: 5,
    retryDelayMs: 1000,
    stallTimeoutMs: 10000,
    loadTimeoutMs: 30000,
    onError: (err) => {
      console.error('[VideoPlayer] Playback error:', err);
      // If we have alternate source and error is network-related, try fallback
      if (err.type === 'network' && playbackSource?.type === 'both' && sourceFallbackAttempts < MAX_SOURCE_FALLBACK_ATTEMPTS) {
        handleSourceFallback();
      }
    },
    onRecovery: () => {
      showRecoveryToast('Playback recovered successfully');
    },
    onSourceFallback: handleSourceFallback,
  });

  // Keyboard shortcuts
  const { showShortcuts, toggleShortcuts } = useKeyboardShortcuts({
    controls,
    state,
    enabled: !loading && playerReady,
  });

  // Determine if video should be treated as encrypted
  const shouldTreatAsEncrypted = useMemo(() => {
    if (!playbackSource || !video) return false;
    if (playbackSource.type === 'local') return false;
    if (playbackSource.type === 'both') {
      return selectedSource === 'ipfs' && (video.is_encrypted ?? false);
    }
    if (playbackSource.type === 'ipfs') {
      return video.is_encrypted ?? false;
    }
    return false;
  }, [playbackSource, selectedSource, video]);

  // Calculate video URL
  const videoUrl = useMemo(() => {
    if (shouldTreatAsEncrypted && isEncrypted && decryptedUrl) {
      return decryptedUrl;
    }
    if (!playbackSource) return null;
    
    if (playbackSource.type === 'local') {
      let normalizedPath = playbackSource.uri.replace(/\\/g, '/');
      if (!normalizedPath.startsWith('/') && normalizedPath.includes(':')) {
        normalizedPath = '/' + normalizedPath;
      }
      const encodedPath = encodeURI(normalizedPath).replace(/#/g, '%23');
      return `file://${encodedPath}`;
    }
    
    if (playbackSource.type === 'ipfs') {
      return playbackSource.uri;
    }
    
    if (playbackSource.type === 'both') {
      if (selectedSource === 'local') {
        let normalizedPath = playbackSource.local.uri.replace(/\\/g, '/');
        if (!normalizedPath.startsWith('/') && normalizedPath.includes(':')) {
          normalizedPath = '/' + normalizedPath;
        }
        const encodedPath = encodeURI(normalizedPath).replace(/#/g, '%23');
        return `file://${encodedPath}`;
      }
      return playbackSource.ipfs.uri;
    }
    return null;
  }, [decryptedUrl, isEncrypted, playbackSource, selectedSource, shouldTreatAsEncrypted]);

  const ipfsGatewayHost = useMemo(() => {
    if (playbackSource?.type === 'ipfs') {
      try {
        return new URL(playbackSource.gatewayBase).host;
      } catch {
        return playbackSource.gatewayBase;
      }
    }
    if (playbackSource?.type === 'both') {
      try {
        return new URL(playbackSource.ipfs.gatewayBase).host;
      } catch {
        return playbackSource.ipfs.gatewayBase;
      }
    }
    return null;
  }, [playbackSource]);

  // Reset player state when URL changes
  useEffect(() => {
    if (videoUrl) {
      setPlayerReady(false);
      controls.pause();
      setPlayed(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]);

  // Fetch video data
  useEffect(() => {
    const fetchVideoData = async () => {
      if (!videoPath) return;

      try {
        setLoading(true);
        setLoadError(null);
        setPlaybackSource(null);
        setSourceFallbackAttempts(0);

        const decodedPath = decodeURIComponent(videoPath);
        const [videosData, timestampsData, gateway] = await Promise.all([
          videoService.getAll(),
          videoService.getTimestamps(decodedPath),
          loadGatewayConfig(),
        ]);

        const videoData = videosData.find((v) => v.path === decodedPath);
        if (!videoData) {
          throw new Error('Video not found');
        }

        setVideo(videoData);
        setTimestamps(timestampsData);

        const source = await resolvePlaybackSource({
          videoPath: decodedPath,
          rootCid: videoData.filecoin_root_cid,
          gatewayConfig: gateway,
          checkFileExists: fileExistsViaIpc,
          isEncrypted: videoData.is_encrypted ?? false,
          litEncryptionMetadata: videoData.lit_encryption_metadata ?? null,
        });

        setPlaybackSource(source);

        // Default to local playback when available (both local+IPFS or local-only)
        if (source.type === 'both') {
          setSelectedSource('local'); // Prefer local when both available
        } else if (source.type === 'local') {
          setSelectedSource('local'); // Explicitly set for local-only
        } else if (source.type === 'ipfs') {
          setSelectedSource('ipfs'); // Only use IPFS when local not available
        }

        if (source.type === 'unavailable') {
          setLoadError('Video missing locally and no IPFS CID is available.');
          return;
        }

        // Decrypt if needed for IPFS-only source
        if (source.type === 'ipfs' && videoData.is_encrypted && videoData.lit_encryption_metadata) {
          const loadEncryptedData = async () => {
            const response = await fetch(source.uri);
            if (!response.ok) throw new Error('Failed to fetch encrypted video from gateway');
            const buffer = await response.arrayBuffer();
            return new Uint8Array(buffer);
          };
          await decryptVideo(videoData, loadEncryptedData);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load video';
        setLoadError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchVideoData();
    // Cleanup is handled separately to avoid dependency issues
  }, [videoPath, decryptVideo]);
  
  // Cleanup decrypted URL on unmount (separate effect to avoid re-running fetchVideoData)
  useEffect(() => {
    return () => {
      clearDecryptedUrl();
    };
  }, [clearDecryptedUrl]);

  // Handle source switching decryption
  useEffect(() => {
    if (!playbackSource || !video || playbackSource.type !== 'both') return;

    if (selectedSource === 'ipfs' && video.is_encrypted && video.lit_encryption_metadata) {
      if (!decryptedUrl && decryptionStatus.status !== 'decrypting' && decryptionStatus.status !== 'loading') {
        const loadEncryptedData = async () => {
          const response = await fetch(playbackSource.ipfs.uri);
          if (!response.ok) throw new Error('Failed to fetch encrypted video from gateway');
          const buffer = await response.arrayBuffer();
          return new Uint8Array(buffer);
        };
        decryptVideo(video, loadEncryptedData).catch(() => {});
      }
    }

    if (selectedSource === 'local' && decryptedUrl) {
      clearDecryptedUrl();
    }
  }, [selectedSource, playbackSource, video, decryptedUrl, decryptionStatus.status, decryptVideo, clearDecryptedUrl]);

  // Clear playback errors when decryption completes successfully
  useEffect(() => {
    if (decryptionStatus.status === 'completed' && decryptedUrl) {
      // Clear any previous errors since we now have a valid decrypted source
      controls.clearError();
      console.log('[VideoPlayer] Decryption completed, cleared any previous errors');
    }
  }, [decryptionStatus.status, decryptedUrl, controls]);

  // Auto-hide controls
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (state.playing && !showShortcuts) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  }, [state.playing, showShortcuts]);

  useEffect(() => {
    if (!state.playing) {
      setControlsVisible(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    } else {
      showControls();
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [state.playing, showControls]);

  // Video element event handlers
  const handleVideoTimeUpdate = useCallback(() => {
    const video = playerRef.current;
    if (video && state.duration > 0) {
      setPlayed(video.currentTime / state.duration);
    }
  }, [state.duration, setPlayed]);

  const handleVideoLoadedMetadata = useCallback(() => {
    const video = playerRef.current;
    if (video) {
      setDuration(video.duration);
      handleControlsReady();
      setPlayerReady(true);
    }
  }, [setDuration, handleControlsReady]);

  const handleVideoError = useCallback(() => {
    const video = playerRef.current;
    const mediaError = video?.error ?? null;
    handleControlsError(mediaError);
  }, [handleControlsError]);

  // Enhanced video event handlers using the hook's handlers
  const handleVideoWaiting = useCallback(() => {
    handleWaiting();
  }, [handleWaiting]);

  const handleVideoPlaying = useCallback(() => {
    handleCanPlay();
  }, [handleCanPlay]);

  const handleVideoCanPlay = useCallback(() => {
    handleCanPlay();
  }, [handleCanPlay]);

  const handleVideoCanPlayThrough = useCallback(() => {
    handleCanPlayThrough();
  }, [handleCanPlayThrough]);

  const handleVideoStalled = useCallback(() => {
    handleStalled();
  }, [handleStalled]);

  const handleVideoLoadStart = useCallback(() => {
    handleLoadStart();
  }, [handleLoadStart]);

  const handleVideoLoadedData = useCallback(() => {
    handleLoadedData();
  }, [handleLoadedData]);

  const handleVideoSuspend = useCallback(() => {
    handleSuspend();
  }, [handleSuspend]);

  const handleVideoAbort = useCallback(() => {
    // Don't treat abort as an error when decryption is in progress
    // The video element may abort when switching from encrypted to decrypted source
    if (decryptionStatus.status === 'loading' || decryptionStatus.status === 'decrypting') {
      console.log('[VideoPlayer] Load aborted during decryption - ignoring');
      return;
    }
    handleAbort();
  }, [handleAbort, decryptionStatus.status]);

  // Progress bar hover handlers
  const handleProgressHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = x / rect.width;
    setHoverTime(fraction * state.duration);
    setHoverPosition(x);
  }, [state.duration]);

  const handleProgressLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  // Click handlers
  const handleVideoClick = useCallback(() => {
    setShowPlayFeedback(true);
    controls.togglePlay();
    showControls();
  }, [controls, showControls]);

  const handleVideoDoubleClick = useCallback(() => {
    controls.toggleFullscreen();
  }, [controls]);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleSeek = useCallback((_event: Event, value: number | number[]) => {
    if (typeof value === 'number') {
      controls.seek(value);
      const video = playerRef.current;
      if (video) {
        video.currentTime = value * state.duration;
      }
    }
  }, [controls, state.duration]);

  const handleVolumeChange = useCallback((_event: Event, value: number | number[]) => {
    if (typeof value === 'number') {
      controls.setVolume(value);
    }
  }, [controls]);

  const handleTimestampClick = useCallback((fraction: number) => {
    controls.seek(fraction);
    const video = playerRef.current;
    if (video) {
      video.currentTime = fraction * state.duration;
    }
  }, [controls, state.duration]);

  // Sync video element with state
  useEffect(() => {
    const video = playerRef.current;
    if (video) {
      video.volume = state.volume;
      video.muted = state.muted;
      video.playbackRate = state.playbackRate;
      video.loop = state.loop;
    }
  }, [state.volume, state.muted, state.playbackRate, state.loop]);

  // Play/pause sync
  useEffect(() => {
    const video = playerRef.current;
    if (video && playerReady) {
      if (state.playing) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  }, [state.playing, playerReady]);

  // Get volume icon
  const getVolumeIcon = () => {
    if (state.muted || state.volume === 0) return <VolumeOffIcon />;
    if (state.volume < 0.3) return <VolumeMuteIcon />;
    if (state.volume < 0.7) return <VolumeDownIcon />;
    return <VolumeUpIcon />;
  };

  // Check if preparing
  const isPreparing = loading || (shouldTreatAsEncrypted && isEncrypted && 
    (decryptionStatus.status === 'loading' || decryptionStatus.status === 'decrypting'));

  // Loading state
  if (isPreparing) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
          gap: 3,
        }}
      >
        <Box
          sx={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            border: '4px solid rgba(168, 85, 247, 0.2)',
            borderTopColor: '#a855f7',
            animation: 'spin 1s linear infinite',
            '@keyframes spin': {
              to: { transform: 'rotate(360deg)' },
            },
          }}
        />
        {decryptionStatus.status === 'decrypting' && (
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ color: '#fff', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <LockIcon sx={{ fontSize: 20, color: '#a855f7' }} />
              Decrypting encrypted video...
            </Typography>
            <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.875rem' }}>
              {decryptionStatus.progress}
            </Typography>
          </Box>
        )}
        {decryptionStatus.status === 'loading' && (
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
            Loading encryption configuration...
          </Typography>
        )}
        {loading && decryptionStatus.status === 'idle' && (
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
            Loading video...
          </Typography>
        )}
      </Box>
    );
  }

  // Decryption error
  if (decryptionStatus.status === 'error') {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
          gap: 3,
          p: 4,
        }}
      >
        <Alert
          severity="error"
          sx={{
            maxWidth: 500,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fff',
          }}
        >
          <Typography sx={{ fontWeight: 600, mb: 1 }}>Decryption Failed</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)' }}>
            {decryptionStatus.error}
          </Typography>
        </Alert>
        <IconButton onClick={handleBack} sx={{ color: '#fff' }}>
          <ArrowBackIcon sx={{ mr: 1 }} />
          <Typography>Go Back</Typography>
        </IconButton>
      </Box>
    );
  }

  // General load error
  if (loadError || !video) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
          gap: 3,
        }}
      >
        <ErrorIcon sx={{ fontSize: 64, color: '#ef4444' }} />
        <Typography sx={{ color: '#fff', fontSize: '1.25rem' }}>
          {loadError || 'Video not found'}
        </Typography>
        <IconButton onClick={handleBack} sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
          <ArrowBackIcon sx={{ mr: 1 }} />
          <Typography>Go Back</Typography>
        </IconButton>
      </Box>
    );
  }

  // Wait for decryption
  if (shouldTreatAsEncrypted && isEncrypted && !decryptedUrl) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
        }}
      >
        <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
          Preparing encrypted video...
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      onMouseMove={showControls}
      onMouseLeave={() => state.playing && setControlsVisible(false)}
      sx={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#000',
        position: 'relative',
        overflow: 'hidden',
        cursor: controlsVisible ? 'default' : 'none',
      }}
    >
      {/* Video Element */}
      <Box
        sx={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
        }}
      >
        {videoUrl ? (
          <>
            <video
              ref={playerRef}
              src={videoUrl}
              onClick={handleVideoClick}
              onDoubleClick={handleVideoDoubleClick}
              onTimeUpdate={handleVideoTimeUpdate}
              onLoadedMetadata={handleVideoLoadedMetadata}
              onError={handleVideoError}
              onWaiting={handleVideoWaiting}
              onPlaying={handleVideoPlaying}
              onCanPlay={handleVideoCanPlay}
              onCanPlayThrough={handleVideoCanPlayThrough}
              onStalled={handleVideoStalled}
              onLoadStart={handleVideoLoadStart}
              onLoadedData={handleVideoLoadedData}
              onSuspend={handleVideoSuspend}
              onAbort={handleVideoAbort}
              onEnded={handleEnded}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
              playsInline
              preload="auto"
            />

            {/* Buffering indicator with enhanced status */}
            {(state.buffering || isRecovering) && !state.error && (
              <BufferingSpinner
                isStalled={state.isStalled}
                retryCount={state.retryCount}
                networkState={state.networkState}
              />
            )}

            {/* Center play/pause feedback */}
            <CenterPlayButton visible={showPlayFeedback} playing={state.playing} />

            {/* Recovery toast notification */}
            {recoveryToast && (
              <Fade in={Boolean(recoveryToast)}>
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 100,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'rgba(16, 185, 129, 0.9)',
                    color: '#fff',
                    px: 3,
                    py: 1.5,
                    borderRadius: 2,
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    zIndex: 15,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  ✓ {recoveryToast}
                </Box>
              </Fade>
            )}

            {/* Playback error overlay with recovery options */}
            {state.error && (
              <ErrorOverlay
                error={state.error}
                onRetry={controls.retry}
                onSwitchSource={playbackSource?.type === 'both' ? handleSourceFallback : null}
                onGoBack={handleBack}
                canSwitchSource={playbackSource?.type === 'both' && sourceFallbackAttempts < MAX_SOURCE_FALLBACK_ATTEMPTS}
                alternateSourceName={selectedSource === 'local' ? 'IPFS' : 'Local'}
                retryCount={state.retryCount}
                maxRetries={5}
              />
            )}

            {/* Loading overlay */}
            {!playerReady && !state.error && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#000',
                }}
              >
                <CircularProgress sx={{ color: '#a855f7' }} />
              </Box>
            )}
          </>
        ) : (
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
            No video URL available
          </Typography>
        )}
      </Box>

      {/* Controls Overlay */}
      <Fade in={controlsVisible}>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            background: 'linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.4) 30%, transparent 60%)',
            pointerEvents: 'none',
          }}
        >
          {/* Top bar */}
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              p: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.7) 0%, transparent 100%)',
              pointerEvents: 'auto',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <IconButton onClick={handleBack} sx={controlButtonStyles}>
                <ArrowBackIcon />
              </IconButton>
              <Typography
                sx={{
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '1.125rem',
                  maxWidth: 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {video.title}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/* Source toggle */}
              {playbackSource?.type === 'both' && (
                <ToggleButtonGroup
                  value={selectedSource}
                  exclusive
                  onChange={(_event: React.MouseEvent<HTMLElement>, newValue: SelectedSource | null) => {
                    if (newValue !== null) {
                      setSelectedSource(newValue);
                      controls.pause();
                      setPlayed(0);
                    }
                  }}
                  size="small"
                  sx={{
                    '& .MuiToggleButton-root': {
                      color: 'rgba(255, 255, 255, 0.6)',
                      borderColor: 'rgba(255, 255, 255, 0.2)',
                      py: 0.5,
                      px: 1.5,
                      '&.Mui-selected': {
                        color: '#fff',
                        backgroundColor: 'rgba(168, 85, 247, 0.3)',
                        '&:hover': { backgroundColor: 'rgba(168, 85, 247, 0.4)' },
                      },
                      '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
                    },
                  }}
                >
                  <ToggleButton value="local">
                    <StorageIcon sx={{ fontSize: 16, mr: 0.5 }} />
                    Local
                  </ToggleButton>
                  <ToggleButton value="ipfs">
                    <CloudIcon sx={{ fontSize: 16, mr: 0.5 }} />
                    IPFS
                  </ToggleButton>
                </ToggleButtonGroup>
              )}

              {/* Source indicators */}
              {playbackSource?.type === 'local' && (
                <Chip
                  icon={<StorageIcon sx={{ fontSize: 14 }} />}
                  label="Local"
                  size="small"
                  sx={{
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                />
              )}
              {playbackSource?.type === 'ipfs' && ipfsGatewayHost && (
                <Chip
                  icon={<CloudIcon sx={{ fontSize: 14 }} />}
                  label={`IPFS (${ipfsGatewayHost})`}
                  size="small"
                  sx={{
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    color: '#818cf8',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                  }}
                />
              )}

              {/* Encryption indicator */}
              {shouldTreatAsEncrypted && isEncrypted && (
                <Chip
                  icon={<LockIcon sx={{ fontSize: 14 }} />}
                  label="Encrypted"
                  size="small"
                  sx={{
                    backgroundColor: 'rgba(168, 85, 247, 0.2)',
                    color: '#a855f7',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                  }}
                />
              )}
            </Box>
          </Box>

          {/* Bottom controls */}
          <Box sx={{ p: 2, pointerEvents: 'auto' }}>
            {/* Progress bar with timestamps */}
            <Box
              ref={progressBarRef}
              onMouseMove={handleProgressHover}
              onMouseLeave={handleProgressLeave}
              sx={{ position: 'relative', mb: 1.5 }}
            >
              {/* Hover time tooltip */}
              {hoverTime !== null && (
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: '100%',
                    left: hoverPosition,
                    transform: 'translateX(-50%)',
                    mb: 1,
                    px: 1.5,
                    py: 0.5,
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    borderRadius: 1,
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                >
                  <Typography sx={{ color: '#fff', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    {formatTime(hoverTime)}
                  </Typography>
                </Box>
              )}

              {/* Buffer indicator */}
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  height: 6,
                  width: `${state.loaded * 100}%`,
                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                  borderRadius: 3,
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />

              {/* Timestamp markers */}
              {timestamps.map((ts: Timestamp) => (
                <TimestampMarker
                  key={ts.id}
                  timestamp={ts}
                  duration={state.duration}
                  onClick={handleTimestampClick}
                />
              ))}

              {/* Progress slider */}
              <Slider
                value={state.played}
                onChange={handleSeek}
                min={0}
                max={1}
                step={0.0001}
                disabled={!playerReady || !!state.error}
                sx={progressSliderStyles}
              />
            </Box>

            {/* Control buttons row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {/* Play/Pause */}
              <IconButton onClick={controls.togglePlay} disabled={!playerReady || !!state.error} sx={controlButtonStyles}>
                {state.playing ? <PauseIcon sx={{ fontSize: 32 }} /> : <PlayIcon sx={{ fontSize: 32 }} />}
              </IconButton>

              {/* Skip buttons */}
              <IconButton onClick={controls.skipBackward} disabled={!playerReady} sx={controlButtonStyles}>
                <Replay10Icon />
              </IconButton>
              <IconButton onClick={controls.skipForward} disabled={!playerReady} sx={controlButtonStyles}>
                <Forward10Icon />
              </IconButton>

              {/* Volume control */}
              <Box sx={{ display: 'flex', alignItems: 'center', mx: 1 }}>
                <IconButton onClick={controls.toggleMute} sx={controlButtonStyles}>
                  {getVolumeIcon()}
                </IconButton>
                <Slider
                  value={state.muted ? 0 : state.volume}
                  onChange={handleVolumeChange}
                  min={0}
                  max={1}
                  step={0.01}
                  sx={volumeSliderStyles}
                />
              </Box>

              {/* Time display */}
              <Typography
                onClick={controls.toggleRemainingTime}
                sx={{
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  fontSize: '0.875rem',
                  minWidth: 120,
                  textAlign: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                  '&:hover': { color: '#fff' },
                }}
              >
                {formatTime(state.played * state.duration)}{' '}
                <Box component="span" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>/</Box>{' '}
                {state.showRemainingTime
                  ? formatTime(-(state.duration - state.played * state.duration))
                  : formatTime(state.duration)}
              </Typography>

              <Box sx={{ flex: 1 }} />

              {/* Loop button */}
              <Tooltip title={state.loop ? 'Loop on' : 'Loop off'}>
                <IconButton onClick={controls.toggleLoop} sx={{ ...controlButtonStyles, color: state.loop ? '#a855f7' : 'rgba(255, 255, 255, 0.9)' }}>
                  <LoopIcon />
                </IconButton>
              </Tooltip>

              {/* Playback speed */}
              <Tooltip title="Playback speed">
                <IconButton onClick={(e: React.MouseEvent<HTMLButtonElement>) => setSpeedMenuAnchor(e.currentTarget)} sx={controlButtonStyles}>
                  <SpeedIcon />
                  <Typography sx={{ ml: 0.5, fontSize: '0.75rem' }}>
                    {state.playbackRate}x
                  </Typography>
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={speedMenuAnchor}
                open={Boolean(speedMenuAnchor)}
                onClose={() => setSpeedMenuAnchor(null)}
                PaperProps={{
                  sx: {
                    backgroundColor: 'rgba(30, 30, 40, 0.95)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    minWidth: 120,
                  },
                }}
              >
                {PLAYBACK_RATES.map((rate) => (
                  <MenuItem
                    key={rate}
                    onClick={() => {
                      controls.setPlaybackRate(rate);
                      setSpeedMenuAnchor(null);
                    }}
                    selected={state.playbackRate === rate}
                    sx={{
                      color: '#fff',
                      '&.Mui-selected': { backgroundColor: 'rgba(168, 85, 247, 0.2)' },
                      '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
                    }}
                  >
                    {rate}x
                  </MenuItem>
                ))}
              </Menu>

              {/* Keyboard shortcuts button */}
              <Tooltip title="Keyboard shortcuts (?)">
                <IconButton onClick={toggleShortcuts} sx={controlButtonStyles}>
                  <KeyboardIcon />
                </IconButton>
              </Tooltip>

              {/* PiP button */}
              <Tooltip title="Picture in Picture">
                <IconButton onClick={controls.togglePip} sx={{ ...controlButtonStyles, color: state.pip ? '#a855f7' : 'rgba(255, 255, 255, 0.9)' }}>
                  <PipIcon />
                </IconButton>
              </Tooltip>

              {/* Fullscreen button */}
              <Tooltip title={state.fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}>
                <IconButton onClick={controls.toggleFullscreen} sx={controlButtonStyles}>
                  {state.fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Box>
      </Fade>

      {/* Keyboard shortcuts overlay */}
      <ShortcutsOverlay open={showShortcuts} onClose={toggleShortcuts} />
    </Box>
  );
};

export default VideoPlayer;
