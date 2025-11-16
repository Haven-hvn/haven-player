import { useState, useEffect, useCallback, useRef } from 'react';
import { liveKitClient, LiveKitConnectionConfig, MediaStreamInfo } from '@/services/livekitClient';

export interface RecordingStatus {
  isRecording: boolean;
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

  // Calculate progress based on duration (assuming 5 minutes max for 100%)
  const calculateProgress = useCallback((duration: number): number => {
    return Math.min(100, (duration / 300) * 100); // 5 minutes = 300 seconds
  }, []);

  // Update duration and progress
  const updateDuration = useCallback(() => {
    if (startTimeRef.current && status.isRecording) {
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const progress = calculateProgress(duration);
      
      setStatus(prev => ({
        ...prev,
        duration,
        progress
      }));
    }
  }, [status.isRecording, calculateProgress]);

  // Check recording status from backend
  const checkRecordingStatus = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/recording/status/${mintId}`);
      if (!response.ok) {
        throw new Error(`Failed to get recording status: ${response.status}`);
      }
      
      const status = await response.json();
      if (status.success && status.state === 'recording') {
        // Update duration if available
        if (status.start_time) {
          const startTime = new Date(status.start_time).getTime();
          const duration = Math.floor((Date.now() - startTime) / 1000);
          const progress = calculateProgress(duration);
          setStatus(prev => ({
            ...prev,
            duration,
            progress
          }));
        }
      }
    } catch (error) {
      console.error('Failed to check recording status:', error);
    }
  }, [mintId, calculateProgress]);

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
      
      // Store start time
      startTimeRef.current = Date.now();
      
      // Start duration tracking
      durationIntervalRef.current = setInterval(updateDuration, 1000);
      
      // Start status checking (every 2 seconds)
      statusCheckIntervalRef.current = setInterval(checkRecordingStatus, 2000);
      
      setStatus(prev => ({
        ...prev,
        isRecording: true,
        participantId: result.participant_sid || participantId, // Use backend's participant SID if available
        duration: 0,
        progress: 0
      }));

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
    setIsLoading(true);
    setStatus(prev => ({ ...prev, error: null }));

    try {
      console.log(`🛑 Stopping backend recording for mint_id: ${mintId}`);
      
      // Stop status checking
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
        statusCheckIntervalRef.current = null;
      }
      
      // Call backend recording API to stop
      const response = await fetch(`${API_BASE_URL}/recording/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mint_id: mintId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to stop recording: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to stop recording');
      }

      console.log(`✅ Backend recording stopped:`, result);
      
      // Cleanup
      startTimeRef.current = null;
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      setStatus(prev => ({
        ...prev,
        isRecording: false,
        participantId: null,
        duration: 0,
        progress: 0
      }));

      console.log('✅ Recording stopped successfully on backend');
      
      // The backend automatically saves the file, so we don't need to upload
      // The file is already saved to the recordings directory
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop recording';
      setStatus(prev => ({ ...prev, error: errorMessage }));
      throw error;
    } finally {
      setIsLoading(false);
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
