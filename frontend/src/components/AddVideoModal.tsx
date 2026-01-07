import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
} from "@mui/material";

interface AddVideoModalProps {
  open: boolean;
  onClose: () => void;
  onAddLocalFile: () => void;
  onAddMagnetUrl: (url: string) => void;
  isBitTorrentEnabled: boolean;
}

const AddVideoModal: React.FC<AddVideoModalProps> = ({
  open,
  onClose,
  onAddLocalFile,
  onAddMagnetUrl,
  isBitTorrentEnabled,
}) => {
  const [magnetUrl, setMagnetUrl] = useState("");

  const handleAddMagnet = () => {
    onAddMagnetUrl(magnetUrl);
    setMagnetUrl("");
    onClose();
  };

  const handleAddLocal = () => {
    onAddLocalFile();
    onClose();
  };

  const validateMagnetUrl = (url: string) => {
    return /^magnet:\?xt=urn:btih:[a-zA-Z0-9]{40}/.test(url);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add a new video</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
          <Button
            variant="outlined"
            onClick={handleAddLocal}
            sx={{
              py: 1.5,
              borderColor: "#E0E0E0",
              color: "#000000",
              "&:hover": {
                backgroundColor: "#F5F5F5",
                borderColor: "#BDBDBD",
              },
            }}
          >
            Add from Local File
          </Button>

          {isBitTorrentEnabled && (
            <>
              <Typography
                variant="body2"
                sx={{
                  textAlign: "center",
                  color: "#6B6B6B",
                  my: 1,
                }}
              >
                OR
              </Typography>
              <TextField
                label="Magnet URL"
                placeholder="Paste magnet URL..."
                value={magnetUrl}
                onChange={(e) => setMagnetUrl(e.target.value)}
                variant="outlined"
                fullWidth
                error={magnetUrl.length > 0 && !validateMagnetUrl(magnetUrl)}
                helperText={
                  magnetUrl.length > 0 && !validateMagnetUrl(magnetUrl)
                    ? "Invalid magnet URL format."
                    : ""
                }
              />
              <Button
                variant="contained"
                onClick={handleAddMagnet}
                disabled={!validateMagnetUrl(magnetUrl)}
                sx={{ py: 1.5 }}
              >
                Add from Magnet URL
              </Button>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddVideoModal;