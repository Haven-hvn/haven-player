import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  IconButton,
  Slider,
  Typography,
  Paper,
  CircularProgress,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  SkipNext as SkipNextIcon,
  SkipPrevious as SkipPreviousIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import ReactPlayer from 'react-player';
import { videoService } from '@/services/api';
import { Video, Timestamp } from '@/types/video';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = React.useRef<any>(null);

  useEffect(() => {
    const fetchVideoData = async () => {
      if (!videoPath) return;

      try {
        setLoading(true);
        const decodedPath = decodeURIComponent(videoPath);
        const [videoData, timestampsData] = await Promise.all([
          videoService.getAll().then(videos => videos.find(v => v.path === decodedPath)),
          videoService.getTimestamps(decodedPath),
        ]);

        if (!videoData) {
          throw new Error('Video not found');
        }

        setVideo(videoData);
        setTimestamps(timestampsData);
        setError(null);
      } catch (err) {
        setError('Failed to load video');
        console.error('Error loading video:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideoData();
  }, [videoPath]);

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

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
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

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box sx={{ position: 'relative', flexGrow: 1 }}>
        <ReactPlayer
          ref={playerRef}
          url={`file://${video.path}`}
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