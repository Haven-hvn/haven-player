import axios from 'axios';
import { Video, Timestamp, VideoCreate, TimestampCreate, StreamInfo, RecordingStatus, StartRecordingRequest, StopRecordingRequest, StartSessionRequest, StopSessionRequest } from '@/types/video';

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

// Recording-related API functions
export const recordingService = {
  startSession: async (mintId: string): Promise<{ success: boolean; session_id?: string; error?: string }> => {
    const response = await api.post('/live-sessions/start', { mint_id: mintId } as StartSessionRequest);
    return response.data;
  },

  stopSession: async (mintId: string): Promise<{ success: boolean; error?: string }> => {
    const response = await api.post('/live-sessions/stop', { mint_id: mintId } as StopSessionRequest);
    return response.data;
  },

  startRecording: async (request: StartRecordingRequest): Promise<{ success: boolean; recording_id?: string; error?: string }> => {
    const response = await api.post('/recording/start', request);
    return response.data;
  },

  stopRecording: async (request: StopRecordingRequest): Promise<{ success: boolean; error?: string }> => {
    const response = await api.post('/recording/stop', request);
    return response.data;
  },

  getRecordingStatus: async (mintId: string): Promise<RecordingStatus> => {
    const response = await api.get<RecordingStatus>(`/recording/status/${mintId}`);
    return response.data;
  },

  getActiveRecordings: async (): Promise<{ success: boolean; recordings: RecordingStatus[] }> => {
    const response = await api.get('/recording/active');
    return response.data;
  },

  getSupportedFormats: async (): Promise<{
    success: boolean;
    formats: Record<string, { description: string; codec: string; container: string }>;
    quality_presets: Record<string, { video_bitrate: string; audio_bitrate: string }>;
  }> => {
    const response = await api.get('/recording/formats');
    return response.data;
  },
};
