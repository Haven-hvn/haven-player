import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  Snackbar,
  Alert,
  Badge,
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
  CloudUpload as UploadIcon,
  OpenInNew as OpenInNewIcon,
  ContentCopy as ContentCopyIcon,
  Download as DownloadIcon,
} from "@mui/icons-material";
import { Video, Timestamp, VideoGroup } from "@/types/video";
import TokenGroup from "@/components/TokenGroup";
import type { IpfsGatewayConfig } from "@/types/playback";
import {
  DEFAULT_IPFS_GATEWAY,
  buildIpfsGatewayUrl,
} from "@/services/playbackResolver";
import { loadGatewayConfig } from "@/services/playbackConfig";

interface AnalysisSegment {
  start: number;
  end: number;
  type: "analyzed" | "unanalyzed";
  confidence?: number;
}

type AnalysisStatus = "pending" | "analyzing" | "completed" | "error" | "downloading";

interface UploadStatusType {
  status: "pending" | "uploading" | "completed" | "error";
  progress: number;
  error?: string;
  rootCid?: string;
}

interface VideoAnalysisItemProps {
  video: Video;
  index: number;
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

// Memoized helper function for status config
const getStatusConfig = (analysisStatus: AnalysisStatus) => {
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
    case "downloading":
      return {
        icon: <DownloadIcon />,
        color: "#2196F3",
        bgColor: "#E3F2FD",
        label: "Downloading",
        chipColor: "info" as const,
      };
    default:
      return {
        icon: <ScheduleIcon />,
        color: "#6B6B6B",
        bgColor: "#F7F7F7",
        label: "Unknown",
        chipColor: "default" as const,
      };
  }
};

// Helper function for duration formatting
const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// Generate analysis segments from timestamps
const generateAnalysisSegments = (timestamps: Timestamp[], duration: number): AnalysisSegment[] => {
  if (!timestamps.length) {
    return [{ start: 0, end: duration, type: "unanalyzed" }];
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

  if (currentTime < duration) {
    segments.push({
      start: currentTime,
      end: duration,
      type: "unanalyzed",
    });
  }

  return segments;
};

// Memoized Video Analysis Item Component
const VideoAnalysisItem = React.memo<VideoAnalysisItemProps>(({
  video,
  index,
  timestamps,
  analysisStatus,
  jobProgress = 0,
  uploadStatus,
  gatewayConfig,
  onPlay,
  onAnalyze,
  onRemove,
  onUpload,
  onToggleShare,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [copyNotificationOpen, setCopyNotificationOpen] = useState(false);

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
      const { uri } = buildIpfsGatewayUrl(
        uploadStatus.rootCid,
        gatewayConfig
      );
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

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (analysisStatus === "completed") {
      onPlay(video);
    } else {
      onAnalyze(video);
    }
  }, [analysisStatus, onPlay, onAnalyze, video]);

  const handleUploadClick = useCallback(() => {
    if (onUpload) {
      onUpload(video);
      handleClose();
    }
  }, [onUpload, video, handleClose]);

  // Memoize expensive computations
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
        .filter((s) => s.type === "analyzed")
        .reduce((acc, s) => acc + (s.end - s.start), 0) /
        video.duration) *
        100
    );
  }, [segments, video.duration]);

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
          willChange: isHovered ? "transform, box-shadow" : "auto",
          "&:hover": {
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
            transform: "translateY(-4px)",
            borderColor: "#E0E0E0",
          },
          overflow: "visible",
          contain: "layout style paint",
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
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
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

          {/* Fallback thumbnail */}
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
                onClick={handlePlayClick}
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
                    width: `${((segment.end - segment.start) / video.duration) * 100}%`,
                    height: "100%",
                    backgroundColor: segment.type === "analyzed" ? "#4CAF50" : "#E0E0E0",
                    opacity: segment.confidence ? Math.max(0.7, segment.confidence) : 1,
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* Filecoin Upload Progress Bar */}
          {uploadStatus && uploadStatus.status !== 'pending' && (
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
                  Filecoin Upload
                </Typography>
                <Typography
                  sx={{
                    fontSize: "10px",
                    color: uploadStatus.status === 'error' ? "#FF4D4D" : uploadStatus.status === 'completed' ? "#4CAF50" : "#000000",
                    fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                    fontWeight: 500,
                  }}
                >
                  {uploadStatus.status === 'completed' ? 'Complete' : uploadStatus.status === 'error' ? 'Error' : `${uploadStatus.progress}%`}
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
                <Box
                  sx={{
                    position: "absolute",
                    left: 0,
                    width: `${uploadStatus.progress}%`,
                    height: "100%",
                    backgroundColor:
                      uploadStatus.status === 'error'
                        ? "#FF4D4D"
                        : uploadStatus.status === 'completed'
                        ? "#4CAF50"
                        : "#2196F3",
                    transition: "width 0.3s ease-in-out",
                  }}
                />
              </Box>
              {uploadStatus.status === 'error' && uploadStatus.error && (
                <Tooltip title={uploadStatus.error} arrow placement="top">
                  <Typography
                    sx={{
                      fontSize: "9px",
                      color: "#FF4D4D",
                      fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                      fontWeight: 400,
                      mt: 0.5,
                      lineHeight: 1.3,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      cursor: "help",
                    }}
                  >
                    {uploadStatus.error}
                  </Typography>
                </Tooltip>
              )}
              {uploadStatus.status === 'completed' && uploadStatus.rootCid && (
                <Tooltip 
                  title="Right-click the menu button (⋮) to access IPFS options" 
                  arrow 
                  placement="top"
                >
                  <Typography
                    sx={{
                      fontSize: "9px",
                      color: "#4CAF50",
                      fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                      fontWeight: 400,
                      mt: 0.5,
                      lineHeight: 1.3,
                      cursor: "help",
                    }}
                  >
                    ✓ Upload complete • Right-click menu for IPFS options
                  </Typography>
                </Tooltip>
              )}
            </Box>
          )}

          {/* Action Buttons */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box sx={{ display: "flex", gap: 1 }}>
              {video.arkiv_entity_key && video.arkiv_data_completeness && (
                <Chip
                  icon={
                    video.arkiv_data_completeness === "filecoin_and_vlm" ? (
                      <CheckIcon />
                    ) : video.arkiv_data_completeness === "filecoin_only" ? (
                      <UploadIcon />
                    ) : (
                      <TimelineIcon />
                    )
                  }
                  label={
                    video.arkiv_data_completeness === "filecoin_and_vlm"
                      ? "Full Arkiv Sync"
                      : video.arkiv_data_completeness === "filecoin_only"
                      ? "Arkiv CID Only"
                      : "Arkiv Tags Only"
                  }
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: "10px",
                    height: 24,
                    fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                    fontWeight: 400,
                    color:
                      video.arkiv_data_completeness === "filecoin_and_vlm"
                        ? "#4CAF50"
                        : "#FF9800",
                    borderColor:
                      video.arkiv_data_completeness === "filecoin_and_vlm"
                        ? "#4CAF50"
                        : "#FF9800",
                    "& .MuiChip-icon": {
                      fontSize: 12,
                      color:
                        video.arkiv_data_completeness === "filecoin_and_vlm"
                          ? "#4CAF50"
                          : "#FF9800",
                    },
                  }}
                />
              )}
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

            <Tooltip
              title={
                uploadStatus?.status === 'completed' && uploadStatus?.rootCid
                  ? "Right-click for options: Open Remote (IPFS) and Copy IPFS CID"
                  : "Right-click for options"
              }
              arrow
              placement="top"
            >
              <Badge
                badgeContent={uploadStatus?.status === 'completed' && uploadStatus?.rootCid ? 1 : 0}
                color="success"
                overlap="circular"
                sx={{
                  "& .MuiBadge-badge": {
                    width: 8,
                    height: 8,
                    minWidth: 8,
                    padding: 0,
                    right: 4,
                    top: 4,
                  },
                }}
              >
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
              </Badge>
            </Tooltip>
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
        {onUpload && (
          <MenuItem
            onClick={handleUploadClick}
            sx={{
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              color: "#000000",
              "&:hover": { backgroundColor: "#F5F5F5" },
            }}
          >
            <ListItemIcon>
              <UploadIcon sx={{ color: "#2196F3", fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText
              primary="Upload to Filecoin"
              sx={{
                "& .MuiTypography-root": {
                  fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                  fontSize: "14px",
                  fontWeight: 400,
                },
              }}
            />
          </MenuItem>
        )}
        {uploadStatus?.status === 'completed' && uploadStatus?.rootCid && (
          <MenuItem
            onClick={handleOpenRemote}
            sx={{
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              color: "#000000",
              "&:hover": { backgroundColor: "#F5F5F5" },
            }}
          >
            <ListItemIcon>
              <OpenInNewIcon sx={{ color: "#4CAF50", fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText
              primary="Open Remote (IPFS)"
              sx={{
                "& .MuiTypography-root": {
                  fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                  fontSize: "14px",
                  fontWeight: 400,
                },
              }}
            />
          </MenuItem>
        )}
        {uploadStatus?.status === 'completed' && uploadStatus?.rootCid && (
          <MenuItem
            onClick={handleCopyCid}
            sx={{
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              color: "#000000",
              "&:hover": { backgroundColor: "#F5F5F5" },
            }}
          >
            <ListItemIcon>
              <ContentCopyIcon sx={{ color: "#2196F3", fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText
              primary="Copy IPFS CID"
              sx={{
                "& .MuiTypography-root": {
                  fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                  fontSize: "14px",
                  fontWeight: 400,
                },
              }}
            />
          </MenuItem>
        )}
        <MenuItem
          onClick={handleRemoveClick}
          sx={{
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
            fontSize: "14px",
            color: "#FF4D4D",
            "&:hover": { backgroundColor: "#FFEBEE" },
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
      <Snackbar
        open={copyNotificationOpen}
        autoHideDuration={3000}
        onClose={() => setCopyNotificationOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setCopyNotificationOpen(false)}
          severity="success"
          sx={{ width: '100%' }}
        >
          IPFS CID copied to clipboard
        </Alert>
      </Snackbar>
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for React.memo
  return (
    prevProps.video.path === nextProps.video.path &&
    prevProps.video.title === nextProps.video.title &&
    prevProps.video.thumbnail_path === nextProps.video.thumbnail_path &&
    prevProps.analysisStatus === nextProps.analysisStatus &&
    prevProps.jobProgress === nextProps.jobProgress &&
    prevProps.timestamps.length === nextProps.timestamps.length &&
    prevProps.uploadStatus?.status === nextProps.uploadStatus?.status &&
    prevProps.uploadStatus?.progress === nextProps.uploadStatus?.progress
  );
});

// Memoized Video List Item Component for list view
const VideoListItem = React.memo<{
  video: Video;
  timestamps: Timestamp[];
  analysisStatus: AnalysisStatus;
  jobProgress: number;
  uploadStatus?: UploadStatusType;
  gatewayConfig: IpfsGatewayConfig;
  onPlay: (video: Video) => void;
  onAnalyze: (video: Video) => void;
  onRemove: (video: Video) => void;
  onUpload?: (video: Video) => void;
  onToggleShare?: (video: Video, share: boolean) => void;
}>(({ video, timestamps, analysisStatus, jobProgress, uploadStatus, gatewayConfig, onPlay, onAnalyze, onRemove, onUpload, onToggleShare }) => {
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [copyNotificationOpen, setCopyNotificationOpen] = useState(false);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu(contextMenu === null ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6 } : null);
  }, [contextMenu]);

  const handleClose = useCallback(() => setContextMenu(null), []);

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
        console.error('Failed to copy CID:', error);
      }
    }
  }, [uploadStatus?.rootCid, handleClose]);

  const statusConfig = useMemo(() => getStatusConfig(analysisStatus), [analysisStatus]);
  const segments = useMemo(() => generateAnalysisSegments(timestamps, video.duration), [timestamps, video.duration]);
  const analysisPercentage = useMemo(() => {
    if (segments.length === 0) return 0;
    return Math.round(
      (segments.filter((s) => s.type === "analyzed").reduce((acc, s) => acc + (s.end - s.start), 0) / video.duration) * 100
    );
  }, [segments, video.duration]);

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
          contain: "layout style paint",
          "&:hover": {
            backgroundColor: "#F7F7F7",
            borderColor: "#E0E0E0",
            transform: "translateY(-1px)",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
          },
        }}
      >
        {/* Thumbnail */}
        <Box sx={{ position: "relative", width: 120, height: 68, borderRadius: "8px", overflow: "hidden", mr: 3, flexShrink: 0 }}>
          {video.thumbnail_path ? (
            <img
              src={video.thumbnail_path}
              alt={video.title}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <Box sx={{ width: "100%", height: "100%", backgroundColor: "#F7F7F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <VideoIcon sx={{ fontSize: 24, color: "#6B6B6B" }} />
            </Box>
          )}
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
                onClick={(e) => {
                  e.stopPropagation();
                  analysisStatus === "completed" ? onPlay(video) : onAnalyze(video);
                }}
                sx={{ backgroundColor: "#FFFFFF", color: "#000000", width: 32, height: 32, "&:hover": { backgroundColor: "#F5F5F5" } }}
              >
                {analysisStatus === "completed" ? <PlayIcon sx={{ fontSize: 18 }} /> : <AnalyzeIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Box>
          )}
        </Box>

        {/* Content */}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ fontFamily: '"Inter", sans-serif', fontWeight: 500, fontSize: "16px", color: "#000000", mb: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {video.title}
          </Typography>
          <Typography sx={{ fontFamily: '"Inter", sans-serif', fontSize: "12px", color: "#6B6B6B" }}>
            {formatDuration(video.duration)} • {timestamps.length} timestamp{timestamps.length !== 1 ? "s" : ""}
          </Typography>
          <Box sx={{ mt: 1, height: 3, backgroundColor: "#F0F0F0", borderRadius: "2px", overflow: "hidden", position: "relative", maxWidth: 200 }}>
            {segments.map((segment, idx) => (
              <Box
                key={idx}
                sx={{
                  position: "absolute",
                  left: `${(segment.start / video.duration) * 100}%`,
                  width: `${((segment.end - segment.start) / video.duration) * 100}%`,
                  height: "100%",
                  backgroundColor: segment.type === "analyzed" ? "#4CAF50" : "#E0E0E0",
                }}
              />
            ))}
          </Box>
        </Box>

        {/* Status */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, ml: 2 }}>
          <Chip
            icon={statusConfig.icon}
            label={statusConfig.label}
            size="small"
            sx={{
              backgroundColor: statusConfig.bgColor,
              color: statusConfig.color,
              border: `1px solid ${statusConfig.color}20`,
              fontFamily: '"Inter", sans-serif',
              fontWeight: 500,
              fontSize: "11px",
              height: 24,
              "& .MuiChip-icon": { fontSize: 14, color: statusConfig.color },
            }}
          />
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleContextMenu(e); }} sx={{ color: "#6B6B6B", width: 28, height: 28 }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>

        {analysisStatus === "analyzing" && (
          <Box sx={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, backgroundColor: "rgba(249, 168, 37, 0.2)" }}>
            <LinearProgress variant="determinate" value={jobProgress} sx={{ height: "100%", backgroundColor: "transparent", "& .MuiLinearProgress-bar": { backgroundColor: "#F9A825" } }} />
          </Box>
        )}
      </Box>

      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu !== null ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
        slotProps={{ paper: { sx: { backgroundColor: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)", minWidth: 160 } } }}
      >
        {onUpload && (
          <MenuItem onClick={() => { onUpload(video); handleClose(); }} sx={{ fontFamily: '"Inter", sans-serif', fontSize: "14px" }}>
            <ListItemIcon><UploadIcon sx={{ color: "#2196F3", fontSize: 18 }} /></ListItemIcon>
            <ListItemText primary="Upload to Filecoin" />
          </MenuItem>
        )}
        {onToggleShare && (
          <MenuItem onClick={() => { onToggleShare(video, !video.share_to_arkiv); handleClose(); }} sx={{ fontFamily: '"Inter", sans-serif', fontSize: "14px" }}>
            <ListItemIcon><ContentCopyIcon sx={{ color: video.share_to_arkiv ? "#FF9800" : "#4CAF50", fontSize: 18 }} /></ListItemIcon>
            <ListItemText primary={video.share_to_arkiv ? "Keep Local Only" : "Share to Arkiv"} />
          </MenuItem>
        )}
        {uploadStatus?.status === 'completed' && uploadStatus?.rootCid && (
          <MenuItem onClick={handleOpenRemote} sx={{ fontFamily: '"Inter", sans-serif', fontSize: "14px" }}>
            <ListItemIcon><OpenInNewIcon sx={{ color: "#4CAF50", fontSize: 18 }} /></ListItemIcon>
            <ListItemText primary="Open Remote (IPFS)" />
          </MenuItem>
        )}
        {uploadStatus?.status === 'completed' && uploadStatus?.rootCid && (
          <MenuItem onClick={handleCopyCid} sx={{ fontFamily: '"Inter", sans-serif', fontSize: "14px" }}>
            <ListItemIcon><ContentCopyIcon sx={{ color: "#2196F3", fontSize: 18 }} /></ListItemIcon>
            <ListItemText primary="Copy IPFS CID" />
          </MenuItem>
        )}
        <MenuItem onClick={handleRemoveClick} sx={{ fontFamily: '"Inter", sans-serif', fontSize: "14px", color: "#FF4D4D" }}>
          <ListItemIcon><RemoveIcon sx={{ color: "#FF4D4D", fontSize: 18 }} /></ListItemIcon>
          <ListItemText primary="Remove from list" />
        </MenuItem>
      </Menu>
      <Snackbar open={copyNotificationOpen} autoHideDuration={3000} onClose={() => setCopyNotificationOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setCopyNotificationOpen(false)} severity="success" sx={{ width: '100%' }}>IPFS CID copied to clipboard</Alert>
      </Snackbar>
    </>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.video.path === nextProps.video.path &&
    prevProps.analysisStatus === nextProps.analysisStatus &&
    prevProps.jobProgress === nextProps.jobProgress &&
    prevProps.timestamps.length === nextProps.timestamps.length &&
    prevProps.uploadStatus?.status === nextProps.uploadStatus?.status
  );
});

interface VideoAnalysisListProps {
  videos: Video[];
  videoGroups?: VideoGroup[];
  videoTimestamps: Record<string, Timestamp[]>;
  analysisStatuses: Record<string, AnalysisStatus>;
  jobProgresses?: Record<string, number>;
  viewMode?: "grid" | "list";
  onPlay: (video: Video) => void;
  onAnalyze: (video: Video) => void;
  onRemove: (video: Video) => void;
  onUpload?: (video: Video) => void;
  uploadStatuses?: Record<string, UploadStatusType>;
  hiddenVideos?: Set<string>;
  searchQuery?: string;
  onToggleShare?: (video: Video, share: boolean) => void;
}

const VideoAnalysisList: React.FC<VideoAnalysisListProps> = ({
  videos,
  videoGroups,
  videoTimestamps,
  analysisStatuses,
  jobProgresses = {},
  viewMode = "grid",
  onPlay,
  onAnalyze,
  onRemove,
  onUpload,
  uploadStatuses = {},
  hiddenVideos = new Set(),
  searchQuery = "",
  onToggleShare,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [gatewayConfig, setGatewayConfig] = useState<IpfsGatewayConfig>({ baseUrl: DEFAULT_IPFS_GATEWAY });

  useEffect(() => {
    const fetchGateway = async () => {
      try {
        const config = await loadGatewayConfig();
        setGatewayConfig(config);
      } catch (error) {
        console.error("Failed to load gateway configuration:", error);
        setGatewayConfig({ baseUrl: DEFAULT_IPFS_GATEWAY });
      }
    };
    fetchGateway();
  }, []);

  // Calculate grid columns based on container width
  const columns = viewMode === "grid" ? 4 : 1;
  const rowHeight = viewMode === "grid" ? 320 : 100;
  const gap = viewMode === "grid" ? 16 : 12;

  // Virtualization for flat video list
  const rowCount = Math.ceil(videos.length / columns);
  
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan: 3,
  });

  // Filter video groups based on hidden videos and search query
  const filterVideoGroup = useCallback((group: VideoGroup): VideoGroup | null => {
    const visibleVideos = group.videos.filter((video) => !hiddenVideos.has(video.path));
    const filteredVideos = searchQuery.trim()
      ? visibleVideos.filter((video) => {
          const query = searchQuery.toLowerCase();
          const searchableFields = [
            video.title.toLowerCase(),
            video.path.toLowerCase(),
            ...(videoTimestamps[video.path]?.map((ts) => ts.tag_name.toLowerCase()) || []),
            group.token_info?.name?.toLowerCase() || "",
            group.token_info?.symbol?.toLowerCase() || "",
          ];
          return searchableFields.some((field) => field.includes(query));
        })
      : visibleVideos;

    if (filteredVideos.length === 0) return null;
    return { ...group, videos: filteredVideos, recording_count: filteredVideos.length };
  }, [hiddenVideos, searchQuery, videoTimestamps]);

  const useGroupedView = videoGroups && videoGroups.length > 0;
  const filteredGroups = useMemo(() => {
    return useGroupedView ? videoGroups.map(filterVideoGroup).filter((g): g is VideoGroup => g !== null) : [];
  }, [useGroupedView, videoGroups, filterVideoGroup]);

  // Render a single video item
  const renderVideoItem = useCallback((video: Video, index: number): React.ReactNode => {
    return viewMode === "grid" ? (
      <VideoAnalysisItem
        key={video.path}
        video={video}
        index={index}
        timestamps={videoTimestamps[video.path] || []}
        analysisStatus={analysisStatuses[video.path] || "pending"}
        jobProgress={jobProgresses[video.path] || 0}
        uploadStatus={uploadStatuses[video.path]}
        gatewayConfig={gatewayConfig}
        onPlay={onPlay}
        onAnalyze={onAnalyze}
        onRemove={onRemove}
        onUpload={onUpload}
        onToggleShare={onToggleShare}
      />
    ) : (
      <VideoListItem
        key={video.path}
        video={video}
        timestamps={videoTimestamps[video.path] || []}
        analysisStatus={analysisStatuses[video.path] || "pending"}
        jobProgress={jobProgresses[video.path] || 0}
        uploadStatus={uploadStatuses[video.path]}
        gatewayConfig={gatewayConfig}
        onPlay={onPlay}
        onAnalyze={onAnalyze}
        onRemove={onRemove}
        onUpload={onUpload}
        onToggleShare={onToggleShare}
      />
    );
  }, [viewMode, videoTimestamps, analysisStatuses, jobProgresses, uploadStatuses, gatewayConfig, onPlay, onAnalyze, onRemove, onUpload, onToggleShare]);

  // Empty state
  if (videos.length === 0 && (!useGroupedView || filteredGroups.length === 0)) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", textAlign: "center" }}>
        <Avatar sx={{ width: 64, height: 64, backgroundColor: "#F7F7F7", color: "#6B6B6B", mb: 3 }}>
          <VideoIcon sx={{ fontSize: 32 }} />
        </Avatar>
        <Typography variant="h5" sx={{ fontFamily: '"Inter", sans-serif', fontWeight: 500, color: "#000000", mb: 1 }}>
          No videos yet
        </Typography>
        <Typography sx={{ fontFamily: '"Inter", sans-serif', fontSize: "14px", color: "#6B6B6B", maxWidth: 400, lineHeight: 1.5 }}>
          Add your first video to start analyzing and exploring AI-generated insights. Click the + button in the header to get started.
        </Typography>
      </Box>
    );
  }

  // Grouped view (with TokenGroup)
  if (useGroupedView && filteredGroups.length > 0) {
    return (
      <Box sx={{ flexGrow: 1, overflow: "auto", p: 2, contain: "strict" }}>
        <Box sx={{ pb: 4 }}>
          {filteredGroups.map((group, groupIndex) => (
            <TokenGroup
              key={group.token_info?.mint_id || `other-${groupIndex}`}
              group={group}
              videoTimestamps={videoTimestamps}
              analysisStatuses={analysisStatuses}
              jobProgresses={jobProgresses}
              viewMode={viewMode}
              onPlay={onPlay}
              onAnalyze={onAnalyze}
              onRemove={onRemove}
              onUpload={onUpload}
              uploadStatuses={uploadStatuses}
              renderVideoItem={renderVideoItem}
            />
          ))}
        </Box>
      </Box>
    );
  }

  // Virtualized flat list/grid view
  return (
    <Box
      ref={parentRef}
      sx={{
        flexGrow: 1,
        overflow: "auto",
        p: 2,
        height: "100%",
        contain: "strict",
      }}
    >
      <Box
        sx={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowVideos = videos.slice(startIndex, startIndex + columns);

          return (
            <Box
              key={virtualRow.key}
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                display: viewMode === "grid" ? "grid" : "flex",
                ...(viewMode === "grid"
                  ? {
                      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: `${gap}px`,
                    }
                  : {
                      flexDirection: "column",
                      gap: `${gap}px`,
                    }),
              }}
            >
              {rowVideos.map((video, colIndex) => renderVideoItem(video, startIndex + colIndex))}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default VideoAnalysisList;
