/**
 * Spatial Architecture Components
 * 
 * Haven's transformation-first interface components following the
 * post-filesystem spatial flow paradigm.
 * 
 * Key Design Principles (see ANTI_PATTERNS.md for full documentation):
 * - "Actions rise to meet the hand" - Dock is where capability lives
 * - "Detail appears when attention narrows" - Margin is ephemeral
 * - "Watching is working" - Stage transforms, not page navigates
 * 
 * Zone Layout:
 * - Zone 1: SourceNavigator (Left Spine - 64px collapsed)
 * - Zone 2: TransformationCanvas (Center Stage)
 * - Zone 3: HealthPulseBar (Top Header - orientation only)
 * - Zone 4: BottomDock (Action center - all actions live here)
 * - Zone 5: DetailPanel (Right Breathing Margin - ephemeral)
 */

// Main container
export { default as SpatialLayout } from './SpatialLayout';

// Zone Components
export { default as SourceNavigator } from './SourceNavigator';
export { default as HealthPulseBar } from './HealthPulseBar';
export { default as TransformationCanvas } from './TransformationCanvas';
export { default as BottomDock } from './BottomDock';
export { default as DetailPanel } from './DetailPanel';

// Deprecated - functionality merged into BottomDock
export { default as OperationQueueTray } from './OperationQueueTray';

// Pipeline Stage Indicator
export { PipelineStageIndicator } from './PipelineStageIndicator';

// DePIN Components
export { default as RewardsTooltip } from './RewardsTooltip';
export { default as OperationsPanel } from './OperationsPanel';

// Hooks
export { useLayoutMode } from './hooks/useLayoutMode';
export type { 
  LayoutMode, 
  LayoutModeConfig, 
  LayoutModeState, 
  UseLayoutModeReturn 
} from './hooks/useLayoutMode';
