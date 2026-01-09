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

export type PluginConfig = YouTubePluginConfig | WebRTCPluginConfig | BitTorrentPluginConfig;

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
  poll_interval_minutes: number;
  max_concurrent_downloads: number;
}

export interface WebRTCPluginConfig {
  discover_limit?: number;
  livekit_url: string;
  output_format?: 'webm' | 'mp4';
  video_quality?: 'best' | '1080p' | '720p' | '480p';
}

export interface BitTorrentPluginConfig {
  subscriptions: Array<{
    search_term: string;
    enabled: boolean;
    auto_archive: boolean;
  }>;
  max_concurrent_downloads: number;
  glitter_endpoint: string;
}
