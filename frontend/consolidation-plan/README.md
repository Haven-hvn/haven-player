# Archive Screen Consolidation Plan

This directory contains the detailed implementation plans for consolidating the Dashboard, Plugins, DePin Node, and My Videos screens into a unified Archive screen.

## 📋 Plan Documents

### [00-overview.md](./00-overview.md)
**Executive Summary & Roadmap**
- High-level overview of the consolidation effort
- Current vs. target state comparison
- Implementation phases and timeline
- Success metrics and risks

### [01-plugin-management-integration.md](./01-plugin-management-integration.md)
**Plugin Management Features**
- Integrating `/plugins` page into Archive
- Adding "Plugins" source to Source Navigator
- Creating PluginManagementView component
- Plugin configuration and sources in Detail Panel
- Plugin health monitoring

### [02-depin-node-integration.md](./02-depin-node-integration.md)
**DePin Node Features**
- Integrating `/depin` page into Archive
- Enhanced rewards display with hover tooltip
- Node activation toggle in Source Navigator
- Operations monitoring in Detail Panel
- Activity log and metrics display
- Upload worker configuration

### [03-add-video-enhancement.md](./03-add-video-enhancement.md)
**"Add Your First Video" Feature**
- Reusing AddVideoModal in Archive
- Bottom Dock enhancement
- Empty state improvements
- Quick actions for power users

### [04-encryption-health-api.md](./04-encryption-health-api.md)
**Encryption Status & Backend Health API**
- Creating `/api/health` endpoint (Backend)
- Fixing encryption status display
- Adding clickable indicators
- Real-time health monitoring

## 🎯 Goals

1. **Unified Experience**: All functionality accessible from a single screen
2. **No Navigation**: Users should never need to leave the Archive screen
3. **Consistent Design**: Maintain Liquid Glass theme throughout
4. **Enhanced UX**: Better discoverability and intuitive interactions
5. **Performance**: No degradation from consolidation

## 🏗️ Architecture

### Spatial Layout Zones
- **Zone 1: Source Navigator** - Navigation and filtering
- **Zone 2: Transformation Canvas** - Content display
- **Zone 3: Health Pulse Bar** - Orientation only
- **Zone 4: Bottom Dock** - All actions
- **Zone 5: Detail Panel** - Contextual details

### Design Principles
- Page-based navigation → State-based navigation
- Action-heavy header → Actions in dock
- Fat sidebar → Collapsed spine
- Separate screens → Unified Archive

## 📊 Backend vs Frontend Classification

### Backend Changes
- ✅ `/api/health` endpoint
- ✅ Wallet connection check
- ✅ Encryption status from Filecoin config
- ✅ DePin stats aggregation
- ✅ Plugin status monitoring

### Frontend Changes
- ✅ Source Navigator enhancements
- ✅ Health Pulse Bar enhancements
- ✅ Bottom Dock enhancements
- ✅ Detail Panel enhancements
- ✅ New components (PluginManagementView, etc.)
- ✅ Component removals (PluginManagementPage, DePinDashboard, etc.)

## 🚀 Implementation Phases

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

## ✅ Success Metrics

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

## 📝 Key Features to Integrate

### 1. Plugin Management
- Plugin discovery
- Load/unload/restart plugins
- Plugin configuration
- View plugin sources
- Plugin health monitoring

### 2. DePin Node
- Points and streak display
- Detailed rewards on hover
- Node activation toggle
- Upload worker configuration
- Active operations monitoring
- Activity log

### 3. Add Video
- "Add from Local File" button
- "Add from Magnet URL" option
- Magnet URL validation
- Clear visual separation

### 4. Encryption Status
- Green indicator when enabled
- Amber/warning when not configured
- Clickable to open settings
- Accurate status from backend

### 5. Backend Health API
- Backend connection status
- Wallet connection status
- Encryption status
- DePin stats
- Plugin status

## 🔍 Testing Strategy

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

## 📚 Documentation

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

## ⚠️ Risks & Mitigations

### Risk 1: Complexity Overload
**Mitigation**: Incremental implementation, clear separation of concerns

### Risk 2: Performance Degradation
**Mitigation**: Performance profiling, efficient polling, memoization

### Risk 3: User Confusion
**Mitigation**: Clear visual hierarchy, intuitive navigation, onboarding

### Risk 4: Backend Dependencies
**Mitigation**: Mock data for development, clear API contracts, fallbacks

## 🔄 Migration Notes

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

## 📞 Questions?

For questions or clarifications about specific aspects of the consolidation plan, please refer to the individual plan documents listed above.

## 🗂️ Related Documentation

- [SPATIAL_ARCHITECTURE_PLAN.md](../SPATIAL_ARCHITECTURE_PLAN.md) - Spatial Architecture design principles
- [LIQUID_GLASS_THEME.md](../styles/liquidGlassTheme.ts) - Design tokens and theme
- [REACT_CONTEXT_SUBSCRIPTIONS_PLAN.md](../REACT_CONTEXT_SUBSCRIPTIONS_PLAN.md) - State management strategy