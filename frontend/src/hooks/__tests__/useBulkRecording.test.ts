import { renderHook, act, waitFor } from '@testing-library/react';
import { useBulkRecording } from '@/hooks/useBulkRecording';
import { StreamInfo } from '@/types/video';

// Mock fetch
global.fetch = jest.fn();

// Mock timers
jest.useFakeTimers();

describe('useBulkRecording', () => {
  const mockStream1: StreamInfo = {
    mint_id: 'mint-1',
    name: 'Stream 1',
    symbol: 'STR1',
    num_participants: 10,
    is_currently_live: true,
    nsfw: false,
  };

  const mockStream2: StreamInfo = {
    mint_id: 'mint-2',
    name: 'Stream 2',
    symbol: 'STR2',
    num_participants: 20,
    is_currently_live: true,
    nsfw: false,
  };

  const mockStream3: StreamInfo = {
    mint_id: 'mint-3',
    name: 'Stream 3',
    symbol: 'STR3',
    num_participants: 30,
    is_currently_live: true,
    nsfw: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.useFakeTimers();
  });

  describe('Initialization', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useBulkRecording());

      expect(result.current.status.isRecording).toBe(false);
      expect(result.current.status.totalStreams).toBe(0);
      expect(result.current.status.recordingCount).toBe(0);
      expect(result.current.status.failedCount).toBe(0);
      expect(result.current.status.streamStatuses.size).toBe(0);
      expect(result.current.status.errors.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return null for getStreamStatus when stream not found', () => {
      const { result } = renderHook(() => useBulkRecording());

      expect(result.current.getStreamStatus('non-existent-mint')).toBeNull();
    });
  });

  describe('startRecording', () => {
    it('should start recording for a single stream successfully', async () => {
      const mockResponse = {
        success: true,
        start_time: new Date().toISOString(),
        participant_sid: 'participant-123',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecording('mint-1');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/recording/start',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mint_id: 'mint-1',
            output_format: 'webm',
            video_quality: 'high',
          }),
        })
      );

      const streamStatus = result.current.getStreamStatus('mint-1');
      expect(streamStatus).not.toBeNull();
      expect(streamStatus?.isRecording).toBe(true);
      expect(streamStatus?.error).toBeNull();
      expect(result.current.status.recordingCount).toBe(1);
      expect(result.current.status.isRecording).toBe(true);
    });

    it('should handle API error when starting recording', async () => {
      const errorResponse = {
        detail: 'Failed to start recording: Stream not found',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve(errorResponse),
      });

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        try {
          await result.current.startRecording('mint-1');
        } catch (error) {
          // Expected to throw
        }
      });

      const streamStatus = result.current.getStreamStatus('mint-1');
      expect(streamStatus).not.toBeNull();
      expect(streamStatus?.isRecording).toBe(false);
      expect(streamStatus?.error).toBe('Failed to start recording: Stream not found');
      expect(result.current.status.failedCount).toBe(1);
      expect(result.current.status.errors.has('mint-1')).toBe(true);
    });

    it('should handle network error when starting recording', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        try {
          await result.current.startRecording('mint-1');
        } catch (error) {
          // Expected to throw
        }
      });

      const streamStatus = result.current.getStreamStatus('mint-1');
      expect(streamStatus?.error).toBe('Network error');
      expect(result.current.status.failedCount).toBe(1);
    });

    it('should update duration over time', async () => {
      const startTime = new Date('2024-01-01T00:00:00Z');
      const mockResponse = {
        success: true,
        start_time: startTime.toISOString(),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecording('mint-1');
      });

      // Fast-forward time by 5 seconds
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      const streamStatus = result.current.getStreamStatus('mint-1');
      expect(streamStatus?.duration).toBeGreaterThan(0);
    });
  });

  describe('stopRecording', () => {
    it('should stop recording for a single stream successfully', async () => {
      const startResponse = {
        success: true,
        start_time: new Date().toISOString(),
      };

      const stopResponse = {
        success: true,
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(startResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(stopResponse),
        });

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecording('mint-1');
      });

      expect(result.current.status.recordingCount).toBe(1);

      await act(async () => {
        await result.current.stopRecording('mint-1');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/recording/stop',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mint_id: 'mint-1',
          }),
        })
      );

      const streamStatus = result.current.getStreamStatus('mint-1');
      expect(streamStatus?.isRecording).toBe(false);
      expect(streamStatus?.isFinalizing).toBe(false);
      expect(result.current.status.recordingCount).toBe(0);
      expect(result.current.status.isRecording).toBe(false);
    });

    it('should handle error when stopping recording', async () => {
      const startResponse = {
        success: true,
        start_time: new Date().toISOString(),
      };

      const errorResponse = {
        detail: 'Failed to stop recording: Recording not found',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(startResponse),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: () => Promise.resolve(errorResponse),
        });

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecording('mint-1');
      });

      await act(async () => {
        try {
          await result.current.stopRecording('mint-1');
        } catch (error) {
          // Expected to throw
        }
      });

      const streamStatus = result.current.getStreamStatus('mint-1');
      expect(streamStatus?.error).toBe('Failed to stop recording: Recording not found');
      expect(streamStatus?.isFinalizing).toBe(false);
    });
  });

  describe('startRecordingAll', () => {
    it('should start recording for all streams successfully', async () => {
      const mockResponse = {
        success: true,
        start_time: new Date().toISOString(),
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecordingAll([mockStream1, mockStream2, mockStream3]);
      });

      expect(result.current.status.totalStreams).toBe(3);
      expect(result.current.status.recordingCount).toBe(3);
      expect(result.current.status.isRecording).toBe(true);
      expect(result.current.status.failedCount).toBe(0);

      expect(result.current.getStreamStatus('mint-1')?.isRecording).toBe(true);
      expect(result.current.getStreamStatus('mint-2')?.isRecording).toBe(true);
      expect(result.current.getStreamStatus('mint-3')?.isRecording).toBe(true);
    });

    it('should handle partial failures when starting multiple recordings', async () => {
      const successResponse = {
        success: true,
        start_time: new Date().toISOString(),
      };

      const errorResponse = {
        detail: 'Failed to start recording: Stream not found',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(successResponse),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: () => Promise.resolve(errorResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(successResponse),
        });

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecordingAll([mockStream1, mockStream2, mockStream3]);
      });

      expect(result.current.status.totalStreams).toBe(3);
      expect(result.current.status.recordingCount).toBe(2);
      expect(result.current.status.failedCount).toBe(1);
      expect(result.current.status.isRecording).toBe(true);

      expect(result.current.getStreamStatus('mint-1')?.isRecording).toBe(true);
      expect(result.current.getStreamStatus('mint-2')?.isRecording).toBe(false);
      expect(result.current.getStreamStatus('mint-2')?.error).toBe('Failed to start recording: Stream not found');
      expect(result.current.getStreamStatus('mint-3')?.isRecording).toBe(true);
    });

    it('should handle empty streams array', async () => {
      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecordingAll([]);
      });

      expect(result.current.status.totalStreams).toBe(0);
      expect(result.current.status.recordingCount).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('stopRecordingAll', () => {
    it('should stop all active recordings', async () => {
      const startResponse = {
        success: true,
        start_time: new Date().toISOString(),
      };

      const stopResponse = {
        success: true,
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(startResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(startResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(startResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(stopResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(stopResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(stopResponse),
        });

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecordingAll([mockStream1, mockStream2, mockStream3]);
      });

      expect(result.current.status.recordingCount).toBe(3);

      await act(async () => {
        await result.current.stopRecordingAll();
      });

      expect(result.current.status.recordingCount).toBe(0);
      expect(result.current.status.isRecording).toBe(false);
      expect(result.current.getStreamStatus('mint-1')?.isRecording).toBe(false);
      expect(result.current.getStreamStatus('mint-2')?.isRecording).toBe(false);
      expect(result.current.getStreamStatus('mint-3')?.isRecording).toBe(false);
    });

    it('should handle no active recordings gracefully', async () => {
      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.stopRecordingAll();
      });

      expect(result.current.status.recordingCount).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Status polling', () => {
    it('should poll recording status periodically', async () => {
      const startResponse = {
        success: true,
        start_time: new Date().toISOString(),
      };

      const statusResponse = {
        success: true,
        state: 'recording',
        start_time: new Date().toISOString(),
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(startResponse),
        })
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(statusResponse),
        });

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecording('mint-1');
      });

      // Fast-forward to trigger status check
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8000/api/recording/status/mint-1'
        );
      });
    });

    it('should stop polling when recording is not found', async () => {
      const startResponse = {
        success: true,
        start_time: new Date().toISOString(),
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(startResponse),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecording('mint-1');
      });

      // Fast-forward to trigger status check
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        const streamStatus = result.current.getStreamStatus('mint-1');
        expect(streamStatus?.isRecording).toBe(false);
      });
    });
  });

  describe('getStreamStatus', () => {
    it('should return correct status for a stream', async () => {
      const mockResponse = {
        success: true,
        start_time: new Date().toISOString(),
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecording('mint-1');
      });

      const streamStatus = result.current.getStreamStatus('mint-1');
      expect(streamStatus).not.toBeNull();
      expect(streamStatus?.mintId).toBe('mint-1');
      expect(streamStatus?.isRecording).toBe(true);
    });

    it('should return null for non-existent stream', () => {
      const { result } = renderHook(() => useBulkRecording());

      expect(result.current.getStreamStatus('non-existent')).toBeNull();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup intervals on unmount', async () => {
      const mockResponse = {
        success: true,
        start_time: new Date().toISOString(),
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result, unmount } = renderHook(() => useBulkRecording());

      await act(async () => {
        await result.current.startRecording('mint-1');
      });

      const initialFetchCount = (global.fetch as jest.Mock).mock.calls.length;

      // Fast-forward time
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      unmount();

      // Fast-forward more time after unmount
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Fetch count should not increase significantly after unmount
      // (allowing for any pending calls)
      const finalFetchCount = (global.fetch as jest.Mock).mock.calls.length;
      expect(finalFetchCount).toBeLessThanOrEqual(initialFetchCount + 2);
    });
  });
});

