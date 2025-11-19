import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  CircularProgress,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  Autorenew as AutorenewIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import { useVideos } from '@/hooks/useVideos';
import { useFilecoinUpload } from '@/hooks/useFilecoinUpload';
import { Video } from '@/types/video';
import { FilecoinConfig } from '@/types/filecoin';

// Define local interface for the tick response
interface TickResponse {
  success: boolean;
  message: string;
  actions?: string[];
  current_mint_id?: string;
  duration?: number;
}

const DePinDashboard: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentTask, setCurrentTask] = useState<string>('Idle');
  const [filecoinConfig, setFilecoinConfig] = useState<FilecoinConfig | null>(null);
  const [lastTick, setLastTick] = useState<Date | null>(null);
  const [currentRecording, setCurrentRecording] = useState<{
    mintId: string;
    duration: number;
    startTime: Date | null;
  } | null>(null);
  
  const { videos, refreshVideos } = useVideos();
  const { uploadStatus, uploadVideo } = useFilecoinUpload();
  
  // Ref to track if an upload is currently in progress to prevent overlaps
  const isUploadingRef = useRef(false);
  
  const addLog = (message: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 100));
  };

  // Load Filecoin config and restore state on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        const config = await ipcRenderer.invoke('get-filecoin-config');
        if (config) {
          setFilecoinConfig(config);
        } else {
          addLog('⚠️ Filecoin config not found. Please configure it in settings.');
        }
      } catch (error) {
        console.error('Failed to load Filecoin config:', error);
        addLog('❌ Failed to load Filecoin config.');
      }
    };
    
    const restoreState = async () => {
      try {
        // Check for active recordings
        const response = await fetch('http://localhost:8000/api/recording/active');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.recordings && Object.keys(data.recordings).length > 0) {
            // There are active recordings - restore state
            const recordingEntries = Object.entries(data.recordings);
            const firstRecording = recordingEntries[0][1] as any;
            const mintId = recordingEntries[0][0];
            
            if (firstRecording.state === 'recording' || firstRecording.is_recording) {
              setIsActive(true);
              setCurrentTask(`Recording: ${mintId}`);
              
              // Set current recording info
              if (firstRecording.start_time) {
                const startTime = new Date(firstRecording.start_time);
                const duration = Math.floor((Date.now() - startTime.getTime()) / 1000);
                setCurrentRecording({
                  mintId,
                  duration,
                  startTime
                });
                addLog(`🔄 Restored active recording: ${mintId} (${Math.floor(duration / 60)}m ${duration % 60}s)`);
              } else {
                setCurrentRecording({
                  mintId,
                  duration: 0,
                  startTime: null
                });
                addLog(`🔄 Restored active recording: ${mintId}`);
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to restore state:', error);
        // Don't add to logs - this is expected if no recordings exist
      }
    };
    
    loadConfig();
    restoreState();
  }, []);

  // Tick Loop (Backend Agent)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isActive) {
      const tick = async () => {
        try {
          setCurrentTask('Checking Top Stream...');
          const response = await fetch('http://localhost:8000/api/depin/tick', {
            method: 'POST',
          });
          const data: TickResponse = await response.json();
          
          if (data.success) {
            if (data.actions && data.actions.length > 0) {
              data.actions.forEach(action => addLog(`🤖 Agent: ${action}`));
              
              // Check if a new recording was started
              if (data.actions.some((a: string) => a.includes('Started'))) {
                // Fetch current recording status
                const activeResponse = await fetch('http://localhost:8000/api/recording/active');
                if (activeResponse.ok) {
                  const activeData = await activeResponse.json();
                  if (activeData.success && activeData.recordings) {
                    const recordingEntries = Object.entries(activeData.recordings);
                    if (recordingEntries.length > 0) {
                      const [mintId, recording] = recordingEntries[0] as [string, any];
                      if (recording.start_time) {
                        const startTime = new Date(recording.start_time);
                        setCurrentRecording({
                          mintId,
                          duration: 0,
                          startTime
                        });
                      }
                    }
                  }
                }
              }
            }
            if (data.message && !data.message.includes("No action")) {
               // Only log interesting messages
               // addLog(`ℹ️ ${data.message}`);
            }
            
            // Update current recording info if available
            if (data.current_mint_id && data.duration !== undefined) {
              setCurrentRecording({
                mintId: data.current_mint_id,
                duration: data.duration,
                startTime: null
              });
            }
          } else {
            addLog(`❌ Agent Error: ${data.message}`);
          }
          setLastTick(new Date());
        } catch (error) {
          console.error('Tick error:', error);
          addLog(`❌ Agent Tick Failed: ${String(error)}`);
        } finally {
          setCurrentTask('Idle');
        }
      };

      // Run immediately then interval
      tick();
      intervalId = setInterval(tick, 60000); // Every 1 minute
    }

    return () => clearInterval(intervalId);
  }, [isActive]);

  // Update current recording duration periodically
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (currentRecording && currentRecording.startTime) {
      const updateDuration = () => {
        const duration = Math.floor((Date.now() - currentRecording.startTime!.getTime()) / 1000);
        setCurrentRecording(prev => prev ? { ...prev, duration } : null);
      };

      updateDuration(); // Update immediately
      intervalId = setInterval(updateDuration, 1000); // Update every second
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [currentRecording?.startTime]);

  // Periodically check for active recordings (in case recording stops externally)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isActive) {
      const checkActiveRecordings = async () => {
        try {
          const response = await fetch('http://localhost:8000/api/recording/active');
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.recordings && Object.keys(data.recordings).length > 0) {
              const recordingEntries = Object.entries(data.recordings);
              const [mintId, recording] = recordingEntries[0] as [string, any];
              
              if (recording.state === 'recording' || recording.is_recording) {
                if (recording.start_time) {
                  const startTime = new Date(recording.start_time);
                  const duration = Math.floor((Date.now() - startTime.getTime()) / 1000);
                  setCurrentRecording({
                    mintId,
                    duration,
                    startTime
                  });
                  setCurrentTask(`Recording: ${mintId}`);
                }
              } else {
                // Recording stopped
                setCurrentRecording(null);
                setCurrentTask('Idle');
              }
            } else {
              // No active recordings
              setCurrentRecording(null);
              setCurrentTask('Idle');
            }
          }
        } catch (error) {
          console.error('Failed to check active recordings:', error);
        }
      };

      intervalId = setInterval(checkActiveRecordings, 5000); // Check every 5 seconds
    } else {
      // Clear recording info when inactive
      setCurrentRecording(null);
      setCurrentTask('Idle');
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isActive]);

  // Upload Loop (Frontend Worker)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isActive && filecoinConfig) {
      const checkUploads = async () => {
        if (isUploadingRef.current) return;

        try {
          // Refresh videos to get latest status
          await refreshVideos();
          
          // Find first video that needs upload
          // We sort by created_at asc to upload oldest first, or desc for newest?
          // "Continually upload" usually implies keeping up with latest, but we should clear backlog too.
          // Let's do newest first to ensure "most viewed" is prioritized.
          const pendingVideo = videos
            .filter(v => !v.filecoin_root_cid) // Not yet uploaded
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

          if (pendingVideo) {
            isUploadingRef.current = true;
            setCurrentTask(`Uploading: ${pendingVideo.title}`);
            addLog(`⬆️ Starting upload for: ${pendingVideo.title}`);

            try {
              await uploadVideo(pendingVideo.path, filecoinConfig);
              addLog(`✅ Upload Complete: ${pendingVideo.title}`);
            } catch (error) {
              addLog(`❌ Upload Failed: ${pendingVideo.title} - ${String(error)}`);
            } finally {
              isUploadingRef.current = false;
              setCurrentTask('Idle');
            }
          }
        } catch (error) {
          console.error('Upload check error:', error);
          isUploadingRef.current = false;
        }
      };

      intervalId = setInterval(checkUploads, 10000); // Check every 10 seconds
    }

    return () => clearInterval(intervalId);
  }, [isActive, filecoinConfig, videos, refreshVideos, uploadVideo]);

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header Card */}
      <Paper sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" gutterBottom>
            DePin Node Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Automatically records the most popular Pump Fun stream and uploads to Filecoin.
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              color="success"
              disabled={!filecoinConfig}
            />
          }
          label={isActive ? "Node Active" : "Node Inactive"}
        />
      </Paper>

      {!filecoinConfig && (
        <Alert severity="warning">
          Filecoin configuration is missing. Please configure it in settings before starting the node.
        </Alert>
      )}

      {/* Status Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 2 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Current Status
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isActive ? (
              <CircularProgress size={20} color="success" />
            ) : (
              <StorageIcon color="disabled" />
            )}
            <Typography variant="h6">
              {isActive ? currentTask : 'Stopped'}
            </Typography>
          </Box>
        </Paper>
        
        {currentRecording && (
          <Paper sx={{ p: 2, border: '2px solid', borderColor: 'success.main' }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Active Recording
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                {currentRecording.mintId.slice(0, 8)}...
              </Typography>
              <Typography variant="h6">
                {Math.floor(currentRecording.duration / 60)}m {currentRecording.duration % 60}s
              </Typography>
            </Box>
          </Paper>
        )}
        
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Last Agent Tick
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
             <ScheduleIcon color="action" />
             <Typography variant="h6">
               {lastTick ? lastTick.toLocaleTimeString() : 'Never'}
             </Typography>
          </Box>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Pending Uploads
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
             <CloudUploadIcon color="primary" />
             <Typography variant="h6">
               {videos.filter(v => !v.filecoin_root_cid).length}
             </Typography>
          </Box>
        </Paper>
      </Box>

      {/* Logs */}
      <Paper sx={{ flexGrow: 1, p: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Typography variant="h6" gutterBottom>
          Activity Log
        </Typography>
        <List sx={{ flexGrow: 1, overflow: 'auto', bgcolor: '#f5f5f5', borderRadius: 1, p: 1 }}>
          {logs.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              No activity yet. Start the node to begin.
            </Typography>
          )}
          {logs.map((log, index) => (
            <ListItem key={index} dense sx={{ py: 0.5 }}>
              <ListItemText 
                primary={log} 
                primaryTypographyProps={{ 
                  variant: 'body2', 
                  fontFamily: 'monospace',
                  color: log.includes('❌') ? 'error' : 'text.primary'
                }} 
              />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default DePinDashboard;

