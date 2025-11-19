export interface Video {
  id: number;
  path: string;
  title: string;
  duration: number;
  has_ai_data: boolean;
  thumbnail_path: string | null;
  position: number;
  created_at: string;
  mint_id?: string | null;
  filecoin_root_cid?: string | null;
  filecoin_piece_cid?: string | null;
  filecoin_piece_id?: number | null;
  filecoin_data_set_id?: string | null;
  filecoin_uploaded_at?: string | null;
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