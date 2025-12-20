import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  IconButton,
  Slider,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  SkipNext as SkipNextIcon,
  SkipPrevious as SkipPreviousIcon,
  ArrowBack as ArrowBackIcon,
  Lock as LockIcon,
  Storage as StorageIcon,
  CloudQueue as CloudIcon,
} from '@mui/icons-material';
import ReactPlayer from 'react-player';
import { videoService } from '@/services/api';
import { Video, Timestamp } from '@/types/video';
import { useLitDecryption } from '@/hooks/useLitDecryption';
import { resolvePlaybackSource } from '@/services/playbackResolver';
import type { PlaybackResolution, SelectedSource } from '@/types/playback';
import { loadGatewayConfig, fileExistsViaIpc } from '@/services/playbackConfig';
import { ipcRenderer } from 'electron';

const VideoPlayer: React.FC = () => {
  const { videoPath } = useParams<{ videoPath: string }>();
  const navigate = useNavigate();
  const [video, setVideo] = useState<Video | null>(null);
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playbackSource, setPlaybackSource] = useState<PlaybackResolution | null>(null);
  const [selectedSource, setSelectedSource] = useState<SelectedSource>("local");
  const [playerReady, setPlayerReady] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = React.useRef<any>(null);

  // Lit Protocol decryption hook
  const {
    decryptedUrl,
    decryptionStatus,
    decryptVideo,
    clearDecryptedUrl,
    isEncrypted,
  } = useLitDecryption();

  // Determine if we should treat the video as encrypted based on selected source
  // Local files are assumed to be unencrypted, only IPFS sources may be encrypted
  const shouldTreatAsEncrypted = useMemo(() => {
    if (!playbackSource || !video) {
      return false;
    }
    // Local-only sources are never encrypted
    if (playbackSource.type === "local") {
      return false;
    }
    // For "both" type, only treat as encrypted if IPFS is selected
    if (playbackSource.type === "both") {
      return selectedSource === "ipfs" && (video.is_encrypted ?? false);
    }
    // IPFS-only sources may be encrypted
    if (playbackSource.type === "ipfs") {
      return video.is_encrypted ?? false;
    }
    return false;
  }, [playbackSource, selectedSource, video]);

  const videoUrl = useMemo(() => {
    // Only use decrypted URL if we're treating it as encrypted (IPFS source)
    if (shouldTreatAsEncrypted && isEncrypted && decryptedUrl) {
      return decryptedUrl;
    }
    if (!playbackSource) {
      return null;
    }
    if (playbackSource.type === "local") {
      // Normalize file path for Electron - ensure proper encoding
      // On Windows, paths start with drive letter (C:\), so we need to handle that
      let normalizedPath = playbackSource.uri.replace(/\\/g, '/');
      // Ensure we have a leading slash for absolute paths
      if (!normalizedPath.startsWith('/') && normalizedPath.includes(':')) {
        // Windows path like C:/path/to/file
        normalizedPath = '/' + normalizedPath;
      }
      // Encode the path but keep the file:// protocol
      const encodedPath = encodeURI(normalizedPath).replace(/#/g, '%23');
      return `file://${encodedPath}`;
    }
    if (playbackSource.type === "ipfs") {
      return playbackSource.uri;
    }
    if (playbackSource.type === "both") {
      if (selectedSource === "local") {
        // Normalize file path for Electron - ensure proper encoding
        // On Windows, paths start with drive letter (C:\), so we need to handle that
        let normalizedPath = playbackSource.local.uri.replace(/\\/g, '/');
        // Ensure we have a leading slash for absolute paths
        if (!normalizedPath.startsWith('/') && normalizedPath.includes(':')) {
          // Windows path like C:/path/to/file
          normalizedPath = '/' + normalizedPath;
        }
        // Encode the path but keep the file:// protocol
        const encodedPath = encodeURI(normalizedPath).replace(/#/g, '%23');
        return `file://${encodedPath}`;
      }
      return playbackSource.ipfs.uri;
    }
    return null;
  }, [decryptedUrl, isEncrypted, playbackSource, selectedSource, shouldTreatAsEncrypted]);

  // Reset player state when URL changes
  useEffect(() => {
    if (videoUrl) {
      console.log('[VideoPlayer] Video URL changed:', videoUrl.substring(0, 100));
      setPlayerReady(false);
      setPlaybackError(null);
      setPlaying(false);
      setPlayed(0);
    }
  }, [videoUrl]);

  // Check if we're still preparing the video (loading or decrypting)
  const isPreparing =
    loading ||
    (shouldTreatAsEncrypted &&
      isEncrypted &&
      (decryptionStatus.status === 'loading' ||
        decryptionStatus.status === 'decrypting'));

  const ipfsGatewayHost = useMemo(() => {
    if (playbackSource?.type === "ipfs") {
      try {
        return new URL(playbackSource.gatewayBase).host;
      } catch {
        return playbackSource.gatewayBase;
      }
    }
    if (playbackSource?.type === "both") {
      try {
        return new URL(playbackSource.ipfs.gatewayBase).host;
      } catch {
        return playbackSource.ipfs.gatewayBase;
      }
    }
    return null;
  }, [playbackSource]);

  useEffect(() => {
    const fetchVideoData = async () => {
      if (!videoPath) return;

      try {
        setLoading(true);
        setError(null);
        setPlaybackSource(null);

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

        // Set default source preference: local if available, otherwise IPFS
        if (source.type === "both") {
          setSelectedSource("local");
        } else if (source.type === "ipfs") {
          setSelectedSource("ipfs");
        }

        if (source.type === "unavailable") {
          setError("Video missing locally and no IPFS CID is available.");
          return;
        }

        // Only attempt decryption for IPFS-only sources (not local, not "both" with local default)
        // Local files are assumed to be unencrypted
        // For "both" type, we default to local, so decryption will happen when user switches to IPFS
        if (source.type === "ipfs" && videoData.is_encrypted && videoData.lit_encryption_metadata) {
          console.log('[VideoPlayer] IPFS video is encrypted, starting decryption...');
          const loadEncryptedData = async () => {
            const response = await fetch(source.uri);
            if (!response.ok) {
              throw new Error('Failed to fetch encrypted video from gateway');
            }
            const buffer = await response.arrayBuffer();
            return new Uint8Array(buffer);
          };

          await decryptVideo(videoData, loadEncryptedData);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load video';
        setError(message);
        console.error('Error loading video:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideoData();

    // Cleanup decrypted URL when unmounting
    return () => {
      clearDecryptedUrl();
    };
  }, [videoPath, decryptVideo, clearDecryptedUrl]);

  // Handle decryption when switching from local to IPFS (if encrypted)
  useEffect(() => {
    if (!playbackSource || !video || playbackSource.type !== "both") {
      return;
    }

    // If switching to IPFS and it's encrypted, trigger decryption
    if (selectedSource === "ipfs" && video.is_encrypted && video.lit_encryption_metadata) {
      // Only decrypt if we don't already have a decrypted URL
      if (!decryptedUrl && decryptionStatus.status !== 'decrypting' && decryptionStatus.status !== 'loading') {
        console.log('[VideoPlayer] Switching to IPFS source, starting decryption...');
        const loadEncryptedData = async () => {
          const response = await fetch(playbackSource.ipfs.uri);
          if (!response.ok) {
            throw new Error('Failed to fetch encrypted video from gateway');
          }
          const buffer = await response.arrayBuffer();
          return new Uint8Array(buffer);
        };
        decryptVideo(video, loadEncryptedData).catch((error) => {
          console.error('Failed to decrypt video when switching to IPFS:', error);
        });
      }
    }

    // If switching back to local, clear decrypted URL (local is unencrypted)
    if (selectedSource === "local" && decryptedUrl) {
      clearDecryptedUrl();
    }
  }, [selectedSource, playbackSource, video, decryptedUrl, decryptionStatus.status, decryptVideo, clearDecryptedUrl]);

  const handlePlayPause = () => {
    setPlaying(!playing);
  };

  const handleProgress: (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => void = (state) => {
    setPlayed(state.played);
    // Also update duration if we get it from progress
    if (state.loadedSeconds > 0 && duration === 0) {
      // Try to get duration from player if available
      if (playerRef.current) {
        try {
          const player = playerRef.current.getInternalPlayer();
          if (player && typeof player.duration === 'number' && !isNaN(player.duration) && player.duration > 0) {
            setDuration(player.duration);
          }
        } catch (err) {
          // Ignore errors
        }
      }
    }
  };

  const handleSeek = (_: Event, value: number | number[]) => {
    if (typeof value === 'number' && playerRef.current) {
      playerRef.current.seekTo(value);
      setPlayed(value);
    }
  };

  const handleReady = () => {
    console.log('[VideoPlayer] Player ready, URL:', videoUrl?.substring(0, 100));
    setPlayerReady(true);
    setPlaybackError(null);
    // Get duration from player ref since onDuration isn't supported for file player
    // Use setTimeout to ensure the internal player is fully initialized
    setTimeout(() => {
      if (playerRef.current) {
        try {
          const player = playerRef.current.getInternalPlayer();
          if (player && typeof player.duration === 'number' && !isNaN(player.duration) && player.duration > 0) {
            setDuration(player.duration);
            console.log('[VideoPlayer] Duration:', player.duration);
          } else if (player && player.readyState >= 2) {
            // If duration not available yet, try to get it from loadedmetadata
            const checkDuration = () => {
              if (player && typeof player.duration === 'number' && !isNaN(player.duration) && player.duration > 0) {
                setDuration(player.duration);
                console.log('[VideoPlayer] Duration (from metadata):', player.duration);
              }
            };
            player.addEventListener('loadedmetadata', checkDuration);
            // Also check immediately
            checkDuration();
          }
        } catch (err) {
          console.warn('[VideoPlayer] Could not get duration from player:', err);
        }
      }
    }, 100);
  };

  const handleError = (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[VideoPlayer] Playback error:', errorMessage, 'URL:', videoUrl?.substring(0, 100));
    setPlaybackError(errorMessage);
    setPlaying(false);
  };

  const handleBack = () => {
    navigate('/');
  };

  // Determine player config based on URL type - MUST be before any early returns (Rules of Hooks)
  const playerConfig = useMemo(() => {
    if (!videoUrl) return undefined;
    
    console.log('[VideoPlayer] Configuring player for URL:', videoUrl.substring(0, 100));
    
    // For file:// URLs, use fileConfig with proper attributes
    if (videoUrl.startsWith('file://')) {
      return {
        file: {
          attributes: {
            controls: false,
            preload: 'auto' as const,
            crossOrigin: 'anonymous' as const,
          },
          forceVideo: true,
        },
      };
    }
    
    // For blob URLs (decrypted videos), use fileConfig
    if (videoUrl.startsWith('blob:')) {
      return {
        file: {
          attributes: {
            controls: false,
            preload: 'auto' as const,
            crossOrigin: 'anonymous' as const,
          },
          forceVideo: true,
        },
      };
    }
    
    // For HTTP/HTTPS URLs (IPFS), use fileConfig with video attributes
    return {
      file: {
        attributes: {
          controls: false,
          preload: 'auto' as const,
          crossOrigin: 'anonymous' as const,
        },
        forceVideo: true,
      },
    };
  }, [videoUrl]);

  // Show loading state (for video loading or decryption)
  if (isPreparing) {
    return (
      <Box 
        display="flex" 
        flexDirection="column"
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
        gap={2}
      >
        <CircularProgress />
        {decryptionStatus.status === 'decrypting' && (
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body1" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <LockIcon sx={{ fontSize: 18, color: '#4CAF50' }} />
              Decrypting encrypted video...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {decryptionStatus.progress}
            </Typography>
          </Box>
        )}
        {decryptionStatus.status === 'loading' && (
          <Typography variant="body2" color="text.secondary">
            Loading encryption configuration...
          </Typography>
        )}
      </Box>
    );
  }

  // Show decryption error
  if (decryptionStatus.status === 'error') {
    return (
      <Box 
        display="flex" 
        flexDirection="column"
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
        gap={2}
        p={4}
      >
        <Alert 
          severity="error" 
          sx={{ 
            maxWidth: 500,
            '& .MuiAlert-message': { width: '100%' }
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Decryption Failed
          </Typography>
          <Typography variant="body2">
            {decryptionStatus.error}
          </Typography>
        </Alert>
        <IconButton onClick={handleBack} sx={{ mt: 2 }}>
          <ArrowBackIcon />
          <Typography sx={{ ml: 1 }}>Go Back</Typography>
        </IconButton>
      </Box>
    );
  }

  if (error || !video) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <Typography color="error">{error || 'Video not found'}</Typography>
      </Box>
    );
  }

  // Don't render player if encrypted IPFS video hasn't been decrypted yet
  if (shouldTreatAsEncrypted && isEncrypted && !decryptedUrl) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <Typography color="text.secondary">Preparing encrypted video...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box sx={{ position: 'relative', flexGrow: 1, backgroundColor: '#000' }}>
        {videoUrl ? (
          <>
            <ReactPlayer
              ref={playerRef}
              url={videoUrl}
              width="100%"
              height="100%"
              playing={playing}
              controls={false}
              light={false}
              pip={false}
              config={playerConfig}
              onReady={handleReady}
              onError={handleError}
              onProgress={handleProgress}
              progressInterval={100}
            />
            {playbackError && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  zIndex: 10,
                }}
              >
                <Alert severity="error" sx={{ maxWidth: 500 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Playback Error
                  </Typography>
                  <Typography variant="body2">{playbackError}</Typography>
                </Alert>
              </Box>
            )}
            {!playerReady && !playbackError && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#000',
                }}
              >
                <CircularProgress />
              </Box>
            )}
          </>
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#000',
            }}
          >
            <Typography color="text.secondary">No video URL available</Typography>
          </Box>
        )}
      </Box>

      <Paper
        sx={{
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={handleBack} size="large">
            <ArrowBackIcon />
          </IconButton>
          <IconButton 
            onClick={handlePlayPause} 
            size="large"
            disabled={!!playbackError || !videoUrl}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {video.title}
          </Typography>
          {playbackSource?.type === "both" && (
            <ToggleButtonGroup
              value={selectedSource}
              exclusive
              onChange={(_: React.MouseEvent<HTMLElement>, newValue: SelectedSource | null) => {
                if (newValue !== null) {
                  setSelectedSource(newValue);
                  // Reset playback when switching sources
                  setPlaying(false);
                  setPlayed(0);
                }
              }}
              size="small"
              sx={{ height: 32 }}
            >
              <ToggleButton value="local">
                <Tooltip title="Play from local file">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <StorageIcon sx={{ fontSize: 16 }} />
                    <Typography variant="caption">Local</Typography>
                  </Box>
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="ipfs">
                <Tooltip title={`Play from IPFS via ${ipfsGatewayHost || 'gateway'}`}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CloudIcon sx={{ fontSize: 16 }} />
                    <Typography variant="caption">IPFS</Typography>
                  </Box>
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          )}
          {playbackSource?.type === "local" && (
            <Chip
              icon={<StorageIcon sx={{ fontSize: 16 }} />}
              label="Local file"
              size="small"
              sx={{
                backgroundColor: '#E0F7FA',
                color: '#006064',
              }}
            />
          )}
          {playbackSource?.type === "ipfs" && ipfsGatewayHost && (
            <Chip
              icon={<CloudIcon sx={{ fontSize: 16 }} />}
              label={`IPFS via ${ipfsGatewayHost}`}
              size="small"
              sx={{
                backgroundColor: '#E8EAF6',
                color: '#1A237E',
              }}
            />
          )}
          {playbackSource?.type === "both" && (
            <>
              {selectedSource === "local" && (
                <Chip
                  icon={<StorageIcon sx={{ fontSize: 16 }} />}
                  label="Playing from local"
                  size="small"
                  sx={{
                    backgroundColor: '#E0F7FA',
                    color: '#006064',
                  }}
                />
              )}
              {selectedSource === "ipfs" && ipfsGatewayHost && (
                <Chip
                  icon={<CloudIcon sx={{ fontSize: 16 }} />}
                  label={`Playing from IPFS via ${ipfsGatewayHost}`}
                  size="small"
                  sx={{
                    backgroundColor: '#E8EAF6',
                    color: '#1A237E',
                  }}
                />
              )}
            </>
          )}
          {shouldTreatAsEncrypted && isEncrypted && (
            <Chip
              icon={<LockIcon sx={{ fontSize: 16 }} />}
              label="Encrypted"
              size="small"
              sx={{
                backgroundColor: '#E8F5E9',
                color: '#2E7D32',
                '& .MuiChip-icon': {
                  color: '#4CAF50',
                },
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2">
            {Math.floor(played * duration)}s
          </Typography>
          <Slider
            value={played}
            onChange={handleSeek}
            min={0}
            max={1}
            step={0.001}
            disabled={!playerReady || !!playbackError || !videoUrl}
            sx={{ flexGrow: 1 }}
          />
          <Typography variant="body2">
            {Math.floor(duration)}s
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default VideoPlayer; 