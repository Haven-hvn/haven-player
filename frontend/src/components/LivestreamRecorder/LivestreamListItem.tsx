import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import {
  LiveTv as LiveTvIcon,
  FiberManualRecord as FiberManualRecordIcon,
  MoreVert as MoreVertIcon,
  RemoveCircleOutline as RemoveIcon,
  ErrorOutline as ErrorIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { StreamInfo } from "@/types/video";
import { useLiveKitRecording } from "@/hooks/useLiveKitRecording";
import { LiveKitConnectionConfig, liveKitClient } from "@/services/livekitClient";

type LivestreamListItemProps = {
  item: StreamInfo;
  onHide: (mint: string) => void;
};

const LivestreamListItem: React.FC<LivestreamListItemProps> = ({
  item,
  onHide,
}) => {
  const {
    status,
    startRecording,
    stopRecording,
    connectToRoom,
    disconnectFromRoom,
    isLoading,
  } = useLiveKitRecording(item.mint_id);

  const [imageError, setImageError] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [participantSid, setParticipantSid] = useState<string | null>(null);

  const marketCapLabel = useMemo(() => {
    try {
      return `$${(item.usd_market_cap ?? 0).toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })}`;
    } catch {
      return `$${Math.round(item.usd_market_cap ?? 0)}`;
    }
  }, [item.usd_market_cap]);

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

  const handleHideClick = () => {
    onHide(item.mint_id);
    handleClose();
  };

  // Cleanup on unmount - only disconnect frontend viewing connection
  useEffect(() => {
    return () => {
      if (isConnected) {
        disconnectFromRoom();
      }
    };
  }, [item.mint_id, disconnectFromRoom, isConnected]);

  // Separate handler for connecting
  const handleConnect = async () => {
    if (status.isConnected || isLoading) return;

    try {
      const response = await fetch(
        `http://localhost:8000/api/live/connection/${item.mint_id}`
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail || "Failed to get connection details"
        );
      }

      const connectionData = await response.json();

      if (!connectionData.success) {
        throw new Error(connectionData.error || "Connection failed");
      }

      const config: LiveKitConnectionConfig = {
        url: connectionData.livekit_url,
        token: connectionData.token,
        roomName: connectionData.room_name,
      };

      await connectToRoom(config);
      setIsConnected(true);
      setParticipantSid(connectionData.participant_sid);
    } catch (error) {
      console.error("Failed to connect:", error);
      setIsConnected(false);
    }
  };

  // Handler for starting/stopping recording
  const handleToggleRecord = async () => {
    if (status.isRecording) {
      await stopRecording();
    } else {
      try {
        await startRecording("backend-handled");
      } catch (recordingError) {
        console.error("Failed to start recording:", recordingError);
      }
    }
  };

  const handleStopRecording = async () => {
    handleClose();

    try {
      await stopRecording();

      if (isConnected) {
        fetch(`http://localhost:8000/api/live/disconnect/${item.mint_id}`, {
          method: "POST",
        }).catch(console.error);
        await disconnectFromRoom();
        setIsConnected(false);
        setParticipantSid(null);
      }
    } catch (error) {
      console.error(`Error stopping recording for ${item.mint_id}:`, error);
    }
  };

  return (
    <>
      <Box
        onContextMenu={handleContextMenu}
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
          position: "relative",
        }}
      >
        {/* Thumbnail */}
        <Box
          sx={{
            position: "relative",
            width: 160,
            height: 90,
            borderRadius: "8px",
            overflow: "hidden",
            mr: 3,
            flexShrink: 0,
          }}
        >
          {imageError || !item.thumbnail ? (
            <Box
              role="img"
              aria-label="No stream image"
              sx={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#F5F5F5",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  color: "#9E9E9E",
                }}
              >
                <LiveTvIcon />
                <Typography variant="caption">No stream image</Typography>
              </Box>
            </Box>
          ) : (
            <Box
              component="img"
              src={item.thumbnail}
              alt={item.name}
              onError={() => setImageError(true)}
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          )}

          {/* Live badge */}
          <Chip
            icon={
              <FiberManualRecordIcon sx={{ color: "#FF4D4D", fontSize: 10 }} />
            }
            label="Live"
            size="small"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              backgroundColor: "#FFEBEE",
              color: "#FF4D4D",
              border: "1px solid #FF4D4D20",
              fontWeight: 600,
            }}
          />

          {/* Error indicator */}
          {status.error && (
            <Box
              sx={{
                position: "absolute",
                top: 8,
                left: 8,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                backgroundColor: "#FFF",
                borderRadius: "20px",
                padding: "4px 10px",
                border: "2px solid #FF4D4D",
                boxShadow: "0 2px 8px rgba(255, 77, 77, 0.2)",
              }}
            >
              <CloseIcon
                sx={{ color: "#FF4D4D", fontSize: 18, fontWeight: "bold" }}
              />
              <Typography
                variant="caption"
                sx={{
                  color: "#FF4D4D",
                  fontWeight: 700,
                  fontSize: "11px",
                  letterSpacing: "0.5px",
                }}
              >
                ERROR
              </Typography>
            </Box>
          )}

          {/* Connection status indicator */}
          {isLoading && !status.isConnected && !status.error && (
            <Box
              sx={{
                position: "absolute",
                top: 8,
                left: 8,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                backgroundColor: "#FFF",
                borderRadius: "20px",
                padding: "4px 10px",
                border: "2px solid #FFA726",
                boxShadow: "0 2px 8px rgba(255, 167, 38, 0.2)",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: "#FFA726",
                  fontWeight: 700,
                  fontSize: "11px",
                  letterSpacing: "0.5px",
                }}
              >
                CONNECTING...
              </Typography>
            </Box>
          )}

          {/* Hover overlay REC */}
          <Box
            role="button"
            aria-label={
              status.isRecording ? "Stop recording" : "Start recording"
            }
            onClick={handleToggleRecord}
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0,
              transition: "opacity 0.2s ease-in-out",
              background: "rgba(0,0,0,0.0)",
              "&:hover": {
                opacity: 1,
                background: "rgba(0,0,0,0.6)",
              },
              cursor: isLoading ? "not-allowed" : "pointer",
              pointerEvents: isLoading ? "none" : "auto",
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                backgroundColor: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              }}
            >
              <FiberManualRecordIcon
                sx={{
                  color: "#FF4D4D",
                  animation: status.isRecording ? "pulse 1.5s infinite" : "none",
                }}
              />
            </Box>
          </Box>
        </Box>

        {/* Content */}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {/* Title and metadata */}
          <Box sx={{ mb: 1 }}>
            <Typography
              sx={{
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontWeight: 600,
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
              {item.name}
            </Typography>
            <Typography
              sx={{
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontSize: "12px",
                color: "#6B6B6B",
                fontWeight: 400,
              }}
            >
              {item.symbol} • {item.num_participants} viewers • {marketCapLabel}
            </Typography>
            {item.mint_id && (
              <Typography
                sx={{
                  fontFamily: "monospace",
                  fontSize: "11px",
                  color: "#9E9E9E",
                  fontWeight: 400,
                  mt: 0.5,
                }}
              >
                {item.mint_id.slice(0, 8)}...{item.mint_id.slice(-8)}
              </Typography>
            )}
          </Box>

          {/* Recording status bar */}
          <Box sx={{ mt: 1 }}>
            <Box
              aria-live="polite"
              sx={{
                height: 6,
                borderRadius: 999,
                backgroundColor: status.error
                  ? "#FFEBEE"
                  : status.isRecording
                  ? "#FFEBEE"
                  : "#F0F0F0",
                overflow: "hidden",
                position: "relative",
                maxWidth: 300,
              }}
            >
              {status.isRecording && (
                <Box
                  sx={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    width: "30%",
                    backgroundColor: "#FF4D4D",
                    animation: "oscillate 2s ease-in-out infinite",
                  }}
                />
              )}
            </Box>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}
            >
              {status.error ? (
                <>
                  <ErrorIcon sx={{ color: "#FF4D4D", fontSize: 14 }} />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#FF4D4D",
                      fontSize: "11px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={status.error}
                  >
                    {status.error}
                  </Typography>
                </>
              ) : status.isFinalizing ? (
                <>
                  <Typography variant="caption" sx={{ color: "#FFA726" }}>
                    Finalizing recording...
                  </Typography>
                </>
              ) : isLoading ? (
                <>
                  <Typography variant="caption" sx={{ color: "#FFA726" }}>
                    Connecting to LiveKit...
                  </Typography>
                </>
              ) : status.isRecording ? (
                <>
                  <FiberManualRecordIcon
                    sx={{ color: "#FF4D4D", fontSize: 12 }}
                  />
                  <Typography variant="caption" sx={{ color: "#FF4D4D" }}>
                    Recording... {status.duration}s
                  </Typography>
                </>
              ) : (
                <>
                  <FiberManualRecordIcon
                    sx={{ color: "#9E9E9E", fontSize: 12 }}
                  />
                  <Typography variant="caption" sx={{ color: "#9E9E9E" }}>
                    Ready to Record
                  </Typography>
                </>
              )}
            </Box>
          </Box>
        </Box>

        {/* Actions */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: 2 }}>
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

        <style>{`
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.15); }
            100% { transform: scale(1); }
          }
          @keyframes oscillate {
            0% { left: 0%; }
            50% { left: 70%; }
            100% { left: 0%; }
          }
        `}</style>
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
              borderRadius: "8px",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
              border: "1px solid #E0E0E0",
              minWidth: 180,
            },
          },
        }}
      >
        {status.isRecording && (
          <MenuItem
            onClick={handleStopRecording}
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
              <FiberManualRecordIcon sx={{ color: "#FF4D4D", fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText
              primary="Stop Recording"
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
          onClick={handleHideClick}
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
            <RemoveIcon sx={{ color: "#FF4D4D", fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary="Hide livestream from list"
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

export default LivestreamListItem;

