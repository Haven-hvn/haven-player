import React from 'react';
import { Box, Typography, IconButton, Button } from '@mui/material';
import { Add as AddIcon, Analytics as AnalyticsIcon } from '@mui/icons-material';

interface HeaderProps {
  videoCount: number;
  onAddVideo: () => void;
  onAnalyzeAll: () => void;
  isAnalyzing?: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
  videoCount, 
  onAddVideo, 
  onAnalyzeAll, 
  isAnalyzing = false 
}) => {
  return (
    <Box
      sx={{
        height: '60px',
        backgroundColor: '#2a2a2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3,
        borderBottom: '1px solid #3a3a3a',
      }}
    >
      {/* Left side - Video counter and add button */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography
          sx={{
            color: 'white',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          📁 {videoCount} videos
        </Typography>
        
        <IconButton
          onClick={onAddVideo}
          sx={{
            color: 'white',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
            width: '32px',
            height: '32px',
          }}
        >
          <AddIcon />
        </IconButton>
      </Box>

      {/* Right side - Analyze all button */}
      <Button
        onClick={onAnalyzeAll}
        disabled={isAnalyzing || videoCount === 0}
        startIcon={<AnalyticsIcon />}
        sx={{
          color: 'white',
          backgroundColor: isAnalyzing ? 'rgba(144, 202, 249, 0.3)' : 'rgba(144, 202, 249, 0.8)',
          '&:hover': { 
            backgroundColor: isAnalyzing ? 'rgba(144, 202, 249, 0.3)' : 'rgba(144, 202, 249, 1)' 
          },
          '&:disabled': {
            color: 'rgba(255, 255, 255, 0.5)',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
          },
          textTransform: 'none',
          fontWeight: 500,
        }}
      >
        📊 {isAnalyzing ? 'Analyzing...' : 'Analyze all'}
      </Button>
    </Box>
  );
};

export default Header; 