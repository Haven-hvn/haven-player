import { useEffect, useCallback, useState } from 'react';
import type { VideoControls, VideoState } from './useVideoControls';

export interface KeyboardShortcut {
  key: string;
  description: string;
  category: 'playback' | 'volume' | 'navigation' | 'display';
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'Space / K', description: 'Play / Pause', category: 'playback' },
  { key: '←', description: 'Rewind 10 seconds', category: 'navigation' },
  { key: '→', description: 'Forward 10 seconds', category: 'navigation' },
  { key: 'J', description: 'Rewind 10 seconds', category: 'navigation' },
  { key: 'L', description: 'Forward 10 seconds', category: 'navigation' },
  { key: ', (comma)', description: 'Previous frame', category: 'navigation' },
  { key: '. (period)', description: 'Next frame', category: 'navigation' },
  { key: 'Home', description: 'Go to start', category: 'navigation' },
  { key: 'End', description: 'Go to end', category: 'navigation' },
  { key: '0-9', description: 'Seek to 0%-90%', category: 'navigation' },
  { key: '↑', description: 'Volume up 5%', category: 'volume' },
  { key: '↓', description: 'Volume down 5%', category: 'volume' },
  { key: 'M', description: 'Toggle mute', category: 'volume' },
  { key: 'F', description: 'Toggle fullscreen', category: 'display' },
  { key: 'P', description: 'Toggle picture-in-picture', category: 'display' },
  { key: 'O', description: 'Toggle loop', category: 'playback' },
  { key: '< / >', description: 'Decrease / Increase speed', category: 'playback' },
  { key: '?', description: 'Show shortcuts', category: 'display' },
  { key: 'Escape', description: 'Exit fullscreen / Close overlay', category: 'display' },
];

export interface UseKeyboardShortcutsOptions {
  controls: VideoControls;
  state: VideoState;
  enabled?: boolean;
  skipSeconds?: number;
  volumeStep?: number;
  onShowShortcuts?: () => void;
  onHideShortcuts?: () => void;
}

export interface UseKeyboardShortcutsReturn {
  showShortcuts: boolean;
  toggleShortcuts: () => void;
}

export const useKeyboardShortcuts = (
  options: UseKeyboardShortcutsOptions
): UseKeyboardShortcutsReturn => {
  const {
    controls,
    state,
    enabled = true,
    skipSeconds = 10,
    volumeStep = 0.05,
    onShowShortcuts,
    onHideShortcuts,
  } = options;

  const [showShortcuts, setShowShortcuts] = useState(false);

  const toggleShortcuts = useCallback(() => {
    setShowShortcuts((prev) => {
      const next = !prev;
      if (next) {
        onShowShortcuts?.();
      } else {
        onHideShortcuts?.();
      }
      return next;
    });
  }, [onShowShortcuts, onHideShortcuts]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't handle shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const shiftKey = event.shiftKey;

      switch (key) {
        case ' ':
        case 'k':
          event.preventDefault();
          controls.togglePlay();
          break;

        case 'arrowleft':
        case 'j':
          event.preventDefault();
          controls.seekRelative(-skipSeconds);
          break;

        case 'arrowright':
        case 'l':
          event.preventDefault();
          controls.seekRelative(skipSeconds);
          break;

        case 'arrowup':
          event.preventDefault();
          controls.setVolume(state.volume + volumeStep);
          break;

        case 'arrowdown':
          event.preventDefault();
          controls.setVolume(state.volume - volumeStep);
          break;

        case 'm':
          event.preventDefault();
          controls.toggleMute();
          break;

        case 'f':
          event.preventDefault();
          controls.toggleFullscreen();
          break;

        case 'p':
          event.preventDefault();
          controls.togglePip();
          break;

        case 'o':
          event.preventDefault();
          controls.toggleLoop();
          break;

        case ',':
          event.preventDefault();
          controls.frameBackward();
          break;

        case '.':
          event.preventDefault();
          controls.frameForward();
          break;

        case '<':
          event.preventDefault();
          const currentIndexDown = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].indexOf(state.playbackRate);
          if (currentIndexDown > 0) {
            controls.setPlaybackRate([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3][currentIndexDown - 1]);
          }
          break;

        case '>':
          event.preventDefault();
          const currentIndexUp = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].indexOf(state.playbackRate);
          if (currentIndexUp < 9) {
            controls.setPlaybackRate([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3][currentIndexUp + 1]);
          }
          break;

        case 'home':
          event.preventDefault();
          controls.seek(0);
          break;

        case 'end':
          event.preventDefault();
          controls.seek(0.999);
          break;

        case '?':
          event.preventDefault();
          toggleShortcuts();
          break;

        case 'escape':
          event.preventDefault();
          if (showShortcuts) {
            setShowShortcuts(false);
            onHideShortcuts?.();
          } else if (state.fullscreen) {
            controls.toggleFullscreen();
          }
          break;

        // Number keys for percentage seeking
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          if (!shiftKey) {
            event.preventDefault();
            controls.seek(parseInt(key, 10) / 10);
          }
          break;
      }
    },
    [
      enabled,
      controls,
      state.volume,
      state.playbackRate,
      state.fullscreen,
      skipSeconds,
      volumeStep,
      showShortcuts,
      toggleShortcuts,
      onHideShortcuts,
    ]
  );

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [enabled, handleKeyDown]);

  return {
    showShortcuts,
    toggleShortcuts,
  };
};

export default useKeyboardShortcuts;

