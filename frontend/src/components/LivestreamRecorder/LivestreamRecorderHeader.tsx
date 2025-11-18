import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Typography,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import {
  Add as AddIcon,
  Search as SearchIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  GridView as GridViewIcon,
  ViewList as ViewListIcon,
  Sort as SortIcon,
  FiberManualRecord as RecordIcon,
} from "@mui/icons-material";
import { SortOption, getSortLabel } from "@/utils/sortUtils";

interface LivestreamRecorderHeaderProps {
  livestreamCount: number;
  onAddLivestream: () => void;
  onRecordAll: () => void;
  isRecording?: boolean;
  recordingCount?: number;
  totalStreams?: number;
  failedCount?: number;
  onSearch?: (query: string) => void;
  searchQuery?: string;
  isSearchActive?: boolean;
  viewMode?: "grid" | "list";
  onViewModeChange?: (mode: "grid" | "list") => void;
  onSort?: (event: React.MouseEvent<HTMLElement>) => void;
  currentSort?: SortOption;
}

const LivestreamRecorderHeader: React.FC<LivestreamRecorderHeaderProps> = ({
  livestreamCount,
  onAddLivestream,
  onRecordAll,
  isRecording = false,
  recordingCount = 0,
  totalStreams = 0,
  failedCount = 0,
  onSearch,
  searchQuery: controlledSearchQuery,
  isSearchActive = false,
  viewMode = "grid",
  onViewModeChange,
  onSort,
  currentSort,
}) => {
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Use controlled query if provided, otherwise use local state
  const searchQuery = controlledSearchQuery !== undefined ? controlledSearchQuery : localSearchQuery;

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    if (controlledSearchQuery === undefined) {
      setLocalSearchQuery(query);
    }
    if (onSearch) {
      onSearch(query);
    }
  };

  const handleClearSearch = () => {
    if (controlledSearchQuery === undefined) {
      setLocalSearchQuery("");
    }
    if (onSearch) {
      onSearch("");
    }
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleViewModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newMode: "grid" | "list"
  ) => {
    if (newMode !== null && onViewModeChange) {
      onViewModeChange(newMode);
    }
  };

  useEffect(() => {
    const input = searchInputRef.current;
    if (input) {
      input.setAttribute("data-livestream-search-input", "true");
    }
  }, []);

  return (
    <Box
      sx={{
        height: "72px",
        backgroundColor: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 4,
        borderBottom: "1px solid #F0F0F0",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Left side - Navigation and branding */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
        {/* Navigation controls */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton
            size="small"
            sx={{
              color: "#6B6B6B",
              width: 32,
              height: 32,
              "&:hover": {
                backgroundColor: "#F5F5F5",
                color: "#000000",
              },
            }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            sx={{
              color: "#6B6B6B",
              width: 32,
              height: 32,
              "&:hover": {
                backgroundColor: "#F5F5F5",
                color: "#000000",
              },
            }}
          >
            <ArrowForwardIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Livestream count with modern styling */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography
            sx={{
              color: "#000000",
              fontSize: "16px",
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontWeight: 500,
              letterSpacing: "-0.01em",
            }}
          >
            {livestreamCount} livestream{livestreamCount !== 1 ? "s" : ""}
          </Typography>

          <IconButton
            onClick={onAddLivestream}
            size="small"
            sx={{
              color: "#000000",
              backgroundColor: "#F7F7F7",
              border: "1px solid #E0E0E0",
              borderRadius: "8px",
              width: 36,
              height: 36,
              "&:hover": {
                backgroundColor: "#F0F0F0",
                borderColor: "#BDBDBD",
                transform: "translateY(-1px)",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
              },
              transition: "all 0.2s ease-in-out",
            }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Center - Search bar */}
      <Box
        sx={{
          flex: 1,
          maxWidth: 480,
          mx: 4,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <TextField
          fullWidth
          placeholder="Search Livestreams... ⌘K"
          value={searchQuery}
          onChange={handleSearchChange}
          size="small"
          inputRef={searchInputRef}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: "#6B6B6B", fontSize: 20 }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleClearSearch}
                  sx={{
                    color: "#6B6B6B",
                    width: 24,
                    height: 24,
                    "&:hover": {
                      backgroundColor: "#F5F5F5",
                      color: "#000000",
                    },
                  }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              backgroundColor: "#F7F7F7",
              borderRadius: "12px",
              border: "1px solid #E0E0E0",
              height: 44,
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              "& fieldset": {
                border: "none",
              },
              "&:hover": {
                backgroundColor: "#F0F0F0",
                borderColor: "#BDBDBD",
              },
              "&.Mui-focused": {
                backgroundColor: "#FFFFFF",
                borderColor: "#000000",
                boxShadow: "0 0 0 3px rgba(0, 0, 0, 0.08)",
              },
              ...(isSearchActive && {
                borderColor: "#000000",
                backgroundColor: "#FFFFFF",
                boxShadow: "0 0 0 2px rgba(0, 0, 0, 0.1)",
              }),
            },
            "& .MuiInputBase-input": {
              color: "#000000",
              "&::placeholder": {
                color: "#6B6B6B",
                opacity: 1,
                fontWeight: 400,
              },
            },
          }}
        />
      </Box>

      {/* Right side - Actions */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        {/* Search results indicator with active filter indicator */}
        {isSearchActive && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mr: 1,
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "#000000",
                animation: "pulse 2s ease-in-out infinite",
                "@keyframes pulse": {
                  "0%, 100%": {
                    opacity: 1,
                  },
                  "50%": {
                    opacity: 0.5,
                  },
                },
              }}
            />
            <Typography
              sx={{
                color: "#6B6B6B",
                fontSize: "12px",
                fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                fontWeight: 400,
              }}
            >
              {livestreamCount} result{livestreamCount !== 1 ? "s" : ""}
            </Typography>
          </Box>
        )}

        {/* Layout toggle */}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={handleViewModeChange}
          sx={{
            height: 36,
            "& .MuiToggleButton-root": {
              border: "1px solid #E0E0E0",
              borderRadius: "8px",
              color: "#6B6B6B",
              width: 36,
              height: 36,
              "&:hover": {
                backgroundColor: "#F5F5F5",
                borderColor: "#BDBDBD",
              },
              "&.Mui-selected": {
                backgroundColor: "#000000",
                color: "#FFFFFF",
                borderColor: "#000000",
                "&:hover": {
                  backgroundColor: "#424242",
                },
              },
            },
            "& .MuiToggleButtonGroup-grouped": {
              "&:not(:first-of-type)": {
                borderLeft: "1px solid #E0E0E0",
                marginLeft: 0,
                borderTopLeftRadius: "8px",
                borderBottomLeftRadius: "8px",
              },
              "&:not(:last-of-type)": {
                borderTopRightRadius: "8px",
                borderBottomRightRadius: "8px",
              },
            },
          }}
        >
          <ToggleButton value="grid" aria-label="grid view">
            <GridViewIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="list" aria-label="list view">
            <ViewListIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Sort button */}
        <IconButton
          onClick={onSort}
          size="small"
          title={currentSort ? getSortLabel(currentSort) : "Sort"}
          sx={{
            color: currentSort ? "#000000" : "#6B6B6B",
            width: 36,
            height: 36,
            backgroundColor: currentSort ? "#F0F0F0" : "transparent",
            border: currentSort ? "1px solid #E0E0E0" : "none",
            "&:hover": {
              backgroundColor: "#F5F5F5",
              color: "#000000",
            },
          }}
        >
          <SortIcon fontSize="small" />
        </IconButton>

        {/* Filter button */}
        <IconButton
          size="small"
          sx={{
            color: "#6B6B6B",
            width: 36,
            height: 36,
            "&:hover": {
              backgroundColor: "#F5F5F5",
              color: "#000000",
            },
          }}
        >
          <FilterListIcon fontSize="small" />
        </IconButton>

        {/* Record all button */}
        <Button
          onClick={onRecordAll}
          disabled={livestreamCount === 0}
          startIcon={<RecordIcon fontSize="small" />}
          sx={{
            background: isRecording
              ? "rgba(0, 0, 0, 0.5)"
              : "linear-gradient(135deg, #000000 0%, #424242 100%)",
            color: "#FFFFFF",
            fontSize: "14px",
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
            fontWeight: 500,
            textTransform: "none",
            borderRadius: "8px",
            px: 3,
            py: 1,
            height: 36,
            boxShadow: "none",
            letterSpacing: "-0.01em",
            "&:hover": {
              background: isRecording
                ? "rgba(0, 0, 0, 0.5)"
                : "linear-gradient(135deg, #424242 0%, #000000 100%)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
              transform: "translateY(-1px)",
            },
            "&:disabled": {
              background: "#E0E0E0",
              color: "#9E9E9E",
              transform: "none",
              boxShadow: "none",
            },
            transition: "all 0.2s ease-in-out",
          }}
        >
          {isRecording
            ? totalStreams > 0
              ? `Recording ${recordingCount}/${totalStreams}${failedCount > 0 ? ` (${failedCount} failed)` : ""}...`
              : "Recording..."
            : "Record All"}
        </Button>
      </Box>
    </Box>
  );
};

export default LivestreamRecorderHeader;

