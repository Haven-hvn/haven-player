import { renderHook, act } from '@testing-library/react';
import { useFilecoinUpload } from '../useFilecoinUpload';

const mockInvoke = jest.fn();
const mockOn = jest.fn();
const mockRemoveListener = jest.fn();

jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (...args: unknown[]) => mockOn(...args),
    removeListener: (...args: unknown[]) => mockRemoveListener(...args),
  },
}));

jest.mock('@/services/api', () => ({
  videoService: {
    updateFilecoinMetadata: jest.fn(),
  },
}));

describe('useFilecoinUpload (IPC path)', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockOn.mockReset();
    mockRemoveListener.mockReset();
  });

  it('delegates upload to main via IPC and handles progress', async () => {
    const progressHandlers: Array<(event: unknown, payload: { videoPath: string; progress: { stage: string; progress: number } }) => void> = [];
    mockOn.mockImplementation((channel: string, handler: (event: unknown, payload: unknown) => void) => {
      if (channel === 'filecoin-upload-progress') {
        progressHandlers.push(handler as never);
      }
    });

    mockInvoke.mockResolvedValue({
      rootCid: 'cid',
      pieceCid: 'piece',
      dataSetId: 'data',
      transactionHash: '0xabc',
      isEncrypted: true,
    });

    const { result } = renderHook(() => useFilecoinUpload());

    await act(async () => {
      const uploadPromise = result.current.uploadVideo('/path/video.mp4', {
        privateKey: `0x${'a'.repeat(64)}`,
        rpcUrl: 'http://localhost:8545',
        encryptionEnabled: true,
      });

      // Simulate progress from main
      progressHandlers.forEach((handler) =>
        handler(undefined, {
          videoPath: '/path/video.mp4',
          progress: { stage: 'uploading', progress: 50, message: 'halfway' },
        })
      );

      await uploadPromise;
    });

    expect(mockInvoke).toHaveBeenCalledWith('upload-to-filecoin', {
      videoPath: '/path/video.mp4',
      config: {
        privateKey: `0x${'a'.repeat(64)}`,
        rpcUrl: 'http://localhost:8545',
        encryptionEnabled: true,
      },
    });

    expect(result.current.uploadStatus['/path/video.mp4']).toMatchObject({
      status: 'completed',
      progress: 100,
      isEncrypted: true,
    });

    expect(mockRemoveListener).toHaveBeenCalledWith(
      'filecoin-upload-progress',
      expect.any(Function)
    );
  });
});

