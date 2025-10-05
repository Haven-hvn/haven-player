import React, { useEffect, useState } from "react";
import { Box, Typography, CircularProgress } from "@mui/material";
import LivestreamGrid from "./LivestreamGrid";
import { StreamInfo } from "@/types/video";
import { streamService } from "@/services/api";
import { LiveTv as LiveTvIcon } from "@mui/icons-material";

const LivestreamRecorderPage: React.FC = () => {
  const [items, setItems] = useState<StreamInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenMints, setHiddenMints] = useState<Set<string>>(new Set());

  // Fetch popular live streams from backend
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const streams = await streamService.getPopular(20);
        if (isMounted) {
          setItems(streams);
          setError(null);
        }
      } catch (e: any) {
        if (isMounted) setError(e?.message ?? "Failed to load livestreams");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleHide = (mint: string) => {
    setHiddenMints((prev) => new Set([...prev, mint]));
  };

  // Filter out hidden livestreams
  const visibleItems = items.filter((item) => !hiddenMints.has(item.mint_id));

  if (loading) {
    return (
      <Box sx={{ p: 4, display: "flex", alignItems: "center", gap: 2 }}>
        <CircularProgress size={20} />
        <Typography>Loading live streams…</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (visibleItems.length === 0) {
    return (
      <Box
        sx={{
          p: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          color: "#9E9E9E",
        }}
      >
        <LiveTvIcon />
        <Typography variant="subtitle1" sx={{ color: "#6B6B6B" }}>
          No livestreams active
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Check back later for live Pump.fun streams
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ px: 2, pt: 2, pb: 0 }}>
        <Typography variant="h2" sx={{ fontWeight: 600 }}>
          Livestream Recorder
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {visibleItems.length} Live Streams
        </Typography>
      </Box>
      <LivestreamGrid
        items={visibleItems}
        onHide={handleHide}
      />
    </Box>
  );
};

export default LivestreamRecorderPage;


