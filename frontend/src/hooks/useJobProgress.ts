import { useState, useEffect } from 'react';
import { getJobProgress } from '../services/api';

interface JobProgress {
  id: number;
  video_path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

export const useJobProgress = (jobId?: number) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<JobProgress['status']>('pending');
  const [error, setError] = useState<string | undefined>();
  
  useEffect(() => {
    if (!jobId) return;
    
    const fetchProgress = async () => {
      try {
        const data = await getJobProgress(jobId);
        setProgress(data.progress);
        setStatus(data.status);
        setError(data.error);
        
        // Stop polling if job is completed or failed
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(intervalId);
        }
      } catch (error) {
        console.error('Error fetching job progress:', error);
        // Don't clear interval on error, keep trying
      }
    };
    
    // Initial fetch
    fetchProgress();
    
    // Set up polling interval
    const intervalId = setInterval(fetchProgress, 1000);
    
    // Cleanup
    return () => clearInterval(intervalId);
  }, [jobId]);
  
  return { progress, status, error };
};
