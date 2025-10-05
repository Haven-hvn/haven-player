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
} from "@mui/icons-material";

export type LivestreamItem = {
  mint: string;
  name: string;
  symbol: string;
  thumbnail: string;
  num_participants: number;
  last_reply: number;
  usd_market_cap: number;
};

type LivestreamCardProps = {
  item: LivestreamItem;
  isRecording: boolean;
  progress: number; // 0..100
  onToggleRecord: (mint: string) => void;
  onHide: (mint: string) => void;
};

const LivestreamCard: React.FC<LivestreamCardProps> = ({
  item,
  isRecording,
  progress,
  onToggleRecord,
  onHide,
}) => {
  const [imageError, setImageError] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const progressWidth = `${Math.max(0, Math.min(100, progress))}%`;

  const marketCapLabel = useMemo(() => {
    try {
      return `$${item.usd_market_cap.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    } catch {
      return `$${Math.round(item.usd_market_cap)}`;
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
    onHide(item.mint);
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

        {/* Three dots menu */}
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleContextMenu(e);
          }}
          sx={{
            position: "absolute",
            top: 8,
            left: 8,
            color: "#6B6B6B",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            width: 32,
            height: 32,
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 1)",
              color: "#000000",
            },
            transition: "all 0.2s ease-in-out",
          }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>

        {/* Hover overlay REC */}
        <Box
          role="button"
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          onClick={() => onToggleRecord(item.mint)}
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
            cursor: "pointer",
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
            <FiberManualRecordIcon sx={{ color: "#FF4D4D", animation: "pulse 1.5s infinite" }} />
          </Box>
        </Box>
      </Box>

      <CardContent sx={{ p: 2 }}>
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
              backgroundColor: isRecording ? "#FFEBEE" : "#F0F0F0",
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
                width: isRecording ? progressWidth : 0,
                backgroundColor: "#FF4D4D",
                transition: "width 0.2s linear",
              }}
            />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.75 }}>
            <FiberManualRecordIcon sx={{ color: isRecording ? "#FF4D4D" : "#9E9E9E", fontSize: 12 }} />
            <Typography variant="caption" sx={{ color: isRecording ? "#FF4D4D" : "#9E9E9E" }}>
              {isRecording ? "Recording..." : "Ready to Record"}
            </Typography>
          </Box>
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


