# "Add Your First Video" Feature Integration Plan

## Overview
Enhance the Archive screen's "Add Video" functionality to match the Dashboard's comprehensive modal that offers both local file and magnet URL options.

## Current State

### Dashboard (MainApp)
- **Location:** `/` route with `MainApp` component
- **Component:** `AddVideoModal.tsx`
- **Features:**
  - "Add from Local File" button (opens Electron file dialog)
  - "Add from Magnet URL" option (when BitTorrent plugin enabled)
  - Magnet URL input with validation
  - Clear visual separation between options
  - Liquid Glass themed design

### Archive (SpatialLayout)
- **Location:** `/archive` route with `SpatialLayout` component
- **Component:** `BottomDock.tsx`
- **Current "Add Video" Implementation:**
  - Basic "Add Video" button in collapsed dock
  - Expanded dock shows file browse and URL import
  - Less polished than Dashboard modal
  - No clear separation between options
  - No magnet URL validation

## Problem Statement
The Archive screen's "Add Video" functionality is less discoverable and less polished than the Dashboard's implementation. Users should have the same experience regardless of which screen they're on.

## Target State
The Archive screen should use the same `AddVideoModal` component as the Dashboard, providing a consistent and polished experience.

### Integration Points

#### 1. Reuse Existing AddVideoModal
**Location:** `AddVideoModal.tsx` (already exists)

**Current Implementation:**
- Well-designed modal with Liquid Glass theme
- Clear separation between local file and magnet URL options
- Magnet URL validation
- BitTorrent plugin detection

**Integration:**
- Import `AddVideoModal` into `SpatialLayout.tsx`
- Add state for modal open/close
- Pass required props:
  - `open`: boolean
  - `onClose`: () => void
  - `onAddLocalFile`: () => void
  - `onAddMagnetUrl`: (url: string) => void
  - `isBitTorrentEnabled`: boolean

#### 2. Bottom Dock Enhancement
**Location:** `BottomDock.tsx`

**Current State:**
```tsx
// Current implementation in BottomDock
<Button
  variant="contained"
  startIcon={<AddIcon />}
  onClick={onAddVideo}
  // ... styles
>
  Add Video
</Button>
```

**Enhanced State:**
```tsx
// Enhanced implementation
<Button
  variant="contained"
  startIcon={<AddIcon />}
  onClick={() => setAddVideoModalOpen(true)}
  // ... styles
>
  Add Video
</Button>

// Modal rendered at bottom of BottomDock
<AddVideoModal
  open={addVideoModalOpen}
  onClose={() => setAddVideoModalOpen(false)}
  onAddLocalFile={handleAddLocalFile}
  onAddMagnetUrl={handleAddMagnetUrl}
  isBitTorrentEnabled={isBitTorrentEnabled}
/>
```

#### 3. Empty State Enhancement
**Location:** `TransformationCanvas.tsx` or `BottomDock.tsx`

**Current Empty State:**
- Basic "No items" message
- "Add your first video" button

**Enhanced Empty State:**
```tsx
// When no items exist
<Box sx={{ textAlign: 'center', py: 8 }}>
  <VideoLibraryIcon sx={{ fontSize: 64, color: 'rgba(255,255,255,0.2)', mb: 2 }} />
  <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>
    Add your first video
  </Typography>
  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mb: 3 }}>
    Choose how you'd like to add content to your archive
  </Typography>
  
  <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
    <Button
      variant="outlined"
      startIcon={<FolderOpenIcon />}
      onClick={() => setAddVideoModalOpen(true)}
      // ... styles
    >
      Add from Local File
    </Button>
    
    {isBitTorrentEnabled && (
      <Button
        variant="outlined"
        startIcon={<LinkIcon />}
        onClick={() => setAddVideoModalOpen(true)}
        // ... styles
      >
        Add from Magnet URL
      </Button>
    )}
  </Box>
</Box>
```

#### 4. Quick Actions in Bottom Dock
**Location:** `BottomDock.tsx` (Expanded state)

**Current State:**
- File browse button
- URL input field
- URL submit button

**Enhanced State:**
Keep quick actions for power users, but also provide modal option:

```tsx
// In expanded dock
<Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
  {/* Quick file browse */}
  <Button
    variant="outlined"
    startIcon={<FolderOpenIcon />}
    onClick={handleFileBrowse}
    // ... styles
  >
    Browse
  </Button>
  
  {/* Quick URL import */}
  <TextField
    placeholder="Paste URL or magnet link..."
    value={urlInput}
    onChange={(e) => setUrlInput(e.target.value)}
    // ... styles
  />
  
  <Button
    variant="contained"
    startIcon={<UrlIcon />}
    onClick={handleUrlSubmit}
    disabled={!urlInput.trim()}
    // ... styles
  >
    Import
  </Button>
  
  {/* Or open full modal */}
  <Button
    variant="text"
    onClick={() => setAddVideoModalOpen(true)}
    sx={{ color: 'rgba(255,255,255,0.5)' }}
  >
    More options...
  </Button>
</Box>
```

## Implementation Steps

### Phase 1: Modal Integration
1. Import `AddVideoModal` into `SpatialLayout.tsx`
2. Add state for modal open/close
3. Pass required props from parent
4. Test modal opens/closes correctly

### Phase 2: Bottom Dock Enhancement
1. Update "Add Video" button to open modal
2. Keep quick actions in expanded dock
3. Add "More options..." link to modal
4. Test both quick actions and modal

### Phase 3: Empty State Enhancement
1. Update empty state in TransformationCanvas
2. Add clear call-to-action buttons
3. Show both options (local file and magnet URL)
4. Test empty state displays correctly

### Phase 4: BitTorrent Detection
1. Ensure BitTorrent plugin detection works
2. Show/hide magnet URL options based on plugin
6. Test with and without BitTorrent enabled

## Backend Changes Required
**None** - All functionality already exists

## Frontend Changes Required

### Modified Components
- `SpatialLayout.tsx` - Import and render AddVideoModal
- `BottomDock.tsx` - Update "Add Video" button to open modal
- `TransformationCanvas.tsx` - Enhance empty state

### No New Components Required
- Reuse existing `AddVideoModal.tsx`

## UX Considerations

### Discoverability
- "Add Video" button should be prominent in Bottom Dock
- Empty state should clearly show options
- Modal should be accessible from multiple entry points

### Consistency
- Same modal experience across Dashboard and Archive
- Same visual design and interactions
- Same validation and error handling

### Power Users
- Quick actions in expanded dock for frequent use
- Modal for less common options
- Keyboard shortcuts (if applicable)

### Error Handling
- Show clear error messages for invalid magnet URLs
- Handle file dialog cancellation gracefully
- Show upload progress after adding

## Testing Checklist

- [ ] "Add Video" button opens modal
- [ ] Modal displays correctly with Liquid Glass theme
- [ ] "Add from Local File" button works
- [ ] "Add from Magnet URL" option shows when BitTorrent enabled
- [ ] "Add from Magnet URL" option hides when BitTorrent disabled
- [ ] Magnet URL validation works
- [ ] Invalid magnet URL shows error
- [ ] Valid magnet URL adds video
- [ ] Modal closes after successful add
- [ ] Modal closes on cancel
- [ ] Empty state shows clear options
- [ ] Empty state buttons open modal
- [ ] Quick actions in expanded dock work
- [ ] "More options..." link opens modal
- [ ] File browse works from quick action
- [ ] URL import works from quick action
- [ ] No navigation away from Archive screen

## Migration Notes

### Data Migration
- No data migration needed

### Route Changes
- None

### Breaking Changes
- None - enhancement only

## Success Metrics

- [ ] Add Video experience matches Dashboard
- [ ] Modal opens from multiple entry points
- [ ] Both local file and magnet URL options work
- [ ] Empty state is clear and actionable
- [ ] Quick actions preserved for power users
- [ ] Visual consistency maintained
- [ ] No navigation required to add videos