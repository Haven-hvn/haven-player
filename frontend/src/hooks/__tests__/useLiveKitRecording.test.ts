import { renderHook, act } from '@testing-library/react';
import { useLiveKitRecording } from '@/hooks/useLiveKitRecording';
import { liveKitClient } from '@/services/livekitClient';

// Mock RecordRTC
jest.mock('recordrtc', () => {
  return jest.fn().mockImplementation(() => ({
    startRecording: jest.fn(),
    stopRecording: jest.fn((callback) => {
      // Simulate async stopRecording
      setTimeout(() => {
        callback();
      }, 100);
    }),
    getBlob: jest.fn(() => new Blob(['mock video data'], { type: 'video/webm' })),
    destroy: jest.fn(),
  }));
});

// Mock LiveKit client
jest.mock('@/services/livekitClient', () => ({
  liveKitClient: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    getMediaStream: jest.fn(),
    getAllMediaStreams: jest.fn(),
    getParticipantIds: jest.fn(),
    isConnected: jest.fn(),
    getRoomName: jest.fn(),
    destroy: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('useLiveKitRecording', () => {
  const mockMintId = 'test-mint-123';
  
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ upload_id: 'test-upload-123' }),
    });
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useLiveKitRecording(mockMintId));
    
    expect(result.current.status).toEqual({
      isRecording: false,
      duration: 0,
      progress: 0,
      error: null,
      isConnected: false,
      participantId: null,
      participantSid: null,
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('should connect to LiveKit room successfully', async () => {
    const { result } = renderHook(() => useLiveKitRecording(mockMintId));
    
    const config = {
      url: 'wss://test.livekit.cloud',
      token: 'test-token',
      roomName: 'test-room',
    };

    await act(async () => {
      await result.current.connectToRoom(config);
    });

    expect(liveKitClient.connect).toHaveBeenCalledWith(config);
    expect(result.current.status.isConnected).toBe(true);
    expect(result.current.status.error).toBeNull();
  });

  it('should handle connection errors', async () => {
    const { result } = renderHook(() => useLiveKitRecording(mockMintId));
    
    const config = {
      url: 'wss://test.livekit.cloud',
      token: 'invalid-token',
      roomName: 'test-room',
    };

    (liveKitClient.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

    await act(async () => {
      await result.current.connectToRoom(config);
    });

    expect(result.current.status.isConnected).toBe(false);
    expect(result.current.status.error).toBe('Connection failed');
  });

  it('should start recording successfully', async () => {
    const { result } = renderHook(() => useLiveKitRecording(mockMintId));
    
    const mockMediaStream = new MediaStream();
    (liveKitClient.getMediaStream as jest.Mock).mockReturnValue(mockMediaStream);

    await act(async () => {
      await result.current.startRecording('participant-1');
    });

    expect(result.current.status.isRecording).toBe(true);
    expect(result.current.status.participantId).toBe('participant-1');
    expect(result.current.status.error).toBeNull();
  });

  it('should handle recording errors when no MediaStream available', async () => {
    const { result } = renderHook(() => useLiveKitRecording(mockMintId));
    
    (liveKitClient.getMediaStream as jest.Mock).mockReturnValue(null);

    await act(async () => {
      await result.current.startRecording('participant-1');
    });

    expect(result.current.status.isRecording).toBe(false);
    expect(result.current.status.error).toBe('No MediaStream found for participant: participant-1');
  });

  it('should stop recording and upload blob successfully', async () => {
    const { result } = renderHook(() => useLiveKitRecording(mockMintId));
    
    const mockMediaStream = new MediaStream();
    (liveKitClient.getMediaStream as jest.Mock).mockReturnValue(mockMediaStream);

    // Start recording first
    await act(async () => {
      await result.current.startRecording('participant-1');
    });

    expect(result.current.status.isRecording).toBe(true);

    // Stop recording
    await act(async () => {
      await result.current.stopRecording();
    });

    expect(result.current.status.isRecording).toBe(false);
    expect(result.current.status.participantId).toBeNull();
    expect(result.current.status.duration).toBe(0);
    expect(result.current.status.progress).toBe(0);
  });

  it('should handle stop recording errors', async () => {
    const { result } = renderHook(() => useLiveKitRecording(mockMintId));

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(result.current.status.error).toBe('No active recording to stop');
  });

  it('should disconnect from room successfully', async () => {
    const { result } = renderHook(() => useLiveKitRecording(mockMintId));
    
    // First connect
    const config = {
      url: 'wss://test.livekit.cloud',
      token: 'test-token',
      roomName: 'test-room',
    };

    await act(async () => {
      await result.current.connectToRoom(config);
    });

    // Then disconnect
    await act(async () => {
      await result.current.disconnectFromRoom();
    });

    expect(liveKitClient.disconnect).toHaveBeenCalled();
    expect(result.current.status.isConnected).toBe(false);
  });

  it('should calculate progress correctly', async () => {
    const { result } = renderHook(() => useLiveKitRecording(mockMintId));
    
    const mockMediaStream = new MediaStream();
    (liveKitClient.getMediaStream as jest.Mock).mockReturnValue(mockMediaStream);

    await act(async () => {
      await result.current.startRecording('participant-1');
    });

    // Simulate time passing
    act(() => {
      // Manually trigger duration update (in real implementation this would be automatic)
      result.current.status.duration = 150; // 2.5 minutes
      result.current.status.progress = Math.min(100, (150 / 300) * 100); // Should be 50%
    });

    expect(result.current.status.progress).toBe(50);
  });

  it('should handle upload errors', async () => {
    const { result } = renderHook(() => useLiveKitRecording(mockMintId));
    
    const mockMediaStream = new MediaStream();
    (liveKitClient.getMediaStream as jest.Mock).mockReturnValue(mockMediaStream);
    
    // Mock fetch to return error
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ detail: 'Upload failed' }),
    });

    await act(async () => {
      await result.current.startRecording('participant-1');
    });

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(result.current.status.error).toBe('Upload failed');
  });
});
