import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
  TextField,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  People as PeopleIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import PumpFunStreamCard from "./PumpFunStreamCard";
import SubscriptionsPanel from "./SubscriptionsPanel";
import { PumpFunStream, PumpFunSubscription } from "@/types/plugin";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

interface PumpFunStreamsViewProps {
  pluginName: string;
  streams: PumpFunStream[];
  subscriptions: PumpFunSubscription[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onSubscribe: (stream: PumpFunStream, priority?: number) => Promise<void>;
  onUnsubscribe: (stream: PumpFunStream) => Promise<void>;
  onUpdateSubscription: (subscription: PumpFunSubscription, updates: Partial<PumpFunSubscription>) => Promise<void>;
}

// Memoized stream card component
const MemoizedPumpFunStreamCard = React.memo(PumpFunStreamCard, (prevProps, nextProps) => {
  return (
    prevProps.stream.stream_id === nextProps.stream.stream_id &&
    prevProps.stream.is_currently_live === nextProps.stream.is_currently_live &&
    prevProps.stream.num_participants === nextProps.stream.num_participants &&
    prevProps.subscription?.enabled === nextProps.subscription?.enabled &&
    prevProps.isSubscribing === nextProps.isSubscribing &&
    prevProps.isUnsubscribing === nextProps.isUnsubscribing
  );
});

MemoizedPumpFunStreamCard.displayName = 'MemoizedPumpFunStreamCard';

const PumpFunStreamsView: React.FC<PumpFunStreamsViewProps> = ({
  pluginName,
  streams,
  subscriptions,
  loading,
  error,
  onRefresh,
  onSubscribe,
  onUnsubscribe,
  onUpdateSubscription,
}) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"browse" | "subscriptions">("browse");
  const [minParticipants, setMinParticipants] = useState<string>("");
  const [maxParticipants, setMaxParticipants] = useState<string>("");
  const [showOnlyLive, setShowOnlyLive] = useState(false);
  const [showOnlySubscribed, setShowOnlySubscribed] = useState(false);

  // Track subscribing/unsubscribing streams
  const [subscribingStreams, setSubscribingStreams] = useState<Set<string>>(new Set());
  const [unsubscribingStreams, setUnsubscribingStreams] = useState<Set<string>>(new Set());

  // Virtualization setup
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);
  const rowHeight = 320;
  const gap = 16;

  // Debounce search for performance
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  // Calculate columns based on container width
  useEffect(() => {
    const updateColumns = () => {
      if (parentRef.current) {
        const width = parentRef.current.offsetWidth;
        if (width < 600) setColumns(1);
        else if (width < 900) setColumns(2);
        else if (width < 1200) setColumns(3);
        else setColumns(4);
      }
    };

    updateColumns();
    const resizeObserver = new ResizeObserver(updateColumns);
    if (parentRef.current) {
      resizeObserver.observe(parentRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  const handleSubscribe = useCallback(async (stream: PumpFunStream, priority?: number) => {
    setSubscribingStreams((prev) => new Set(prev).add(stream.stream_id));
    try {
      await onSubscribe(stream, priority);
    } finally {
      setSubscribingStreams((prev) => {
        const next = new Set(prev);
        next.delete(stream.stream_id);
        return next;
      });
    }
  }, [onSubscribe]);

  const handleUnsubscribe = useCallback(async (stream: PumpFunStream) => {
    setUnsubscribingStreams((prev) => new Set(prev).add(stream.stream_id));
    try {
      await onUnsubscribe(stream);
    } finally {
      setUnsubscribingStreams((prev) => {
        const next = new Set(prev);
        next.delete(stream.stream_id);
        return next;
      });
    }
  }, [onUnsubscribe]);

  // Ensure streams and subscriptions are arrays
  const safeStreams = Array.isArray(streams) ? streams : [];
  const safeSubscriptions = Array.isArray(subscriptions) ? subscriptions : [];

  const getSubscriptionForStream = useCallback((stream: PumpFunStream): PumpFunSubscription | undefined => {
    return safeSubscriptions.find((sub) => sub.stream_id === stream.stream_id);
  }, [safeSubscriptions]);

  const filteredStreams = useMemo(() => {
    return safeStreams.filter((stream) => {
      // Search filter
      if (debouncedSearchQuery) {
        const query = debouncedSearchQuery.toLowerCase();
        const matchesName = stream.name?.toLowerCase().includes(query) ?? false;
        const matchesSymbol = stream.symbol?.toLowerCase().includes(query) ?? false;
        if (!matchesName && !matchesSymbol) {
          return false;
        }
      }

      // Participants filters
      if (minParticipants) {
        const min = parseInt(minParticipants, 10);
        if (!isNaN(min) && (stream.num_participants || 0) < min) {
          return false;
        }
      }

      if (maxParticipants) {
        const max = parseInt(maxParticipants, 10);
        if (!isNaN(max) && (stream.num_participants || 0) > max) {
          return false;
        }
      }

      // Live filter
      if (showOnlyLive && !stream.is_currently_live) {
        return false;
      }

      // Subscribed filter
      if (showOnlySubscribed && !getSubscriptionForStream(stream)) {
        return false;
      }

      return true;
    });
  }, [safeStreams, debouncedSearchQuery, minParticipants, maxParticipants, showOnlyLive, showOnlySubscribed, getSubscriptionForStream]);

  // Sort streams: live first, then by participant count, then by name
  const sortedStreams = useMemo(() => {
    return [...filteredStreams].sort((a, b) => {
      // Live streams first
      if (a.is_currently_live && !b.is_currently_live) return -1;
      if (!a.is_currently_live && b.is_currently_live) return 1;

      // Then by participant count (descending)
      const participantsA = a.num_participants || 0;
      const participantsB = b.num_participants || 0;
      if (participantsA > participantsB) return -1;
      if (participantsA < participantsB) return 1;

      // Finally by name
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [filteredStreams]);

  const rowCount = Math.ceil(sortedStreams.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan: 2,
  });

  // Statistics
  const liveStreamsCount = safeStreams.filter((s) => s.is_currently_live).length;
  const subscribedStreamsCount = safeSubscriptions.length;
  const subscribedLiveCount = safeSubscriptions.filter((sub) => {
    const stream = safeStreams.find((s) => s.stream_id === sub.stream_id);
    return stream?.is_currently_live;
  }).length;

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <IconButton onClick={() => navigate("/plugins")} size="small">
            <BackIcon />
          </IconButton>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 0.5 }}>
              {pluginName} - PumpFun Streams
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Browse and subscribe to PumpFun livestreams. Subscribed streams will be auto-recorded when live.
            </Typography>
          </Box>
        </Box>
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={() => onRefresh()}
          disabled={loading}
          sx={{ textTransform: "none" }}
        >
          Refresh
        </Button>
      </Box>

      {/* Statistics */}
      <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ p: 2, backgroundColor: "#F9F9F9", borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Live Streams
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5 }}>
              {liveStreamsCount}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ p: 2, backgroundColor: "#FEF3C7", borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Your Subscriptions
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5, color: "#D97706" }}>
              {subscribedStreamsCount}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ p: 2, backgroundColor: "#D1FAE5", borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Live & Subscribed
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5, color: "#047857" }}>
              {subscribedLiveCount}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          sx={{
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 500,
            },
          }}
        >
          <Tab label="Browse Streams" value="browse" />
          <Tab label="My Subscriptions" value="subscriptions" />
        </Tabs>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => {}}>
          {error}
        </Alert>
      )}

      {/* Subscriptions Tab */}
      {activeTab === "subscriptions" && (
        <SubscriptionsPanel
          subscriptions={safeSubscriptions}
          streams={safeStreams}
          onUpdateSubscription={onUpdateSubscription}
          onUnsubscribe={handleUnsubscribe}
          unsubscribingStreams={unsubscribingStreams}
        />
      )}

      {/* Browse Tab */}
      {activeTab === "browse" && (
        <>
          {/* Search and Filters */}
          <Box sx={{ mb: 3, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <Box sx={{ flexGrow: 1, position: "relative", minWidth: 300 }}>
              <SearchIcon
                sx={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#9E9E9E",
                }}
              />
              <TextField
                fullWidth
                placeholder="Search streams by name or symbol..."
                value={searchQuery}
                onChange={handleSearchChange}
                inputProps={{
                  sx: {
                    pl: 4,
                    py: 1,
                  },
                }}
                sx={{
                  backgroundColor: "#FAFAFA",
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "8px",
                    "& fieldset": {
                      borderColor: "#E0E0E0",
                    },
                  },
                }}
                size="small"
              />
            </Box>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <TextField
                placeholder="Min participants"
                value={minParticipants}
                onChange={(e) => setMinParticipants(e.target.value)}
                size="small"
                sx={{ width: 120 }}
                InputProps={{
                  startAdornment: <PeopleIcon fontSize="small" sx={{ mr: 1, color: "#6B7280" }} />,
                }}
              />
              <TextField
                placeholder="Max participants"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                size="small"
                sx={{ width: 120 }}
              />

              <Chip
                label="Live Only"
                onClick={() => setShowOnlyLive(!showOnlyLive)}
                color={showOnlyLive ? "primary" : "default"}
                variant={showOnlyLive ? "filled" : "outlined"}
                size="small"
                clickable
              />
              <Chip
                label="Subscribed Only"
                onClick={() => setShowOnlySubscribed(!showOnlySubscribed)}
                color={showOnlySubscribed ? "primary" : "default"}
                variant={showOnlySubscribed ? "filled" : "outlined"}
                size="small"
                clickable
              />
            </Box>
          </Box>

          {/* Virtualized Streams Grid */}
          {loading && safeStreams.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flexGrow: 1, minHeight: 400 }}>
              <CircularProgress />
            </Box>
          ) : sortedStreams.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <FilterIcon sx={{ fontSize: 64, color: "#E0E0E0", mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No streams found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {searchQuery || minParticipants || maxParticipants || showOnlyLive || showOnlySubscribed
                  ? "Try adjusting your search or filters"
                  : "No streams available"}
              </Typography>
            </Box>
          ) : (
            <Box
              ref={parentRef}
              sx={{
                flexGrow: 1,
                overflow: "auto",
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
                  const rowStreams = sortedStreams.slice(startIndex, startIndex + columns);
                  
                  return (
                    <Box
                      key={virtualRow.key}
                      sx={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                        display: "grid",
                        gridTemplateColumns: `repeat(${columns}, 1fr)`,
                        gap: `${gap}px`,
                        paddingBottom: `${gap}px`,
                      }}
                    >
                      {rowStreams.map((stream) => (
                        <MemoizedPumpFunStreamCard
                          key={stream.stream_id}
                          stream={stream}
                          subscription={getSubscriptionForStream(stream)}
                          isSubscribing={subscribingStreams.has(stream.stream_id)}
                          isUnsubscribing={unsubscribingStreams.has(stream.stream_id)}
                          onSubscribe={handleSubscribe}
                          onUnsubscribe={handleUnsubscribe}
                          onUpdateSubscription={onUpdateSubscription}
                        />
                      ))}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default PumpFunStreamsView;
