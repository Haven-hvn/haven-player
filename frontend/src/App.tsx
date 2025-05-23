import React, { useState, useCallback } from 'react';
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import VideoAnalysisList from '@/components/VideoAnalysisList';
import VideoPlayer from '@/components/VideoPlayer';
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
  const { videos, loading, error, addVideo, refreshVideos } = useVideos();
  const [videoTimestamps, setVideoTimestamps] = useState<Record<string, Timestamp[]>>({});
  const [analysisStatuses, setAnalysisStatuses] = useState<Record<string, 'pending' | 'analyzing' | 'completed' | 'error'>>({});
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);

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
        has_ai_data: false,
        thumbnail_path: null,
      };

      await addVideo(videoData);
      setAnalysisStatuses(prev => ({ ...prev, [videoPath]: 'pending' }));
    } catch (error) {
      console.error('Failed to add video:', error);
    }
  }, [addVideo]);

  const handleAnalyzeVideo = useCallback(async (video: Video) => {
    setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'analyzing' }));
    
    // Simulate analysis process
    setTimeout(async () => {
      try {
        // Mock timestamps data
        const mockTimestamps: Timestamp[] = [
          {
            id: 1,
            video_path: video.path,
            tag_name: 'person',
            start_time: 10,
            end_time: 30,
            confidence: 0.9,
          },
          {
            id: 2,
            video_path: video.path,
            tag_name: 'car',
            start_time: 45,
            end_time: 75,
            confidence: 0.8,
          },
        ];

        setVideoTimestamps(prev => ({ ...prev, [video.path]: mockTimestamps }));
        setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'completed' }));
      } catch (error) {
        setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'error' }));
      }
    }, 3000);
  }, []);

  const handleAnalyzeAll = useCallback(async () => {
    setIsAnalyzingAll(true);
    
    const videosToAnalyze = videos.filter(video => 
      !analysisStatuses[video.path] || analysisStatuses[video.path] === 'pending' || analysisStatuses[video.path] === 'error'
    );

    for (const video of videosToAnalyze) {
      await handleAnalyzeVideo(video);
    }
    
    setIsAnalyzingAll(false);
  }, [videos, analysisStatuses, handleAnalyzeVideo]);

  const handlePlayVideo = useCallback((video: Video) => {
    navigate(`/player/${encodeURIComponent(video.path)}`);
  }, [navigate]);

  const handleRefresh = useCallback(() => {
    refreshVideos();
  }, [refreshVideos]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', backgroundColor: '#2a2a2a' }}>
      {/* Sidebar */}
      <Sidebar onRefresh={handleRefresh} />
      
      {/* Main content area */}
      <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        {/* Header */}
        <Header
          videoCount={videos.length}
          onAddVideo={handleAddVideo}
          onAnalyzeAll={handleAnalyzeAll}
          isAnalyzing={isAnalyzingAll}
        />
        
        {/* Video analysis list */}
        <VideoAnalysisList
          videos={videos}
          videoTimestamps={videoTimestamps}
          analysisStatuses={analysisStatuses}
          onPlay={handlePlayVideo}
          onAnalyze={handleAnalyzeVideo}
        />
      </Box>
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