import React, { useMemo, useState } from "react";
import { Box, Typography, Divider, Collapse } from "@mui/material";
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
  CloudUpload as CloudUploadIcon,
  Extension as PluginsIcon,
} from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import { useSettingsNavigation } from "@/context/SettingsNavigationContext";
import { liquidGlassTokens, glowEffects } from "@/styles/liquidGlassTheme";
import { CircuitSubstrateSimple, CircuitLine } from "@/components/LiquidGlass";

interface SidebarProps {
  onRefresh?: () => void;
  onSettings?: () => void;
  onHelp?: () => void;
}

type SectionsState = { main: boolean; personal: boolean };
type NavItem = { icon: React.ElementType; label: string; path: string; active: boolean };

const Sidebar: React.FC<SidebarProps> = (props: SidebarProps) => {
  const { onRefresh, onSettings, onHelp } = props;
  const location = useLocation();
  const navigate = useNavigate();
  const { openSettings } = useSettingsNavigation();
  const [sectionsExpanded, setSectionsExpanded] = useState<SectionsState>({
    main: true,
    personal: true,
  });

  const toggleSection = (section: "main" | "personal") => {
    setSectionsExpanded((prev: SectionsState) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Handle settings click - use prop if provided, otherwise use hook
  const handleSettingsClick = () => {
    if (onSettings) {
      onSettings();
    } else {
      openSettings(); // Opens with default tab from SettingsNavigationProvider
    }
  };

  const navigationItems: NavItem[] = useMemo(
    () => [
      {
        icon: ExploreIcon,
        label: "Dashboard",
        path: "/",
        active: location.pathname === "/",
      },
      {
        icon: AssetsIcon,
        label: "Archive",
        path: "/archive",
        active: location.pathname === "/archive",
      },
      {
        icon: PluginsIcon,
        label: "Plugins",
        path: "/plugins",
        active: location.pathname === "/plugins" || location.pathname.startsWith("/plugins/"),
      },
      {
        icon: CloudUploadIcon,
        label: "DePin Node",
        path: "/depin",
        active: location.pathname === "/depin",
      },
    ],
    [location.pathname]
  );

  const personalItems: NavItem[] = useMemo(
    () => [
      { icon: MyVideosIcon, label: "My Videos", path: "/my-videos", active: location.pathname === "/my-videos" },
      { icon: LikesIcon, label: "Likes", path: "/", active: false }, // TODO: Implement likes feature
      { icon: FoldersIcon, label: "Folders", path: "/", active: false }, // TODO: Implement folders feature
    ],
    [location.pathname]
  );

  return (
    <Box
      sx={{
        width: "240px",
        height: "100vh",
        background: liquidGlassTokens.canvas.base,
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid rgba(255, 255, 255, 0.06)`,
        padding: "20px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Circuit substrate background */}
      <CircuitSubstrateSimple 
        color={liquidGlassTokens.neon.cyan} 
        opacity={0.08} 
        animated={true}
      />
      
      {/* Vertical circuit line accent */}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: "80px",
          bottom: "80px",
          width: "2px",
          background: `linear-gradient(180deg, transparent, ${liquidGlassTokens.neon.cyan}40, transparent)`,
          opacity: 0.5,
        }}
      />

      {/* Brand Logo */}
      <Box sx={{ mb: 4, display: "flex", alignItems: "center", gap: 2, position: "relative", zIndex: 1 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}30 0%, ${liquidGlassTokens.neon.magenta}20 100%)`,
            border: `1px solid ${liquidGlassTokens.neon.cyan}40`,
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
            boxShadow: glowEffects.cyan(0.2),
            "&::before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "50%",
              background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)",
            },
          }}
        >
          <BrainIcon
            sx={{
              color: liquidGlassTokens.neon.cyan,
              fontSize: "20px",
              filter: `drop-shadow(0 0 4px ${liquidGlassTokens.neon.cyan})`,
            }}
          />
        </Box>
        <Typography
          variant="h6"
          sx={{
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
            fontWeight: 600,
            fontSize: "18px",
            color: "rgba(255, 255, 255, 0.95)",
            letterSpacing: "-0.01em",
          }}
        >
          Haven Player
        </Typography>
      </Box>

      {/* Main Navigation */}
      <Box sx={{ mb: 3, position: "relative", zIndex: 1 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
            cursor: "pointer",
            transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
            "&:hover": {
              "& .section-label": {
                color: "rgba(255, 255, 255, 0.7)",
              },
            },
          }}
          onClick={() => toggleSection("main")}
        >
          <Typography
            className="section-label"
            variant="caption"
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              fontWeight: 500,
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              transition: `color ${liquidGlassTokens.motion.durationFast} ease`,
            }}
          >
            Main
          </Typography>
          {sectionsExpanded.main ? (
            <ExpandLessIcon sx={{ fontSize: 16, color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` }} />
          ) : (
            <ExpandMoreIcon sx={{ fontSize: 16, color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` }} />
          )}
        </Box>

        <Collapse in={sectionsExpanded.main}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {navigationItems.map((item: NavItem, index: number) => (
              <NavItemComponent
                key={index}
                item={item}
                onClick={() => navigate(item.path)}
              />
            ))}
          </Box>
        </Collapse>
      </Box>

      {/* Personal Section */}
      <Box sx={{ mb: 3, position: "relative", zIndex: 1 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
            cursor: "pointer",
            transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
            "&:hover": {
              "& .section-label": {
                color: "rgba(255, 255, 255, 0.7)",
              },
            },
          }}
          onClick={() => toggleSection("personal")}
        >
          <Typography
            className="section-label"
            variant="caption"
            sx={{
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              fontWeight: 500,
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              transition: `color ${liquidGlassTokens.motion.durationFast} ease`,
            }}
          >
            Personal
          </Typography>
          {sectionsExpanded.personal ? (
            <ExpandLessIcon sx={{ fontSize: 16, color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` }} />
          ) : (
            <ExpandMoreIcon sx={{ fontSize: 16, color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` }} />
          )}
        </Box>

        <Collapse in={sectionsExpanded.personal}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {personalItems.map((item: NavItem, index: number) => (
              <NavItemComponent
                key={index}
                item={item}
                onClick={() => navigate(item.path)}
              />
            ))}
          </Box>
        </Collapse>
      </Box>

      {/* Spacer */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Divider */}
      <Box
        sx={{
          my: 2,
          height: "1px",
          background: `linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)`,
        }}
      />

      {/* Bottom Actions */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, position: "relative", zIndex: 1 }}>
        <BottomActionItem
          icon={RefreshIcon}
          label="Refresh"
          onClick={onRefresh}
        />
        <BottomActionItem
          icon={SettingsIcon}
          label="Settings"
          onClick={handleSettingsClick}
        />
        <BottomActionItem
          icon={HelpIcon}
          label="Help"
          onClick={onHelp}
        />
      </Box>
    </Box>
  );
};

// Navigation Item Component
const NavItemComponent: React.FC<{ item: NavItem; onClick: () => void }> = ({ item, onClick }) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        px: 2,
        py: 1.5,
        borderRadius: `${liquidGlassTokens.radius.sm}px`,
        cursor: "pointer",
        backgroundColor: item.active 
          ? `${liquidGlassTokens.neon.cyan}15` 
          : "transparent",
        border: item.active
          ? `1px solid ${liquidGlassTokens.neon.cyan}30`
          : "1px solid transparent",
        transition: `all ${liquidGlassTokens.motion.durationFast} ${liquidGlassTokens.motion.enter}`,
        position: "relative",
        overflow: "hidden",
        
        // Active glow
        ...(item.active && {
          boxShadow: glowEffects.cyan(0.1),
        }),
        
        "&:hover": {
          backgroundColor: item.active 
            ? `${liquidGlassTokens.neon.cyan}20` 
            : "rgba(255, 255, 255, 0.04)",
          borderColor: item.active 
            ? `${liquidGlassTokens.neon.cyan}40` 
            : "rgba(255, 255, 255, 0.08)",
          transform: "translateX(2px)",
        },
        
        // Left accent bar for active item
        "&::before": item.active ? {
          content: '""',
          position: "absolute",
          left: 0,
          top: "20%",
          bottom: "20%",
          width: "2px",
          background: liquidGlassTokens.neon.cyan,
          borderRadius: "0 2px 2px 0",
          boxShadow: `0 0 8px ${liquidGlassTokens.neon.cyan}`,
        } : {},
      }}
      onClick={onClick}
    >
      <item.icon
        sx={{
          fontSize: 18,
          color: item.active 
            ? liquidGlassTokens.neon.cyan 
            : `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
          ...(item.active && {
            filter: `drop-shadow(0 0 4px ${liquidGlassTokens.neon.cyan})`,
          }),
        }}
      />
      <Typography
        sx={{
          fontSize: "14px",
          fontWeight: item.active ? 500 : 400,
          color: item.active 
            ? "rgba(255, 255, 255, 0.95)" 
            : `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
        }}
      >
        {item.label}
      </Typography>
    </Box>
  );
};

// Bottom Action Item Component
const BottomActionItem: React.FC<{ 
  icon: React.ElementType; 
  label: string; 
  onClick?: () => void;
}> = ({ icon: Icon, label, onClick }) => {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        px: 2,
        py: 1.5,
        borderRadius: `${liquidGlassTokens.radius.sm}px`,
        cursor: "pointer",
        transition: `all ${liquidGlassTokens.motion.durationFast} ${liquidGlassTokens.motion.enter}`,
        "&:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          "& .action-icon": {
            color: liquidGlassTokens.neon.cyan,
          },
          "& .action-label": {
            color: "rgba(255, 255, 255, 0.9)",
          },
        },
      }}
    >
      <Icon 
        className="action-icon"
        sx={{ 
          fontSize: 18, 
          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
        }} 
      />
      <Typography 
        className="action-label"
        sx={{ 
          fontSize: "14px", 
          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
};

export default Sidebar;
