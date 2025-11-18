import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Box, Typography, CircularProgress, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from "@mui/material";
import LivestreamGrid from "./LivestreamGrid";
import LivestreamList from "./LivestreamList";
import LivestreamRecorderHeader from "./LivestreamRecorderHeader";
import AddLivestreamModal, { AddLivestreamFormData } from "./AddLivestreamModal";
import { StreamInfo } from "@/types/video";
import { streamService } from "@/services/api";
import { LiveTv as LiveTvIcon } from "@mui/icons-material";
import { useBulkRecording } from "@/hooks/useBulkRecording";
import { useSearch } from "@/hooks/useSearch";

const MANUALLY_ADDED_STREAMS_KEY = "haven_player_manually_added_streams";
const VIEW_MODE_STORAGE_KEY = "livestream-view-mode";

interface ManuallyAddedStream extends StreamInfo {
  rtcUrl: string;
  isManuallyAdded: true;
}

const LivestreamRecorderPage: React.FC = () => {
  const [items, setItems] = useState<StreamInfo[]>([]);
  const [manuallyAddedStreams, setManuallyAddedStreams] = useState<ManuallyAddedStream[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenMints, setHiddenMints] = useState<Set<string>>(new Set());
  // Load view mode from localStorage or default to "grid"
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return (saved === "grid" || saved === "list") ? saved : "grid";
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);

  // Use search hook with debouncing and history
  const {
    query: searchQuery,
    debouncedQuery,
    isSearchActive,
    setQuery: setSearchQuery,
    clearSearch,
    addToHistory,
  } = useSearch({
    debounceMs: 300,
    storageKey: "haven-player-livestream-search-history",
    maxHistoryItems: 10,
  });
  
  // Use bulk recording hook
  const {
    status: bulkRecordingStatus,
    startRecordingAll,
    stopRecordingAll,
    getStreamStatus,
    isLoading: isBulkRecordingLoading,
  } = useBulkRecording();

  // Load manually added streams from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MANUALLY_ADDED_STREAMS_KEY);
      if (stored) {
        const parsed: ManuallyAddedStream[] = JSON.parse(stored);
        setManuallyAddedStreams(parsed);
      }
    } catch (err) {
      console.error("Failed to load manually added streams from localStorage:", err);
    }
  }, []);

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
      } catch (e: unknown) {
        if (isMounted) {
          const errorMessage = e instanceof Error ? e.message : "Failed to load livestreams";
          setError(errorMessage);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Handle keyboard shortcut (⌘K / Ctrl+K) to focus search input
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle if not typing in an input/textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        const searchInput = document.querySelector(
          'input[data-livestream-search-input="true"]'
        ) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Clear search on Escape
      if (event.key === "Escape" && isSearchActive) {
        clearSearch();
        const searchInput = document.querySelector(
          'input[data-livestream-search-input="true"]'
        ) as HTMLInputElement;
        if (searchInput) {
          searchInput.blur();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSearchActive, clearSearch]);

  // Add search query to history when user stops typing
  useEffect(() => {
    if (debouncedQuery.trim()) {
      addToHistory(debouncedQuery);
    }
  }, [debouncedQuery, addToHistory]);

  // Merge fetched streams with manually added streams
  const allStreams = useMemo<StreamInfo[]>(() => {
    const fetchedMintIds = new Set(items.map((item) => item.mint_id));
    // Only include manually added streams that aren't already in fetched streams
    const uniqueManualStreams = manuallyAddedStreams.filter(
      (stream) => !fetchedMintIds.has(stream.mint_id)
    );
    return [...items, ...uniqueManualStreams];
  }, [items, manuallyAddedStreams]);

  const handleHide = (mint: string) => {
    setHiddenMints((prev) => new Set([...prev, mint]));
  };

  // Enhanced search function that searches across multiple fields
  const matchesSearchQuery = useCallback(
    (item: StreamInfo, query: string): boolean => {
      if (!query.trim()) return true;

      const lowerQuery = query.toLowerCase();
      const searchableFields: (string | undefined)[] = [
        item.mint_id,
        item.name,
        item.symbol,
        item.description,
        item.creator,
        item.website,
        item.twitter,
        item.telegram,
      ];

      return searchableFields.some((field) => {
        if (!field) return false;
        return field.toLowerCase().includes(lowerQuery);
      });
    },
    []
  );

  // Filter out hidden livestreams and apply search (using debounced query)
  const visibleItems = useMemo(() => {
    return allStreams.filter((item) => {
      if (hiddenMints.has(item.mint_id)) return false;
      return matchesSearchQuery(item, debouncedQuery);
    });
  }, [allStreams, hiddenMints, debouncedQuery, matchesSearchQuery]);

  // Get existing mint IDs for validation
  const existingMintIds = useMemo<Set<string>>(() => {
    return new Set(allStreams.map((item) => item.mint_id));
  }, [allStreams]);

  const handleAddLivestream = () => {
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
  };

  const handleSubmitAddLivestream = async (formData: AddLivestreamFormData): Promise<void> => {
    // Validate that mint ID doesn't already exist
    if (existingMintIds.has(formData.mintId)) {
      throw new Error("A livestream with this mint ID already exists");
    }

    // Create StreamInfo object from form data
    const newStream: ManuallyAddedStream = {
      mint_id: formData.mintId,
      name: formData.streamName,
      symbol: formData.symbol || "",
      description: formData.description,
      rtcUrl: formData.rtcUrl,
      is_currently_live: true,
      num_participants: 0,
      nsfw: false,
      isManuallyAdded: true,
    };

    // Add to manually added streams
    const updatedManualStreams = [...manuallyAddedStreams, newStream];
    setManuallyAddedStreams(updatedManualStreams);

    // Persist to localStorage
    try {
      localStorage.setItem(MANUALLY_ADDED_STREAMS_KEY, JSON.stringify(updatedManualStreams));
    } catch (err) {
      console.error("Failed to save manually added stream to localStorage:", err);
      // Don't throw - the stream is still added to state
    }
  };

  const handleRecordAll = useCallback(async () => {
    if (bulkRecordingStatus.isRecording) {
      // Stop all recordings
      await stopRecordingAll();
    } else {
      // Show confirmation dialog before starting
      setShowConfirmDialog(true);
    }
  }, [bulkRecordingStatus.isRecording, stopRecordingAll]);

  const handleConfirmRecordAll = useCallback(async () => {
    setShowConfirmDialog(false);
    if (visibleItems.length > 0) {
      await startRecordingAll(visibleItems);
    }
  }, [visibleItems, startRecordingAll]);

  const handleCancelRecordAll = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
    },
    [setSearchQuery]
  );

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  };

  const handleSort = () => {
    // Placeholder: Sort livestreams
    console.log("Sort livestreams");
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <Box
        sx={{
          borderBottom: "1px solid #F0F0F0",
          backgroundColor: "#FAFAFA",
          backdropFilter: "blur(8px)",
        }}
      >
        <LivestreamRecorderHeader
          livestreamCount={visibleItems.length}
          onAddLivestream={handleAddLivestream}
          onRecordAll={handleRecordAll}
          isRecording={bulkRecordingStatus.isRecording}
          recordingCount={bulkRecordingStatus.recordingCount}
          totalStreams={bulkRecordingStatus.totalStreams}
          failedCount={bulkRecordingStatus.failedCount}
          onSearch={handleSearch}
          searchQuery={searchQuery}
          isSearchActive={isSearchActive}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onSort={handleSort}
        />
      </Box>

      {/* Content */}
      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {loading ? (
          <Box sx={{ p: 4, display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={20} />
            <Typography>Loading live streams…</Typography>
          </Box>
        ) : error ? (
          <Box sx={{ p: 4 }}>
            <Typography color="error">{error}</Typography>
          </Box>
        ) : visibleItems.length === 0 ? (
          <Box
            sx={{
              p: 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              color: "#9E9E9E",
              minHeight: "400px",
            }}
          >
            <LiveTvIcon sx={{ fontSize: 48, color: "#9E9E9E" }} />
            <Typography variant="subtitle1" sx={{ color: "#6B6B6B" }}>
              No livestreams active
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Check back later for live Pump.fun streams
            </Typography>
          </Box>
        ) : viewMode === "grid" ? (
          <LivestreamGrid
            items={visibleItems}
            onHide={handleHide}
            getStreamStatus={getStreamStatus}
          />
        ) : (
          <LivestreamList
            items={visibleItems}
            onHide={handleHide}
          />
        )}
      </Box>

      {/* Add Livestream Modal */}
      <AddLivestreamModal
        open={isAddModalOpen}
        onClose={handleCloseAddModal}
        onSubmit={handleSubmitAddLivestream}
        existingMintIds={existingMintIds}
      />

      {/* Confirmation Dialog */}
      <Dialog
        open={showConfirmDialog}
        onClose={handleCancelRecordAll}
        aria-labelledby="confirm-record-all-dialog-title"
        aria-describedby="confirm-record-all-dialog-description"
      >
        <DialogTitle id="confirm-record-all-dialog-title">
          Record All Livestreams?
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="confirm-record-all-dialog-description">
            You are about to start recording {visibleItems.length} livestream{visibleItems.length !== 1 ? "s" : ""}. 
            This may use significant system resources. Do you want to continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelRecordAll} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleConfirmRecordAll} color="primary" variant="contained" autoFocus>
            Start Recording
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LivestreamRecorderPage;
