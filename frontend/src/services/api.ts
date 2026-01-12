import axios from 'axios';
import { Video, Timestamp, VideoCreate, TimestampCreate, StreamInfo, VideoGroup } from '@/types/video';
import type { IpfsGatewayConfig } from '@/types/playback';
import {
  PluginMetadata,
  PluginHealth,
  MediaSource,
  SourcesResponse,
  ArchiveResult,
  PluginConfig,
  DiscoverResponse,
  RecurringJob,
  RecurringJobCreate,
  RecurringJobUpdate,
  SchedulerStatus,
  PumpFunStream,
  PumpFunSubscription,
} from '@/types/plugin';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Job-related types
export interface JobProgress {
  id: number;
  video_path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface JobCreateResponse {
  job_id: number;
  status: string;
}

export const videoService = {
  getAll: async (): Promise<Video[]> => {
    const response = await api.get<Video[]>('/videos/');
    return response.data;
  },

  getGrouped: async (): Promise<VideoGroup[]> => {
    const response = await api.get<VideoGroup[]>('/videos/grouped');
    return response.data;
  },

  create: async (video: VideoCreate): Promise<Video> => {
    const response = await api.post<Video>('/videos/', video);
    return response.data;
  },

  delete: async (videoPath: string): Promise<void> => {
    await api.delete(`/videos/${encodeURIComponent(videoPath)}`);
  },

  moveToFront: async (videoPath: string): Promise<void> => {
    await api.put(`/videos/${encodeURIComponent(videoPath)}/move-to-front`);
  },

  getTimestamps: async (videoPath: string): Promise<Timestamp[]> => {
    const response = await api.get<Timestamp[]>(`/videos/${encodeURIComponent(videoPath)}/timestamps/`);
    return response.data;
  },

  createTimestamp: async (videoPath: string, timestamp: TimestampCreate): Promise<Timestamp> => {
    const response = await api.post<Timestamp>(
      `/videos/${encodeURIComponent(videoPath)}/timestamps/`,
      timestamp
    );
    return response.data;
  },

  updateFilecoinMetadata: async (
    videoPath: string,
    metadata: {
      root_cid: string;
      piece_cid: string;
      piece_id?: number;
      data_set_id: string;
      transaction_hash?: string;
      is_encrypted?: boolean;
      lit_encryption_metadata?: string;
      encrypted_root_cid?: string;
      cid_encryption_metadata?: string;
    }
  ): Promise<Video> => {
    const response = await api.put<Video>(
      `/videos/${encodeURIComponent(videoPath)}/filecoin-metadata`,
      metadata
    );
    return response.data;
  },

  updateSharePreference: async (videoPath: string, shareToArkiv: boolean): Promise<Video> => {
    const response = await api.put<Video>(
      `/videos/${encodeURIComponent(videoPath)}/share`,
      { share_to_arkiv: shareToArkiv }
    );
    return response.data;
  },
};

// Job-related API functions
export const startAnalysisJob = async (videoPath: string): Promise<JobCreateResponse> => {
  // Strip leading slash from absolute paths to avoid double slashes in URL
  const normalizedPath = videoPath.startsWith('/') ? videoPath.slice(1) : videoPath;
  const response = await api.post<JobCreateResponse>(`/jobs/videos/${encodeURIComponent(normalizedPath)}/analyze`);
  return response.data;
};

export const getJobProgress = async (jobId: number): Promise<JobProgress> => {
  const response = await api.get<JobProgress>(`/jobs/${jobId}`);
  return response.data;
};

export const getVideoJobs = async (videoPath: string): Promise<JobProgress[]> => {
  // Strip leading slash from absolute paths to avoid double slashes in URL
  const normalizedPath = videoPath.startsWith('/') ? videoPath.slice(1) : videoPath;
  const response = await api.get<JobProgress[]>(`/jobs/videos/${encodeURIComponent(normalizedPath)}/jobs`);
  return response.data;
};

export const getAllJobs = async (status?: string): Promise<JobProgress[]> => {
  const params = status ? { status } : {};
  const response = await api.get<JobProgress[]>('/jobs/', { params });
  return response.data;
};

export const cancelJob = async (jobId: number): Promise<void> => {
  await api.delete(`/jobs/${jobId}`);
};

export const restoreService = {
  restoreFromArkiv: async (): Promise<{ success: boolean; restored: number; skipped: number }> => {
    const response = await api.post<{ success: boolean; restored: number; skipped: number }>('/restore/arkiv');
    return response.data;
  },
  decryptVideoCid: async (videoPath: string, decryptedCid: string): Promise<void> => {
    await api.patch(`/videos/${encodeURIComponent(videoPath)}/decrypt-cid`, {
      decrypted_cid: decryptedCid,
    });
  },
  getVideosNeedingDecryption: async (): Promise<Array<{ path: string; encrypted_filecoin_cid: string; cid_encryption_metadata: string }>> => {
    const response = await api.get<Array<{ path: string; encrypted_filecoin_cid: string; cid_encryption_metadata: string }>>('/videos/needing-cid-decryption');
    return response.data;
  },
};

// Stream-related API functions
export const streamService = {
  getPopular: async (limit: number = 20): Promise<StreamInfo[]> => {
    const response = await api.get<StreamInfo[]>(`/live/popular?limit=${limit}`);
    return response.data;
  },

  getLive: async (offset: number = 0, limit: number = 60, includeNsfw: boolean = true): Promise<StreamInfo[]> => {
    const response = await api.get<StreamInfo[]>(`/live?offset=${offset}&limit=${limit}&include_nsfw=${includeNsfw}`);
    return response.data;
  },

  getStreamInfo: async (mintId: string): Promise<StreamInfo> => {
    const response = await api.get<StreamInfo>(`/live/stream/${mintId}`);
    return response.data;
  },

  validateStream: async (mintId: string): Promise<{ mint_id: string; is_valid: boolean; is_live: boolean }> => {
    const response = await api.get(`/live/validate/${mintId}`);
    return response.data;
  },

  getStats: async (): Promise<{
    total_live_streams: number;
    total_participants: number;
    nsfw_streams: number;
    sfw_streams: number;
    top_stream: StreamInfo | null;
  }> => {
    const response = await api.get('/live/stats');
    return response.data;
  },
};

export const gatewayService = {
  get: async (): Promise<IpfsGatewayConfig> => {
    const response = await api.get<{ base_url: string }>('/config/gateway');
    const baseUrl = response.data.base_url;
    return { baseUrl };
  },
  update: async (config: IpfsGatewayConfig): Promise<IpfsGatewayConfig> => {
    const response = await api.put<{ base_url: string }>('/config/gateway', {
      base_url: config.baseUrl,
    });
    return { baseUrl: response.data.base_url };
  },
};

export interface EvmConfigResponse {
  wallet_address: string;
  chain_name: string;
  native_token_symbol: string;
  rpc_url: string;
}

export interface EvmBalanceResponse {
  wallet_address: string;
  chain_name: string;
  native_token_symbol: string;
  balance_wei: string;
  balance_ether: number;
  has_sufficient_balance: boolean;
  rpc_url: string;
}

const { ipcRenderer } = require('electron');

export const evmService = {
  validateConfig: async (rpcUrl?: string): Promise<EvmConfigResponse> => {
    // Use IPC to validate config - private key is loaded from secure storage in main process
    const result = await ipcRenderer.invoke('validate-evm-config', { rpcUrl });
    return result;
  },
  checkBalance: async (rpcUrl?: string): Promise<EvmBalanceResponse> => {
    // Use IPC to check balance - private key is loaded from secure storage in main process
    const result = await ipcRenderer.invoke('check-evm-balance', { rpcUrl });
    return result;
  },
};

// Plugin-related API functions
export const pluginService = {
  // List all plugins
  getAll: async (): Promise<PluginMetadata[]> => {
    const response = await api.get<PluginMetadata[]>('/plugins');
    return response.data;
  },

  // Discover new plugins
  discover: async (): Promise<DiscoverResponse> => {
    const response = await api.post<DiscoverResponse>('/plugins/discover');
    return response.data;
  },

  // Load a plugin
  load: async (name: string): Promise<PluginMetadata> => {
    const response = await api.post<PluginMetadata>(`/plugins/${encodeURIComponent(name)}/load`);
    return response.data;
  },

  // Unload a plugin
  unload: async (name: string): Promise<PluginMetadata> => {
    const response = await api.post<PluginMetadata>(`/plugins/${encodeURIComponent(name)}/unload`);
    return response.data;
  },

  // Restart a plugin
  restart: async (name: string): Promise<PluginMetadata> => {
    const response = await api.post<PluginMetadata>(`/plugins/${encodeURIComponent(name)}/restart`);
    return response.data;
  },

  // Health check all plugins
  getHealth: async (): Promise<PluginHealth[]> => {
    const response = await api.get<PluginHealth[]>('/plugins/health');
    return response.data;
  },

  // Get plugin config
  getConfig: async (name: string): Promise<PluginConfig> => {
    const response = await api.get<PluginConfig>(`/plugins/${encodeURIComponent(name)}/config`);
    return response.data;
  },

  // Update plugin config
  updateConfig: async (name: string, config: PluginConfig): Promise<PluginConfig> => {
    const response = await api.patch<PluginConfig>(`/plugins/${encodeURIComponent(name)}/config`, config);
    return response.data;
  },

  // Delete plugin config
  deleteConfig: async (name: string): Promise<void> => {
    await api.delete(`/plugins/${encodeURIComponent(name)}/config`);
  },

  // Get all sources from all loaded plugins
  getAllSources: async (): Promise<SourcesResponse> => {
    const response = await api.get<SourcesResponse>('/plugins/sources');
    return response.data;
  },

  // Get sources from a specific plugin
  getPluginSources: async (name: string): Promise<SourcesResponse> => {
    const response = await api.get<SourcesResponse>(`/plugins/${encodeURIComponent(name)}/sources`);
    return response.data;
  },

  // Archive a source
  archiveSource: async (pluginName: string, sourceId: string): Promise<ArchiveResult> => {
    const params = new URLSearchParams({
      plugin_name: pluginName,
      source_id: sourceId,
    });
    const response = await api.post<ArchiveResult>(`/archive?${params.toString()}`);
    return response.data;
  },

  // ============================================
  // Recurring Jobs
  // ============================================

  // Get all recurring jobs
  getRecurringJobs: async (pluginName?: string): Promise<{ jobs: RecurringJob[]; count: number }> => {
    const params = pluginName ? { plugin_name: pluginName } : {};
    const response = await api.get<{ jobs: RecurringJob[]; count: number }>('/recurring-jobs/jobs/recurring', { params });
    return response.data;
  },

  // Get a specific recurring job
  getRecurringJob: async (jobId: number): Promise<RecurringJob> => {
    const response = await api.get<RecurringJob>(`/recurring-jobs/jobs/recurring/${jobId}`);
    return response.data;
  },

  // Create a recurring job
  createRecurringJob: async (jobData: RecurringJobCreate): Promise<{ message: string; job: RecurringJob }> => {
    const response = await api.post<{ message: string; job: RecurringJob }>('/recurring-jobs/jobs/recurring', jobData);
    return response.data;
  },

  // Update a recurring job
  updateRecurringJob: async (
    jobId: number,
    jobData: Partial<RecurringJobUpdate>
  ): Promise<{ message: string }> => {
    const response = await api.patch<{ message: string }>(`/recurring-jobs/jobs/recurring/${jobId}`, jobData);
    return response.data;
  },

  // Delete a recurring job
  deleteRecurringJob: async (jobId: number): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/recurring-jobs/jobs/recurring/${jobId}`);
    return response.data;
  },

  // Pause a recurring job
  pauseRecurringJob: async (jobId: number): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>(`/recurring-jobs/jobs/recurring/${jobId}/pause`);
    return response.data;
  },

  // Resume a recurring job
  resumeRecurringJob: async (jobId: number): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>(`/recurring-jobs/jobs/recurring/${jobId}/resume`);
    return response.data;
  },

  // Run a job manually
  runJobNow: async (jobId: number): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>(`/recurring-jobs/jobs/recurring/${jobId}/run`);
    return response.data;
  },

  // Get scheduler status
  getSchedulerStatus: async (): Promise<SchedulerStatus> => {
    const response = await api.get<SchedulerStatus>('/recurring-jobs/jobs/recurring/scheduler');
    return response.data;
  },
};

// PumpFun-related API functions
export const pumpfunService = {
  // Get available PumpFun streams
  getStreams: async (
    offset?: number,
    limit?: number,
    minParticipants?: number,
    maxParticipants?: number,
    includeNsfw?: boolean
  ): Promise<PumpFunStream[]> => {
    const params = new URLSearchParams();
    if (offset !== undefined) params.append('offset', offset.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    if (minParticipants !== undefined) params.append('min_participants', minParticipants.toString());
    if (maxParticipants !== undefined) params.append('max_participants', maxParticipants.toString());
    if (includeNsfw !== undefined) params.append('include_nsfw', includeNsfw.toString());

    const response = await api.get<PumpFunStream[]>(`/live/available?${params.toString()}`);
    return response.data;
  },

  // Get PumpFun stream details
  getStream: async (mintId: string): Promise<PumpFunStream> => {
    const response = await api.get<PumpFunStream>(`/live/stream/${mintId}`);
    return response.data;
  },

  // Get user's PumpFun subscriptions
  getSubscriptions: async (): Promise<PumpFunSubscription[]> => {
    const response = await api.get<PumpFunSubscription[]>('/live/subscriptions');
    return response.data;
  },

  // Get subscription details for a specific stream
  getSubscription: async (mintId: string): Promise<PumpFunSubscription> => {
    const response = await api.get<PumpFunSubscription>(`/live/subscription/${mintId}`);
    return response.data;
  },

  // Get subscription status (including recording status)
  getSubscriptionStatus: async (mintId: string): Promise<{
    is_subscribed: boolean;
    is_enabled: boolean;
    is_recording: boolean;
    subscription?: PumpFunSubscription;
  }> => {
    const response = await api.get(`/live/subscription/${mintId}/status`);
    return response.data;
  },

  // Subscribe to a PumpFun stream
  subscribe: async (mintId: string, config?: {
    stream_name?: string;
    priority?: number;
    notes?: string;
  }): Promise<PumpFunSubscription> => {
    const response = await api.post<PumpFunSubscription>('/live/subscribe', {
      mint_id: mintId,
      ...config,
    });
    return response.data;
  },

  // Unsubscribe from a PumpFun stream
  unsubscribe: async (mintId: string): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/live/unsubscribe/${mintId}`);
    return response.data;
  },

  // Enable a subscription
  enableSubscription: async (mintId: string): Promise<{ message: string }> => {
    const response = await api.patch<{ message: string }>(`/live/subscription/${mintId}`, {
      enabled: true,
    });
    return response.data;
  },

  // Disable a subscription
  disableSubscription: async (mintId: string): Promise<{ message: string }> => {
    const response = await api.patch<{ message: string }>(`/live/subscription/${mintId}`, {
      enabled: false,
    });
    return response.data;
  },

  // Update subscription
  updateSubscription: async (mintId: string, updates: {
    priority?: number;
    notes?: string;
  }): Promise<PumpFunSubscription> => {
    const response = await api.patch<PumpFunSubscription>(`/live/subscription/${mintId}`, updates);
    return response.data;
  },

  // Get recording status for a stream
  getRecordingStatus: async (mintId: string): Promise<{
    is_recording: boolean;
    recording_path?: string;
    started_at?: string;
    progress?: number;
  }> => {
    const response = await api.get(`/recording/status/${mintId}`);
    return response.data;
  },

  // Get all active recordings
  getActiveRecordings: async (): Promise<Array<{
    mint_id: string;
    stream_name: string;
    recording_path: string;
    started_at: string;
  }>> => {
    const response = await api.get('/recording/active');
    return response.data;
  },

  // Manual stop recording (emergency use)
  stopRecording: async (mintId: string): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>(`/recording/stop/${mintId}`);
    return response.data;
  },
};