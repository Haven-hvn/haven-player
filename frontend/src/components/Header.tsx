import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Typography,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  Avatar,
  Badge,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import {
  Add as AddIcon,
  Analytics as AnalyticsIcon,
  Search as SearchIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  FilterList as FilterListIcon,
  AccountCircle as AccountCircleIcon,
  Clear as ClearIcon,
  GridView as GridViewIcon,
  ViewList as ViewListIcon,
} from "@mui/icons-material";

interface HeaderProps {
  videoCount: number;
  onAddVideo: () => void;
  onAnalyzeAll: () => void;
  isAnalyzing?: boolean;
  onSearch?: (query: string) => void;
  viewMode?: "grid" | "list";
  onViewModeChange?: (mode: "grid" | "list") => void;
}

const Header: React.FC<HeaderProps> = ({
  videoCount,
  onAddVideo,
  onAnalyzeAll,
  isAnalyzing = false,
  onSearch,
  viewMode = "grid",
  onViewModeChange,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);
    if (onSearch) {
      onSearch(query);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
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
      input.setAttribute("data-search-input", "true");
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

        {/* Video count with modern styling */}
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
            {videoCount} videos
          </Typography>

          <IconButton
            onClick={onAddVideo}
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
          placeholder="Search videos... ⌘K"
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

      {/* Right side - Actions and user */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        {/* Search results indicator */}
        {searchQuery && (
          <Typography
            sx={{
              color: "#6B6B6B",
              fontSize: "12px",
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontWeight: 400,
              mr: 1,
            }}
          >
            {videoCount} result{videoCount !== 1 ? "s" : ""}
          </Typography>
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

        {/* Analyze all button */}
        <Button
          onClick={onAnalyzeAll}
          disabled={isAnalyzing || videoCount === 0}
          startIcon={<AnalyticsIcon fontSize="small" />}
          sx={{
            background: isAnalyzing
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
              background: isAnalyzing
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
          {isAnalyzing ? "Analyzing..." : "Analyze All"}
        </Button>

        {/* User avatar with notification */}
        {/* <Box sx={{ ml: 1 }}>
          <Badge
            overlap="circular"
            anchorOrigin={{ vertical: "top", horizontal: "right" }}
            badgeContent={
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  backgroundColor: "#FF4D4D",
                  borderRadius: "50%",
                  border: "2px solid #FFFFFF",
                }}
              />
            }
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                backgroundColor: "#F7F7F7",
                color: "#6B6B6B",
                border: "1px solid #E0E0E0",
                fontSize: 16,
                "&:hover": {
                  backgroundColor: "#F0F0F0",
                  borderColor: "#BDBDBD",
                },
                cursor: "pointer",
                transition: "all 0.2s ease-in-out",
              }}
            >
              <AccountCircleIcon fontSize="small" />
            </Avatar>
          </Badge>
        </Box> */}
      </Box>
    </Box>
  );
};

export default Header;
