# React Context Subscriptions Optimization Plan

> **Objective:** Split monolithic state into focused contexts by update frequency to prevent unnecessary re-renders  
> **Created:** January 21, 2026  
> **Status:** Planning

---

## Executive Summary

The current frontend suffers from a common React anti-pattern: large, monolithic state that causes cascading re-renders across the entire component tree. When any piece of state changes, all subscribed components re-render—even if they only use a small subset of that state.

### Current Architecture Problems

```tsx
// ❌ Current: App.tsx manages 15+ pieces of state
const MainApp: React.FC = () => {
  // Static state (rarely changes)
  const [aiConfig, setAiConfig] = useState(null);
  const [filecoinConfig, setFilecoinConfig] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  
  // Dynamic state (changes on user action)
  const [analysisStatuses, setAnalysisStatuses] = useState({});
  const [hiddenVideos, setHiddenVideos] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  
  // High-frequency state (changes rapidly during operations)
  const [jobProgresses, setJobProgresses] = useState({});
  const [uploadStatus, setUploadStatus] = useState({});
  const [notification, setNotification] = useState({});
  
  // ... 6+ more state variables
  
  // Every child re-renders when ANY of these change!
  return <VideoAnalysisList {...allTheProps} />;
};
```

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        App Root                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           StaticConfigContext (rarely changes)           │   │
│  │  • aiConfig, filecoinConfig, theme, preferences          │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           VideosContext (moderate frequency)             │   │
│  │  • videos, videoGroups, videoTimestamps                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           UIStateContext (user interactions)             │   │
│  │  • viewMode, searchQuery, hiddenVideos, selectedItems    │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           AnalysisContext (job-related updates)          │   │
│  │  • analysisStatuses, activeJobs, jobProgresses           │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           UploadContext (upload progress)                │   │
│  │  • uploadStatuses, uploadProgress                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           NotificationContext (high frequency)           │   │
│  │  • notifications, toasts                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Context Categories by Update Frequency](#context-categories)
3. [Implementation Plan](#implementation-plan)
4. [New Context Definitions](#new-context-definitions)
5. [Migration Strategy](#migration-strategy)
6. [Component Subscription Mapping](#component-subscription-mapping)
7. [Performance Benefits](#performance-benefits)
8. [Implementation Checklist](#implementation-checklist)

---

## Current State Analysis {#current-state-analysis}

### State Currently in App.tsx (MainApp)

| State Variable | Update Frequency | Current Location | Consumers |
|---------------|------------------|------------------|-----------|
| `videos` | Moderate (polling) | `useVideos()` hook | VideoAnalysisList, VideoGrid, SpatialLayout |
| `videoGroups` | Moderate (polling) | `useVideos()` hook | VideoAnalysisList |
| `videoTimestamps` | Moderate | `useVideos()` hook | VideoAnalysisList, VideoPlayer |
| `analysisStatuses` | High (during analysis) | Local useState | VideoAnalysisList, VideoGrid |
| `activeJobs` | High (during analysis) | Local useState | VideoAnalysisList |
| `jobProgresses` | Very High (1s polling) | Local useState | VideoAnalysisList, VideoGrid |
| `isAnalyzingAll` | Low | Local useState | Header |
| `aiConfig` | Rare (on settings save) | Local useState | ConfigurationModal, analysis handlers |
| `filecoinConfig` | Rare (on settings save) | Local useState | Multiple upload handlers |
| `uploadStatus` | High (during upload) | `useFilecoinUpload()` | VideoAnalysisList, VideoGrid |
| `hiddenVideos` | Low (user action) | Local useState | VideoAnalysisList, filtering |
| `searchQuery` | Moderate (typing) | Local useState | Header, VideoAnalysisList |
| `viewMode` | Rare (user toggle) | Local useState | Header, VideoAnalysisList |
| `notification` | High (transient) | Local useState | Snackbar |
| `downloadingTorrents` | Moderate | Local useState | AddVideoModal |

### Existing Hooks (Not Context-Based)

| Hook | State Managed | Issue |
|------|--------------|-------|
| `useVideos()` | videos, videoGroups, timestamps | Called in multiple components, creates duplicate state |
| `usePlugins()` | plugins, loading, error | Called in multiple components |
| `useFilecoinUpload()` | uploadStatus | Called in multiple components |
| `useAnalysisState()` | analysisStatuses, jobProgresses | Not used in App.tsx (exists but unused) |
| `useNotifications()` | notification state | Not used in App.tsx (exists but unused) |
| `useHiddenVideos()` | hiddenVideos | Not used in App.tsx (exists but unused) |
| `useSettingsNavigation()` | settings modal state | ✅ Already context-based |

### Problem: Duplicate Hook Calls

```tsx
// ❌ Current: Same hook called in multiple places
// App.tsx
const { videos, refreshVideos } = useVideos();

// MyVideosPage.tsx  
const { refreshVideos } = useVideos(); // Creates NEW state instance!

// SpatialLayoutWrapper.tsx
const { refreshVideos } = useVideos(); // Another NEW state instance!
```

Each call to `useVideos()` creates a **separate state instance**. Changes in one don't reflect in others without manual coordination.

---

## Context Categories by Update Frequency {#context-categories}

### Category 1: Static Configuration (Rarely Changes)

**Update Triggers:** Settings save, app initialization  
**Re-render Impact:** Minimal (changes are rare)

| State | Current Source | Notes |
|-------|---------------|-------|
| `aiConfig` | Backend API + localStorage | LLM settings |
| `filecoinConfig` | Electron IPC | Storage provider config |
| `theme` | localStorage | UI theme preference |
| `preferences` | localStorage | User preferences |

### Category 2: Video Data (Moderate Frequency)

**Update Triggers:** Polling (30s), user actions (add/delete)  
**Re-render Impact:** Moderate (affects video lists)

| State | Current Source | Notes |
|-------|---------------|-------|
| `videos` | Backend API polling | Main video list |
| `videoGroups` | Backend API | Grouped by token |
| `videoTimestamps` | Backend API | AI analysis timestamps |

### Category 3: UI State (User Interactions)

**Update Triggers:** User clicks, typing  
**Re-render Impact:** Localized (specific UI areas)

| State | Current Source | Notes |
|-------|---------------|-------|
| `viewMode` | localStorage | Grid vs List view |
| `searchQuery` | User input | Search filter |
| `hiddenVideos` | localStorage | Hidden video paths |
| `selectedItems` | User selection | Multi-select state |

### Category 4: Analysis State (Job Operations)

**Update Triggers:** Job start, progress polling (1s), completion  
**Re-render Impact:** High during active jobs

| State | Current Source | Notes |
|-------|---------------|-------|
| `analysisStatuses` | Job polling | Per-video status |
| `activeJobs` | Job tracking | Currently running jobs |
| `jobProgresses` | 1s polling | Progress percentages |
| `isAnalyzingAll` | Batch operation flag | Batch analysis state |

### Category 5: Upload State (File Operations)

**Update Triggers:** Upload start, progress events, completion  
**Re-render Impact:** High during active uploads

| State | Current Source | Notes |
|-------|---------------|-------|
| `uploadStatuses` | IPC events | Per-video upload status |
| `uploadProgress` | IPC events | Progress percentages |

### Category 6: Notifications (High Frequency, Transient)

**Update Triggers:** Any operation result, errors  
**Re-render Impact:** Isolated to notification UI

| State | Current Source | Notes |
|-------|---------------|-------|
| `notification` | Various triggers | Snackbar state |
| `toastQueue` | Future enhancement | Multiple notifications |

---

## Implementation Plan {#implementation-plan}

### Phase 1: Create Context Infrastructure

```
frontend/src/context/
├── StaticConfigContext.tsx      # AI config, Filecoin config, theme
├── VideosContext.tsx            # Videos, groups, timestamps
├── UIStateContext.tsx           # View mode, search, hidden videos
├── AnalysisContext.tsx          # Analysis statuses, job progress
├── UploadContext.tsx            # Upload statuses, progress
├── NotificationContext.tsx      # Notifications, toasts
├── SettingsNavigationContext.tsx # (existing)
└── index.ts                     # Re-exports all contexts
```

### Phase 2: Migrate Existing Hooks to Context Providers

Transform existing hooks into context providers that share state across the component tree.

### Phase 3: Update Components to Use Selective Subscriptions

Components subscribe only to the contexts they need.

### Phase 4: Remove Prop Drilling

Eliminate passing state through multiple component layers.

---

## New Context Definitions {#new-context-definitions}

### 1. StaticConfigContext

```tsx
// context/StaticConfigContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { DEFAULT_AI_CONFIG } from '@/utils/settingsValidation';

interface AIConfig {
  analysis_tags: string[];
  llm_base_url: string;
  llm_model: string;
  max_batch_size: number;
}

interface FilecoinConfig {
  apiKey: string;
  gateway: string;
  // ... other fields
}

interface StaticConfigContextValue {
  // AI Configuration
  aiConfig: AIConfig | null;
  setAiConfig: (config: AIConfig) => void;
  isAiConfigured: boolean;
  
  // Filecoin Configuration
  filecoinConfig: FilecoinConfig | null;
  setFilecoinConfig: (config: FilecoinConfig) => void;
  isFilecoinConfigured: boolean;
  
  // Loading states
  loading: boolean;
  
  // Actions
  refreshConfig: () => Promise<void>;
  saveAiConfig: (config: AIConfig) => Promise<void>;
  saveFilecoinConfig: (config: FilecoinConfig) => Promise<void>;
}

const StaticConfigContext = createContext<StaticConfigContextValue | undefined>(undefined);

export const StaticConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [filecoinConfig, setFilecoinConfig] = useState<FilecoinConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Load configs on mount
  useEffect(() => {
    const loadConfigs = async () => {
      setLoading(true);
      try {
        // Load AI config from backend
        const response = await fetch('http://localhost:8000/api/config/');
        if (response.ok) {
          const data = await response.json();
          setAiConfig({
            analysis_tags: data.analysis_tags,
            llm_base_url: data.llm_base_url,
            llm_model: data.llm_model,
            max_batch_size: data.max_batch_size,
          });
        }

        // Load Filecoin config from Electron
        const { ipcRenderer } = require('electron');
        const fcConfig = await ipcRenderer.invoke('get-filecoin-config');
        if (fcConfig) {
          setFilecoinConfig(fcConfig);
        }
      } catch (error) {
        console.error('Failed to load configs:', error);
      } finally {
        setLoading(false);
      }
    };

    loadConfigs();
  }, []);

  const refreshConfig = useCallback(async () => {
    // Re-fetch configs
  }, []);

  const saveAiConfig = useCallback(async (config: AIConfig) => {
    const response = await fetch('http://localhost:8000/api/config/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (response.ok) {
      setAiConfig(config);
    }
  }, []);

  const saveFilecoinConfig = useCallback(async (config: FilecoinConfig) => {
    const { ipcRenderer } = require('electron');
    await ipcRenderer.invoke('save-filecoin-config', config);
    setFilecoinConfig(config);
  }, []);

  const value = useMemo<StaticConfigContextValue>(() => ({
    aiConfig,
    setAiConfig,
    isAiConfigured: aiConfig !== null && aiConfig.llm_base_url !== '',
    filecoinConfig,
    setFilecoinConfig,
    isFilecoinConfigured: filecoinConfig !== null,
    loading,
    refreshConfig,
    saveAiConfig,
    saveFilecoinConfig,
  }), [aiConfig, filecoinConfig, loading, refreshConfig, saveAiConfig, saveFilecoinConfig]);

  return (
    <StaticConfigContext.Provider value={value}>
      {children}
    </StaticConfigContext.Provider>
  );
};

// Selective hooks for minimal re-renders
export const useAiConfig = () => {
  const context = useContext(StaticConfigContext);
  if (!context) throw new Error('useAiConfig must be used within StaticConfigProvider');
  return {
    aiConfig: context.aiConfig,
    isAiConfigured: context.isAiConfigured,
    saveAiConfig: context.saveAiConfig,
  };
};

export const useFilecoinConfig = () => {
  const context = useContext(StaticConfigContext);
  if (!context) throw new Error('useFilecoinConfig must be used within StaticConfigProvider');
  return {
    filecoinConfig: context.filecoinConfig,
    isFilecoinConfigured: context.isFilecoinConfigured,
    saveFilecoinConfig: context.saveFilecoinConfig,
  };
};
```

### 2. VideosContext

```tsx
// context/VideosContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Video, VideoGroup, Timestamp } from '@/types/video';
import { videoService } from '@/services/api';
import { useBackgroundThrottling } from '@/hooks/useBackgroundThrottling';

interface VideosContextValue {
  // Data
  videos: Video[];
  videoGroups: VideoGroup[];
  videoTimestamps: Record<string, Timestamp[]>;
  
  // Loading states
  loading: boolean;
  error: string | null;
  
  // Actions
  addVideo: (video: VideoCreate) => Promise<Video>;
  deleteVideo: (videoPath: string) => Promise<void>;
  updateVideoSharePreference: (videoPath: string, share: boolean) => Promise<Video>;
  refreshVideos: () => Promise<void>;
  fetchTimestampsForVideo: (video: Video) => Promise<void>;
}

const VideosContext = createContext<VideosContextValue | undefined>(undefined);

export const VideosProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [videoGroups, setVideoGroups] = useState<VideoGroup[]>([]);
  const [videoTimestamps, setVideoTimestamps] = useState<Record<string, Timestamp[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { shouldThrottle } = useBackgroundThrottling();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTimestampsForVideo = useCallback(async (video: Video) => {
    if (!video.has_ai_data) return;
    try {
      const timestamps = await videoService.getTimestamps(video.path);
      setVideoTimestamps(prev => ({ ...prev, [video.path]: timestamps }));
    } catch (err) {
      console.error(`Failed to fetch timestamps for ${video.path}:`, err);
    }
  }, []);

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      const groups = await videoService.getGrouped();
      setVideoGroups(groups);
      
      const allVideos: Video[] = groups.flatMap(g => g.videos);
      setVideos(allVideos);
      
      // Fetch timestamps for videos with AI data
      for (const video of allVideos) {
        if (video.has_ai_data) {
          await fetchTimestampsForVideo(video);
        }
      }
      
      setError(null);
    } catch (err) {
      setError('Failed to fetch videos');
      console.error('Error fetching videos:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchTimestampsForVideo]);

  const addVideo = useCallback(async (videoData: VideoCreate) => {
    const newVideo = await videoService.create(videoData);
    setVideos(prev => [newVideo, ...prev]);
    if (newVideo.has_ai_data) {
      await fetchTimestampsForVideo(newVideo);
    }
    return newVideo;
  }, [fetchTimestampsForVideo]);

  const deleteVideo = useCallback(async (videoPath: string) => {
    await videoService.delete(videoPath);
    setVideos(prev => prev.filter(v => v.path !== videoPath));
    setVideoTimestamps(prev => {
      const updated = { ...prev };
      delete updated[videoPath];
      return updated;
    });
  }, []);

  const updateVideoSharePreference = useCallback(async (videoPath: string, share: boolean) => {
    const updated = await videoService.updateSharePreference(videoPath, share);
    setVideos(prev => prev.map(v => v.path === videoPath ? updated : v));
    return updated;
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Background-aware polling
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (shouldThrottle) {
      console.log('🔇 Video polling paused (app in background)');
      return;
    }

    console.log('🔄 Video polling active (interval: 30000ms)');
    pollIntervalRef.current = setInterval(fetchVideos, 30000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [shouldThrottle, fetchVideos]);

  const value = useMemo<VideosContextValue>(() => ({
    videos,
    videoGroups,
    videoTimestamps,
    loading,
    error,
    addVideo,
    deleteVideo,
    updateVideoSharePreference,
    refreshVideos: fetchVideos,
    fetchTimestampsForVideo,
  }), [videos, videoGroups, videoTimestamps, loading, error, addVideo, deleteVideo, updateVideoSharePreference, fetchVideos, fetchTimestampsForVideo]);

  return (
    <VideosContext.Provider value={value}>
      {children}
    </VideosContext.Provider>
  );
};

// Full context hook
export const useVideosContext = () => {
  const context = useContext(VideosContext);
  if (!context) throw new Error('useVideosContext must be used within VideosProvider');
  return context;
};

// Selective hooks for minimal re-renders
export const useVideoList = () => {
  const context = useContext(VideosContext);
  if (!context) throw new Error('useVideoList must be used within VideosProvider');
  return {
    videos: context.videos,
    videoGroups: context.videoGroups,
    loading: context.loading,
    error: context.error,
  };
};

export const useVideoTimestamps = () => {
  const context = useContext(VideosContext);
  if (!context) throw new Error('useVideoTimestamps must be used within VideosProvider');
  return context.videoTimestamps;
};

export const useVideoActions = () => {
  const context = useContext(VideosContext);
  if (!context) throw new Error('useVideoActions must be used within VideosProvider');
  return {
    addVideo: context.addVideo,
    deleteVideo: context.deleteVideo,
    updateVideoSharePreference: context.updateVideoSharePreference,
    refreshVideos: context.refreshVideos,
    fetchTimestampsForVideo: context.fetchTimestampsForVideo,
  };
};
```

### 3. UIStateContext

```tsx
// context/UIStateContext.tsx
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';

type ViewMode = 'grid' | 'list';

interface UIStateContextValue {
  // View preferences
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  
  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  
  // Hidden videos
  hiddenVideos: Set<string>;
  hideVideo: (videoPath: string) => void;
  unhideVideo: (videoPath: string) => void;
  isHidden: (videoPath: string) => boolean;
  
  // Selection (for multi-select operations)
  selectedVideos: Set<string>;
  selectVideo: (videoPath: string) => void;
  deselectVideo: (videoPath: string) => void;
  clearSelection: () => void;
  isSelected: (videoPath: string) => boolean;
}

const UIStateContext = createContext<UIStateContextValue | undefined>(undefined);

const STORAGE_KEYS = {
  VIEW_MODE: 'haven-player-view-mode',
  HIDDEN_VIDEOS: 'haven-player-hidden-videos',
};

export const UIStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // View mode with localStorage persistence
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
      return (saved === 'grid' || saved === 'list') ? saved : 'grid';
    } catch {
      return 'grid';
    }
  });

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEYS.VIEW_MODE, mode);
    } catch (error) {
      console.error('Failed to save view mode:', error);
    }
  }, []);

  // Search query (no persistence needed)
  const [searchQuery, setSearchQuery] = useState('');

  // Hidden videos with localStorage persistence
  const [hiddenVideos, setHiddenVideos] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.HIDDEN_VIDEOS);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Persist hidden videos
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.HIDDEN_VIDEOS, JSON.stringify([...hiddenVideos]));
    } catch (error) {
      console.error('Failed to save hidden videos:', error);
    }
  }, [hiddenVideos]);

  const hideVideo = useCallback((videoPath: string) => {
    setHiddenVideos(prev => new Set([...prev, videoPath]));
  }, []);

  const unhideVideo = useCallback((videoPath: string) => {
    setHiddenVideos(prev => {
      const updated = new Set(prev);
      updated.delete(videoPath);
      return updated;
    });
  }, []);

  const isHidden = useCallback((videoPath: string) => {
    return hiddenVideos.has(videoPath);
  }, [hiddenVideos]);

  // Selection state (for multi-select operations)
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());

  const selectVideo = useCallback((videoPath: string) => {
    setSelectedVideos(prev => new Set([...prev, videoPath]));
  }, []);

  const deselectVideo = useCallback((videoPath: string) => {
    setSelectedVideos(prev => {
      const updated = new Set(prev);
      updated.delete(videoPath);
      return updated;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedVideos(new Set());
  }, []);

  const isSelected = useCallback((videoPath: string) => {
    return selectedVideos.has(videoPath);
  }, [selectedVideos]);

  const value = useMemo<UIStateContextValue>(() => ({
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    hiddenVideos,
    hideVideo,
    unhideVideo,
    isHidden,
    selectedVideos,
    selectVideo,
    deselectVideo,
    clearSelection,
    isSelected,
  }), [
    viewMode, setViewMode,
    searchQuery,
    hiddenVideos, hideVideo, unhideVideo, isHidden,
    selectedVideos, selectVideo, deselectVideo, clearSelection, isSelected,
  ]);

  return (
    <UIStateContext.Provider value={value}>
      {children}
    </UIStateContext.Provider>
  );
};

// Selective hooks
export const useViewMode = () => {
  const context = useContext(UIStateContext);
  if (!context) throw new Error('useViewMode must be used within UIStateProvider');
  return { viewMode: context.viewMode, setViewMode: context.setViewMode };
};

export const useSearchQuery = () => {
  const context = useContext(UIStateContext);
  if (!context) throw new Error('useSearchQuery must be used within UIStateProvider');
  return { searchQuery: context.searchQuery, setSearchQuery: context.setSearchQuery };
};

export const useHiddenVideosContext = () => {
  const context = useContext(UIStateContext);
  if (!context) throw new Error('useHiddenVideosContext must be used within UIStateProvider');
  return {
    hiddenVideos: context.hiddenVideos,
    hideVideo: context.hideVideo,
    unhideVideo: context.unhideVideo,
    isHidden: context.isHidden,
  };
};

export const useVideoSelection = () => {
  const context = useContext(UIStateContext);
  if (!context) throw new Error('useVideoSelection must be used within UIStateProvider');
  return {
    selectedVideos: context.selectedVideos,
    selectVideo: context.selectVideo,
    deselectVideo: context.deselectVideo,
    clearSelection: context.clearSelection,
    isSelected: context.isSelected,
  };
};
```

### 4. AnalysisContext

```tsx
// context/AnalysisContext.tsx
import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { Video } from '@/types/video';
import { startAnalysisJob, getVideoJobs } from '@/services/api';

export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'error' | 'downloading';

interface AnalysisContextValue {
  // State
  analysisStatuses: Record<string, AnalysisStatus>;
  activeJobs: Record<string, number>;
  jobProgresses: Record<string, number>;
  isAnalyzingAll: boolean;
  
  // Actions
  setAnalysisStatus: (videoPath: string, status: AnalysisStatus) => void;
  setJobProgress: (videoPath: string, progress: number) => void;
  startAnalysis: (video: Video, onComplete?: () => Promise<void>) => Promise<void>;
  analyzeAll: (videos: Video[], onComplete?: () => Promise<void>) => Promise<void>;
  clearAnalysisStatus: (videoPath: string) => void;
  initializeStatuses: (videos: Video[]) => void;
}

const AnalysisContext = createContext<AnalysisContextValue | undefined>(undefined);

export const AnalysisProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [analysisStatuses, setAnalysisStatuses] = useState<Record<string, AnalysisStatus>>({});
  const [activeJobs, setActiveJobs] = useState<Record<string, number>>({});
  const [jobProgresses, setJobProgresses] = useState<Record<string, number>>({});
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);

  const setAnalysisStatus = useCallback((videoPath: string, status: AnalysisStatus) => {
    setAnalysisStatuses(prev => ({ ...prev, [videoPath]: status }));
  }, []);

  const setJobProgress = useCallback((videoPath: string, progress: number) => {
    setJobProgresses(prev => ({ ...prev, [videoPath]: progress }));
  }, []);

  const clearAnalysisStatus = useCallback((videoPath: string) => {
    setAnalysisStatuses(prev => {
      const updated = { ...prev };
      delete updated[videoPath];
      return updated;
    });
    setActiveJobs(prev => {
      const updated = { ...prev };
      delete updated[videoPath];
      return updated;
    });
    setJobProgresses(prev => {
      const updated = { ...prev };
      delete updated[videoPath];
      return updated;
    });
  }, []);

  const initializeStatuses = useCallback((videos: Video[]) => {
    const newStatuses: Record<string, AnalysisStatus> = {};
    videos.forEach(video => {
      if (!(video.path in analysisStatuses)) {
        newStatuses[video.path] = video.has_ai_data ? 'completed' : 'pending';
      }
    });
    if (Object.keys(newStatuses).length > 0) {
      setAnalysisStatuses(prev => ({ ...prev, ...newStatuses }));
    }
  }, [analysisStatuses]);

  const startAnalysis = useCallback(async (
    video: Video,
    onComplete?: () => Promise<void>
  ) => {
    if (video.has_ai_data) {
      setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'completed' }));
      return;
    }

    try {
      const response = await startAnalysisJob(video.path);
      const jobId = response.job_id;

      setActiveJobs(prev => ({ ...prev, [video.path]: jobId }));
      setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'analyzing' }));
      setJobProgresses(prev => ({ ...prev, [video.path]: 0 }));

      // Poll for job progress
      const pollInterval = setInterval(async () => {
        try {
          const jobs = await getVideoJobs(video.path);
          const currentJob = jobs.find(job => job.id === jobId);

          if (currentJob) {
            setJobProgresses(prev => ({ ...prev, [video.path]: currentJob.progress }));

            if (currentJob.status === 'completed') {
              setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'completed' }));
              setActiveJobs(prev => {
                const updated = { ...prev };
                delete updated[video.path];
                return updated;
              });
              if (onComplete) await onComplete();
              clearInterval(pollInterval);
            } else if (currentJob.status === 'failed') {
              setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'error' }));
              setActiveJobs(prev => {
                const updated = { ...prev };
                delete updated[video.path];
                return updated;
              });
              clearInterval(pollInterval);
            }
          }
        } catch (error) {
          console.error('Error polling job status:', error);
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to start analysis:', error);
      setAnalysisStatuses(prev => ({ ...prev, [video.path]: 'error' }));
    }
  }, []);

  const analyzeAll = useCallback(async (
    videos: Video[],
    onComplete?: () => Promise<void>
  ) => {
    setIsAnalyzingAll(true);

    const videosToAnalyze = videos.filter(
      video =>
        !analysisStatuses[video.path] ||
        analysisStatuses[video.path] === 'pending' ||
        analysisStatuses[video.path] === 'error'
    );

    for (const video of videosToAnalyze) {
      await startAnalysis(video, onComplete);
    }

    setIsAnalyzingAll(false);
  }, [analysisStatuses, startAnalysis]);

  const value = useMemo<AnalysisContextValue>(() => ({
    analysisStatuses,
    activeJobs,
    jobProgresses,
    isAnalyzingAll,
    setAnalysisStatus,
    setJobProgress,
    startAnalysis,
    analyzeAll,
    clearAnalysisStatus,
    initializeStatuses,
  }), [
    analysisStatuses, activeJobs, jobProgresses, isAnalyzingAll,
    setAnalysisStatus, setJobProgress, startAnalysis, analyzeAll,
    clearAnalysisStatus, initializeStatuses,
  ]);

  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  );
};

// Full context hook
export const useAnalysisContext = () => {
  const context = useContext(AnalysisContext);
  if (!context) throw new Error('useAnalysisContext must be used within AnalysisProvider');
  return context;
};

// Selective hooks
export const useAnalysisStatuses = () => {
  const context = useContext(AnalysisContext);
  if (!context) throw new Error('useAnalysisStatuses must be used within AnalysisProvider');
  return {
    analysisStatuses: context.analysisStatuses,
    jobProgresses: context.jobProgresses,
    isAnalyzingAll: context.isAnalyzingAll,
  };
};

export const useAnalysisActions = () => {
  const context = useContext(AnalysisContext);
  if (!context) throw new Error('useAnalysisActions must be used within AnalysisProvider');
  return {
    startAnalysis: context.startAnalysis,
    analyzeAll: context.analyzeAll,
    setAnalysisStatus: context.setAnalysisStatus,
    clearAnalysisStatus: context.clearAnalysisStatus,
    initializeStatuses: context.initializeStatuses,
  };
};
```

### 5. UploadContext

```tsx
// context/UploadContext.tsx
import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { videoService } from '@/services/api';
import type { FilecoinUploadStatus, FilecoinConfig, FilecoinUploadResult } from '@/types/filecoin';

const { ipcRenderer } = require('electron');

interface UploadContextValue {
  // State
  uploadStatuses: Record<string, FilecoinUploadStatus>;
  
  // Actions
  uploadVideo: (videoPath: string, config: FilecoinConfig) => Promise<FilecoinUploadResult>;
  cancelUpload: (videoPath: string) => void;
  clearStatus: (videoPath: string) => void;
}

const UploadContext = createContext<UploadContextValue | undefined>(undefined);

export const UploadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, FilecoinUploadStatus>>({});
  const [uploadControllers, setUploadControllers] = useState<Record<string, AbortController>>({});

  const uploadVideo = useCallback(async (
    videoPath: string,
    config: FilecoinConfig
  ): Promise<FilecoinUploadResult> => {
    // Cancel any existing upload for this video
    if (uploadControllers[videoPath]) {
      uploadControllers[videoPath].abort();
    }

    const controller = new AbortController();
    setUploadControllers(prev => ({ ...prev, [videoPath]: controller }));

    // Set initial status
    setUploadStatuses(prev => ({
      ...prev,
      [videoPath]: { status: 'uploading', progress: 0 },
    }));

    const handleProgress = (_: unknown, payload: { videoPath: string; progress: any }) => {
      if (payload.videoPath !== videoPath) return;
      if (controller.signal.aborted) return;

      setUploadStatuses(prev => ({
        ...prev,
        [videoPath]: {
          status: payload.progress.stage === 'completed' ? 'completed' : 'uploading',
          progress: payload.progress.progress,
        },
      }));
    };

    ipcRenderer.on('filecoin-upload-progress', handleProgress);

    try {
      const result: FilecoinUploadResult = await ipcRenderer.invoke('upload-to-filecoin', {
        videoPath,
        config,
      });

      setUploadStatuses(prev => ({
        ...prev,
        [videoPath]: {
          status: 'completed',
          progress: 100,
          rootCid: result.rootCid,
          pieceCid: result.pieceCid,
        },
      }));

      // Save metadata to backend
      await videoService.updateFilecoinMetadata(videoPath, {
        root_cid: result.rootCid,
        piece_cid: result.pieceCid,
      });

      // Cleanup
      setUploadControllers(prev => {
        const updated = { ...prev };
        delete updated[videoPath];
        return updated;
      });

      ipcRenderer.removeListener('filecoin-upload-progress', handleProgress);
      return result;
    } catch (error) {
      setUploadStatuses(prev => ({
        ...prev,
        [videoPath]: {
          status: 'error',
          progress: 0,
          error: error instanceof Error ? error.message : 'Upload failed',
        },
      }));

      setUploadControllers(prev => {
        const updated = { ...prev };
        delete updated[videoPath];
        return updated;
      });

      ipcRenderer.removeListener('filecoin-upload-progress', handleProgress);
      throw error;
    }
  }, [uploadControllers]);

  const cancelUpload = useCallback((videoPath: string) => {
    if (uploadControllers[videoPath]) {
      uploadControllers[videoPath].abort();
      setUploadStatuses(prev => ({
        ...prev,
        [videoPath]: { status: 'error', progress: 0, error: 'Upload cancelled' },
      }));
      setUploadControllers(prev => {
        const updated = { ...prev };
        delete updated[videoPath];
        return updated;
      });
    }
  }, [uploadControllers]);

  const clearStatus = useCallback((videoPath: string) => {
    setUploadStatuses(prev => {
      const updated = { ...prev };
      delete updated[videoPath];
      return updated;
    });
  }, []);

  const value = useMemo<UploadContextValue>(() => ({
    uploadStatuses,
    uploadVideo,
    cancelUpload,
    clearStatus,
  }), [uploadStatuses, uploadVideo, cancelUpload, clearStatus]);

  return (
    <UploadContext.Provider value={value}>
      {children}
    </UploadContext.Provider>
  );
};

export const useUploadContext = () => {
  const context = useContext(UploadContext);
  if (!context) throw new Error('useUploadContext must be used within UploadProvider');
  return context;
};

export const useUploadStatuses = () => {
  const context = useContext(UploadContext);
  if (!context) throw new Error('useUploadStatuses must be used within UploadProvider');
  return context.uploadStatuses;
};

export const useUploadActions = () => {
  const context = useContext(UploadContext);
  if (!context) throw new Error('useUploadActions must be used within UploadProvider');
  return {
    uploadVideo: context.uploadVideo,
    cancelUpload: context.cancelUpload,
    clearStatus: context.clearStatus,
  };
};
```

### 6. NotificationContext

```tsx
// context/NotificationContext.tsx
import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export type NotificationSeverity = 'error' | 'warning' | 'info' | 'success';

interface Notification {
  id: string;
  message: string;
  severity: NotificationSeverity;
  autoHideDuration?: number;
}

interface NotificationContextValue {
  // Current notification (for single snackbar)
  notification: { open: boolean; message: string; severity: NotificationSeverity };
  
  // Toast queue (for multiple notifications)
  toasts: Notification[];
  
  // Actions
  showNotification: (message: string, severity: NotificationSeverity) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
  hideNotification: () => void;
  addToast: (message: string, severity: NotificationSeverity, duration?: number) => void;
  removeToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: NotificationSeverity;
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const [toasts, setToasts] = useState<Notification[]>([]);

  const showNotification = useCallback((message: string, severity: NotificationSeverity) => {
    setNotification({ open: true, message, severity });
  }, []);

  const showError = useCallback((message: string) => {
    setNotification({ open: true, message, severity: 'error' });
  }, []);

  const showSuccess = useCallback((message: string) => {
    setNotification({ open: true, message, severity: 'success' });
  }, []);

  const showWarning = useCallback((message: string) => {
    setNotification({ open: true, message, severity: 'warning' });
  }, []);

  const showInfo = useCallback((message: string) => {
    setNotification({ open: true, message, severity: 'info' });
  }, []);

  const hideNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, open: false }));
  }, []);

  const addToast = useCallback((
    message: string,
    severity: NotificationSeverity,
    duration: number = 6000
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [...prev, { id, message, severity, autoHideDuration: duration }]);
    
    // Auto-remove after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const value = useMemo<NotificationContextValue>(() => ({
    notification,
    toasts,
    showNotification,
    showError,
    showSuccess,
    showWarning,
    showInfo,
    hideNotification,
    addToast,
    removeToast,
  }), [
    notification, toasts,
    showNotification, showError, showSuccess, showWarning, showInfo,
    hideNotification, addToast, removeToast,
  ]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotificationContext must be used within NotificationProvider');
  return context;
};

// Convenience hooks
export const useSnackbar = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useSnackbar must be used within NotificationProvider');
  return {
    notification: context.notification,
    showNotification: context.showNotification,
    showError: context.showError,
    showSuccess: context.showSuccess,
    hideNotification: context.hideNotification,
  };
};

export const useToasts = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useToasts must be used within NotificationProvider');
  return {
    toasts: context.toasts,
    addToast: context.addToast,
    removeToast: context.removeToast,
  };
};
```

---

## Migration Strategy {#migration-strategy}

### Step 1: Create Context Files

Create all context files in `frontend/src/context/`:

```bash
frontend/src/context/
├── StaticConfigContext.tsx
├── VideosContext.tsx
├── UIStateContext.tsx
├── AnalysisContext.tsx
├── UploadContext.tsx
├── NotificationContext.tsx
├── SettingsNavigationContext.tsx  # (existing)
└── index.ts
```

### Step 2: Create Context Index

```tsx
// context/index.ts
export * from './StaticConfigContext';
export * from './VideosContext';
export * from './UIStateContext';
export * from './AnalysisContext';
export * from './UploadContext';
export * from './NotificationContext';
export * from './SettingsNavigationContext';
```

### Step 3: Update App.tsx Provider Tree

```tsx
// App.tsx
import {
  StaticConfigProvider,
  VideosProvider,
  UIStateProvider,
  AnalysisProvider,
  UploadProvider,
  NotificationProvider,
  SettingsNavigationProvider,
} from '@/context';

const App: React.FC = () => {
  return (
    <StaticConfigProvider>
      <NotificationProvider>
        <VideosProvider>
          <UIStateProvider>
            <AnalysisProvider>
              <UploadProvider>
                <SettingsNavigationProvider>
                  <ThemeProvider theme={liquidGlassTheme}>
                    <CssBaseline />
                    <Router>
                      {/* Routes */}
                    </Router>
                    <GlobalConfigurationModal />
                    <GlobalSnackbar />
                  </ThemeProvider>
                </SettingsNavigationProvider>
              </UploadProvider>
            </AnalysisProvider>
          </UIStateProvider>
        </VideosProvider>
      </NotificationProvider>
    </StaticConfigProvider>
  );
};
```

### Step 4: Migrate Components Incrementally

**Order of migration (by impact):**

1. **MainApp** - Remove local state, use contexts
2. **VideoAnalysisList** - Use `useVideoList`, `useAnalysisStatuses`, `useUploadStatuses`
3. **VideoGrid** - Use `useVideoList`, `useViewMode`
4. **Header** - Use `useSearchQuery`, `useViewMode`, `useAnalysisStatuses`
5. **Sidebar** - Use `useVideoActions`
6. **ConfigurationModal** - Use `useAiConfig`, `useFilecoinConfig`
7. **MyVideosPage** - Remove duplicate `useVideos()` call
8. **SpatialLayoutWrapper** - Remove duplicate `useVideos()` call

---

## Component Subscription Mapping {#component-subscription-mapping}

### Which Components Subscribe to Which Contexts

| Component | StaticConfig | Videos | UIState | Analysis | Upload | Notification |
|-----------|:------------:|:------:|:-------:|:--------:|:------:|:------------:|
| MainApp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Header | - | - | ✅ | ✅ | - | - |
| Sidebar | - | ✅ | - | - | - | - |
| VideoAnalysisList | - | ✅ | ✅ | ✅ | ✅ | - |
| VideoGrid | - | ✅ | ✅ | ✅ | ✅ | - |
| VideoPlayer | - | ✅ | - | - | - | - |
| ConfigurationModal | ✅ | - | - | - | - | - |
| AddVideoModal | - | ✅ | - | - | - | ✅ |
| DePinDashboard | ✅ | - | - | - | - | - |
| SpatialLayout | - | ✅ | ✅ | ✅ | ✅ | - |
| GlobalSnackbar | - | - | - | - | - | ✅ |

### Selective Hook Usage Examples

```tsx
// ✅ Header only needs search and view mode
const Header: React.FC = () => {
  const { searchQuery, setSearchQuery } = useSearchQuery();
  const { viewMode, setViewMode } = useViewMode();
  const { isAnalyzingAll } = useAnalysisStatuses();
  // Won't re-render when videos change!
};

// ✅ VideoGrid only needs video list and view mode
const VideoGrid: React.FC = () => {
  const { videos, loading } = useVideoList();
  const { viewMode } = useViewMode();
  const { analysisStatuses } = useAnalysisStatuses();
  // Won't re-render when search query changes!
};

// ✅ ConfigurationModal only needs config
const ConfigurationModal: React.FC = () => {
  const { aiConfig, saveAiConfig } = useAiConfig();
  const { filecoinConfig, saveFilecoinConfig } = useFilecoinConfig();
  // Won't re-render when videos or analysis changes!
};
```

---

## Performance Benefits {#performance-benefits}

### Before: Monolithic State

```
User types in search box
    ↓
searchQuery state updates in MainApp
    ↓
MainApp re-renders
    ↓
ALL children re-render (even those not using searchQuery)
    ↓
VideoAnalysisList re-renders (1500+ lines)
    ↓
All VideoAnalysisItem components re-render
    ↓
Header re-renders
    ↓
Sidebar re-renders
    ↓
... cascading re-renders
```

### After: Split Contexts

```
User types in search box
    ↓
searchQuery state updates in UIStateContext
    ↓
ONLY components subscribed to useSearchQuery re-render
    ↓
Header re-renders (uses searchQuery)
    ↓
VideoAnalysisList re-renders (uses searchQuery for filtering)
    ↓
Sidebar does NOT re-render (doesn't use searchQuery)
    ↓
ConfigurationModal does NOT re-render (doesn't use searchQuery)
```

### Estimated Performance Improvements

| Scenario | Before (Re-renders) | After (Re-renders) | Improvement |
|----------|--------------------:|-------------------:|------------:|
| Search typing | ~50 components | ~5 components | 90% fewer |
| Analysis progress update | ~50 components | ~10 components | 80% fewer |
| Upload progress update | ~50 components | ~5 components | 90% fewer |
| View mode toggle | ~50 components | ~3 components | 94% fewer |
| Settings save | ~50 components | ~2 components | 96% fewer |

---

## Implementation Checklist {#implementation-checklist}

### Phase 1: Context Infrastructure (Day 1)
- [ ] Create `StaticConfigContext.tsx`
- [ ] Create `VideosContext.tsx`
- [ ] Create `UIStateContext.tsx`
- [ ] Create `AnalysisContext.tsx`
- [ ] Create `UploadContext.tsx`
- [ ] Create `NotificationContext.tsx`
- [ ] Create `context/index.ts` with re-exports
- [ ] Add provider tree to `App.tsx`

### Phase 2: Migrate Core Components (Days 2-3)
- [ ] Migrate `MainApp` to use contexts (remove local state)
- [ ] Migrate `VideoAnalysisList` to use selective hooks
- [ ] Migrate `VideoGrid` to use selective hooks
- [ ] Migrate `Header` to use selective hooks
- [ ] Migrate `Sidebar` to use selective hooks

### Phase 3: Migrate Secondary Components (Days 4-5)
- [ ] Migrate `ConfigurationModal` to use config contexts
- [ ] Migrate `AddVideoModal` to use video/notification contexts
- [ ] Migrate `MyVideosPage` to use video context
- [ ] Migrate `SpatialLayoutWrapper` to use video context
- [ ] Migrate `DePinDashboard` to use config context

### Phase 4: Remove Duplicate Hooks (Day 6)
- [ ] Remove duplicate `useVideos()` calls
- [ ] Remove duplicate `useFilecoinUpload()` calls
- [ ] Remove duplicate `usePlugins()` calls
- [ ] Update existing hooks to use contexts internally

### Phase 5: Testing & Validation (Day 7)
- [ ] Test all user flows work correctly
- [ ] Profile re-renders with React DevTools
- [ ] Verify no duplicate state instances
- [ ] Document any breaking changes

---

## Advanced Optimization: Context Selectors (Optional)

For even more granular control, consider using a context selector library like `use-context-selector`:

```tsx
import { createContext, useContextSelector } from 'use-context-selector';

const VideosContext = createContext<VideosContextValue>(null!);

// Component only re-renders when videos.length changes
const VideoCount: React.FC = () => {
  const count = useContextSelector(VideosContext, ctx => ctx.videos.length);
  return <span>{count} videos</span>;
};

// Component only re-renders when specific video changes
const VideoTitle: React.FC<{ path: string }> = ({ path }) => {
  const title = useContextSelector(
    VideosContext,
    ctx => ctx.videos.find(v => v.path === path)?.title
  );
  return <span>{title}</span>;
};
```

This provides selector-based subscriptions similar to Redux, allowing components to subscribe to specific slices of context state.

---

## Summary

This plan transforms the frontend from a monolithic state architecture to a modular, context-based system that:

1. **Prevents unnecessary re-renders** by splitting state by update frequency
2. **Eliminates duplicate state** by sharing state through context providers
3. **Improves code organization** with focused, single-responsibility contexts
4. **Enables selective subscriptions** through specialized hooks
5. **Maintains backward compatibility** during incremental migration

Expected outcomes:
- **80-96% reduction** in unnecessary re-renders
- **Cleaner component code** with less prop drilling
- **Single source of truth** for each piece of state
- **Better developer experience** with focused, testable contexts

---

*Document maintained by: Frontend Performance Team*  
*Last updated: January 21, 2026*
