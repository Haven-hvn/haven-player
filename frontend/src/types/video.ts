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