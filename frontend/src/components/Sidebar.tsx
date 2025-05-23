import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import {
  FolderOpen as FolderIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Help as HelpIcon,
  BarChart as SignalIcon,
  Home as HomeIcon,
} from '@mui/icons-material';

interface SidebarProps {
  onRefresh?: () => void;
  onSettings?: () => void;
  onHelp?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onRefresh, onSettings, onHelp }) => {
  return (
    <Box
      sx={{
        width: '60px',
        height: '100vh',
        backgroundColor: '#2a2a2a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 2,
        borderRight: '1px solid #3a3a3a',
      }}
    >
      {/* Logo/brand mark */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>
          H
        </Typography>
      </Box>

      {/* Navigation icons */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
        <IconButton
          sx={{
            color: 'white',
            '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
          }}
        >
          <HomeIcon />
        </IconButton>
        
        <IconButton
          sx={{
            color: 'white',
            '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
          }}
        >
          <FolderIcon />
        </IconButton>
        
        <IconButton
          onClick={onRefresh}
          sx={{
            color: 'white',
            '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
          }}
        >
          <RefreshIcon />
        </IconButton>
        
        <IconButton
          onClick={onSettings}
          sx={{
            color: 'white',
            '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
          }}
        >
          <SettingsIcon />
        </IconButton>
        
        <IconButton
          onClick={onHelp}
          sx={{
            color: 'white',
            '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
          }}
        >
          <HelpIcon />
        </IconButton>
      </Box>

      {/* Bottom signal icon */}
      <IconButton
        sx={{
          color: 'white',
          '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
        }}
      >
        <SignalIcon />
      </IconButton>
    </Box>
  );
};

export default Sidebar; 