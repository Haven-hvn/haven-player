import { useState, useEffect, useCallback, useRef } from 'react';
import { liveKitClient, LiveKitConnectionConfig, MediaStreamInfo } from '@/services/livekitClient';

export interface RecordingStatus {
  isRecording: boolean;
  isFinalizing: boolean; // True when stopping/encoding the recording
  duration: number;
  progress: number; // 0-100
  error: string | null;
  isConnected: boolean;
  participantId: string | null;
  participantSid: string | null; // LiveKit participant SID from backend
}

export interface UseLiveKitRecordingReturn {
  status: RecordingStatus;
  startRecording: (participantId: string) => Promise<void>;
  stopRecording: () => Promise<void>;
  connectToRoom: (config: LiveKitConnectionConfig) => Promise<void>;
  disconnectFromRoom: () => Promise<void>;
  isLoading: boolean;
}

const API_BASE_URL = 'http://localhost:8000/api';

export const useLiveKitRecording = (mintId: string): UseLiveKitRecordingReturn => {
  const [status, setStatus] = useState<RecordingStatus>({
    isRecording: false,
    isFinalizing: false,
    duration: 0,
    progress: 0,
    error: null,
    isConnected: false,
    participantId: null,
    participantSid: null
  });
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate progress based on duration (assuming 30 seconds max for 100%)
  const calculateProgress = useCallback((duration: number): number => {
    return Math.min(100, (duration / 30) * 100); // 30 seconds = 100%
  }, []);

  // Update duration and progress
  const updateDuration = useCallback(() => {
    if (startTimeRef.current) {
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const progress = calculateProgress(duration);
      
      setStatus(prev => {
        // Only update if we're still recording
        if (prev.isRecording) {
          return {
            ...prev,
            duration,
            progress
          };
        }
        return prev;
      });
    }
  }, [calculateProgress]);

  // Check recording status from backend
  const checkRecordingStatus = useCallback(async (): Promise<void> => {
    try {
      console.log(`🔄 Polling recording status for ${mintId}...`);
      const response = await fetch(`${API_BASE_URL}/recording/status/${mintId}`);
      if (!response.ok) {
        // If recording doesn't exist, stop the recording state
        if (response.status === 404) {
          setStatus(prev => ({
            ...prev,
            isRecording: false,
            isFinalizing: false,
            duration: 0,
            progress: 0
          }));
          if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
          }
          if (statusCheckIntervalRef.current) {
            clearInterval(statusCheckIntervalRef.current);
            statusCheckIntervalRef.current = null;
          }
        }
        return;
      }
      
      const statusData = await response.json();
      console.log(`📊 Recording status for ${mintId}:`, statusData);
      if (statusData.success && statusData.state === 'recording') {
        // Update duration from backend start_time
        if (statusData.start_time) {
          const startTime = new Date(statusData.start_time).getTime();
          const duration = Math.floor((Date.now() - startTime) / 1000);
          const progress = calculateProgress(duration);
          
          // Update startTimeRef if it's not set or different
          if (!startTimeRef.current || Math.abs(startTimeRef.current - startTime) > 1000) {
            startTimeRef.current = startTime;
          }
          
          setStatus(prev => ({
            ...prev,
            isRecording: true,
            duration,
            progress
          }));
        } else if (startTimeRef.current) {
          // Fallback to client-side calculation if backend doesn't provide start_time
          const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
          const progress = calculateProgress(duration);
          setStatus(prev => ({
            ...prev,
            isRecording: true,
            duration,
            progress
          }));
        }
      } else if (statusData.state !== 'recording') {
        console.log(`⏹️ Recording stopped on backend for ${mintId}`);
        // Recording stopped on backend
        setStatus(prev => ({
          ...prev,
          isRecording: false,
          isFinalizing: false,
          duration: 0,
          progress: 0
        }));
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
          statusCheckIntervalRef.current = null;
        }
      }
    } catch (error) {
      console.error(`❌ Failed to check recording status for ${mintId}:`, error);
    }
  }, [mintId, calculateProgress]);

  // Check for active recording when component mounts (e.g., user navigates back)
  useEffect(() => {
    const checkActiveRecording = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/recording/status/${mintId}`);
        if (response.ok) {
          const statusData = await response.json();
          if (statusData.success && statusData.state === 'recording') {
            // Restore recording status
            if (statusData.start_time) {
              const startTime = new Date(statusData.start_time).getTime();
              startTimeRef.current = startTime;
              const duration = Math.floor((Date.now() - startTime) / 1000);
              const progress = calculateProgress(duration);
              
              setStatus(prev => ({
                ...prev,
                isRecording: true,
                isFinalizing: false,
                duration,
                progress
              }));
              
              // Start duration tracking
              if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
              }
              durationIntervalRef.current = setInterval(updateDuration, 1000);
              
              // Start status checking
              if (statusCheckIntervalRef.current) {
                clearInterval(statusCheckIntervalRef.current);
              }
              statusCheckIntervalRef.current = setInterval(checkRecordingStatus, 2000);
              
              console.log(`✅ Restored active recording status for ${mintId}: ${duration}s`);
            }
          }
        }
      } catch (error) {
        // Silently fail - recording might not exist, which is fine
        console.debug(`No active recording found for ${mintId}`);
      }
    };
    
    checkActiveRecording();
  }, [mintId, calculateProgress, updateDuration, checkRecordingStatus]);

  // Connect to LiveKit room
  const connectToRoom = useCallback(async (config: LiveKitConnectionConfig): Promise<void> => {
    setIsLoading(true);
    setStatus(prev => ({ ...prev, error: null }));

    try {
      await liveKitClient.connect(config);
      setStatus(prev => ({ ...prev, isConnected: true }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to LiveKit room';
      setStatus(prev => ({ ...prev, error: errorMessage }));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Disconnect from LiveKit room
  // Note: This only disconnects the frontend viewing connection.
  // Backend recording continues independently.
  const disconnectFromRoom = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    
    try {
      // Don't stop recording when disconnecting - backend recording is independent
      // Only disconnect the frontend viewing connection
      
      await liveKitClient.disconnect();
      setStatus(prev => ({ 
        ...prev, 
        isConnected: false, 
        participantId: null,
        // Don't reset isRecording - backend recording continues
        // duration: 0,
        // progress: 0
      }));
    } catch (error) {
      console.error('Failed to disconnect from LiveKit:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Start recording using backend API
  // Note: participantId parameter is ignored - backend finds the participant itself
  const startRecording = useCallback(async (participantId: string): Promise<void> => {
    setIsLoading(true);
    setStatus(prev => ({ ...prev, error: null }));

    try {
      console.log(`🎬 Starting backend recording for mint_id: ${mintId}`);
      
      // Call backend recording API
      // Backend will use StreamManager to find the participant and start recording
      const response = await fetch(`${API_BASE_URL}/recording/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mint_id: mintId,
          output_format: 'webm',
          video_quality: 'high'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to start recording: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to start recording');
      }

      console.log(`✅ Backend recording started:`, result);
      
      // Store start time from backend response if available, otherwise use current time
      if (result.start_time) {
        startTimeRef.current = new Date(result.start_time).getTime();
      } else {
        startTimeRef.current = Date.now();
      }
      
      // Start duration tracking (updates every second)
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      durationIntervalRef.current = setInterval(updateDuration, 1000);
      
      // Start status checking (every 2 seconds) to sync with backend
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
      statusCheckIntervalRef.current = setInterval(checkRecordingStatus, 2000);
      
      // Initial status update
      const initialDuration = 0;
      setStatus(prev => ({
        ...prev,
        isRecording: true,
        isFinalizing: false,
        participantId: result.participant_sid || participantId, // Use backend's participant SID if available
        duration: initialDuration,
        progress: calculateProgress(initialDuration)
      }));
      
      // Immediately update duration once to show 0s
      updateDuration();

      console.log(`✅ Recording started on backend for mint_id: ${mintId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start recording';
      setStatus(prev => ({ ...prev, error: errorMessage }));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [mintId, updateDuration, checkRecordingStatus]);

  // Stop recording using backend API
  const stopRecording = useCallback(async (): Promise<void> => {
    // Set finalizing state immediately to show accurate UI
    setStatus(prev => ({ 
      ...prev, 
      error: null,
      isFinalizing: true,
      isRecording: false // No longer recording, but finalizing
    }));
    
    // Stop status checking immediately to prevent race conditions
    if (statusCheckIntervalRef.current) {
      clearInterval(statusCheckIntervalRef.current);
      statusCheckIntervalRef.current = null;
      console.log(`⏸️ Stopped status polling for ${mintId}`);
    }
    
    // Stop duration tracking
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    try {
      console.log(`🛑 Stopping backend recording for mint_id: ${mintId}`);
      
      // Call backend recording API to stop with timeout
      // Backend timeout is dynamic (60-300s based on recording duration)
      // Use 120 seconds (2 minutes) as safety limit for 30-second chunks
      console.log(`📡 Sending stop request to backend for ${mintId}...`);
      const STOP_TIMEOUT_MS = 120000; // 2 minutes (sufficient for 30-second chunk encoding)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), STOP_TIMEOUT_MS);
      
      try {
        const response = await fetch(`${API_BASE_URL}/recording/stop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mint_id: mintId
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Failed to stop recording: ${response.status}`);
        }

        const result = await response.json();
        console.log(`📥 Backend stop response for ${mintId}:`, result);
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to stop recording');
        }

        console.log(`✅ Backend recording stopped:`, result);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error(`Stop recording request timed out after ${STOP_TIMEOUT_MS / 1000} seconds`);
        }
        throw fetchError;
      }
      
      // Cleanup
      startTimeRef.current = null;
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      setStatus(prev => ({
        ...prev,
        isRecording: false,
        isFinalizing: false,
        participantId: null,
        duration: 0,
        progress: 0
      }));

      console.log('✅ Recording stopped successfully on backend');
      
      // The backend automatically saves the file, so we don't need to upload
      // The file is already saved to the recordings directory
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop recording';
      setStatus(prev => ({ 
        ...prev, 
        error: errorMessage,
        isFinalizing: false
      }));
      throw error;
    }
  }, [mintId]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
    };
  }, []);


  return {
    status,
    startRecording,
    stopRecording,
    connectToRoom,
    disconnectFromRoom,
    isLoading
  };
};
