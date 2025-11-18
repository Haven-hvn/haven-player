import React from "react";
import { Box } from "@mui/material";
import LivestreamCard from "./LivestreamCard";
import { StreamInfo } from "@/types/video";
import { StreamRecordingStatus } from "@/hooks/useBulkRecording";

type LivestreamGridProps = {
  items: StreamInfo[];
  onHide: (mint: string) => void;
  getStreamStatus?: (mintId: string) => StreamRecordingStatus | null;
};

const LivestreamGrid: React.FC<LivestreamGridProps> = ({
  items,
  onHide,
  getStreamStatus,
}) => {
  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(4, 1fr)',
          },
          gap: 2,
        }}
      >
        {items.map((item) => (
          <LivestreamCard
            key={item.mint_id}
            item={item}
            onHide={onHide}
            bulkRecordingStatus={getStreamStatus ? getStreamStatus(item.mint_id) : null}
          />
        ))}
      </Box>
    </Box>
  );
};

export default LivestreamGrid;


