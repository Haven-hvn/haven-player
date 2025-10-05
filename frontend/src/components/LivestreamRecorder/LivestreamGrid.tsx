import React from "react";
import { Grid, Box } from "@mui/material";
import LivestreamCard, { LivestreamItem } from "./LivestreamCard";

type LivestreamGridProps = {
  items: LivestreamItem[];
  recordingMints: Set<string>;
  progressByMint: Record<string, number>;
  onToggleRecord: (mint: string) => void;
  onHide: (mint: string) => void;
};

const LivestreamGrid: React.FC<LivestreamGridProps> = ({
  items,
  recordingMints,
  progressByMint,
  onToggleRecord,
  onHide,
}) => {
  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={2}>
        {items.map((item) => (
          <Grid key={item.mint} item xs={12} sm={6} md={4} lg={3}>
            <LivestreamCard
              item={item}
              isRecording={recordingMints.has(item.mint)}
              progress={progressByMint[item.mint] ?? 0}
              onToggleRecord={onToggleRecord}
              onHide={onHide}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default LivestreamGrid;


