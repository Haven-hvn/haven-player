# Haven Spatial Architecture - Anti-Patterns Documentation

This document explicitly defines rejected UI/UX patterns and their preferred alternatives for the Haven Archival Interface. These patterns should be enforced in code reviews and component design.

## Overview

The Haven interface follows a **transformation-first, observation-first** mental model. The spatial architecture is designed around the concept that:

- **"Actions rise to meet the hand"** - The Dock is where capability lives
- **"Detail appears when attention narrows"** - The Margin doesn't exist until you need it
- **"Watching is working"** - Double-clicking doesn't navigate—it transforms the Stage

---

## Anti-Pattern 1: Fat Left Sidebar (>200px persistent)

### ❌ Why Rejected
- Steals precious Stage space for low-frequency navigation
- Navigation is not a constant activity—most time is spent viewing content
- Persistent large sidebars create visual imbalance and reduce content area

### ✅ Instead Do
- **64px collapsed Spine** that expands to ~240px on hover
- Shows icons only when collapsed, full labels on expand
- Smooth expand/collapse transition (<300ms)
- Settings and low-frequency actions live in the Spine, not the Header

### Implementation
```typescript
// SourceNavigator.tsx
const SPINE_COLLAPSED_WIDTH = 64;
const SPINE_EXPANDED_WIDTH = 240;
const HOVER_DELAY = 150; // ms delay before expanding
```

---

## Anti-Pattern 2: Action-Heavy Header

### ❌ Why Rejected
- Forces eyes to leave content to find action buttons
- Conflates orientation with command—headers should orient, not command
- Creates a cluttered top bar that competes for attention

### ✅ Instead Do
- **Header for status/orientation ONLY**
- Search/filter is acceptable (read-only filtering, not action)
- System health indicators, breadcrumbs, queue status
- All action buttons move to the **Bottom Dock**

### Implementation
```typescript
// HealthPulseBar.tsx - SHOULD contain:
// - Connection status indicators
// - System health at a glance
// - Current context breadcrumbs
// - Search (filtering, not action)

// HealthPulseBar.tsx - SHOULD NOT contain:
// - Add/Upload buttons (use BottomDock)
// - Settings button (use SourceNavigator)
// - Any action triggers that modify data
```

---

## Anti-Pattern 3: Modal Settings as Default

### ❌ Why Rejected
- Context-switching friction—user loses their place
- Modals interrupt workflow and require mental context restoration
- Settings often need to be glanced at while working on content

### ✅ Instead Do
- **Margin surfaces common settings inline**
- Quick actions and item-specific settings in the Detail Panel
- Modal only for complex multi-step operations or destructive actions
- Preview state (hover) vs full state (click) for progressive disclosure

### Implementation
```typescript
// DetailPanel.tsx
// Preview mode: Quick glance at item details on hover
// Full mode: Complete details and actions on click
// Complex operations (e.g., encryption config) can use modal
```

---

## Anti-Pattern 4: Page-Based Navigation

### ❌ Why Rejected
- Disrupts workflow; user loses visual context of where they were
- Each page load is a mental reset requiring re-orientation
- Users must remember what they were doing before the navigation

### ✅ Instead Do
- **Stage state changes, not route changes**
- UI transforms in place without full page navigation
- Escape key returns to previous state
- Breadcrumbs show context, not navigation history

### Implementation
```typescript
// SpatialLayout.tsx
// Mode changes transform the layout without route changes:
// - Browse mode: Grid view
// - Focused mode: Grid + expanded margin
// - Player mode: Stage transforms to video player
// - Upload mode: Progress overlay, same context
```

---

## Anti-Pattern 5: Context Menu for Primary Actions

### ❌ Why Rejected
- Primary actions need discoverability—hidden menus aren't discoverable
- Right-click is for power users; casual users won't find it
- Different platforms handle context menus differently

### ✅ Instead Do
- **Margin shows actions** when item is selected
- **Dock updates with context**—shows relevant actions based on selection
- Context menus can exist for secondary/advanced options
- Primary actions always visible: Play, Upload, Analyze

### Implementation
```typescript
// BottomDock.tsx
// Context-responsive actions:
// - Empty state: "Add Your First Video"
// - Selection: Play, Upload, Analyze buttons
// - Recording mode: Pause All, Stop All batch controls
// - Upload mode: Pause All, Resume queue controls
```

---

## Anti-Pattern 6: Fixed Grid Density

### ❌ Why Rejected
- Doesn't respect user preference for viewing content
- Doesn't adapt to different screen sizes or use cases
- One-size-fits-all reduces usability for different workflows

### ✅ Instead Do
- **Dynamic density control** in bottom-right corner of Dock
- Three density options: Compact, Normal, Comfortable
- Persists user preference
- Responsive to available space

### Implementation
```typescript
// BottomDock.tsx
// Density control buttons: Compact | Normal | Comfortable
// Each affects grid card size and spacing
// Stored in useLayoutMode config.stageGridDensity
```

---

## Anti-Pattern 7: Full-Page Video Player

### ❌ Why Rejected
- Destroys browsing context—user loses their place in the grid
- Requires full navigation back to resume browsing
- Mental context switch when entering/exiting player

### ✅ Instead Do
- **Stage transforms** to video player in place
- Mini-dock floats for controls
- Escape key returns to grid view
- Timestamp navigator appears where margin would be
- User never loses their place

### Implementation
```typescript
// useLayoutMode.ts
const enterPlayerMode = useCallback((item: TransformationItem) => {
  // Transform Stage, don't navigate
  applyTransition('player', {}, state.selectedItem, item);
}, [applyTransition, state.selectedItem]);

// Escape key handler returns to previous mode
if (event.key === 'Escape' && state.mode === 'player') {
  exitPlayerMode();
}
```

---

## Mode Specifications Summary

| Mode | Stage | Dock | Margin | Overhead |
|------|-------|------|--------|----------|
| Browse | Grid of cards | Collapsed, shows [+] [🔍] | Hidden | Active filters |
| Focused | Grid + highlight ring | Updates for selection | Expands with details | Item context |
| Recording | Cards with overlays | Batch controls | Hidden | "Recording 3 streams" |
| Upload | Cards with progress | [Pause All] [Resume] | Hover: upload details | "Uploading 8/12" |
| Player | Near-fullscreen | Mini floating dock | Timestamp navigator | Close/minimize only |

---

## Code Review Checklist

When reviewing PR/code changes, verify:

- [ ] No action buttons added to Header (HealthPulseBar)
- [ ] New actions added to BottomDock, not Header
- [ ] Left sidebar stays 64px collapsed, expands on hover only
- [ ] No new full-page route navigation for content viewing
- [ ] Modal dialogs justified (not just settings/config)
- [ ] Primary actions are discoverable (not hidden in menus)
- [ ] Stage occupies >70% viewport in browse mode
- [ ] Transitions complete in <300ms
- [ ] Escape key properly handled for mode exit

---

## Component-Level Enforcement

### HealthPulseBar.tsx
```typescript
/**
 * ANTI-PATTERN AVOIDED: Action-Heavy Header
 * This component should NEVER contain:
 * - Add/Upload buttons (use BottomDock)
 * - Settings button (use SourceNavigator)
 * - Any action triggers that modify data
 */
```

### SourceNavigator.tsx
```typescript
/**
 * ANTI-PATTERN AVOIDED: Fat Left Sidebar (>200px persistent)
 * - 64px collapsed, ~240px expanded on hover
 * - Settings and low-frequency actions live here
 */
```

### DetailPanel.tsx
```typescript
/**
 * ANTI-PATTERN AVOIDED: Modal Settings as Default
 * - Margin surfaces info inline, not in modal
 * - Preview state on hover, full state on click
 */
```

### SpatialLayout.tsx
```typescript
/**
 * ANTI-PATTERNS AVOIDED:
 * - Page-Based Navigation: Stage transforms, not route changes
 * - Full-Page Video Player: Stage transforms; Escape returns
 * - Fat Left Sidebar: 64px Spine, expand on hover
 * - Action-Heavy Header: Header for status; Dock for actions
 */
```

---

## Key Quotes to Remember

> **"Actions rise to meet the hand."**  
> The Dock is where capability lives. Users learn that looking down means "what can I do?"

> **"Detail appears when attention narrows."**  
> The Margin doesn't exist until you need it.

> **"Watching is working."**  
> Double-clicking doesn't navigate—it transforms the Stage. The user never loses their place.

---

*Last updated: January 2026*
*Part of the Haven Archival Interface Spatial Architecture*
