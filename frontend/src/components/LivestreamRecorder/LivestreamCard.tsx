import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
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
import { LiveKitConnectionConfig } from "@/services/livekitClient";

type LivestreamCardProps = {
  item: StreamInfo;
  onHide: (mint: string) => void;
};

const LivestreamCard: React.FC<LivestreamCardProps> = ({
  item,
  onHide,
}) => {
  const { 
    status, 
    startRecording, 
    stopRecording, 
    connectToRoom, 
    disconnectFromRoom, 
    isLoading 
  } = useLiveKitRecording(item.mint_id);
  
  const [imageError, setImageError] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [participantSid, setParticipantSid] = useState<string | null>(null);
  
  const progressWidth = `${Math.max(0, Math.min(100, status.progress))}%`;

  const marketCapLabel = useMemo(() => {
    try {
      return `$${(item.usd_market_cap ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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

  // Connect to LiveKit room when component mounts
  useEffect(() => {
    const connectToLiveKit = async () => {
      try {
        // Get complete connection details from backend using StreamManager
        const response = await fetch(`http://localhost:8000/api/live/connection/${item.mint_id}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to get connection details');
        }
        
        const connectionData = await response.json();
        
        if (!connectionData.success) {
          throw new Error(connectionData.error || 'Connection failed');
        }
        
        const config: LiveKitConnectionConfig = {
          url: connectionData.livekit_url,
          token: connectionData.token,
          roomName: connectionData.room_name
        };
        
        await connectToRoom(config);
        setIsConnected(true);
        setParticipantSid(connectionData.participant_sid);
        
        console.log(`✅ Connected to LiveKit room: ${connectionData.room_name}`);
        console.log(`📊 Stream data:`, connectionData.stream_data);
        console.log(`👤 Participant SID: ${connectionData.participant_sid}`);
      } catch (error) {
        console.error('Failed to connect to LiveKit:', error);
      }
    };

    connectToLiveKit();

    // Cleanup on unmount
    return () => {
      if (isConnected) {
        // Disconnect from backend StreamManager
        fetch(`http://localhost:8000/api/live/disconnect/${item.mint_id}`, {
          method: 'POST'
        }).catch(console.error);
        
        disconnectFromRoom();
      }
    };
  }, [item.mint_id, connectToRoom, disconnectFromRoom, isConnected]);

  const handleToggleRecord = async () => {
    if (status.isRecording) {
      await stopRecording();
    } else {
      // Use the participant SID from the backend StreamManager
      if (participantSid) {
        await startRecording(participantSid);
      } else {
        console.error('No participant SID available for recording');
      }
    }
  };

  const handleStopRecording = async () => {
    await stopRecording();
    handleClose();
  };

  return (
    <>
      <Card
        elevation={0}
        onContextMenu={handleContextMenu}
        sx={{
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
          border: "1px solid #F0F0F0",
          overflow: "hidden",
          position: "relative",
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
            transform: "translateY(-2px)",
          },
        }}
      >
      <Box sx={{ position: "relative" }}>
        {imageError || !item.thumbnail ? (
          <Box
            role="img"
            aria-label="No stream image"
            sx={{
              height: 160,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#F5F5F5",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#9E9E9E" }}>
              <LiveTvIcon />
              <Typography>No stream image</Typography>
            </Box>
          </Box>
        ) : (
          <CardMedia
            component="img"
            height="160"
            image={item.thumbnail}
            alt={item.name}
            onError={() => setImageError(true)}
            sx={{ objectFit: "cover" }}
          />
        )}

        {/* Live badge */}
        <Chip
          icon={<FiberManualRecordIcon sx={{ color: "#FF4D4D", fontSize: 10 }} />}
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
            <CloseIcon sx={{ color: "#FF4D4D", fontSize: 18, fontWeight: "bold" }} />
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
        {!status.isConnected && !status.error && (
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
          aria-label={status.isRecording ? "Stop recording" : "Start recording"}
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
            cursor: isLoading || !status.isConnected ? "not-allowed" : "pointer",
            pointerEvents: isLoading || !status.isConnected ? "none" : "auto",
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              backgroundColor: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}
          >
            <FiberManualRecordIcon sx={{ color: "#FF4D4D", animation: status.isRecording ? "pulse 1.5s infinite" : "none" }} />
          </Box>
        </Box>
      </Box>

      <CardContent sx={{ p: 2, position: "relative" }}>
        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
          {item.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {item.num_participants} viewers • {marketCapLabel}
        </Typography>

        {/* Recording status bar */}
        <Box sx={{ mt: 1.5 }}>
          <Box
            aria-live="polite"
            sx={{
              height: 8,
              borderRadius: 999,
              backgroundColor: status.error ? "#FFEBEE" : status.isRecording ? "#FFEBEE" : "#F0F0F0",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: status.isRecording ? progressWidth : 0,
                backgroundColor: "#FF4D4D",
                transition: "width 0.2s linear",
              }}
            />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.75 }}>
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
            ) : !status.isConnected ? (
              <>
                <Typography variant="caption" sx={{ color: "#FFA726" }}>
                  Connecting to LiveKit...
                </Typography>
              </>
            ) : (
              <>
                <FiberManualRecordIcon sx={{ color: status.isRecording ? "#FF4D4D" : "#9E9E9E", fontSize: 12 }} />
                <Typography variant="caption" sx={{ color: status.isRecording ? "#FF4D4D" : "#9E9E9E" }}>
                  {status.isRecording ? `Recording... ${status.duration}s` : "Ready to Record"}
                </Typography>
              </>
            )}
          </Box>
        </Box>

        {/* Action Buttons - positioned like VideoAnalysisList */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mt: 1.5,
          }}
        >
          <Box sx={{ display: "flex", gap: 1 }}>
            {/* Empty space for left side - could add chips here later */}
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

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
      `}</style>
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

export default LivestreamCard;


