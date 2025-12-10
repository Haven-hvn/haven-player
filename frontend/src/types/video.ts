export interface Video {
  id: number;
  path: string;
  title: string;
  duration: number;
  has_ai_data: boolean;
  thumbnail_path: string | null;
  position: number;
  created_at: string;
  updated_at?: string | null;
  file_size?: number | null;
  file_extension?: string | null;
  mime_type?: string | null;
  codec?: string | null;
  creator_handle?: string | null;
  source_uri?: string | null;
  analysis_model?: string | null;
  share_to_arkiv: boolean;
  arkiv_entity_key?: string | null;
  mint_id?: string | null;
  filecoin_root_cid?: string | null;
  filecoin_piece_cid?: string | null;
  filecoin_piece_id?: number | null;
  filecoin_data_set_id?: string | null;
  filecoin_uploaded_at?: string | null;
  cid_hash?: string | null; // SHA256 hash of filecoin_root_cid for Arkiv dedupe
  // Lit Protocol encryption metadata
  is_encrypted?: boolean;
  lit_encryption_metadata?: string | null; // JSON-serialized LitEncryptionMetadata
}

export interface Timestamp {
  id: number;
  video_path: string;
  tag_name: string;
  start_time: number;
  end_time: number | null;
  confidence: number;
}

export interface VideoCreate {
  path: string;
  title: string;
  duration: number;
  has_ai_data: boolean;
  thumbnail_path: string | null;
  share_to_arkiv?: boolean;
  creator_handle?: string | null;
  source_uri?: string | null;
}

export interface TimestampCreate {
  tag_name: string;
  start_time: number;
  end_time: number | null;
  confidence: number;
}

// Stream-related types matching backend StreamInfo model
export interface StreamInfo {
  mint_id: string;
  name: string;
  symbol: string;
  description?: string;
  image_uri?: string;
  thumbnail?: string;
  creator?: string;
  market_cap?: number;
  usd_market_cap?: number;
  num_participants: number;
  is_currently_live: boolean;
  created_timestamp?: number;
  last_trade_timestamp?: number;
  nsfw: boolean;
  website?: string;
  twitter?: string;
  telegram?: string;
}

// Grouped videos types
export interface TokenGroupInfo {
  mint_id: string;
  name?: string | null;
  symbol?: string | null;
  image_uri?: string | null;
  thumbnail?: string | null;
}

export interface VideoGroup {
  token_info: TokenGroupInfo | null; // null for "Other Videos" group
  videos: Video[];
  recording_count: number;
  latest_recording_date?: string | null;
} 