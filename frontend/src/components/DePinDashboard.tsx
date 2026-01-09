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
  Grid,
  Badge,
  IconButton,
  Link,
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
  Settings as SettingsIcon,
  Extension,
  PlayArrow,
  Pause,
  Stop,
  VideoLibrary,
  CloudUpload,
} from '@mui/icons-material';
import { useVideos } from '@/hooks/useVideos';
import { useFilecoinUpload } from '@/hooks/useFilecoinUpload';
import { FilecoinConfig } from '@/types/filecoin';
import { SettingsTab } from '@/context/SettingsNavigationContext';
import { generateExplorerLinks } from '@/utils/explorerLinks';
import { loadGatewayConfig } from '@/services/playbackConfig';
import { useDePinDashboard } from '@/hooks/useDePinDashboard';
import { PluginConfigurationModal } from '@/components/Plugins/PluginConfigurationModal';
import UploadWorkerConfig from '@/components/UploadWorkerConfig';

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

interface DePinDashboardProps {
  filecoinConfig?: FilecoinConfig | null;
  onRequireSettings?: (tab: SettingsTab) => void;
}

const DePinDashboard: React.FC<DePinDashboardProps> = ({
  filecoinConfig: filecoinConfigProp = null,
  onRequireSettings,
}) => {
  const theme = useTheme();
  const [logs, setLogs] = useState<Array<{ message: string; links?: Record<string, string> }>>([]);
  const [ipfsGateway, setIpfsGateway] = useState<string>('https://ipfs.io/ipfs/');
  const [filecoinConfig, setFilecoinConfig] = useState<FilecoinConfig | null>(filecoinConfigProp);

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configPlugin, setConfigPlugin] = useState<{ name: string; displayName: string } | null>(
    null
  );

  const { videos, refreshVideos } = useVideos();
  const { uploadVideo } = useFilecoinUpload();

  const {
    state,
    loading,
    error,
    toggleActive,
    runTick,
    stopOperation,
    toggleOperationPause,
    loadPluginStatus,
  } = useDePinDashboard();

  const addLog = (message: string, links?: Record<string, string>) => {
    setLogs((prev) =>
      [
        {
          message: `[${new Date().toLocaleTimeString()}] ${message}`,
          links,
        },
        ...prev,
      ].slice(0, 100)
    );
  };

  // Load IPFS gateway config on mount
  useEffect(() => {
    loadGatewayConfig()
      .then((config) => {
        setIpfsGateway(config.baseUrl);
      })
      .catch((err) => {
        console.error('Failed to load IPFS gateway config:', err);
      });
  }, []);

  const level = useMemo(() => Math.floor(state.points / 1000) + 1, [state.points]);
  const rankTitle = useMemo(() => {
    if (state.points >= 8000) return 'Mythic Librarian';
    if (state.points >= 5000) return 'Chronicle Guardian';
    if (state.points >= 2500) return 'Signal Keeper';
    if (state.points >= 1000) return 'Archivist';
    return 'Observer';
  }, [state.points]);
  const streak = state.daily_streak;

  const currentTier = useMemo(() => {
    return (
      POINT_TIERS.find((tier) => state.points >= tier.min && state.points <= tier.max) ??
      POINT_TIERS[0]
    );
  }, [state.points]);

  const nextTier = useMemo(() => {
    const index = POINT_TIERS.findIndex((tier) => tier.name === currentTier.name);
    return POINT_TIERS[Math.min(index + 1, POINT_TIERS.length - 1)];
  }, [currentTier.name]);

  const progressToNextTier = useMemo(() => {
    if (nextTier.min === currentTier.min) return 100;
    const range = nextTier.min - currentTier.min;
    const progress = state.points - currentTier.min;
    return Math.min(100, Math.round((progress / range) * 100));
  }, [currentTier.min, nextTier.min, state.points]);

  // Load Filecoin config on mount
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

    if (!filecoinConfigProp) {
      loadConfig();
    } else {
      setFilecoinConfig(filecoinConfigProp);
    }
  }, [filecoinConfigProp]);

  const handleOpenConfig = (pluginName: string) => {
    const plugin = state.enabled_plugins.find((p) => p.name === pluginName);
    if (plugin) {
      setConfigPlugin({ name: pluginName, displayName: plugin.display_name });
      setConfigModalOpen(true);
    }
  };

  const handleCloseConfig = () => {
    setConfigModalOpen(false);
    setConfigPlugin(null);
  };

  const handleConfigSave = () => {
    loadPluginStatus();
    addLog(`✅ Updated ${configPlugin!.displayName} configuration`);
  };

  const handleToggleActive = async (active: boolean) => {
    if (active && !filecoinConfig) {
      addLog('⚠️ Filecoin config required. Opening settings...');
      onRequireSettings?.('filecoin');
      return;
    }

    toggleActive(active);
    addLog(active ? '🚀 DePIN Node Activated' : '⏹️  DePIN Node Deactivated');
  };

  // Ref to track if an upload is currently in progress to prevent overlaps
  const isUploadingRef = useRef(false);

  // Upload Loop (Frontend Worker)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (state.is_active && filecoinConfig) {
      const checkUploads = async () => {
        if (isUploadingRef.current) return;

        try {
          // Refresh videos to get latest status
          await refreshVideos();

          // Find first video that needs upload
          const pendingVideo = videos
            .filter((v) => !v.filecoin_root_cid) // Not yet uploaded
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

          if (pendingVideo) {
            isUploadingRef.current = true;
            addLog(`⬆️ Starting upload for: ${pendingVideo.title}`);

            try {
              const uploadResult = await uploadVideo(pendingVideo.path, filecoinConfig, addLog);

              // Generate explorer links for transparency
              const links = generateExplorerLinks({
                rpcUrl: filecoinConfig.rpcUrl,
                filecoinTransactionHash: uploadResult.transactionHash,
                rootCid: uploadResult.rootCid,
                pieceCid: uploadResult.pieceCid,
                ipfsGateway: ipfsGateway,
              });

              addLog(`✅ Upload Complete: ${pendingVideo.title}`, links);

              // Refresh videos to get updated metadata
              await refreshVideos();
            } catch (error) {
              addLog(`❌ Upload Failed: ${pendingVideo.title} - ${String(error)}`);
            } finally {
              isUploadingRef.current = false;
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
  }, [state.is_active, filecoinConfig, videos, refreshVideos, uploadVideo, ipfsGateway]);

  return (
    <Box
      sx={{
        p: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        overflowY: 'auto',
        minHeight: 0,
      }}
    >
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
            display: 'none',
          },
        }}
      >
        <Box
          sx={{
            p: { xs: 2, sm: 3 },
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: 'space-between',
            gap: { xs: 2, md: 0 },
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="overline"
              sx={{ opacity: 0.8, letterSpacing: { xs: 1, sm: 2 }, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
            >
              HAVEN REWARDS DASHBOARD
            </Typography>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 700,
                my: 1,
                fontSize: { xs: '1.75rem', sm: '2.5rem', md: '3rem' },
              }}
            >
              {Math.floor(state.points).toLocaleString()}{' '}
              <Typography
                component="span"
                variant="h5"
                sx={{ opacity: 0.7, fontSize: { xs: '1rem', sm: '1.5rem' } }}
              >
                PTS
              </Typography>
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mt: 1,
                flexWrap: 'wrap',
              }}
            >
              <Chip
                icon={<StarIcon sx={{ color: '#FFD700 !important' }} />}
                label={rankTitle}
                size="small"
                sx={{
                  bgcolor: 'rgba(255,255,255,0.1)',
                  color: 'white',
                  fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: { xs: '0.7rem', sm: '0.75rem' },
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
                  fontSize: { xs: '0.7rem', sm: '0.75rem' },
                }}
              />
            </Box>
          </Box>
          <Box
            sx={{
              textAlign: { xs: 'left', md: 'right' },
              width: { xs: '100%', md: 'auto' },
              mt: { xs: 1, md: 0 },
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={state.is_active}
                  onChange={(e) => handleToggleActive(e.target.checked)}
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
                <Typography
                  sx={{
                    fontWeight: 600,
                    color: state.is_active ? '#4CAF50' : 'rgba(255,255,255,0.7)',
                    fontSize: { xs: '0.75rem', sm: '0.875rem' },
                  }}
                >
                  {state.is_active ? 'NODE ACTIVE' : 'NODE INACTIVE'}
                </Typography>
              }
              labelPlacement="start"
            />
            <Typography
              variant="caption"
              display="block"
              sx={{ opacity: 0.6, mt: 1, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
            >
              {state.is_active ? 'Earning passive rewards...' : 'Start node to earn rewards'}
            </Typography>
          </Box>
        </Box>

        {/* Level Progress Bar */}
        <Box sx={{ bgcolor: 'rgba(0,0,0,0.2)', px: { xs: 2, sm: 3 }, py: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              mb: 0.5,
              gap: { xs: 0.5, sm: 0 },
            }}
          >
            <Typography variant="caption" sx={{ opacity: 0.8, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              Level {level}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              {(state.points % 1000).toFixed(0)} / 1000 XP to Level {level + 1}
            </Typography>
          </Box>
          <Box sx={{ height: 6, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <Box
              sx={{
                width: `${(state.points % 1000) / 10}%`,
                height: '100%',
                bgcolor: '#4CAF50',
                transition: 'width 0.5s ease-out',
              }}
            />
          </Box>
        </Box>
      </Paper>

      {loading && state.is_active && <Alert severity="info">Loading dashboard data...</Alert>}
      {error && <Alert severity="error">Error: {error}</Alert>}

      {!filecoinConfig && (
        <Alert severity="warning">
          Filecoin configuration is missing. Please configure it in settings before starting the node.
        </Alert>
      )}

      {/* Upload Worker Configuration */}
      <UploadWorkerConfig filecoinConfigured={!!filecoinConfig} />

      {/* Active Operations Section */}
      <Typography variant="h6">Active Operations</Typography>

      {state.active_operations.length === 0 && state.is_active ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              Discovering and archiving content...
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Waiting for plugin operations to start
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {state.active_operations.map((operation) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={operation.operation_id}>
              <OperationCard
                operation={operation}
                onStop={() => stopOperation(operation.operation_id)}
                onPause={(paused: boolean) => toggleOperationPause(operation.operation_id, paused)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Plugin Status Section */}
      <Typography variant="h6">Plugin Status</Typography>

      <Grid container spacing={2}>
        {state.enabled_plugins.map((plugin) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={plugin.name}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Extension fontSize="small" />
                    <Typography variant="body2">{plugin.display_name}</Typography>
                  </Box>
                  <Badge badgeContent={plugin.active_operations_count} color="primary">
                    <Chip
                      label={plugin.status}
                      size="small"
                      color={plugin.status === 'active' ? 'success' : 'default'}
                    />
                  </Badge>
                </Box>

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {plugin.active_operations_count} active operation(s)
                </Typography>

                <Button
                  size="small"
                  startIcon={<SettingsIcon />}
                  onClick={() => handleOpenConfig(plugin.name)}
                  sx={{ mt: 1 }}
                >
                  Configure
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Key Metrics */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Archived"
            value={state.total_archived}
            icon={<ScheduleIcon />}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Uploaded to Filecoin"
            value={state.total_uploaded}
            icon={<CloudUploadIcon />}
            color="secondary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Pending Uploads"
            value={state.pending_uploads}
            icon={<BoltIcon />}
            color="warning"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Active Operations"
            value={state.active_operations.length}
            icon={<Extension />}
            color="info"
          />
        </Grid>
      </Grid>

      {/* Activity Log */}
      <Paper
        sx={{
          flexGrow: 1,
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 200,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexShrink: 0 }}>
          <ScheduleIcon color="action" fontSize="small" />
          <Typography variant="subtitle2">Node Activity Log</Typography>
          {state.last_tick && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              Last Tick: {new Date(state.last_tick).toLocaleTimeString()}
            </Typography>
          )}
        </Box>
        <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <List sx={{ flex: 1, overflow: 'auto', bgcolor: '#f8f9fa', borderRadius: 2, p: 1, minHeight: 0 }}>
            {logs.length === 0 && (
              <Box sx={{ p: 4, textAlign: 'center', opacity: 0.6 }}>
                <Typography variant="body2">No activity recorded this session.</Typography>
                <Typography variant="caption">Activate the node to start earning rewards.</Typography>
              </Box>
            )}
            {logs.map((log, index) => (
              <ListItem key={index} dense sx={{ py: 0.5, borderBottom: '1px solid #eee' }}>
                <ListItemText
                  primary={
                    <Box>
                      <Typography
                        variant="body2"
                        fontFamily="monospace"
                        fontSize="0.75rem"
                        color={
                          log.message.includes('❌')
                            ? 'error.main'
                            : log.message.includes('🎉')
                            ? 'secondary.main'
                            : 'text.primary'
                        }
                        fontWeight={log.message.includes('🎉') ? 600 : 400}
                      >
                        {log.message}
                      </Typography>
                      {log.links && Object.keys(log.links).length > 0 && (
                        <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {log.links.filecoinTransaction && (
                            <Link
                              href={log.links.filecoinTransaction}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ fontSize: '0.7rem', textDecoration: 'none' }}
                            >
                              ⛏️ Filecoin Transaction
                            </Link>
                          )}
                          {log.links.transaction && (
                            <Link
                              href={log.links.transaction}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ fontSize: '0.7rem', textDecoration: 'none' }}
                            >
                              🔗 Arkiv Transaction
                            </Link>
                          )}
                          {log.links.ipfs && (
                            <Link
                              href={log.links.ipfs}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ fontSize: '0.7rem', textDecoration: 'none' }}
                            >
                              📦 IPFS
                            </Link>
                          )}
                          {log.links.filecoin && (
                            <Link
                              href={log.links.filecoin}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ fontSize: '0.7rem', textDecoration: 'none' }}
                            >
                              ⛏️ Filecoin CID
                            </Link>
                          )}
                          {log.links.ipni && (
                            <Link
                              href={log.links.ipni}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ fontSize: '0.7rem', textDecoration: 'none' }}
                            >
                              🔍 IPNI
                            </Link>
                          )}
                          {log.links.entity && (
                            <Link
                              href={log.links.entity}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ fontSize: '0.7rem', textDecoration: 'none' }}
                            >
                              📋 Arkiv Entity
                            </Link>
                          )}
                        </Box>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Box>
      </Paper>

      {/* Configuration Modal */}
      {configPlugin && (
        <PluginConfigurationModal
          open={configModalOpen}
          pluginName={configPlugin.name}
          pluginDisplayName={configPlugin.displayName}
          onClose={handleCloseConfig}
          onSave={handleConfigSave}
        />
      )}
    </Box>
  );
};

function OperationCard({ operation, onStop, onPause }: any) {
  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'real-time':
        return <PlayArrow />;
      case 'subscription':
        return <VideoLibrary />;
      case 'download':
        return <CloudUpload />;
      default:
        return <Extension />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'success';
      case 'paused':
        return 'warning';
      case 'completed':
        return 'primary';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {getOperationIcon(operation.operation_type)}
            <Box>
              <Typography variant="subtitle2">{operation.plugin_display_name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {operation.source_name}
              </Typography>
            </Box>
          </Box>
          <Chip label={operation.status} size="small" color={getStatusColor(operation.status) as any} />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {Math.floor(operation.duration_seconds / 60)}:
              {(operation.duration_seconds % 60).toString().padStart(2, '0')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {operation.progress}%
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={operation.progress} sx={{ height: 6, borderRadius: 3 }} />
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton size="small" onClick={() => onPause(operation.status === 'running')}>
            {operation.status === 'running' ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton size="small" color="error" onClick={onStop}>
            <Stop />
          </IconButton>
        </Box>
      </CardContent>
    </Card>
  );
}

function MetricCard({ title, value, icon, color }: any) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Box sx={{ p: 1, borderRadius: 2, bgcolor: `${color}15` }}>
            {React.cloneElement(icon, { color: color as any })}
          </Box>
          <Typography variant="subtitle2" color="text.secondary">
            {title}
          </Typography>
        </Box>
        <Typography variant="h4">{value}</Typography>
      </CardContent>
    </Card>
  );
}

export default DePinDashboard;
          
