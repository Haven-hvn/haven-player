import React from "react";
import { Box } from "@mui/material";
import LivestreamListItem from "./LivestreamListItem";
import { StreamInfo } from "@/types/video";

type LivestreamListProps = {
  items: StreamInfo[];
  onHide: (mint: string) => void;
};

const LivestreamList: React.FC<LivestreamListProps> = ({ items, onHide }) => {
  return (
    <Box
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      {items.map((item) => (
        <LivestreamListItem key={item.mint_id} item={item} onHide={onHide} />
      ))}
    </Box>
  );
};

export default LivestreamList;

