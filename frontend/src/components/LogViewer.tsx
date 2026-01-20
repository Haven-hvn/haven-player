import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  Typography,
  TextField,
  Button,
  Chip,
  alpha,
} from '@mui/material';
import {
  Close as CloseIcon,
  BugReport as BugReportIcon,
  Clear as ClearIcon,
  FilterList as FilterIcon,
  Terminal as TerminalIcon,
} from '@mui/icons-material';

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

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  args: unknown[];
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

    const addLog = (level: LogEntry['level'], ...args: unknown[]) => {
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

      // Defer state update to avoid setState during render
      setTimeout(() => {
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
      }, 0);
    };

    console.log = (...args: unknown[]) => {
      originalLog.apply(console, args);
      addLog('log', ...args);
    };

    console.warn = (...args: unknown[]) => {
      originalWarn.apply(console, args);
      addLog('warn', ...args);
    };

    console.error = (...args: unknown[]) => {
      originalError.apply(console, args);
      addLog('error', ...args);
    };

    console.info = (...args: unknown[]) => {
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
      case 'error': return glassTokens.state.error;
      case 'warn': return glassTokens.state.warning;
      case 'info': return glassTokens.neon.cyan;
      default: return glassTokens.text.tertiary;
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
            width: 48,
            height: 48,
            background: `linear-gradient(135deg, ${glassTokens.neon.cyan} 0%, ${glassTokens.neon.magenta} 100%)`,
            color: 'white',
            '&:hover': {
              background: `linear-gradient(135deg, ${alpha(glassTokens.neon.cyan, 0.9)} 0%, ${alpha(glassTokens.neon.magenta, 0.9)} 100%)`,
              transform: 'scale(1.05)',
            },
            boxShadow: `
              0 4px 20px ${alpha(glassTokens.neon.cyan, 0.4)},
              0 0 40px ${alpha(glassTokens.neon.magenta, 0.2)}
            `,
            transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
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
            background: glassTokens.canvas.base,
            borderLeft: `1px solid ${glassTokens.glass.border}`,
            boxShadow: `
              -8px 0 32px rgba(0, 0, 0, 0.5),
              0 0 60px ${alpha(glassTokens.neon.cyan, 0.1)}
            `,
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <Box
            sx={{
              p: 2,
              background: glassTokens.glass.fill,
              borderBottom: `1px solid ${glassTokens.glass.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backdropFilter: `blur(${glassTokens.glass.blur}px)`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  background: `linear-gradient(135deg, ${alpha(glassTokens.neon.cyan, 0.2)} 0%, ${alpha(glassTokens.neon.magenta, 0.2)} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 0 20px ${alpha(glassTokens.neon.cyan, 0.3)}`,
                }}
              >
                <TerminalIcon sx={{ fontSize: 18, color: glassTokens.neon.cyan }} />
              </Box>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontWeight: 600,
                  color: glassTokens.text.primary,
                  fontSize: '16px',
                }}
              >
                Console Logs
              </Typography>
              <Chip
                label={logs.length}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: alpha(glassTokens.neon.cyan, 0.15),
                  color: glassTokens.neon.cyan,
                  border: `1px solid ${alpha(glassTokens.neon.cyan, 0.3)}`,
                }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<ClearIcon sx={{ fontSize: 16 }} />}
                onClick={clearLogs}
                sx={{ 
                  minWidth: 'auto',
                  color: glassTokens.text.secondary,
                  fontSize: '12px',
                  textTransform: 'none',
                  px: 1.5,
                  borderRadius: '8px',
                  '&:hover': {
                    backgroundColor: alpha(glassTokens.state.error, 0.1),
                    color: glassTokens.state.error,
                  },
                }}
              >
                Clear
              </Button>
              <IconButton 
                size="small" 
                onClick={() => setOpen(false)}
                sx={{
                  color: glassTokens.text.tertiary,
                  '&:hover': {
                    backgroundColor: alpha(glassTokens.neon.cyan, 0.1),
                    color: glassTokens.neon.cyan,
                  },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {/* Filter */}
          <Box 
            sx={{ 
              p: 2, 
              borderBottom: `1px solid ${glassTokens.glass.border}`,
              background: alpha(glassTokens.glass.fill, 0.5),
            }}
          >
            <TextField
              fullWidth
              size="small"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              InputProps={{
                startAdornment: <FilterIcon sx={{ mr: 1, color: glassTokens.text.tertiary, fontSize: 18 }} />,
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  backgroundColor: glassTokens.glass.fill,
                  '& fieldset': {
                    borderColor: glassTokens.glass.border,
                  },
                  '&:hover fieldset': {
                    borderColor: alpha(glassTokens.neon.cyan, 0.3),
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: glassTokens.neon.cyan,
                    boxShadow: `0 0 12px ${alpha(glassTokens.neon.cyan, 0.2)}`,
                  },
                },
                '& .MuiOutlinedInput-input': {
                  color: glassTokens.text.primary,
                  fontSize: '13px',
                  '&::placeholder': {
                    color: glassTokens.text.tertiary,
                    opacity: 1,
                  },
                },
              }}
            />
          </Box>

          {/* Logs */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              p: 1.5,
              backgroundColor: glassTokens.canvas.elevated,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: '12px',
              '&::-webkit-scrollbar': {
                width: '8px',
              },
              '&::-webkit-scrollbar-track': {
                background: 'transparent',
              },
              '&::-webkit-scrollbar-thumb': {
                background: glassTokens.glass.border,
                borderRadius: '4px',
                '&:hover': {
                  background: alpha(glassTokens.neon.cyan, 0.3),
                },
              },
            }}
          >
            {filteredLogs.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 2,
                }}
              >
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: '16px',
                    background: glassTokens.glass.fill,
                    border: `1px solid ${glassTokens.glass.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <TerminalIcon sx={{ fontSize: 28, color: glassTokens.text.tertiary }} />
                </Box>
                <Typography
                  sx={{
                    color: glassTokens.text.tertiary,
                    textAlign: 'center',
                    fontSize: '13px',
                  }}
                >
                  {filter ? 'No logs match the filter' : 'No logs yet'}
                </Typography>
              </Box>
            ) : (
              filteredLogs.map((log) => (
                <Box
                  key={log.id}
                  sx={{
                    mb: 1,
                    p: 1.5,
                    borderRadius: '10px',
                    backgroundColor: glassTokens.glass.fill,
                    border: `1px solid ${alpha(getLogColor(log.level), 0.2)}`,
                    transition: 'all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
                    '&:hover': {
                      backgroundColor: glassTokens.glass.fillHover,
                      borderColor: alpha(getLogColor(log.level), 0.4),
                      boxShadow: `0 0 12px ${alpha(getLogColor(log.level), 0.15)}`,
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    <Chip
                      label={log.level.toUpperCase()}
                      size="small"
                      sx={{
                        backgroundColor: alpha(getLogColor(log.level), 0.15),
                        color: getLogColor(log.level),
                        fontSize: '9px',
                        height: '18px',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        border: `1px solid ${alpha(getLogColor(log.level), 0.3)}`,
                        '& .MuiChip-label': {
                          px: 1,
                        },
                      }}
                    />
                    <Typography
                      sx={{
                        color: glassTokens.text.tertiary,
                        fontSize: '10px',
                        fontFamily: 'inherit',
                      }}
                    >
                      {log.timestamp}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      color: glassTokens.text.secondary,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: '11px',
                      lineHeight: 1.6,
                      fontFamily: 'inherit',
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
