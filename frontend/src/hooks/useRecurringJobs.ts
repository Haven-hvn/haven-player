import { useState, useCallback, useEffect } from 'react';
import { RecurringJob, RecurringJobCreate, SchedulerStatus } from '@/types/plugin';
import { pluginService } from '@/services/api';

export function useRecurringJobs(pluginName?: string, refreshInterval: number = 30000) {
  const [jobs, setJobs] = useState<RecurringJob[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await pluginService.getRecurringJobs(pluginName);
      setJobs(response.jobs);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load jobs';
      setError(errorMessage);
      console.error('Failed to load recurring jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [pluginName]);

  const loadSchedulerStatus = useCallback(async () => {
    try {
      const status = await pluginService.getSchedulerStatus();
      setSchedulerStatus(status);
    } catch (err) {
      console.error('Failed to load scheduler status:', err);
    }
  }, []);

  const createJob = useCallback(async (jobData: RecurringJobCreate) => {
    setError(null);
    try {
      const response = await pluginService.createRecurringJob(jobData);
      setJobs((prev) => [...prev, response.job]);
      return { success: true, job: response.job };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create job';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  const deleteJob = useCallback(async (jobId: number) => {
    setError(null);
    try {
      await pluginService.deleteRecurringJob(jobId);
      setJobs((prev) => prev.filter((job) => job.id !== jobId));
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete job';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  const pauseJob = useCallback(async (jobId: number) => {
    setError(null);
    try {
      await pluginService.pauseRecurringJob(jobId);
      setJobs((prev) => 
        prev.map((job) => 
          job.id === jobId ? { ...job, enabled: false } : job
        )
      );
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to pause job';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  const resumeJob = useCallback(async (jobId: number) => {
    setError(null);
    try {
      await pluginService.resumeRecurringJob(jobId);
      setJobs((prev) => 
        prev.map((job) => 
          job.id === jobId ? { ...job, enabled: true } : job
        )
      );
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resume job';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  const runJobNow = useCallback(async (jobId: number) => {
    setError(null);
    try {
      await pluginService.runJobNow(jobId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to run job';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  // Load jobs on mount and periodically refresh
  useEffect(() => {
    loadJobs();
    loadSchedulerStatus();

    const interval = setInterval(() => {
      loadJobs();
      loadSchedulerStatus();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [loadJobs, loadSchedulerStatus, refreshInterval]);

  return {
    jobs,
    schedulerStatus,
    loading,
    error,
    loadJobs,
    loadSchedulerStatus,
    createJob,
    deleteJob,
    pauseJob,
    resumeJob,
    runJobNow,
  };
}
