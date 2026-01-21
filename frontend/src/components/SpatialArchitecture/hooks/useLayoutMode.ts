/**
 * useLayoutMode Hook
 * 
 * Manages the spatial layout mode state for the Haven interface.
 * Controls how the interface transforms based on user context and actions.
 * 
 * MODES:
 * - Browse: Default grid view, collapsed dock, hidden margin
 * - Focused: Grid with highlight on selected item, expanded margin with details
 * - Recording: Cards with progress overlays, batch controls in dock
 * - Upload: Upload progress view, pause/resume controls
 * - Player: Near-fullscreen video, mini-dock, timestamp navigator
 * 
 * ANTI-PATTERN AVOIDED: Page-based navigation
 * Instead: Stage state changes, not route changes. User never loses their place.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { TransformationItem } from '@/types/transformation';

export type LayoutMode = 'browse' | 'focused' | 'recording' | 'upload' | 'player';

export interface LayoutModeConfig {
  // Dock configuration
  dockHeight: number;          // 56px collapsed, 180px expanded
  dockExpanded: boolean;
  dockMinimized: boolean;      // For player mode mini-dock
  
  // Margin configuration  
  marginWidth: number;         // 0px hidden, 320px expanded
  marginVisible: boolean;
  marginPreview: boolean;      // Partial info on hover vs full on click
  
  // Stage configuration
  stageExpanded: boolean;      // Whether stage takes full width
  stageGridDensity: 'compact' | 'normal' | 'comfortable';
  
  // Overhead bar
  overheadContent: string;     // Context-specific overhead info
  
  // Transition timing
  transitionDuration: number;  // ms, should be <300ms
}

export interface LayoutModeState {
  mode: LayoutMode;
  previousMode: LayoutMode | null;
  config: LayoutModeConfig;
  selectedItem: TransformationItem | null;
  playerItem: TransformationItem | null;
  selectionCount: number;
  isTransitioning: boolean;
}

export interface UseLayoutModeReturn {
  // State
  mode: LayoutMode;
  config: LayoutModeConfig;
  selectedItem: TransformationItem | null;
  playerItem: TransformationItem | null;
  selectionCount: number;
  isTransitioning: boolean;
  
  // Mode transitions
  enterBrowseMode: () => void;
  enterFocusedMode: (item: TransformationItem) => void;
  enterRecordingMode: () => void;
  enterUploadMode: () => void;
  enterPlayerMode: (item: TransformationItem) => void;
  exitPlayerMode: () => void;
  
  // Selection
  selectItem: (item: TransformationItem | null) => void;
  hoverItem: (item: TransformationItem | null) => void;
  clearSelection: () => void;
  
  // Dock controls
  expandDock: () => void;
  collapseDock: () => void;
  toggleDock: () => void;
  
  // Margin controls
  showMargin: () => void;
  hideMargin: () => void;
  previewMargin: (item: TransformationItem) => void;
  
  // Density control
  setGridDensity: (density: 'compact' | 'normal' | 'comfortable') => void;
}

// Default configurations for each mode
const MODE_CONFIGS: Record<LayoutMode, LayoutModeConfig> = {
  browse: {
    dockHeight: 56,
    dockExpanded: false,
    dockMinimized: false,
    marginWidth: 0,
    marginVisible: false,
    marginPreview: false,
    stageExpanded: true,
    stageGridDensity: 'normal',
    overheadContent: '',
    transitionDuration: 250,
  },
  focused: {
    dockHeight: 56,
    dockExpanded: false,
    dockMinimized: false,
    marginWidth: 320,
    marginVisible: true,
    marginPreview: false,
    stageExpanded: false,
    stageGridDensity: 'normal',
    overheadContent: '',
    transitionDuration: 250,
  },
  recording: {
    dockHeight: 56,
    dockExpanded: false,
    dockMinimized: false,
    marginWidth: 0,
    marginVisible: false,
    marginPreview: false,
    stageExpanded: true,
    stageGridDensity: 'normal',
    overheadContent: '',
    transitionDuration: 250,
  },
  upload: {
    dockHeight: 56,
    dockExpanded: false,
    dockMinimized: false,
    marginWidth: 0,
    marginVisible: false,
    marginPreview: true,  // Hover shows upload details
    stageExpanded: true,
    stageGridDensity: 'normal',
    overheadContent: '',
    transitionDuration: 250,
  },
  player: {
    dockHeight: 48,
    dockExpanded: false,
    dockMinimized: true,
    marginWidth: 0,
    marginVisible: false,
    marginPreview: false,
    stageExpanded: true,
    stageGridDensity: 'normal',
    overheadContent: '',
    transitionDuration: 200,
  },
};

export function useLayoutMode(): UseLayoutModeReturn {
  // Core state
  const [state, setState] = useState<LayoutModeState>({
    mode: 'browse',
    previousMode: null,
    config: { ...MODE_CONFIGS.browse },
    selectedItem: null,
    playerItem: null,
    selectionCount: 0,
    isTransitioning: false,
  });
  
  // Hover state for margin preview
  const [hoveredItem, setHoveredItem] = useState<TransformationItem | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Transition lock to prevent rapid mode changes
  const transitionLockRef = useRef(false);

  // Helper to apply transition
  const applyTransition = useCallback((
    newMode: LayoutMode,
    overrides: Partial<LayoutModeConfig> = {},
    newSelectedItem?: TransformationItem | null,
    newPlayerItem?: TransformationItem | null
  ) => {
    if (transitionLockRef.current) return;
    
    transitionLockRef.current = true;
    
    setState((prev: LayoutModeState) => ({
      ...prev,
      isTransitioning: true,
      previousMode: prev.mode,
    }));
    
    // Apply new mode after brief delay for exit animation
    setTimeout(() => {
      setState((prev: LayoutModeState) => ({
        ...prev,
        mode: newMode,
        config: { ...MODE_CONFIGS[newMode], ...overrides },
        selectedItem: newSelectedItem !== undefined ? newSelectedItem : prev.selectedItem,
        playerItem: newPlayerItem !== undefined ? newPlayerItem : prev.playerItem,
        isTransitioning: false,
      }));
      
      transitionLockRef.current = false;
    }, MODE_CONFIGS[newMode].transitionDuration);
  }, []);

  // Mode transitions
  const enterBrowseMode = useCallback(() => {
    applyTransition('browse', {}, null, null);
  }, [applyTransition]);

  const enterFocusedMode = useCallback((item: TransformationItem) => {
    const overheadContent = item.tokenInfo?.name 
      ? `${item.tokenInfo.name} (${item.tokenInfo.symbol})`
      : item.title;
    applyTransition('focused', { overheadContent }, item);
  }, [applyTransition]);

  const enterRecordingMode = useCallback(() => {
    const recordingCount = state.selectionCount || 0;
    applyTransition('recording', { 
      overheadContent: `Recording ${recordingCount} stream${recordingCount !== 1 ? 's' : ''}` 
    });
  }, [applyTransition, state.selectionCount]);

  const enterUploadMode = useCallback(() => {
    applyTransition('upload', { overheadContent: 'Upload Queue' });
  }, [applyTransition]);

  const enterPlayerMode = useCallback((item: TransformationItem) => {
    applyTransition('player', {}, state.selectedItem, item);
  }, [applyTransition, state.selectedItem]);

  const exitPlayerMode = useCallback(() => {
    const targetMode = state.previousMode || 'browse';
    applyTransition(targetMode, {}, state.selectedItem, null);
  }, [applyTransition, state.previousMode, state.selectedItem]);

  // Selection handlers
  const selectItem = useCallback((item: TransformationItem | null) => {
    if (item) {
      enterFocusedMode(item);
    } else {
      enterBrowseMode();
    }
  }, [enterFocusedMode, enterBrowseMode]);

  const hoverItem = useCallback((item: TransformationItem | null) => {
    // Clear any pending hover timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    
    if (item && state.mode !== 'focused' && state.mode !== 'player') {
      // Hover-intent: delay before showing margin preview
      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredItem(item);
        setState((prev: LayoutModeState) => ({
          ...prev,
          config: {
            ...prev.config,
            marginPreview: true,
            marginWidth: 280, // Slightly narrower for preview
            marginVisible: true,
          },
        }));
      }, 300); // 300ms hover intent delay
    } else if (!item) {
      // Mouse left - hide preview after brief delay
      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredItem(null);
        if (state.mode === 'browse') {
          setState((prev: LayoutModeState) => ({
            ...prev,
            config: {
              ...prev.config,
              marginPreview: false,
              marginWidth: 0,
              marginVisible: false,
            },
          }));
        }
      }, 150);
    }
  }, [state.mode]);

  const clearSelection = useCallback(() => {
    setState((prev: LayoutModeState) => ({
      ...prev,
      selectedItem: null,
      selectionCount: 0,
    }));
    enterBrowseMode();
  }, [enterBrowseMode]);

  // Dock controls
  const expandDock = useCallback(() => {
    setState((prev: LayoutModeState) => ({
      ...prev,
      config: {
        ...prev.config,
        dockExpanded: true,
        dockHeight: 180,
      },
    }));
  }, []);

  const collapseDock = useCallback(() => {
    setState((prev: LayoutModeState) => ({
      ...prev,
      config: {
        ...prev.config,
        dockExpanded: false,
        dockHeight: 56,
      },
    }));
  }, []);

  const toggleDock = useCallback(() => {
    setState((prev: LayoutModeState) => ({
      ...prev,
      config: {
        ...prev.config,
        dockExpanded: !prev.config.dockExpanded,
        dockHeight: prev.config.dockExpanded ? 56 : 180,
      },
    }));
  }, []);

  // Margin controls
  const showMargin = useCallback(() => {
    setState((prev: LayoutModeState) => ({
      ...prev,
      config: {
        ...prev.config,
        marginVisible: true,
        marginWidth: 320,
        stageExpanded: false,
      },
    }));
  }, []);

  const hideMargin = useCallback(() => {
    setState((prev: LayoutModeState) => ({
      ...prev,
      config: {
        ...prev.config,
        marginVisible: false,
        marginWidth: 0,
        marginPreview: false,
        stageExpanded: true,
      },
    }));
  }, []);

  const previewMargin = useCallback((item: TransformationItem) => {
    setHoveredItem(item);
    setState((prev: LayoutModeState) => ({
      ...prev,
      config: {
        ...prev.config,
        marginPreview: true,
        marginWidth: 280,
        marginVisible: true,
      },
    }));
  }, []);

  // Density control
  const setGridDensity = useCallback((density: 'compact' | 'normal' | 'comfortable') => {
    setState((prev: LayoutModeState) => ({
      ...prev,
      config: {
        ...prev.config,
        stageGridDensity: density,
      },
    }));
  }, []);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Keyboard shortcuts for mode navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape to exit player or clear selection
      if (event.key === 'Escape') {
        if (state.mode === 'player') {
          exitPlayerMode();
        } else if (state.selectedItem) {
          clearSelection();
        }
      }
      
      // Space to toggle dock (when not in input)
      if (event.key === ' ' && !(event.target as HTMLElement).matches('input, textarea')) {
        // Don't toggle if typing
        if (document.activeElement?.tagName !== 'INPUT') {
          event.preventDefault();
          toggleDock();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.mode, state.selectedItem, exitPlayerMode, clearSelection, toggleDock]);

  return {
    mode: state.mode,
    config: state.config,
    selectedItem: state.selectedItem,
    playerItem: state.playerItem,
    selectionCount: state.selectionCount,
    isTransitioning: state.isTransitioning,
    
    enterBrowseMode,
    enterFocusedMode,
    enterRecordingMode,
    enterUploadMode,
    enterPlayerMode,
    exitPlayerMode,
    
    selectItem,
    hoverItem,
    clearSelection,
    
    expandDock,
    collapseDock,
    toggleDock,
    
    showMargin,
    hideMargin,
    previewMargin,
    
    setGridDensity,
  };
}

export default useLayoutMode;
