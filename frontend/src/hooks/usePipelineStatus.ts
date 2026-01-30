/**
 * usePipelineStatus Hook
 * 
 * Aggregates real-time pipeline status across all stages:
 * - Encrypting (Lit Protocol)
 * - Uploading (Filecoin)
 * - Analyzing (VLM/AI)
 * - Syncing (Arkiv)
 * - Downloading/Recording (Plugins)
 * 
 * Provides data for the HealthPulseBar pipeline indicator and
 * OperationQueueTray plugin job status.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  PipelineStage, 
  PipelineStageStatus, 
  PipelineStatus,
  PluginJobStatus,
  QueueStats 
} from '@/types/transformation';
import { PluginMetadata, MediaSource } from '@/types/plugin';
import { pluginService, getAllJobs, JobProgress } from '@/services/api';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';

// Stage color mapping matching the liquid glass theme
const STAGE_COLORS: Record<PipelineStage, string> = {
  encrypting: liquidGlassTokens.neon.magenta,  // Purple/magenta for encryption
  uploading: liquidGlassTokens.neon.cyan,      // Cyan for Filecoin upload
  analyzing: liquidGlassTokens.neon.amber,     // Amber/orange for AI analysis
  syncing: liquidGlassTokens.neon.success,     // Green for Arkiv sync
  downloading: liquidGlassTokens.neon.cyan,    // Cyan for downloads
  idle: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  encrypting: 'Encrypting',
  uploading: 'Uploading',
  analyzing: 'Analyzing',
  syncing: 'Syncing',
  downloading: 'Downloading',
  idle: 'Idle',
};

// Plugin color mapping for consistent visual identity
const PLUGIN_COLORS: Record<string, string> = {
  'PumpFunPlugin': liquidGlassTokens.neon.magenta,
  'YouTubePlugin': liquidGlassTokens.neon.error,  // Red for YouTube
  'BitTorrentPlugin': liquidGlassTokens.neon.cyan,
  'OpenRingPlugin': liquidGlassTokens.neon.amber,
  'WebRTCArchiver': liquidGlassTokens.neon.magenta,
};

interface UsePipelineStatusReturn {
  // Pipeline status for HealthPulseBar
  pipelineStatus: PipelineStatus;
  
  // Plugin-specific job status for OperationQueueTray
  pluginJobs: PluginJobStatus[];
  
  // Raw data for custom rendering
  activeJobs: JobProgress[];
  pluginSources: Map<string, MediaSource[]>;
  
  // Loading state
  loading: boolean;
  error: string | null;
  
  // Actions
  refresh: () => void;
}

export function usePipelineStatus(queueStats?: QueueStats): UsePipelineStatusReturn {
  // Core data states
  const [plugins, setPlugins] = useState<PluginMetadata[]>([]);
  const [activeJobs, setActiveJobs] = useState<JobProgress[]>([]);
  const [pluginSources, setPluginSources] = useState<Map<string, MediaSource[]>>(new Map());
  const [uploadingVideos, setUploadingVideos] = useState<Set<string>>(new Set());
  const [analyzingVideos, setAnalyzingVideos] = useState<Set<string>>(new Set());
  const [syncingVideos, setSyncingVideos] = useState<Set<string>>(new Set());
  const [encryptingVideos, setEncryptingVideos] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch plugins
  const fetchPlugins = useCallback(async () => {
    try {
      const pluginData = await pluginService.getAll();
      setPlugins(pluginData);
      return pluginData;
    } catch (err) {
      console.error('Failed to fetch plugins:', err);
      return [];
    }
  }, []);

  // Fetch active jobs from backend
  const fetchActiveJobs = useCallback(async () => {
    try {
      // Get processing jobs
      const jobs = await getAllJobs('processing');
      setActiveJobs(jobs);
      return jobs;
    } catch (err) {
      console.error('Failed to fetch active jobs:', err);
      return [];
    }
  }, []);

  // Fetch plugin sources (for download/recording status)
  const fetchPluginSources = useCallback(async (pluginList: PluginMetadata[]) => {
    const sourcesMap = new Map<string, MediaSource[]>();
    
    await Promise.all(
      pluginList.map(async (plugin) => {
        try {
          const response = await pluginService.getPluginSources(plugin.name);
          sourcesMap.set(plugin.name, response.sources);
        } catch (err) {
          console.warn(`Failed to fetch sources for ${plugin.name}:`, err);
          sourcesMap.set(plugin.name, []);
        }
      })
    );
    
    setPluginSources(sourcesMap);
    return sourcesMap;
  }, []);

  // Fetch upload status from main process via IPC
  const fetchUploadStatus = useCallback(async () => {
    try {
      // @ts-ignore - electron IPC
      const { ipcRenderer } = window.require('electron');
      const status = await ipcRenderer.invoke('get-upload-status');
      
      if (status && status.activeUploads) {
        setUploadingVideos(new Set(status.activeUploads));
      } else {
        setUploadingVideos(new Set());
      }
      
      if (status && status.encrypting) {
        setEncryptingVideos(new Set(status.encrypting));
      } else {
        setEncryptingVideos(new Set());
      }
    } catch (err) {
      // IPC not available or no uploads
      setUploadingVideos(new Set());
      setEncryptingVideos(new Set());
    }
  }, []);

  // Calculate pipeline status from all data sources
  const pipelineStatus = useMemo((): PipelineStatus => {
    const stages: PipelineStageStatus[] = [];
    
    // Count encrypting videos
    const encryptingCount = encryptingVideos.size;
    if (encryptingCount > 0) {
      stages.push({
        stage: 'encrypting',
        count: encryptingCount,
        color: STAGE_COLORS.encrypting,
        label: STAGE_LABELS.encrypting,
        icon: 'lock',
      });
    }
    
    // Count uploading videos (from IPC or queueStats)
    const uploadingCount = uploadingVideos.size || (queueStats?.uploading || 0);
    if (uploadingCount > 0) {
      stages.push({
        stage: 'uploading',
        count: uploadingCount,
        color: STAGE_COLORS.uploading,
        label: STAGE_LABELS.uploading,
        icon: 'cloud_upload',
      });
    }
    
    // Count analyzing videos (from jobs)
    const analyzingCount = activeJobs.filter(j => 
      j.video_path && !uploadingVideos.has(j.video_path)
    ).length;
    if (analyzingCount > 0) {
      stages.push({
        stage: 'analyzing',
        count: analyzingCount,
        color: STAGE_COLORS.analyzing,
        label: STAGE_LABELS.analyzing,
        icon: 'psychology',
      });
    }
    
    // Count syncing videos (from queueStats)
    const syncingCount = queueStats?.syncPending || 0;
    if (syncingCount > 0) {
      stages.push({
        stage: 'syncing',
        count: syncingCount,
        color: STAGE_COLORS.syncing,
        label: STAGE_LABELS.syncing,
        icon: 'sync',
      });
    }
    
    // Count downloading/recording from plugin sources
    let downloadingCount = 0;
    pluginSources.forEach((sources, pluginName) => {
      const active = sources.filter(s => 
        s.metadata?.status === 'running' || 
        s.metadata?.status === 'archiving' ||
        s.metadata?.operation_type === 'download'
      );
      downloadingCount += active.length;
    });
    
    if (downloadingCount > 0) {
      stages.push({
        stage: 'downloading',
        count: downloadingCount,
        color: STAGE_COLORS.downloading,
        label: STAGE_LABELS.downloading,
        icon: 'download',
      });
    }
    
    // If no active stages, show idle
    if (stages.length === 0) {
      stages.push({
        stage: 'idle',
        count: 0,
        color: STAGE_COLORS.idle,
        label: STAGE_LABELS.idle,
        icon: 'check_circle',
      });
    }
    
    const totalActive = stages
      .filter(s => s.stage !== 'idle')
      .reduce((sum, s) => sum + s.count, 0);
    
    return {
      stages,
      totalActive,
      hasActivity: totalActive > 0,
    };
  }, [activeJobs, encryptingVideos, uploadingVideos, queueStats, pluginSources]);

  // Calculate plugin-specific job status
  const pluginJobs = useMemo((): PluginJobStatus[] => {
    const jobs: PluginJobStatus[] = [];
    
    plugins.forEach(plugin => {
      const sources = pluginSources.get(plugin.name) || [];
      
      // Count downloading and recording
      const downloading = sources.filter(s => 
        s.metadata?.operation_type === 'download' &&
        (s.metadata?.status === 'running' || s.metadata?.status === 'archiving')
      ).length;
      
      const recording = sources.filter(s => 
        s.metadata?.operation_type === 'real-time' &&
        (s.metadata?.status === 'running' || s.metadata?.status === 'archiving')
      ).length;
      
      const totalActive = downloading + recording;
      
      if (totalActive > 0) {
        jobs.push({
          pluginName: plugin.name,
          pluginDisplayName: plugin.description || plugin.name.replace('Plugin', ''),
          downloading,
          recording,
          totalActive,
          color: PLUGIN_COLORS[plugin.name] || liquidGlassTokens.neon.cyan,
        });
      }
    });
    
    // Sort by total active (most active first)
    return jobs.sort((a, b) => b.totalActive - a.totalActive);
  }, [plugins, pluginSources]);

  // Main refresh function
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [pluginList] = await Promise.all([
        fetchPlugins(),
        fetchActiveJobs(),
        fetchUploadStatus(),
      ]);
      
      await fetchPluginSources(pluginList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch pipeline status');
    } finally {
      setLoading(false);
    }
  }, [fetchPlugins, fetchActiveJobs, fetchUploadStatus, fetchPluginSources]);

  // Set up polling
  useEffect(() => {
    refresh();
    
    // Poll every 5 seconds when active
    intervalRef.current = setInterval(refresh, 5000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refresh]);

  return {
    pipelineStatus,
    pluginJobs,
    activeJobs,
    pluginSources,
    loading,
    error,
    refresh,
  };
}

export default usePipelineStatus;
