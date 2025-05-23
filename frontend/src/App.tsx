import React, { useState, useCallback, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import VideoAnalysisList from '@/components/VideoAnalysisList';
import VideoPlayer from '@/components/VideoPlayer';
import ConfigurationModal from '@/components/ConfigurationModal';
import { useVideos } from '@/hooks/useVideos';
import { Video, Timestamp } from '@/types/video';
import { videoService } from '@/services/api';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
    background: {
      default: '#2a2a2a',
      paper: '#2d2d2d',
    },
  },
  typography: {
    fontFamily: '"Segoe UI", "Arial", sans-serif',
  },
});

const MainApp: React.FC = () => {
  const navigate = useNavigate();
  const { videos, loading, error, videoTimestamps, addVideo, refreshVideos, fetchTimestampsForVideo } = useVideos();
  const [analysisStatuses, setAnalysisStatuses] = useState<Record<string, 'pending' | 'analyzing' | 'completed' | 'error'>>({});
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  
  // Initialize hidden videos from localStorage
  const [hiddenVideos, setHiddenVideos] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('haven-player-hidden-videos');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Save hidden videos to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('haven-player-hidden-videos', JSON.stringify([...hiddenVideos]));
    } catch (error) {
      console.error('Failed to save hidden videos to localStorage:', error);
    }
  }, [hiddenVideos]);

  // Filter out hidden videos for display
  const visibleVideos = videos.filter(video => !hiddenVideos.has(video.path));

  // Use actual Electron file dialog
  const handleAddVideo = useCallback(async () => {
    try {
      // Use Electron's file dialog via IPC
      const { ipcRenderer } = require('electron');
      const videoPath = await ipcRenderer.invoke('select-video');
      
      if (!videoPath) return;

      const fileName = videoPath.split(/[/\\]/).pop() || 'video.mp4';
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
        setHiddenVideos(prev => {
          const updated = new Set(prev);
          updated.delete(videoPath);
          return updated;
        });
        console.log(`🔄 Unhiding previously removed video: ${fileName}`);
      }
      
      // Set initial analysis status based on whether AI data was found
      if (newVideo.has_ai_data) {
        setAnalysisStatuses(prev => ({ ...prev, [videoPath]: 'completed' }));
      } else {
        setAnalysisStatuses(prev => ({ ...prev, [videoPath]: 'pending' }));
      }
    } catch (error) {
      console.error('Failed to add video:', error);
    }
  }, [addVideo, hiddenVideos]);

  const handleAnalyzeVideo = useCallback(async (video: Video) => {
    if (video.has_ai_data) {
      // Video already has AI data, just refresh timestamps
      await fetchTimestampsForVideo(video);
      setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'completed' }));
      return;
    }

    setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'analyzing' }));
    
    // Simulate analysis process for videos without existing AI data
    setTimeout(async () => {
      try {
        // In a real implementation, this would trigger actual AI analysis
        // For now, we'll just mark it as completed
        setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'completed' }));
      } catch (error) {
        setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'error' }));
      }
    }, 3000);
  }, [fetchTimestampsForVideo]);

  const handleAnalyzeAll = useCallback(async () => {
    setIsAnalyzingAll(true);
    
    const videosToAnalyze = visibleVideos.filter(video => 
      !analysisStatuses[video.path] || analysisStatuses[video.path] === 'pending' || analysisStatuses[video.path] === 'error'
    );

    for (const video of videosToAnalyze) {
      await handleAnalyzeVideo(video);
    }
    
    setIsAnalyzingAll(false);
  }, [visibleVideos, analysisStatuses, handleAnalyzeVideo]);

  const handlePlayVideo = useCallback((video: Video) => {
    navigate(`/player/${encodeURIComponent(video.path)}`);
  }, [navigate]);

  const handleRemoveVideo = useCallback((video: Video) => {
    // Hide the video from display without deleting from database
    setHiddenVideos(prev => new Set([...prev, video.path]));
    
    // Also remove from analysis statuses to clean up
    setAnalysisStatuses(prev => {
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
      const response = await fetch('http://localhost:8000/api/config/', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save configuration');
      }

      console.log('✅ Configuration saved successfully');
    } catch (error) {
      console.error('❌ Failed to save configuration:', error);
      throw error;
    }
  }, []);

  // Initialize analysis statuses for videos with AI data
  useEffect(() => {
    const newStatuses: Record<string, 'pending' | 'analyzing' | 'completed' | 'error'> = {};
    visibleVideos.forEach(video => {
      if (!(video.path in analysisStatuses)) {
        newStatuses[video.path] = video.has_ai_data ? 'completed' : 'pending';
      }
    });
    
    if (Object.keys(newStatuses).length > 0) {
      setAnalysisStatuses(prev => ({ ...prev, ...newStatuses }));
    }
  }, [visibleVideos, analysisStatuses]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', backgroundColor: '#2a2a2a' }}>
      {/* Sidebar */}
      <Sidebar 
        onRefresh={handleRefresh} 
        onSettings={handleSettings}
      />
      
      {/* Main content area */}
      <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        {/* Header */}
        <Header
          videoCount={visibleVideos.length}
          onAddVideo={handleAddVideo}
          onAnalyzeAll={handleAnalyzeAll}
          isAnalyzing={isAnalyzingAll}
        />
        
        {/* Video analysis list */}
        <VideoAnalysisList
          videos={visibleVideos}
          videoTimestamps={videoTimestamps}
          analysisStatuses={analysisStatuses}
          onPlay={handlePlayVideo}
          onAnalyze={handleAnalyzeVideo}
          onRemove={handleRemoveVideo}
        />
      </Box>

      {/* Configuration Modal */}
      <ConfigurationModal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onSave={handleConfigSave}
      />
    </Box>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={<MainApp />} />
          <Route path="/player/:videoPath" element={<VideoPlayer />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
};

export default App; 