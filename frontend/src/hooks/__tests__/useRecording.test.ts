import { renderHook, act } from '@testing-library/react';
import { useRecording } from '../useRecording';

// Mock fetch globally
global.fetch = jest.fn();

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('useRecording', () => {
  const mockMintId = 'test-mint-123';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useRecording(mockMintId));

    expect(result.current.isRecording).toBe(false);
    expect(result.current.duration).toBe(0);
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBe(null);
    expect(result.current.isLoading).toBe(false);
  });

  it('starts recording successfully', async () => {
    // Mock successful session start
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, session_id: 'session-123' }),
      } as Response)
      // Mock successful recording start
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, recording_id: 'recording-123' }),
      } as Response);

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'http://localhost:8000/api/live-sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mint_id: mockMintId }),
    });
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://localhost:8000/api/recording/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mint_id: mockMintId,
        output_format: 'av1',
        video_quality: 'medium',
      }),
    });
  });

  it('handles session start failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe('Failed to start session: 500');
    expect(result.current.isRecording).toBe(false);
  });

  it('handles recording start failure', async () => {
    // Mock successful session start
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response)
      // Mock failed recording start
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
      } as Response);

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe('Failed to start recording: 400');
    expect(result.current.isRecording).toBe(false);
  });

  it('stops recording successfully', async () => {
    // Mock successful recording stop
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response)
      // Mock successful session stop
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'http://localhost:8000/api/recording/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mint_id: mockMintId }),
    });
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://localhost:8000/api/live-sessions/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mint_id: mockMintId }),
    });
  });

  it('handles recording stop failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(result.current.error).toBe('Failed to stop recording: 500');
  });

  it('handles session stop failure', async () => {
    // Mock successful recording stop
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response)
      // Mock failed session stop
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
      } as Response);

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(result.current.error).toBe('Failed to stop session: 400');
  });

  it('polls recording status when recording', async () => {
    // Mock successful start
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    // Mock status polling response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        mint_id: mockMintId,
        is_recording: true,
        duration_seconds: 5,
        output_format: 'av1',
        video_quality: 'medium',
      }),
    } as Response);

    // Advance timers to trigger polling
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockFetch).toHaveBeenCalledWith(`http://localhost:8000/api/recording/status/${mockMintId}`);
  });

  it('stops polling when recording stops', async () => {
    // Mock successful start
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    // Mock status polling response showing not recording
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        mint_id: mockMintId,
        is_recording: false,
        duration_seconds: 0,
        output_format: 'av1',
        video_quality: 'medium',
      }),
    } as Response);

    // Advance timers to trigger polling
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Advance timers again - should not poll anymore
    const pollCount = mockFetch.mock.calls.length;
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockFetch.mock.calls.length).toBe(pollCount);
  });

  it('calculates progress correctly', () => {
    const { result, rerender } = renderHook(() => useRecording(mockMintId));

    // Test with 0 duration
    expect(result.current.progress).toBe(0);

    // Test with 15 seconds (50% of 30s max)
    act(() => {
      // This would be set internally by the hook
      (result.current as any).duration = 15;
    });
    expect(result.current.progress).toBe(50);

    // Test with 30+ seconds (100% max)
    act(() => {
      (result.current as any).duration = 35;
    });
    expect(result.current.progress).toBe(100);
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('cleans up polling on unmount', () => {
    const { unmount } = renderHook(() => useRecording(mockMintId));

    unmount();

    // Should not throw or cause memory leaks
    expect(() => {
      jest.advanceTimersByTime(1000);
    }).not.toThrow();
  });
});
