# DePin Node Integration Plan

## Overview
Consolidate DePin Node features from the dedicated `/depin` page into the unified Archive screen (SpatialLayout), with enhanced rewards display accessible via hover interaction.

## Current State (DePin Node Page)
- **Location:** `/depin` route with `DePinDashboard` component
- **Features:**
  - Points dashboard with:
    - Total points display
    - Rank title (Observer, Archivist, Signal Keeper, Chronicle Guardian, Mythic Librarian)
    - Day streak counter
    - Level progress bar (XP between levels)
    - Tier progress (progress to next tier)
  - Node activation toggle (activate/deactivate upload worker)
  - Upload worker configuration
  - Active operations display (running recordings, downloads, etc.)

## Target State (Archive Screen)
DePin Node features should be integrated into Archive with a focus on:
1. **Glanceable rewards** in Health Pulse Bar (points, streak)
2. **Detailed rewards** on hover over points indicator
3. **Node controls** accessible from Source Navigator
4. **Operations monitoring** in Detail Panel

### Integration Points

#### 1. Health Pulse Bar - Rewards Display
**Location:** `HealthPulseBar.tsx` (Top Header)

**Current State:**
- Shows basic points and streak as separate indicators
- No hover interaction for details

**Enhancements:**

**A. Basic Display (Always Visible)**
```tsx
// Combined points/streak indicator
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
  <PointsIcon sx={{ fontSize: 18, color: liquidGlassTokens.neon.amber }} />
  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: liquidGlassTokens.neon.amber }}>
    {points.toLocaleString()}
  </Typography>
  <StreakIcon sx={{ fontSize: 16, color: liquidGlassTokens.neon.amber }} />
  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: liquidGlassTokens.neon.amber }}>
    {streak}
  </Typography>
</Box>
```

**B. Hover Tooltip (Detailed Rewards)**
```tsx
<Tooltip
  title={
    <Box sx={{ p: 1 }}>
      {/* Rank Title */}
      <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#fff', mb: 1 }}>
        {rankTitle}
      </Typography>

      {/* Level Progress */}
      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography sx={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
            Level {level}
          </Typography>
          <Typography sx={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
            {points % 1000} / 1000 XP
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={(points % 1000) / 10}
          sx={{
            height: 4,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.1)',
            '& .MuiLinearProgress-bar': {
              background: `linear-gradient(90deg, ${liquidGlassTokens.neon.cyan}, ${liquidGlassTokens.neon.magenta})`
            }
          }}
        />
      </Box>

      {/* Tier Progress */}
      <Box sx={{ mb: 1 }}>
        <Typography sx={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', mb: 0.5 }}>
          {currentTier.name} → {nextTier.name}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={progressToNextTier}
          sx={{
            height: 4,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.1)',
            '& .MuiLinearProgress-bar': {
              background: liquidGlassTokens.neon.amber
            }
          }}
        />
      </Box>

      {/* Streak */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <LocalFireDepartment sx={{ fontSize: 12, color: liquidGlassTokens.neon.amber }} />
        <Typography sx={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
          {streak} day streak
        </Typography>
      </Box>
    </Box>
  }
  arrow
  PopperProps={{
    sx: {
      '& .MuiTooltip-tooltip': {
        background: liquidGlassTokens.canvas.elevated,
        border: `1px solid ${liquidGlassTokens.glass.border}`,
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }
    }
  }}
>
  {/* Points indicator from above */}
</Tooltip>
```

#### 2. Node Activation Toggle
**Location:** Source Navigator

Add "Node" section at bottom of Source Navigator with toggle switch and status indicator.

```tsx
// In SourceNavigator.tsx
<Box sx={{ mt: 'auto', pt: 2, borderTop: `1px solid ${liquidGlassTokens.glass.border}` }}>
  <Typography sx={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', mb: 1, textTransform: 'uppercase' }}>
    DePin Node
  </Typography>
  <FormControlLabel
    control={
      <Switch
        checked={nodeActive}
        onChange={handleToggleNode}
        disabled={!filecoinConfigured}
      />
    }
    label={
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <StatusIndicator status={nodeActive ? 'active' : 'inactive'} pulse={nodeActive} />
        <Typography sx={{ fontSize: '13px', fontWeight: 500 }}>
          {nodeActive ? 'Active' : 'Inactive'}
        </Typography>
      </Box>
    }
  />
</Box>
```

#### 3. Upload Worker Configuration
**Location:** Configuration Modal

Add "Upload Worker" tab to existing Configuration Modal.

Configuration options:
- Upload interval
- Concurrent uploads
- Retry settings
- Filecoin gateway selection

#### 4. Active Operations Monitoring
**Location:** Detail Panel

Auto-expand Detail Panel when operations are running. Show operations list with progress bars and pause/resume/stop controls.

## Implementation Steps

### Phase 1: Rewards Display Enhancement
1. Enhance Health Pulse Bar points/streak display
2. Implement hover tooltip with detailed rewards
3. Add rank title, level progress, tier progress
4. Add animations for points updates

### Phase 2: Node Controls
1. Add node toggle to Source Navigator
2. Integrate with existing `useDePinDashboard` hook
3. Add status indicator (active/inactive)
4. Add filecoin config check

### Phase 3: Operations Monitoring
1. Add operations display to Detail Panel
2. Show active operations with progress
3. Add pause/resume/stop controls
4. Real-time updates via polling

### Phase 4: Upload Worker Config
1. Add upload worker tab to Configuration Modal
2. Port configuration options from `UploadWorkerConfig`
3. Save/load configuration
4. Apply configuration to upload worker

## Backend Changes Required

### Health API Enhancement
**Current Issue:** Backend doesn't have a health API

**Required:**
```typescript
// GET /api/health
{
  backend_connected: boolean;
  wallet_connected: boolean;
  wallet_address?: string;
  encryption_enabled: boolean;
  points: number;
  streak: number;
  level: number;
  tier: string;
  node_active: boolean;
  filecoin_configured: boolean;
}
```

**Classification:** Backend change

### DePin Tick API
**Already exists:** `/api/depin/tick`

**No changes needed**

## Frontend Changes Required

### New Components
- `RewardsTooltip.tsx` - Reusable tooltip component for rewards display
- `OperationsPanel.tsx` - Operations monitoring in Detail Panel

### Modified Components
- `HealthPulseBar.tsx` - Enhanced rewards display with hover
- `SourceNavigator.tsx` - Add node toggle
- `DetailPanel.tsx` - Support operations view
- `ConfigurationModal.tsx` - Add upload worker tab

### Removed Components
- `DePinDashboard.tsx` - Can be deleted after migration
- `UploadWorkerConfig.tsx` - Can be integrated into Configuration Modal
- Remove `/depin` route from `App.tsx`

## UX Considerations

### Rewards Visibility
- Points and streak always visible in header
- Detailed rewards on hover (not click)
- Hover tooltip should be dismissible
- Animation when points increase

### Node Controls
- Toggle should be easily accessible
- Clear visual feedback for active/inactive state
- Warning if filecoin not configured
- Confirmation before deactivating (optional)

### Operations Monitoring
- Should not interrupt primary workflow
- Auto-expand when operations start
- Can be collapsed by user
- Real-time progress updates

## Testing Checklist

- [ ] Points and streak display in Health Pulse Bar
- [ ] Hover tooltip shows detailed rewards
- [ ] Rank title displays correctly
- [ ] Level progress bar accurate
- [ ] Tier progress bar accurate
- [ ] Node toggle appears in Source Navigator
- [ ] Node toggle activates/deactivates correctly
- [ ] Status indicator shows correct state
- [ ] Filecoin config check works
- [ ] Operations display in Detail Panel
- [ ] Operations show real-time progress
- [ ] Pause/resume/stop controls work
- [ ] Upload worker configuration saves/loads
- [ ] No navigation away from Archive screen

## Migration Notes

### Data Migration
- No data migration needed - all state is ephemeral

### Route Changes
- Remove `/depin` route
- All DePin functionality now under `/archive`

### Breaking Changes
- Direct links to `/depin` will need to redirect to `/archive`
- Consider adding URL parameter: `/archive?view=node`

## Success Metrics

- [ ] All DePin features accessible from Archive screen
- [ ] Rewards display is glanceable (header) and detailed (hover)
- [ ] Node controls easily accessible
- [ ] Operations monitoring doesn't interrupt workflow
- [ ] Visual consistency with Archive theme maintained
- [ ] Performance impact minimal
- [ ] Backend health API implemented