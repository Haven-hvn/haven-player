import React, { useState } from "react";
import { Box, IconButton, Typography, Divider, Collapse } from "@mui/material";
import {
  Explore as ExploreIcon,
  VideoLibrary as AssetsIcon,
  Movie as MyVideosIcon,
  Favorite as LikesIcon,
  Folder as FoldersIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Help as HelpIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  AcUnit as BrainIcon,
} from "@mui/icons-material";

interface SidebarProps {
  onRefresh?: () => void;
  onSettings?: () => void;
  onHelp?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onRefresh, onSettings, onHelp }) => {
  const [sectionsExpanded, setSectionsExpanded] = useState({
    main: true,
    personal: true,
  });

  const toggleSection = (section: "main" | "personal") => {
    setSectionsExpanded((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const navigationItems = [
    { icon: ExploreIcon, label: "Dashboard", active: true },
    { icon: AssetsIcon, label: "Assets", active: false },
  ];

  const personalItems = [
    { icon: MyVideosIcon, label: "My Videos", active: false },
    { icon: LikesIcon, label: "Likes", active: false },
    { icon: FoldersIcon, label: "Folders", active: false },
  ];

  return (
    <Box
      sx={{
        width: "240px",
        height: "100vh",
        background: "linear-gradient(180deg, #FAFAFA 0%, #F7F7F7 100%)",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #E8E8E8",
        padding: "20px 16px",
      }}
    >
      {/* Brand Logo */}
      <Box sx={{ mb: 4, display: "flex", alignItems: "center", gap: 2 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            background: "linear-gradient(135deg, #000000 0%, #424242 100%)",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <BrainIcon
            sx={{
              color: "#FFFFFF",
              fontSize: "18px",
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))",
            }}
          />
        </Box>
        <Typography
          variant="h6"
          sx={{
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
            fontWeight: 600,
            fontSize: "18px",
            color: "#000000",
            letterSpacing: "-0.01em",
          }}
        >
          Haven Player
        </Typography>
      </Box>

      {/* Main Navigation */}
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
            cursor: "pointer",
          }}
          onClick={() => toggleSection("main")}
        >
          <Typography
            variant="caption"
            sx={{
              color: "#6B6B6B",
              fontWeight: 500,
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Main
          </Typography>
          {sectionsExpanded.main ? (
            <ExpandLessIcon sx={{ fontSize: 16, color: "#6B6B6B" }} />
          ) : (
            <ExpandMoreIcon sx={{ fontSize: 16, color: "#6B6B6B" }} />
          )}
        </Box>

        <Collapse in={sectionsExpanded.main}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {navigationItems.map((item, index) => (
              <Box
                key={index}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  px: 2,
                  py: 1.5,
                  borderRadius: "8px",
                  cursor: "pointer",
                  backgroundColor: item.active ? "#F0F0F0" : "transparent",
                  border: item.active
                    ? "1px solid #E0E0E0"
                    : "1px solid transparent",
                  transition: "all 0.2s ease-in-out",
                  "&:hover": {
                    backgroundColor: item.active ? "#F0F0F0" : "#F8F8F8",
                    borderColor: "#E8E8E8",
                  },
                }}
              >
                <item.icon
                  sx={{
                    fontSize: 18,
                    color: item.active ? "#000000" : "#6B6B6B",
                  }}
                />
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: item.active ? 500 : 400,
                    color: item.active ? "#000000" : "#6B6B6B",
                  }}
                >
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Collapse>
      </Box>

      {/* Personal Section */}
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
            cursor: "pointer",
          }}
          onClick={() => toggleSection("personal")}
        >
          <Typography
            variant="caption"
            sx={{
              color: "#6B6B6B",
              fontWeight: 500,
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Personal
          </Typography>
          {sectionsExpanded.personal ? (
            <ExpandLessIcon sx={{ fontSize: 16, color: "#6B6B6B" }} />
          ) : (
            <ExpandMoreIcon sx={{ fontSize: 16, color: "#6B6B6B" }} />
          )}
        </Box>

        <Collapse in={sectionsExpanded.personal}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {personalItems.map((item, index) => (
              <Box
                key={index}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  px: 2,
                  py: 1.5,
                  borderRadius: "8px",
                  cursor: "pointer",
                  backgroundColor: item.active ? "#F0F0F0" : "transparent",
                  border: item.active
                    ? "1px solid #E0E0E0"
                    : "1px solid transparent",
                  transition: "all 0.2s ease-in-out",
                  "&:hover": {
                    backgroundColor: item.active ? "#F0F0F0" : "#F8F8F8",
                    borderColor: "#E8E8E8",
                  },
                }}
              >
                <item.icon
                  sx={{
                    fontSize: 18,
                    color: item.active ? "#000000" : "#6B6B6B",
                  }}
                />
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: item.active ? 500 : 400,
                    color: item.active ? "#000000" : "#6B6B6B",
                  }}
                >
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Collapse>
      </Box>

      {/* Spacer */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Divider */}
      <Divider sx={{ my: 2, borderColor: "#E8E8E8" }} />

      {/* Bottom Actions */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        <Box
          onClick={onRefresh}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            px: 2,
            py: 1.5,
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s ease-in-out",
            "&:hover": {
              backgroundColor: "#F8F8F8",
              borderColor: "#E8E8E8",
            },
          }}
        >
          <RefreshIcon sx={{ fontSize: 18, color: "#6B6B6B" }} />
          <Typography sx={{ fontSize: "14px", color: "#6B6B6B" }}>
            Refresh
          </Typography>
        </Box>

        <Box
          onClick={onSettings}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            px: 2,
            py: 1.5,
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s ease-in-out",
            "&:hover": {
              backgroundColor: "#F8F8F8",
              borderColor: "#E8E8E8",
            },
          }}
        >
          <SettingsIcon sx={{ fontSize: 18, color: "#6B6B6B" }} />
          <Typography sx={{ fontSize: "14px", color: "#6B6B6B" }}>
            Settings
          </Typography>
        </Box>

        <Box
          onClick={onHelp}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            px: 2,
            py: 1.5,
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s ease-in-out",
            "&:hover": {
              backgroundColor: "#F8F8F8",
              borderColor: "#E8E8E8",
            },
          }}
        >
          <HelpIcon sx={{ fontSize: 18, color: "#6B6B6B" }} />
          <Typography sx={{ fontSize: "14px", color: "#6B6B6B" }}>
            Help
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default Sidebar;
