import React, { useState, useCallback, useEffect } from "react";
import LogViewer from "./components/LogViewer";
import {
  HashRouter as Router,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";
import { ThemeProvider, CssBaseline, Box } from "@mui/material";
import { createTheme } from "@mui/material/styles";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import VideoAnalysisList from "@/components/VideoAnalysisList";
import VideoPlayer from "@/components/VideoPlayer";
import ConfigurationModal from "@/components/ConfigurationModal";
import FilecoinConfigModal from "@/components/FilecoinConfigModal";
import { useVideos } from "@/hooks/useVideos";
import { useFilecoinUpload } from "@/hooks/useFilecoinUpload";
import { Video, Timestamp } from "@/types/video";
import type { FilecoinConfig } from "@/types/filecoin";
import {
  videoService,
  startAnalysisJob,
  getVideoJobs,
  JobProgress,
} from "@/services/api";
import LivestreamRecorderPage from "@/components/LivestreamRecorder/LivestreamRecorderPage";

const modernTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#000000",
      light: "#6B6B6B",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#F9A825",
      light: "#4CAF50",
    },
    background: {
      default: "#FFFFFF",
      paper: "#F7F7F7",
    },
    text: {
      primary: "#000000",
      secondary: "#6B6B6B",
    },
    error: {
      main: "#FF4D4D",
    },
    grey: {
      50: "#FAFAFA",
      100: "#F5F5F5",
      200: "#EEEEEE",
      300: "#E0E0E0",
      400: "#BDBDBD",
      500: "#9E9E9E",
    },
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
    h1: {
      fontWeight: 500,
      fontSize: "2rem",
    },
    h2: {
      fontWeight: 500,
      fontSize: "1.5rem",
    },
    h3: {
      fontWeight: 500,
      fontSize: "1.25rem",
    },
    body1: {
      fontWeight: 400,
      fontSize: "0.875rem",
      lineHeight: 1.5,
    },
    body2: {
      fontWeight: 400,
      fontSize: "0.75rem",
      lineHeight: 1.4,
    },
    button: {
      fontWeight: 500,
      textTransform: "none",
      fontSize: "0.875rem",
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: "8px",
          textTransform: "none",
          fontWeight: 500,
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          },
        },
        contained: {
          background: "linear-gradient(135deg, #000000 0%, #424242 100%)",
          "&:hover": {
            background: "linear-gradient(135deg, #424242 0%, #000000 100%)",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: "12px",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.08)",
          border: "1px solid #F0F0F0",
        },
        elevation1: {
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.06)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
          border: "1px solid #F0F0F0",
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
            transform: "translateY(-2px)",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: "8px",
            backgroundColor: "#FAFAFA",
            "& fieldset": {
              borderColor: "#E0E0E0",
            },
            "&:hover fieldset": {
              borderColor: "#BDBDBD",
            },
            "&.Mui-focused fieldset": {
              borderColor: "#000000",
              borderWidth: "2px",
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: "20px",
          fontWeight: 500,
          fontSize: "0.75rem",
        },
      },
    },
  },
});

const MainApp: React.FC = () => {
  const navigate = useNavigate();
  const {
    videos,
    loading,
    error,
    videoTimestamps,
    addVideo,
    refreshVideos,
    fetchTimestampsForVideo,
  } = useVideos();
  const [analysisStatuses, setAnalysisStatuses] = useState<
    Record<string, "pending" | "analyzing" | "completed" | "error">
  >({});
  const [activeJobs, setActiveJobs] = useState<Record<string, number>>({});
  const [jobProgresses, setJobProgresses] = useState<Record<string, number>>(
    {}
  );
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [filecoinConfigModalOpen, setFilecoinConfigModalOpen] = useState(false);
  const [filecoinConfig, setFilecoinConfig] = useState<FilecoinConfig | null>(null);

  // Filecoin upload hook
  const { uploadStatus, uploadVideo: uploadVideoToFilecoin } = useFilecoinUpload();

  // Add search and view mode state
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Initialize hidden videos from localStorage
  const [hiddenVideos, setHiddenVideos] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("haven-player-hidden-videos");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Handle keyboard shortcuts (Command+K for search)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        // Focus the search input using the data attribute
        const searchInput = document.querySelector(
          'input[data-search-input="true"]'
        ) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Clear search on Escape
      if (event.key === "Escape" && searchQuery) {
        setSearchQuery("");
        // Also clear the search in the header component
        const searchInput = document.querySelector(
          'input[data-search-input="true"]'
        ) as HTMLInputElement;
        if (searchInput) {
          searchInput.value = "";
          // Trigger the change event to update the header state
          const changeEvent = new Event("input", { bubbles: true });
          searchInput.dispatchEvent(changeEvent);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery]);

  // Save hidden videos to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(
        "haven-player-hidden-videos",
        JSON.stringify([...hiddenVideos])
      );
    } catch (error) {
      console.error("Failed to save hidden videos to localStorage:", error);
    }
  }, [hiddenVideos]);

  // Load view mode preference from localStorage on mount
  useEffect(() => {
    try {
      const savedViewMode = localStorage.getItem("haven-player-view-mode");
      if (savedViewMode === "grid" || savedViewMode === "list") {
        setViewMode(savedViewMode);
      }
    } catch (error) {
      console.error("Failed to load view mode preference:", error);
    }
  }, []);

  // Filter out hidden videos and apply search filter
  const visibleVideos = videos
    .filter((video) => !hiddenVideos.has(video.path))
    .filter((video) => {
      if (!searchQuery.trim()) return true;

      const query = searchQuery.toLowerCase();
      const searchableFields = [
        video.title.toLowerCase(),
        video.path.toLowerCase(),
        ...(videoTimestamps[video.path]?.map((ts) =>
          ts.tag_name.toLowerCase()
        ) || []),
      ];

      return searchableFields.some((field) => field.includes(query));
    });

  // Handle search query changes
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Handle view mode changes
  const handleViewModeChange = useCallback((mode: "grid" | "list") => {
    setViewMode(mode);
    // Optionally save to localStorage
    try {
      localStorage.setItem("haven-player-view-mode", mode);
    } catch (error) {
      console.error("Failed to save view mode preference:", error);
    }
  }, []);

  // Use actual Electron file dialog
  const handleAddVideo = useCallback(async () => {
    try {
      // Use Electron's file dialog via IPC
      const { ipcRenderer } = require("electron");
      const videoPath = await ipcRenderer.invoke("select-video");

      if (!videoPath) return;

      const fileName = videoPath.split(/[/\\]/).pop() || "video.mp4";
      const videoData = {
        path: videoPath,
        title: fileName,
        duration: 120, // Mock duration - in real app, would extract from file
        has_ai_data: false, // Will be set automatically by backend if AI file exists
        thumbnail_path: null,
      };

      const newVideo = await addVideo(videoData);

      // If user is re-adding a previously hidden video, unhide it
      if (hiddenVideos.has(videoPath)) {
        setHiddenVideos((prev) => {
          const updated = new Set(prev);
          updated.delete(videoPath);
          return updated;
        });
        console.log(`🔄 Unhiding previously removed video: ${fileName}`);
      }

      // Set initial analysis status based on whether AI data was found
      if (newVideo.has_ai_data) {
        setAnalysisStatuses((prev) => ({ ...prev, [videoPath]: "completed" }));
      } else {
        setAnalysisStatuses((prev) => ({ ...prev, [videoPath]: "pending" }));
      }
    } catch (error) {
      console.error("Failed to add video:", error);
    }
  }, [addVideo, hiddenVideos]);

  const handleAnalyzeVideo = useCallback(
    async (video: Video) => {
      if (video.has_ai_data) {
        // Video already has AI data, just refresh timestamps
        await fetchTimestampsForVideo(video);
        setAnalysisStatuses((prev) => ({ ...prev, [video.path]: "completed" }));
        return;
      }

      try {
        // Start analysis job
        const response = await startAnalysisJob(video.path);
        const jobId = response.job_id;

        // Track the job
        setActiveJobs((prev) => ({ ...prev, [video.path]: jobId }));
        setAnalysisStatuses((prev) => ({ ...prev, [video.path]: "analyzing" }));
        setJobProgresses((prev) => ({ ...prev, [video.path]: 0 }));

        // Start polling for job progress
        const pollInterval = setInterval(async () => {
          try {
            const jobs = await getVideoJobs(video.path);
            const currentJob = jobs.find((job) => job.id === jobId);

            if (currentJob) {
              setJobProgresses((prev) => ({
                ...prev,
                [video.path]: currentJob.progress,
              }));

              if (currentJob.status === "completed") {
                setAnalysisStatuses((prev) => ({
                  ...prev,
                  [video.path]: "completed",
                }));
                setActiveJobs((prev) => {
                  const updated = { ...prev };
                  delete updated[video.path];
                  return updated;
                });
                // Refresh video data to get new timestamps
                await fetchTimestampsForVideo(video);
                await refreshVideos();
                clearInterval(pollInterval);
              } else if (currentJob.status === "failed") {
                setAnalysisStatuses((prev) => ({
                  ...prev,
                  [video.path]: "error",
                }));
                setActiveJobs((prev) => {
                  const updated = { ...prev };
                  delete updated[video.path];
                  return updated;
                });
                clearInterval(pollInterval);
              }
            }
          } catch (error) {
            console.error("Error polling job status:", error);
          }
        }, 1000);
      } catch (error) {
        console.error("Failed to start analysis:", error);
        setAnalysisStatuses((prev) => ({ ...prev, [video.path]: "error" }));
      }
    },
    [fetchTimestampsForVideo, refreshVideos]
  );

  const handleAnalyzeAll = useCallback(async () => {
    setIsAnalyzingAll(true);

    const videosToAnalyze = visibleVideos.filter(
      (video) =>
        !analysisStatuses[video.path] ||
        analysisStatuses[video.path] === "pending" ||
        analysisStatuses[video.path] === "error"
    );

    for (const video of videosToAnalyze) {
      await handleAnalyzeVideo(video);
    }

    setIsAnalyzingAll(false);
  }, [visibleVideos, analysisStatuses, handleAnalyzeVideo]);

  const handlePlayVideo = useCallback(
    (video: Video) => {
      navigate(`/player/${encodeURIComponent(video.path)}`);
    },
    [navigate]
  );

  const handleRemoveVideo = useCallback((video: Video) => {
    // Hide the video from display without deleting from database
    setHiddenVideos((prev) => new Set([...prev, video.path]));

    // Also remove from analysis statuses to clean up
    setAnalysisStatuses((prev) => {
      const updated = { ...prev };
      delete updated[video.path];
      return updated;
    });

    console.log(`🗑️ Hiding video from list: ${video.title}`);
  }, []);

  const handleRefresh = useCallback(() => {
    refreshVideos();
  }, [refreshVideos]);

  const handleSettings = useCallback(() => {
    setConfigModalOpen(true);
  }, []);

  const handleConfigSave = useCallback(async (config: any) => {
    try {
      const response = await fetch("http://localhost:8000/api/config/", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
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
  }, []);

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

  // Handle Filecoin upload
  const handleUploadToFilecoin = useCallback(
    async (video: Video) => {
      if (!filecoinConfig) {
        setFilecoinConfigModalOpen(true);
        return;
      }

      try {
        await uploadVideoToFilecoin(video.path, filecoinConfig);
        console.log(`✅ Uploaded ${video.title} to Filecoin`);
      } catch (error) {
        console.error(`❌ Failed to upload ${video.title} to Filecoin:`, error);
        // Error is already handled by the upload hook
      }
    },
    [filecoinConfig, uploadVideoToFilecoin]
  );

  // Handle Filecoin config save
  const handleFilecoinConfigSave = useCallback(async (config: FilecoinConfig) => {
    setFilecoinConfig(config);
    console.log("✅ Filecoin configuration saved");
  }, []);

  // Initialize analysis statuses for videos with AI data
  useEffect(() => {
    const newStatuses: Record<
      string,
      "pending" | "analyzing" | "completed" | "error"
    > = {};
    visibleVideos.forEach((video) => {
      if (!(video.path in analysisStatuses)) {
        newStatuses[video.path] = video.has_ai_data ? "completed" : "pending";
      }
    });

    if (Object.keys(newStatuses).length > 0) {
      setAnalysisStatuses((prev) => ({ ...prev, ...newStatuses }));
    }
  }, [visibleVideos, analysisStatuses]);

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        backgroundColor: "#FFFFFF",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
        margin: "8px",
        border: "1px solid #F0F0F0",
      }}
    >
      {/* Sidebar */}
      <Box
        sx={{
          background: "linear-gradient(180deg, #FAFAFA 0%, #F7F7F7 100%)",
          borderRight: "1px solid #E8E8E8",
        }}
      >
        <Sidebar onRefresh={handleRefresh} onSettings={handleSettings} />
      </Box>

      {/* Main content area */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          backgroundColor: "#FFFFFF",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            borderBottom: "1px solid #F0F0F0",
            backgroundColor: "#FAFAFA",
            backdropFilter: "blur(8px)",
          }}
        >
          <Header
            videoCount={visibleVideos.length}
            onAddVideo={handleAddVideo}
            onAnalyzeAll={handleAnalyzeAll}
            isAnalyzing={isAnalyzingAll}
            onSearch={handleSearch}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
          />
        </Box>

        {/* Video analysis list */}
        <Box
          sx={{
            flexGrow: 1,
            backgroundColor: "#FFFFFF",
            padding: "16px",
          }}
        >
          <VideoAnalysisList
            videos={visibleVideos}
            videoTimestamps={videoTimestamps}
            analysisStatuses={analysisStatuses}
            jobProgresses={jobProgresses}
            viewMode={viewMode}
            onPlay={handlePlayVideo}
            onAnalyze={handleAnalyzeVideo}
            onRemove={handleRemoveVideo}
            onUpload={handleUploadToFilecoin}
            uploadStatuses={uploadStatus}
          />
        </Box>
      </Box>

      {/* Configuration Modal */}
      <ConfigurationModal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onSave={handleConfigSave}
      />

      {/* Filecoin Configuration Modal */}
      <FilecoinConfigModal
        open={filecoinConfigModalOpen}
        onClose={() => setFilecoinConfigModalOpen(false)}
        onSave={handleFilecoinConfigSave}
      />
    </Box>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider theme={modernTheme}>
      <CssBaseline />
      <Box
        sx={{
          backgroundColor: "#F5F5F5",
          minHeight: "100vh",
          padding: "0",
        }}
      >
        <Router>
          <Routes>
            <Route path="/" element={<MainApp />} />
            <Route
              path="/livestream-recorder"
              element={
                <Box
                  sx={{
                    display: "flex",
                    height: "100vh",
                    backgroundColor: "#FFFFFF",
                    borderRadius: "16px",
                    overflow: "hidden",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
                    margin: "8px",
                    border: "1px solid #F0F0F0",
                  }}
                >
                  <Box
                    sx={{
                      background: "linear-gradient(180deg, #FAFAFA 0%, #F7F7F7 100%)",
                      borderRight: "1px solid #E8E8E8",
                    }}
                  >
                    <Sidebar />
                  </Box>

                  <Box sx={{ flexGrow: 1, backgroundColor: "#FFFFFF" }}>
                    <Box
                      sx={{
                        flexGrow: 1,
                        backgroundColor: "#FFFFFF",
                        padding: "16px",
                        height: "100%",
                        overflow: "auto",
                      }}
                    >
                      <LivestreamRecorderPage />
                    </Box>
                  </Box>
                </Box>
              }
            />
            <Route path="/player/:videoPath" element={<VideoPlayer />} />
          </Routes>
        </Router>
        {/* Log Viewer - always available */}
        <LogViewer />
      </Box>
    </ThemeProvider>
  );
};

export default App;
