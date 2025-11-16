import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  Typography,
  Paper,
  TextField,
  Button,
  Chip,
} from '@mui/material';
import {
  Close as CloseIcon,
  BugReport as BugReportIcon,
  Clear as ClearIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  args: any[];
}

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [maxLogs, setMaxLogs] = useState<number>(500);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef<number>(0);

  useEffect(() => {
    // Capture console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    const addLog = (level: LogEntry['level'], ...args: any[]) => {
      const timestamp = new Date().toLocaleTimeString();
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      setLogs(prev => {
        const newLog: LogEntry = {
          id: logIdRef.current++,
          timestamp,
          level,
          message,
          args,
        };
        const updated = [...prev, newLog].slice(-maxLogs);
        return updated;
      });
    };

    console.log = (...args: any[]) => {
      originalLog.apply(console, args);
      addLog('log', ...args);
    };

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args);
      addLog('warn', ...args);
    };

    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      addLog('error', ...args);
    };

    console.info = (...args: any[]) => {
      originalInfo.apply(console, args);
      addLog('info', ...args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
    };
  }, [maxLogs]);

  useEffect(() => {
    // Auto-scroll to bottom
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const filteredLogs = logs.filter(log => {
    if (!filter) return true;
    const searchLower = filter.toLowerCase();
    return (
      log.message.toLowerCase().includes(searchLower) ||
      log.level.toLowerCase().includes(searchLower) ||
      log.timestamp.includes(searchLower)
    );
  });

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return '#FF4D4D';
      case 'warn': return '#FFA726';
      case 'info': return '#42A5F5';
      default: return '#9E9E9E';
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <>
      {/* Floating button to open log viewer */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 1000,
        }}
      >
        <IconButton
          onClick={() => setOpen(true)}
          sx={{
            backgroundColor: '#1976d2',
            color: 'white',
            '&:hover': {
              backgroundColor: '#1565c0',
            },
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <BugReportIcon />
        </IconButton>
      </Box>

      {/* Log viewer drawer */}
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            width: '600px',
            maxWidth: '90vw',
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <Box
            sx={{
              p: 2,
              borderBottom: '1px solid #E0E0E0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Console Logs ({logs.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={clearLogs}
                sx={{ minWidth: 'auto' }}
              >
                Clear
              </Button>
              <IconButton size="small" onClick={() => setOpen(false)}>
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>

          {/* Filter */}
          <Box sx={{ p: 2, borderBottom: '1px solid #E0E0E0' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              InputProps={{
                startAdornment: <FilterIcon sx={{ mr: 1, color: '#9E9E9E' }} />,
              }}
            />
          </Box>

          {/* Logs */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              p: 1,
              backgroundColor: '#1E1E1E',
              fontFamily: 'monospace',
              fontSize: '12px',
            }}
          >
            {filteredLogs.length === 0 ? (
              <Typography
                sx={{
                  color: '#9E9E9E',
                  textAlign: 'center',
                  mt: 4,
                }}
              >
                {filter ? 'No logs match the filter' : 'No logs yet'}
              </Typography>
            ) : (
              filteredLogs.map((log) => (
                <Box
                  key={log.id}
                  sx={{
                    mb: 0.5,
                    p: 1,
                    borderRadius: '4px',
                    backgroundColor: '#2D2D2D',
                    '&:hover': {
                      backgroundColor: '#3D3D3D',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Chip
                      label={log.level.toUpperCase()}
                      size="small"
                      sx={{
                        backgroundColor: getLogColor(log.level),
                        color: 'white',
                        fontSize: '10px',
                        height: '20px',
                        fontWeight: 600,
                      }}
                    />
                    <Typography
                      sx={{
                        color: '#9E9E9E',
                        fontSize: '10px',
                      }}
                    >
                      {log.timestamp}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      color: '#D4D4D4',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {log.message}
                  </Typography>
                </Box>
              ))
            )}
            <div ref={logEndRef} />
          </Box>
        </Box>
      </Drawer>
    </>
  );
};

export default LogViewer;

