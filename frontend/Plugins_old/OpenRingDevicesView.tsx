import React, { useState } from "react";
import {
  Box,
  Typography,
  Grid,
  Button,
  IconButton,
  Chip,
  TextField,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Videocam as CameraIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { MediaSource } from "@/types/plugin";

interface OpenRingDevicesViewProps {
  pluginName: string;
  devices: MediaSource[];
  subscriptions: any[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onSubscribe: (device: MediaSource) => Promise<void>;
  onUnsubscribe: (device: MediaSource) => Promise<void>;
}

const DeviceCard: React.FC<{
  device: MediaSource;
  isSubscribed: boolean;
  onSubscribe: (device: MediaSource) => Promise<void>;
  onUnsubscribe: (device: MediaSource) => Promise<void>;
}> = ({ device, isSubscribed, onSubscribe, onUnsubscribe }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const isOnline = device.metadata.is_online;

  const handleToggle = async () => {
    setIsProcessing(true);
    try {
      if (isSubscribed) {
        await onUnsubscribe(device);
      } else {
        await onSubscribe(device);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <CameraIcon color="action" />
            <Typography variant="h6" component="div">
              {device.metadata.device_name || device.source_id}
            </Typography>
          </Box>
          <Chip
            label={isOnline ? "Online" : "Offline"}
            color={isOnline ? "success" : "default"}
            size="small"
            variant="outlined"
          />
        </Box>
        <Typography color="text.secondary" variant="body2" gutterBottom>
          Type: {device.metadata.kind || "Unknown"}
        </Typography>
        <Typography color="text.secondary" variant="caption" display="block">
          ID: {device.source_id}
        </Typography>
      </CardContent>
      <CardActions>
        <Button
          fullWidth
          variant={isSubscribed ? "outlined" : "contained"}
          color={isSubscribed ? "error" : "primary"}
          startIcon={isProcessing ? <CircularProgress size={20} /> : isSubscribed ? <RemoveIcon /> : <AddIcon />}
          onClick={handleToggle}
          disabled={isProcessing}
        >
          {isSubscribed ? "Unsubscribe" : "Subscribe"}
        </Button>
      </CardActions>
    </Card>
  );
};

const OpenRingDevicesView: React.FC<OpenRingDevicesViewProps> = ({
  pluginName,
  devices,
  subscriptions,
  loading,
  error,
  onRefresh,
  onSubscribe,
  onUnsubscribe,
}) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyOnline, setShowOnlyOnline] = useState(false);
  const [showOnlySubscribed, setShowOnlySubscribed] = useState(false);

  const isSubscribed = (deviceId: string) => {
    return subscriptions.some((sub) => String(sub.device_id) === String(deviceId));
  };

  const filteredDevices = devices.filter((device) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = (device.metadata.device_name || "").toLowerCase().includes(query);
      const matchesId = device.source_id.toLowerCase().includes(query);
      if (!matchesName && !matchesId) {
        return false;
      }
    }

    // Online filter
    if (showOnlyOnline && !device.metadata.is_online) {
      return false;
    }

    // Subscribed filter
    if (showOnlySubscribed && !isSubscribed(device.source_id)) {
      return false;
    }

    return true;
  });

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <IconButton onClick={() => navigate("/plugins")} size="small">
            <BackIcon />
          </IconButton>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 0.5 }}>
              {pluginName} Devices
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Browse and subscribe to Ring devices. Subscribed devices will be auto-recorded when live.
            </Typography>
          </Box>
        </Box>
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={() => onRefresh()}
          disabled={loading}
          sx={{ textTransform: "none" }}
        >
          Refresh
        </Button>
      </Box>

      {/* Statistics */}
      <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ p: 2, backgroundColor: "#F9F9F9", borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Total Devices
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5 }}>
              {devices.length}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ p: 2, backgroundColor: "#FEF3C7", borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Subscribed
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5, color: "#D97706" }}>
              {subscriptions.length}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ p: 2, backgroundColor: "#D1FAE5", borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Online
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5, color: "#047857" }}>
              {devices.filter((d) => d.metadata.is_online).length}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Search and Filters */}
      <Box sx={{ mb: 3, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Box sx={{ flexGrow: 1, position: "relative", minWidth: 300 }}>
          <SearchIcon
            sx={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#9E9E9E",
            }}
          />
          <TextField
            fullWidth
            placeholder="Search devices by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            inputProps={{
              sx: {
                pl: 4,
                py: 1,
              },
            }}
            sx={{
              backgroundColor: "#FAFAFA",
              "& .MuiOutlinedInput-root": {
                borderRadius: "8px",
                "& fieldset": {
                  borderColor: "#E0E0E0",
                },
              },
            }}
            size="small"
          />
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Chip
            label="Online Only"
            onClick={() => setShowOnlyOnline(!showOnlyOnline)}
            color={showOnlyOnline ? "primary" : "default"}
            variant={showOnlyOnline ? "filled" : "outlined"}
            size="small"
            clickable
          />
          <Chip
            label="Subscribed Only"
            onClick={() => setShowOnlySubscribed(!showOnlySubscribed)}
            color={showOnlySubscribed ? "primary" : "default"}
            variant={showOnlySubscribed ? "filled" : "outlined"}
            size="small"
            clickable
          />
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => {}}>
          {error}
        </Alert>
      )}

      {/* Devices Grid */}
      {loading && devices.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flexGrow: 1, minHeight: 400 }}>
          <CircularProgress />
        </Box>
      ) : filteredDevices.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <FilterIcon sx={{ fontSize: 64, color: "#E0E0E0", mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No devices found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {searchQuery || showOnlyOnline || showOnlySubscribed
              ? "Try adjusting your search or filters"
              : "No devices available. Make sure you are authenticated in settings."}
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {filteredDevices.map((device) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={device.source_id}>
              <DeviceCard
                device={device}
                isSubscribed={isSubscribed(device.source_id)}
                onSubscribe={onSubscribe}
                onUnsubscribe={onUnsubscribe}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default OpenRingDevicesView;
