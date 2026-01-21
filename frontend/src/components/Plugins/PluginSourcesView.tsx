import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  TextField,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  RadioButtonChecked as CriticalIcon,
  Error as HighIcon,
  Info as MediumIcon,
  LowPriority as LowIcon,
  PlayArrow as ArchiveIcon,
  People as ParticipantsIcon,
  VideoLabel as TypeIcon,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { usePluginSources, usePlugins } from '@/hooks/usePlugins';
import { MediaSource, PluginMetadata } from '@/types/plugin';
import { pluginService } from '@/services/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const config = {
    critical: { color: '#DC2626', label: 'Critical', icon: CriticalIcon },
    high: { color: '#EA580C', label: 'High', icon: HighIcon },
    medium: { color: '#D97706', label: 'Medium', icon: MediumIcon },
    low: { color: '#6B7280', label: 'Low', icon: LowIcon },
  };
  const { color, label, icon: Icon } = config[priority as keyof typeof config] || config.low;

  return (
    <Chip
      icon={<Icon fontSize="small" />}
      label={label}
      size="small"
      sx={{
        backgroundColor: color,
        color: 'white',
        fontWeight: 500,
        fontSize: '0.7rem',
      }}
    />
  );
};

// Memoized source card component
const SourceCard = React.memo<{
  source: MediaSource;
  pluginName: string;
  onArchive: (source: MediaSource) => void;
  isArchiving: boolean;
  archivingSourceId: string | null;
}>(({ source, pluginName, onArchive, isArchiving, archivingSourceId }) => {
  const isCurrentArchive = archivingSourceId === source.source_id;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: isCurrentArchive ? '2px solid #4CAF50' : '1px solid #E0E0E0',
        transition: 'all 0.2s ease-in-out',
        contain: 'layout style paint',
        '&:hover': {
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TypeIcon sx={{ fontSize: 24, color: '#4A5568' }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                {source.metadata.name || source.source_id.slice(0, 20)}...
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {source.media_type.toUpperCase()}
              </Typography>
            </Box>
          </Box>
          <PriorityBadge priority={source.priority} />
        </Box>

        {/* Metadata */}
        <Box sx={{ mb: 2 }}>
          {source.metadata.participants !== undefined && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <ParticipantsIcon fontSize="small" sx={{ color: '#6B7280' }} />
              <Typography variant="body2" color="text.secondary">
                {source.metadata.participants.toLocaleString()} participants
              </Typography>
            </Box>
          )}
          {source.metadata.symbol && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Symbol: {source.metadata.symbol}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Source ID */}
        <Box
          sx={{
            p: 1,
            backgroundColor: '#F9F9F9',
            borderRadius: 1,
            mt: 2,
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: '#F0F0F0',
            },
          }}
          onClick={() => {
            navigator.clipboard.writeText(source.source_id);
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              color: '#6B7280',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            ID: {source.source_id}
          </Typography>
        </Box>

        {/* URI */}
        <Box
          sx={{
            p: 1,
            backgroundColor: '#F9F9F9',
            borderRadius: 1,
            mt: 1,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              color: '#6B7280',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {source.uri}
          </Typography>
        </Box>
      </CardContent>

      {/* Archive Button */}
      <Box sx={{ p: 1.5, borderTop: '1px solid #F0F0F0' }}>
        <Button
          variant={isCurrentArchive ? 'contained' : 'outlined'}
          color={isCurrentArchive ? 'success' : 'primary'}
          startIcon={isArchiving && isCurrentArchive ? <CircularProgress size={16} /> : <ArchiveIcon />}
          onClick={() => onArchive(source)}
          fullWidth
          disabled={isArchiving}
          sx={{
            fontSize: '0.75rem',
            ...(isCurrentArchive && {
              backgroundColor: '#4CAF50',
              '&:hover': {
                backgroundColor: '#388E3C',
              },
            }),
          }}
        >
          {isCurrentArchive ? 'Archiving...' : 'Archive'}
        </Button>
      </Box>
    </Card>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.source.source_id === nextProps.source.source_id &&
    prevProps.source.priority === nextProps.source.priority &&
    prevProps.archivingSourceId === nextProps.archivingSourceId &&
    prevProps.isArchiving === nextProps.isArchiving
  );
});

SourceCard.displayName = 'SourceCard';

const PluginSourcesView: React.FC = () => {
  const navigate = useNavigate();
  const { pluginName } = useParams<{ pluginName: string }>();
  const { sources, loading, error, refreshSources } = usePluginSources(pluginName);
  const { plugins } = usePlugins();
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [archivingSourceId, setArchivingSourceId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  // Virtualization setup
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);
  const rowHeight = 320;
  const gap = 16;

  // Debounce search for performance
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  // Calculate columns based on container width
  useEffect(() => {
    const updateColumns = () => {
      if (parentRef.current) {
        const width = parentRef.current.offsetWidth;
        if (width < 600) setColumns(1);
        else if (width < 900) setColumns(2);
        else if (width < 1200) setColumns(3);
        else setColumns(4);
      }
    };

    updateColumns();
    const resizeObserver = new ResizeObserver(updateColumns);
    if (parentRef.current) {
      resizeObserver.observe(parentRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  const plugin = plugins.find((p) => p.name === decodeURIComponent(pluginName || ''));

  const filteredSources = useMemo(() => {
    return sources.filter((source) => {
      const matchesSearch =
        !debouncedSearchQuery ||
        source.source_id.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        (source.metadata.name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ?? false);

      const matchesPriority = priorityFilter === 'all' || source.priority === priorityFilter;
      const matchesPlugin = !pluginName || source.plugin === decodeURIComponent(pluginName);

      return matchesSearch && matchesPriority && matchesPlugin;
    });
  }, [sources, debouncedSearchQuery, priorityFilter, pluginName]);

  const rowCount = Math.ceil(filteredSources.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan: 2,
  });

  const handleArchive = useCallback(async (source: MediaSource) => {
    setArchivingSourceId(source.source_id);
    try {
      const result = await pluginService.archiveSource(source.plugin, source.source_id);
      if (result.success) {
        setNotification({
          open: true,
          message: `Successfully started archiving ${source.metadata.name || source.source_id}`,
          severity: 'success',
        });
        setTimeout(() => setArchivingSourceId(null), 2000);
      } else {
        setNotification({
          open: true,
          message: result.message || 'Failed to archive source',
          severity: 'error',
        });
        setArchivingSourceId(null);
      }
    } catch (error) {
      setNotification({
        open: true,
        message: 'Failed to archive source',
        severity: 'error',
      });
      setArchivingSourceId(null);
    }
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  if (!plugin) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Plugin not found
        </Typography>
        <Button
          variant="outlined"
          startIcon={<BackIcon />}
          onClick={() => navigate('/plugins')}
          sx={{ mt: 2 }}
        >
          Back to Plugins
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/plugins')} size="small">
            <BackIcon />
          </IconButton>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 0.5 }}>
              {plugin.name} Sources
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {plugin.description}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={refreshSources}
          disabled={loading}
          sx={{ textTransform: 'none' }}
        >
          Refresh
        </Button>
      </Box>

      {/* Statistics */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Card sx={{ p: 2, backgroundColor: '#F9F9F9' }}>
            <Typography variant="caption" color="text.secondary">
              Total Sources
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5 }}>
              {sources.length}
            </Typography>
          </Card>
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Card sx={{ p: 2, backgroundColor: '#FEF3C7' }}>
            <Typography variant="caption" color="text.secondary">
              High Priority
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5, color: '#D97706' }}>
              {sources.filter((s) => s.priority === 'high' || s.priority === 'critical').length}
            </Typography>
          </Card>
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Card sx={{ p: 2, backgroundColor: '#D1FAE5' }}>
            <Typography variant="caption" color="text.secondary">
              Average Participants
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5, color: '#047857' }}>
              {sources.length > 0
                ? Math.round(
                    sources.reduce((sum, s) => sum + (s.metadata.participants || 0), 0) / sources.length
                  ).toLocaleString()
                : 0}
            </Typography>
          </Card>
        </Box>
      </Box>

      {/* Search and Filters */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Box sx={{ flexGrow: 1, position: 'relative', minWidth: 300 }}>
          <SearchIcon
            sx={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9E9E9E',
            }}
          />
          <TextField
            fullWidth
            placeholder="Search sources..."
            value={searchQuery}
            onChange={handleSearchChange}
            inputProps={{
              sx: {
                pl: 4,
                py: 1,
              },
            }}
            sx={{
              backgroundColor: '#FAFAFA',
              '& .MuiOutlinedInput-root': {
                borderRadius: '8px',
                '& fieldset': {
                  borderColor: '#E0E0E0',
                },
              },
            }}
            size="small"
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip
            label="All"
            onClick={() => setPriorityFilter('all')}
            color={priorityFilter === 'all' ? 'primary' : 'default'}
            size="small"
            clickable
          />
          <Chip
            label="Critical"
            onClick={() => setPriorityFilter('critical')}
            color={priorityFilter === 'critical' ? 'primary' : 'default'}
            size="small"
            clickable
          />
          <Chip
            label="High"
            onClick={() => setPriorityFilter('high')}
            color={priorityFilter === 'high' ? 'primary' : 'default'}
            size="small"
            clickable
          />
          <Chip
            label="Medium"
            onClick={() => setPriorityFilter('medium')}
            color={priorityFilter === 'medium' ? 'primary' : 'default'}
            size="small"
            clickable
          />
          <Chip
            label="Low"
            onClick={() => setPriorityFilter('low')}
            color={priorityFilter === 'low' ? 'primary' : 'default'}
            size="small"
            clickable
          />
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setNotification({ ...notification, open: false })}>
          {error}
        </Alert>
      )}

      {/* Virtualized Sources Grid */}
      {loading && sources.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1, minHeight: 400 }}>
          <CircularProgress />
        </Box>
      ) : filteredSources.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <FilterIcon sx={{ fontSize: 64, color: '#E0E0E0', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No sources found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {searchQuery || priorityFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'No sources available from this plugin'}
          </Typography>
        </Box>
      ) : (
        <Box
          ref={parentRef}
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            contain: 'strict',
          }}
        >
          <Box
            sx={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIndex = virtualRow.index * columns;
              const rowSources = filteredSources.slice(startIndex, startIndex + columns);
              
              return (
                <Box
                  key={virtualRow.key}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${columns}, 1fr)`,
                    gap: `${gap}px`,
                    paddingBottom: `${gap}px`,
                  }}
                >
                  {rowSources.map((source) => (
                    <SourceCard
                      key={`${source.plugin}-${source.source_id}`}
                      source={source}
                      pluginName={plugin.name}
                      onArchive={handleArchive}
                      isArchiving={archivingSourceId !== null}
                      archivingSourceId={archivingSourceId}
                    />
                  ))}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Notification */}
      {notification.open && (
        <Box sx={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999 }}>
          <Alert
            severity={notification.severity}
            onClose={() => setNotification({ ...notification, open: false })}
            sx={{ minWidth: 300 }}
          >
            {notification.message}
          </Alert>
        </Box>
      )}
    </Box>
  );
};

export default PluginSourcesView;
