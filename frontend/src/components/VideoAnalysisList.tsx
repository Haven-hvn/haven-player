import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  LinearProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Analytics as AnalyzeIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Refresh as RetryIcon,
  RemoveCircleOutline as RemoveIcon,
} from '@mui/icons-material';
import { Video, Timestamp } from '@/types/video';

interface AnalysisSegment {
  start: number;
  end: number;
  type: 'analyzed' | 'unanalyzed';
  confidence?: number;
}

interface VideoAnalysisItemProps {
  video: Video;
  index: number;
  timestamps: Timestamp[];
  analysisStatus: 'pending' | 'analyzing' | 'completed' | 'error';
  onPlay: (video: Video) => void;
  onAnalyze: (video: Video) => void;
  onRemove: (video: Video) => void;
}

const VideoAnalysisItem: React.FC<VideoAnalysisItemProps> = ({
  video,
  index,
  timestamps,
  analysisStatus,
  onPlay,
  onAnalyze,
  onRemove,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 6,
          }
        : null,
    );
  };

  const handleClose = () => {
    setContextMenu(null);
  };

  const handleRemoveClick = () => {
    onRemove(video);
    handleClose();
  };

  // Generate analysis segments from timestamps
  const generateAnalysisSegments = (): AnalysisSegment[] => {
    console.log(`🎬 Generating segments for ${video.title}:`, {
      timestampsLength: timestamps.length,
      timestamps: timestamps,
      videoDuration: video.duration,
      hasAiData: video.has_ai_data
    });

    if (!timestamps.length) {
      console.log(`⚪ No timestamps for ${video.title}, showing as unanalyzed`);
      return [{ start: 0, end: video.duration, type: 'unanalyzed' }];
    }

    const segments: AnalysisSegment[] = [];
    const sortedTimestamps = [...timestamps].sort((a, b) => a.start_time - b.start_time);
    
    let currentTime = 0;
    
    sortedTimestamps.forEach((timestamp) => {
      // Add unanalyzed segment before this timestamp if there's a gap
      if (timestamp.start_time > currentTime) {
        segments.push({
          start: currentTime,
          end: timestamp.start_time,
          type: 'unanalyzed',
        });
      }
      
      // Add analyzed segment
      segments.push({
        start: timestamp.start_time,
        end: timestamp.end_time || timestamp.start_time + 1,
        type: 'analyzed',
        confidence: timestamp.confidence,
      });
      
      currentTime = timestamp.end_time || timestamp.start_time + 1;
    });
    
    // Add final unanalyzed segment if needed
    if (currentTime < video.duration) {
      segments.push({
        start: currentTime,
        end: video.duration,
        type: 'unanalyzed',
      });
    }
    
    console.log(`🔵 Generated ${segments.length} segments for ${video.title}:`, segments);
    return segments;
  };

  const segments = generateAnalysisSegments();

  const getStatusIcon = () => {
    switch (analysisStatus) {
      case 'pending':
        return <Box sx={{ width: 16, height: 16, border: '2px solid #666', borderRadius: '50%' }} />;
      case 'analyzing':
        return <CircularProgress size={16} sx={{ color: '#90caf9' }} />;
      case 'completed':
        return <CheckIcon sx={{ color: '#4caf50', fontSize: 16 }} />;
      case 'error':
        return <ErrorIcon sx={{ color: '#f44336', fontSize: 16 }} />;
      default:
        return null;
    }
  };

  const getActionButton = () => {
    switch (analysisStatus) {
      case 'completed':
        return (
          <IconButton onClick={() => onPlay(video)} size="small">
            <PlayIcon />
          </IconButton>
        );
      case 'error':
        return (
          <IconButton onClick={() => onAnalyze(video)} size="small">
            <RetryIcon />
          </IconButton>
        );
      default:
        return (
          <IconButton onClick={() => onAnalyze(video)} size="small" disabled={analysisStatus === 'analyzing'}>
            <AnalyzeIcon />
          </IconButton>
        );
    }
  };

  return (
    <>
      <Box
        onContextMenu={handleContextMenu}
        sx={{
          display: 'flex',
          alignItems: 'center',
          p: 2,
          backgroundColor: '#1e1e1e',
          borderBottom: '1px solid #3a3a3a',
          cursor: 'pointer',
          '&:hover': { backgroundColor: '#252525' },
        }}
      >
        {/* Video thumbnail */}
        <Box
          sx={{
            width: 160,
            height: 90,
            backgroundColor: '#333',
            borderRadius: 1,
            overflow: 'hidden',
            mr: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {video.thumbnail_path ? (
            <img
              src={video.thumbnail_path}
              alt={video.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Typography sx={{ color: '#666', fontSize: '12px' }}>No thumbnail</Typography>
          )}
        </Box>

        {/* Video metadata */}
        <Box sx={{ minWidth: 200, mr: 3 }}>
          <Typography sx={{ color: 'white', fontWeight: 500, mb: 0.5 }}>
            {index + 1}. {video.title}
          </Typography>
          <Typography sx={{ color: '#999', fontSize: '14px' }}>
            Duration: {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
          </Typography>
        </Box>

        {/* AI Analysis Visualization Bar */}
        <Box sx={{ flexGrow: 1, mr: 3 }}>
          <Box
            sx={{
              height: 8,
              backgroundColor: '#444',
              borderRadius: 1,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {segments.map((segment, segmentIndex) => (
              <Box
                key={segmentIndex}
                sx={{
                  position: 'absolute',
                  left: `${(segment.start / video.duration) * 100}%`,
                  width: `${((segment.end - segment.start) / video.duration) * 100}%`,
                  height: '100%',
                  backgroundColor: segment.type === 'analyzed' ? '#90caf9' : '#666',
                  opacity: segment.confidence ? Math.max(0.5, segment.confidence) : 1,
                }}
              />
            ))}
            
            {/* Progress overlay for analyzing state */}
            {analysisStatus === 'analyzing' && (
              <LinearProgress
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  '& .MuiLinearProgress-bar': { backgroundColor: '#90caf9' },
                }}
              />
            )}
          </Box>
        </Box>

        {/* Status indicator */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2, minWidth: 80 }}>
          {getStatusIcon()}
          <Typography sx={{ color: '#999', fontSize: '12px', textTransform: 'capitalize' }}>
            {analysisStatus}
          </Typography>
        </Box>

        {/* Action button */}
        <Box sx={{ minWidth: 40 }}>
          {getActionButton()}
        </Box>
      </Box>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        slotProps={{
          paper: {
            sx: {
              backgroundColor: '#2d2d2d',
              border: '1px solid #3a3a3a',
            },
          },
        }}
      >
        <MenuItem onClick={handleRemoveClick}>
          <ListItemIcon>
            <RemoveIcon sx={{ color: '#f44336' }} />
          </ListItemIcon>
          <ListItemText 
            primary="Remove from list" 
            sx={{ 
              '& .MuiTypography-root': { 
                color: '#f44336',
                fontSize: '14px',
              } 
            }} 
          />
        </MenuItem>
      </Menu>
    </>
  );
};

interface VideoAnalysisListProps {
  videos: Video[];
  videoTimestamps: Record<string, Timestamp[]>;
  analysisStatuses: Record<string, 'pending' | 'analyzing' | 'completed' | 'error'>;
  onPlay: (video: Video) => void;
  onAnalyze: (video: Video) => void;
  onRemove: (video: Video) => void;
}

const VideoAnalysisList: React.FC<VideoAnalysisListProps> = ({
  videos,
  videoTimestamps,
  analysisStatuses,
  onPlay,
  onAnalyze,
  onRemove,
}) => {
  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
      {videos.map((video, index) => (
        <VideoAnalysisItem
          key={video.path}
          video={video}
          index={index}
          timestamps={videoTimestamps[video.path] || []}
          analysisStatus={analysisStatuses[video.path] || 'pending'}
          onPlay={onPlay}
          onAnalyze={onAnalyze}
          onRemove={onRemove}
        />
      ))}
      
      {videos.length === 0 && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '400px',
            color: '#666',
          }}
        >
          <Typography variant="h6" sx={{ mb: 1 }}>
            No videos added yet
          </Typography>
          <Typography variant="body2">
            Click the + button to add your first video for analysis
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default VideoAnalysisList; 