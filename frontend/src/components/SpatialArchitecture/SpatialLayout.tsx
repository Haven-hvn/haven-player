/**
 * Spatial Layout - Main Container with Mode-Aware Architecture
 * 
 * Combines all spatial architecture zones into a cohesive, mode-responsive layout:
 * - Zone 1: Source Navigator (Left Spine - 64px collapsed, 240px expanded on hover)
 * - Zone 2: Transformation Canvas (Center Primary - expands to fill available space)
 * - Zone 3: Health Pulse Bar (Top Header - ORIENTATION ONLY, no actions)
 * - Zone 4: Bottom Dock (NEW - All actions live here)
 * - Zone 5: Detail Panel (Right Breathing Margin - ephemeral, appears on selection)
 * 
 * MODES:
 * - Browse: Default grid view, collapsed dock, hidden margin, Stage >70% width
 * - Focused: Grid with highlight on selected, expanded margin with details
 * - Recording: Cards with progress overlays, batch controls in dock
 * - Upload: Upload progress view, pause/resume controls
 * - Player: Near-fullscreen video, mini-dock (Stage transforms, no page navigation)
 * 
 * ANTI-PATTERNS AVOIDED:
 * - Page-Based Navigation: Stage state changes, not route changes
 * - Full-Page Video Player: Stage transforms; Escape returns to grid
 * - Fat Left Sidebar: 64px collapsed Spine, expand on hover
 * - Action-Heavy Header: Header for status only; Dock for actions
 */

import React, { useState, useCallback } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';
import { CircuitSubstrate } from '@/components/LiquidGlass';
import { useSettingsNavigation } from '@/context/SettingsNavigationContext';

import SourceNavigator from './SourceNavigator';
import HealthPulseBar from './HealthPulseBar';
import TransformationCanvas from './TransformationCanvas';
import BottomDock from './BottomDock';
import DetailPanel from './DetailPanel';
import { useLayoutMode } from './hooks/useLayoutMode';

import { useTransformationPipeline } from '@/hooks/useTransformationPipeline';
import type { TransformationItem } from '@/types/transformation';

interface SpatialLayoutProps {
  onUploadVideo?: (item: TransformationItem) => void;
  onAddVideo?: () => void;
}

const SpatialLayout: React.FC<SpatialLayoutProps> = ({ onUploadVideo, onAddVideo }) => {
  const navigate = useNavigate();
  const { openSettings } = useSettingsNavigation();
  
  // Layout mode state
  const {
    mode,
    config,
    selectedItem,
    playerItem,
    selectionCount,
    isTransitioning,
    enterBrowseMode,
    enterFocusedMode,
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
    setGridDensity,
  } = useLayoutMode();

  // Transformation pipeline state
  const {
    items,
    filteredItems,
    sources,
    systemHealth,
    queueStats,
    recordingSessions,
    activeStateFilter,
    activeSourceFilter,
    searchQuery,
    stateFilters,
    sourceFilters,
    setStateFilter,
    setSourceFilter,
    setSearchQuery,
    refresh,
    loading,
    error,
  } = useTransformationPipeline();

  // Count active recordings from items
  const activeRecordingCount = items.filter(i => i.state === 'recording').length;

  // Handlers
  const handleItemClick = useCallback((item: TransformationItem) => {
    selectItem(item);
  }, [selectItem]);

  const handleItemHover = useCallback((item: TransformationItem | null) => {
    hoverItem(item);
  }, [hoverItem]);

  const handleItemPlay = useCallback((item: TransformationItem) => {
    // Double-click transforms the Stage, doesn't navigate
    // ANTI-PATTERN AVOIDED: Full-Page Video Player
    enterPlayerMode(item);
  }, [enterPlayerMode]);

  const handleItemUpload = useCallback((item: TransformationItem) => {
    if (onUploadVideo) {
      onUploadVideo(item);
    }
  }, [onUploadVideo]);

  const handleCloseDetailPanel = useCallback(() => {
    hideMargin();
    clearSelection();
  }, [hideMargin, clearSelection]);

  const handleSettingsClick = useCallback(() => {
    openSettings();
  }, [openSettings]);

  // Dock handlers
  const handleAddVideo = useCallback(() => {
    if (onAddVideo) {
      onAddVideo();
    }
  }, [onAddVideo]);

  const handleSearch = useCallback(() => {
    // Focus the search input in the header
    const searchInput = document.querySelector('input[placeholder*="Filter"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }, []);

  const handleQuickUpload = useCallback((files: FileList) => {
    // Handle file upload
    console.log('Quick upload:', files);
    // TODO: Implement file upload logic
  }, []);

  const handleUrlImport = useCallback((url: string) => {
    // Handle URL import
    console.log('URL import:', url);
    // TODO: Implement URL import logic
  }, []);

  const handleAnalyzeSelected = useCallback(() => {
    if (selectedItem) {
      console.log('Analyze:', selectedItem);
      // TODO: Implement VLM analysis
    }
  }, [selectedItem]);

  const handlePauseAll = useCallback(() => {
    console.log('Pause all');
    // TODO: Implement pause all
  }, []);

  const handleResumeAll = useCallback(() => {
    console.log('Resume all');
    // TODO: Implement resume all
  }, []);

  const handleStopAll = useCallback(() => {
    console.log('Stop all');
    // TODO: Implement stop all
  }, []);

  // Calculate stage width based on margin visibility
  // Stage should occupy >70% in browse mode
  const getStageWidth = () => {
    if (config.marginVisible) {
      return `calc(100% - ${config.marginWidth}px)`;
    }
    return '100%';
  };

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100vh',
        width: '100%',
        backgroundColor: liquidGlassTokens.canvas.base,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Circuit Substrate Background */}
      <CircuitSubstrate density={4} opacity={0.04} animated={true} />

      {/* Zone 1: Source Navigator (Left Spine - 64px collapsed) */}
      <SourceNavigator
        sources={sources}
        stateFilters={stateFilters}
        activeSourceFilter={activeSourceFilter}
        activeStateFilter={activeStateFilter}
        onSourceFilterChange={setSourceFilter}
        onStateFilterChange={(state: string) => setStateFilter(state as "all" | TransformationState)}
        onRefresh={refresh}
        onSettings={handleSettingsClick}
      />

      {/* Main Content Area */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0, // Allow shrinking
          position: 'relative',
          transition: `all ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
        }}
      >
        {/* Zone 3: Health Pulse Bar (Top Header - ORIENTATION ONLY) */}
        <HealthPulseBar
          systemHealth={systemHealth}
          queueStats={queueStats}
          activeRecordingCount={activeRecordingCount}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          mode={mode}
          overheadContent={config.overheadContent}
        />

        {/* Zone 2 + Zone 5: Transformation Canvas + Detail Panel */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
            background: liquidGlassTokens.canvas.base,
            position: 'relative',
          }}
        >
          {/* Transformation Canvas (Center Primary) */}
          <Box
            sx={{
              width: getStageWidth(),
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transition: `width ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
            }}
          >
            <TransformationCanvas
              items={filteredItems}
              loading={loading}
              onItemClick={handleItemClick}
              onItemPlay={handleItemPlay}
              onItemUpload={handleItemUpload}
            />
          </Box>

          {/* Zone 5: Detail Panel (Right Breathing Margin) */}
          <DetailPanel
            item={selectedItem}
            visible={config.marginVisible}
            preview={config.marginPreview}
            width={config.marginWidth}
            onClose={handleCloseDetailPanel}
            onPlay={handleItemPlay}
            onUpload={handleItemUpload}
            onAnalyze={handleAnalyzeSelected}
          />
        </Box>

        {/* Zone 4: Bottom Dock (NEW - All actions live here) */}
        <BottomDock
          mode={mode}
          expanded={config.dockExpanded}
          minimized={config.dockMinimized}
          selectedItem={selectedItem}
          selectionCount={selectionCount}
          hasItems={items.length > 0}
          queueStats={queueStats}
          recordingSessions={recordingSessions}
          onExpand={expandDock}
          onCollapse={collapseDock}
          onToggle={toggleDock}
          onAddVideo={handleAddVideo}
          onSearch={handleSearch}
          onQuickUpload={handleQuickUpload}
          onUrlImport={handleUrlImport}
          onAnalyzeSelected={handleAnalyzeSelected}
          onPlaySelected={() => selectedItem && handleItemPlay(selectedItem)}
          onUploadSelected={() => selectedItem && handleItemUpload(selectedItem)}
          onPauseAll={handlePauseAll}
          onResumeAll={handleResumeAll}
          onStopAll={handleStopAll}
          gridDensity={config.stageGridDensity}
          onDensityChange={setGridDensity}
        />
      </Box>
    </Box>
  );
};

export default SpatialLayout;
