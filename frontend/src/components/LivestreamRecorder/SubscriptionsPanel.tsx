import React, { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Switch,
  Chip,
  Button,
  TextField,
  Alert,
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
} from "@mui/material";
import {
  FiberManualRecord as RecordIcon,
  LiveTv as LiveTvIcon,
  CheckCircle as EnabledIcon,
  Cancel as DisabledIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
} from "@mui/icons-material";
import { PumpFunStream, PumpFunSubscription } from "@/types/plugin";

interface SubscriptionsPanelProps {
  subscriptions: PumpFunSubscription[];
  streams: PumpFunStream[];
  onUpdateSubscription: (subscription: PumpFunSubscription, updates: Partial<PumpFunSubscription>) => Promise<void>;
  onUnsubscribe: (stream: PumpFunStream) => Promise<void>;
  unsubscribingStreams: Set<string>;
}

const SubscriptionsPanel: React.FC<SubscriptionsPanelProps> = ({
  subscriptions,
  streams,
  onUpdateSubscription,
  onUnsubscribe,
  unsubscribingStreams,
}) => {
  const [editingSubscription, setEditingSubscription] = useState<PumpFunSubscription | null>(null);
  const [priorityValue, setPriorityValue] = useState<string>("");
  const [notesValue, setNotesValue] = useState<string>("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ stream: PumpFunStream; subscription: PumpFunSubscription } | null>(null);

  const getStreamForSubscription = (subscription: PumpFunSubscription): PumpFunStream | undefined => {
    return streams.find((stream) => stream.stream_id === subscription.stream_id);
  };

  const handleEnableToggle = async (subscription: PumpFunSubscription) => {
    await onUpdateSubscription(subscription, { enabled: !subscription.enabled });
  };

  const handleEditClick = (subscription: PumpFunSubscription) => {
    setEditingSubscription(subscription);
    setPriorityValue(subscription.priority?.toString() || "5");
    setNotesValue(subscription.notes || "");
  };

  const handleSaveEdit = async () => {
    if (editingSubscription) {
      const updates: Partial<PumpFunSubscription> = {};
      const priorityNum = parseInt(priorityValue, 10);
      if (!isNaN(priorityNum) && priorityNum >= 0 && priorityNum <= 10) {
        updates.priority = priorityNum;
      }
      if (notesValue !== editingSubscription.notes) {
        updates.notes = notesValue;
      }
      await onUpdateSubscription(editingSubscription, updates);
      setEditingSubscription(null);
    }
  };

  const handleDeleteClick = (stream: PumpFunStream, subscription: PumpFunSubscription) => {
    setDeleteTarget({ stream, subscription });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget) {
      await onUnsubscribe(deleteTarget.stream);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const sortedSubscriptions = [...subscriptions].sort((a, b) => {
    // Sort by recording status: recording first
    if (a.is_currently_recording && !b.is_currently_recording) return -1;
    if (!a.is_currently_recording && b.is_currently_recording) return 1;

    // Then by enabled status: enabled first
    if (a.enabled && !b.enabled) return -1;
    if (!a.enabled && b.enabled) return 1;

    // Then by priority (higher first)
    const priorityA = a.priority || 5;
    const priorityB = b.priority || 5;
    if (priorityA > priorityB) return -1;
    if (priorityA < priorityB) return 1;

    // Finally by name
    return a.stream_name.localeCompare(b.stream_name);
  });

  const recordingSubscriptions = subscriptions.filter((sub) => sub.is_currently_recording).length;
  const enabledSubscriptions = subscriptions.filter((sub) => sub.enabled).length;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Stats */}
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <Card sx={{ flex: 1, minWidth: 200, p: 2, backgroundColor: "#F9F9F9" }}>
          <Typography variant="caption" color="text.secondary">
            Total Subscriptions
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5 }}>
            {subscriptions.length}
          </Typography>
        </Card>
        <Card sx={{ flex: 1, minWidth: 200, p: 2, backgroundColor: "#D1FAE5" }}>
          <Typography variant="caption" color="text.secondary">
            Currently Recording
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5, color: "#047857" }}>
            {recordingSubscriptions}
          </Typography>
        </Card>
        <Card sx={{ flex: 1, minWidth: 200, p: 2, backgroundColor: enabledSubscriptions > 0 ? "#FEF3C7" : "#FEE2E2" }}>
          <Typography variant="caption" color="text.secondary">
            Enabled Subscriptions
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 600, mt: 0.5, color: enabledSubscriptions > 0 ? "#D97706" : "#DC2626" }}>
            {enabledSubscriptions}
          </Typography>
        </Card>
      </Box>

      {/* Subscriptions List */}
      {subscriptions.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          You haven't subscribed to any streams yet. Browse the available streams and subscribe to start auto-recording.
        </Alert>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {sortedSubscriptions.map((subscription) => {
            const stream = getStreamForSubscription(subscription);
            const isUnsubscribing = unsubscribingStreams.has(subscription.stream_id);
            const isLive = stream?.is_currently_live ?? false;

            return (
              <Card key={subscription.stream_id}>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <Box sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "1rem" }}>
                          {subscription.stream_name}
                        </Typography>
                        {stream && isLive && (
                          <Chip
                            icon={<LiveTvIcon fontSize="small" />}
                            label="LIVE"
                            size="small"
                            sx={{
                              backgroundColor: "#DC2626",
                              color: "white",
                              fontSize: "0.7rem",
                            }}
                          />
                        )}
                        {subscription.is_currently_recording && (
                          <Chip
                            icon={<RecordIcon fontSize="small" />}
                            label="RECORDING"
                            size="small"
                            sx={{
                              backgroundColor: "#4CAF50",
                              color: "white",
                              fontSize: "0.7rem",
                            }}
                          />
                        )}
                        <Chip
                          icon={subscription.enabled ? <EnabledIcon fontSize="small" /> : <DisabledIcon fontSize="small" />}
                          label={subscription.enabled ? "Enabled" : "Disabled"}
                          size="small"
                          sx={{
                            backgroundColor: subscription.enabled ? "#10B981" : "#6B7280",
                            color: "white",
                            fontSize: "0.7rem",
                          }}
                        />
                      </Box>

                      <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Priority: {subscription.priority || 5} • Subscribed: {new Date(subscription.created_at).toLocaleDateString()}
                        </Typography>
                      </Box>

                      {subscription.notes && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          Notes: {subscription.notes}
                        </Typography>
                      )}

                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => handleEditClick(subscription)}
                          sx={{ fontSize: "0.7rem" }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color={subscription.enabled ? "error" : "inherit"}
                          startIcon={<DeleteIcon />}
                          onClick={() => stream && handleDeleteClick(stream, subscription)}
                          disabled={isUnsubscribing}
                          sx={{ fontSize: "0.7rem" }}
                        >
                          {isUnsubscribing ? <CircularProgress size={12} /> : "Unsubscribe"}
                        </Button>
                      </Box>
                    </Box>

                    <Tooltip title={subscription.enabled ? "Disable subscription" : "Enable subscription"} arrow>
                      <Switch
                        checked={subscription.enabled}
                        onChange={() => handleEnableToggle(subscription)}
                        color="success"
                      />
                    </Tooltip>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingSubscription} onClose={() => setEditingSubscription(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Subscription</DialogTitle>
        <DialogContent>
          {editingSubscription && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
              <TextField
                label="Priority (0-10)"
                type="number"
                value={priorityValue}
                onChange={(e) => setPriorityValue(e.target.value)}
                inputProps={{ min: 0, max: 10 }}
                helperText="Higher priority streams are recorded first when hitting concurrent limits"
              />
              <TextField
                label="Notes"
                multiline
                rows={3}
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                helperText="Why you subscribed to this stream"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingSubscription(null)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Unsubscribe from Stream</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to unsubscribe from "{deleteTarget?.subscription.stream_name}"?
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            This will stop any current recording and prevent future auto-recording of this stream.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Unsubscribe
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SubscriptionsPanel;