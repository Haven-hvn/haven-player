import { useState, useEffect, useCallback, useRef } from 'react';
import { RecordingStatus, StartRecordingRequest, StopRecordingRequest, StartSessionRequest, StopSessionRequest } from '@/types/video';

interface UseRecordingReturn {
  isRecording: boolean;
  duration: number;
  progress: number; // 0-100
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  isLoading: boolean;
}

const API_BASE_URL = 'http://localhost:8000/api';

export const useRecording = (mintId: string): UseRecordingReturn => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate progress based on duration (assuming 30s max for 100%)
  const progress = Math.min(100, (duration / 30) * 100);

  const pollRecordingStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/recording/status/${mintId}`);
      if (!response.ok) {
        throw new Error(`Failed to get recording status: ${response.status}`);
      }
      
      const status: RecordingStatus = await response.json();
      setIsRecording(status.is_recording);
      setDuration(status.duration_seconds);
      
      // Stop polling if not recording
      if (!status.is_recording) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (err) {
      console.error('Error polling recording status:', err);
      setError(err instanceof Error ? err.message : 'Failed to get recording status');
    }
  }, [mintId]);

  const startRecording = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Step 1: Start live session
      const sessionResponse = await fetch(`${API_BASE_URL}/live-sessions/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mint_id: mintId } as StartSessionRequest),
      });

      if (!sessionResponse.ok) {
        throw new Error(`Failed to start session: ${sessionResponse.status}`);
      }

      // Step 2: Start recording
      const recordingRequest: StartRecordingRequest = {
        mint_id: mintId,
        output_format: 'av1',
        video_quality: 'medium',
      };

      const recordingResponse = await fetch(`${API_BASE_URL}/recording/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(recordingRequest),
      });

      if (!recordingResponse.ok) {
        throw new Error(`Failed to start recording: ${recordingResponse.status}`);
      }

      setIsRecording(true);
      setDuration(0);
      
      // Start polling for status updates
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      pollingIntervalRef.current = setInterval(pollRecordingStatus, 1000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      setIsRecording(false);
    } finally {
      setIsLoading(false);
    }
  }, [mintId, pollRecordingStatus]);

  const stopRecording = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Step 1: Stop recording
      const recordingResponse = await fetch(`${API_BASE_URL}/recording/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mint_id: mintId } as StopRecordingRequest),
      });

      if (!recordingResponse.ok) {
        throw new Error(`Failed to stop recording: ${recordingResponse.status}`);
      }

      // Step 2: Stop live session
      const sessionResponse = await fetch(`${API_BASE_URL}/live-sessions/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mint_id: mintId } as StopSessionRequest),
      });

      if (!sessionResponse.ok) {
        throw new Error(`Failed to stop session: ${sessionResponse.status}`);
      }

      setIsRecording(false);
      setDuration(0);
      
      // Stop polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
    } finally {
      setIsLoading(false);
    }
  }, [mintId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return {
    isRecording,
    duration,
    progress,
    error,
    startRecording,
    stopRecording,
    isLoading,
  };
};
