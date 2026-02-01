/**
 * useHiddenVideos - Focused hook for managing hidden video state
 * 
 * Extracted from App.tsx to reduce monolithic state and prevent cascading re-renders.
 * Manages the set of hidden videos with localStorage persistence.
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'haven-player-hidden-videos';

interface UseHiddenVideosReturn {
  hiddenVideos: Set<string>;
  hideVideo: (videoPath: string) => void;
  unhideVideo: (videoPath: string) => void;
  isHidden: (videoPath: string) => boolean;
  toggleHidden: (videoPath: string) => void;
  clearHidden: () => void;
}

export const useHiddenVideos = (): UseHiddenVideosReturn => {
  // Initialize from localStorage
  const [hiddenVideos, setHiddenVideos] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Persist to localStorage whenever hiddenVideos changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...hiddenVideos]));
    } catch (error) {
      console.error('Failed to save hidden videos to localStorage:', error);
    }
  }, [hiddenVideos]);

  const hideVideo = useCallback((videoPath: string) => {
    setHiddenVideos((prev: Set<string>) => new Set([...prev, videoPath]));
  }, []);

  const unhideVideo = useCallback((videoPath: string) => {
    setHiddenVideos((prev: Set<string>) => {
      const updated = new Set(prev);
      updated.delete(videoPath);
      return updated;
    });
  }, []);

  const isHidden = useCallback((videoPath: string) => {
    return hiddenVideos.has(videoPath);
  }, [hiddenVideos]);

  const toggleHidden = useCallback((videoPath: string) => {
    setHiddenVideos((prev: Set<string>) => {
      const updated = new Set(prev);
      if (updated.has(videoPath)) {
        updated.delete(videoPath);
      } else {
        updated.add(videoPath);
      }
      return updated;
    });
  }, []);

  const clearHidden = useCallback(() => {
    setHiddenVideos(new Set());
  }, []);

  return {
    hiddenVideos,
    hideVideo,
    unhideVideo,
    isHidden,
    toggleHidden,
    clearHidden,
  };
};
