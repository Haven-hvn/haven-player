import { useState, useCallback, useRef, useEffect } from 'react';

export interface VideoState {
  playing: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  played: number;
  loaded: number;
  duration: number;
  seeking: boolean;
  buffering: boolean;
  fullscreen: boolean;
  pip: boolean;
  loop: boolean;
  showRemainingTime: boolean;
  error: VideoError | null;
  retryCount: number;
  isStalled: boolean;
  networkState: NetworkState;
  readyState: ReadyState;
}

export type NetworkState = 'idle' | 'loading' | 'loaded' | 'no-source';
export type ReadyState = 'nothing' | 'metadata' | 'current-data' | 'future-data' | 'enough-data';

export interface VideoError {
  type: VideoErrorType;
  message: string;
  code?: number;
  recoverable: boolean;
  timestamp: number;
}

export type VideoErrorType = 
  | 'network'
  | 'decode'
  | 'format'
  | 'source'
  | 'aborted'
  | 'stall'
  | 'timeout'
  | 'unknown';

export interface VideoControls {
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  seek: (fraction: number) => void;
  seekRelative: (seconds: number) => void;
  toggleFullscreen: () => void;
  togglePip: () => void;
  toggleLoop: () => void;
  toggleRemainingTime: () => void;
  skipForward: () => void;
  skipBackward: () => void;
  frameForward: () => void;
  frameBackward: () => void;
  retry: () => void;
  clearError: () => void;
  resetPlayer: () => void;
}

export interface UseVideoControlsOptions {
  skipSeconds?: number;
  frameRate?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  stallTimeoutMs?: number;
  loadTimeoutMs?: number;
  onReady?: () => void;
  onError?: (error: VideoError) => void;
  onEnded?: () => void;
  onRecovery?: () => void;
  onSourceFallback?: () => void;
}

export interface UseVideoControlsReturn {
  state: VideoState;
  controls: VideoControls;
  playerRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleProgress: () => void;
  handleDuration: (duration: number) => void;
  handleReady: () => void;
  handleError: (error: MediaError | null, additionalInfo?: string) => void;
  handleBuffer: (buffering: boolean) => void;
  handleEnded: () => void;
  handleStalled: () => void;
  handleWaiting: () => void;
  handleCanPlay: () => void;
  handleCanPlayThrough: () => void;
  handleLoadStart: () => void;
  handleLoadedData: () => void;
  handleSuspend: () => void;
  handleAbort: () => void;
  setPlayed: (played: number) => void;
  setDuration: (duration: number) => void;
  isRecovering: boolean;
}

const VOLUME_STORAGE_KEY = 'haven-player-volume';
const MUTED_STORAGE_KEY = 'haven-player-muted';
const PLAYBACK_RATE_STORAGE_KEY = 'haven-player-playback-rate';

const loadFromStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      return JSON.parse(stored) as T;
    }
  } catch {
    // Ignore storage errors
  }
  return defaultValue;
};

const saveToStorage = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
};

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

// Map MediaError codes to our error types
const mapMediaErrorCode = (code: number): VideoErrorType => {
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'aborted';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'network';
    case MediaError.MEDIA_ERR_DECODE:
      return 'decode';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'format';
    default:
      return 'unknown';
  }
};

// Get human-readable error message
const getErrorMessage = (type: VideoErrorType, code?: number): string => {
  switch (type) {
    case 'aborted':
      return 'Video playback was cancelled. This may be due to a user action or system interruption.';
    case 'network':
      return 'A network error occurred while loading the video. Please check your connection and try again.';
    case 'decode':
      return 'The video could not be decoded. The file may be corrupted or use an unsupported codec.';
    case 'format':
      return 'This video format is not supported. Try converting to MP4 (H.264) or WebM.';
    case 'source':
      return 'The video source could not be found or accessed. The file may have been moved or deleted.';
    case 'stall':
      return 'Video playback stalled due to slow loading. Buffering more data...';
    case 'timeout':
      return 'Video loading timed out. The server may be slow or unreachable.';
    default:
      return `An unexpected error occurred (code: ${code ?? 'unknown'}). Please try again.`;
  }
};

// Determine if error is recoverable
const isRecoverableError = (type: VideoErrorType): boolean => {
  return ['network', 'stall', 'timeout', 'aborted'].includes(type);
};

// Calculate retry delay with exponential backoff
const calculateRetryDelay = (retryCount: number, baseDelay: number): number => {
  return Math.min(baseDelay * Math.pow(2, retryCount), 30000); // Max 30 seconds
};

export const useVideoControls = (
  options: UseVideoControlsOptions = {}
): UseVideoControlsReturn => {
  const {
    skipSeconds = 10,
    frameRate = 30,
    maxRetries = 5,
    retryDelayMs = 1000,
    stallTimeoutMs = 10000,
    loadTimeoutMs = 30000,
    onReady,
    onError,
    onEnded,
    onRecovery,
    onSourceFallback,
  } = options;

  const playerRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressTimeRef = useRef<number>(0);
  const savedTimeRef = useRef<number>(0);
  const isRecoveringRef = useRef<boolean>(false);

  const [state, setState] = useState<VideoState>({
    playing: false,
    muted: loadFromStorage(MUTED_STORAGE_KEY, false),
    volume: loadFromStorage(VOLUME_STORAGE_KEY, 0.8),
    playbackRate: loadFromStorage(PLAYBACK_RATE_STORAGE_KEY, 1),
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

  // Cleanup all timeouts
  const clearAllTimeouts = useCallback(() => {
    if (stallTimeoutRef.current) {
      clearTimeout(stallTimeoutRef.current);
      stallTimeoutRef.current = null;
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, [clearAllTimeouts]);

  // Sync volume and playback rate to video element
  useEffect(() => {
    const video = playerRef.current;
    if (video) {
      video.volume = state.volume;
      video.muted = state.muted;
      video.playbackRate = state.playbackRate;
      video.loop = state.loop;
    }
  }, [state.volume, state.muted, state.playbackRate, state.loop]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      setState((prev) => ({ ...prev, fullscreen: isFullscreen }));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handle PiP changes
  useEffect(() => {
    const handlePipChange = () => {
      const isPip = document.pictureInPictureElement !== null;
      setState((prev) => ({ ...prev, pip: isPip }));
    };

    document.addEventListener('enterpictureinpicture', handlePipChange);
    document.addEventListener('leavepictureinpicture', handlePipChange);
    return () => {
      document.removeEventListener('enterpictureinpicture', handlePipChange);
      document.removeEventListener('leavepictureinpicture', handlePipChange);
    };
  }, []);

  // Stall detection - monitor for playback progress
  useEffect(() => {
    if (state.playing && !state.buffering && !state.error && !state.isStalled) {
      const checkInterval = setInterval(() => {
        const video = playerRef.current;
        if (video && state.playing) {
          const currentProgress = video.currentTime;
          if (currentProgress === lastProgressTimeRef.current && !video.paused && !video.ended) {
            // No progress in the last check interval - might be stalled
            setState((prev) => ({ ...prev, isStalled: true }));
            console.warn('[VideoControls] Playback appears stalled, no progress detected');
          }
          lastProgressTimeRef.current = currentProgress;
        }
      }, 2000);

      return () => clearInterval(checkInterval);
    }
  }, [state.playing, state.buffering, state.error, state.isStalled]);

  // Create error object
  const createError = useCallback((type: VideoErrorType, code?: number, customMessage?: string): VideoError => {
    return {
      type,
      message: customMessage || getErrorMessage(type, code),
      code,
      recoverable: isRecoverableError(type),
      timestamp: Date.now(),
    };
  }, []);

  // Attempt automatic recovery
  const attemptRecovery = useCallback(async () => {
    const video = playerRef.current;
    if (!video || state.retryCount >= maxRetries) {
      console.error('[VideoControls] Max retries reached, cannot recover');
      return false;
    }

    isRecoveringRef.current = true;
    const delay = calculateRetryDelay(state.retryCount, retryDelayMs);
    
    console.log(`[VideoControls] Attempting recovery (attempt ${state.retryCount + 1}/${maxRetries}) in ${delay}ms`);

    return new Promise<boolean>((resolve) => {
      retryTimeoutRef.current = setTimeout(async () => {
        try {
          savedTimeRef.current = video.currentTime;
          
          // Reset video element state
          video.pause();
          
          // Force reload
          const currentSrc = video.src;
          video.src = '';
          video.load();
          
          // Small delay to ensure clean state
          await new Promise(r => setTimeout(r, 100));
          
          video.src = currentSrc;
          video.load();

          // Wait for loadeddata event
          const loadedPromise = new Promise<void>((res, rej) => {
            const timeoutId = setTimeout(() => {
              video.removeEventListener('loadeddata', onLoaded);
              video.removeEventListener('error', onErr);
              rej(new Error('Load timeout'));
            }, loadTimeoutMs);

            const onLoaded = () => {
              clearTimeout(timeoutId);
              video.removeEventListener('error', onErr);
              res();
            };

            const onErr = () => {
              clearTimeout(timeoutId);
              video.removeEventListener('loadeddata', onLoaded);
              rej(new Error('Load error'));
            };

            video.addEventListener('loadeddata', onLoaded, { once: true });
            video.addEventListener('error', onErr, { once: true });
          });

          await loadedPromise;

          // Restore playback position
          if (savedTimeRef.current > 0 && savedTimeRef.current < video.duration) {
            video.currentTime = savedTimeRef.current;
          }

          // Restore playing state
          if (state.playing) {
            await video.play();
          }

          setState((prev) => ({
            ...prev,
            error: null,
            isStalled: false,
            retryCount: 0,
            buffering: false,
          }));

          isRecoveringRef.current = false;
          onRecovery?.();
          console.log('[VideoControls] Recovery successful');
          resolve(true);
        } catch (err) {
          console.error('[VideoControls] Recovery attempt failed:', err);
          setState((prev) => ({
            ...prev,
            retryCount: prev.retryCount + 1,
          }));
          isRecoveringRef.current = false;
          resolve(false);
        }
      }, delay);
    });
  }, [state.retryCount, state.playing, maxRetries, retryDelayMs, loadTimeoutMs, onRecovery]);

  const play = useCallback(async () => {
    const video = playerRef.current;
    if (!video) return;

    try {
      await video.play();
      setState((prev) => ({ ...prev, playing: true, error: null }));
    } catch (err) {
      const error = err as Error;
      console.error('[VideoControls] Play error:', error.name, error.message);
      
      // Handle specific play errors
      if (error.name === 'NotAllowedError') {
        // Autoplay was prevented - this is expected, not an error
        setState((prev) => ({ ...prev, playing: false }));
      } else if (error.name === 'NotSupportedError') {
        const videoError = createError('format', undefined, 'This video format cannot be played.');
        setState((prev) => ({ ...prev, error: videoError, playing: false }));
        onError?.(videoError);
      } else if (error.name === 'AbortError') {
        // Play was interrupted by a pause or load - not an error
        setState((prev) => ({ ...prev, playing: false }));
      } else {
        const videoError = createError('unknown', undefined, error.message);
        setState((prev) => ({ ...prev, error: videoError, playing: false }));
        onError?.(videoError);
      }
    }
  }, [createError, onError]);

  const pause = useCallback(() => {
    const video = playerRef.current;
    if (video) {
      video.pause();
      setState((prev) => ({ ...prev, playing: false }));
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (state.playing) {
      pause();
    } else {
      play();
    }
  }, [state.playing, play, pause]);

  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setState((prev) => ({ ...prev, volume: clampedVolume }));
    saveToStorage(VOLUME_STORAGE_KEY, clampedVolume);
  }, []);

  const toggleMute = useCallback(() => {
    setState((prev) => {
      const newMuted = !prev.muted;
      saveToStorage(MUTED_STORAGE_KEY, newMuted);
      return { ...prev, muted: newMuted };
    });
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const video = playerRef.current;
    if (video) {
      video.playbackRate = rate;
    }
    setState((prev) => ({ ...prev, playbackRate: rate }));
    saveToStorage(PLAYBACK_RATE_STORAGE_KEY, rate);
  }, []);

  const seek = useCallback((fraction: number) => {
    const video = playerRef.current;
    if (video && state.duration > 0) {
      const clampedFraction = Math.max(0, Math.min(1, fraction));
      try {
        video.currentTime = clampedFraction * state.duration;
        setState((prev) => ({ ...prev, played: clampedFraction, seeking: false }));
      } catch (err) {
        console.error('[VideoControls] Seek error:', err);
        // Seek errors are usually recoverable
      }
    }
  }, [state.duration]);

  const seekRelative = useCallback((seconds: number) => {
    const video = playerRef.current;
    if (video && state.duration > 0) {
      const newTime = Math.max(0, Math.min(state.duration, video.currentTime + seconds));
      try {
        video.currentTime = newTime;
        setState((prev) => ({ ...prev, played: newTime / state.duration }));
      } catch (err) {
        console.error('[VideoControls] Seek relative error:', err);
      }
    }
  }, [state.duration]);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (err) {
      console.error('[VideoControls] Fullscreen error:', err);
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = playerRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.error('[VideoControls] PiP error:', err);
    }
  }, []);

  const toggleLoop = useCallback(() => {
    setState((prev) => ({ ...prev, loop: !prev.loop }));
  }, []);

  const toggleRemainingTime = useCallback(() => {
    setState((prev) => ({ ...prev, showRemainingTime: !prev.showRemainingTime }));
  }, []);

  const skipForward = useCallback(() => {
    seekRelative(skipSeconds);
  }, [seekRelative, skipSeconds]);

  const skipBackward = useCallback(() => {
    seekRelative(-skipSeconds);
  }, [seekRelative, skipSeconds]);

  const frameForward = useCallback(() => {
    const video = playerRef.current;
    if (video) {
      video.pause();
      video.currentTime += 1 / frameRate;
      setState((prev) => ({ 
        ...prev, 
        playing: false,
        played: state.duration > 0 ? video.currentTime / state.duration : 0 
      }));
    }
  }, [frameRate, state.duration]);

  const frameBackward = useCallback(() => {
    const video = playerRef.current;
    if (video) {
      video.pause();
      video.currentTime -= 1 / frameRate;
      setState((prev) => ({ 
        ...prev, 
        playing: false,
        played: state.duration > 0 ? video.currentTime / state.duration : 0 
      }));
    }
  }, [frameRate, state.duration]);

  const retry = useCallback(() => {
    clearAllTimeouts();
    setState((prev) => ({
      ...prev,
      error: null,
      retryCount: 0,
      isStalled: false,
    }));
    attemptRecovery();
  }, [attemptRecovery, clearAllTimeouts]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const resetPlayer = useCallback(() => {
    clearAllTimeouts();
    setState((prev) => ({
      ...prev,
      playing: false,
      played: 0,
      loaded: 0,
      duration: 0,
      buffering: false,
      error: null,
      retryCount: 0,
      isStalled: false,
      networkState: 'idle',
      readyState: 'nothing',
    }));
    
    const video = playerRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  }, [clearAllTimeouts]);

  // Event handlers
  const handleProgress = useCallback(() => {
    const video = playerRef.current;
    if (video && state.duration > 0 && !state.seeking) {
      const played = video.currentTime / state.duration;
      let loaded = 0;
      if (video.buffered.length > 0) {
        loaded = video.buffered.end(video.buffered.length - 1) / state.duration;
      }
      
      // Update network and ready state
      const networkState: NetworkState = ['idle', 'loading', 'loaded', 'no-source'][video.networkState] as NetworkState;
      const readyState: ReadyState = ['nothing', 'metadata', 'current-data', 'future-data', 'enough-data'][video.readyState] as ReadyState;
      
      setState((prev) => ({ 
        ...prev, 
        played, 
        loaded,
        networkState,
        readyState,
        isStalled: false, // Progress means not stalled
      }));
      
      lastProgressTimeRef.current = video.currentTime;
    }
  }, [state.duration, state.seeking]);

  const handleDuration = useCallback((duration: number) => {
    setState((prev) => ({ ...prev, duration }));
  }, []);

  const handleReady = useCallback(() => {
    const video = playerRef.current;
    if (video) {
      video.volume = state.volume;
      video.muted = state.muted;
      video.playbackRate = state.playbackRate;
    }
    
    clearAllTimeouts();
    setState((prev) => ({ 
      ...prev, 
      error: null, 
      buffering: false,
      retryCount: 0,
      isStalled: false,
    }));
    onReady?.();
  }, [state.volume, state.muted, state.playbackRate, onReady, clearAllTimeouts]);

  const handleError = useCallback((mediaError: MediaError | null, additionalInfo?: string) => {
    if (!mediaError && !additionalInfo) {
      // No error info available
      const error = createError('unknown');
      setState((prev) => ({ ...prev, error, playing: false, buffering: false }));
      onError?.(error);
      return;
    }

    const errorType = mediaError ? mapMediaErrorCode(mediaError.code) : 'unknown';
    const error = createError(errorType, mediaError?.code, additionalInfo);
    
    console.error('[VideoControls] Media error:', error);
    
    setState((prev) => ({ 
      ...prev, 
      error, 
      playing: false, 
      buffering: false,
      isStalled: false,
    }));
    
    onError?.(error);

    // Attempt automatic recovery for recoverable errors
    if (error.recoverable && state.retryCount < maxRetries) {
      console.log('[VideoControls] Error is recoverable, will attempt recovery');
      attemptRecovery();
    }
  }, [createError, onError, state.retryCount, maxRetries, attemptRecovery]);

  const handleBuffer = useCallback((buffering: boolean) => {
    setState((prev) => ({ ...prev, buffering }));
    
    if (buffering) {
      // Set up stall timeout
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
      }
      stallTimeoutRef.current = setTimeout(() => {
        console.warn('[VideoControls] Buffering timeout - video may be stalled');
        const error = createError('stall');
        setState((prev) => ({ 
          ...prev, 
          isStalled: true,
          error: prev.retryCount < maxRetries ? null : error,
        }));
        
        if (state.retryCount < maxRetries) {
          attemptRecovery();
        } else {
          onError?.(error);
        }
      }, stallTimeoutMs);
    } else {
      // Clear stall timeout when buffering ends
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = null;
      }
    }
  }, [createError, stallTimeoutMs, state.retryCount, maxRetries, attemptRecovery, onError]);

  const handleEnded = useCallback(() => {
    if (!state.loop) {
      setState((prev) => ({ ...prev, playing: false, played: 1 }));
      onEnded?.();
    }
  }, [state.loop, onEnded]);

  const handleStalled = useCallback(() => {
    console.warn('[VideoControls] Video stalled event');
    setState((prev) => ({ ...prev, isStalled: true, buffering: true }));
  }, []);

  const handleWaiting = useCallback(() => {
    console.log('[VideoControls] Video waiting for data');
    handleBuffer(true);
  }, [handleBuffer]);

  const handleCanPlay = useCallback(() => {
    console.log('[VideoControls] Video can play');
    handleBuffer(false);
    setState((prev) => ({ ...prev, isStalled: false }));
  }, [handleBuffer]);

  const handleCanPlayThrough = useCallback(() => {
    console.log('[VideoControls] Video can play through');
    handleBuffer(false);
    setState((prev) => ({ ...prev, isStalled: false }));
  }, [handleBuffer]);

  const handleLoadStart = useCallback(() => {
    console.log('[VideoControls] Load started');
    setState((prev) => ({ ...prev, networkState: 'loading' }));
    
    // Set up load timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    loadTimeoutRef.current = setTimeout(() => {
      console.warn('[VideoControls] Load timeout');
      const error = createError('timeout');
      if (state.retryCount < maxRetries) {
        attemptRecovery();
      } else {
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
      }
    }, loadTimeoutMs);
  }, [createError, loadTimeoutMs, state.retryCount, maxRetries, attemptRecovery, onError]);

  const handleLoadedData = useCallback(() => {
    console.log('[VideoControls] Data loaded');
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    setState((prev) => ({ 
      ...prev, 
      networkState: 'loaded',
      isStalled: false,
    }));
  }, []);

  const handleSuspend = useCallback(() => {
    console.log('[VideoControls] Download suspended');
    // Normal behavior when browser has enough data buffered
  }, []);

  const handleAbort = useCallback(() => {
    console.warn('[VideoControls] Load aborted');
    // Don't treat as error if we're recovering
    if (!isRecoveringRef.current) {
      const error = createError('aborted');
      setState((prev) => ({ ...prev, error }));
      onError?.(error);
    }
  }, [createError, onError]);

  const setPlayed = useCallback((played: number) => {
    setState((prev) => ({ ...prev, played }));
  }, []);

  const setDuration = useCallback((duration: number) => {
    setState((prev) => ({ ...prev, duration }));
  }, []);

  const controls: VideoControls = {
    play,
    pause,
    togglePlay,
    setVolume,
    toggleMute,
    setPlaybackRate,
    seek,
    seekRelative,
    toggleFullscreen,
    togglePip,
    toggleLoop,
    toggleRemainingTime,
    skipForward,
    skipBackward,
    frameForward,
    frameBackward,
    retry,
    clearError,
    resetPlayer,
  };

  return {
    state,
    controls,
    playerRef,
    containerRef,
    handleProgress,
    handleDuration,
    handleReady,
    handleError,
    handleBuffer,
    handleEnded,
    handleStalled,
    handleWaiting,
    handleCanPlay,
    handleCanPlayThrough,
    handleLoadStart,
    handleLoadedData,
    handleSuspend,
    handleAbort,
    setPlayed,
    setDuration,
    isRecovering: isRecoveringRef.current,
  };
};

export default useVideoControls;
