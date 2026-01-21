import React, { useRef, useCallback, useState, useEffect } from "react";
import { Box } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import LivestreamCard from "./LivestreamCard";
import { StreamInfo } from "@/types/video";
import { StreamRecordingStatus } from "@/hooks/useBulkRecording";

type LivestreamGridProps = {
  items: StreamInfo[];
  onHide: (mint: string) => void;
  getStreamStatus?: (mintId: string) => StreamRecordingStatus | null;
};

// Memoized card component
const MemoizedLivestreamCard = React.memo<{
  item: StreamInfo;
  onHide: (mint: string) => void;
  bulkRecordingStatus: StreamRecordingStatus | null;
}>(({ item, onHide, bulkRecordingStatus }) => (
  <LivestreamCard
    item={item}
    onHide={onHide}
    bulkRecordingStatus={bulkRecordingStatus}
  />
), (prevProps, nextProps) => {
  return (
    prevProps.item.mint_id === nextProps.item.mint_id &&
    prevProps.item.is_live === nextProps.item.is_live &&
    prevProps.item.viewer_count === nextProps.item.viewer_count &&
    prevProps.bulkRecordingStatus?.status === nextProps.bulkRecordingStatus?.status
  );
});

MemoizedLivestreamCard.displayName = 'MemoizedLivestreamCard';

const LivestreamGrid: React.FC<LivestreamGridProps> = ({
  items,
  onHide,
  getStreamStatus,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);
  const rowHeight = 320; // Approximate height of each card
  const gap = 16;

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

  const rowCount = Math.ceil(items.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan: 2,
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
    <Box sx={{ p: 2, height: '100%' }}>
      <Box
        ref={parentRef}
        sx={{
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
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const startIndex = virtualRow.index * columns;
            const rowItems = items.slice(startIndex, startIndex + columns);
            
            return (
              <Box
                key={virtualRow.key}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, 1fr)`,
                  gap: `${gap}px`,
                  paddingBottom: `${gap}px`,
                }}
              >
                {rowItems.map((item) => (
                  <MemoizedLivestreamCard
                    key={item.mint_id}
                    item={item}
                    onHide={handleHide}
                    bulkRecordingStatus={getStreamStatus ? getStreamStatus(item.mint_id) : null}
                  />
                ))}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};

export default LivestreamGrid;
