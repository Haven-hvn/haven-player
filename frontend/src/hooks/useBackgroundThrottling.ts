import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * State representing the current throttling status
 */
interface ThrottlingState {
  /** Whether the document is currently visible */
  isVisible: boolean;
  /** Whether the window is currently focused */
  isFocused: boolean;
  /** Whether operations should be throttled (hidden or unfocused) */
  shouldThrottle: boolean;
}

/**
 * Hook to detect when the app is in the background and should throttle operations.
 * This is critical for Electron apps to reduce CPU usage when the window is hidden.
 * 
 * @returns ThrottlingState object with visibility and focus information
 * 
 * @example
 * ```tsx
 * const { shouldThrottle, isVisible, isFocused } = useBackgroundThrottling();
 * 
 * useEffect(() => {
 *   if (shouldThrottle) {
 *     // Pause expensive operations
 *     return;
 *   }
 *   // Run normal operations
 * }, [shouldThrottle]);
 * ```
 */
export const useBackgroundThrottling = (): ThrottlingState => {
  const [state, setState] = useState<ThrottlingState>({
    isVisible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
    isFocused: typeof document !== 'undefined' ? document.hasFocus() : true,
    shouldThrottle: false,
  });

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      setState(prev => ({
        ...prev,
        isVisible,
        shouldThrottle: !isVisible || !prev.isFocused,
      }));
    };

    const handleFocus = () => {
      setState(prev => ({
        ...prev,
        isFocused: true,
        shouldThrottle: !prev.isVisible,
      }));
    };

    const handleBlur = () => {
      setState(prev => ({
        ...prev,
        isFocused: false,
        shouldThrottle: true,
      }));
    };

    // Set initial state
    setState({
      isVisible: document.visibilityState === 'visible',
      isFocused: document.hasFocus(),
      shouldThrottle: document.visibilityState !== 'visible' || !document.hasFocus(),
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return state;
};

/**
 * Hook that provides an interval that automatically throttles when the app is in the background.
 * 
 * @param callback - Function to call on each interval tick
 * @param activeInterval - Interval in ms when app is active
 * @param throttledInterval - Interval in ms when app is throttled (null = pause completely)
 * 
 * @example
 * ```tsx
 * // Poll every 5 seconds when active, pause when hidden
 * useThrottledInterval(
 *   () => fetchData(),
 *   5000,
 *   null
 * );
 * 
 * // Poll every 5 seconds when active, every 60 seconds when hidden
 * useThrottledInterval(
 *   () => fetchData(),
 *   5000,
 *   60000
 * );
 * ```
 */
export const useThrottledInterval = (
  callback: () => void,
  activeInterval: number,
  throttledInterval: number | null = null
): void => {
  const { shouldThrottle } = useBackgroundThrottling();
  const savedCallback = useRef<() => void>(callback);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const interval = shouldThrottle ? throttledInterval : activeInterval;

    // If interval is null, don't run at all
    if (interval === null) {
      return;
    }

    const tick = () => savedCallback.current();
    const id = setInterval(tick, interval);

    return () => clearInterval(id);
  }, [shouldThrottle, activeInterval, throttledInterval]);
};

/**
 * Hook that provides a requestAnimationFrame loop that pauses when the app is in the background.
 * 
 * @param callback - Function to call on each animation frame
 * @param enabled - Whether the animation should run at all
 * 
 * @example
 * ```tsx
 * useThrottledRAF(
 *   (deltaTime) => {
 *     // Update animation
 *     position += velocity * deltaTime;
 *   },
 *   isAnimating
 * );
 * ```
 */
export const useThrottledRAF = (
  callback: (deltaTime: number) => void,
  enabled: boolean = true
): void => {
  const { shouldThrottle } = useBackgroundThrottling();
  const savedCallback = useRef<(deltaTime: number) => void>(callback);
  const frameRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    // Don't run if disabled or throttled
    if (!enabled || shouldThrottle) {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = undefined;
      }
      return;
    }

    const animate = (currentTime: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = currentTime;
      }
      
      const deltaTime = currentTime - lastTimeRef.current;
      lastTimeRef.current = currentTime;
      
      savedCallback.current(deltaTime);
      frameRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = 0;
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [enabled, shouldThrottle]);
};
