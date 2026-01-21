import { useState, useEffect, useRef } from 'react';
import { getJobProgress } from '../services/api';
import { useBackgroundThrottling } from './useBackgroundThrottling';

interface JobProgress {
  id: number;
  video_path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

// Polling intervals
const ACTIVE_POLL_INTERVAL = 1000; // 1 second when active
const BACKGROUND_POLL_INTERVAL: number | null = null; // Pause when in background

export const useJobProgress = (jobId?: number) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<JobProgress['status']>('pending');
  const [error, setError] = useState<string | undefined>();
  
  // Background throttling
  const { shouldThrottle } = useBackgroundThrottling();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCompletedRef = useRef(false);
  
  useEffect(() => {
    if (!jobId) return;
    
    // Reset completed flag when jobId changes
    isCompletedRef.current = false;
    
    const fetchProgress = async () => {
      try {
        const data = await getJobProgress(jobId);
        setProgress(data.progress);
        setStatus(data.status);
        setError(data.error);
        
        // Mark as completed if job is done
        if (data.status === 'completed' || data.status === 'failed') {
          isCompletedRef.current = true;
          // Clear interval when job is done
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (error) {
        console.error('Error fetching job progress:', error);
        // Don't clear interval on error, keep trying
      }
    };
    
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Don't poll if job is already completed
    if (isCompletedRef.current) {
      return;
    }
    
    // Determine interval based on throttle state
    const interval = shouldThrottle ? BACKGROUND_POLL_INTERVAL : ACTIVE_POLL_INTERVAL;
    
    // If interval is null (background), don't poll but do initial fetch
    if (interval === null) {
      console.log('🔇 Job progress polling paused (app in background)');
      // Still do initial fetch
      fetchProgress();
      return;
    }
    
    // Initial fetch
    fetchProgress();
    
    // Set up polling interval
    console.log(`🔄 Job progress polling active (interval: ${interval}ms)`);
    intervalRef.current = setInterval(fetchProgress, interval);
    
    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId, shouldThrottle]);
  
  return { progress, status, error };
};
