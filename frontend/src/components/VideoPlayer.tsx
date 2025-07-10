import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  IconButton,
  Slider,
  Typography,
  Paper,
  CircularProgress,
  Fade,
  Tooltip,
} from "@mui/material";
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  VolumeUp as VolumeUpIcon,
  VolumeDown as VolumeDownIcon,
  VolumeMute as VolumeMuteIcon,
  VolumeOff as VolumeOffIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Forward10 as Forward10Icon,
  Replay10 as Replay10Icon,
  Settings as SettingsIcon,
  ArrowBack as ArrowBackIcon,
  PictureInPicture as PipIcon,
  Speed as SpeedIcon,
} from "@mui/icons-material";
import ReactPlayer from "react-player";
import { videoService } from "@/services/api";
import { Video, Timestamp } from "@/types/video";

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
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [seeking, setSeeking] = useState(false);
  const [buffer, setBuffer] = useState(0);
  const [pip, setPip] = useState(false);
  const [controlsTimeout, setControlsTimeout] = useState<NodeJS.Timeout | null>(
    null
  );

  const playerRef = React.useRef<ReactPlayer>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchVideoData = async () => {
      if (!videoPath) return;

      try {
        setLoading(true);
        const decodedPath = decodeURIComponent(videoPath);
        const [videoData, timestampsData] = await Promise.all([
          videoService
            .getAll()
            .then((videos) => videos.find((v) => v.path === decodedPath)),
          videoService.getTimestamps(decodedPath),
        ]);

        if (!videoData) {
          throw new Error("Video not found");
        }

        setVideo(videoData);
        setTimestamps(timestampsData);
        setError(null);
      } catch (err) {
        setError("Failed to load video");
        console.error("Error loading video:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideoData();
  }, [videoPath]);

  // Auto-hide controls
  useEffect(() => {
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }

    if (showControls && playing) {
      const timeout = setTimeout(() => {
        setShowControls(false);
      }, 5000); // Increased timeout to 5 seconds
      setControlsTimeout(timeout);
    }

    return () => {
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
      }
    };
  }, [showControls, playing]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleSeekBackward();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleSeekForward();
          break;
        case "ArrowUp":
          e.preventDefault();
          handleVolumeUp();
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolumeDown();
          break;
        case "m":
          e.preventDefault();
          handleMute();
          break;
        case "f":
          e.preventDefault();
          handleFullscreen();
          break;
        case "Escape":
          if (fullscreen) {
            handleFullscreen();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreen, volume, muted]);

  const handlePlayPause = () => {
    setPlaying(!playing);
    setShowControls(true);
  };

  const handleProgress = (state: { played: number; loaded: number }) => {
    if (!seeking) {
      setPlayed(state.played);
      setBuffer(state.loaded);
    }
  };

  const handleDuration = (duration: number) => {
    setDuration(duration);
  };

  const handleSeekMouseDown = () => {
    setSeeking(true);
  };

  const handleSeekChange = (
    _: Event | React.SyntheticEvent<Element, Event>,
    value: number | number[]
  ) => {
    if (typeof value === "number") {
      setPlayed(value);
    }
  };

  const handleSeekMouseUp = (
    _: Event | React.SyntheticEvent<Element, Event>,
    value: number | number[]
  ) => {
    setSeeking(false);
    if (typeof value === "number" && playerRef.current) {
      playerRef.current.seekTo(value);
    }
  };

  const handleSeekForward = () => {
    if (playerRef.current) {
      const newTime = Math.min(played + 10 / duration, 1);
      playerRef.current.seekTo(newTime);
      setPlayed(newTime);
    }
    setShowControls(true);
  };

  const handleSeekBackward = () => {
    if (playerRef.current) {
      const newTime = Math.max(played - 10 / duration, 0);
      playerRef.current.seekTo(newTime);
      setPlayed(newTime);
    }
    setShowControls(true);
  };

  const handleVolumeChange = (_: Event, value: number | number[]) => {
    if (typeof value === "number") {
      setVolume(value);
      setMuted(value === 0);
    }
  };

  const handleVolumeUp = () => {
    const newVolume = Math.min(volume + 0.1, 1);
    setVolume(newVolume);
    setMuted(false);
    setShowControls(true);
  };

  const handleVolumeDown = () => {
    const newVolume = Math.max(volume - 0.1, 0);
    setVolume(newVolume);
    setMuted(newVolume === 0);
    setShowControls(true);
  };

  const handleMute = () => {
    setMuted(!muted);
    setShowControls(true);
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
    setShowControls(true);
  };

  const handlePlaybackRateChange = () => {
    const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    setPlaybackRate(rates[nextIndex]);
    setShowControls(true);
  };

  const handlePictureInPicture = () => {
    if (playerRef.current) {
      const videoElement =
        playerRef.current.getInternalPlayer() as HTMLVideoElement;
      if (videoElement && "requestPictureInPicture" in videoElement) {
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture();
          setPip(false);
        } else {
          videoElement.requestPictureInPicture();
          setPip(true);
        }
      }
    }
    setShowControls(true);
  };

  const handleBack = () => {
    navigate("/");
  };

  const handleMouseMove = () => {
    setShowControls(true);
  };

  const handleMouseLeave = () => {
    // Only hide controls if video is playing and not seeking
    if (playing && !seeking) {
      setShowControls(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getVolumeIcon = () => {
    if (muted || volume === 0) return <VolumeOffIcon />;
    if (volume < 0.3) return <VolumeMuteIcon />;
    if (volume < 0.7) return <VolumeDownIcon />;
    return <VolumeUpIcon />;
  };

  // Format video URL properly for Electron
  const getVideoUrl = (path: string) => {
    if (path.startsWith("file://")) {
      return path;
    }
    const normalizedPath = path.replace(/\\/g, "/");
    return `file:///${normalizedPath}`;
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error || !video) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <Typography color="error">{error || "Video not found"}</Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "black",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main Video Player */}
      <Box sx={{ position: "relative", flexGrow: 1 }}>
        <ReactPlayer
          ref={playerRef}
          url={getVideoUrl(video.path)}
          width="100%"
          height="100%"
          playing={playing}
          volume={volume}
          muted={muted}
          playbackRate={playbackRate}
          onProgress={handleProgress}
          onDuration={handleDuration}
          progressInterval={100}
          onError={(error) => {
            console.error("ReactPlayer error:", error);
            setError("Failed to load video file");
          }}
          onReady={() => {
            console.log("Video is ready to play");
          }}
          config={{
            file: {
              attributes: {
                controlsList: "nodownload",
                disablePictureInPicture: false,
              },
            },
          }}
        />

        {/* Loading Overlay */}
        {loading && (
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "rgba(0, 0, 0, 0.7)",
              color: "white",
            }}
          >
            <CircularProgress color="inherit" />
          </Box>
        )}

        {/* Center Play/Pause Button */}
        <Fade in={!playing || showControls}>
          <Box
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 2,
            }}
          >
            <IconButton
              onClick={handlePlayPause}
              sx={{
                bgcolor: "rgba(0, 0, 0, 0.5)",
                color: "white",
                width: 80,
                height: 80,
                "&:hover": {
                  bgcolor: "rgba(0, 0, 0, 0.7)",
                },
              }}
            >
              {playing ? (
                <PauseIcon sx={{ fontSize: 40 }} />
              ) : (
                <PlayIcon sx={{ fontSize: 40 }} />
              )}
            </IconButton>
          </Box>
        </Fade>

        {/* Custom Controls Overlay */}
        <Box
          sx={{
            position: "absolute",
            top: "70%",
            right: 0,
            left: 0,
            background: "linear-gradient(transparent, rgba(0, 0, 0, 0.8))",
            color: "white",
            p: 2,
            zIndex: 3,
            opacity: showControls ? 1 : 0,
            transition: "opacity 0.3s ease-in-out",
            pointerEvents: showControls ? "auto" : "none",
          }}
        >
          {/* Progress Bar */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 50 }}>
                {formatTime(played * duration)}
              </Typography>
              <Box sx={{ flexGrow: 1, position: "relative" }}>
                {/* Buffer Bar */}
                <Box
                  sx={{
                    position: "absolute",
                    height: 4,
                    bgcolor: "rgba(255, 255, 255, 0.3)",
                    borderRadius: 2,
                    width: "100%",
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                />
                <Box
                  sx={{
                    position: "absolute",
                    height: 4,
                    bgcolor: "rgba(255, 255, 255, 0.5)",
                    borderRadius: 2,
                    width: `${buffer * 100}%`,
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                />
                {/* Progress Slider */}
                <Slider
                  value={played}
                  onChange={(_: Event, value: number | number[]) =>
                    handleSeekChange(_, value)
                  }
                  onChangeCommitted={(
                    _: Event | React.SyntheticEvent<Element, Event>,
                    value: number | number[]
                  ) => handleSeekMouseUp(_, value)}
                  onMouseDown={handleSeekMouseDown}
                  min={0}
                  max={1}
                  step={0.001}
                  sx={{
                    "& .MuiSlider-thumb": {
                      width: 16,
                      height: 16,
                      bgcolor: "white",
                      "&:hover": {
                        boxShadow: "0 0 0 8px rgba(255, 255, 255, 0.16)",
                      },
                    },
                    "& .MuiSlider-track": {
                      bgcolor: "white",
                      border: "none",
                    },
                    "& .MuiSlider-rail": {
                      bgcolor: "transparent",
                    },
                  }}
                />
              </Box>
              <Typography variant="body2" sx={{ minWidth: 50 }}>
                {formatTime(duration)}
              </Typography>
            </Box>
          </Box>

          {/* Control Buttons */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {/* Left Controls */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Tooltip title="Back">
                <IconButton onClick={handleBack} sx={{ color: "white" }}>
                  <ArrowBackIcon />
                </IconButton>
              </Tooltip>

              <Tooltip title="Replay 10s">
                <IconButton
                  onClick={handleSeekBackward}
                  sx={{ color: "white" }}
                >
                  <Replay10Icon />
                </IconButton>
              </Tooltip>

              <Tooltip title={playing ? "Pause" : "Play"}>
                <IconButton onClick={handlePlayPause} sx={{ color: "white" }}>
                  {playing ? <PauseIcon /> : <PlayIcon />}
                </IconButton>
              </Tooltip>

              <Tooltip title="Forward 10s">
                <IconButton onClick={handleSeekForward} sx={{ color: "white" }}>
                  <Forward10Icon />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Volume Controls */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: 2 }}>
              <Tooltip title={muted ? "Unmute" : "Mute"}>
                <IconButton onClick={handleMute} sx={{ color: "white" }}>
                  {getVolumeIcon()}
                </IconButton>
              </Tooltip>
              <Slider
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                min={0}
                max={1}
                step={0.05}
                sx={{
                  width: 80,
                  "& .MuiSlider-thumb": {
                    width: 12,
                    height: 12,
                    bgcolor: "white",
                  },
                  "& .MuiSlider-track": {
                    bgcolor: "white",
                  },
                  "& .MuiSlider-rail": {
                    bgcolor: "rgba(255, 255, 255, 0.3)",
                  },
                }}
              />
            </Box>

            {/* Right Controls */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                ml: "auto",
              }}
            >
              <Tooltip title={`Speed: ${playbackRate}x`}>
                <IconButton
                  onClick={handlePlaybackRateChange}
                  sx={{ color: "white" }}
                >
                  <SpeedIcon />
                </IconButton>
              </Tooltip>

              <Tooltip title="Picture in Picture">
                <IconButton
                  onClick={handlePictureInPicture}
                  sx={{ color: "white" }}
                >
                  <PipIcon />
                </IconButton>
              </Tooltip>

              <Tooltip title={fullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                <IconButton onClick={handleFullscreen} sx={{ color: "white" }}>
                  {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Box>

        {/* Video Title Overlay */}
        <Fade in={showControls}>
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              background: "linear-gradient(rgba(0, 0, 0, 0.8), transparent)",
              color: "white",
              p: 2,
              zIndex: 3,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 500 }}>
              {video.title}
            </Typography>
          </Box>
        </Fade>
      </Box>

      {/* AI Timestamps Panel */}
      {timestamps.length > 0 && (
        <Paper
          sx={{
            p: 2,
            bgcolor: "background.paper",
            maxHeight: "200px",
            overflowY: "auto",
          }}
        >
          <Typography variant="h6" sx={{ mb: 1 }}>
            AI Analysis Tags ({timestamps.length})
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {timestamps.map((timestamp, index) => (
              <Box
                key={index}
                sx={{
                  p: 1,
                  bgcolor: "primary.light",
                  color: "primary.contrastText",
                  borderRadius: 1,
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  "&:hover": {
                    bgcolor: "primary.main",
                  },
                }}
                onClick={() => {
                  if (playerRef.current) {
                    playerRef.current.seekTo(timestamp.start_time);
                    setShowControls(true);
                  }
                }}
              >
                {timestamp.tag_name} ({formatTime(timestamp.start_time)})
              </Box>
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default VideoPlayer;
