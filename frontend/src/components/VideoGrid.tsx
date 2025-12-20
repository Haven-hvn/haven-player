import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardMedia,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Box,
  CircularProgress,
  ListItemIcon,
  ListItemText,
  Chip,
  Stack,
} from '@mui/material';
import { 
  MoreVert as MoreVertIcon, 
  CloudUpload as UploadIcon,
  Storage as StorageIcon,
  CloudQueue as CloudIcon,
} from '@mui/icons-material';
import { useVideos } from '@/hooks/useVideos';
import { Video } from '@/types/video';
import { fileExistsViaIpc } from '@/services/playbackConfig';

interface VideoGridProps {
  onUpload?: (video: Video) => void;
}

interface VideoAvailability {
  local: boolean;
  ipfs: boolean;
}

const VideoGrid: React.FC<VideoGridProps> = ({ onUpload }) => {
  const navigate = useNavigate();
  const { videos, loading, error, deleteVideo, moveToFront } = useVideos();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [selectedVideo, setSelectedVideo] = React.useState<Video | null>(null);
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, VideoAvailability>>({});

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, video: Video) => {
    setAnchorEl(event.currentTarget);
    setSelectedVideo(video);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedVideo(null);
  };

  const handlePlay = (video: Video) => {
    navigate(`/player/${encodeURIComponent(video.path)}`);
  };

  const handleDelete = async () => {
    if (selectedVideo) {
      await deleteVideo(selectedVideo.path);
      handleMenuClose();
    }
  };

  const handleMoveToFront = async () => {
    if (selectedVideo) {
      await moveToFront(selectedVideo.path);
      handleMenuClose();
    }
  };

  // Check availability for videos
  useEffect(() => {
    const checkAvailability = async () => {
      const availability: Record<string, VideoAvailability> = {};
      
      for (const video of videos) {
        const hasIpfs = Boolean(video.filecoin_root_cid);
        try {
          const hasLocal = await fileExistsViaIpc(video.path);
          availability[video.path] = {
            local: hasLocal,
            ipfs: hasIpfs,
          };
        } catch (error) {
          console.error(`Failed to check local availability for ${video.path}:`, error);
          availability[video.path] = {
            local: false,
            ipfs: hasIpfs,
          };
        }
      }
      
      setAvailabilityMap(availability);
    };

    if (videos.length > 0) {
      checkAvailability();
    }
  }, [videos]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(4, 1fr)',
          },
          gap: 3,
        }}
      >
        {videos.map((video) => (
          <Card
            key={video.path}
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer',
              '&:hover': {
                transform: 'scale(1.02)',
                transition: 'transform 0.2s ease-in-out',
              },
            }}
            onClick={() => handlePlay(video)}
          >
            <CardMedia
              component="img"
              height="200"
              image={video.thumbnail_path || '/placeholder.jpg'}
              alt={video.title}
            />
            <CardContent sx={{ flexGrow: 1, position: 'relative' }}>
              <Typography gutterBottom variant="h6" component="div" noWrap>
                {video.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Duration: {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
              </Typography>
              {availabilityMap[video.path] && (
                <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
                  {availabilityMap[video.path].local && (
                    <Chip
                      icon={<StorageIcon sx={{ fontSize: 14 }} />}
                      label="Local"
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        backgroundColor: '#E0F7FA',
                        color: '#006064',
                        '& .MuiChip-icon': {
                          fontSize: 14,
                        },
                      }}
                    />
                  )}
                  {availabilityMap[video.path].ipfs && (
                    <Chip
                      icon={<CloudIcon sx={{ fontSize: 14 }} />}
                      label="IPFS"
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        backgroundColor: '#E8EAF6',
                        color: '#1A237E',
                        '& .MuiChip-icon': {
                          fontSize: 14,
                        },
                      }}
                    />
                  )}
                </Stack>
              )}
              <IconButton
                sx={{ position: 'absolute', top: 8, right: 8 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuOpen(e, video);
                }}
              >
                <MoreVertIcon />
              </IconButton>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleMoveToFront}>Move to Front</MenuItem>
        {onUpload && (
          <MenuItem
            onClick={() => {
              if (selectedVideo) {
                onUpload(selectedVideo);
                handleMenuClose();
              }
            }}
          >
            <ListItemIcon>
              <UploadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Upload to Filecoin</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default VideoGrid; 