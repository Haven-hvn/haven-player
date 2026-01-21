/**
 * Transformation Pipeline Types
 * 
 * These types model the transformation stages that content goes through
 * in Haven's archival workflow: Discovery → Capture → Preservation → Verification
 */

// Transformation states following the pipeline
export type TransformationState = 
  | 'discovering'    // Source being discovered/monitored
  | 'recording'      // Actively being captured
  | 'pending'        // Waiting for upload
  | 'uploading'      // Being uploaded to Filecoin
  | 'preserved'      // Successfully on Filecoin (has CID)
  | 'syncing'        // Being synced to Arkiv
  | 'synced'         // Verified on blockchain
  | 'failed'         // Error state, needs attention
  | 'encrypted';     // Encrypted content indicator (can combine with other states)

// Source types matching the plugin system
export type SourceType = 
  | 'pumpfun'
  | 'youtube'
  | 'bittorrent'
  | 'openring'
  | 'manual';

// Content item with transformation state
export interface TransformationItem {
  id: string;
  videoId?: number;
  title: string;
  sourceType: SourceType;
  sourceIdentity: string; // mint_id, channel_id, infohash, device_id, etc.
  state: TransformationState;
  
  // Progress tracking
  progress?: number;
  duration?: number;
  
  // Timestamps
  discoveredAt?: string;
  recordingStartedAt?: string;
  uploadedAt?: string;
  syncedAt?: string;
  
  // Preservation data
  filecoinCid?: string;
  arkivEntityKey?: string;
  
  // Encryption
  isEncrypted?: boolean;
  
  // Error info
  errorMessage?: string;
  
  // Metadata
  thumbnail?: string;
  tokenInfo?: {
    mintId: string;
    name?: string;
    symbol?: string;
    imageUri?: string;
  };
}

// Source with health status
export interface Source {
  id: string;
  type: SourceType;
  name: string;
  icon?: string;
  enabled: boolean;
  healthy: boolean;
  itemCount: number;
  activeCount: number; // Currently recording
  errorCount: number;
  lastActivity?: string;
}

// System health status
export interface SystemHealth {
  backendConnected: boolean;
  walletConnected: boolean;
  walletAddress?: string;
  walletBalance?: string;
  encryptionEnabled: boolean;
  points?: number;
  streak?: number;
  lastSync?: string;
}

// Queue statistics
export interface QueueStats {
  pending: number;
  uploading: number;
  completed: number;
  failed: number;
  syncPending: number;
  syncCompleted: number;
}

// Recording session
export interface RecordingSession {
  id: string;
  sourceType: SourceType;
  sourceIdentity: string;
  title: string;
  startedAt: string;
  duration: number; // In seconds, continuously updating
  status: 'active' | 'paused' | 'stopping';
}

// State filter options
export interface StateFilter {
  id: TransformationState | 'all';
  label: string;
  color: string;
  count: number;
}

// Source filter options
export interface SourceFilter {
  id: SourceType | 'all';
  label: string;
  icon: string;
  count: number;
}

// Time filter options
export type TimeFilter = 'today' | 'week' | 'month' | 'all';
