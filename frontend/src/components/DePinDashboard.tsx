import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  useTheme,
  Chip,
  LinearProgress,
  Button,
  Divider,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Schedule as ScheduleIcon,
  Autorenew as AutorenewIcon,
  Storage as StorageIcon,
  TrendingUp as TrendingUpIcon,
  Star as StarIcon,
  Timeline as TimelineIcon,
  LocalFireDepartment as StreakIcon,
  CheckCircle as CheckCircleIcon,
  Bolt as BoltIcon,
  MilitaryTech as MilitaryIcon,
} from '@mui/icons-material';
import { useVideos } from '@/hooks/useVideos';
import { useFilecoinUpload } from '@/hooks/useFilecoinUpload';
import { FilecoinConfig } from '@/types/filecoin';

// Define local interface for the tick response
interface TickResponse {
  success: boolean;
  message: string;
  actions?: string[];
  current_mint_id?: string;
  duration?: number;
}

type PointTier = {
  name: string;
  min: number;
  max: number;
  color: string;
  badge: string;
};

const POINT_TIERS: PointTier[] = [
  { name: 'Observer', min: 0, max: 999, color: '#9E9E9E', badge: 'Observer' },
  { name: 'Archivist', min: 1000, max: 2499, color: '#4CAF50', badge: 'Archivist' },
  { name: 'Signal Keeper', min: 2500, max: 4999, color: '#2196F3', badge: 'Signal Keeper' },
  { name: 'Chronicle Guardian', min: 5000, max: 9999, color: '#AB47BC', badge: 'Chronicle Guardian' },
  { name: 'Mythic Librarian', min: 10000, max: Infinity, color: '#FF9800', badge: 'Mythic' },
];

const DePinDashboard: React.FC = () => {
  const theme = useTheme();
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
  const [points, setPoints] = useState(1420);
  const [archivedStreams, setArchivedStreams] = useState(18);
  const [dailyStreak, setDailyStreak] = useState(4);
  const [bonusAvailable, setBonusAvailable] = useState(180);
  const [archivedMinutesAwarded, setArchivedMinutesAwarded] = useState(0);
  const [missionStates, setMissionStates] = useState({
    archiveStream: true,
    uploadChunk: false,
    maintainStreak: true,
  });
  
  const { videos, refreshVideos } = useVideos();
  const { uploadVideo } = useFilecoinUpload();
  
  // Ref to track if an upload is currently in progress to prevent overlaps
  const isUploadingRef = useRef(false);
  // Ref to track if a tick check is in progress
  const isTickInProgressRef = useRef(false);
  // Ref to track previous isActive state to detect transitions
  const prevIsActiveRef = useRef<boolean | null>(null);
  
  const addLog = (message: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 100));
  };

  const level = useMemo(() => Math.floor(points / 1000) + 1, [points]);
  const rankTitle = useMemo(() => {
    if (points >= 8000) return 'Mythic Librarian';
    if (points >= 5000) return 'Chronicle Guardian';
    if (points >= 2500) return 'Signal Keeper';
    if (points >= 1000) return 'Archivist';
    return 'Observer';
  }, [points]);
  const streak = dailyStreak;

  const currentTier = useMemo(() => {
    return POINT_TIERS.find((tier) => points >= tier.min && points <= tier.max) ?? POINT_TIERS[0];
  }, [points]);

  const nextTier = useMemo(() => {
    const index = POINT_TIERS.findIndex((tier) => tier.name === currentTier.name);
    return POINT_TIERS[Math.min(index + 1, POINT_TIERS.length - 1)];
  }, [currentTier.name]);

  const progressToNextTier = useMemo(() => {
    if (nextTier.min === currentTier.min) return 100;
    const range = nextTier.min - currentTier.min;
    const progress = points - currentTier.min;
    return Math.min(100, Math.round((progress / range) * 100));
  }, [currentTier.min, nextTier.min, points]);

  const handleClaimBonus = () => {
    setPoints((prev) => prev + bonusAvailable);
    setBonusAvailable(0);
    addLog('✨ Claimed Early Adopter bonus points!');
  };

  const handleSimulateBoost = () => {
    setPoints((prev) => prev + 75);
    setDailyStreak((prev) => prev + 1);
    setMissionStates((prev) => ({ ...prev, maintainStreak: true }));
    addLog('⚡ Node boost engaged: simulated archival burst.');
  };

  const completedUploads = useMemo(
    () => videos.filter((video) => video.filecoin_root_cid).length,
    [videos]
  );

  const leaderboardEntries = useMemo(() => [
    { name: 'GammaNodes', score: 3210, badge: 'Signal Keeper' },
    { name: 'Haven Alpha', score: 2980, badge: 'Archivist' },
    { name: '▲ You', score: points, badge: currentTier.name, highlight: true },
    { name: 'SolScope Labs', score: 2210, badge: 'Archivist' },
    { name: 'Chronicle DAO', score: 1980, badge: 'Observer' },
  ], [points, currentTier.name]);

  useEffect(() => {
    if (!currentRecording) {
      setArchivedMinutesAwarded(0);
      return;
    }

    const minutesRecorded = Math.floor(currentRecording.duration / 60);
    if (minutesRecorded > archivedMinutesAwarded) {
      const delta = minutesRecorded - archivedMinutesAwarded;
      setArchivedMinutesAwarded(minutesRecorded);
      setPoints((prev) => prev + delta * 25);

      if (minutesRecorded % 5 === 0) {
        setArchivedStreams((prev) => prev + 1);
        setMissionStates((prev) => ({ ...prev, archiveStream: true, uploadChunk: true }));
      }
    }
  }, [currentRecording?.duration, archivedMinutesAwarded]);

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
      }
    };
    
    loadConfig();
    restoreState();
  }, []);

  // Stop all active recordings when node is deactivated
  useEffect(() => {
    // Only stop recordings when transitioning from active to inactive (not on initial mount)
    if (prevIsActiveRef.current === true && !isActive) {
      const stopAllRecordings = async () => {
        try {
          // Fetch all active recordings
          const response = await fetch('http://localhost:8000/api/recording/active');
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.recordings && Object.keys(data.recordings).length > 0) {
              const recordingEntries = Object.entries(data.recordings);
              const mintIds = recordingEntries.map(([mintId]) => mintId);
              
              addLog(`🛑 Stopping ${mintIds.length} active recording(s)...`);
              
              // Stop each recording
              const stopPromises = mintIds.map(async (mintId: string) => {
                try {
                  const stopResponse = await fetch('http://localhost:8000/api/recording/stop', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ mint_id: mintId }),
                  });
                  
                  if (stopResponse.ok) {
                    const stopData = await stopResponse.json();
                    if (stopData.success) {
                      addLog(`✅ Stopped recording: ${mintId.slice(0, 8)}...`);
                      return true;
                    } else {
                      addLog(`❌ Failed to stop ${mintId.slice(0, 8)}...: ${stopData.error || 'Unknown error'}`);
                      return false;
                    }
                  } else {
                    const errorData = await stopResponse.json().catch(() => ({}));
                    addLog(`❌ Failed to stop ${mintId.slice(0, 8)}...: ${errorData.detail || `HTTP ${stopResponse.status}`}`);
                    return false;
                  }
                } catch (error) {
                  addLog(`❌ Error stopping ${mintId.slice(0, 8)}...: ${String(error)}`);
                  return false;
                }
              });
              
              await Promise.all(stopPromises);
              addLog('🛑 All recordings stopped');
            }
          }
        } catch (error) {
          console.error('Failed to stop recordings:', error);
          addLog(`❌ Failed to stop recordings: ${String(error)}`);
        } finally {
          // Clear local state
          setCurrentRecording(null);
          setCurrentTask('Idle');
        }
      };
      
      stopAllRecordings();
    }
    
    // Update the previous value
    prevIsActiveRef.current = isActive;
  }, [isActive]);

  // Tick Loop (Backend Agent)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isActive) {
      const tick = async () => {
        let startedRecording = false;
        try {
          isTickInProgressRef.current = true;
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
                startedRecording = true;
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
                        setCurrentTask(`Recording: ${mintId}`);
                      }
                    }
                  }
                }
              }
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
          isTickInProgressRef.current = false;
          // Only set to Idle if we aren't immediately transitioning to another state
          // and didn't just start a recording
          if (!isUploadingRef.current && !startedRecording) {
             setCurrentTask('Idle');
          }
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
              } else if (recording.state === 'stopping') {
                // Handle stopping/encoding state
                setCurrentTask(`Encoding: ${mintId}`);
                // Keep current recording info visible but maybe freeze duration?
                // For now, we just update the status text as requested.
              } else {
                // Recording stopped
                setCurrentRecording(null);
                // Only set Idle if not checking stream or uploading
                if (!isTickInProgressRef.current && !isUploadingRef.current) {
                  setCurrentTask('Idle');
                }
              }
            } else {
              // No active recordings
              setCurrentRecording(null);
              // Only set Idle if not checking stream or uploading
              if (!isTickInProgressRef.current && !isUploadingRef.current) {
                setCurrentTask('Idle');
              }
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
              
              // Reward points
              setPoints(p => p + 500);
              addLog(`🎉 Earned 500 Haven Points for archiving!`);
              
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
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', minHeight: 0 }}>
      
      {/* Rewards Dashboard Header */}
      <Paper 
        elevation={0}
        sx={{ 
          p: 0, 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
          backgroundColor: 'transparent',
          color: 'white',
          borderRadius: 3,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          flexShrink: 0,
          height: 'auto',
          minHeight: 'auto',
          position: 'relative',
          '&::before': {
            display: 'none'
          }
        }}
      >
        <Box sx={{ 
          p: { xs: 2, sm: 3 }, 
          display: 'flex', 
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: { xs: 2, md: 0 },
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ opacity: 0.8, letterSpacing: { xs: 1, sm: 2 }, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              HAVEN REWARDS DASHBOARD
            </Typography>
            <Typography variant="h3" sx={{ 
              fontWeight: 700, 
              my: 1,
              fontSize: { xs: '1.75rem', sm: '2.5rem', md: '3rem' }
            }}>
              {Math.floor(points).toLocaleString()} <Typography component="span" variant="h5" sx={{ opacity: 0.7, fontSize: { xs: '1rem', sm: '1.5rem' } }}>PTS</Typography>
            </Typography>
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1, 
              mt: 1,
              flexWrap: 'wrap'
            }}>
              <Chip 
                icon={<StarIcon sx={{ color: '#FFD700 !important' }} />} 
                label={rankTitle}
                size="small"
                sx={{ 
                  bgcolor: 'rgba(255,255,255,0.1)', 
                  color: 'white', 
                  fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: { xs: '0.7rem', sm: '0.75rem' }
                }} 
              />
              <Chip 
                icon={<StreakIcon sx={{ color: '#FF5722 !important' }} />} 
                label={`${streak} Day Streak`}
                size="small"
                sx={{ 
                  bgcolor: 'rgba(255,255,255,0.1)', 
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: { xs: '0.7rem', sm: '0.75rem' }
                }} 
              />
            </Box>
          </Box>
          <Box sx={{ 
            textAlign: { xs: 'left', md: 'right' },
            width: { xs: '100%', md: 'auto' },
            mt: { xs: 1, md: 0 }
          }}>
            <FormControlLabel
              control={
                <Switch
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  color="success"
                  disabled={!filecoinConfig}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#4CAF50',
                    },
                    '& .MuiSwitch-track': {
                      backgroundColor: 'rgba(255,255,255,0.5) !important',
                    },
                  }}
                />
              }
              label={
                <Typography sx={{ 
                  fontWeight: 600, 
                  color: isActive ? '#4CAF50' : 'rgba(255,255,255,0.7)',
                  fontSize: { xs: '0.75rem', sm: '0.875rem' }
                }}>
                  {isActive ? "NODE ACTIVE" : "NODE INACTIVE"}
                </Typography>
              }
              labelPlacement="start"
            />
            <Typography variant="caption" display="block" sx={{ opacity: 0.6, mt: 1, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              {isActive ? "Earning passive rewards..." : "Start node to earn rewards"}
            </Typography>
          </Box>
        </Box>
        
        {/* Level Progress Bar */}
        <Box sx={{ bgcolor: 'rgba(0,0,0,0.2)', px: { xs: 2, sm: 3 }, py: 1.5 }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between', 
            mb: 0.5,
            gap: { xs: 0.5, sm: 0 }
          }}>
            <Typography variant="caption" sx={{ opacity: 0.8, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>Level {level}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.8, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>{(points % 1000).toFixed(0)} / 1000 XP to Level {level + 1}</Typography>
          </Box>
          <Box sx={{ height: 6, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <Box 
              sx={{ 
                width: `${(points % 1000) / 10}%`, 
                height: '100%', 
                bgcolor: '#4CAF50', 
                transition: 'width 0.5s ease-out' 
              }} 
            />
          </Box>
        </Box>
      </Paper>

      {!filecoinConfig && (
        <Alert severity="warning">
          Filecoin configuration is missing. Please configure it in settings before starting the node.
        </Alert>
      )}

      {/* Key Metrics */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(3, 1fr)',
          },
          gap: 2,
        }}
      >
        <Card sx={{ height: '100%' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: theme.palette.primary.main + '15' }}>
                <TrendingUpIcon color="primary" />
              </Box>
              <Typography variant="subtitle2" color="text.secondary">Network Status</Typography>
            </Box>
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
          </CardContent>
        </Card>
        
        <Card sx={{ height: '100%', border: currentRecording ? '2px solid #4CAF50' : undefined }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: theme.palette.secondary.main + '15' }}>
                <TimelineIcon color="secondary" />
              </Box>
              <Typography variant="subtitle2" color="text.secondary">Active Recording</Typography>
            </Box>
            {currentRecording ? (
              <Box>
                <Typography variant="h5" sx={{ fontFamily: 'monospace' }}>
                  {Math.floor(currentRecording.duration / 60)}:{(currentRecording.duration % 60).toString().padStart(2, '0')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  ID: {currentRecording.mintId.slice(0, 8)}...
                </Typography>
              </Box>
            ) : (
              <Typography variant="body1" color="text.secondary">No active session</Typography>
            )}
          </CardContent>
        </Card>

        <Card sx={{ height: '100%' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: '#9c27b015' }}>
                <CloudUploadIcon sx={{ color: '#9c27b0' }} />
              </Box>
              <Typography variant="subtitle2" color="text.secondary">Pending Uploads</Typography>
            </Box>
            <Typography variant="h4">
              {videos.filter(v => !v.filecoin_root_cid).length}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Queued for archival
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Concept: Points + Missions Dashboard */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            lg: '1.2fr 1fr',
          },
          gap: 2,
          mt: 0,
        }}
      >
        <Box>
          <Paper
            sx={{
              p: 3,
              background:
                'linear-gradient(135deg, rgba(17,25,40,0.95), rgba(17,25,40,0.7)), url(https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80)',
              backgroundSize: 'cover',
              color: '#fff',
            }}
          >
            <Typography variant="overline" sx={{ opacity: 0.8, letterSpacing: 3 }}>
              POINTSTREAM // EARLY ACCESS
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {points.toLocaleString()}
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.7 }}>
                pts
              </Typography>
              <Chip
                label={currentTier.name}
                size="small"
                sx={{
                  bgcolor: currentTier.color,
                  color: '#fff',
                  fontWeight: 600,
                }}
              />
            </Box>
            <Typography variant="body2" sx={{ mt: 1, opacity: 0.8 }}>
              {currentTier.name} tier · {nextTier.min.toLocaleString()} pts unlocks {nextTier.name}
            </Typography>

            <Box sx={{ mt: 3 }}>
              <LinearProgress
                variant="determinate"
                value={progressToNextTier}
                sx={{
                  height: 10,
                  borderRadius: 999,
                  bgcolor: 'rgba(255,255,255,0.1)',
                  '& .MuiLinearProgress-bar': { backgroundColor: currentTier.color },
                }}
              />
              <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.7 }}>
                {progressToNextTier}% to {nextTier.name}
              </Typography>
            </Box>

            <Box
              sx={{
                mt: 3,
                p: 2,
                borderRadius: 2,
                border: '1px dashed rgba(255,255,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Early Adopter Boost
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  +{bonusAvailable.toLocaleString()} pts
                </Typography>
              </Box>
              <Button
                variant="contained"
                color="success"
                disabled={bonusAvailable === 0}
                onClick={handleClaimBonus}
                sx={{ borderRadius: 999 }}
              >
                {bonusAvailable === 0 ? 'Claimed' : 'Claim Bonus'}
              </Button>
            </Box>
          </Paper>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(2, 1fr)',
            },
            gap: 2,
          }}
        >
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="subtitle2" color="text.secondary">
              Archival Impact
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Box>
                <Typography variant="h4">{archivedStreams}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Streams archived
                </Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box>
                <Typography variant="h4">{dailyStreak}d</Typography>
                <Typography variant="caption" color="text.secondary">
                  Streak
                </Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box>
                <Typography variant="h4">{completedUploads}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Uploads
                </Typography>
              </Box>
            </Box>

            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Daily Missions
              </Typography>
              {[
                {
                  label: 'Archive 1 livestream (5 min chunk)',
                  reward: '+150 pts',
                  complete: missionStates.archiveStream,
                },
                {
                  label: 'Upload 3 chunks to Filecoin',
                  reward: '+250 pts',
                  complete: missionStates.uploadChunk,
                },
                {
                  label: 'Keep node active 30 min',
                  reward: '+200 pts',
                  complete: missionStates.maintainStreak,
                },
              ].map((mission) => (
                <Box
                  key={mission.label}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 1,
                    borderBottom: '1px dashed #eee',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {mission.complete ? (
                      <CheckCircleIcon fontSize="small" color="success" />
                    ) : (
                      <ScheduleIcon fontSize="small" color="disabled" />
                    )}
                    <Typography variant="body2">{mission.label}</Typography>
                  </Box>
                  <Chip
                    label={mission.reward}
                    size="small"
                    color={mission.complete ? 'success' : 'default'}
                  />
                </Box>
              ))}
            </Box>

            <Button
              fullWidth
              variant="outlined"
              startIcon={<BoltIcon />}
              sx={{ mt: 2 }}
              onClick={handleSimulateBoost}
            >
              Simulate Node Boost
            </Button>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Leaderboard (Concept)
            </Typography>
            <List dense>
              {leaderboardEntries.map((entry) => (
                <ListItem
                  key={entry.name}
                  sx={{
                    borderBottom: '1px solid #f0f0f0',
                    bgcolor: entry.highlight ? 'rgba(76,175,80,0.08)' : 'transparent',
                  }}
                >
                  <MilitaryIcon fontSize="small" color={entry.highlight ? 'success' : 'disabled'} />
                  <ListItemText
                    sx={{ ml: 1 }}
                    primary={
                      <Typography sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{entry.name}</span>
                        <strong>{entry.score.toLocaleString()} pts</strong>
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {entry.badge}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Box>
      </Box>

      {/* Activity Log */}
      <Paper sx={{ flexGrow: 1, p: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <ScheduleIcon color="action" fontSize="small" />
          <Typography variant="subtitle2">
            Node Activity Log
          </Typography>
          {lastTick && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              Last Tick: {lastTick.toLocaleTimeString()}
            </Typography>
          )}
        </Box>
        <List sx={{ flexGrow: 1, overflow: 'auto', bgcolor: '#f8f9fa', borderRadius: 2, p: 1 }}>
          {logs.length === 0 && (
            <Box sx={{ p: 4, textAlign: 'center', opacity: 0.6 }}>
              <Typography variant="body2">No activity recorded this session.</Typography>
              <Typography variant="caption">Activate the node to start earning rewards.</Typography>
            </Box>
          )}
          {logs.map((log, index) => (
            <ListItem key={index} dense sx={{ py: 0.5, borderBottom: '1px solid #eee' }}>
              <ListItemText 
                primary={log} 
                primaryTypographyProps={{ 
                  variant: 'body2', 
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: log.includes('❌') ? 'error' : log.includes('🎉') ? 'secondary' : 'text.primary',
                  fontWeight: log.includes('🎉') ? 600 : 400
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
