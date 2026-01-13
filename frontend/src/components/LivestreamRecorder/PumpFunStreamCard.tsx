import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardMedia,
  Box,
  Typography,
  Chip,
  IconButton,
  Button,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import {
  LiveTv as LiveTvIcon,
  FiberManualRecord as RecordIcon,
  CheckCircle as SubscribedIcon,
  Circle as NotSubscribedIcon,
  People as PeopleIcon,
  AttachMoney as MarketCapIcon,
} from "@mui/icons-material";
import { PumpFunStream, PumpFunSubscription } from "@/types/plugin";

export interface PumpFunStreamCardProps {
  stream: PumpFunStream;
  subscription?: PumpFunSubscription;
  isSubscribing: boolean;
  isUnsubscribing: boolean;
  onSubscribe: (stream: PumpFunStream, priority?: number) => Promise<void>;
  onUnsubscribe: (stream: PumpFunStream) => Promise<void>;
  onUpdateSubscription: (subscription: PumpFunSubscription, updates: Partial<PumpFunSubscription>) => Promise<void>;
}

const PumpFunStreamCard: React.FC<PumpFunStreamCardProps> = ({
  stream,
  subscription,
  isSubscribing,
  isUnsubscribing,
  onSubscribe,
  onUnsubscribe,
  onUpdateSubscription,
}) => {
  const [priorityValue, setPriorityValue] = useState<string>(subscription?.priority?.toString() || "5");
  const [editingPriority, setEditingPriority] = useState<boolean>(false);

  const isSubscribed = Boolean(subscription);
  const isEnabled = subscription?.enabled ?? true;
  const isRecording = subscription?.is_currently_recording ?? false;

  const handlePriorityChange = async (newPriority: string) => {
    const priorityNum = parseInt(newPriority, 10);
    if (!isNaN(priorityNum) && priorityNum >= 0 && priorityNum <= 10 && subscription) {
      try {
        await onUpdateSubscription(subscription, { priority: priorityNum });
        setPriorityValue(newPriority);
      } catch (error) {
        console.error("Failed to update priority:", error);
      }
    }
  };

  const handleToggleSubscription = async () => {
    if (isSubscribed) {
      await onUnsubscribe(stream);
    } else {
      await onSubscribe(stream);
    }
  };

  const handleToggleEnabled = async () => {
    if (subscription) {
      await onUpdateSubscription(subscription, { enabled: !isEnabled });
    }
  };

  return (
    <Card
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        border: isRecording ? "2px solid #4CAF50" : "1px solid #E0E0E0",
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
          transform: "translateY(-2px)",
        },
      }}
    >
      {/* Thumbnail */}
      <Box sx={{ position: "relative" }}>
        <CardMedia
          component="img"
          height="140"
          image={stream.thumbnail || "https://via.placeholder.com/300x140?text=No+Thumbnail"}
          alt={stream.name}
          sx={{
            objectFit: "cover",
            backgroundColor: "#F5F5F5",
          }}
        />
        {/* Live indicator */}
        {stream.is_currently_live && (
          <Chip
            icon={<LiveTvIcon />}
            label="LIVE"
            size="small"
            sx={{
              position: "absolute",
              top: 8,
              left: 8,
              backgroundColor: "#DC2626",
              color: "white",
              fontWeight: "bold",
            }}
          />
        )}
        {/* Recording indicator */}
        {isRecording && (
          <Chip
            icon={<RecordIcon />}
            label="RECORDING"
            size="small"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              backgroundColor: "#4CAF50",
              color: "white",
              fontWeight: "bold",
            }}
          />
        )}
      </Box>

      <CardContent sx={{ flexGrow: 1 }}>
        {/* Header with name and subscribe status */}
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 2 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "1rem", mb: 0.5 }} noWrap>
              {stream.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {stream.symbol} • {stream.stream_id.slice(0, 8)}...
            </Typography>
          </Box>
          {isSubscribed && (
            <Chip
              icon={<SubscribedIcon fontSize="small" />}
              label="Subscribed"
              size="small"
              sx={{
                backgroundColor: "#10B981", // Green for subscribed
                color: "white",
                fontWeight: 500,
              }}
            />
          )}
        </Box>

        {/* Market Cap */}
        {stream.market_cap && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
            <MarketCapIcon fontSize="small" sx={{ color: "#6B7280" }} />
            <Typography variant="body2" color="text.secondary">
              Market Cap: ${stream.market_cap.toLocaleString()}
            </Typography>
          </Box>
        )}

        {/* Participants */}
        {stream.num_participants !== undefined && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
            <PeopleIcon fontSize="small" sx={{ color: "#6B7280" }} />
            <Typography variant="body2" color="text.secondary">
              {stream.num_participants.toLocaleString()} participants
            </Typography>
          </Box>
        )}

        {/* Priority (if subscribed) */}
        {isSubscribed && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom sx={{ display: "block" }}>
              Priority:
            </Typography>
            {editingPriority ? (
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={priorityValue}
                  onChange={(e) => setPriorityValue(e.target.value)}
                  onBlur={() => {
                    handlePriorityChange(priorityValue);
                    setEditingPriority(false);
                  }}
                  style={{
                    width: 40,
                    padding: "2px 4px",
                    fontSize: "0.875rem",
                    border: "1px solid #E0E0E0",
                    borderRadius: 4,
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  (0-10)
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: i < (subscription?.priority || 5) ? "#3B82F6" : "#E5E7EB",
                    }}
                  />
                ))}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ cursor: "pointer" }}
                  onClick={() => setEditingPriority(true)}
                >
                  ({subscription?.priority})
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </CardContent>

      {/* Action buttons */}
      <Box sx={{ p: 1.5, borderTop: "1px solid #F0F0F0", display: "flex", gap: 1 }}>
        {isSubscribed ? (
          <>
            <Button
              variant={isEnabled ? "contained" : "outlined"}
              color={isEnabled ? "success" : "inherit"}
              onClick={handleToggleEnabled}
              size="small"
              sx={{ fontSize: "0.7rem", flex: 1 }}
              disabled={isSubscribing || isUnsubscribing}
            >
              {isEnabled ? "Enabled" : "Disabled"}
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={handleToggleSubscription}
              size="small"
              startIcon={isUnsubscribing ? <CircularProgress size={12} /> : undefined}
              sx={{ fontSize: "0.7rem", flex: 1 }}
              disabled={isSubscribing || isUnsubscribing}
            >
              {isUnsubscribing ? "Unsubscribing..." : "Unsubscribe"}
            </Button>
          </>
        ) : (
          <Button
            variant="contained"
            color="primary"
            onClick={handleToggleSubscription}
            size="small"
            startIcon={isSubscribing ? <CircularProgress size={12} /> : undefined}
            fullWidth
            sx={{ fontSize: "0.7rem" }}
            disabled={isSubscribing || isUnsubscribing}
          >
            {isSubscribing ? "Subscribing..." : "Subscribe"}
          </Button>
        )}
      </Box>
    </Card>
  );
};

export default PumpFunStreamCard;