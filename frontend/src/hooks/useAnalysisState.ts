/**
 * useAnalysisState - Focused hook for video analysis state management
 * 
 * Extracted from App.tsx to reduce monolithic state and prevent cascading re-renders.
 * Manages analysis job statuses, progress tracking, and batch analysis operations.
 */

import { useState, useCallback } from 'react';
import { Video } from '@/types/video';
import { startAnalysisJob, getVideoJobs } from '@/services/api';

export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'error' | 'downloading';

interface UseAnalysisStateOptions {
  onAnalysisComplete?: (videoPath: string) => Promise<void>;
  onRefreshVideos?: () => Promise<void>;
}

interface UseAnalysisStateReturn {
  analysisStatuses: Record<string, AnalysisStatus>;
  activeJobs: Record<string, number>;
  jobProgresses: Record<string, number>;
  isAnalyzingAll: boolean;
  setAnalysisStatus: (videoPath: string, status: AnalysisStatus) => void;
  setJobProgress: (videoPath: string, progress: number) => void;
  initializeStatuses: (videos: Video[]) => void;
  startAnalysis: (video: Video, fetchTimestamps: (video: Video) => Promise<void>) => Promise<void>;
  analyzeAll: (videos: Video[], fetchTimestamps: (video: Video) => Promise<void>) => Promise<void>;
  clearAnalysisStatus: (videoPath: string) => void;
}

export const useAnalysisState = (options: UseAnalysisStateOptions = {}): UseAnalysisStateReturn => {
  const { onAnalysisComplete, onRefreshVideos } = options;

  const [analysisStatuses, setAnalysisStatuses] = useState<Record<string, AnalysisStatus>>({});
  const [activeJobs, setActiveJobs] = useState<Record<string, number>>({});
  const [jobProgresses, setJobProgresses] = useState<Record<string, number>>({});
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);

  const setAnalysisStatus = useCallback((videoPath: string, status: AnalysisStatus) => {
    setAnalysisStatuses((prev: Record<string, AnalysisStatus>) => ({ ...prev, [videoPath]: status }));
  }, []);

  const setJobProgress = useCallback((videoPath: string, progress: number) => {
    setJobProgresses((prev: Record<string, number>) => ({ ...prev, [videoPath]: progress }));
  }, []);

  const clearAnalysisStatus = useCallback((videoPath: string) => {
    setAnalysisStatuses((prev: Record<string, AnalysisStatus>) => {
      const updated = { ...prev };
      delete updated[videoPath];
      return updated;
    });
    setActiveJobs((prev: Record<string, number>) => {
      const updated = { ...prev };
      delete updated[videoPath];
      return updated;
    });
    setJobProgresses((prev: Record<string, number>) => {
      const updated = { ...prev };
      delete updated[videoPath];
      return updated;
    });
  }, []);

  const initializeStatuses = useCallback((videos: Video[]) => {
    const newStatuses: Record<string, AnalysisStatus> = {};
    videos.forEach(video => {
      if (!(video.path in analysisStatuses)) {
        newStatuses[video.path] = video.has_ai_data ? 'completed' : 'pending';
      }
    });

    if (Object.keys(newStatuses).length > 0) {
      setAnalysisStatuses((prev: Record<string, AnalysisStatus>) => ({ ...prev, ...newStatuses }));
    }
  }, [analysisStatuses]);

  const startAnalysis = useCallback(async (
    video: Video,
    fetchTimestamps: (video: Video) => Promise<void>
  ) => {
    if (video.has_ai_data) {
      // Video already has AI data, just refresh timestamps
      await fetchTimestamps(video);
      setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'completed' }));
      return;
    }

    try {
      // Start analysis job
      const response = await startAnalysisJob(video.path);
      const jobId = response.job_id;

      // Track the job
      setActiveJobs((prev: Record<string, number>) => ({ ...prev, [video.path]: jobId }));
      setAnalysisStatuses((prev: Record<string, AnalysisStatus>) => ({ ...prev, [video.path]: 'analyzing' }));
      setJobProgresses((prev: Record<string, number>) => ({ ...prev, [video.path]: 0 }));

      // Start polling for job progress
      const pollInterval = setInterval(async () => {
        try {
          const jobs = await getVideoJobs(video.path);
          const currentJob = jobs.find(job => job.id === jobId);

          if (currentJob) {
            setJobProgresses((prev: Record<string, number>) => ({
              ...prev,
              [video.path]: currentJob.progress,
            }));

            if (currentJob.status === 'completed') {
              setAnalysisStatuses((prev: Record<string, AnalysisStatus>) => ({
                ...prev,
                [video.path]: 'completed',
              }));
              setActiveJobs((prev: Record<string, number>) => {
                const updated = { ...prev };
                delete updated[video.path];
                return updated;
              });
              // Refresh video data to get new timestamps
              await fetchTimestamps(video);
              if (onRefreshVideos) {
                await onRefreshVideos();
              }
              clearInterval(pollInterval);
            } else if (currentJob.status === 'failed') {
              setAnalysisStatuses((prev: Record<string, AnalysisStatus>) => ({
                ...prev,
                [video.path]: 'error',
              }));
              setActiveJobs((prev: Record<string, number>) => {
                const updated = { ...prev };
                delete updated[video.path];
                return updated;
              });
              clearInterval(pollInterval);
            }
          }
        } catch (error) {
          console.error('Error polling job status:', error);
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to start analysis:', error);
      setAnalysisStatuses((prev: Record<string, AnalysisStatus>) => ({ ...prev, [video.path]: 'error' }));
    }
  }, [onRefreshVideos]);

  const analyzeAll = useCallback(async (
    videos: Video[],
    fetchTimestamps: (video: Video) => Promise<void>
  ) => {
    setIsAnalyzingAll(true);

    const videosToAnalyze = videos.filter(
      video =>
        !analysisStatuses[video.path] ||
        analysisStatuses[video.path] === 'pending' ||
        analysisStatuses[video.path] === 'error'
    );

    for (const video of videosToAnalyze) {
      await startAnalysis(video, fetchTimestamps);
    }

    setIsAnalyzingAll(false);
  }, [analysisStatuses, startAnalysis]);

  return {
    analysisStatuses,
    activeJobs,
    jobProgresses,
    isAnalyzingAll,
    setAnalysisStatus,
    setJobProgress,
    initializeStatuses,
    startAnalysis,
    analyzeAll,
    clearAnalysisStatus,
  };
};

export default useAnalysisState;
