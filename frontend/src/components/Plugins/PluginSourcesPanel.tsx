import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Chip,
  CircularProgress,
  Alert,
  Button,
  Tooltip,
  IconButton,
  Snackbar,
} from '@mui/material';
import {
  Search as SearchIcon,
  RadioButtonChecked as CriticalIcon,
  Error as HighIcon,
  Info as MediumIcon,
  LowPriority as LowIcon,
  VideoLabel as TypeIcon,
  People as ParticipantsIcon,
  PlayArrow as ArchiveIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { MediaSource } from '@/types/plugin';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';
import { pluginService } from '@/services/api';

interface PluginSourcesPanelProps {
  pluginName: string;
  sources: MediaSource[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const config = {
    critical: { color: liquidGlassTokens.neon.error, label: 'Critical', icon: CriticalIcon },
    high: { color: liquidGlassTokens.neon.magenta, label: 'High', icon: HighIcon },
    medium: { color: liquidGlassTokens.neon.amber, label: 'Medium', icon: MediumIcon },
    low: { color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`, label: 'Low', icon: LowIcon },
  };
  const { color, label, icon: Icon } = config[priority as keyof typeof config] || config.low;

  return (
    <Chip
      icon={<Icon fontSize="small" style={{ color }} />}
      label={label}
      size="small"
      sx={{
        backgroundColor: `${color}15`,
        color: color,
        fontWeight: 500,
        fontSize: '0.65rem',
        height: 20,
        border: `1px solid ${color}30`,
        '& .MuiChip-icon': {
          color: color,
        },
      }}
    />
  );
};

interface SourceCardProps {
  source: MediaSource;
  onArchive: (source: MediaSource) => void;
  isArchiving: boolean;
  isCurrentArchive: boolean;
}

const SourceCard: React.FC<SourceCardProps> = React.memo(({
  source,
  onArchive,
  isArchiving,
  isCurrentArchive,
}) => {
  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(source.source_id);
  }, [source.source_id]);

  const handleCopyUri = useCallback(() => {
    navigator.clipboard.writeText(source.uri);
  }, [source.uri]);

  return (
    <Box
      sx={{
        p: 2,
        background: 'rgba(255, 255, 255, 0.03)',
        border: isCurrentArchive
          ? `1px solid ${liquidGlassTokens.neon.success}`
          : '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: `${liquidGlassTokens.radius.sm}px`,
        mb: 1.5,
        transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
        '&:hover': {
          background: 'rgba(255, 255, 255, 0.05)',
          borderColor: isCurrentArchive
            ? liquidGlassTokens.neon.success
            : `rgba(255, 255, 255, 0.15)`,
        },
      }}
    >
      {/* Header Row */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          <TypeIcon
            sx={{
              fontSize: 18,
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              flexShrink: 0,
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                color: 'rgba(255, 255, 255, 0.9)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.85rem',
              }}
            >
              {source.metadata.name || source.source_id.slice(0, 30)}...
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                fontSize: '0.7rem',
              }}
            >
              {source.media_type.toUpperCase()}
            </Typography>
          </Box>
        </Box>
        <PriorityBadge priority={source.priority} />
      </Box>

      {/* Metadata */}
      <Box sx={{ mb: 1.5 }}>
        {source.metadata.participants !== undefined && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <ParticipantsIcon fontSize="small" sx={{ color: liquidGlassTokens.neon.cyan, fontSize: 14 }} />
            <Typography variant="caption" sx={{ color: liquidGlassTokens.neon.cyan, fontSize: '0.75rem', fontWeight: 500 }}>
              {source.metadata.participants.toLocaleString()} viewers
            </Typography>
          </Box>
        )}
        {source.metadata.symbol && (
          <Typography variant="caption" sx={{ color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`, fontSize: '0.75rem', display: 'block' }}>
            Symbol: {source.metadata.symbol}
          </Typography>
        )}
      </Box>

      {/* Source ID - Clickable to copy */}
      <Tooltip title="Click to copy ID">
        <Box
          sx={{
            p: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: `${liquidGlassTokens.radius.sm}px`,
            mb: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
            },
          }}
          onClick={handleCopyId}
        >
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            ID: {source.source_id}
          </Typography>
          <CopyIcon sx={{ fontSize: 12, color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` }} />
        </Box>
      </Tooltip>

      {/* URI */}
      <Tooltip title="Click to copy URI">
        <Box
          sx={{
            p: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: `${liquidGlassTokens.radius.sm}px`,
            mb: 1.5,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
            },
          }}
          onClick={handleCopyUri}
        >
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {source.uri}
          </Typography>
          <CopyIcon sx={{ fontSize: 12, color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` }} />
        </Box>
      </Tooltip>

      {/* Archive Button */}
      <Button
        variant={isCurrentArchive ? 'contained' : 'outlined'}
        fullWidth
        size="small"
        disabled={isArchiving}
        startIcon={
          isCurrentArchive ? (
            <CircularProgress size={14} sx={{ color: isCurrentArchive ? '#fff' : liquidGlassTokens.neon.cyan }} />
          ) : (
            <ArchiveIcon />
          )
        }
        onClick={() => onArchive(source)}
        sx={{
          fontSize: '0.75rem',
          textTransform: 'none',
          borderColor: isCurrentArchive ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.2)',
          color: isCurrentArchive ? '#fff' : liquidGlassTokens.neon.cyan,
          backgroundColor: isCurrentArchive ? liquidGlassTokens.neon.success : 'transparent',
          '&:hover': {
            borderColor: isCurrentArchive ? liquidGlassTokens.neon.success : liquidGlassTokens.neon.cyan,
            backgroundColor: isCurrentArchive ? `${liquidGlassTokens.neon.success}dd` : `${liquidGlassTokens.neon.cyan}15`,
          },
          '&:disabled': {
            borderColor: 'rgba(255, 255, 255, 0.1)',
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
          },
        }}
      >
        {isCurrentArchive ? 'Archiving...' : 'Archive'}
      </Button>
    </Box>
  );
});

SourceCard.displayName = 'SourceCard';

const PluginSourcesPanel: React.FC<PluginSourcesPanelProps> = ({
  pluginName,
  sources,
  loading,
  error,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
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

  // Filter and sort sources by participants (viewers) - highest first
  const filteredSources = useMemo(() => {
    const filtered = sources.filter((source) => {
      const matchesSearch =
        !searchQuery ||
        source.source_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (source.metadata.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

      return matchesSearch;
    });

    // Sort by participants (viewers) descending - most popular first
    return filtered.sort((a, b) => {
      const viewersA = a.metadata.participants || 0;
      const viewersB = b.metadata.participants || 0;
      return viewersB - viewersA;
    });
  }, [sources, searchQuery]);

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

  const handleCloseNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, open: false }));
  }, []);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.95)',
            }}
          >
            {pluginName} Sources
          </Typography>
          <Tooltip title="Refresh sources">
            <IconButton
              onClick={onRefresh}
              disabled={loading}
              size="small"
              sx={{
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                '&:hover': {
                  color: liquidGlassTokens.neon.cyan,
                },
              }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Typography
          variant="caption"
          sx={{ color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` }}
        >
          {sources.length} source{sources.length !== 1 ? 's' : ''} available
        </Typography>
      </Box>

      {/* Search */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          placeholder="Search sources..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          InputProps={{
            startAdornment: (
              <SearchIcon
                sx={{
                  color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
                  mr: 1,
                  fontSize: 18,
                }}
              />
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: `${liquidGlassTokens.radius.sm}px`,
              '& fieldset': {
                borderColor: 'rgba(255, 255, 255, 0.1)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(255, 255, 255, 0.2)',
              },
              '&.Mui-focused': {
                background: `${liquidGlassTokens.neon.cyan}08`,
                '& fieldset': {
                  borderColor: liquidGlassTokens.neon.cyan,
                },
              },
            },
            '& .MuiInputBase-input': {
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: '13px',
              '&::placeholder': {
                color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
              },
            },
          }}
        />
      </Box>

      {/* Sort indicator */}
      <Box sx={{ mb: 2 }}>
        <Chip
          icon={<ParticipantsIcon sx={{ fontSize: 14, color: liquidGlassTokens.neon.cyan }} />}
          label="Sorted by viewers (high to low)"
          size="small"
          sx={{
            backgroundColor: `${liquidGlassTokens.neon.cyan}10`,
            color: liquidGlassTokens.neon.cyan,
            border: `1px solid ${liquidGlassTokens.neon.cyan}30`,
            fontSize: '0.7rem',
            height: 24,
            '& .MuiChip-icon': {
              color: liquidGlassTokens.neon.cyan,
            },
          }}
        />
      </Box>

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 2,
            backgroundColor: `${liquidGlassTokens.neon.error}10`,
            border: `1px solid ${liquidGlassTokens.neon.error}30`,
            color: liquidGlassTokens.neon.error,
            fontSize: '0.8rem',
          }}
        >
          {error}
        </Alert>
      )}

      {/* Sources List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading && sources.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 8,
            }}
          >
            <CircularProgress size={24} sx={{ color: liquidGlassTokens.neon.cyan }} />
          </Box>
        ) : filteredSources.length === 0 ? (
          <Box
            sx={{
              textAlign: 'center',
              py: 8,
            }}
          >
            <Typography
              variant="body2"
              sx={{ color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})` }}
            >
              {searchQuery
                ? 'No matching sources'
                : 'No sources available'}
            </Typography>
          </Box>
        ) : (
          <Box>
            {filteredSources.map((source) => (
              <SourceCard
                key={`${source.plugin}-${source.source_id}`}
                source={source}
                onArchive={handleArchive}
                isArchiving={archivingSourceId !== null}
                isCurrentArchive={archivingSourceId === source.source_id}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Notification Snackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{
          '& .MuiSnackbarContent-root': {
            backgroundColor: notification.severity === 'success' 
              ? `${liquidGlassTokens.neon.success}20`
              : `${liquidGlassTokens.neon.error}20`,
            border: `1px solid ${notification.severity === 'success' 
              ? liquidGlassTokens.neon.success 
              : liquidGlassTokens.neon.error}40`,
            color: '#fff',
          },
        }}
      >
        <Alert
          severity={notification.severity}
          onClose={handleCloseNotification}
          sx={{
            minWidth: 250,
            backgroundColor: 'transparent',
            color: '#fff',
            '& .MuiAlert-icon': {
              color: notification.severity === 'success' 
                ? liquidGlassTokens.neon.success 
                : liquidGlassTokens.neon.error,
            },
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PluginSourcesPanel;
