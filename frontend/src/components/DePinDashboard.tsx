import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Alert,
  LinearProgress,
  Button,
  IconButton,
  Link,
  Grid,
  Badge,
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
import {
  liquidGlassTokens,
  glowEffects,
  glassStyles,
} from '@/styles/liquidGlassTheme';
import {
  GlassCard,
  HeroCard,
  CompactCard,
  BentoGrid,
  BentoCell,
  CircuitSubstrate,
  MetricDisplay,
  StatusIndicator,
  GlowButton,
  GlowChip,
} from '@/components/LiquidGlass';

type PointTier = {
  name: string;
  min: number;
  max: number;
  color: string;
  badge: string;
};

const POINT_TIERS: PointTier[] = [
  { name: 'Observer', min: 0, max: 999, color: liquidGlassTokens.neon.cyan, badge: 'Observer' },
  { name: 'Archivist', min: 1000, max: 2499, color: liquidGlassTokens.neon.success, badge: 'Archivist' },
  { name: 'Signal Keeper', min: 2500, max: 4999, color: liquidGlassTokens.neon.cyan, badge: 'Signal Keeper' },
  { name: 'Chronicle Guardian', min: 5000, max: 9999, color: liquidGlassTokens.neon.magenta, badge: 'Chronicle Guardian' },
  { name: 'Mythic Librarian', min: 10000, max: Infinity, color: liquidGlassTokens.neon.amber, badge: 'Mythic' },
];

interface DePinDashboardProps {
  filecoinConfig?: FilecoinConfig | null;
  onRequireSettings?: (tab: SettingsTab) => void;
}

const DePinDashboard: React.FC<DePinDashboardProps> = ({
  filecoinConfig: filecoinConfigProp = null,
  onRequireSettings,
}) => {
  const [logs, setLogs] = useState<Array<{ message: string; links?: Record<string, string> }>>([]);
  const [ipfsGateway, setIpfsGateway] = useState<string>('https://ipfs.io/ipfs/');
  const [filecoinConfig, setFilecoinConfig] = useState<FilecoinConfig | null>(filecoinConfigProp);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configPlugin, setConfigPlugin] = useState<{ name: string; displayName: string } | null>(null);
  const [pointsAnimating, setPointsAnimating] = useState(false);

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
    
    if (active) {
      setPointsAnimating(true);
      setTimeout(() => setPointsAnimating(false), 800);
    }
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
          await refreshVideos();

          const pendingVideo = videos
            .filter((v) => !v.filecoin_root_cid)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

          if (pendingVideo) {
            isUploadingRef.current = true;
            addLog(`⬆️ Starting upload for: ${pendingVideo.title}`);

            try {
              const uploadResult = await uploadVideo(pendingVideo.path, filecoinConfig, addLog);

              const links = generateExplorerLinks({
                rpcUrl: filecoinConfig.rpcUrl,
                filecoinTransactionHash: uploadResult.transactionHash,
                rootCid: uploadResult.rootCid,
                pieceCid: uploadResult.pieceCid,
                ipfsGateway: ipfsGateway,
              });

              addLog(`✅ Upload Complete: ${pendingVideo.title}`, links);
              
              // Trigger points animation
              setPointsAnimating(true);
              setTimeout(() => setPointsAnimating(false), 800);

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

      intervalId = setInterval(checkUploads, 10000);
    }

    return () => clearInterval(intervalId);
  }, [state.is_active, filecoinConfig, videos, refreshVideos, uploadVideo, ipfsGateway]);

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        background: liquidGlassTokens.canvas.base,
      }}
    >
      {/* Full-page circuit substrate */}
      <CircuitSubstrate
        density={6}
        opacity={0.12}
        networkActive={state.is_active}
        animated={true}
      />

      {/* Content container */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          padding: liquidGlassTokens.spacing.md,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Hero Section - Points Dashboard */}
        <HeroCard
          glowColor="amber"
          sx={{
            mb: 3,
            overflow: 'visible',
            background: `linear-gradient(135deg, ${liquidGlassTokens.neon.amber}10 0%, ${liquidGlassTokens.neon.magenta}05 100%)`,
            ...(pointsAnimating && {
              animation: 'reward-bloom 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
            }),
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: { xs: 'flex-start', md: 'center' },
              justifyContent: 'space-between',
              gap: 3,
            }}
          >
            {/* Left - Points and Rank */}
            <Box sx={{ flex: 1 }}>
              <Typography
                sx={{
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  mb: 1,
                }}
              >
                Haven Rewards Dashboard
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mb: 2 }}>
                <MetricDisplay
                  value={Math.floor(state.points)}
                  glowColor="amber"
                  size="large"
                  animate={pointsAnimating}
                />
                <Typography
                  sx={{
                    fontSize: '18px',
                    fontWeight: 500,
                    color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  }}
                >
                  PTS
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <GlowChip
                  label={rankTitle}
                  glowColor="amber"
                  active
                  icon={<StarIcon sx={{ fontSize: 14, color: liquidGlassTokens.neon.amber }} />}
                />
                <GlowChip
                  label={`${streak} Day Streak`}
                  glowColor="magenta"
                  active={streak > 0}
                  icon={<StreakIcon sx={{ fontSize: 14 }} />}
                />
              </Box>
            </Box>

            {/* Right - Node Toggle */}
            <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={state.is_active}
                    onChange={(e) => handleToggleActive(e.target.checked)}
                    disabled={!filecoinConfig}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: liquidGlassTokens.neon.success,
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: `${liquidGlassTokens.neon.success}60`,
                      },
                      '& .MuiSwitch-track': {
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      },
                    }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <StatusIndicator
                      status={state.is_active ? 'active' : 'inactive'}
                      pulse={state.is_active}
                    />
                    <Typography
                      sx={{
                        fontWeight: 600,
                        fontSize: '14px',
                        color: state.is_active 
                          ? liquidGlassTokens.neon.success 
                          : `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                      }}
                    >
                      {state.is_active ? 'NODE ACTIVE' : 'NODE INACTIVE'}
                    </Typography>
                  </Box>
                }
                labelPlacement="start"
                sx={{ m: 0 }}
              />
              <Typography
                sx={{
                  fontSize: '12px',
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  mt: 1,
                }}
              >
                {state.is_active ? 'Earning passive rewards...' : 'Start node to earn rewards'}
              </Typography>
            </Box>
          </Box>

          {/* Level Progress Bar */}
          <Box
            sx={{
              mt: 3,
              pt: 2,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography
                sx={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                }}
              >
                Level {level}
              </Typography>
              <Typography
                sx={{
                  fontSize: '12px',
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                }}
              >
                {Math.floor(state.points % 1000)} / 1000 XP to Level {level + 1}
              </Typography>
            </Box>
            <Box
              sx={{
                height: 6,
                borderRadius: 3,
                background: 'rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  width: `${(state.points % 1000) / 10}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${liquidGlassTokens.neon.cyan}, ${liquidGlassTokens.neon.magenta})`,
                  borderRadius: 3,
                  transition: 'width 0.5s ease-out',
                  boxShadow: `0 0 12px ${liquidGlassTokens.neon.cyan}50`,
                }}
              />
            </Box>
          </Box>
        </HeroCard>

        {/* Alerts */}
        {loading && state.is_active && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Loading dashboard data...
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Error: {error}
          </Alert>
        )}
        {!filecoinConfig && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Filecoin configuration is missing. Please configure it in settings before starting the node.
          </Alert>
        )}

        {/* Bento Grid Layout */}
        <BentoGrid columns={12} gap="standard">
          {/* Key Metrics Row */}
          <BentoCell colSpan={3} animateEntry animationDelay={0}>
            <MetricCard
              title="Total Archived"
              value={state.total_archived}
              icon={<ScheduleIcon />}
              color="cyan"
            />
          </BentoCell>
          
          <BentoCell colSpan={3} animateEntry animationDelay={50}>
            <MetricCard
              title="Uploaded to Filecoin"
              value={state.total_uploaded}
              icon={<CloudUploadIcon />}
              color="magenta"
            />
          </BentoCell>
          
          <BentoCell colSpan={3} animateEntry animationDelay={100}>
            <MetricCard
              title="Pending Uploads"
              value={state.pending_uploads}
              icon={<BoltIcon />}
              color="amber"
            />
          </BentoCell>
          
          <BentoCell colSpan={3} animateEntry animationDelay={150}>
            <MetricCard
              title="Active Operations"
              value={state.active_operations.length}
              icon={<Extension />}
              color="success"
            />
          </BentoCell>

          {/* Upload Worker Config */}
          <BentoCell colSpan={12} animateEntry animationDelay={200}>
            <UploadWorkerConfig filecoinConfigured={!!filecoinConfig} />
          </BentoCell>

          {/* Active Operations Section */}
          <BentoCell colSpan={12}>
            <Box sx={{ mb: 2 }}>
              <Typography
                sx={{
                  fontSize: '12px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                }}
              >
                Active Operations
              </Typography>
            </Box>
          </BentoCell>

          {state.active_operations.length === 0 && state.is_active ? (
            <BentoCell colSpan={12}>
              <GlassCard>
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress 
                    size={40} 
                    sx={{ 
                      mb: 2,
                      color: liquidGlassTokens.neon.cyan,
                    }} 
                  />
                  <Typography 
                    sx={{ 
                      color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                      mb: 0.5,
                    }}
                  >
                    Discovering and archiving content...
                  </Typography>
                  <Typography 
                    sx={{ 
                      fontSize: '12px',
                      color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                    }}
                  >
                    Waiting for plugin operations to start
                  </Typography>
                </Box>
              </GlassCard>
            </BentoCell>
          ) : (
            state.active_operations.map((operation, index) => (
              <BentoCell key={operation.operation_id} colSpan={4} animateEntry animationDelay={index * 50}>
                <OperationCard
                  operation={operation}
                  onStop={() => stopOperation(operation.operation_id)}
                  onPause={(paused: boolean) => toggleOperationPause(operation.operation_id, paused)}
                />
              </BentoCell>
            ))
          )}

          {/* Plugin Status Section */}
          <BentoCell colSpan={12}>
            <Box sx={{ mb: 2, mt: 2 }}>
              <Typography
                sx={{
                  fontSize: '12px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                }}
              >
                Plugin Status
              </Typography>
            </Box>
          </BentoCell>

          {state.enabled_plugins.map((plugin, index) => (
            <BentoCell key={plugin.name} colSpan={4} animateEntry animationDelay={index * 50}>
              <PluginCard
                plugin={plugin}
                onConfigure={() => handleOpenConfig(plugin.name)}
              />
            </BentoCell>
          ))}

          {/* Activity Log */}
          <BentoCell colSpan={12}>
            <GlassCard
              sx={{
                height: 300,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <ScheduleIcon 
                  sx={{ 
                    fontSize: 16, 
                    color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` 
                  }} 
                />
                <Typography
                  sx={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                  }}
                >
                  Node Activity Log
                </Typography>
                {state.last_tick && (
                  <Typography
                    sx={{
                      fontSize: '11px',
                      color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                      ml: 'auto',
                    }}
                  >
                    Last Tick: {new Date(state.last_tick).toLocaleTimeString()}
                  </Typography>
                )}
              </Box>

              <Box
                sx={{
                  flex: 1,
                  overflow: 'auto',
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: `${liquidGlassTokens.radius.sm}px`,
                  padding: 1,
                }}
              >
                {logs.length === 0 ? (
                  <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Typography
                      sx={{
                        fontSize: '14px',
                        color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                      }}
                    >
                      No activity recorded this session.
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: '12px',
                        color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                        mt: 0.5,
                      }}
                    >
                      Activate the node to start earning rewards.
                    </Typography>
                  </Box>
                ) : (
                  <List dense sx={{ p: 0 }}>
                    {logs.map((log, index) => (
                      <ListItem
                        key={index}
                        sx={{
                          py: 0.5,
                          px: 1,
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        }}
                      >
                        <ListItemText
                          primary={
                            <Box>
                              <Typography
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '12px',
                                  color: log.message.includes('❌')
                                    ? liquidGlassTokens.neon.error
                                    : log.message.includes('✅') || log.message.includes('🎉')
                                    ? liquidGlassTokens.neon.success
                                    : log.message.includes('⬆️')
                                    ? liquidGlassTokens.neon.cyan
                                    : `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
                                  fontWeight: log.message.includes('🎉') ? 600 : 400,
                                }}
                              >
                                {log.message}
                              </Typography>
                              {log.links && Object.keys(log.links).length > 0 && (
                                <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                  {Object.entries(log.links).map(([key, url]) => (
                                    <Link
                                      key={key}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      sx={{
                                        fontSize: '10px',
                                        color: liquidGlassTokens.neon.cyan,
                                        textDecoration: 'none',
                                        '&:hover': {
                                          textDecoration: 'underline',
                                        },
                                      }}
                                    >
                                      🔗 {key}
                                    </Link>
                                  ))}
                                </Box>
                              )}
                            </Box>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            </GlassCard>
          </BentoCell>
        </BentoGrid>
      </Box>

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

// Metric Card Component
function MetricCard({ title, value, icon, color }: { 
  title: string; 
  value: number; 
  icon: React.ReactNode; 
  color: 'cyan' | 'magenta' | 'amber' | 'success';
}) {
  const colorMap = {
    cyan: liquidGlassTokens.neon.cyan,
    magenta: liquidGlassTokens.neon.magenta,
    amber: liquidGlassTokens.neon.amber,
    success: liquidGlassTokens.neon.success,
  };
  
  const neonColor = colorMap[color];
  
  return (
    <GlassCard sx={{ height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: `${liquidGlassTokens.radius.sm}px`,
            background: `${neonColor}15`,
            border: `1px solid ${neonColor}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: neonColor,
          }}
        >
          {icon}
        </Box>
        <Typography
          sx={{
            fontSize: '12px',
            fontWeight: 500,
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
          }}
        >
          {title}
        </Typography>
      </Box>
      <MetricDisplay value={value} glowColor={color} size="medium" />
    </GlassCard>
  );
}

// Operation Card Component
function OperationCard({ operation, onStop, onPause }: {
  operation: any;
  onStop: () => void;
  onPause: (paused: boolean) => void;
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return liquidGlassTokens.neon.success;
      case 'paused': return liquidGlassTokens.neon.amber;
      case 'completed': return liquidGlassTokens.neon.cyan;
      case 'failed': return liquidGlassTokens.neon.error;
      default: return `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`;
    }
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'real-time': return <PlayArrow sx={{ fontSize: 18 }} />;
      case 'subscription': return <VideoLibrary sx={{ fontSize: 18 }} />;
      case 'download': return <CloudUpload sx={{ fontSize: 18 }} />;
      default: return <Extension sx={{ fontSize: 18 }} />;
    }
  };

  const statusColor = getStatusColor(operation.status);

  return (
    <GlassCard sx={{ height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: `${liquidGlassTokens.radius.sm}px`,
              background: `${liquidGlassTokens.neon.cyan}15`,
              border: `1px solid ${liquidGlassTokens.neon.cyan}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: liquidGlassTokens.neon.cyan,
            }}
          >
            {getOperationIcon(operation.operation_type)}
          </Box>
          <Box>
            <Typography
              sx={{
                fontSize: '14px',
                fontWeight: 500,
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.primary})`,
              }}
            >
              {operation.plugin_display_name}
            </Typography>
            <Typography
              sx={{
                fontSize: '11px',
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              }}
            >
              {operation.source_name}
            </Typography>
          </Box>
        </Box>
        <GlowChip
          label={operation.status}
          glowColor={operation.status === 'running' ? 'success' : operation.status === 'paused' ? 'amber' : 'cyan'}
          active
        />
      </Box>

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography
            sx={{
              fontSize: '11px',
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            }}
          >
            {Math.floor(operation.duration_seconds / 60)}:{(operation.duration_seconds % 60).toString().padStart(2, '0')}
          </Typography>
          <Typography
            sx={{
              fontSize: '11px',
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            }}
          >
            {operation.progress}%
          </Typography>
        </Box>
        <Box
          sx={{
            height: 4,
            borderRadius: 2,
            background: 'rgba(255, 255, 255, 0.08)',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              width: `${operation.progress}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${liquidGlassTokens.neon.cyan}, ${liquidGlassTokens.neon.magenta})`,
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }}
          />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <IconButton
          size="small"
          onClick={() => onPause(operation.status === 'running')}
          sx={{
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
            '&:hover': {
              background: 'rgba(255, 255, 255, 0.08)',
              color: liquidGlassTokens.neon.cyan,
            },
          }}
        >
          {operation.status === 'running' ? <Pause fontSize="small" /> : <PlayArrow fontSize="small" />}
        </IconButton>
        <IconButton
          size="small"
          onClick={onStop}
          sx={{
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
            '&:hover': {
              background: `${liquidGlassTokens.neon.error}15`,
              color: liquidGlassTokens.neon.error,
            },
          }}
        >
          <Stop fontSize="small" />
        </IconButton>
      </Box>
    </GlassCard>
  );
}

// Plugin Card Component
function PluginCard({ plugin, onConfigure }: {
  plugin: any;
  onConfigure: () => void;
}) {
  return (
    <GlassCard sx={{ height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: `${liquidGlassTokens.radius.sm}px`,
              background: `${liquidGlassTokens.neon.magenta}15`,
              border: `1px solid ${liquidGlassTokens.neon.magenta}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: liquidGlassTokens.neon.magenta,
            }}
          >
            <Extension sx={{ fontSize: 18 }} />
          </Box>
          <Typography
            sx={{
              fontSize: '14px',
              fontWeight: 500,
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.primary})`,
            }}
          >
            {plugin.display_name}
          </Typography>
        </Box>
        <Badge badgeContent={plugin.active_operations_count} color="primary">
          <GlowChip
            label={plugin.status}
            glowColor={plugin.status === 'active' ? 'success' : 'cyan'}
            active={plugin.status === 'active'}
          />
        </Badge>
      </Box>

      <Typography
        sx={{
          fontSize: '12px',
          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
          mb: 2,
        }}
      >
        {plugin.active_operations_count} active operation(s)
      </Typography>

      <GlowButton
        size="small"
        glowColor="cyan"
        onClick={onConfigure}
        sx={{ width: '100%' }}
      >
        <SettingsIcon sx={{ fontSize: 16, mr: 1 }} />
        Configure
      </GlowButton>
    </GlassCard>
  );
}

export default DePinDashboard;
