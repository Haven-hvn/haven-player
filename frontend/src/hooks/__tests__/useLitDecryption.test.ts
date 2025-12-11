import { renderHook, act, waitFor } from '@testing-library/react';
import { useLitDecryption } from '../useLitDecryption';
import type { Video } from '@/types/video';

// Mock electron ipcRenderer
const mockIpcRenderer = {
  invoke: jest.fn(),
};

jest.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
}), { virtual: true });

// Also mock the require('electron') pattern used in the hook
jest.mock('../../hooks/useLitDecryption', () => {
  const originalModule = jest.requireActual('../../hooks/useLitDecryption');
  return {
    ...originalModule,
  };
});

// Mock the litService
jest.mock('../../services/litService', () => ({
  decryptFileFromStorage: jest.fn(),
  deserializeEncryptionMetadata: jest.fn(),
}));

import { decryptFileFromStorage, deserializeEncryptionMetadata } from '@/services/litService';

const mockDecryptFileFromStorage = decryptFileFromStorage as jest.Mock;
const mockDeserializeEncryptionMetadata = deserializeEncryptionMetadata as jest.Mock;

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = jest.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = jest.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

describe('useLitDecryption', () => {
  const mockVideo: Video = {
    id: 1,
    path: '/path/to/video.mp4',
    title: 'Test Video',
    duration: 120,
    has_ai_data: false,
    thumbnail_path: null,
    position: 0,
    created_at: '2024-01-01T00:00:00Z',
    is_encrypted: true,
    lit_encryption_metadata: JSON.stringify({
      ciphertext: 'test-ciphertext',
      dataToEncryptHash: 'test-hash',
      accessControlConditions: [],
      chain: 'ethereum',
    }),
  };

  const mockUnencryptedVideo: Video = {
    id: 2,
    path: '/path/to/unencrypted.mp4',
    title: 'Unencrypted Video',
    duration: 60,
    has_ai_data: false,
    thumbnail_path: null,
    position: 1,
    created_at: '2024-01-01T00:00:00Z',
    is_encrypted: false,
    lit_encryption_metadata: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIpcRenderer.invoke.mockReset();
    mockDecryptFileFromStorage.mockReset();
    mockDeserializeEncryptionMetadata.mockReset();
    mockCreateObjectURL.mockClear();
    mockRevokeObjectURL.mockClear();
  });

  it('should initialize with idle status', () => {
    const { result } = renderHook(() => useLitDecryption());
    
    expect(result.current.decryptedUrl).toBeNull();
    expect(result.current.decryptionStatus.status).toBe('idle');
    expect(result.current.isEncrypted).toBe(false);
  });

  it('should return null for unencrypted videos', async () => {
    const { result } = renderHook(() => useLitDecryption());
    
    let decryptResult: string | null = null;
    await act(async () => {
      decryptResult = await result.current.decryptVideo(
        mockUnencryptedVideo,
        async () => new Uint8Array()
      );
    });
    
    expect(decryptResult).toBeNull();
    expect(result.current.isEncrypted).toBe(false);
    expect(result.current.decryptionStatus.status).toBe('idle');
  });

  it('should clear decrypted URL and revoke blob URL', async () => {
    const { result } = renderHook(() => useLitDecryption());
    
    // Set up a mock decrypted URL
    mockIpcRenderer.invoke.mockResolvedValueOnce({
      privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });
    mockDeserializeEncryptionMetadata.mockReturnValue({
      ciphertext: 'test',
      dataToEncryptHash: 'hash',
      accessControlConditions: [],
      chain: 'ethereum',
    });
    mockDecryptFileFromStorage.mockResolvedValue(new Blob(['test']));
    const loadEncryptedData = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    
    // Decrypt a video to create a URL
    await act(async () => {
      await result.current.decryptVideo(mockVideo, loadEncryptedData);
    });
    
    // Clear the URL
    act(() => {
      result.current.clearDecryptedUrl();
    });
    
    expect(result.current.decryptedUrl).toBeNull();
    expect(result.current.decryptionStatus.status).toBe('idle');
    expect(result.current.isEncrypted).toBe(false);
    expect(mockRevokeObjectURL).toHaveBeenCalled();
  });

  it('should handle missing private key configuration', async () => {
    mockIpcRenderer.invoke.mockResolvedValueOnce(null); // No config
    
    const { result } = renderHook(() => useLitDecryption());
    
    await act(async () => {
      await result.current.decryptVideo(mockVideo, async () => new Uint8Array([1, 2, 3]));
    });
    
    expect(result.current.decryptionStatus.status).toBe('error');
    expect(result.current.decryptionStatus.error).toContain('Private key not configured');
  });

  it('should handle invalid encryption metadata', async () => {
    mockIpcRenderer.invoke.mockResolvedValueOnce({
      privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });
    mockDeserializeEncryptionMetadata.mockImplementation(() => {
      throw new Error('Invalid JSON');
    });
    
    const { result } = renderHook(() => useLitDecryption());
    
    await act(async () => {
      await result.current.decryptVideo(mockVideo, async () => new Uint8Array([1, 2, 3]));
    });
    
    expect(result.current.decryptionStatus.status).toBe('error');
    expect(result.current.decryptionStatus.error).toContain('Invalid encryption metadata');
  });

  it('should set isEncrypted to true for encrypted videos', async () => {
    mockIpcRenderer.invoke.mockResolvedValueOnce({
      privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });
    mockIpcRenderer.invoke.mockResolvedValueOnce({
      data: new Uint8Array([1, 2, 3]),
    });
    mockDeserializeEncryptionMetadata.mockReturnValue({
      ciphertext: 'test',
      dataToEncryptHash: 'hash',
      accessControlConditions: [],
      chain: 'ethereum',
    });
    mockDecryptFileFromStorage.mockResolvedValue(new Blob(['test']));
    
    const { result } = renderHook(() => useLitDecryption());
    
    await act(async () => {
      await result.current.decryptVideo(
        mockVideo,
        async () => new Uint8Array([1, 2, 3])
      );
    });
    
    expect(result.current.isEncrypted).toBe(true);
  });
});

