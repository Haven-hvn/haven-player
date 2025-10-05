import React from "react";
import { Grid, Box } from "@mui/material";
import LivestreamCard from "./LivestreamCard";
import { StreamInfo } from "@/types/video";

type LivestreamGridProps = {
  items: StreamInfo[];
  onHide: (mint: string) => void;
};

const LivestreamGrid: React.FC<LivestreamGridProps> = ({
  items,
  onHide,
}) => {
  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={2}>
        {items.map((item) => (
          <Grid key={item.mint_id} item xs={12} sm={6} md={4} lg={3}>
            <LivestreamCard
              item={item}
              onHide={onHide}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default LivestreamGrid;


