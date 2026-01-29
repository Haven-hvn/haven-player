# Plugin Management Integration Plan

## Overview
Integrate plugin configuration into the unified Archive screen (SpatialLayout) using the existing SourceNavigator (left spine), providing quick access to individual plugin settings without navigation.

## Current State (Plugins Page)
- **Location:** `/plugins` route with `PluginManagementPage` component
- **Features:**
  - Plugin discovery (scan directories for new plugins)
  - Load/unload plugins
  - Restart plugins
  - Configure plugins (via `PluginConfigurationModal`)
  - View plugin sources (navigates to `/plugins/:pluginName/sources`)
  - Plugin health monitoring (via `usePluginHealth` hook)
  - Statistics: total plugins, active plugins, unhealthy plugins
  - Search/filter plugins

## Existing Components Available for Reuse

### 1. SourceNavigator (Left Spine)
- **Location:** `src/components/SpatialArchitecture/SourceNavigator.tsx`
- **Behavior:** 64px collapsed, expands to 240px on hover (150ms delay)
- **Current Bottom Actions:** Refresh, Settings, Help
- **Integration Point:** Add gear icon for plugin configuration in bottom actions

### 2. PluginCard Component
- **Location:** Currently defined inline in `PluginManagementPage.tsx` (lines 110-284)
- **Status:** NOT reusable as-is (needs extraction)
- **Features:** Load/Unload/Restart controls, health status, configure button, view sources button
- **Action Required:** Extract to standalone component with `mode` prop for list vs single view

### 3. PluginConfigurationModal
- **Location:** `src/components/Plugins/PluginConfigurationModal.tsx`
- **Status:** Already standalone and reusable
- **Features:** Schema-driven configuration, tabs for config and recurring jobs
- **Integration:** Can be used directly, no changes needed

### 4. DetailPanel
- **Location:** `src/components/SpatialArchitecture/DetailPanel.tsx`
- **Status:** Already exists, shows item details on selection
- **Integration:** Can be extended to show plugin sources

### 5. GlassCard
- **Location:** `src/components/LiquidGlass/GlassCard.tsx`
- **Status:** Available for popup styling
- **Variants:** `surface`, `elevated`, `hero`, `compact`
- **Integration:** Use `elevated` variant for plugin selection popup

## Target State (Archive Screen)
Plugin configuration should be accessible from within the Archive screen via the SourceNavigator's bottom actions, with individual plugin settings shown as popups/modals.

### Integration Points

#### 1. SourceNavigator Enhancement
**Location:** `src/components/SpatialArchitecture/SourceNavigator.tsx`

**Current Bottom Actions:**
```tsx
<BottomAction icon={<RefreshIcon />} label="Refresh" expanded={isExpanded} onClick={onRefresh} />
<BottomAction icon={<SettingsIcon />} label="Settings" expanded={isExpanded} onClick={onSettings} />
<BottomAction icon={<HelpIcon />} label="Help" expanded={isExpanded} />
```

**Changes:**
- Add a new `BottomAction` with gear icon for plugin configuration
- Position: Between Settings and Help
- Icon: Use `Extension` icon (already imported) or `Settings` icon with different tooltip

**Implementation:**
```tsx
// Add to imports
import { Extension as PluginIcon } from '@mui/icons-material';

// Add new prop to SourceNavigatorProps
interface SourceNavigatorProps {
  // ... existing props
  onPluginConfig?: () => void;
}

// Add to bottom actions
<BottomAction 
  icon={<PluginIcon />} 
  label="Plugins" 
  expanded={isExpanded}
  onClick={onPluginConfig} 
/>
```

#### 2. Plugin Selection Popup
**Location:** New component `src/components/Plugins/PluginSelectionPopup.tsx`

**When Active:** When the plugin icon is clicked in SourceNavigator

**Features:**
- Display a list of available plugins using extracted `PluginCard` component
- Each plugin item shows:
  - Plugin name, icon, version
  - Health status indicator
  - Load/unload status
  - Click to configure that specific plugin
- Compact, popup-style layout (not full screen)
- Positioned near the SourceNavigator or centered in viewport
- Close on click outside or ESC key

**Component Structure:**
```tsx
interface PluginSelectionPopupProps {
  open: boolean;
  onClose: () => void;
  onPluginSelect: (plugin: PluginMetadata) => void;
}

// Uses extracted PluginCard with mode="list"
```

**Design Considerations:**
- Use `GlassCard` with `variant="elevated"` for the popup container
- Maintain Liquid Glass theme
- Compact list view (no grid needed)
- Max width: 400px, max height: 500px with scroll
- Position: Absolute, anchored to SourceNavigator or centered

#### 3. Extract PluginCard for Reuse
**Location:** New component `src/components/Plugins/PluginCard.tsx`

**Current State:** Defined inline in `PluginManagementPage.tsx` (lines 110-284)

**Changes Required:**
1. Extract to standalone file
2. Add `mode` prop: `"list"` | `"single"` | `"grid"`
3. Adjust layout based on mode:
   - `list`: Compact, horizontal layout
   - `single`: Full controls, configuration form inline
   - `grid`: Current card layout (for PluginManagementPage)

**Component Interface:**
```tsx
interface PluginCardProps {
  plugin: PluginMetadata;
  health: PluginHealth | undefined;
  mode: 'list' | 'single' | 'grid';
  onLoad: () => void;
  onUnload: () => void;
  onRestart: () => void;
  onConfigure: () => void;
  onViewSources: () => void;
}
```

**Mode Behaviors:**
- `list`: Compact row, minimal info, click to open single view
- `single`: Full card with all controls, can include configuration form
- `grid`: Current card layout (for backward compatibility)

#### 4. Individual Plugin Configuration Popup
**Location:** New component `src/components/Plugins/PluginConfigPopup.tsx`

**When Active:** When a plugin is clicked in the Plugin Selection Popup

**Features:**
- Show `PluginCard` with `mode="single"`
- Include all plugin controls:
  - Load/Unload/Restart buttons
  - Health status
  - Configuration form (reuse `PluginConfigurationModal` content or open modal)
  - View Sources button (opens in Detail Panel)
- Popup/modal style within the existing screen

**Two Approaches:**

**Option A: Popup with Inline Config**
- Embed configuration form directly in popup
- More complex but keeps everything in one place
- Good for simple plugins

**Option B: Popup + Modal (Recommended)**
- Popup shows plugin card with controls
- "Configure" button opens existing `PluginConfigurationModal`
- Simpler, reuses existing modal
- Better for complex configurations with tabs

**Recommended:** Option B - reuse existing `PluginConfigurationModal`

**Component Structure:**
```tsx
interface PluginConfigPopupProps {
  open: boolean;
  plugin: PluginMetadata | null;
  onClose: () => void;
  onViewSources: (plugin: PluginMetadata) => void;
}

// Uses PluginCard with mode="single"
// Configure button opens PluginConfigurationModal
```

#### 5. Plugin Sources View in DetailPanel
**Location:** `src/components/SpatialArchitecture/DetailPanel.tsx`

**Current State:** Shows video item details

**Integration:**
- Extend to support plugin sources as content type
- When user clicks "View Sources" on a plugin:
  - Expand Detail Panel with plugin sources
  - Reuse `PluginSourcesView` component (currently at `/plugins/:pluginName/sources`)
  - No navigation required
- User can close Detail Panel to return to archive view

**Implementation:**
```tsx
interface DetailPanelProps {
  // ... existing props
  contentType?: 'video' | 'plugin-sources';
  pluginSources?: any[];
}

// Add conditional rendering for plugin sources
```

#### 6. Plugin Health Monitoring
**Location:** `usePluginHealth` hook (already exists)

**Integration:**
- Continue polling in background (already implemented)
- Display health indicators in:
  - Plugin Selection Popup (each plugin item)
  - Individual Plugin Configuration Popup
  - Health Pulse Bar (add "Plugins" indicator if any unhealthy)

**Health Pulse Bar Enhancement:**
```tsx
// Add to HealthPulseBar props
interface HealthPulseBarProps {
  // ... existing props
  pluginHealthStatus?: PluginHealth[];
}

// Show indicator if any unhealthy plugins
```

## Implementation Steps

### Phase 1: Extract PluginCard
1. Create `src/components/Plugins/PluginCard.tsx`
2. Extract PluginCard from `PluginManagementPage.tsx` (lines 110-284)
3. Add `mode` prop with three modes: `'list' | 'single' | 'grid'`
4. Update `PluginManagementPage.tsx` to use extracted component with `mode="grid"`
5. Test that PluginManagementPage still works correctly

### Phase 2: SourceNavigator Enhancement
1. Add `onPluginConfig` prop to `SourceNavigatorProps`
2. Add plugin icon to bottom actions
3. Update `SpatialLayout.tsx` to handle plugin config click
4. Test that icon appears and click handler works

### Phase 3: Plugin Selection Popup
1. Create `src/components/Plugins/PluginSelectionPopup.tsx`
2. Use `GlassCard` with `variant="elevated"` for container
3. Use extracted `PluginCard` with `mode="list"`
4. Implement popup positioning and close behavior
5. Add state management in `SpatialLayout.tsx`
6. Test popup opens/closes correctly

### Phase 4: Individual Plugin Configuration
1. Create `src/components/Plugins/PluginConfigPopup.tsx`
2. Use `PluginCard` with `mode="single"`
3. Integrate existing `PluginConfigurationModal` for configuration
4. Add state management for selected plugin
5. Test configuration flow

### Phase 5: Plugin Sources in DetailPanel
1. Extend `DetailPanel` to support plugin sources content type
2. Integrate `PluginSourcesView` component
3. Add "View Sources" handler in plugin config popup
4. Test sources display in Detail Panel

### Phase 6: Health Integration
1. Add plugin health to Health Pulse Bar
2. Ensure health indicators display in popups
3. Verify background health polling continues

### Phase 7: Cleanup
1. Remove `/plugins` route from `App.tsx` (optional, can keep for power users)
2. Remove `/plugins/:pluginName/sources` route (optional)
3. Update Sidebar to redirect `/plugins` to `/archive` with plugin config open
4. Update documentation

## Backend Changes Required
**None** - All plugin management APIs already exist

## Frontend Changes Required

### New Components
- `src/components/Plugins/PluginCard.tsx` - Extracted from PluginManagementPage
- `src/components/Plugins/PluginSelectionPopup.tsx` - Popup showing list of plugins
- `src/components/Plugins/PluginConfigPopup.tsx` - Popup wrapper for single plugin configuration

### Modified Components
- `src/components/SpatialArchitecture/SourceNavigator.tsx` - Add plugin icon to bottom actions
- `src/components/SpatialArchitecture/SpatialLayout.tsx` - Add state for plugin popups
- `src/components/SpatialArchitecture/DetailPanel.tsx` - Support plugin sources view
- `src/components/SpatialArchitecture/HealthPulseBar.tsx` - Add plugin health indicator
- `src/components/Plugins/PluginManagementPage.tsx` - Use extracted PluginCard

### Optional Components to Remove
- `/plugins` route from `App.tsx` (can keep for power users)
- `/plugins/:pluginName/sources` route from `App.tsx` (can keep for power users)

## UX Considerations

### Discoverability
- Plugin icon should be visible in SourceNavigator when expanded
- Consider adding a tooltip: "Configure Plugins"
- First-time users might need a hint or onboarding

### Context Preservation
- All interactions happen within the Archive screen
- No navigation away from current view
- User can continue browsing archive while plugin config is open

### Performance
- Plugin health polling should continue regardless of popup state
- Plugin selection popup should load quickly (lazy load if needed)
- Configuration modal should not block main thread

### Visual Consistency
- Use existing Liquid Glass design tokens
- Match popup styles with other modals in the app
- Maintain consistent spacing and typography
- Plugin icon should match other icons in SourceNavigator

### Interaction Design
- SourceNavigator hover → Plugin icon appears (when expanded)
- Click plugin icon → Plugin Selection Popup opens
- Click plugin → Plugin Configuration Popup opens (replaces selection popup)
- Click "Configure" → Opens PluginConfigurationModal
- Click outside or ESC → Close current popup
- View Sources → Opens Detail Panel (popups can remain open or close)

## Testing Checklist

### Phase 1: PluginCard Extraction
- [ ] PluginCard extracted to standalone component
- [ ] PluginManagementPage still works with `mode="grid"`
- [ ] All three modes (`list`, `single`, `grid`) render correctly

### Phase 2: SourceNavigator Enhancement
- [ ] Plugin icon appears in SourceNavigator when expanded
- [ ] Click handler triggers correctly
- [ ] Icon styling matches other bottom actions

### Phase 3: Plugin Selection Popup
- [ ] Popup opens when plugin icon clicked
- [ ] Popup shows all available plugins
- [ ] Each plugin item shows health status and load state
- [ ] Popup closes on click outside or ESC
- [ ] Popup positioning is correct

### Phase 4: Individual Plugin Configuration
- [ ] Clicking a plugin opens Plugin Configuration Popup
- [ ] Popup shows single plugin with all controls
- [ ] Load/unload/restart plugins works from popup
- [ ] Configure button opens PluginConfigurationModal
- [ ] Configuration saves correctly

### Phase 5: Plugin Sources in DetailPanel
- [ ] View Sources button opens Detail Panel
- [ ] Plugin sources display correctly
- [ ] Detail Panel can be closed

### Phase 6: Health Integration
- [ ] Health indicators display in popups
- [ ] Health Pulse Bar shows plugin status
- [ ] Background health polling continues

### Phase 7: Integration
- [ ] No navigation away from Archive screen
- [ ] Multiple popups don't overlap incorrectly
- [ ] PluginManagementPage still accessible (if kept)

## Migration Notes

### Data Migration
- No data migration needed - all state is ephemeral

### Route Changes
- Optional: Remove `/plugins` route
- Optional: Remove `/plugins/:pluginName/sources` route
- All plugin functionality now accessible from `/archive`

### Breaking Changes
- Direct links to `/plugins` will need to redirect to `/archive`
- Consider adding URL parameter: `/archive?pluginConfig=true` to open config on load

### Backward Compatibility
- Optionally keep `/plugins` route for power users who prefer full-screen management
- Could redirect `/plugins` to `/archive` with plugin config auto-opened

## Success Metrics

- [ ] Plugin configuration accessible from Archive screen without navigation
- [ ] Plugin icon discoverable but not intrusive
- [ ] Plugin selection popup loads quickly
- [ ] Individual plugin configuration works smoothly
- [ ] Plugin health monitoring continues in background
- [ ] Visual consistency with Archive theme maintained
- [ ] Performance impact minimal
- [ ] User can configure plugins without losing context of archive view
- [ ] Existing PluginManagementPage still works (if kept)

## Alternative: Full Plugin Management View (Fallback)

If the popup approach proves too limiting, consider this hybrid approach:

1. Keep the plugin icon in SourceNavigator
2. When clicked, show a compact plugin management panel in the Transformation Canvas
3. This panel would be a simplified version of the current `/plugins` page
4. Still within Archive screen, no navigation required

This provides more screen real estate for plugin management while maintaining the integration goal.

## Code Reuse Summary

### Directly Reusable (No Changes)
- `PluginConfigurationModal.tsx` - Use as-is
- `usePlugins.ts` hook - Use as-is
- `usePluginHealth.ts` hook - Use as-is
- `GlassCard.tsx` - Use for popup styling
- `DetailPanel.tsx` - Extend for plugin sources

### Requires Extraction
- `PluginCard` - Extract from PluginManagementPage, add mode prop

### Requires Modification
- `SourceNavigator.tsx` - Add plugin icon
- `SpatialLayout.tsx` - Add state for popups
- `HealthPulseBar.tsx` - Add plugin health indicator
- `PluginManagementPage.tsx` - Use extracted PluginCard

### New Components
- `PluginSelectionPopup.tsx`
- `PluginConfigPopup.tsx`