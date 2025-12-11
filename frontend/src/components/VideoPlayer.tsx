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
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  SkipNext as SkipNextIcon,
  SkipPrevious as SkipPreviousIcon,
  ArrowBack as ArrowBackIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import ReactPlayer from 'react-player';
import { videoService } from '@/services/api';
import { Video, Timestamp } from '@/types/video';
import { useLitDecryption } from '@/hooks/useLitDecryption';
import { resolvePlaybackSource } from '@/services/playbackResolver';
import type { PlaybackResolution } from '@/types/playback';
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

  const videoUrl = useMemo(() => {
    if (isEncrypted && decryptedUrl) {
      return decryptedUrl;
    }
    if (!playbackSource) {
      return null;
    }
    if (playbackSource.type === "local") {
      return `file://${encodeURI(playbackSource.uri)}`;
    }
    if (playbackSource.type === "ipfs") {
      return playbackSource.uri;
    }
    return null;
  }, [decryptedUrl, isEncrypted, playbackSource]);

  // Check if we're still preparing the video (loading or decrypting)
  const isPreparing =
    loading ||
    (isEncrypted &&
      (decryptionStatus.status === 'loading' ||
        decryptionStatus.status === 'decrypting'));

  const ipfsGatewayHost = useMemo(() => {
    if (playbackSource?.type !== "ipfs") {
      return null;
    }

    try {
      return new URL(playbackSource.gatewayBase).host;
    } catch {
      return playbackSource.gatewayBase;
    }
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

        if (source.type === "unavailable") {
          setError("Video missing locally and no IPFS CID is available.");
          return;
        }

        if (videoData.is_encrypted && videoData.lit_encryption_metadata) {
          console.log('[VideoPlayer] Video is encrypted, starting decryption...');
          const loadEncryptedData =
            source.type === "local"
              ? async () => {
                  const fileData = await ipcRenderer.invoke('read-video-file', source.uri);
                  return new Uint8Array(fileData.data);
                }
              : async () => {
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

  const handlePlayPause = () => {
    setPlaying(!playing);
  };

  const handleProgress: (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => void = (state) => {
    setPlayed(state.played);
  };

  const handleDuration = (duration: number) => {
    setDuration(duration);
  };

  const handleSeek = (_: Event, value: number | number[]) => {
    if (typeof value === 'number' && playerRef.current) {
      playerRef.current.seekTo(value);
      setPlayed(value);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

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

  // Don't render player if encrypted video hasn't been decrypted yet
  if (isEncrypted && !decryptedUrl) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <Typography color="text.secondary">Preparing encrypted video...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box sx={{ position: 'relative', flexGrow: 1 }}>
        <ReactPlayer
          ref={playerRef}
          url={videoUrl ?? undefined}
          width="100%"
          height="100%"
          playing={playing}
          // @ts-expect-error - react-player types mismatch
          onProgress={handleProgress}
          onDuration={handleDuration}
          progressInterval={100}
        />
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
          <IconButton onClick={handlePlayPause} size="large">
            {playing ? <PauseIcon /> : <PlayIcon />}
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {video.title}
          </Typography>
          {playbackSource?.type === "local" && (
            <Chip
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
              label={`IPFS via ${ipfsGatewayHost}`}
              size="small"
              sx={{
                backgroundColor: '#E8EAF6',
                color: '#1A237E',
              }}
            />
          )}
          {isEncrypted && (
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