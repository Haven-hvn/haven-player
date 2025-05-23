import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid,
  Card,
  CardContent,
  CardMedia,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Box,
  CircularProgress,
} from '@mui/material';
import { MoreVert as MoreVertIcon } from '@mui/icons-material';
import { useVideos } from '@/hooks/useVideos';
import { Video } from '@/types/video';

const VideoGrid: React.FC = () => {
  const navigate = useNavigate();
  const { videos, loading, error, deleteVideo, moveToFront } = useVideos();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [selectedVideo, setSelectedVideo] = React.useState<Video | null>(null);

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
      <Grid container spacing={3}>
        {videos.map((video) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={video.path}>
            <Card
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
                <Typography variant="body2" color="text.secondary">
                  Duration: {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                </Typography>
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
          </Grid>
        ))}
      </Grid>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleMoveToFront}>Move to Front</MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default VideoGrid; 