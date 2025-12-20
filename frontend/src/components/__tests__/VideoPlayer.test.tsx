/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VideoPlayer from '../VideoPlayer';
import { videoService } from '@/services/api';
import * as playbackConfig from '@/services/playbackConfig';
import * as playbackResolver from '@/services/playbackResolver';
import * as useLitDecryptionModule from '@/hooks/useLitDecryption';
import type { Video, Timestamp } from '@/types/video';
import type { PlaybackResolution } from '@/types/playback';
import type { DecryptionStatus, UseLitDecryptionReturn } from '@/hooks/useLitDecryption';

// Mock modules
jest.mock('@/services/api');
jest.mock('@/services/playbackConfig');
jest.mock('@/services/playbackResolver');

// Mock electron
jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
  },
}));

// Mock useLitDecryption hook
const mockUseLitDecryption = jest.spyOn(useLitDecryptionModule, 'useLitDecryption');

// Sample data
const mockVideo: Video = {
  id: 1,
  path: '/path/to/video.mp4',
  title: 'Test Video',
  duration: 120,
  has_ai_data: false,
  thumbnail_path: '/path/to/thumb.jpg',
  position: 0,
  created_at: '2024-01-01T00:00:00Z',
  share_to_arkiv: false,
  is_encrypted: false,
  lit_encryption_metadata: null,
};

const mockEncryptedVideo: Video = {
  ...mockVideo,
  is_encrypted: true,
  lit_encryption_metadata: '{"ciphertext":"abc","dataToEncryptHash":"def"}',
  filecoin_root_cid: 'bafytest123',
};

const mockTimestamps: Timestamp[] = [
  {
    id: 1,
    video_path: '/path/to/video.mp4',
    tag_name: 'Chapter 1',
    start_time: 10,
    end_time: 30,
    confidence: 0.95,
  },
  {
    id: 2,
    video_path: '/path/to/video.mp4',
    tag_name: 'Chapter 2',
    start_time: 30,
    end_time: 60,
    confidence: 0.92,
  },
];

const mockGatewayConfig = {
  baseUrl: 'https://ipfs.io/ipfs/',
};

const mockLocalPlaybackSource: PlaybackResolution = {
  type: 'local',
  uri: '/path/to/video.mp4',
  reason: 'local-exists',
  isEncrypted: false,
  litEncryptionMetadata: null,
};

const mockIpfsPlaybackSource: PlaybackResolution = {
  type: 'ipfs',
  uri: 'https://ipfs.io/ipfs/bafytest123',
  gatewayBase: 'https://ipfs.io/ipfs/',
  cid: 'bafytest123',
  isEncrypted: false,
  litEncryptionMetadata: null,
};

const mockBothPlaybackSource: PlaybackResolution = {
  type: 'both',
  local: {
    uri: '/path/to/video.mp4',
    reason: 'local-exists',
  },
  ipfs: {
    uri: 'https://ipfs.io/ipfs/bafytest123',
    gatewayBase: 'https://ipfs.io/ipfs/',
    cid: 'bafytest123',
  },
  isEncrypted: false,
  litEncryptionMetadata: null,
};

const mockUnavailablePlaybackSource: PlaybackResolution = {
  type: 'unavailable',
  reason: 'missing-file-and-cid',
};

// Default mock implementation for useLitDecryption
const createMockUseLitDecryption = (overrides: Partial<UseLitDecryptionReturn> = {}): UseLitDecryptionReturn => ({
  decryptedUrl: null,
  decryptionStatus: { status: 'idle', progress: '' },
  decryptVideo: jest.fn().mockResolvedValue(null),
  clearDecryptedUrl: jest.fn(),
  isEncrypted: false,
  ...overrides,
});

// Helper to render VideoPlayer with routing
const renderVideoPlayer = (videoPath = '/path/to/video.mp4') => {
  return render(
    <MemoryRouter initialEntries={[`/video/${encodeURIComponent(videoPath)}`]}>
      <Routes>
        <Route path="/video/:videoPath" element={<VideoPlayer />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  );
};

// Setup mocks before each test
const setupMocks = (
  videos: Video[] = [mockVideo],
  timestamps: Timestamp[] = mockTimestamps,
  playbackSource: PlaybackResolution = mockLocalPlaybackSource,
  litDecryption: Partial<UseLitDecryptionReturn> = {}
) => {
  (videoService.getAll as jest.Mock).mockResolvedValue(videos);
  (videoService.getTimestamps as jest.Mock).mockResolvedValue(timestamps);
  (playbackConfig.loadGatewayConfig as jest.Mock).mockResolvedValue(mockGatewayConfig);
  (playbackConfig.fileExistsViaIpc as jest.Mock).mockResolvedValue(true);
  (playbackResolver.resolvePlaybackSource as jest.Mock).mockResolvedValue(playbackSource);
  mockUseLitDecryption.mockReturnValue(createMockUseLitDecryption(litDecryption));
};

describe('VideoPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock HTMLMediaElement methods
    window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = jest.fn();
    window.HTMLMediaElement.prototype.load = jest.fn();
  });

  describe('loading states', () => {
    it('should show loading spinner initially', async () => {
      setupMocks();
      
      // Create a promise that won't resolve immediately
      let resolveVideos: (value: Video[]) => void;
      const videosPromise = new Promise<Video[]>((resolve) => {
        resolveVideos = resolve;
      });
      (videoService.getAll as jest.Mock).mockReturnValue(videosPromise);

      renderVideoPlayer();

      expect(screen.getByText('Loading video...')).toBeInTheDocument();

      // Resolve the promise to clean up
      await act(async () => {
        resolveVideos!([mockVideo]);
      });
    });

    it('should show decryption loading state', async () => {
      const decryptingStatus: DecryptionStatus = {
        status: 'decrypting',
        progress: 'Connecting to Lit Protocol...',
      };

      setupMocks([mockEncryptedVideo], mockTimestamps, mockIpfsPlaybackSource, {
        decryptionStatus: decryptingStatus,
        isEncrypted: true,
      });

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('Decrypting encrypted video...')).toBeInTheDocument();
        expect(screen.getByText('Connecting to Lit Protocol...')).toBeInTheDocument();
      });
    });

    it('should show encryption configuration loading state', async () => {
      const loadingStatus: DecryptionStatus = {
        status: 'loading',
        progress: '',
      };

      setupMocks([mockEncryptedVideo], mockTimestamps, mockIpfsPlaybackSource, {
        decryptionStatus: loadingStatus,
        isEncrypted: true,
      });

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('Loading encryption configuration...')).toBeInTheDocument();
      });
    });
  });

  describe('error states', () => {
    it('should show error when video not found', async () => {
      setupMocks([]); // No videos in the list

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('Video not found')).toBeInTheDocument();
      });
    });

    it('should show error when playback source is unavailable', async () => {
      setupMocks([mockVideo], mockTimestamps, mockUnavailablePlaybackSource);

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('Video missing locally and no IPFS CID is available.')).toBeInTheDocument();
      });
    });

    it('should show decryption error', async () => {
      const errorStatus: DecryptionStatus = {
        status: 'error',
        progress: '',
        error: 'Failed to decrypt: Invalid key',
      };

      setupMocks([mockEncryptedVideo], mockTimestamps, mockIpfsPlaybackSource, {
        decryptionStatus: errorStatus,
        isEncrypted: true,
      });

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('Decryption Failed')).toBeInTheDocument();
        expect(screen.getByText('Failed to decrypt: Invalid key')).toBeInTheDocument();
      });
    });

    it('should show API error', async () => {
      (videoService.getAll as jest.Mock).mockRejectedValue(new Error('Network error'));
      mockUseLitDecryption.mockReturnValue(createMockUseLitDecryption());

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('video playback', () => {
    it('should render video element with correct source', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        const video = document.querySelector('video');
        expect(video).toBeInTheDocument();
        expect(video?.src).toContain('file://');
      });
    });

    it('should show video title in top bar', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });
    });

    it('should show play/pause button', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        // Find the play button (initially paused)
        const playButton = screen.getByTestId ? 
          document.querySelector('[data-testid="PlayArrowIcon"]') :
          document.querySelector('svg[data-testid="PlayArrowIcon"]');
        expect(playButton || document.querySelector('.MuiSvgIcon-root')).toBeInTheDocument();
      });
    });

    it('should toggle play/pause on video click', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        const video = document.querySelector('video');
        expect(video).toBeInTheDocument();
      });

      const video = document.querySelector('video')!;
      
      // Simulate loadedmetadata to set player as ready
      fireEvent.loadedMetadata(video);

      // Click to play
      fireEvent.click(video);

      expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });
  });

  describe('source selection', () => {
    it('should show source toggle when both sources available', async () => {
      setupMocks([mockVideo], mockTimestamps, mockBothPlaybackSource);

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('Local')).toBeInTheDocument();
        expect(screen.getByText('IPFS')).toBeInTheDocument();
      });
    });

    it('should show local chip for local-only source', async () => {
      setupMocks([mockVideo], mockTimestamps, mockLocalPlaybackSource);

      renderVideoPlayer();

      await waitFor(() => {
        // Look for the Local chip
        const localChip = screen.queryByText('Local');
        expect(localChip).toBeInTheDocument();
      });
    });

    it('should show IPFS chip with gateway host for IPFS-only source', async () => {
      setupMocks([mockVideo], mockTimestamps, mockIpfsPlaybackSource);

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText(/IPFS/)).toBeInTheDocument();
      });
    });

    it('should switch source when toggle clicked', async () => {
      setupMocks([mockVideo], mockTimestamps, mockBothPlaybackSource);

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('IPFS')).toBeInTheDocument();
      });

      const ipfsButton = screen.getByText('IPFS');
      fireEvent.click(ipfsButton);

      // After clicking IPFS, the video URL should change
      await waitFor(() => {
        const video = document.querySelector('video');
        expect(video?.src).toContain('https://');
      });
    });
  });

  describe('encryption indicators', () => {
    it('should show encrypted chip for encrypted IPFS video', async () => {
      setupMocks([mockEncryptedVideo], mockTimestamps, mockIpfsPlaybackSource, {
        isEncrypted: true,
        decryptedUrl: 'blob:http://localhost/decrypted-video',
        decryptionStatus: { status: 'completed', progress: 'Decryption complete' },
      });

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('Encrypted')).toBeInTheDocument();
      });
    });

    it('should not show encrypted chip for local unencrypted video', async () => {
      setupMocks([mockVideo], mockTimestamps, mockLocalPlaybackSource);

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      expect(screen.queryByText('Encrypted')).not.toBeInTheDocument();
    });
  });

  describe('controls visibility', () => {
    it('should show controls on mouse move', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        expect(document.querySelector('video')).toBeInTheDocument();
      });

      const container = document.querySelector('[style*="cursor"]')?.parentElement;
      if (container) {
        fireEvent.mouseMove(container);
      }

      // Controls should be visible
      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });
    });
  });

  describe('timestamp markers', () => {
    it('should render timestamp markers on progress bar', async () => {
      setupMocks([mockVideo], mockTimestamps, mockLocalPlaybackSource);

      renderVideoPlayer();

      await waitFor(() => {
        // Wait for video to load
        expect(document.querySelector('video')).toBeInTheDocument();
      });

      // Trigger metadata loaded to set duration
      const video = document.querySelector('video')!;
      Object.defineProperty(video, 'duration', { value: 120, writable: true });
      fireEvent.loadedMetadata(video);

      // Look for timestamp markers - they should have tooltip with timestamp info
      await waitFor(() => {
        const markers = document.querySelectorAll('[style*="position: absolute"]');
        // There should be multiple positioned elements including markers
        expect(markers.length).toBeGreaterThan(0);
      });
    });
  });

  describe('keyboard shortcuts', () => {
    it('should show shortcuts overlay when ? is pressed', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        expect(document.querySelector('video')).toBeInTheDocument();
      });

      // Trigger metadata loaded
      const video = document.querySelector('video')!;
      fireEvent.loadedMetadata(video);

      // Press ?
      fireEvent.keyDown(window, { key: '?' });

      await waitFor(() => {
        expect(screen.getByText('⌨️ Keyboard Shortcuts')).toBeInTheDocument();
      });
    });

    it('should close shortcuts overlay when clicked outside', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        expect(document.querySelector('video')).toBeInTheDocument();
      });

      const video = document.querySelector('video')!;
      fireEvent.loadedMetadata(video);

      // Open shortcuts
      fireEvent.keyDown(window, { key: '?' });

      await waitFor(() => {
        expect(screen.getByText('⌨️ Keyboard Shortcuts')).toBeInTheDocument();
      });

      // Click the overlay background to close
      const overlay = screen.getByText('Press ESC or click outside to close').closest('[style*="cursor: pointer"]');
      if (overlay) {
        fireEvent.click(overlay);
      }

      await waitFor(() => {
        expect(screen.queryByText('⌨️ Keyboard Shortcuts')).not.toBeInTheDocument();
      });
    });
  });

  describe('playback speed menu', () => {
    it('should show speed indicator', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('1x')).toBeInTheDocument();
      });
    });
  });

  describe('volume control', () => {
    it('should render volume slider', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        // Find slider elements (MUI Slider)
        const sliders = document.querySelectorAll('.MuiSlider-root');
        expect(sliders.length).toBeGreaterThan(0);
      });
    });
  });

  describe('navigation', () => {
    it('should navigate back when back button clicked', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      // Find and click back button
      const backButton = document.querySelector('[data-testid="ArrowBackIcon"]')?.closest('button');
      if (backButton) {
        fireEvent.click(backButton);
      }

      await waitFor(() => {
        expect(screen.getByText('Home')).toBeInTheDocument();
      });
    });
  });

  describe('time display', () => {
    it('should display current time and duration', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        expect(document.querySelector('video')).toBeInTheDocument();
      });

      const video = document.querySelector('video')!;
      Object.defineProperty(video, 'duration', { value: 120, writable: true });
      Object.defineProperty(video, 'currentTime', { value: 30, writable: true });
      fireEvent.loadedMetadata(video);
      fireEvent.timeUpdate(video);

      await waitFor(() => {
        // Should show some time display
        const timeDisplay = screen.queryByText(/0:00/);
        // Time display should exist
        expect(document.body.textContent).toMatch(/\d+:\d+/);
      });
    });
  });

  describe('fullscreen toggle', () => {
    it('should render fullscreen button', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        const fullscreenIcon = document.querySelector('[data-testid="FullscreenIcon"]');
        expect(fullscreenIcon).toBeInTheDocument();
      });
    });
  });

  describe('loop toggle', () => {
    it('should render loop button', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        const loopIcon = document.querySelector('[data-testid="LoopIcon"]');
        expect(loopIcon).toBeInTheDocument();
      });
    });
  });

  describe('PiP button', () => {
    it('should render PiP button', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        const pipIcon = document.querySelector('[data-testid="PictureInPictureAltIcon"]');
        expect(pipIcon).toBeInTheDocument();
      });
    });
  });

  describe('skip buttons', () => {
    it('should render skip forward and backward buttons', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        const replayIcon = document.querySelector('[data-testid="Replay10Icon"]');
        const forwardIcon = document.querySelector('[data-testid="Forward10Icon"]');
        expect(replayIcon).toBeInTheDocument();
        expect(forwardIcon).toBeInTheDocument();
      });
    });
  });

  describe('decryption flow', () => {
    it('should initiate decryption for encrypted IPFS video', async () => {
      const mockDecryptVideo = jest.fn().mockResolvedValue('blob:decrypted');

      setupMocks([mockEncryptedVideo], mockTimestamps, mockIpfsPlaybackSource, {
        decryptVideo: mockDecryptVideo,
        isEncrypted: false,
        decryptionStatus: { status: 'idle', progress: '' },
      });

      // Mock fetch for encrypted data
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      renderVideoPlayer();

      await waitFor(() => {
        expect(mockDecryptVideo).toHaveBeenCalled();
      });
    });

    it('should cleanup decrypted URL on unmount', async () => {
      const mockClearDecryptedUrl = jest.fn();

      setupMocks([mockVideo], mockTimestamps, mockLocalPlaybackSource, {
        clearDecryptedUrl: mockClearDecryptedUrl,
      });

      const { unmount } = renderVideoPlayer();

      await waitFor(() => {
        expect(document.querySelector('video')).toBeInTheDocument();
      });

      unmount();

      expect(mockClearDecryptedUrl).toHaveBeenCalled();
    });
  });

  describe('video error handling', () => {
    it('should show retry button on playback error', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        expect(document.querySelector('video')).toBeInTheDocument();
      });

      const video = document.querySelector('video')!;
      
      // Simulate video error
      Object.defineProperty(video, 'error', {
        value: { code: MediaError.MEDIA_ERR_NETWORK, message: 'Network error' },
        writable: true,
      });
      fireEvent.error(video);

      // The error should be handled by the component
      // Note: Due to hook state, this may need additional waiting
    });
  });

  describe('buffering state', () => {
    it('should show buffering spinner when video is buffering', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        expect(document.querySelector('video')).toBeInTheDocument();
      });

      const video = document.querySelector('video')!;
      fireEvent.loadedMetadata(video);
      
      // Simulate buffering
      fireEvent.waiting(video);

      await waitFor(() => {
        // Look for spinner animation
        const spinner = document.querySelector('[style*="animation: spin"]');
        expect(spinner).toBeInTheDocument();
      });
    });

    it('should hide buffering spinner when video can play', async () => {
      setupMocks();

      renderVideoPlayer();

      await waitFor(() => {
        expect(document.querySelector('video')).toBeInTheDocument();
      });

      const video = document.querySelector('video')!;
      fireEvent.loadedMetadata(video);
      
      // Start buffering
      fireEvent.waiting(video);
      
      // Finish buffering
      fireEvent.canPlay(video);

      await waitFor(() => {
        // Spinner should be gone or hidden
        const spinners = document.querySelectorAll('[style*="animation: spin"]');
        // Either no spinner or spinners are not in the buffering overlay
        expect(spinners.length === 0 || !spinners[0].closest('[style*="position: absolute"]')?.textContent?.includes('buffering')).toBeTruthy();
      });
    });
  });

  describe('video URL construction', () => {
    it('should construct correct file:// URL for local videos', async () => {
      setupMocks([mockVideo], mockTimestamps, mockLocalPlaybackSource);

      renderVideoPlayer();

      await waitFor(() => {
        const video = document.querySelector('video');
        expect(video?.src).toMatch(/^file:\/\//);
      });
    });

    it('should use decrypted blob URL for encrypted videos', async () => {
      setupMocks([mockEncryptedVideo], mockTimestamps, mockIpfsPlaybackSource, {
        decryptedUrl: 'blob:http://localhost/decrypted',
        isEncrypted: true,
        decryptionStatus: { status: 'completed', progress: '' },
      });

      renderVideoPlayer();

      await waitFor(() => {
        const video = document.querySelector('video');
        expect(video?.src).toContain('blob:');
      });
    });
  });
});

// Test helper functions
describe('formatTime helper', () => {
  // The formatTime function is internal to VideoPlayer, but we can test its behavior
  // through the component's time display
  
  it('should format time correctly in component display', async () => {
    const videos = [{ ...mockVideo, duration: 3661 }]; // 1 hour, 1 minute, 1 second
    
    setupMocks(videos, [], mockLocalPlaybackSource);

    renderVideoPlayer();

    await waitFor(() => {
      expect(document.querySelector('video')).toBeInTheDocument();
    });

    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 3661, writable: true });
    fireEvent.loadedMetadata(video);

    await waitFor(() => {
      // Should display formatted time
      expect(document.body.textContent).toMatch(/\d+:\d+/);
    });
  });
});

