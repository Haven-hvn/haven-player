/**
 * Test error handling in useRecording hook
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRecording } from '../useRecording';

// Mock fetch globally
global.fetch = jest.fn();

describe('useRecording - Error Handling', () => {
  const mockMintId = 'test-mint-id-123';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should handle "No participants found in room" error from session start', async () => {
    // Mock session start failure
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'No participants found in room' }),
    });

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    // Verify error state
    expect(result.current.error).toBe('No participants found in room');
    expect(result.current.isRecording).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle generic session start errors', async () => {
    // Mock session start failure without detail
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    // Verify error state with fallback message
    expect(result.current.error).toBe('Failed to start session: 500');
    expect(result.current.isRecording).toBe(false);
  });

  it('should handle recording start errors after successful session', async () => {
    // Mock successful session start
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    // Mock recording start failure
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'No active stream found' }),
    });

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    // Verify error state
    expect(result.current.error).toBe('No active stream found');
    expect(result.current.isRecording).toBe(false);
  });

  it('should clear error when starting recording again', async () => {
    // First attempt: session fails
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'No participants found in room' }),
    });

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe('No participants found in room');

    // Second attempt: success
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    await act(async () => {
      await result.current.startRecording();
    });

    // Error should be cleared
    expect(result.current.error).toBeNull();
    expect(result.current.isRecording).toBe(true);
  });

  it('should handle network errors gracefully', async () => {
    // Mock network failure
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('Network request failed')
    );

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    // Verify error state
    expect(result.current.error).toBe('Network request failed');
    expect(result.current.isRecording).toBe(false);
  });

  it('should handle malformed JSON responses', async () => {
    // Mock response with invalid JSON
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    const { result } = renderHook(() => useRecording(mockMintId));

    await act(async () => {
      await result.current.startRecording();
    });

    // Should fallback to status code message
    expect(result.current.error).toBe('Failed to start session: 500');
    expect(result.current.isRecording).toBe(false);
  });
});

