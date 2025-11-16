import { useState, useEffect, useCallback, useRef } from 'react';
import RecordRTC from 'recordrtc';
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
  const recorderRef = useRef<RecordRTC | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

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

  // Upload recorded blob to backend
  const uploadRecordingBlob = useCallback(async (blob: Blob, participantId: string): Promise<void> => {
    try {
      const formData = new FormData();
      const filename = `livekit_recording_${mintId}_${participantId}_${Date.now()}.webm`;
      
      formData.append('video_file', blob, filename);
      formData.append('participant_id', participantId);
      formData.append('mint_id', mintId);
      formData.append('source', 'livekit');
      formData.append('mime_type', 'video/webm;codecs=vp9');

      const response = await fetch(`${API_BASE_URL}/videos/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('Recording uploaded successfully:', result);
    } catch (error) {
      console.error('Failed to upload recording:', error);
      throw error;
    }
  }, [mintId]);

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
  const disconnectFromRoom = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    
    try {
      // Stop recording if active
      if (status.isRecording) {
        await stopRecording();
      }
      
      await liveKitClient.disconnect();
      setStatus(prev => ({ 
        ...prev, 
        isConnected: false, 
        participantId: null,
        isRecording: false,
        duration: 0,
        progress: 0
      }));
    } catch (error) {
      console.error('Failed to disconnect from LiveKit:', error);
    } finally {
      setIsLoading(false);
    }
  }, [status.isRecording]);

  // Start recording a specific participant's stream
  const startRecording = useCallback(async (participantId: string): Promise<void> => {
    setIsLoading(true);
    setStatus(prev => ({ ...prev, error: null }));

    try {
      // Get MediaStream from LiveKit client - wait for it if not immediately available
      let mediaStream = liveKitClient.getMediaStream(participantId);
      
      // If not available, wait up to 5 seconds for tracks to subscribe
      if (!mediaStream) {
        console.log(`MediaStream not immediately available for ${participantId}, waiting for tracks to subscribe...`);
        mediaStream = await liveKitClient.waitForMediaStream(participantId, 5000);
      }
      
      // Fallback: If the backend-provided SID doesn't work, try to find the streamer participant
      if (!mediaStream) {
        console.warn(`MediaStream not found for backend-provided SID: ${participantId}, trying to find streamer participant...`);
        const streamerSid = liveKitClient.findStreamerParticipantSid();
        if (streamerSid && streamerSid !== participantId) {
          console.log(`Found different streamer SID: ${streamerSid}, using that instead`);
          mediaStream = liveKitClient.getMediaStream(streamerSid);
          if (mediaStream) {
            // Update participantId to the actual streamer SID
            participantId = streamerSid;
          }
        }
      }
      
      if (!mediaStream) {
        const availableSids = liveKitClient.getParticipantIds();
        throw new Error(
          `No MediaStream found for participant SID: ${participantId}. ` +
          `Available participant SIDs: ${availableSids.length > 0 ? availableSids.join(', ') : 'none'}. ` +
          `Make sure the participant has published video/audio tracks.`
        );
      }
      
      // Verify the stream has tracks
      const allTracks = mediaStream.getTracks();
      if (allTracks.length === 0) {
        throw new Error(`MediaStream for participant ${participantId} has no tracks`);
      }
      
      // Verify tracks are active
      const activeTracks = allTracks.filter(t => t.readyState === 'live');
      const videoTracks = allTracks.filter(t => t.kind === 'video');
      const audioTracks = allTracks.filter(t => t.kind === 'audio');
      
      console.log(`✅ MediaStream details for participant ${participantId}:`);
      console.log(`   Total tracks: ${allTracks.length}`);
      console.log(`   Active tracks: ${activeTracks.length}`);
      console.log(`   Video tracks: ${videoTracks.length}`);
      console.log(`   Audio tracks: ${audioTracks.length}`);
      
      if (activeTracks.length === 0) {
        throw new Error(`No active tracks found for participant ${participantId}. All ${allTracks.length} tracks are in state: ${allTracks.map(t => t.readyState).join(', ')}`);
      }
      
      if (videoTracks.length === 0 && audioTracks.length === 0) {
        throw new Error(`No video or audio tracks found for participant ${participantId}`);
      }
      
      console.log(`✅ Starting recording for participant ${participantId} with ${activeTracks.length} active tracks`);

      // Create RecordRTC instance
      const recorder = new RecordRTC(mediaStream, {
        type: 'video',
        mimeType: 'video/webm;codecs=vp9',
        disableLogs: false,
        timeSlice: 1000, // Record in 1-second chunks
        ondataavailable: (blob: Blob) => {
          // Optional: Handle data chunks as they become available
          console.log('Recording chunk available:', blob.size, 'bytes');
        }
      });

      // Start recording
      recorder.startRecording();
      
      // Store references
      recorderRef.current = recorder;
      startTimeRef.current = Date.now();
      
      // Start duration tracking
      durationIntervalRef.current = setInterval(updateDuration, 1000);
      
      setStatus(prev => ({
        ...prev,
        isRecording: true,
        participantId,
        duration: 0,
        progress: 0
      }));

      console.log(`Started recording participant: ${participantId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start recording';
      setStatus(prev => ({ ...prev, error: errorMessage }));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [updateDuration]);

  // Stop recording
  const stopRecording = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setStatus(prev => ({ ...prev, error: null }));

    try {
      if (!recorderRef.current) {
        throw new Error('No active recording to stop');
      }

      // Stop recording and get blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        recorderRef.current!.stopRecording(() => {
          const blob = recorderRef.current!.getBlob();
          resolve(blob);
        });
      });

      // Upload blob to backend
      if (status.participantId) {
        await uploadRecordingBlob(blob, status.participantId);
      }

      // Cleanup
      recorderRef.current.destroy();
      recorderRef.current = null;
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

      console.log('Recording stopped and uploaded successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop recording';
      setStatus(prev => ({ ...prev, error: errorMessage }));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [status.participantId, uploadRecordingBlob]);

  // Listen for LiveKit stream events
  useEffect(() => {
    const handleStreamAvailable = (event: CustomEvent<MediaStreamInfo>) => {
      const { participantId, stream } = event.detail;
      console.log(`Stream available for recording: ${participantId}`, stream);
    };

    const handleStreamRemoved = (event: CustomEvent<{ participantId: string }>) => {
      const { participantId } = event.detail;
      console.log(`Stream removed: ${participantId}`);
      
      // If we're recording this participant, stop recording
      if (status.participantId === participantId && status.isRecording) {
        stopRecording();
      }
    };

    window.addEventListener('livekit-stream-available', handleStreamAvailable as EventListener);
    window.addEventListener('livekit-stream-removed', handleStreamRemoved as EventListener);

    return () => {
      window.removeEventListener('livekit-stream-available', handleStreamAvailable as EventListener);
      window.removeEventListener('livekit-stream-removed', handleStreamRemoved as EventListener);
    };
  }, [status.participantId, status.isRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (recorderRef.current) {
        recorderRef.current.destroy();
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
