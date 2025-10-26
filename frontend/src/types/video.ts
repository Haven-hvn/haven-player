export interface Video {
  id: number;
  path: string;
  title: string;
  duration: number;
  has_ai_data: boolean;
  thumbnail_path: string | null;
  position: number;
  created_at: string;
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