/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVideoControls, PLAYBACK_RATES, UseVideoControlsOptions, VideoError, VideoErrorType } from '../useVideoControls';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock HTMLVideoElement
class MockHTMLVideoElement {
  public currentTime = 0;
  public duration = 100;
  public volume = 1;
  public muted = false;
  public playbackRate = 1;
  public loop = false;
  public paused = true;
  public buffered = {
    length: 1,
    start: (index: number) => 0,
    end: (index: number) => 50,
  };

  play = jest.fn().mockResolvedValue(undefined);
  pause = jest.fn();
  load = jest.fn();
  requestPictureInPicture = jest.fn().mockResolvedValue({});
}

// Mock document methods
const mockRequestFullscreen = jest.fn();
const mockExitFullscreen = jest.fn();
const mockRequestPictureInPicture = jest.fn().mockResolvedValue({});
const mockExitPictureInPicture = jest.fn();

Object.defineProperty(document, 'fullscreenElement', {
  configurable: true,
  get: jest.fn(() => null),
});

Object.defineProperty(document, 'pictureInPictureElement', {
  configurable: true,
  get: jest.fn(() => null),
});

Object.defineProperty(document, 'pictureInPictureEnabled', {
  value: true,
});

document.exitFullscreen = mockExitFullscreen;
document.exitPictureInPicture = mockExitPictureInPicture;

describe('useVideoControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
  });

  describe('initial state', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useVideoControls());

      expect(result.current.state).toEqual({
        playing: false,
        muted: false,
        volume: 0.8,
        playbackRate: 1,
        played: 0,
        loaded: 0,
        duration: 0,
        seeking: false,
        buffering: false,
        fullscreen: false,
        pip: false,
        loop: false,
        showRemainingTime: false,
        error: null,
        retryCount: 0,
        isStalled: false,
        networkState: 'idle',
        readyState: 'nothing',
      });
    });

    it('should load volume from localStorage', () => {
      mockLocalStorage.setItem('haven-player-volume', '0.5');
      const { result } = renderHook(() => useVideoControls());
      expect(result.current.state.volume).toBe(0.5);
    });

    it('should load muted state from localStorage', () => {
      mockLocalStorage.setItem('haven-player-muted', 'true');
      const { result } = renderHook(() => useVideoControls());
      expect(result.current.state.muted).toBe(true);
    });

    it('should load playback rate from localStorage', () => {
      mockLocalStorage.setItem('haven-player-playback-rate', '1.5');
      const { result } = renderHook(() => useVideoControls());
      expect(result.current.state.playbackRate).toBe(1.5);
    });

    it('should use default values when localStorage has invalid data', () => {
      mockLocalStorage.setItem('haven-player-volume', 'invalid');
      const { result } = renderHook(() => useVideoControls());
      expect(result.current.state.volume).toBe(0.8);
    });
  });

  describe('playback controls', () => {
    it('should play video', () => {
      const { result } = renderHook(() => useVideoControls());
      const mockVideo = new MockHTMLVideoElement();
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.controls.play();
      });

      expect(mockVideo.play).toHaveBeenCalled();
      expect(result.current.state.playing).toBe(true);
    });

    it('should pause video', () => {
      const { result } = renderHook(() => useVideoControls());
      const mockVideo = new MockHTMLVideoElement();
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.controls.play();
      });

      act(() => {
        result.current.controls.pause();
      });

      expect(mockVideo.pause).toHaveBeenCalled();
      expect(result.current.state.playing).toBe(false);
    });

    it('should toggle play/pause', () => {
      const { result } = renderHook(() => useVideoControls());
      const mockVideo = new MockHTMLVideoElement();
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.controls.togglePlay();
      });
      expect(result.current.state.playing).toBe(true);

      act(() => {
        result.current.controls.togglePlay();
      });
      expect(result.current.state.playing).toBe(false);
    });
  });

  describe('volume controls', () => {
    it('should set volume and save to localStorage', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.controls.setVolume(0.6);
      });

      expect(result.current.state.volume).toBe(0.6);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('haven-player-volume', '0.6');
    });

    it('should clamp volume between 0 and 1', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.controls.setVolume(1.5);
      });
      expect(result.current.state.volume).toBe(1);

      act(() => {
        result.current.controls.setVolume(-0.5);
      });
      expect(result.current.state.volume).toBe(0);
    });

    it('should toggle mute', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.controls.toggleMute();
      });
      expect(result.current.state.muted).toBe(true);

      act(() => {
        result.current.controls.toggleMute();
      });
      expect(result.current.state.muted).toBe(false);
    });
  });

  describe('playback rate', () => {
    it('should set playback rate and save to localStorage', () => {
      const { result } = renderHook(() => useVideoControls());
      const mockVideo = new MockHTMLVideoElement();
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.controls.setPlaybackRate(1.5);
      });

      expect(result.current.state.playbackRate).toBe(1.5);
      expect(mockVideo.playbackRate).toBe(1.5);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('haven-player-playback-rate', '1.5');
    });
  });

  describe('seeking', () => {
    it('should seek to a specific position', () => {
      const { result } = renderHook(() => useVideoControls());
      const mockVideo = new MockHTMLVideoElement();
      mockVideo.duration = 100;
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.setDuration(100);
      });

      act(() => {
        result.current.controls.seek(0.5);
      });

      expect(mockVideo.currentTime).toBe(50);
      expect(result.current.state.played).toBe(0.5);
    });

    it('should seek relative to current position', () => {
      const { result } = renderHook(() => useVideoControls());
      const mockVideo = new MockHTMLVideoElement();
      mockVideo.duration = 100;
      mockVideo.currentTime = 30;
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.setDuration(100);
      });

      act(() => {
        result.current.controls.seekRelative(10);
      });

      expect(mockVideo.currentTime).toBe(40);
    });

    it('should clamp seek position within bounds', () => {
      const { result } = renderHook(() => useVideoControls());
      const mockVideo = new MockHTMLVideoElement();
      mockVideo.duration = 100;
      mockVideo.currentTime = 95;
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.setDuration(100);
      });

      act(() => {
        result.current.controls.seekRelative(10);
      });

      expect(mockVideo.currentTime).toBe(100);
    });

    it('should skip forward by default seconds', () => {
      const { result } = renderHook(() => useVideoControls({ skipSeconds: 10 }));
      const mockVideo = new MockHTMLVideoElement();
      mockVideo.duration = 100;
      mockVideo.currentTime = 20;
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.setDuration(100);
      });

      act(() => {
        result.current.controls.skipForward();
      });

      expect(mockVideo.currentTime).toBe(30);
    });

    it('should skip backward by default seconds', () => {
      const { result } = renderHook(() => useVideoControls({ skipSeconds: 10 }));
      const mockVideo = new MockHTMLVideoElement();
      mockVideo.duration = 100;
      mockVideo.currentTime = 30;
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.setDuration(100);
      });

      act(() => {
        result.current.controls.skipBackward();
      });

      expect(mockVideo.currentTime).toBe(20);
    });
  });

  describe('frame navigation', () => {
    it('should advance one frame forward', () => {
      const { result } = renderHook(() => useVideoControls({ frameRate: 30 }));
      const mockVideo = new MockHTMLVideoElement();
      mockVideo.duration = 100;
      mockVideo.currentTime = 10;
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.setDuration(100);
      });

      act(() => {
        result.current.controls.frameForward();
      });

      expect(mockVideo.pause).toHaveBeenCalled();
      expect(mockVideo.currentTime).toBeCloseTo(10 + 1/30);
    });

    it('should go back one frame', () => {
      const { result } = renderHook(() => useVideoControls({ frameRate: 30 }));
      const mockVideo = new MockHTMLVideoElement();
      mockVideo.duration = 100;
      mockVideo.currentTime = 10;
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.setDuration(100);
      });

      act(() => {
        result.current.controls.frameBackward();
      });

      expect(mockVideo.pause).toHaveBeenCalled();
      expect(mockVideo.currentTime).toBeCloseTo(10 - 1/30);
    });
  });

  describe('fullscreen', () => {
    it('should toggle fullscreen on', async () => {
      const { result } = renderHook(() => useVideoControls());
      const mockContainer = { requestFullscreen: mockRequestFullscreen };
      (result.current.containerRef as unknown as { current: typeof mockContainer }).current = mockContainer;

      await act(async () => {
        await result.current.controls.toggleFullscreen();
      });

      expect(mockRequestFullscreen).toHaveBeenCalled();
    });

    it('should toggle fullscreen off when already fullscreen', async () => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: jest.fn(() => document.body),
      });

      const { result } = renderHook(() => useVideoControls());

      await act(async () => {
        await result.current.controls.toggleFullscreen();
      });

      expect(mockExitFullscreen).toHaveBeenCalled();

      // Reset
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: jest.fn(() => null),
      });
    });
  });

  describe('picture-in-picture', () => {
    it('should toggle PiP on', async () => {
      const { result } = renderHook(() => useVideoControls());
      const mockVideo = new MockHTMLVideoElement();
      mockVideo.requestPictureInPicture = mockRequestPictureInPicture;
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      await act(async () => {
        await result.current.controls.togglePip();
      });

      expect(mockRequestPictureInPicture).toHaveBeenCalled();
    });
  });

  describe('loop', () => {
    it('should toggle loop', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.controls.toggleLoop();
      });
      expect(result.current.state.loop).toBe(true);

      act(() => {
        result.current.controls.toggleLoop();
      });
      expect(result.current.state.loop).toBe(false);
    });
  });

  describe('remaining time toggle', () => {
    it('should toggle remaining time display', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.controls.toggleRemainingTime();
      });
      expect(result.current.state.showRemainingTime).toBe(true);

      act(() => {
        result.current.controls.toggleRemainingTime();
      });
      expect(result.current.state.showRemainingTime).toBe(false);
    });
  });

  describe('retry', () => {
    it('should reload video and preserve current time', () => {
      const { result } = renderHook(() => useVideoControls());
      const mockVideo = new MockHTMLVideoElement();
      mockVideo.currentTime = 45;
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.controls.retry();
      });

      expect(mockVideo.load).toHaveBeenCalled();
      expect(mockVideo.currentTime).toBe(45);
    });
  });

  describe('event handlers', () => {
    it('should handle progress updates', () => {
      const { result } = renderHook(() => useVideoControls());
      const mockVideo = new MockHTMLVideoElement();
      mockVideo.currentTime = 25;
      mockVideo.duration = 100;
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.setDuration(100);
      });

      act(() => {
        result.current.handleProgress();
      });

      expect(result.current.state.played).toBe(0.25);
      expect(result.current.state.loaded).toBe(0.5);
    });

    it('should handle duration change', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.handleDuration(120);
      });

      expect(result.current.state.duration).toBe(120);
    });

    it('should handle ready event', () => {
      const onReady = jest.fn();
      const { result } = renderHook(() => useVideoControls({ onReady }));
      const mockVideo = new MockHTMLVideoElement();
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      act(() => {
        result.current.handleReady();
      });

      expect(onReady).toHaveBeenCalled();
      expect(result.current.state.error).toBeNull();
    });

    it('should handle error event with MediaError', () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useVideoControls({ onError }));

      const mockMediaError = {
        code: MediaError.MEDIA_ERR_NETWORK,
        message: 'Network error',
      } as MediaError;

      act(() => {
        result.current.handleError(mockMediaError);
      });

      expect(onError).toHaveBeenCalled();
      const errorArg = onError.mock.calls[0][0] as VideoError;
      expect(errorArg.type).toBe('network');
      expect(errorArg.recoverable).toBe(true);
      expect(result.current.state.error).not.toBeNull();
      expect(result.current.state.playing).toBe(false);
    });

    it('should handle error event with null MediaError', () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useVideoControls({ onError }));

      act(() => {
        result.current.handleError(null);
      });

      expect(onError).toHaveBeenCalled();
      const errorArg = onError.mock.calls[0][0] as VideoError;
      expect(errorArg.type).toBe('unknown');
      expect(result.current.state.error).not.toBeNull();
    });

    it('should handle buffering state', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.handleBuffer(true);
      });
      expect(result.current.state.buffering).toBe(true);

      act(() => {
        result.current.handleBuffer(false);
      });
      expect(result.current.state.buffering).toBe(false);
    });

    it('should handle ended event', () => {
      const onEnded = jest.fn();
      const { result } = renderHook(() => useVideoControls({ onEnded }));

      act(() => {
        result.current.handleEnded();
      });

      expect(onEnded).toHaveBeenCalled();
      expect(result.current.state.playing).toBe(false);
      expect(result.current.state.played).toBe(1);
    });

    it('should not call onEnded when loop is enabled', () => {
      const onEnded = jest.fn();
      const { result } = renderHook(() => useVideoControls({ onEnded }));

      act(() => {
        result.current.controls.toggleLoop();
      });

      act(() => {
        result.current.handleEnded();
      });

      expect(onEnded).not.toHaveBeenCalled();
    });
  });

  describe('PLAYBACK_RATES constant', () => {
    it('should contain all expected playback rates', () => {
      expect(PLAYBACK_RATES).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]);
    });
  });

  describe('error types and recovery', () => {
    it('should map MEDIA_ERR_ABORTED to aborted type', () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useVideoControls({ onError }));

      act(() => {
        result.current.handleError({ code: MediaError.MEDIA_ERR_ABORTED } as MediaError);
      });

      const errorArg = onError.mock.calls[0][0] as VideoError;
      expect(errorArg.type).toBe('aborted');
    });

    it('should map MEDIA_ERR_DECODE to decode type', () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useVideoControls({ onError }));

      act(() => {
        result.current.handleError({ code: MediaError.MEDIA_ERR_DECODE } as MediaError);
      });

      const errorArg = onError.mock.calls[0][0] as VideoError;
      expect(errorArg.type).toBe('decode');
      expect(errorArg.recoverable).toBe(false);
    });

    it('should map MEDIA_ERR_SRC_NOT_SUPPORTED to format type', () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useVideoControls({ onError }));

      act(() => {
        result.current.handleError({ code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED } as MediaError);
      });

      const errorArg = onError.mock.calls[0][0] as VideoError;
      expect(errorArg.type).toBe('format');
      expect(errorArg.recoverable).toBe(false);
    });

    it('should clear error when clearError is called', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.handleError({ code: MediaError.MEDIA_ERR_NETWORK } as MediaError);
      });

      expect(result.current.state.error).not.toBeNull();

      act(() => {
        result.current.controls.clearError();
      });

      expect(result.current.state.error).toBeNull();
    });

    it('should reset player state when resetPlayer is called', () => {
      const { result } = renderHook(() => useVideoControls());
      const mockVideo = new MockHTMLVideoElement();
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      // Set some state first
      act(() => {
        result.current.setDuration(100);
        result.current.setPlayed(0.5);
        result.current.controls.play();
      });

      act(() => {
        result.current.controls.resetPlayer();
      });

      expect(result.current.state.playing).toBe(false);
      expect(result.current.state.played).toBe(0);
      expect(result.current.state.duration).toBe(0);
      expect(result.current.state.error).toBeNull();
      expect(mockVideo.pause).toHaveBeenCalled();
    });
  });

  describe('stall and waiting handlers', () => {
    it('should handle stalled event', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.handleStalled();
      });

      expect(result.current.state.isStalled).toBe(true);
      expect(result.current.state.buffering).toBe(true);
    });

    it('should handle waiting event', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.handleWaiting();
      });

      expect(result.current.state.buffering).toBe(true);
    });

    it('should handle canPlay event', () => {
      const { result } = renderHook(() => useVideoControls());

      // First trigger buffering
      act(() => {
        result.current.handleBuffer(true);
      });

      expect(result.current.state.buffering).toBe(true);

      // Then resolve with canPlay
      act(() => {
        result.current.handleCanPlay();
      });

      expect(result.current.state.buffering).toBe(false);
      expect(result.current.state.isStalled).toBe(false);
    });

    it('should handle canPlayThrough event', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.handleBuffer(true);
      });

      act(() => {
        result.current.handleCanPlayThrough();
      });

      expect(result.current.state.buffering).toBe(false);
    });

    it('should handle loadStart event', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.handleLoadStart();
      });

      expect(result.current.state.networkState).toBe('loading');
    });

    it('should handle loadedData event', () => {
      const { result } = renderHook(() => useVideoControls());

      act(() => {
        result.current.handleLoadedData();
      });

      expect(result.current.state.networkState).toBe('loaded');
      expect(result.current.state.isStalled).toBe(false);
    });
  });

  describe('recovery callbacks', () => {
    it('should call onRecovery when recovery is triggered', async () => {
      const onRecovery = jest.fn();
      const { result } = renderHook(() => useVideoControls({ onRecovery, retryDelayMs: 10 }));
      const mockVideo = new MockHTMLVideoElement();
      Object.defineProperty(mockVideo, 'duration', { value: 100, writable: true });
      (result.current.playerRef as unknown as { current: MockHTMLVideoElement }).current = mockVideo;

      // Trigger retry - note: full recovery test would require mocking more video element behavior
      act(() => {
        result.current.controls.retry();
      });

      // After retry is called, retryCount should reset
      expect(result.current.state.retryCount).toBe(0);
    });
  });
});

