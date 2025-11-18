import { useState, useCallback, useRef, useEffect } from 'react';
import { StreamInfo } from '@/types/video';

export interface StreamRecordingStatus {
  mintId: string;
  isRecording: boolean;
  isFinalizing: boolean;
  error: string | null;
  duration: number;
}

export interface BulkRecordingStatus {
  isRecording: boolean;
  totalStreams: number;
  recordingCount: number;
  failedCount: number;
  streamStatuses: Map<string, StreamRecordingStatus>;
  errors: Map<string, string>;
}

export interface UseBulkRecordingReturn {
  status: BulkRecordingStatus;
  startRecordingAll: (streams: StreamInfo[]) => Promise<void>;
  stopRecordingAll: () => Promise<void>;
  startRecording: (mintId: string) => Promise<void>;
  stopRecording: (mintId: string) => Promise<void>;
  getStreamStatus: (mintId: string) => StreamRecordingStatus | null;
  isLoading: boolean;
}

const API_BASE_URL = 'http://localhost:8000/api';

export const useBulkRecording = (): UseBulkRecordingReturn => {
  const [status, setStatus] = useState<BulkRecordingStatus>({
    isRecording: false,
    totalStreams: 0,
    recordingCount: 0,
    failedCount: 0,
    streamStatuses: new Map(),
    errors: new Map(),
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const statusCheckIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const durationIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const startTimesRef = useRef<Map<string, number>>(new Map());

  // Update duration for a specific stream
  const updateDuration = useCallback((mintId: string): void => {
    const startTime = startTimesRef.current.get(mintId);
    if (!startTime) return;

    const duration = Math.floor((Date.now() - startTime) / 1000);

    setStatus((prev) => {
      const streamStatus = prev.streamStatuses.get(mintId);
      if (!streamStatus || !streamStatus.isRecording) {
        return prev;
      }

      const newStatuses = new Map(prev.streamStatuses);
      newStatuses.set(mintId, {
        ...streamStatus,
        duration,
      });

      return {
        ...prev,
        streamStatuses: newStatuses,
      };
    });
  }, []);

  // Check recording status for a specific stream
  const checkStreamRecordingStatus = useCallback(async (mintId: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/recording/status/${mintId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          // Recording doesn't exist, mark as stopped
          setStatus((prev) => {
            const newStatuses = new Map(prev.streamStatuses);
            const streamStatus = newStatuses.get(mintId);
            
            if (streamStatus?.isRecording) {
              newStatuses.set(mintId, {
                ...streamStatus,
                isRecording: false,
                isFinalizing: false,
                duration: 0,
              });

              // Clear intervals
              const durationInterval = durationIntervalsRef.current.get(mintId);
              if (durationInterval) {
                clearInterval(durationInterval);
                durationIntervalsRef.current.delete(mintId);
              }
              const statusInterval = statusCheckIntervalsRef.current.get(mintId);
              if (statusInterval) {
                clearInterval(statusInterval);
                statusCheckIntervalsRef.current.delete(mintId);
              }
              startTimesRef.current.delete(mintId);

              const recordingCount = Array.from(newStatuses.values()).filter(
                (s) => s.isRecording
              ).length;

              return {
                ...prev,
                streamStatuses: newStatuses,
                recordingCount,
                isRecording: recordingCount > 0,
              };
            }
            return prev;
          });
        }
        return;
      }

      const statusData = await response.json();
      
      if (statusData.success && statusData.state === 'recording') {
        // Update duration from backend start_time
        if (statusData.start_time) {
          const startTime = new Date(statusData.start_time).getTime();
          const duration = Math.floor((Date.now() - startTime) / 1000);

          // Update startTimeRef if needed
          if (!startTimesRef.current.has(mintId) || 
              Math.abs((startTimesRef.current.get(mintId) || 0) - startTime) > 1000) {
            startTimesRef.current.set(mintId, startTime);
          }

          setStatus((prev) => {
            const streamStatus = prev.streamStatuses.get(mintId);
            if (!streamStatus) return prev;

            const newStatuses = new Map(prev.streamStatuses);
            newStatuses.set(mintId, {
              ...streamStatus,
              isRecording: true,
              duration,
            });

            return {
              ...prev,
              streamStatuses: newStatuses,
            };
          });
        }
      } else if (statusData.state !== 'recording') {
        // Recording stopped on backend
        setStatus((prev) => {
          const newStatuses = new Map(prev.streamStatuses);
          const streamStatus = newStatuses.get(mintId);
          
          if (streamStatus?.isRecording) {
            newStatuses.set(mintId, {
              ...streamStatus,
              isRecording: false,
              isFinalizing: false,
              duration: 0,
            });

            // Clear intervals
            const durationInterval = durationIntervalsRef.current.get(mintId);
            if (durationInterval) {
              clearInterval(durationInterval);
              durationIntervalsRef.current.delete(mintId);
            }
            const statusInterval = statusCheckIntervalsRef.current.get(mintId);
            if (statusInterval) {
              clearInterval(statusInterval);
              statusCheckIntervalsRef.current.delete(mintId);
            }
            startTimesRef.current.delete(mintId);

            const recordingCount = Array.from(newStatuses.values()).filter(
              (s) => s.isRecording
            ).length;

            return {
              ...prev,
              streamStatuses: newStatuses,
              recordingCount,
              isRecording: recordingCount > 0,
            };
          }
          return prev;
        });
      }
    } catch (error) {
      console.error(`Failed to check recording status for ${mintId}:`, error);
    }
  }, []);

  // Start recording for a single stream
  const startRecording = useCallback(async (mintId: string): Promise<void> => {
    setIsLoading(true);

    try {
      // Initialize stream status if not exists
      setStatus((prev) => {
        const newStatuses = new Map(prev.streamStatuses);
        if (!newStatuses.has(mintId)) {
          newStatuses.set(mintId, {
            mintId,
            isRecording: false,
            isFinalizing: false,
            error: null,
            duration: 0,
          });
        }
        return {
          ...prev,
          streamStatuses: newStatuses,
        };
      });

      // Clear any existing error
      setStatus((prev) => {
        const newErrors = new Map(prev.errors);
        newErrors.delete(mintId);
        return {
          ...prev,
          errors: newErrors,
        };
      });

      const response = await fetch(`${API_BASE_URL}/recording/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mint_id: mintId,
          output_format: 'webm',
          video_quality: 'high',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || `Failed to start recording: ${response.status}`;
        
        setStatus((prev) => {
          const newStatuses = new Map(prev.streamStatuses);
          const streamStatus = newStatuses.get(mintId);
          const newErrors = new Map(prev.errors);
          newErrors.set(mintId, errorMessage);

          if (streamStatus) {
            newStatuses.set(mintId, {
              ...streamStatus,
              error: errorMessage,
            });
          }

          const failedCount = Array.from(newErrors.values()).filter((e) => e !== null).length;

          return {
            ...prev,
            streamStatuses: newStatuses,
            errors: newErrors,
            failedCount,
          };
        });

        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (!result.success) {
        const errorMessage = result.error || 'Failed to start recording';
        
        setStatus((prev) => {
          const newStatuses = new Map(prev.streamStatuses);
          const streamStatus = newStatuses.get(mintId);
          const newErrors = new Map(prev.errors);
          newErrors.set(mintId, errorMessage);

          if (streamStatus) {
            newStatuses.set(mintId, {
              ...streamStatus,
              error: errorMessage,
            });
          }

          const failedCount = Array.from(newErrors.values()).filter((e) => e !== null).length;

          return {
            ...prev,
            streamStatuses: newStatuses,
            errors: newErrors,
            failedCount,
          };
        });

        throw new Error(errorMessage);
      }

      // Store start time
      if (result.start_time) {
        startTimesRef.current.set(mintId, new Date(result.start_time).getTime());
      } else {
        startTimesRef.current.set(mintId, Date.now());
      }

      // Start duration tracking
      if (durationIntervalsRef.current.has(mintId)) {
        clearInterval(durationIntervalsRef.current.get(mintId)!);
      }
      durationIntervalsRef.current.set(
        mintId,
        setInterval(() => updateDuration(mintId), 1000)
      );

      // Start status checking
      if (statusCheckIntervalsRef.current.has(mintId)) {
        clearInterval(statusCheckIntervalsRef.current.get(mintId)!);
      }
      statusCheckIntervalsRef.current.set(
        mintId,
        setInterval(() => checkStreamRecordingStatus(mintId), 2000)
      );

      // Update status
      setStatus((prev) => {
        const newStatuses = new Map(prev.streamStatuses);
        const streamStatus = newStatuses.get(mintId) || {
          mintId,
          isRecording: false,
          isFinalizing: false,
          error: null,
          duration: 0,
        };

        newStatuses.set(mintId, {
          ...streamStatus,
          isRecording: true,
          isFinalizing: false,
          error: null,
          duration: 0,
        });

        const recordingCount = Array.from(newStatuses.values()).filter(
          (s) => s.isRecording
        ).length;

        return {
          ...prev,
          streamStatuses: newStatuses,
          recordingCount,
          isRecording: recordingCount > 0,
        };
      });

      // Initial duration update
      updateDuration(mintId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start recording';
      
      setStatus((prev) => {
        const newStatuses = new Map(prev.streamStatuses);
        const streamStatus = newStatuses.get(mintId);
        const newErrors = new Map(prev.errors);
        newErrors.set(mintId, errorMessage);

        if (streamStatus) {
          newStatuses.set(mintId, {
            ...streamStatus,
            error: errorMessage,
          });
        }

        const failedCount = Array.from(newErrors.values()).filter((e) => e !== null).length;

        return {
          ...prev,
          streamStatuses: newStatuses,
          errors: newErrors,
          failedCount,
        };
      });

      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [updateDuration, checkStreamRecordingStatus]);

  // Stop recording for a single stream
  const stopRecording = useCallback(async (mintId: string): Promise<void> => {
    setStatus((prev) => {
      const newStatuses = new Map(prev.streamStatuses);
      const streamStatus = newStatuses.get(mintId);
      
      if (streamStatus) {
        newStatuses.set(mintId, {
          ...streamStatus,
          isFinalizing: true,
          isRecording: false,
        });
      }

      return {
        ...prev,
        streamStatuses: newStatuses,
      };
    });

    // Stop status checking immediately
    const statusInterval = statusCheckIntervalsRef.current.get(mintId);
    if (statusInterval) {
      clearInterval(statusInterval);
      statusCheckIntervalsRef.current.delete(mintId);
    }

    // Stop duration tracking
    const durationInterval = durationIntervalsRef.current.get(mintId);
    if (durationInterval) {
      clearInterval(durationInterval);
      durationIntervalsRef.current.delete(mintId);
    }

    try {
      const STOP_TIMEOUT_MS = 300000; // 5 minutes
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), STOP_TIMEOUT_MS);

      try {
        const response = await fetch(`${API_BASE_URL}/recording/stop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mint_id: mintId,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Failed to stop recording: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to stop recording');
        }

        // Cleanup
        startTimesRef.current.delete(mintId);

        setStatus((prev) => {
          const newStatuses = new Map(prev.streamStatuses);
          const streamStatus = newStatuses.get(mintId);
          
          if (streamStatus) {
            newStatuses.set(mintId, {
              ...streamStatus,
              isRecording: false,
              isFinalizing: false,
              duration: 0,
            });
          }

          const recordingCount = Array.from(newStatuses.values()).filter(
            (s) => s.isRecording
          ).length;

          return {
            ...prev,
            streamStatuses: newStatuses,
            recordingCount,
            isRecording: recordingCount > 0,
          };
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error(`Stop recording request timed out after ${STOP_TIMEOUT_MS / 1000} seconds`);
        }
        throw fetchError;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop recording';
      
      setStatus((prev) => {
        const newStatuses = new Map(prev.streamStatuses);
        const streamStatus = newStatuses.get(mintId);
        const newErrors = new Map(prev.errors);
        newErrors.set(mintId, errorMessage);

        if (streamStatus) {
          newStatuses.set(mintId, {
            ...streamStatus,
            error: errorMessage,
            isFinalizing: false,
          });
        }

        return {
          ...prev,
          streamStatuses: newStatuses,
          errors: newErrors,
        };
      });

      throw error;
    }
  }, []);

  // Start recording for all streams
  const startRecordingAll = useCallback(async (streams: StreamInfo[]): Promise<void> => {
    if (streams.length === 0) return;

    setIsLoading(true);

    // Initialize all stream statuses
    setStatus((prev) => {
      const newStatuses = new Map(prev.streamStatuses);
      streams.forEach((stream) => {
        if (!newStatuses.has(stream.mint_id)) {
          newStatuses.set(stream.mint_id, {
            mintId: stream.mint_id,
            isRecording: false,
            isFinalizing: false,
            error: null,
            duration: 0,
          });
        }
      });

      return {
        ...prev,
        totalStreams: streams.length,
        streamStatuses: newStatuses,
        recordingCount: 0,
        failedCount: 0,
        errors: new Map(),
      };
    });

    // Start recording for each stream concurrently
    const recordingPromises = streams.map(async (stream) => {
      try {
        await startRecording(stream.mint_id);
      } catch (error) {
        // Error is already handled in startRecording
        console.error(`Failed to start recording for ${stream.mint_id}:`, error);
      }
    });

    // Wait for all recordings to start (or fail)
    await Promise.allSettled(recordingPromises);

    setIsLoading(false);
  }, [startRecording]);

  // Stop recording for all streams
  const stopRecordingAll = useCallback(async (): Promise<void> => {
    setIsLoading(true);

    // Get all currently recording streams
    const recordingStreams = Array.from(status.streamStatuses.entries())
      .filter(([_, streamStatus]) => streamStatus.isRecording)
      .map(([mintId]) => mintId);

    if (recordingStreams.length === 0) {
      setIsLoading(false);
      return;
    }

    // Stop recording for each stream concurrently
    const stopPromises = recordingStreams.map(async (mintId) => {
      try {
        await stopRecording(mintId);
      } catch (error) {
        // Error is already handled in stopRecording
        console.error(`Failed to stop recording for ${mintId}:`, error);
      }
    });

    // Wait for all recordings to stop (or fail)
    await Promise.allSettled(stopPromises);

    setIsLoading(false);
  }, [status.streamStatuses, stopRecording]);

  // Get status for a specific stream
  const getStreamStatus = useCallback((mintId: string): StreamRecordingStatus | null => {
    return status.streamStatuses.get(mintId) || null;
  }, [status.streamStatuses]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      statusCheckIntervalsRef.current.forEach((interval) => clearInterval(interval));
      durationIntervalsRef.current.forEach((interval) => clearInterval(interval));
      statusCheckIntervalsRef.current.clear();
      durationIntervalsRef.current.clear();
      startTimesRef.current.clear();
    };
  }, []);

  return {
    status,
    startRecordingAll,
    stopRecordingAll,
    startRecording,
    stopRecording,
    getStreamStatus,
    isLoading,
  };
};

