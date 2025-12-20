/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from '../useKeyboardShortcuts';
import type { VideoControls, VideoState } from '../useVideoControls';

describe('useKeyboardShortcuts', () => {
  const mockControls: VideoControls = {
    play: jest.fn(),
    pause: jest.fn(),
    togglePlay: jest.fn(),
    setVolume: jest.fn(),
    toggleMute: jest.fn(),
    setPlaybackRate: jest.fn(),
    seek: jest.fn(),
    seekRelative: jest.fn(),
    toggleFullscreen: jest.fn(),
    togglePip: jest.fn(),
    toggleLoop: jest.fn(),
    toggleRemainingTime: jest.fn(),
    skipForward: jest.fn(),
    skipBackward: jest.fn(),
    frameForward: jest.fn(),
    frameBackward: jest.fn(),
    retry: jest.fn(),
    clearError: jest.fn(),
    resetPlayer: jest.fn(),
  };

  const defaultState: VideoState = {
    playing: false,
    muted: false,
    volume: 0.8,
    playbackRate: 1,
    played: 0,
    loaded: 0,
    duration: 100,
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
  };

  const dispatchKeyEvent = (key: string, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', {
      key,
      shiftKey,
      bubbles: true,
    });
    window.dispatchEvent(event);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with shortcuts hidden', () => {
      const { result } = renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      expect(result.current.showShortcuts).toBe(false);
    });
  });

  describe('shortcut toggle', () => {
    it('should toggle shortcuts visibility', () => {
      const onShowShortcuts = jest.fn();
      const onHideShortcuts = jest.fn();

      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          controls: mockControls,
          state: defaultState,
          onShowShortcuts,
          onHideShortcuts,
        })
      );

      act(() => {
        result.current.toggleShortcuts();
      });

      expect(result.current.showShortcuts).toBe(true);
      expect(onShowShortcuts).toHaveBeenCalled();

      act(() => {
        result.current.toggleShortcuts();
      });

      expect(result.current.showShortcuts).toBe(false);
      expect(onHideShortcuts).toHaveBeenCalled();
    });

    it('should toggle shortcuts with ? key', () => {
      const { result } = renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      act(() => {
        dispatchKeyEvent('?');
      });

      expect(result.current.showShortcuts).toBe(true);
    });
  });

  describe('playback shortcuts', () => {
    it('should toggle play with Space', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      act(() => {
        dispatchKeyEvent(' ');
      });

      expect(mockControls.togglePlay).toHaveBeenCalled();
    });

    it('should toggle play with K', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      act(() => {
        dispatchKeyEvent('k');
      });

      expect(mockControls.togglePlay).toHaveBeenCalled();
    });

    it('should toggle loop with O', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      act(() => {
        dispatchKeyEvent('o');
      });

      expect(mockControls.toggleLoop).toHaveBeenCalled();
    });
  });

  describe('navigation shortcuts', () => {
    it('should seek backward with ArrowLeft', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState, skipSeconds: 10 })
      );

      act(() => {
        dispatchKeyEvent('ArrowLeft');
      });

      expect(mockControls.seekRelative).toHaveBeenCalledWith(-10);
    });

    it('should seek forward with ArrowRight', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState, skipSeconds: 10 })
      );

      act(() => {
        dispatchKeyEvent('ArrowRight');
      });

      expect(mockControls.seekRelative).toHaveBeenCalledWith(10);
    });

    it('should seek backward with J', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState, skipSeconds: 10 })
      );

      act(() => {
        dispatchKeyEvent('j');
      });

      expect(mockControls.seekRelative).toHaveBeenCalledWith(-10);
    });

    it('should seek forward with L', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState, skipSeconds: 10 })
      );

      act(() => {
        dispatchKeyEvent('l');
      });

      expect(mockControls.seekRelative).toHaveBeenCalledWith(10);
    });

    it('should go to frame forward with .', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      act(() => {
        dispatchKeyEvent('.');
      });

      expect(mockControls.frameForward).toHaveBeenCalled();
    });

    it('should go to frame backward with ,', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      act(() => {
        dispatchKeyEvent(',');
      });

      expect(mockControls.frameBackward).toHaveBeenCalled();
    });

    it('should seek to start with Home', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      act(() => {
        dispatchKeyEvent('Home');
      });

      expect(mockControls.seek).toHaveBeenCalledWith(0);
    });

    it('should seek to end with End', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      act(() => {
        dispatchKeyEvent('End');
      });

      expect(mockControls.seek).toHaveBeenCalledWith(0.999);
    });

    it.each(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])(
      'should seek to %s0%% with number key %s',
      (key) => {
        renderHook(() =>
          useKeyboardShortcuts({ controls: mockControls, state: defaultState })
        );

        act(() => {
          dispatchKeyEvent(key);
        });

        expect(mockControls.seek).toHaveBeenCalledWith(parseInt(key, 10) / 10);
      }
    );
  });

  describe('volume shortcuts', () => {
    it('should increase volume with ArrowUp', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState, volumeStep: 0.05 })
      );

      act(() => {
        dispatchKeyEvent('ArrowUp');
      });

      expect(mockControls.setVolume).toHaveBeenCalledWith(0.85);
    });

    it('should decrease volume with ArrowDown', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState, volumeStep: 0.05 })
      );

      act(() => {
        dispatchKeyEvent('ArrowDown');
      });

      expect(mockControls.setVolume).toHaveBeenCalledWith(0.75);
    });

    it('should toggle mute with M', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      act(() => {
        dispatchKeyEvent('m');
      });

      expect(mockControls.toggleMute).toHaveBeenCalled();
    });
  });

  describe('display shortcuts', () => {
    it('should toggle fullscreen with F', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      act(() => {
        dispatchKeyEvent('f');
      });

      expect(mockControls.toggleFullscreen).toHaveBeenCalled();
    });

    it('should toggle PiP with P', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      act(() => {
        dispatchKeyEvent('p');
      });

      expect(mockControls.togglePip).toHaveBeenCalled();
    });

    it('should close shortcuts overlay with Escape', () => {
      const onHideShortcuts = jest.fn();
      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          controls: mockControls,
          state: defaultState,
          onHideShortcuts,
        })
      );

      // First show shortcuts
      act(() => {
        result.current.toggleShortcuts();
      });

      expect(result.current.showShortcuts).toBe(true);

      // Then press Escape
      act(() => {
        dispatchKeyEvent('Escape');
      });

      expect(result.current.showShortcuts).toBe(false);
      expect(onHideShortcuts).toHaveBeenCalled();
    });

    it('should exit fullscreen with Escape when not showing shortcuts', () => {
      const fullscreenState: VideoState = { ...defaultState, fullscreen: true };

      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: fullscreenState })
      );

      act(() => {
        dispatchKeyEvent('Escape');
      });

      expect(mockControls.toggleFullscreen).toHaveBeenCalled();
    });
  });

  describe('playback speed shortcuts', () => {
    it('should decrease playback rate with <', () => {
      const stateWith1x: VideoState = { ...defaultState, playbackRate: 1 };

      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: stateWith1x })
      );

      act(() => {
        dispatchKeyEvent('<');
      });

      expect(mockControls.setPlaybackRate).toHaveBeenCalledWith(0.75);
    });

    it('should increase playback rate with >', () => {
      const stateWith1x: VideoState = { ...defaultState, playbackRate: 1 };

      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: stateWith1x })
      );

      act(() => {
        dispatchKeyEvent('>');
      });

      expect(mockControls.setPlaybackRate).toHaveBeenCalledWith(1.25);
    });

    it('should not decrease below minimum playback rate', () => {
      const stateWith025x: VideoState = { ...defaultState, playbackRate: 0.25 };

      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: stateWith025x })
      );

      act(() => {
        dispatchKeyEvent('<');
      });

      expect(mockControls.setPlaybackRate).not.toHaveBeenCalled();
    });

    it('should not increase above maximum playback rate', () => {
      const stateWith3x: VideoState = { ...defaultState, playbackRate: 3 };

      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: stateWith3x })
      );

      act(() => {
        dispatchKeyEvent('>');
      });

      expect(mockControls.setPlaybackRate).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('should not handle shortcuts when disabled', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState, enabled: false })
      );

      act(() => {
        dispatchKeyEvent(' ');
      });

      expect(mockControls.togglePlay).not.toHaveBeenCalled();
    });
  });

  describe('input element filtering', () => {
    it('should not handle shortcuts when typing in input', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      window.dispatchEvent(event);

      expect(mockControls.togglePlay).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('should not handle shortcuts when typing in textarea', () => {
      renderHook(() =>
        useKeyboardShortcuts({ controls: mockControls, state: defaultState })
      );

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const event = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: textarea });
      window.dispatchEvent(event);

      expect(mockControls.togglePlay).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });
  });

  describe('KEYBOARD_SHORTCUTS constant', () => {
    it('should contain all expected shortcuts', () => {
      expect(KEYBOARD_SHORTCUTS.length).toBeGreaterThan(0);

      const playbackShortcuts = KEYBOARD_SHORTCUTS.filter((s) => s.category === 'playback');
      const navigationShortcuts = KEYBOARD_SHORTCUTS.filter((s) => s.category === 'navigation');
      const volumeShortcuts = KEYBOARD_SHORTCUTS.filter((s) => s.category === 'volume');
      const displayShortcuts = KEYBOARD_SHORTCUTS.filter((s) => s.category === 'display');

      expect(playbackShortcuts.length).toBeGreaterThan(0);
      expect(navigationShortcuts.length).toBeGreaterThan(0);
      expect(volumeShortcuts.length).toBeGreaterThan(0);
      expect(displayShortcuts.length).toBeGreaterThan(0);
    });

    it('should have valid structure for each shortcut', () => {
      KEYBOARD_SHORTCUTS.forEach((shortcut) => {
        expect(shortcut).toHaveProperty('key');
        expect(shortcut).toHaveProperty('description');
        expect(shortcut).toHaveProperty('category');
        expect(typeof shortcut.key).toBe('string');
        expect(typeof shortcut.description).toBe('string');
        expect(['playback', 'navigation', 'volume', 'display']).toContain(shortcut.category);
      });
    });
  });
});

