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
  alpha,
} from '@mui/material';
import { 
  MoreVert as MoreVertIcon, 
  CloudUpload as UploadIcon,
  Storage as StorageIcon,
  CloudQueue as CloudIcon,
  PlayArrow as PlayIcon,
  Delete as DeleteIcon,
  VerticalAlignTop as MoveToFrontIcon,
} from '@mui/icons-material';
import { useVideos } from '@/hooks/useVideos';
import { Video } from '@/types/video';
import { fileExistsViaIpc } from '@/services/playbackConfig';

// Design tokens from Liquid Glass system
const glassTokens = {
  canvas: {
    base: '#0A0A0F',
    elevated: '#12121A',
  },
  glass: {
    fill: 'rgba(255, 255, 255, 0.06)',
    fillHover: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.08)',
    blur: 16,
  },
  neon: {
    cyan: '#00F5FF',
    magenta: '#FF00E5',
    amber: '#FFB800',
  },
  text: {
    primary: 'rgba(255, 255, 255, 1)',
    secondary: 'rgba(255, 255, 255, 0.7)',
    tertiary: 'rgba(255, 255, 255, 0.4)',
  },
  state: {
    success: '#00FF88',
    warning: '#FFB800',
    error: '#FF3366',
  },
};

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
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, video: Video) => {
    event.stopPropagation();
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
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="400px"
        sx={{
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <CircularProgress 
          sx={{ 
            color: glassTokens.neon.cyan,
            filter: `drop-shadow(0 0 10px ${alpha(glassTokens.neon.cyan, 0.5)})`,
          }} 
        />
        <Typography sx={{ color: glassTokens.text.secondary }}>
          Loading videos...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="400px"
        sx={{
          flexDirection: 'column',
          gap: 2,
          p: 3,
        }}
      >
        <Typography 
          sx={{ 
            color: glassTokens.state.error,
            textAlign: 'center',
          }}
        >
          {error}
        </Typography>
      </Box>
    );
  }

  if (videos.length === 0) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="400px"
        sx={{
          flexDirection: 'column',
          gap: 2,
          p: 3,
        }}
      >
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '20px',
            background: glassTokens.glass.fill,
            border: `1px solid ${glassTokens.glass.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 2,
          }}
        >
          <PlayIcon sx={{ fontSize: 40, color: glassTokens.text.tertiary }} />
        </Box>
        <Typography 
          variant="h6"
          sx={{ 
            color: glassTokens.text.primary,
            fontWeight: 600,
          }}
        >
          No videos yet
        </Typography>
        <Typography 
          sx={{ 
            color: glassTokens.text.tertiary,
            textAlign: 'center',
          }}
        >
          Add your first video to get started
        </Typography>
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
          gap: 2,
        }}
      >
        {videos.map((video) => {
          const isHovered = hoveredVideo === video.path;
          
          return (
            <Card
              key={video.path}
              onMouseEnter={() => setHoveredVideo(video.path)}
              onMouseLeave={() => setHoveredVideo(null)}
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                background: glassTokens.glass.fill,
                backdropFilter: `blur(${glassTokens.glass.blur}px) saturate(180%)`,
                border: `1px solid ${isHovered ? alpha(glassTokens.neon.cyan, 0.3) : glassTokens.glass.border}`,
                borderRadius: '16px',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
                boxShadow: isHovered 
                  ? `
                    inset 0 1px 0 rgba(255, 255, 255, 0.05),
                    0 0 0 1px rgba(0, 0, 0, 0.5),
                    0 8px 32px rgba(0, 0, 0, 0.4),
                    0 0 30px ${alpha(glassTokens.neon.cyan, 0.15)}
                  `
                  : `
                    inset 0 1px 0 rgba(255, 255, 255, 0.05),
                    0 0 0 1px rgba(0, 0, 0, 0.5),
                    0 8px 32px rgba(0, 0, 0, 0.4)
                  `,
                '&:hover': {
                  transform: 'translateY(-4px)',
                  background: glassTokens.glass.fillHover,
                },
              }}
              onClick={() => handlePlay(video)}
            >
              {/* Thumbnail with overlay */}
              <Box sx={{ position: 'relative', overflow: 'hidden' }}>
                <CardMedia
                  component="img"
                  height="160"
                  image={video.thumbnail_path || '/placeholder.jpg'}
                  alt={video.title}
                  sx={{
                    objectFit: 'cover',
                    transition: 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
                    ...(isHovered && {
                      transform: 'scale(1.05)',
                    }),
                  }}
                />
                
                {/* Play overlay */}
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `linear-gradient(180deg, transparent 0%, ${alpha(glassTokens.canvas.base, 0.8)} 100%)`,
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
                  }}
                >
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${glassTokens.neon.cyan} 0%, ${glassTokens.neon.magenta} 100%)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 0 30px ${alpha(glassTokens.neon.cyan, 0.5)}`,
                      transform: isHovered ? 'scale(1)' : 'scale(0.8)',
                      transition: 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
                    }}
                  >
                    <PlayIcon sx={{ fontSize: 28, color: '#FFFFFF', ml: 0.5 }} />
                  </Box>
                </Box>

                {/* Duration badge */}
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    px: 1,
                    py: 0.25,
                    borderRadius: '4px',
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: '#FFFFFF',
                      fontWeight: 500,
                      fontSize: '11px',
                    }}
                  >
                    {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                  </Typography>
                </Box>
              </Box>

              <CardContent 
                sx={{ 
                  flexGrow: 1, 
                  position: 'relative',
                  p: 2,
                  '&:last-child': { pb: 2 },
                }}
              >
                <Typography 
                  gutterBottom 
                  variant="subtitle1" 
                  component="div" 
                  noWrap
                  sx={{
                    color: glassTokens.text.primary,
                    fontWeight: 600,
                    fontSize: '14px',
                    mb: 1,
                    pr: 4,
                  }}
                >
                  {video.title}
                </Typography>
                
                {/* Availability chips */}
                {availabilityMap[video.path] && (
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {availabilityMap[video.path].local && (
                      <Chip
                        icon={<StorageIcon sx={{ fontSize: '12px !important' }} />}
                        label="Local"
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '10px',
                          fontWeight: 500,
                          backgroundColor: alpha(glassTokens.state.success, 0.15),
                          color: glassTokens.state.success,
                          border: `1px solid ${alpha(glassTokens.state.success, 0.3)}`,
                          '& .MuiChip-icon': {
                            color: glassTokens.state.success,
                          },
                        }}
                      />
                    )}
                    {availabilityMap[video.path].ipfs && (
                      <Chip
                        icon={<CloudIcon sx={{ fontSize: '12px !important' }} />}
                        label="IPFS"
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '10px',
                          fontWeight: 500,
                          backgroundColor: alpha(glassTokens.neon.cyan, 0.15),
                          color: glassTokens.neon.cyan,
                          border: `1px solid ${alpha(glassTokens.neon.cyan, 0.3)}`,
                          '& .MuiChip-icon': {
                            color: glassTokens.neon.cyan,
                          },
                        }}
                      />
                    )}
                  </Stack>
                )}

                {/* Menu button */}
                <IconButton
                  sx={{ 
                    position: 'absolute', 
                    top: 8, 
                    right: 8,
                    width: 28,
                    height: 28,
                    color: glassTokens.text.tertiary,
                    '&:hover': {
                      backgroundColor: alpha(glassTokens.neon.cyan, 0.1),
                      color: glassTokens.neon.cyan,
                    },
                  }}
                  onClick={(e) => handleMenuOpen(e, video)}
                >
                  <MoreVertIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Context menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            background: glassTokens.canvas.elevated,
            backdropFilter: `blur(${glassTokens.glass.blur}px) saturate(180%)`,
            border: `1px solid ${glassTokens.glass.border}`,
            borderRadius: '12px',
            boxShadow: `
              0 0 0 1px rgba(0, 0, 0, 0.5),
              0 8px 32px rgba(0, 0, 0, 0.4)
            `,
            minWidth: 180,
            overflow: 'hidden',
          },
        }}
        MenuListProps={{
          sx: {
            py: 0.5,
          },
        }}
      >
        <MenuItem 
          onClick={handleMoveToFront}
          sx={{
            py: 1,
            px: 2,
            color: glassTokens.text.primary,
            '&:hover': {
              backgroundColor: alpha(glassTokens.neon.cyan, 0.1),
            },
          }}
        >
          <ListItemIcon>
            <MoveToFrontIcon sx={{ fontSize: 18, color: glassTokens.text.secondary }} />
          </ListItemIcon>
          <ListItemText 
            primary="Move to Front" 
            primaryTypographyProps={{
              fontSize: '13px',
            }}
          />
        </MenuItem>
        
        {onUpload && (
          <MenuItem
            onClick={() => {
              if (selectedVideo) {
                onUpload(selectedVideo);
                handleMenuClose();
              }
            }}
            sx={{
              py: 1,
              px: 2,
              color: glassTokens.text.primary,
              '&:hover': {
                backgroundColor: alpha(glassTokens.neon.magenta, 0.1),
              },
            }}
          >
            <ListItemIcon>
              <UploadIcon sx={{ fontSize: 18, color: glassTokens.neon.magenta }} />
            </ListItemIcon>
            <ListItemText 
              primary="Upload to Filecoin"
              primaryTypographyProps={{
                fontSize: '13px',
              }}
            />
          </MenuItem>
        )}
        
        <MenuItem 
          onClick={handleDelete} 
          sx={{ 
            py: 1,
            px: 2,
            color: glassTokens.state.error,
            '&:hover': {
              backgroundColor: alpha(glassTokens.state.error, 0.1),
            },
          }}
        >
          <ListItemIcon>
            <DeleteIcon sx={{ fontSize: 18, color: glassTokens.state.error }} />
          </ListItemIcon>
          <ListItemText 
            primary="Delete"
            primaryTypographyProps={{
              fontSize: '13px',
            }}
          />
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default VideoGrid;
