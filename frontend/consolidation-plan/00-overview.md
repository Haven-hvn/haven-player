# Archive Screen Consolidation - Overview

## Executive Summary
This consolidation plan aims to merge four separate screens (Dashboard, Plugins, DePin Node, My Videos) into a single, unified Archive screen. The goal is to create a cohesive user experience where all functionality is accessible without navigation, following the Spatial Architecture design principles.

## Current State

### Separate Screens
1. **Dashboard (`/`)**
   - Video list with analysis status
   - "Add your first video" modal (local file + magnet URL)
   - Search and view mode controls
   - Analyze all functionality

2. **Plugins (`/plugins`)**
   - Plugin discovery and management
   - Load/unload/restart plugins
   - Plugin configuration
   - View plugin sources
   - Plugin health monitoring

3. **DePin Node (`/depin`)**
   - Points dashboard with XP bar and tiers
   - Day streak counter
   - Node activation toggle
   - Upload worker configuration
   - Active operations monitoring
   - Activity log

4. **My Videos (`/my-videos`)**
   - Video grid view
   - Upload functionality

5. **Archive (`/archive`)**
   - Spatial Architecture layout
   - Source Navigator (left spine)
   - Health Pulse Bar (top header)
   - Transformation Canvas (center)
   - Detail Panel (right margin)
   - Bottom Dock (actions)

## Target State

### Unified Archive Screen
All functionality consolidated into `/archive` route with SpatialLayout:

- **Source Navigator**: Browse by source type (All, Local, Plugins, etc.)
- **Health Pulse Bar**: System status at a glance (backend, wallet, encryption, points, streak)
- **Transformation Canvas**: Content display (videos, plugins, operations)
- **Detail Panel**: Contextual details (video info, plugin sources, operations)
- **Bottom Dock**: All actions (add video, search, upload, analyze)

## Missing Features to Integrate

### 1. Plugin Management
**Current:** Separate `/plugins` page
**Target:** Accessible via "Plugins" source in Source Navigator

**Features:**
- Plugin discovery
- Load/unload/restart plugins
- Plugin configuration
- View plugin sources
- Plugin health monitoring

### 2. DePin Node Features
**Current:** Separate `/depin` page
**Target:** Integrated into Archive with enhanced rewards display

**Features:**
- Points and streak (always visible in header)
- Detailed rewards on hover (rank, level, tier, XP bar)
- Node activation toggle (Source Navigator)
- Upload worker configuration (Settings modal)
- Active operations monitoring (Detail Panel)
- Activity log (Detail Panel)

### 3. "Add Your First Video"
**Current:** Dashboard has polished modal, Archive has basic implementation
**Target:** Use same modal across both screens

**Features:**
- "Add from Local File" button
- "Add from Magnet URL" option (when BitTorrent enabled)
- Magnet URL validation
- Clear visual separation

### 4. Encryption Status
**Current:** Shows in header but never green (hardcoded to false)
**Target:** Accurate status from Filecoin config

**Features:**
- Green indicator when encryption enabled
- Amber/warning when not configured
- Clickable to open Settings > Filecoin
- Accurate status from backend

### 5. Backend Health API
**Current:** No health API, values hardcoded
**Target:** Real `/api/health` endpoint

**Features:**
- Backend connection status
- Wallet connection status
- Encryption status
- DePin stats (points, streak, level, tier)
- Plugin status

## Implementation Plans

### 1. Plugin Management Integration
**File:** `01-plugin-management-integration.md`

- Add "Plugins" source to Source Navigator
- Create PluginManagementView component
- Integrate plugin configuration modal
- Show plugin sources in Detail Panel
- Add plugin health to Health Pulse Bar

### 2. DePin Node Integration
**File:** `02-depin-node-integration.md`

- Enhance Health Pulse Bar with hover tooltip for detailed rewards
- Add node toggle to Source Navigator
- Show operations in Detail Panel
- Add activity log to Detail Panel
- Integrate upload worker config into Settings modal

### 3. "Add Your First Video" Enhancement
**File:** `03-add-video-enhancement.md`

- Reuse AddVideoModal component in SpatialLayout
- Update Bottom Dock to open modal
- Enhance empty state with clear options
- Keep quick actions for power users

### 4. Encryption Status & Backend Health API
**File:** `04-encryption-health-api.md`

- Create `/api/health` endpoint in backend
- Update frontend to call health API
- Fix encryption status display
- Add clickable indicator for configuration

## Backend vs Frontend Classification

### Backend Changes
1. **Health API** (`/api/health`)
   - System health endpoint
   - Wallet connection check
   - Encryption status from Filecoin config
   - DePin stats
   - Plugin status

### Frontend Changes
1. **Plugin Management**
   - Source Navigator enhancement
   - PluginManagementView component
   - Detail Panel integration

2. **DePin Node**
   - Health Pulse Bar enhancement
   - Source Navigator node toggle
   - Detail Panel operations/log
   - Settings modal upload worker tab

3. **Add Video**
   - AddVideoModal integration
   - Bottom Dock enhancement
   - Empty state enhancement

4. **Encryption & Health**
   - Health API integration
   - Encryption status fix
   - Clickable indicators

## Design Principles

### Spatial Architecture
- **Zone 1: Source Navigator** - Navigation and filtering (64px collapsed, 240px expanded)
- **Zone 2: Transformation Canvas** - Content display (expands to fill available space)
- **Zone 3: Health Pulse Bar** - Orientation only (no actions)
- **Zone 4: Bottom Dock** - All actions (collapsed 56px, expanded 180px)
- **Zone 5: Detail Panel** - Contextual details (ephemeral, appears on selection)

### Anti-Patterns Avoided
- Page-based navigation (use state changes instead)
- Action-heavy header (actions in dock)
- Full-page video player (stage transforms)
- Fat left sidebar (collapsed spine, expand on hover)

### Liquid Glass Theme
- Consistent design tokens
- Glass morphism effects
- Neon accent colors
- Smooth animations

## Implementation Phases

### Phase 1: Foundation (Week 1)
- Backend health API
- Frontend health integration
- Encryption status fix

### Phase 2: Plugin Management (Week 2)
- Source Navigator Plugins source
- PluginManagementView component
- Plugin configuration integration

### Phase 3: DePin Node (Week 3)
- Rewards hover tooltip
- Node toggle in Source Navigator
- Operations in Detail Panel

### Phase 4: Add Video (Week 4)
- AddVideoModal integration
- Bottom Dock enhancement
- Empty state enhancement

### Phase 5: Polish & Testing (Week 5)
- Visual consistency
- Performance optimization
- Comprehensive testing
- Documentation

## Success Metrics

### Functional
- [ ] All features accessible from Archive screen
- [ ] No navigation required for any feature
- [ ] Plugin management works
- [ ] DePin features work
- [ ] Add video works
- [ ] Encryption status accurate
- [ ] Health API functional

### UX
- [ ] Consistent visual design
- [ ] Smooth animations
- [ ] Clear discoverability
- [ ] Intuitive navigation
- [ ] Responsive layout

### Performance
- [ ] No performance degradation
- [ ] Efficient polling
- [ ] Smooth transitions
- [ ] Minimal re-renders

## Migration Notes

### Route Changes
- Remove `/plugins` route
- Remove `/depin` route
- Remove `/my-videos` route
- All functionality under `/archive`

### Component Changes
- Remove `PluginManagementPage.tsx`
- Remove `DePinDashboard.tsx`
- Remove `VideoGrid.tsx` (or integrate)
- Reuse `AddVideoModal.tsx`

### Breaking Changes
- Direct links to removed routes need redirects
- Consider URL parameters for deep linking:
  - `/archive?source=plugins`
  - `/archive?view=node`

## Testing Strategy

### Unit Tests
- Health API integration
- Plugin management functions
- DePin state management
- Add video handlers

### Integration Tests
- End-to-end workflows
- Navigation flows
- State persistence
- Error handling

### E2E Tests
- User journeys
- Cross-screen consistency
- Performance benchmarks
- Accessibility

## Documentation

### Developer Docs
- Component architecture
- State management
- API contracts
- Testing guidelines

### User Docs
- Feature overview
- How-to guides
- Troubleshooting
- FAQ

## Risks & Mitigations

### Risk 1: Complexity Overload
**Mitigation:** Incremental implementation, clear separation of concerns

### Risk 2: Performance Degradation
**Mitigation:** Performance profiling, efficient polling, memoization

### Risk 3: User Confusion
**Mitigation:** Clear visual hierarchy, intuitive navigation, onboarding

### Risk 4: Backend Dependencies
**Mitigation:** Mock data for development, clear API contracts, fallbacks

## Next Steps

1. Review and approve all plan documents
2. Set up development branches
3. Implement backend health API
4. Begin frontend integration
5. Continuous testing and feedback
6. Documentation updates
7. Release preparation

## Contact

For questions or clarifications about this consolidation plan, please refer to the individual plan documents:
- `01-plugin-management-integration.md`
- `02-depin-node-integration.md`
- `03-add-video-enhancement.md`
- `04-encryption-health-api.md`