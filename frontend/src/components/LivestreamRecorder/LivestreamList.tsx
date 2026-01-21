import React, { useRef, useCallback } from "react";
import { Box } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import LivestreamListItem from "./LivestreamListItem";
import { StreamInfo } from "@/types/video";

type LivestreamListProps = {
  items: StreamInfo[];
  onHide: (mint: string) => void;
};

// Memoized list item component
const MemoizedLivestreamListItem = React.memo<{
  item: StreamInfo;
  onHide: (mint: string) => void;
}>(({ item, onHide }) => (
  <LivestreamListItem item={item} onHide={onHide} />
), (prevProps, nextProps) => {
  return (
    prevProps.item.mint_id === nextProps.item.mint_id &&
    prevProps.item.is_live === nextProps.item.is_live &&
    prevProps.item.viewer_count === nextProps.item.viewer_count &&
    prevProps.item.title === nextProps.item.title
  );
});

MemoizedLivestreamListItem.displayName = 'MemoizedLivestreamListItem';

const LivestreamList: React.FC<LivestreamListProps> = ({ items, onHide }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowHeight = 80; // Approximate height of each list item
  const gap = 12;

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan: 5,
  });

  // Stabilize callback
  const handleHide = useCallback((mint: string) => {
    onHide(mint);
  }, [onHide]);

  // If no items, render empty state without virtualization
  if (items.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 200,
            color: 'text.secondary',
          }}
        >
          No livestreams available
        </Box>
      </Box>
    );
  }

  return (
    <Box
      ref={parentRef}
      sx={{
        p: 2,
        height: 'calc(100vh - 300px)',
        overflow: 'auto',
        contain: 'strict',
      }}
    >
      <Box
        sx={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          
          return (
            <Box
              key={virtualItem.key}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                paddingBottom: `${gap}px`,
              }}
            >
              <MemoizedLivestreamListItem
                item={item}
                onHide={handleHide}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default LivestreamList;
