import React, { useState, useCallback, useEffect, useMemo, lazy } from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ThemeProvider, CssBaseline, Box, CircularProgress } from "@mui/material";
import { liquidGlassTheme, liquidGlassTokens } from "@/styles/liquidGlassTheme";
import { CircuitSubstrate } from "@/components/LiquidGlass";

// Lazy load components for code splitting
const LogViewer = lazy(() => import("./components/LogViewer"));
const VideoPlayer = lazy(() => import("@/components/VideoPlayer"));
const ConfigurationModal = lazy(() => import("@/components/ConfigurationModal"));
const SpatialLayout = lazy(() => import("@/components/SpatialArchitecture").then(m => ({ default: m.SpatialLayout })));

// Loading fallback component
const RouteLoader: React.FC = () => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      backgroundColor: 'transparent',
    }}
  >
    <CircularProgress sx={{ color: liquidGlassTokens.neon.cyan }} />
  </Box>
);

import { useVideos } from "@/hooks/useVideos";
import { usePlugins } from "@/hooks/usePlugins";
import { useFilecoinUpload } from "@/hooks/useFilecoinUpload";
import type { FilecoinConfig } from "@/types/filecoin";
import {
  SettingsNavigationProvider,
  useSettingsNavigation,
} from "@/context/SettingsNavigationContext";

// Wrapper component for SpatialLayout with upload handling
const SpatialLayoutWrapper: React.FC = () => {
  const { refreshVideos, addVideo } = useVideos();
  const { uploadVideo: uploadVideoToFilecoin } = useFilecoinUpload();
  const { plugins } = usePlugins();
  const [filecoinConfig, setFilecoinConfig] = useState<FilecoinConfig | null>(null);
  const { openSettings } = useSettingsNavigation();

  // Load Filecoin config on mount
  useEffect(() => {
    const loadFilecoinConfig = async () => {
      try {
        const { ipcRenderer } = require("electron");
        const config = await ipcRenderer.invoke("get-filecoin-config");
        if (config) {
          setFilecoinConfig(config);
        }
      } catch (error) {
        console.error("Failed to load Filecoin config:", error);
      }
    };
    loadFilecoinConfig();
  }, []);

  // BitTorrent plugin detection
  const isBitTorrentEnabled = useMemo(() => {
    const bittorrentPlugin = plugins.find((p) => p.name === "BitTorrentPlugin");
    return bittorrentPlugin ? bittorrentPlugin.enabled : false;
  }, [plugins]);

  const handleUploadVideo = useCallback(
    async (item: any) => {
      if (!filecoinConfig) {
        openSettings("filecoin");
        return;
      }

      try {
        // Find the video path from the item
        const videoPath = item.sourceIdentity;
        await uploadVideoToFilecoin(videoPath, filecoinConfig);
        console.log(`✅ Uploaded ${item.title} to Filecoin`);
        await refreshVideos();
      } catch (error) {
        console.error(`❌ Failed to upload ${item.title} to Filecoin:`, error);
      }
    },
    [filecoinConfig, uploadVideoToFilecoin, refreshVideos, openSettings]
  );

  // Handle adding video from local file (Electron file dialog)
  const handleAddVideo = useCallback(async () => {
    try {
      const { ipcRenderer } = require("electron");
      const videoPath = await ipcRenderer.invoke("select-video");

      if (!videoPath) return;

      const fileName = videoPath.split(/[/\\]/).pop() || "video.mp4";
      const videoData = {
        path: videoPath,
        title: fileName,
        duration: 120,
        has_ai_data: false,
        thumbnail_path: null,
      };

      await addVideo(videoData);
      console.log(`✅ Added video: ${fileName}`);
    } catch (error) {
      console.error("Failed to add video:", error);
    }
  }, [addVideo]);

  // Handle adding magnet URL
  const handleAddMagnetUrl = useCallback(
    async (url: string) => {
      try {
        const { ipcRenderer } = require("electron");
        const infohashMatch = url.match(/urn:btih:([a-zA-Z0-9]{40})/);
        if (!infohashMatch) {
          throw new Error("Invalid magnet URL");
        }
        const infohash = infohashMatch[1];

        await ipcRenderer.invoke("add-magnet-url", url);
        console.log(`✅ Added magnet URL: ${infohash}`);

        // The main process will handle the download and add the video
        // to the database. We just need to refresh the video list.
        await refreshVideos();
      } catch (error) {
        console.error("Failed to add magnet URL:", error);
      }
    },
    [refreshVideos]
  );

  return (
    <SpatialLayout
      onUploadVideo={handleUploadVideo}
      onAddVideo={handleAddVideo}
      onAddMagnetUrl={handleAddMagnetUrl}
      isBitTorrentEnabled={isBitTorrentEnabled}
    />
  );
};

// Global Configuration Modal wrapper - provides all necessary state across the app
const GlobalConfigurationModal: React.FC = () => {
  const {
    isOpen: settingsOpen,
    activeTab: settingsActiveTab,
    closeSettings,
    setActiveTab,
  } = useSettingsNavigation();
  const [filecoinConfig, setFilecoinConfig] = useState<FilecoinConfig | null>(null);

  // Load Filecoin config on mount
  useEffect(() => {
    const loadFilecoinConfig = async () => {
      try {
        const { ipcRenderer } = require("electron");
        const config = await ipcRenderer.invoke("get-filecoin-config");
        if (config) {
          setFilecoinConfig(config);
        }
      } catch (error) {
        console.error("Failed to load Filecoin config:", error);
      }
    };
    loadFilecoinConfig();
  }, []);

  const handleConfigSave = useCallback(
    async (configToSave: any) => {
      try {
        const response = await fetch("http://localhost:8000/api/config/", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(configToSave),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Failed to save configuration");
        }

        console.log("✅ Configuration saved successfully");
      } catch (error) {
        console.error("❌ Failed to save configuration:", error);
        throw error;
      }
    },
    []
  );

  const handleFilecoinConfigSave = useCallback(async (config: FilecoinConfig) => {
    setFilecoinConfig(config);
    console.log("✅ Filecoin configuration saved");
  }, []);

  return (
    <ConfigurationModal
      open={settingsOpen}
      activeTab={settingsActiveTab}
      onTabChange={setActiveTab}
      onClose={closeSettings}
      onSave={handleConfigSave}
      onSaveFilecoin={handleFilecoinConfigSave}
      initialFilecoinConfig={filecoinConfig}
    />
  );
};

const App: React.FC = () => {
  return (
    <SettingsNavigationProvider>
      <ThemeProvider theme={liquidGlassTheme}>
        <CssBaseline />
        <Box
          sx={{
            backgroundColor: 'transparent',
            minHeight: "100vh",
            padding: "0",
            position: "relative",
          }}
        >
          {/* Global Circuit Substrate Background */}
          <CircuitSubstrate
            density={4}
            opacity={0.15}
            animated={true}
          />
          <Router>
            <Routes>
              {/* Archive is now the main entry point */}
              <Route path="/" element={<Navigate to="/archive" replace />} />
              <Route path="/archive" element={<SpatialLayoutWrapper />} />
              
              {/* Video player route - still needed for playback */}
              <Route path="/player/:videoPath" element={<VideoPlayer />} />
              
              {/* Redirect old routes to archive */}
              <Route path="/my-videos" element={<Navigate to="/archive" replace />} />
              <Route path="/depin" element={<Navigate to="/archive" replace />} />
              <Route path="/plugins" element={<Navigate to="/archive" replace />} />
              <Route path="/plugins/*" element={<Navigate to="/archive" replace />} />
            </Routes>
          </Router>
          {/* Global Configuration Modal - available from all routes */}
          <GlobalConfigurationModal />
          {/* Log Viewer - always available */}
          <LogViewer />
        </Box>
      </ThemeProvider>
    </SettingsNavigationProvider>
  );
};

export default App;
