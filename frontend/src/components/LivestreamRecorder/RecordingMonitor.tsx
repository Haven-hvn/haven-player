import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  LinearProgress,
  Chip,
  Tooltip,
  IconButton,
  Collapse,
} from "@mui/material";
import {
  FiberManualRecord as RecordIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Upload as UploadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  PauseCircle as PauseIcon,
  Segment as SegmentIcon,
} from "@mui/icons-material";
import { format } from "date-fns";

interface SegmentInfo {
  segment_index: number;
  segment_path: string;
  segment_timestamp: string;
  segment_duration: number;
  file_size: number;
  keyframe_boundary: boolean;
  upload_status: "pending" | "processing" | "uploaded" | "failed";
  uploaded_at?: string;
}

interface RecordingStats {
  mint_id: string;
  is_recording: boolean;
  segment_index: number;
  active_segment_elapsed: number;
  segments_created: number;
  frames_captured: number;
  bytes_written: number;
  current_segment?: SegmentInfo;
  recent_segments: SegmentInfo[];
}

interface RecordingMonitorProps {
  mintId: string;
  onToggle?: (mintId: string) => void;
}

const RecordingMonitor: React.FC<RecordingMonitorProps> = ({ mintId, onToggle }) => {
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchRecordingStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/pumpfun/recorders/${mintId}/status`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch recording status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.stats) {
        setStats(data.stats);
        setError(null);
      } else {
        setStats(null);
        setError(data.error || "No recording data available");
      }
    } catch (err) {
      setStats(null);
      setError(err instanceof Error ? err.message : "Failed to fetch recording status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordingStatus();
    
    // Poll every 2 seconds for real-time updates
    const interval = setInterval(() => {
      fetchRecordingStatus();
    }, 2000);
    
    return () => clearInterval(interval);
  }, [mintId]);

  if (loading && !stats) {
    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="center" p={2}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary" ml={1}>
              Loading recording status...
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error && !stats) {
    return (
      <Card sx={{ mb: 2, borderColor: "error.main" }}>
        <CardContent>
          <Typography variant="body2" color="error">
            Error: {error}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return null; // Don't render monitor if no stats
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getUploadStatusColor = (status: string): "success" | "warning" | "error" | "default" | "info" => {
    switch (status) {
      case "uploaded": return "success";
      case "processing": return "info";
      case "failed": return "error";
      default: return "default";
    }
  };

  const getUploadStatusIcon = (status: string) => {
    switch (status) {
      case "uploaded": return <CheckCircleIcon fontSize="small" />;
      case "processing": return <CircularProgress size={12} />;
      case "failed": return <ErrorIcon fontSize="small" />;
      default: return <UploadIcon fontSize="small" />;
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ p: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <Chip
              icon={<RecordIcon />}
              label="AUTO-RECORDING"
              size="small"
              color={stats.is_recording ? "success" : "default"}
              variant={stats.is_recording ? "filled" : "outlined"}
            />
            <Typography variant="body2" color="text.secondary">
              {stats.mint_id.slice(0, 8)}...
            </Typography>
          </Box>
          
          <Box display="flex" alignItems="center" gap={1}>
            <Tooltip title={`Segments created: ${stats.segments_created}`}>
              <Chip
                icon={<SegmentIcon />}
                label={`${stats.segments_created}`}
                size="small"
                variant="outlined"
              />
            </Tooltip>
            
            <Tooltip title={expanded ? "Collapse" : "Expand"}>
              <IconButton size="small" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Tooltip>
            
            {onToggle && (
              <Tooltip title={stats.is_recording ? "Pause recording" : "Resume recording"}>
                <IconButton 
                  size="small" 
                  color={stats.is_recording ? "success" : "default"}
                  onClick={() => onToggle(mintId)}
                >
                  {stats.is_recording ? <RecordIcon /> : <PauseIcon />}
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Current Segment Progress */}
        <Box mb={2}>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
            Current Segment #{stats.segment_index}
            {stats.active_segment_elapsed > 0 && ` • ${formatDuration(stats.active_segment_elapsed)} elapsed`}
          </Typography>
          <LinearProgress 
            variant="determinate" 
            value={Math.min((stats.active_segment_elapsed / 30) * 100, 100)}
            color={stats.is_recording ? "success" : "inherit"}
          />
        </Box>

        {/* Stats Bar */}
        <Box display="flex" gap={2} mb={2}>
          <Tooltip title="Frames captured">
            <Typography variant="caption" color="text.secondary">
              📊 {stats.frames_captured?.toLocaleString() || 0} frames
            </Typography>
          </Tooltip>
          
          <Tooltip title="Data written">
            <Typography variant="caption" color="text.secondary">
              💾 {formatFileSize(stats.bytes_written || 0)}
            </Typography>
          </Tooltip>
        </Box>

        {/* Expanded Details */}
        <Collapse in={expanded}>
          <Box mt={2} pt={2} borderTop="1px solid rgba(0,0,0,0.12)">
            {stats.current_segment && (
              <Box mb={2}>
                <Typography variant="subtitle2" gutterBottom>
                  Current Segment Details
                </Typography>
                <Box display="flex" flexDirection="column" gap={0.5}>
                  <Typography variant="caption">
                    Path: {stats.current_segment.segment_path.split('/').pop()}
                  </Typography>
                  <Typography variant="caption">
                    Duration: {stats.current_segment.segment_duration.toFixed(2)}s
                  </Typography>
                  <Typography variant="caption">
                    Size: {formatFileSize(stats.current_segment.file_size)}
                  </Typography>
                  <Typography variant="caption">
                    Timestamp: {format(new Date(stats.current_segment.segment_timestamp), 'HH:mm:ss')}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="caption">
                      Keyframe: {stats.current_segment.keyframe_boundary ? "Perfect" : "Regular"}
                    </Typography>
                    <Typography variant="caption">
                      Upload: 
                    </Typography>
                    <Chip
                      icon={getUploadStatusIcon(stats.current_segment.upload_status)}
                      label={stats.current_segment.upload_status}
                      size="small"
                      color={getUploadStatusColor(stats.current_segment.upload_status)}
                      variant="outlined"
                    />
                  </Box>
                </Box>
              </Box>
            )}

            {stats.recent_segments && stats.recent_segments.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Recent Segments
                </Typography>
                <Box display="flex" flexDirection="column" gap={1}>
                  {stats.recent_segments.slice(0, 3).map((segment) => (
                    <Box 
                      key={segment.segment_index} 
                      display="flex" 
                      alignItems="center" 
                      justifyContent="space-between"
                      p={1}
                      bgcolor="rgba(0,0,0,0.02)"
                      borderRadius={1}
                    >
                      <Box>
                        <Typography variant="caption" display="block">
                          Segment #{segment.segment_index} • {formatDuration(segment.segment_duration)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatFileSize(segment.file_size)} • {format(new Date(segment.segment_timestamp), 'HH:mm:ss')}
                        </Typography>
                      </Box>
                      <Chip
                        icon={getUploadStatusIcon(segment.upload_status)}
                        label={segment.upload_status}
                        size="small"
                        color={getUploadStatusColor(segment.upload_status)}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default RecordingMonitor;