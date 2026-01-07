# Frontend Plugin System Implementation

## Overview

This document describes the frontend implementation for the Haven Player plugin system, which provides a modern, user-friendly interface for managing media archiver plugins.

## Architecture

### Component Hierarchy

```
App.tsx
├── PluginManagementPage
│   ├── PluginCard (for each plugin)
│   └── PluginConfigModal
└── PluginSourcesView
    └── SourceCard (for each source)
```

### Key Components

#### 1. Type Definitions (`src/types/plugin.ts`)

Defines TypeScript interfaces for the plugin system:

- `Plugin` - Core plugin metadata and status
- `MediaSource` - Discovered media sources from plugins
- `ArchiveRequest` and `ArchiveResult` - Archive operations
- `HealthStatus` - Plugin health check results

#### 2. API Service (`src/services/api.ts`)

Plugin-specific API methods:

- `pluginService` - Main plugin management API
- `getPlugins()` - List all plugins
- `discoverPlugins()` - Find new plugins
- `loadPlugin(name)` - Load a plugin
- `unloadPlugin(name)` - Unload a plugin
- `restartPlugin(name)` - Restart a plugin
- `getPluginHealth()` - Check health of all plugins
- `getPluginConfig(name)` - Get plugin configuration
- `updatePluginConfig(name, config)` - Update plugin configuration
- `deletePluginConfig(name)` - Reset plugin configuration
- `getAllSources()` - Get all sources from all plugins
- `getPluginSources(name)` - Get sources from specific plugin
- `archiveSource(pluginName, sourceId)` - Archive a media source

#### 3. Custom Hook (`src/hooks/usePlugins.ts`)

React hook for plugin management:

```typescript
const {
  plugins,
  loading,
  error,
  refreshPlugins,
  loadPlugin,
  unloadPlugin,
  restartPlugin,
  configurePlugin,
  getSources,
  archiveSource,
  checkHealth
} = usePlugins();
```

#### 4. Plugin Management Page (`src/components/Plugins/PluginManagementPage.tsx`)

Main interface for managing plugins with:

- Grid layout of plugin cards
- Status indicators (enabled/disabled, loaded/unloaded)
- Action buttons (load, unload, reload, configure)
- Health check visualization
- Real-time source counts
- Discovery workflow for new plugins

**Features:**
- View all registered plugins
- Enable/disable plugins
- Load/unload plugins dynamically
- Configure plugin settings
- View plugin health status
- See at-a-glance source availability
- Refresh plugin lists
- Discover new plugins

#### 5. Plugin Config Modal (`src/components/Plugins/PluginConfigModal.tsx`)

Modal dialog for editing plugin configuration:

- JSON-based configuration editor
- Syntax validation
- Real-time error feedback
- Save/Cancel actions
- Configuration reset option

#### 6. Plugin Sources View (`src/components/Plugins/PluginSourcesView.tsx`)

View discovered media sources from a plugin:

- List of all sources from a plugin
- Source metadata display (name, participants, priority)
- Archive action for each source
- Filter and search functionality
- Refresh controls

#### 7. Sidebar Navigation (`src/components/Sidebar.tsx`)

Added Plugins navigation icon:

- Extension/puzzle piece icon
- Navigate to `/plugins` route
- Consistent with existing navigation patterns

## User Flows

### 1. Viewing Plugins

1. User clicks Plugins icon in sidebar
2. PluginManagementPage loads
3. All plugins displayed as cards
4. User can see status, metadata, and available actions

### 2. Loading a Plugin

1. User clicks "Load" on disabled plugin card
2. Confirm dialog appears
3. Plugin is loaded via API
4. Card updates to show loaded status
5. Success notification displayed

### 3. Configuring a Plugin

1. User clicks "Configure" on a plugin card
2. PluginConfigModal opens
3. JSON editor shows current config
4. User edits configuration
5. Validation checks JSON syntax
6. User saves or cancels
7. Configuration persisted to backend

### 4. Viewing Sources

1. User clicks "View Sources" on a plugin card
2. Navigate to PluginSourcesView
3. Plugin discovers sources via API
4. Sources displayed with metadata
5. User can see source priority and details

### 5. Archiving a Source

1. User clicks "Archive" on a source
2. Archive request sent to backend
3. Archiving job initiated
4. Success/error feedback displayed

### 6. Discovering New Plugins

1. User clicks "Discover Plugins" button
2. Backend scans plugin directories
3. New plugins registered
4. Plugin list refreshes
5. User can load newly discovered plugins

## Design Patterns

### 1. Material-UI Components

- Uses standard MUI components for consistency
- Theme-compliant styling (light theme)
- Custom overrides for cards, buttons, chips

### 2. Status Visualization

- **Enabled**: Green checkmark icon
- **Disabled**: Grey block icon
- **Loaded**: Green badge
- **Unloaded**: Grey badge
- **Healthy**: Green dot
- **Unhealthy**: Red dot

### 3. Action Grouping

All plugin actions organized in dropdown or inline buttons:
- Load/Unload toggle
- Configure
- View Sources
- Refresh Health

### 4. Responsive Grid

Grid layout with responsive breakpoints:
- Mobile: 1 column
- Tablet: 2 columns
- Desktop: 3 columns
- Large screens: 4 columns

### 5. Error Handling

- Loading states with spinners
- Error messages with retry buttons
- Toast notifications for feedback
- Graceful degradation

## Routes

- `/plugins` - Plugin management page
- `/plugins/:pluginName/sources` - Plugin-specific sources view

## State Management

### Local Component State

- Plugin list data
- Loading states
- Modal open/close
- Configuration editor state
- Filter/search queries

### Context Providers

- SettingsNavigationProvider (existing)
- Plugin state managed locally (no global context needed)

## API Integration

All API calls go through `pluginService` in `api.ts`:

```typescript
// Example: Load a plugin
await pluginService.loadPlugin('webrtc-archiver');

// Example: Get all sources
const response = await pluginService.getAllSources();
const sources = response.sources;
```

## Styling Guidelines

### Color Scheme

Consistent with existing light theme:
- Primary: #000000 (black)
- Secondary: #F9A825 (gold)
- Background: #FFFFFF / #FAFAFA
- Success: #4CAF50 (green)
- Error: #FF4D4D (red)
- Text: #000000 / #6B6B6B

### Card Styling

```typescript
sx={{
  borderRadius: '12px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
  border: '1px solid #F0F0F0',
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
    transform: 'translateY(-2px)',
  }
}}
```

### Button Styling

- Primary actions: Gradient black button
- Secondary actions: Outlined grey button
- Destructive actions: Red outlined button

### Status Chips

```typescript
// Loaded/Enabled status
<Chip
  label="Loaded"
  color="success"
  size="small"
  sx={{ borderRadius: '20px', fontWeight: 500 }}
/>

// Disabled status
<Chip
  label="Disabled"
  color="default"
  size="small"
  sx={{ borderRadius: '20px', fontWeight: 500 }}
/>
```

## Testing Recommendations

### Unit Tests

- `usePlugins` hook testing
- API service method testing
- Component rendering tests
- Configuration validation tests

### Integration Tests

- Plugin load/unload flow
- Configuration save/load
- Source discovery and display
- Archive action

### E2E Tests

- Complete user flows
- Error recovery
- Plugin discovery workflow

## Future Enhancements

### Phase 2 Features

1. **Plugin Marketplace Integration**
   - Browse community plugins
   - Install new plugins
   - Plugin ratings and reviews

2. **Plugin Metrics Dashboard**
   - CPU/memory usage
   - Source discovery rate
   - Archive success rate
   - Performance history

3. **Advanced Configuration**
   - Form-based config UI instead of JSON
   - Configuration presets
   - Import/export configurations

4. **Plugin Dependencies**
   - Show plugin dependencies
   - Auto-resolve conflicts
   - Dependency versioning

5. **Plugin Hot-Reload**
   - Real-time plugin updates
   - Zero-downtime upgrades
   - Rollback capability

### Phase 3 Features

1. **Multi-Node Coordination**
   - View plugins across multiple nodes
   - Distributed source discovery
   - Load balancing

2. **Plugin Analytics**
   - Usage statistics
   - Popular plugins
   - Source distribution

3. **Plugin Sandboxing**
   - Resource limits UI
   - Permission management
   - Security indicators

## Dependencies

### Required

- React 19
- Material-UI 7
- React Router DOM 7
- axios (for API calls)

### UI Components Used

- `Box`, `Paper`, `Card` - Layout containers
- `Button`, `IconButton` - Actions
- `Typography` - Text display
- `Chip` - Status badges
- `CircularProgress` - Loading indicators
- `Dialog`, `Tooltip` - Modals and tooltips
- `Menu` - Action dropdowns
- `TextField` - Configuration input
- `Alert`, `Snackbar` - Notifications

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Accessibility

- Keyboard navigation support
- ARIA labels for all interactive elements
- Focus management in modals
- Color contrast meets WCAG AA
- Screen reader friendly

## Performance Considerations

- Lazy loading of plugin components
- Debounced search/filter operations
- Optimized re-renders with React.memo
- Efficient state updates
- Minimized API calls

## Security

- Configuration validation
- XSS prevention in JSON editor
- CSRF protection via API
- Secure authentication integration

## Troubleshooting

### Common Issues

1. **Plugin won't load**
   - Check plugin health status
   - Verify plugin configuration
   - Check backend logs

2. **Configuration won't save**
   - Validate JSON syntax
   - Check backend API status
   - Verify authentication

3. **Sources not appearing**
   - Refresh plugin health
   - Check plugin enables status
   - Verify plugin implementation

## Related Documentation

- Backend Plugin System: `backend/IMPLEMENTATION_SUMMARY.md`
- Plugin API: `backend/app/api/plugins.py`
- Plugin Interface: `backend/app/plugins/plugin_interface.py`
- Plugin Creation Guide: `backend/plugins/README.md`

## Summary

The frontend plugin system provides a modern, intuitive interface for managing the Haven Player plugin ecosystem. It follows Material-UI design principles, integrates seamlessly with existing components, and provides all necessary functionality for plugin lifecycle management, configuration, and source discovery.
