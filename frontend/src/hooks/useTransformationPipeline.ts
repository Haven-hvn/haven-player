/**
 * useTransformationPipeline Hook
 * 
 * Manages the transformation pipeline state for the Haven interface.
 * Aggregates data from videos, upload queue, and recording sessions
 * to present a unified transformation-first view.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useVideos } from './useVideos';
import { useUploadWorker } from './useUploadWorker';
import { usePlugins } from './usePlugins';
import type { Video, VideoGroup, TokenGroupInfo } from '@/types/video';
import type { PluginMetadata } from '@/types/plugin';
import type {
  TransformationState,
  TransformationItem,
  Source,
  SourceType,
  SystemHealth,
  QueueStats,
  RecordingSession,
  StateFilter,
  SourceFilter,
  TimeFilter,
} from '@/types/transformation';

// Color mapping for transformation states
export const STATE_COLORS: Record<TransformationState, string> = {
  discovering: 'rgba(255, 255, 255, 0.4)',
  recording: '#FF00E5',     // Magenta - Active capture
  pending: 'rgba(255, 255, 255, 0.4)',
  uploading: '#00F5FF',     // Cyan - Transformation in progress
  preserved: '#00FF88',     // Success green - Safely on Filecoin
  syncing: '#FFB800',       // Amber - Blockchain sync
  synced: '#FFB800',        // Amber - Verified
  encrypted: '#00F5FF',     // Cyan border
  failed: '#FF3366',        // Error red
};

// Map plugin names to source types
const PLUGIN_TO_SOURCE_TYPE: Record<string, SourceType> = {
  'PumpFunPlugin': 'pumpfun',
  'YouTubePlugin': 'youtube',
  'BitTorrentPlugin': 'bittorrent',
  'OpenRingPlugin': 'openring',
};

export interface UseTransformationPipelineReturn {
  // Data
  items: TransformationItem[];
  filteredItems: TransformationItem[];
  sources: Source[];
  systemHealth: SystemHealth;
  queueStats: QueueStats;
  recordingSessions: RecordingSession[];
  
  // Filters
  activeStateFilter: TransformationState | 'all';
  activeSourceFilter: SourceType | 'all';
  activeTimeFilter: TimeFilter;
  searchQuery: string;
  stateFilters: StateFilter[];
  sourceFilters: SourceFilter[];
  
  // Filter actions
  setStateFilter: (state: TransformationState | 'all') => void;
  setSourceFilter: (source: SourceType | 'all') => void;
  setTimeFilter: (time: TimeFilter) => void;
  setSearchQuery: (query: string) => void;
  
  // Data actions
  refresh: () => void;
  
  // Loading states
  loading: boolean;
  error: string | null;
}

export function useTransformationPipeline(): UseTransformationPipelineReturn {
  // Core data hooks
  const { 
    videos, 
    videoGroups, 
    loading: videosLoading, 
    error: videosError,
    refreshVideos 
  } = useVideos();
  
  const { 
    status: uploadStatus, 
    queueStats: rawQueueStats,
    refreshStatus: refreshUploadStatus,
    refreshQueueStats 
  } = useUploadWorker();
  
  const { plugins, loading: pluginsLoading } = usePlugins();

  // Filter state
  const [activeStateFilter, setActiveStateFilter] = useState<TransformationState | 'all'>('all');
  const [activeSourceFilter, setActiveSourceFilter] = useState<SourceType | 'all'>('all');
  const [activeTimeFilter, setActiveTimeFilter] = useState<TimeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Recording sessions state (would be populated from backend)
  const [recordingSessions, setRecordingSessions] = useState<RecordingSession[]>([]);

  // System health state
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    backendConnected: false,
    backendStatus: 'loading',
    walletConnected: false,
    encryptionEnabled: false,
    points: 0,
    streak: 0,
  });

  // Track initial load - don't show 'disconnected' on startup
  const initialCheckRef = useRef(true);

  // Fetch Filecoin config from Electron main process (source of truth)
  const fetchFilecoinConfig = useCallback(async () => {
    try {
      // @ts-ignore - electron IPC
      const { ipcRenderer } = window.require('electron');
      const config = await ipcRenderer.invoke('get-filecoin-config');
      return config;
    } catch (error) {
      console.error('Failed to fetch Filecoin config:', error);
      return null;
    }
  }, []);

  // Fetch wallet address from Electron main process
  const fetchWalletAddress = useCallback(async () => {
    try {
      // @ts-ignore - electron IPC
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('get-wallet-address');
      return result?.wallet_address || null;
    } catch (error) {
      console.error('Failed to fetch wallet address:', error);
      return null;
    }
  }, []);

  // Fetch system health from backend API and combine with Filecoin config
  const fetchSystemHealth = useCallback(async () => {
    try {
      // Fetch backend health, Filecoin config, and wallet address in parallel
      // Note: No timeout - we wait for the backend to be ready, however long it takes
      const [response, filecoinConfig, walletAddress] = await Promise.all([
        fetch('http://localhost:8000/api/health'),
        fetchFilecoinConfig(),
        fetchWalletAddress(),
      ]);

      if (!response.ok) {
        throw new Error('Health check failed');
      }

      const data = await response.json();

      // Use Filecoin config as source of truth for wallet/encryption status
      // Backend may not have correct env vars set
      const hasWallet = !!filecoinConfig?.privateKey;
      const isEncryptionEnabled = filecoinConfig?.encryptionEnabled === true;

      setSystemHealth({
        backendConnected: data.backend_connected ?? true,
        backendStatus: data.backend_connected ? 'connected' : 'disconnected',
        // Wallet is connected if we have a private key in config
        walletConnected: hasWallet,
        // Show public wallet address (not private key!)
        walletAddress: walletAddress || undefined,
        // Encryption is enabled only if config flag is true AND wallet is connected
        encryptionEnabled: isEncryptionEnabled && hasWallet,
        points: data.points ?? 0,
        streak: data.streak ?? 0,
      });
      // Mark initial check complete
      initialCheckRef.current = false;
    } catch (error) {
      console.error('Failed to fetch system health:', error);
      // Even if backend fails, try to get Filecoin config for wallet status
      const [filecoinConfig, walletAddress] = await Promise.all([
        fetchFilecoinConfig(),
        fetchWalletAddress(),
      ]);
      const hasWallet = !!filecoinConfig?.privateKey;
      const isEncryptionEnabled = filecoinConfig?.encryptionEnabled === true;

      // On initial load, keep showing 'loading' until backend responds
      // Don't show 'disconnected' on startup - the backend might just be starting up
      // Only show 'disconnected' if we were previously connected
      if (initialCheckRef.current) {
        // Backend is still starting up - stay in loading state and retry
        // Don't update state, just let the next poll try again
        console.log('[useTransformationPipeline] Backend not ready yet, staying in loading state...');
      } else {
        // We were previously connected, now we're not - show disconnected
        setSystemHealth(prev => ({
          ...prev,
          backendConnected: false,
          backendStatus: 'disconnected',
          points: 0,
          streak: 0,
        }));
      }
    }
  }, [fetchFilecoinConfig, fetchWalletAddress]);

  // Poll health status periodically
  useEffect(() => {
    fetchSystemHealth();
    const interval = setInterval(fetchSystemHealth, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchSystemHealth]);

  // Determine transformation state from video data
  const getTransformationState = useCallback((video: Video): TransformationState => {
    // Check for errors first
    // (would need error tracking in video model)
    
    // Check Arkiv sync status
    if (video.arkiv_entity_key && video.arkiv_data_completeness === 'filecoin_and_vlm') {
      return 'synced';
    }
    
    if (video.arkiv_entity_key) {
      return 'syncing';
    }
    
    // Check Filecoin upload status
    if (video.filecoin_root_cid) {
      return 'preserved';
    }
    
    // Check if currently uploading (would need real-time status)
    // For now, check upload queue
    
    // Default to pending if has data but not uploaded
    if (video.has_ai_data || video.path) {
      return 'pending';
    }
    
    return 'discovering';
  }, []);

  // Determine source type from video data
  const getSourceType = useCallback((video: Video): SourceType => {
    if (video.mint_id) {
      return 'pumpfun';
    }
    if (video.source_uri?.includes('youtube')) {
      return 'youtube';
    }
    // Would need more metadata to determine bittorrent/openring
    return 'manual';
  }, []);

  // Transform videos into TransformationItems
  const items = useMemo((): TransformationItem[] => {
    return videos.map((video: Video): TransformationItem => {
      const state = getTransformationState(video);
      const sourceType = getSourceType(video);
      
      // Find token info if available
      const tokenInfo: TokenGroupInfo | null | undefined = video.mint_id && videoGroups
        ? videoGroups.find((g: VideoGroup) => g.token_info?.mint_id === video.mint_id)?.token_info
        : undefined;
      
      return {
        id: `video-${video.id}`,
        videoId: video.id,
        title: video.title,
        sourceType,
        sourceIdentity: video.mint_id || video.source_uri || video.path,
        state,
        duration: video.duration,
        discoveredAt: video.created_at,
        uploadedAt: video.filecoin_uploaded_at || undefined,
        filecoinCid: video.filecoin_root_cid || undefined,
        arkivEntityKey: video.arkiv_entity_key || undefined,
        isEncrypted: video.is_encrypted || false,
        thumbnail: video.thumbnail_path || undefined,
        tokenInfo: tokenInfo ? {
          mintId: tokenInfo.mint_id,
          name: tokenInfo.name || undefined,
          symbol: tokenInfo.symbol || undefined,
          imageUri: tokenInfo.image_uri || tokenInfo.thumbnail || undefined,
        } : undefined,
      };
    });
  }, [videos, videoGroups, getTransformationState, getSourceType]);

  // Filter items based on active filters
  const filteredItems = useMemo(() => {
    let result = [...items];

    // State filter
    if (activeStateFilter !== 'all') {
      result = result.filter(item => item.state === activeStateFilter);
    }

    // Source filter
    if (activeSourceFilter !== 'all') {
      result = result.filter(item => item.sourceType === activeSourceFilter);
    }

    // Time filter
    if (activeTimeFilter !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      
      switch (activeTimeFilter) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          filterDate.setMonth(now.getMonth() - 1);
          break;
      }
      
      result = result.filter(item => {
        const itemDate = new Date(item.discoveredAt || '');
        return itemDate >= filterDate;
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.title.toLowerCase().includes(query) ||
        item.sourceIdentity.toLowerCase().includes(query) ||
        item.filecoinCid?.toLowerCase().includes(query) ||
        item.tokenInfo?.name?.toLowerCase().includes(query) ||
        item.tokenInfo?.symbol?.toLowerCase().includes(query)
      );
    }

    // Sort by state priority (errors first, then recording, then by date)
    const statePriority: Record<TransformationState, number> = {
      failed: 0,
      recording: 1,
      uploading: 2,
      syncing: 3,
      pending: 4,
      preserved: 5,
      synced: 6,
      discovering: 7,
      encrypted: 8,
    };

    result.sort((a: TransformationItem, b: TransformationItem) => {
      const priorityDiff = statePriority[a.state] - statePriority[b.state];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Secondary sort by date (newest first)
      const dateA = new Date(a.discoveredAt || '').getTime();
      const dateB = new Date(b.discoveredAt || '').getTime();
      return dateB - dateA;
    });

    return result;
  }, [items, activeStateFilter, activeSourceFilter, activeTimeFilter, searchQuery]);

  // Build sources list from plugins
  const sources = useMemo((): Source[] => {
    return plugins
      .filter((plugin: PluginMetadata) => PLUGIN_TO_SOURCE_TYPE[plugin.name])
      .map((plugin: PluginMetadata): Source => {
        const sourceType = PLUGIN_TO_SOURCE_TYPE[plugin.name];
        const sourceItems = items.filter((item: TransformationItem) => item.sourceType === sourceType);
        const activeItems = sourceItems.filter((item: TransformationItem) => item.state === 'recording');
        const errorItems = sourceItems.filter((item: TransformationItem) => item.state === 'failed');
        
        return {
          id: plugin.name,
          type: sourceType,
          name: plugin.name.replace('Plugin', ''),
          enabled: plugin.enabled,
          healthy: plugin.enabled, // Would need real health check
          itemCount: sourceItems.length,
          activeCount: activeItems.length,
          errorCount: errorItems.length,
        };
      });
  }, [plugins, items]);

  // Build state filters with counts
  const stateFilters = useMemo((): StateFilter[] => {
    const stateCounts: Record<TransformationState | 'all', number> = {
      all: items.length,
      discovering: 0,
      recording: 0,
      pending: 0,
      uploading: 0,
      preserved: 0,
      syncing: 0,
      synced: 0,
      failed: 0,
      encrypted: 0,
    };

    items.forEach((item: TransformationItem) => {
      stateCounts[item.state]++;
      if (item.isEncrypted) {
        stateCounts.encrypted++;
      }
    });

    const filters: StateFilter[] = [
      { id: 'all', label: 'All Content', color: 'rgba(255, 255, 255, 0.7)', count: stateCounts.all },
      { id: 'recording', label: 'Recording', color: STATE_COLORS.recording, count: stateCounts.recording },
      { id: 'pending', label: 'Pending', color: STATE_COLORS.pending, count: stateCounts.pending },
      { id: 'uploading', label: 'Uploading', color: STATE_COLORS.uploading, count: stateCounts.uploading },
      { id: 'preserved', label: 'Preserved', color: STATE_COLORS.preserved, count: stateCounts.preserved },
      { id: 'synced', label: 'Synced', color: STATE_COLORS.synced, count: stateCounts.synced },
      { id: 'failed', label: 'Failed', color: STATE_COLORS.failed, count: stateCounts.failed },
    ];

    return filters.filter(f => f.id === 'all' || f.count > 0);
  }, [items]);

  // Build source filters with counts
  const sourceFilters = useMemo((): SourceFilter[] => {
    const sourceCounts: Record<SourceType | 'all', number> = {
      all: items.length,
      pumpfun: 0,
      youtube: 0,
      bittorrent: 0,
      openring: 0,
      manual: 0,
    };

    items.forEach((item: TransformationItem) => {
      sourceCounts[item.sourceType]++;
    });

    const filters: SourceFilter[] = [
      { id: 'all', label: 'All Sources', icon: 'apps', count: sourceCounts.all },
      { id: 'pumpfun', label: 'PumpFun', icon: 'token', count: sourceCounts.pumpfun },
      { id: 'youtube', label: 'YouTube', icon: 'youtube', count: sourceCounts.youtube },
      { id: 'bittorrent', label: 'BitTorrent', icon: 'cloud_download', count: sourceCounts.bittorrent },
      { id: 'openring', label: 'OpenRing', icon: 'devices', count: sourceCounts.openring },
      { id: 'manual', label: 'Manual', icon: 'upload_file', count: sourceCounts.manual },
    ];

    return filters.filter(f => f.id === 'all' || f.count > 0);
  }, [items]);

  // Queue stats
  const queueStats = useMemo((): QueueStats => {
    if (rawQueueStats) {
      return {
        pending: rawQueueStats.pending || 0,
        uploading: rawQueueStats.processing || 0,
        completed: rawQueueStats.completed || 0,
        failed: rawQueueStats.failed || 0,
        syncPending: 0, // Would need Arkiv sync queue
        syncCompleted: 0,
      };
    }

    // Fallback: count from items
    return {
      pending: items.filter((i: TransformationItem) => i.state === 'pending').length,
      uploading: items.filter((i: TransformationItem) => i.state === 'uploading').length,
      completed: items.filter((i: TransformationItem) => i.state === 'preserved' || i.state === 'synced').length,
      failed: items.filter((i: TransformationItem) => i.state === 'failed').length,
      syncPending: items.filter((i: TransformationItem) => i.state === 'syncing').length,
      syncCompleted: items.filter((i: TransformationItem) => i.state === 'synced').length,
    };
  }, [rawQueueStats, items]);

  // Refresh all data
  const refresh = useCallback(() => {
    refreshVideos();
    refreshUploadStatus();
    refreshQueueStats();
  }, [refreshVideos, refreshUploadStatus, refreshQueueStats]);

  // Combined loading state
  const loading = videosLoading || pluginsLoading;

  return {
    items,
    filteredItems,
    sources,
    systemHealth,
    queueStats,
    recordingSessions,
    
    activeStateFilter,
    activeSourceFilter,
    activeTimeFilter,
    searchQuery,
    stateFilters,
    sourceFilters,
    
    setStateFilter: setActiveStateFilter,
    setSourceFilter: setActiveSourceFilter,
    setTimeFilter: setActiveTimeFilter,
    setSearchQuery,
    
    refresh,
    
    loading,
    error: videosError,
  };
}
