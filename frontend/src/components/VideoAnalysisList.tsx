import React, { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  LinearProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Card,
  CardContent,
  Chip,
  Avatar,
  Tooltip,
} from "@mui/material";
import {
  PlayArrow as PlayIcon,
  Analytics as AnalyzeIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Refresh as RetryIcon,
  RemoveCircleOutline as RemoveIcon,
  MoreVert as MoreVertIcon,
  Schedule as ScheduleIcon,
  SmartDisplay as VideoIcon,
  Timeline as TimelineIcon,
} from "@mui/icons-material";
import { Video, Timestamp } from "@/types/video";

interface AnalysisSegment {
  start: number;
  end: number;
  type: "analyzed" | "unanalyzed";
  confidence?: number;
}

interface VideoAnalysisItemProps {
  video: Video;
  index: number;
  timestamps: Timestamp[];
  analysisStatus: "pending" | "analyzing" | "completed" | "error";
  jobProgress?: number;
  onPlay: (video: Video) => void;
  onAnalyze: (video: Video) => void;
  onRemove: (video: Video) => void;
}

const VideoAnalysisItem: React.FC<VideoAnalysisItemProps> = ({
  video,
  index,
  timestamps,
  analysisStatus,
  jobProgress = 0,
  onPlay,
  onAnalyze,
  onRemove,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 6,
          }
        : null
    );
  };

  const handleClose = () => {
    setContextMenu(null);
  };

  const handleRemoveClick = () => {
    onRemove(video);
    handleClose();
  };

  // Generate analysis segments from timestamps
  const generateAnalysisSegments = (): AnalysisSegment[] => {
    if (!timestamps.length) {
      return [{ start: 0, end: video.duration, type: "unanalyzed" }];
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
          type: "unanalyzed",
        });
      }

      segments.push({
        start: timestamp.start_time,
        end: timestamp.end_time || timestamp.start_time + 1,
        type: "analyzed",
        confidence: timestamp.confidence,
      });

      currentTime = timestamp.end_time || timestamp.start_time + 1;
    });

    if (currentTime < video.duration) {
      segments.push({
        start: currentTime,
        end: video.duration,
        type: "unanalyzed",
      });
    }

    return segments;
  };

  const segments = generateAnalysisSegments();

  const getStatusConfig = () => {
    switch (analysisStatus) {
      case "pending":
        return {
          icon: <ScheduleIcon />,
          color: "#6B6B6B",
          bgColor: "#F7F7F7",
          label: "Pending",
          chipColor: "default" as const,
        };
      case "analyzing":
        return {
          icon: <CircularProgress size={16} />,
          color: "#F9A825",
          bgColor: "#FFF9E6",
          label: "Analyzing",
          chipColor: "warning" as const,
        };
      case "completed":
        return {
          icon: <CheckIcon />,
          color: "#4CAF50",
          bgColor: "#F1F8E9",
          label: "Completed",
          chipColor: "success" as const,
        };
      case "error":
        return {
          icon: <ErrorIcon />,
          color: "#FF4D4D",
          bgColor: "#FFEBEE",
          label: "Error",
          chipColor: "error" as const,
        };
    }
  };

  const statusConfig = getStatusConfig();

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const analysisPercentage =
    segments.length > 0
      ? Math.round(
          (segments
            .filter((s) => s.type === "analyzed")
            .reduce((acc, s) => acc + (s.end - s.start), 0) /
            video.duration) *
            100
        )
      : 0;

  return (
    <>
      <Card
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          position: "relative",
          borderRadius: "16px",
          border: "1px solid #F0F0F0",
          backgroundColor: "#FFFFFF",
          cursor: "pointer",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          "&:hover": {
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
            transform: "translateY(-4px)",
            borderColor: "#E0E0E0",
          },
          overflow: "visible",
        }}
      >
        {/* Video Thumbnail */}
        <Box
          sx={{ position: "relative", aspectRatio: "16/9", overflow: "hidden" }}
        >
          {video.thumbnail_path ? (
            <img
              src={video.thumbnail_path}
              alt={video.title}
              onError={(e) => {
                // Hide broken image and show fallback
                e.currentTarget.style.display = "none";
                const fallback = e.currentTarget
                  .nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = "flex";
              }}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "16px 16px 0 0",
                display: "block",
              }}
            />
          ) : null}

          {/* Fallback thumbnail - always present but hidden if real thumbnail loads */}
          <Box
            sx={{
              width: "100%",
              height: "100%",
              backgroundColor: "#F7F7F7",
              display: video.thumbnail_path ? "none" : "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "16px 16px 0 0",
              position: video.thumbnail_path ? "absolute" : "static",
              top: 0,
              left: 0,
              flexDirection: "column",
              gap: 1,
            }}
          >
            <VideoIcon sx={{ fontSize: 32, color: "#6B6B6B" }} />
            <Typography
              sx={{
                fontSize: "10px",
                color: "#6B6B6B",
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                textAlign: "center",
                px: 1,
              }}
            >
              No thumbnail
            </Typography>
          </Box>

          {/* Hover Overlay */}
          {isHovered && (
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "16px 16px 0 0",
                backdropFilter: "blur(4px)",
              }}
            >
              <IconButton
                onClick={() =>
                  analysisStatus === "completed"
                    ? onPlay(video)
                    : onAnalyze(video)
                }
                sx={{
                  backgroundColor: "#FFFFFF",
                  color: "#000000",
                  width: 56,
                  height: 56,
                  "&:hover": {
                    backgroundColor: "#F5F5F5",
                    transform: "scale(1.1)",
                  },
                  transition: "all 0.2s ease-in-out",
                }}
              >
                {analysisStatus === "completed" ? (
                  <PlayIcon sx={{ fontSize: 28 }} />
                ) : analysisStatus === "error" ? (
                  <RetryIcon sx={{ fontSize: 24 }} />
                ) : (
                  <AnalyzeIcon sx={{ fontSize: 24 }} />
                )}
              </IconButton>
            </Box>
          )}

          {/* Status Badge */}
          <Box
            sx={{
              position: "absolute",
              top: 12,
              right: 12,
              display: "flex",
              gap: 1,
            }}
          >
            <Chip
              icon={statusConfig.icon}
              label={statusConfig.label}
              size="small"
              sx={{
                backgroundColor: statusConfig.bgColor,
                color: statusConfig.color,
                border: `1px solid ${statusConfig.color}20`,
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontWeight: 500,
                fontSize: "11px",
                height: 24,
                "& .MuiChip-icon": {
                  fontSize: 14,
                  color: statusConfig.color,
                },
              }}
            />
          </Box>

          {/* Progress Indicator for Analyzing */}
          {analysisStatus === "analyzing" && (
            <Box
              sx={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 4,
                backgroundColor: "rgba(255, 255, 255, 0.3)",
              }}
            >
              <LinearProgress
                variant="determinate"
                value={jobProgress}
                sx={{
                  height: "100%",
                  backgroundColor: "transparent",
                  "& .MuiLinearProgress-bar": {
                    backgroundColor: "#F9A825",
                  },
                }}
              />
            </Box>
          )}
        </Box>

        {/* Card Content */}
        <CardContent sx={{ p: 2, pb: "12px !important" }}>
          {/* Title and Duration */}
          <Box sx={{ mb: 1.5 }}>
            <Typography
              variant="h6"
              sx={{
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontWeight: 500,
                fontSize: "14px",
                color: "#000000",
                lineHeight: 1.4,
                mb: 0.5,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                letterSpacing: "-0.01em",
              }}
            >
              {video.title}
            </Typography>
            <Typography
              sx={{
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontSize: "11px",
                color: "#6B6B6B",
                fontWeight: 400,
              }}
            >
              {formatDuration(video.duration)} • {timestamps.length} timestamp
              {timestamps.length !== 1 ? "s" : ""}
            </Typography>
          </Box>

          {/* Analysis Progress Bar */}
          <Box sx={{ mb: 1.5 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 0.5,
              }}
            >
              <Typography
                sx={{
                  fontSize: "10px",
                  color: "#6B6B6B",
                  fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Analysis Coverage
              </Typography>
              <Typography
                sx={{
                  fontSize: "10px",
                  color: "#000000",
                  fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                  fontWeight: 500,
                }}
              >
                {analysisPercentage}%
              </Typography>
            </Box>
            <Box
              sx={{
                height: 4,
                backgroundColor: "#F0F0F0",
                borderRadius: "4px",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {segments.map((segment, segmentIndex) => (
                <Box
                  key={segmentIndex}
                  sx={{
                    position: "absolute",
                    left: `${(segment.start / video.duration) * 100}%`,
                    width: `${
                      ((segment.end - segment.start) / video.duration) * 100
                    }%`,
                    height: "100%",
                    backgroundColor:
                      segment.type === "analyzed" ? "#4CAF50" : "#E0E0E0",
                    opacity: segment.confidence
                      ? Math.max(0.7, segment.confidence)
                      : 1,
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* Action Buttons */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box sx={{ display: "flex", gap: 1 }}>
              {timestamps.length > 0 && (
                <Chip
                  icon={<TimelineIcon />}
                  label={`${timestamps.length} tags`}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: "10px",
                    height: 24,
                    fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                    fontWeight: 400,
                    color: "#6B6B6B",
                    borderColor: "#E0E0E0",
                    "& .MuiChip-icon": {
                      fontSize: 12,
                      color: "#6B6B6B",
                    },
                  }}
                />
              )}
            </Box>

            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleContextMenu(e);
              }}
              sx={{
                color: "#6B6B6B",
                width: 28,
                height: 28,
                "&:hover": {
                  backgroundColor: "#F5F5F5",
                  color: "#000000",
                },
                transition: "all 0.2s ease-in-out",
              }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Box>
        </CardContent>
      </Card>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "#FFFFFF",
              border: "1px solid #F0F0F0",
              borderRadius: "12px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
              minWidth: 160,
            },
          },
        }}
      >
        <MenuItem
          onClick={handleRemoveClick}
          sx={{
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
            fontSize: "14px",
            color: "#FF4D4D",
            "&:hover": {
              backgroundColor: "#FFEBEE",
            },
          }}
        >
          <ListItemIcon>
            <RemoveIcon sx={{ color: "#FF4D4D", fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText
            primary="Remove from list"
            sx={{
              "& .MuiTypography-root": {
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontSize: "14px",
                fontWeight: 400,
              },
            }}
          />
        </MenuItem>
      </Menu>
    </>
  );
};

interface VideoAnalysisListProps {
  videos: Video[];
  videoTimestamps: Record<string, Timestamp[]>;
  analysisStatuses: Record<
    string,
    "pending" | "analyzing" | "completed" | "error"
  >;
  jobProgresses?: Record<string, number>;
  viewMode?: "grid" | "list";
  onPlay: (video: Video) => void;
  onAnalyze: (video: Video) => void;
  onRemove: (video: Video) => void;
}

const VideoAnalysisList: React.FC<VideoAnalysisListProps> = ({
  videos,
  videoTimestamps,
  analysisStatuses,
  jobProgresses = {},
  viewMode = "grid",
  onPlay,
  onAnalyze,
  onRemove,
}) => {
  // Create list item component for list view
  const VideoListItem: React.FC<{
    video: Video;
    timestamps: Timestamp[];
    analysisStatus: "pending" | "analyzing" | "completed" | "error";
    jobProgress: number;
  }> = ({ video, timestamps, analysisStatus, jobProgress }) => {
    const [contextMenu, setContextMenu] = useState<{
      mouseX: number;
      mouseY: number;
    } | null>(null);
    const [isHovered, setIsHovered] = useState(false);

    const handleContextMenu = (event: React.MouseEvent) => {
      event.preventDefault();
      setContextMenu(
        contextMenu === null
          ? {
              mouseX: event.clientX + 2,
              mouseY: event.clientY - 6,
            }
          : null
      );
    };

    const handleClose = () => {
      setContextMenu(null);
    };

    const handleRemoveClick = () => {
      onRemove(video);
      handleClose();
    };

    const getStatusConfig = () => {
      switch (analysisStatus) {
        case "pending":
          return {
            icon: <ScheduleIcon />,
            color: "#6B6B6B",
            bgColor: "#F7F7F7",
            label: "Pending",
          };
        case "analyzing":
          return {
            icon: <CircularProgress size={16} />,
            color: "#F9A825",
            bgColor: "#FFF9E6",
            label: "Analyzing",
          };
        case "completed":
          return {
            icon: <CheckIcon />,
            color: "#4CAF50",
            bgColor: "#F1F8E9",
            label: "Completed",
          };
        case "error":
          return {
            icon: <ErrorIcon />,
            color: "#FF4D4D",
            bgColor: "#FFEBEE",
            label: "Error",
          };
      }
    };

    const statusConfig = getStatusConfig();

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const generateAnalysisSegments = (): AnalysisSegment[] => {
      if (!timestamps.length) {
        return [{ start: 0, end: video.duration, type: "unanalyzed" }];
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
            type: "unanalyzed",
          });
        }

        segments.push({
          start: timestamp.start_time,
          end: timestamp.end_time || timestamp.start_time + 1,
          type: "analyzed",
          confidence: timestamp.confidence,
        });

        currentTime = timestamp.end_time || timestamp.start_time + 1;
      });

      if (currentTime < video.duration) {
        segments.push({
          start: currentTime,
          end: video.duration,
          type: "unanalyzed",
        });
      }

      return segments;
    };

    const segments = generateAnalysisSegments();
    const analysisPercentage =
      segments.length > 0
        ? Math.round(
            (segments
              .filter((s) => s.type === "analyzed")
              .reduce((acc, s) => acc + (s.end - s.start), 0) /
              video.duration) *
              100
          )
        : 0;

    return (
      <>
        <Box
          onContextMenu={handleContextMenu}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          sx={{
            display: "flex",
            alignItems: "center",
            p: 2,
            backgroundColor: "#FFFFFF",
            border: "1px solid #F0F0F0",
            borderRadius: "12px",
            cursor: "pointer",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:hover": {
              backgroundColor: "#F7F7F7",
              borderColor: "#E0E0E0",
              transform: "translateY(-1px)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
            },
          }}
        >
          {/* Thumbnail */}
          <Box
            sx={{
              position: "relative",
              width: 120,
              height: 68,
              borderRadius: "8px",
              overflow: "hidden",
              mr: 3,
              flexShrink: 0,
            }}
          >
            {video.thumbnail_path ? (
              <img
                src={video.thumbnail_path}
                alt={video.title}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget
                    .nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "flex";
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : null}

            <Box
              sx={{
                width: "100%",
                height: "100%",
                backgroundColor: "#F7F7F7",
                display: video.thumbnail_path ? "none" : "flex",
                alignItems: "center",
                justifyContent: "center",
                position: video.thumbnail_path ? "absolute" : "static",
                top: 0,
                left: 0,
              }}
            >
              <VideoIcon sx={{ fontSize: 24, color: "#6B6B6B" }} />
            </Box>

            {/* Play overlay */}
            {isHovered && (
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0, 0, 0, 0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backdropFilter: "blur(2px)",
                }}
              >
                <IconButton
                  onClick={() =>
                    analysisStatus === "completed"
                      ? onPlay(video)
                      : onAnalyze(video)
                  }
                  sx={{
                    backgroundColor: "#FFFFFF",
                    color: "#000000",
                    width: 32,
                    height: 32,
                    "&:hover": {
                      backgroundColor: "#F5F5F5",
                    },
                  }}
                >
                  {analysisStatus === "completed" ? (
                    <PlayIcon sx={{ fontSize: 18 }} />
                  ) : analysisStatus === "error" ? (
                    <RetryIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <AnalyzeIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </Box>
            )}
          </Box>

          {/* Content */}
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            {/* Title and metadata */}
            <Box sx={{ mb: 1 }}>
              <Typography
                sx={{
                  fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                  fontWeight: 500,
                  fontSize: "16px",
                  color: "#000000",
                  lineHeight: 1.4,
                  mb: 0.5,
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  letterSpacing: "-0.01em",
                }}
              >
                {video.title}
              </Typography>
              <Typography
                sx={{
                  fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                  fontSize: "12px",
                  color: "#6B6B6B",
                  fontWeight: 400,
                }}
              >
                {formatDuration(video.duration)} • {timestamps.length} timestamp
                {timestamps.length !== 1 ? "s" : ""}
              </Typography>
            </Box>

            {/* Progress bar */}
            <Box sx={{ mb: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 0.5,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "10px",
                    color: "#6B6B6B",
                    fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Analysis Coverage
                </Typography>
                <Typography
                  sx={{
                    fontSize: "10px",
                    color: "#000000",
                    fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                    fontWeight: 500,
                  }}
                >
                  {analysisPercentage}%
                </Typography>
              </Box>
              <Box
                sx={{
                  height: 3,
                  backgroundColor: "#F0F0F0",
                  borderRadius: "2px",
                  overflow: "hidden",
                  position: "relative",
                  maxWidth: 200,
                }}
              >
                {segments.map((segment, segmentIndex) => (
                  <Box
                    key={segmentIndex}
                    sx={{
                      position: "absolute",
                      left: `${(segment.start / video.duration) * 100}%`,
                      width: `${
                        ((segment.end - segment.start) / video.duration) * 100
                      }%`,
                      height: "100%",
                      backgroundColor:
                        segment.type === "analyzed" ? "#4CAF50" : "#E0E0E0",
                      opacity: segment.confidence
                        ? Math.max(0.7, segment.confidence)
                        : 1,
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>

          {/* Status and actions */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, ml: 2 }}>
            <Chip
              icon={statusConfig.icon}
              label={statusConfig.label}
              size="small"
              sx={{
                backgroundColor: statusConfig.bgColor,
                color: statusConfig.color,
                border: `1px solid ${statusConfig.color}20`,
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontWeight: 500,
                fontSize: "11px",
                height: 24,
                "& .MuiChip-icon": {
                  fontSize: 14,
                  color: statusConfig.color,
                },
              }}
            />

            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleContextMenu(e);
              }}
              sx={{
                color: "#6B6B6B",
                width: 28,
                height: 28,
                "&:hover": {
                  backgroundColor: "#F5F5F5",
                  color: "#000000",
                },
              }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Analyzing progress */}
          {analysisStatus === "analyzing" && (
            <Box
              sx={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 2,
                backgroundColor: "rgba(249, 168, 37, 0.2)",
              }}
            >
              <LinearProgress
                variant="determinate"
                value={jobProgress}
                sx={{
                  height: "100%",
                  backgroundColor: "transparent",
                  "& .MuiLinearProgress-bar": {
                    backgroundColor: "#F9A825",
                  },
                }}
              />
            </Box>
          )}
        </Box>

        {/* Context Menu */}
        <Menu
          open={contextMenu !== null}
          onClose={handleClose}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenu !== null
              ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
              : undefined
          }
          slotProps={{
            paper: {
              sx: {
                backgroundColor: "#FFFFFF",
                border: "1px solid #F0F0F0",
                borderRadius: "12px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
                minWidth: 160,
              },
            },
          }}
        >
          <MenuItem
            onClick={handleRemoveClick}
            sx={{
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              color: "#FF4D4D",
              "&:hover": {
                backgroundColor: "#FFEBEE",
              },
            }}
          >
            <ListItemIcon>
              <RemoveIcon sx={{ color: "#FF4D4D", fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText
              primary="Remove from list"
              sx={{
                "& .MuiTypography-root": {
                  fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                  fontSize: "14px",
                  fontWeight: 400,
                },
              }}
            />
          </MenuItem>
        </Menu>
      </>
    );
  };

  return (
    <Box sx={{ flexGrow: 1, overflow: "auto", p: 2 }}>
      {videos.length > 0 ? (
        <Box
          sx={{
            display: viewMode === "grid" ? "grid" : "flex",
            ...(viewMode === "grid"
              ? {
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 2,
                }
              : {
                  flexDirection: "column",
                  gap: 1.5,
                }),
            pb: 4,
          }}
        >
          {videos.map((video, index) =>
            viewMode === "grid" ? (
              <VideoAnalysisItem
                key={video.path}
                video={video}
                index={index}
                timestamps={videoTimestamps[video.path] || []}
                analysisStatus={analysisStatuses[video.path] || "pending"}
                jobProgress={jobProgresses[video.path] || 0}
                onPlay={onPlay}
                onAnalyze={onAnalyze}
                onRemove={onRemove}
              />
            ) : (
              <VideoListItem
                key={video.path}
                video={video}
                timestamps={videoTimestamps[video.path] || []}
                analysisStatus={analysisStatuses[video.path] || "pending"}
                jobProgress={jobProgresses[video.path] || 0}
              />
            )
          )}
        </Box>
      ) : (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "60vh",
            textAlign: "center",
          }}
        >
          <Avatar
            sx={{
              width: 64,
              height: 64,
              backgroundColor: "#F7F7F7",
              color: "#6B6B6B",
              mb: 3,
            }}
          >
            <VideoIcon sx={{ fontSize: 32 }} />
          </Avatar>
          <Typography
            variant="h5"
            sx={{
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontWeight: 500,
              color: "#000000",
              mb: 1,
              letterSpacing: "-0.01em",
            }}
          >
            No videos yet
          </Typography>
          <Typography
            sx={{
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              color: "#6B6B6B",
              maxWidth: 400,
              lineHeight: 1.5,
            }}
          >
            Add your first video to start analyzing and exploring AI-generated
            insights. Click the + button in the header to get started.
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default VideoAnalysisList;
