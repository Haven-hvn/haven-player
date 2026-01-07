# Quick Start Guide: Integrating Plugin-Based DePIN Dashboard

## Overview
This guide helps you integrate the new plugin-based components into the existing `DePinDashboard.tsx`.

## Step 1: Import the New Hook and Components

Add these imports to the top of `DePinDashboard.tsx`:

```typescript
import { useDePinDashboard } from '@/hooks/useDePinDashboard';
import { PluginConfigurationModal } from '@/components/Plugins/PluginConfigurationModal';
import { Settings as SettingsIcon } from '@mui/icons-material';
```

## Step 2: Replace Legacy State Management

Replace the existing useState hooks with the new hook:

```typescript
// OLD - Remove these:
// const [isActive, setIsActive] = useState(false);
// const [currentRecording, setCurrentRecording] = useState<...>(null);
// const [archivedStreams, setArchivedStreams] = useState(18);

// NEW - Add this:
const {
  state,
  loading,
  error,
  toggleActive,
  runTick,
  stopOperation,
  toggleOperationPause,
  loadPluginStatus,
} = useDePinDashboard();
```

## Step 3: Add Configuration Modal State

Add state for the configuration modal:

```typescript
const [configModalOpen, setConfigModalOpen] = useState(false);
const [configPlugin, setConfigPlugin] = useState<{ name: string; displayName: string } | null>(null);
```

## Step 4: Add Configuration Handlers

Add handlers for opening/closing the configuration modal:

```typescript
const handleOpenConfig = (pluginName: string) => {
  const plugin = state.enabled_plugins.find(p => p.name === pluginName);
  if (plugin) {
    setConfigPlugin({ name: pluginName, displayName: plugin.display_name });
    setConfigModalOpen(true);
  }
};

const handleCloseConfig = () => {
  setConfigModalOpen(false);
  setConfigPlugin(null);
};

const handleConfigSave = () => {
  loadPluginStatus();
  addLog(`✅ Updated ${configPlugin!.displayName} configuration`);
};
```

## Step 5: Update Node Toggle Handler

Replace the existing `handleToggleActive` with:

```typescript
const handleToggleActive = async (active: boolean) => {
  if (active && !filecoinConfig) {
    addLog('⚠️ Filecoin config required. Opening settings...');
    onRequireSettings?.('filecoin');
    return;
  }
  
  toggleActive(active);
  addLog(active ? '🚀 DePIN Node Activated' : '⏹️  DePIN Node Deactivated');
};
```

## Step 6: Update Active Recording Display

Replace the legacy "Active Recording" card with plugin-aware operations:

```typescript
{/* Active Operations Section */}
<Typography variant="h6">Active Operations</Typography>

{state.active_operations.length === 0 && state.is_active ? (
  <Card>
    <CardContent sx={{ textAlign: 'center', py: 4 }}>
      <CircularProgress size={40} sx={{ mb: 2 }} />
      <Typography variant="body1" color="text.secondary">
        Discovering and archiving content...
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Waiting for plugin operations to start
      </Typography>
    </CardContent>
  </Card>
) : (
  <Grid container spacing={2}>
    {state.active_operations.map((operation) => (
      <Grid item xs={12} md={6} lg={4} key={operation.operation_id}>
        <OperationCard 
          operation={operation}
          onStop={() => stopOperation(operation.operation_id)}
          onPause={(paused) => toggleOperationPause(operation.operation_id, paused)}
        />
      </Grid>
    ))}
  </Grid>
)}
```

## Step 7: Add Plugin Status Section

Add a section to display plugin status with configuration buttons:

```typescript
<Typography variant="h6">Plugin Status</Typography>

<Grid container spacing={2}>
  {state.enabled_plugins.map((plugin) => (
    <Grid item xs={12} sm={6} md={4} key={plugin.name}>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Extension fontSize="small" />
              <Typography variant="body2">{plugin.display_name}</Typography>
            </Box>
            <Badge 
              badgeContent={plugin.active_operations_count}
              color="primary"
            >
              <Chip 
                label={plugin.status} 
                size="small"
                color={plugin.status === 'active' ? 'success' : 'default'}
              />
            </Badge>
          </Box>
          
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {plugin.active_operations_count} active operation(s)
          </Typography>
          
          <Button
            size="small"
            startIcon={<SettingsIcon />}
            onClick={() => handleOpenConfig(plugin.name)}
            sx={{ mt: 1 }}
          >
            Configure
          </Button>
        </CardContent>
      </Card>
    </Grid>
  ))}
</Grid>
```

## Step 8: Update Metrics Display

Replace hardcoded metrics with plugin-aware metrics:

```typescript
<Grid item xs={12} sm={6} md={3}>
  <MetricCard 
    title="Total Archived" 
    value={state.total_archived}
    icon={<Schedule />}
    color="primary"
  />
</Grid>
<Grid item xs={12} sm={6} md={3}>
  <MetricCard 
    title="Uploaded to Filecoin" 
    value={state.total_uploaded}
    icon={<CloudUpload />}
    color="secondary"
  />
</Grid>
<Grid item xs={12} sm={6} md={3}>
  <MetricCard 
    title="Pending Uploads" 
    value={state.pending_uploads}
    icon={<Bolt />}
    color="warning"
  />
</Grid>
<Grid item xs={12} sm={6} md={3}>
  <MetricCard 
    title="Active Operations" 
    value={state.active_operations.length}
    icon={<Extension />}
    color="info"
  />
</Grid>
```

## Step 9: Add Configuration Modal

Add the configuration modal to the JSX:

```typescript
{configPlugin && (
  <PluginConfigurationModal
    open={configModalOpen}
    pluginName={configPlugin.name}
    pluginDisplayName={configPlugin.displayName}
    onClose={handleCloseConfig}
    onSave={handleConfigSave}
  />
)}
```

## Step 10: Add Helper Components

Add these helper components at the bottom of the file (before the export):

```typescript
function OperationCard({ operation, onStop, onPause }: any) {
  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'real-time': return <PlayArrow />;
      case 'subscription': return <VideoLibrary />;
      case 'download': return <CloudUpload />;
      default: return <Extension />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'success';
      case 'paused': return 'warning';
      case 'completed': return 'primary';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {getOperationIcon(operation.operation_type)}
            <Box>
              <Typography variant="subtitle2">{operation.plugin_display_name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {operation.source_name}
              </Typography>
            </Box>
          </Box>
          <Chip 
            label={operation.status} 
            size="small"
            color={getStatusColor(operation.status) as any}
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {Math.floor(operation.duration_seconds / 60)}:{(operation.duration_seconds % 60).toString().padStart(2, '0')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {operation.progress}%
            </Typography>
          </Box>
          <LinearProgress 
            variant="determinate" 
            value={operation.progress} 
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton size="small" onClick={() => onPause(operation.status === 'running')}>
            {operation.status === 'running' ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton size="small" color="error" onClick={onStop}>
            <Stop />
          </IconButton>
        </Box>
      </CardContent>
    </Card>
  );
}

function MetricCard({ title, value, icon, color }: any) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Box sx={{ p: 1, borderRadius: 2, bgcolor: `${color}15` }}>
            {React.cloneElement(icon, { color: color as any })}
          </Box>
          <Typography variant="subtitle2" color="text.secondary">{title}</Typography>
        </Box>
        <Typography variant="h4">{value}</Typography>
      </CardContent>
    </Card>
  );
}
```

## Step 11: Remove Legacy Code

Remove or comment out the following legacy code:
- Old WebRTC-specific state (`currentRecording`, `archivedStreams`, etc.)
- Old tick loop implementation
- WebRTC-specific rendering logic
- Hardcoded metrics

## Testing Checklist

- [ ] Node toggle works (start/stop)
- [ ] Operations display correctly from all plugins
- [ ] Plugin status cards update in real-time
- [ ] Play/pause/stop buttons work (if supported by plugin)
- [ ] Progress bars update correctly
- [ ] Configuration modal opens for each plugin
- [ ] Configuration saves correctly
- [ ] Metrics are accurate
- [ ] Error states display properly

## Notes

1. **Backward Compatibility**: The implementation maintains backward compatibility with the existing WebRTC archiver.

2. **Gradual Migration**: You can migrate incrementally by:
   - First, updating the imports and adding the hook
   - Then, replacing the operation display
   - Finally, adding the configuration UI

3. **Type Safety**: All new components are fully typed with TypeScript.

4. **Error Handling**: The hooks include error handling and provide error states for UI feedback.

5. **Performance**: The useDePinDashboard hook uses useCallback and useEffect efficiently to prevent unnecessary re-renders.

## Support

If you encounter issues:
1. Check the browser console for errors
2. Verify the backend plugin API is running
3. Ensure plugins have the 'archival' capability
4. Review the implementation summary in `DEPIN_IMPLEMENTATION_SUMMARY.md`