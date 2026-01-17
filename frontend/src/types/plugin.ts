  // Plugin system type definitions

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  media_types: string[];
  loaded: boolean;
  enabled: boolean;
  config?: Record<string, any>;
  priority?: number;
  created_at?: string;
  updated_at?: string;
  capabilities?: string[];
}

export interface PluginHealth {
  plugin_name: string;
  healthy: boolean;
  last_check: string;
  error?: string;
}

export interface MediaSource {
  plugin: string;
  source_id: string;
  media_type: string;
  uri: string;
  metadata: {
    name?: string;
    symbol?: string;
    participants?: number;
    status?: 'running' | 'paused' | 'archiving' | 'completed' | 'failed';
    progress?: number;
    start_time?: string;
    estimated_completion?: string;
    duration_seconds?: number;
    file_size_bytes?: number;
    operation_type?: 'real-time' | 'subscription' | 'download';
    [key: string]: any;
  };
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface SourcesResponse {
  sources: MediaSource[];
  count: number;
}

export interface ArchiveResult {
  success: boolean;
  plugin_name: string;
  source_id: string;
  recording_id?: string;
  message: string;
}

export type PluginConfig = YouTubePluginConfig | PumpFunPluginConfig | BitTorrentPluginConfig | OpenRingPluginConfig;

export interface OpenRingDevice {
  device_id: string;
  device_name: string;
  enabled: boolean;
  created_at: string;
}

export interface OpenRingPluginConfig {
  segment_duration: number;
  auto_recording_enabled: boolean;
  refresh_buffer_seconds: number;
  devices: OpenRingDevice[];
  auth_status?: 'authenticated' | 'expired' | 'logged_out' | 'two_factor_required';
  expires_at?: string;
  two_factor_pending?: boolean;
}

export interface DiscoverResponse {
  success: boolean;
  discovered: string[];
  message: string;
}

// ========== Unified DePIN Types ==========

export interface DePinActiveOperation {
  operation_id: string;        // Unique ID for this operation
  plugin_name: string;         // 'webrtc-archiver', 'youtube-archiver', etc.
  plugin_display_name: string; // 'WebRTC Recording', 'YouTube Archiver', etc.
  operation_type: 'real-time' | 'subscription' | 'download';
  
  // Source information
  source_id: string;           // mint_id, video_id, torrent_hash, etc.
  source_name: string;         // "Stream XYZ", "TED Talk", "Movie Name"
  source_uri?: string;         // URL to source
  
  // Progress tracking
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;            // 0-100
  start_time: Date;
  estimated_completion?: Date;
  
  // Metrics
  duration_seconds: number;
  file_size_bytes?: number;
  
  // Error handling
  error?: string;
}

export interface DePinDashboardState {
  // Dashboard status
  is_active: boolean;
  points: number;
  level: number;
  streak: number;
  daily_streak: number;
  last_tick: string | null;
  
  // Active operations
  active_operations: DePinActiveOperation[];
  
  // Plugin status
  enabled_plugins: Array<{
    name: string;
    display_name: string;
    status: 'idle' | 'active' | 'paused' | 'error';
    active_operations_count: number;
  }>;
  
  // Overall metrics
  total_archived: number;
  total_uploaded: number;
  pending_uploads: number;
}

export interface DePinTickResponse {
  success: boolean;
  message: string;
  
  // Active operation info
  active_operation?: {
    plugin_name: string;
    source_id: string;
    source_name: string;
    operation_type: string;
    duration: number;
  };
  
  // Actions taken
  actions?: Array<{
    type: 'started' | 'stopped' | 'uploaded' | 'discovered';
    plugin_name: string;
    source_id: string;
    message: string;
  }>;
}

// Plugin configuration types
export interface PluginConfigField {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'url' | 'channel-url';
  label: string;
  description?: string;
  default?: any;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  validation?: RegExp;
  validation_message?: string;
}

export interface PluginConfigSchema {
  plugin_name: string;
  display_name: string;
  description: string;
  version: string;
  config_schema: PluginConfigField[];
  current_config: Record<string, any>;
}

// Plugin-specific configuration interfaces
export interface YouTubePluginConfig {
  channels: Array<{
    name: string;
    channel_url: string;
    enabled: boolean;
    video_format?: 'mp4' | 'webm' | 'mkv';
    video_quality?: 'best' | '1080p' | '720p' | '480p';
    download_subtitles: boolean;
    auto_archive: boolean;
  }>;
}

export interface PumpFunPluginConfig {
  discover_limit?: number;
  livekit_url: string;
  output_format?: 'webm' | 'mp4';
  video_quality?: 'best' | '1080p' | '720p' | '480p';
}

export interface PumpFunStream {
    stream_id: string;  // mint_id
    name: string;
    symbol: string;
    market_cap: number;
    num_participants: number;
    thumbnail: string;
    is_currently_live: boolean;
    uri: string;
}

export interface PumpFunSubscription {
    stream_id: string;
    stream_name: string;
    enabled: boolean;
    priority?: number;
    created_at: string;
    is_currently_recording: boolean;
    recording_status: 'idle' | 'recording' | 'not_live';
}

export interface BitTorrentPluginConfig {
  subscriptions: Array<{
    search_term: string;
    enabled: boolean;
    auto_archive: boolean;
  }>;
  glitter_endpoint: string;
}

// ========== Recurring Job Types ==========

export interface RecurringJob {
  id: number;
  plugin_name: string;
  job_name: string;
  schedule: string;  // cron format: "minute hour day month weekday"
  method: string;  // e.g., "discover_sources"
  on_success: string; // "log_only", "archive_all", "archive_new"
  config: Record<string, any>;
  enabled: boolean;
  is_running: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringJobCreate {
  plugin_name: string;
  job_name: string;
  schedule: string;
  method: string;
  on_success: string;
  config: Record<string, any>;
}

export interface RecurringJobUpdate {
  enabled?: boolean;
  schedule?: string;
  method?: string;
  on_success?: string;
  config?: Record<string, any>;
}

export interface SchedulerStatus {
  running: boolean;
  total_jobs: number;
  jobs: Array<{
    id: string;
    name: string;
    next_run: string | null;
  }>;
}

// ========== Upload Coordinator Types ==========

/**
 * Backend Upload Coordinator configuration.
 * Controls which videos get automatically queued for upload.
 */
export interface UploadCoordinatorConfig {
  enabled: boolean;
  plugin_overrides: Record<string, boolean>;  // plugin_name -> enabled
  priority: number;
}

/**
 * Frontend Upload Worker configuration.
 * Controls how the worker processes the upload queue.
 */
export interface UploadWorkerConfig {
  enabled: boolean;
  pollInterval: number;  // milliseconds
  maxConcurrentUploads: number;
  retryAttempts: number;
}

export interface UploadQueueStatus {
  // FileCoin upload stats
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  retryable: number;

  // Arkiv sync stats
  arkiv_sync_pending: number;
  arkiv_sync_syncing: number;
  arkiv_sync_completed: number;
  arkiv_sync_failed: number;
  arkiv_sync_skipped: number;

  // VLM analysis stats
  vlm_analysis_pending: number;
  vlm_analysis_processing: number;
  vlm_analysis_completed: number;
  vlm_analysis_failed: number;
  vlm_analysis_skipped: number;
}

export interface UploadQueueEntry {
  id: number;
  video_path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  attempts: number;
  max_attempts: number;
  error_message?: string;
  source: 'plugin' | 'manual' | 'depin';
}
