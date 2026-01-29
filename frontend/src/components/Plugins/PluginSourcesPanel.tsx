import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Search as SearchIcon,
  RadioButtonChecked as CriticalIcon,
  Error as HighIcon,
  Info as MediumIcon,
  LowPriority as LowIcon,
  VideoLabel as TypeIcon,
} from '@mui/icons-material';
import { MediaSource } from '@/types/plugin';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';

interface PluginSourcesPanelProps {
  pluginName: string;
  sources: MediaSource[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

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
        fontSize: '0.65rem',
        height: 20,
      }}
    />
  );
};

const SourceRow: React.FC<{ source: MediaSource }> = ({ source }) => {
  return (
    <Box
      sx={{
        p: 1.5,
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: `${liquidGlassTokens.radius.sm}px`,
        mb: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      <TypeIcon
        sx={{
          fontSize: 20,
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
      <PriorityBadge priority={source.priority} />
    </Box>
  );
};

const PluginSourcesPanel: React.FC<PluginSourcesPanelProps> = ({
  pluginName,
  sources,
  loading,
  error,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const filteredSources = useMemo(() => {
    return sources.filter((source) => {
      const matchesSearch =
        !searchQuery ||
        source.source_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (source.metadata.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

      const matchesPriority = priorityFilter === 'all' || source.priority === priorityFilter;

      return matchesSearch && matchesPriority;
    });
  }, [sources, searchQuery, priorityFilter]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.95)',
            mb: 0.5,
          }}
        >
          {pluginName} Sources
        </Typography>
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

      {/* Priority Filters */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
        {['all', 'critical', 'high', 'medium', 'low'].map((priority) => (
          <Chip
            key={priority}
            label={priority.charAt(0).toUpperCase() + priority.slice(1)}
            size="small"
            onClick={() => setPriorityFilter(priority)}
            sx={{
              backgroundColor:
                priorityFilter === priority
                  ? `${liquidGlassTokens.neon.cyan}20`
                  : 'rgba(255, 255, 255, 0.05)',
              color:
                priorityFilter === priority
                  ? liquidGlassTokens.neon.cyan
                  : 'rgba(255, 255, 255, 0.7)',
              border:
                priorityFilter === priority
                  ? `1px solid ${liquidGlassTokens.neon.cyan}40`
                  : '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: '0.7rem',
              height: 24,
              cursor: 'pointer',
              '&:hover': {
                backgroundColor:
                  priorityFilter === priority
                    ? `${liquidGlassTokens.neon.cyan}30`
                    : 'rgba(255, 255, 255, 0.08)',
              },
            }}
          />
        ))}
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
        {loading ? (
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
              {searchQuery || priorityFilter !== 'all'
                ? 'No matching sources'
                : 'No sources available'}
            </Typography>
          </Box>
        ) : (
          <Box>
            {filteredSources.map((source) => (
              <SourceRow key={`${source.plugin}-${source.source_id}`} source={source} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default PluginSourcesPanel;