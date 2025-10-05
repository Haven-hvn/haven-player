import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography, CircularProgress } from "@mui/material";
import LivestreamGrid from "./LivestreamGrid";
import { LivestreamItem } from "./LivestreamCard";
import { LiveTv as LiveTvIcon } from "@mui/icons-material";

const PUMP_FUN_URL =
  "https://frontend-api-v3.pump.fun/coins/currently-live?offset=0&limit=60&sort=currently_live&order=DESC&includeNsfw=true";

const RECORD_SIM_MS = 30_000; // 30s simulated recording fill

const LivestreamRecorderPage: React.FC = () => {
  const [items, setItems] = useState<LivestreamItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [recordingMints, setRecordingMints] = useState<Set<string>>(new Set());
  const [progressByMint, setProgressByMint] = useState<Record<string, number>>(
    {}
  );

  // Fetch currently live streams
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(PUMP_FUN_URL);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const data: unknown = await res.json();
        if (!Array.isArray(data)) throw new Error("Unexpected response shape");
        const parsed: LivestreamItem[] = data
          .filter((d) =>
            d && typeof d === "object" && "mint" in d && "name" in d
          )
          .map((d: any) => ({
            mint: String(d.mint),
            name: String(d.name ?? "Unnamed"),
            symbol: String(d.symbol ?? ""),
            thumbnail: String(d.thumbnail ?? ""),
            num_participants: Number(d.num_participants ?? 0),
            last_reply: Number(d.last_reply ?? 0),
            usd_market_cap: Number(d.usd_market_cap ?? 0),
          }));
        if (isMounted) {
          setItems(parsed);
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

  // Simulate recording progress
  useEffect(() => {
    const interval = setInterval(() => {
      setProgressByMint((prev) => {
        const next: Record<string, number> = { ...prev };
        recordingMints.forEach((mint) => {
          const current = next[mint] ?? 0;
          const increment = 100 / (RECORD_SIM_MS / 200); // update at 200ms steps
          const updated = Math.min(100, current + increment);
          next[mint] = updated;
        });
        return next;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [recordingMints]);

  const handleToggleRecord = (mint: string) => {
    setRecordingMints((prev) => {
      const updated = new Set(prev);
      if (updated.has(mint)) {
        updated.delete(mint);
        setProgressByMint((p) => {
          const { [mint]: _, ...rest } = p;
          return rest;
        });
      } else {
        updated.add(mint);
        setProgressByMint((p) => ({ ...p, [mint]: 0 }));
      }
      return updated;
    });
  };

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

  if (items.length === 0) {
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
          {items.length} Live Streams
        </Typography>
      </Box>
      <LivestreamGrid
        items={items}
        recordingMints={recordingMints}
        progressByMint={progressByMint}
        onToggleRecord={handleToggleRecord}
      />
    </Box>
  );
};

export default LivestreamRecorderPage;


