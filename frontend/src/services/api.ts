import axios from 'axios';
import { Video, Timestamp, VideoCreate, TimestampCreate } from '@/types/video';

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
  const response = await api.post<JobCreateResponse>(`/jobs/videos/${encodeURIComponent(videoPath)}/analyze`);
  return response.data;
};

export const getJobProgress = async (jobId: number): Promise<JobProgress> => {
  const response = await api.get<JobProgress>(`/jobs/${jobId}`);
  return response.data;
};

export const getVideoJobs = async (videoPath: string): Promise<JobProgress[]> => {
  const response = await api.get<JobProgress[]>(`/jobs/videos/${encodeURIComponent(videoPath)}/jobs`);
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
