import React, { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  Avatar,
  Chip,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Token as TokenIcon,
} from "@mui/icons-material";
import { VideoGroup, TokenGroupInfo } from "@/types/video";

interface TokenGroupProps {
  group: VideoGroup;
  videoTimestamps: Record<string, any[]>;
  analysisStatuses: Record<string, "pending" | "analyzing" | "completed" | "error">;
  jobProgresses: Record<string, number>;
  viewMode: "grid" | "list";
  onPlay: (video: any) => void;
  onAnalyze: (video: any) => void;
  onRemove: (video: any) => void;
  onUpload?: (video: any) => void;
  uploadStatuses?: Record<string, any>;
  renderVideoItem: (video: any, index: number) => React.ReactNode;
}

const TokenGroupComponent: React.FC<TokenGroupProps> = ({
  group,
  videoTimestamps,
  analysisStatuses,
  jobProgresses,
  viewMode,
  onPlay,
  onAnalyze,
  onRemove,
  onUpload,
  uploadStatuses,
  renderVideoItem,
}) => {
  const [expanded, setExpanded] = useState(true);

  const tokenInfo = group.token_info;
  const isOtherVideos = !tokenInfo;

  // Format latest recording date
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    } catch {
      return "";
    }
  };

  // Get display name for token
  const getDisplayName = (): string => {
    if (isOtherVideos) {
      return "Other Videos";
    }
    if (tokenInfo?.name && tokenInfo?.symbol) {
      return `${tokenInfo.name} (${tokenInfo.symbol})`;
    }
    if (tokenInfo?.name) {
      return tokenInfo.name;
    }
    if (tokenInfo?.symbol) {
      return tokenInfo.symbol;
    }
    // Fallback to truncated mint_id
    return `${tokenInfo.mint_id.slice(0, 8)}...`;
  };

  // Get display subtitle
  const getSubtitle = (): string => {
    const parts: string[] = [];
    if (group.recording_count > 0) {
      parts.push(`${group.recording_count} recording${group.recording_count !== 1 ? "s" : ""}`);
    }
    if (group.latest_recording_date) {
      parts.push(`Latest: ${formatDate(group.latest_recording_date)}`);
    }
    return parts.join(" • ");
  };

  return (
    <Box
      sx={{
        mb: 3,
        border: "1px solid #F0F0F0",
        borderRadius: "12px",
        backgroundColor: "#FFFFFF",
        overflow: "hidden",
      }}
    >
      {/* Group Header */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: "flex",
          alignItems: "center",
          p: 2,
          cursor: "pointer",
          backgroundColor: "#FAFAFA",
          borderBottom: expanded ? "1px solid #F0F0F0" : "none",
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            backgroundColor: "#F5F5F5",
          },
        }}
      >
        {/* Token Avatar/Icon */}
        <Box sx={{ mr: 2, display: "flex", alignItems: "center" }}>
          {tokenInfo?.thumbnail || tokenInfo?.image_uri ? (
            <Avatar
              src={tokenInfo.thumbnail || tokenInfo.image_uri || undefined}
              alt={getDisplayName()}
              sx={{
                width: 40,
                height: 40,
                backgroundColor: "#F7F7F7",
              }}
            >
              <TokenIcon />
            </Avatar>
          ) : (
            <Avatar
              sx={{
                width: 40,
                height: 40,
                backgroundColor: "#F7F7F7",
                color: "#6B6B6B",
              }}
            >
              <TokenIcon />
            </Avatar>
          )}
        </Box>

        {/* Token Info */}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontWeight: 500,
              fontSize: "16px",
              color: "#000000",
              mb: 0.5,
              lineHeight: 1.4,
            }}
          >
            {getDisplayName()}
          </Typography>
          <Typography
            sx={{
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "12px",
              color: "#6B6B6B",
              fontWeight: 400,
            }}
          >
            {getSubtitle()}
          </Typography>
          {tokenInfo?.mint_id && (
            <Typography
              sx={{
                fontSize: "11px",
                color: "#9E9E9E",
                fontWeight: 400,
                mt: 0.5,
                fontFamily: "monospace",
              }}
            >
              {tokenInfo.mint_id.slice(0, 8)}...{tokenInfo.mint_id.slice(-6)}
            </Typography>
          )}
        </Box>

        {/* Expand/Collapse Icon */}
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          sx={{
            color: "#6B6B6B",
            "&:hover": {
              backgroundColor: "#F0F0F0",
            },
          }}
        >
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {/* Grouped Videos */}
      <Collapse in={expanded}>
        <Box
          sx={{
            p: 2,
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
          }}
        >
          {group.videos.map((video, index) =>
            renderVideoItem(video, index)
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

export default TokenGroupComponent;

