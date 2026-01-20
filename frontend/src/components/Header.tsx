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
import { liquidGlassTokens, glowEffects, glassStyles } from "@/styles/liquidGlassTheme";

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
  const [searchFocused, setSearchFocused] = useState(false);
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
        background: liquidGlassTokens.canvas.elevated,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 4,
        borderBottom: `1px solid rgba(255, 255, 255, 0.06)`,
        position: "relative",
        zIndex: 10,
        backdropFilter: "blur(12px)",
        
        // Subtle top highlight
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent)",
        },
      }}
    >
      {/* Left side - Navigation and branding */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
        {/* Navigation controls */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton
            size="small"
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              width: 32,
              height: 32,
              borderRadius: `${liquidGlassTokens.radius.sm}px`,
              transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
              "&:hover": {
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
              },
            }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              width: 32,
              height: 32,
              borderRadius: `${liquidGlassTokens.radius.sm}px`,
              transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
              "&:hover": {
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
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
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.primary})`,
              fontSize: "16px",
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
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
              color: liquidGlassTokens.neon.cyan,
              background: `${liquidGlassTokens.neon.cyan}15`,
              border: `1px solid ${liquidGlassTokens.neon.cyan}30`,
              borderRadius: `${liquidGlassTokens.radius.sm}px`,
              width: 36,
              height: 36,
              transition: `all ${liquidGlassTokens.motion.durationFast} ${liquidGlassTokens.motion.enter}`,
              "&:hover": {
                background: `${liquidGlassTokens.neon.cyan}25`,
                borderColor: `${liquidGlassTokens.neon.cyan}50`,
                transform: "translateY(-1px)",
                boxShadow: glowEffects.cyan(0.25),
              },
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
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          size="small"
          inputRef={searchInputRef}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon 
                  sx={{ 
                    color: searchFocused 
                      ? liquidGlassTokens.neon.cyan 
                      : `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                    fontSize: 20,
                    transition: `color ${liquidGlassTokens.motion.durationFast} ease`,
                  }} 
                />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleClearSearch}
                  sx={{
                    color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                    width: 24,
                    height: 24,
                    "&:hover": {
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
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
              background: "rgba(255, 255, 255, 0.04)",
              borderRadius: `${liquidGlassTokens.radius.md}px`,
              border: `1px solid rgba(255, 255, 255, 0.08)`,
              height: 44,
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: "14px",
              transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
              "& fieldset": {
                border: "none",
              },
              "&:hover": {
                background: "rgba(255, 255, 255, 0.06)",
                borderColor: "rgba(255, 255, 255, 0.12)",
              },
              "&.Mui-focused": {
                background: `${liquidGlassTokens.neon.cyan}08`,
                borderColor: `${liquidGlassTokens.neon.cyan}50`,
                boxShadow: glowEffects.cyan(0.15),
              },
            },
            "& .MuiInputBase-input": {
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.primary})`,
              "&::placeholder": {
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
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
              color: liquidGlassTokens.neon.cyan,
              fontSize: "12px",
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
              fontWeight: 500,
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
            background: "rgba(255, 255, 255, 0.04)",
            borderRadius: `${liquidGlassTokens.radius.sm}px`,
            border: "1px solid rgba(255, 255, 255, 0.08)",
            "& .MuiToggleButton-root": {
              border: "none",
              borderRadius: `${liquidGlassTokens.radius.sm - 2}px`,
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              width: 36,
              height: 34,
              margin: "1px",
              transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
              "&:hover": {
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
              },
              "&.Mui-selected": {
                backgroundColor: `${liquidGlassTokens.neon.cyan}20`,
                color: liquidGlassTokens.neon.cyan,
                "&:hover": {
                  backgroundColor: `${liquidGlassTokens.neon.cyan}30`,
                },
              },
            },
            "& .MuiToggleButtonGroup-grouped": {
              "&:not(:first-of-type)": {
                borderLeft: "none",
                marginLeft: 0,
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
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            width: 36,
            height: 36,
            borderRadius: `${liquidGlassTokens.radius.sm}px`,
            transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
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
              ? "rgba(255, 255, 255, 0.1)"
              : `linear-gradient(135deg, ${liquidGlassTokens.neon.magenta}25 0%, ${liquidGlassTokens.neon.magenta}15 100%)`,
            border: `1px solid ${isAnalyzing ? 'rgba(255, 255, 255, 0.1)' : liquidGlassTokens.neon.magenta}40`,
            color: isAnalyzing 
              ? `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` 
              : liquidGlassTokens.neon.magenta,
            fontSize: "14px",
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
            fontWeight: 500,
            textTransform: "none",
            borderRadius: `${liquidGlassTokens.radius.sm}px`,
            px: 3,
            py: 1,
            height: 36,
            boxShadow: "none",
            letterSpacing: "-0.01em",
            transition: `all ${liquidGlassTokens.motion.durationFast} ${liquidGlassTokens.motion.enter}`,
            "&:hover": {
              background: isAnalyzing
                ? "rgba(255, 255, 255, 0.1)"
                : `linear-gradient(135deg, ${liquidGlassTokens.neon.magenta}35 0%, ${liquidGlassTokens.neon.magenta}20 100%)`,
              borderColor: `${liquidGlassTokens.neon.magenta}60`,
              boxShadow: isAnalyzing ? "none" : glowEffects.magenta(0.3),
              transform: isAnalyzing ? "none" : "translateY(-1px)",
            },
            "&:disabled": {
              background: "rgba(255, 255, 255, 0.05)",
              borderColor: "rgba(255, 255, 255, 0.08)",
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              transform: "none",
              boxShadow: "none",
            },
          }}
        >
          {isAnalyzing ? "Analyzing..." : "Analyze All"}
        </Button>
      </Box>
    </Box>
  );
};

export default Header;
