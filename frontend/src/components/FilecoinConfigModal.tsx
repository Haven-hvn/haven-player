import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  FormHelperText,
} from "@mui/material";
import {
  Close as CloseIcon,
  CloudUpload as CloudUploadIcon,
} from "@mui/icons-material";
import type { FilecoinConfig } from "@/types/filecoin";

const { ipcRenderer } = require("electron");

interface FilecoinConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: FilecoinConfig) => Promise<void>;
}

const FilecoinConfigModal: React.FC<FilecoinConfigModalProps> = ({
  open,
  onClose,
  onSave,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<FilecoinConfig>({
    privateKey: "",
    rpcUrl: "wss://api.calibration.node.glif.io/rpc/v1",
    dataSetId: undefined,
  });

  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const savedConfig = await ipcRenderer.invoke("get-filecoin-config");
      if (savedConfig) {
        setConfig({
          privateKey: savedConfig.privateKey || "",
          rpcUrl: savedConfig.rpcUrl || "wss://api.calibration.node.glif.io/rpc/v1",
          dataSetId: savedConfig.dataSetId,
        });
      }
    } catch (err) {
      console.error("Failed to load Filecoin config:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.privateKey.trim()) {
      setError("Private key is required");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      // Save config via IPC
      await ipcRenderer.invoke("save-filecoin-config", {
        privateKey: config.privateKey,
        rpcUrl: config.rpcUrl,
        dataSetId: config.dataSetId,
      });

      await onSave(config);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save configuration"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: "#FFFFFF",
          color: "#000000",
          border: "1px solid #F0F0F0",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
          overflow: "hidden",
        },
      }}
      BackdropProps={{
        sx: {
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(8px)",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
          px: 3,
          pt: 3,
          backgroundColor: "#FAFAFA",
          borderBottom: "1px solid #F0F0F0",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <CloudUploadIcon sx={{ color: "#2196F3", fontSize: 24 }} />
          <Typography
            variant="h6"
            sx={{
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontWeight: 600,
              fontSize: "18px",
              color: "#000000",
              letterSpacing: "-0.01em",
            }}
          >
            Filecoin Configuration
          </Typography>
        </Box>
        <IconButton
          onClick={onClose}
          sx={{
            color: "#6B6B6B",
            "&:hover": {
              backgroundColor: "#F5F5F5",
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 3 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress sx={{ color: "#000000" }} />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {error && (
              <Alert
                severity="error"
                sx={{
                  backgroundColor: "#FFF5F5",
                  color: "#FF4D4D",
                  border: "1px solid #FFE0E0",
                  borderRadius: "8px",
                  "& .MuiAlert-icon": {
                    color: "#FF4D4D",
                  },
                }}
              >
                {error}
              </Alert>
            )}

            <TextField
              fullWidth
              label="Private Key (0x...)"
              value={config.privateKey}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, privateKey: e.target.value }))
              }
              placeholder="0x..."
              type="password"
              required
              helperText="Your Ethereum-style private key (must start with 0x)"
              sx={{
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "#FAFAFA",
                  borderRadius: "8px",
                  color: "#000000",
                  "& fieldset": {
                    borderColor: "#E0E0E0",
                  },
                  "&:hover fieldset": {
                    borderColor: "#BDBDBD",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#000000",
                    borderWidth: "2px",
                  },
                },
                "& .MuiInputLabel-root": {
                  color: "#6B6B6B",
                  fontSize: "14px",
                },
                "& .MuiInputLabel-root.Mui-focused": {
                  color: "#000000",
                },
                "& .MuiFormHelperText-root": {
                  color: "#6B6B6B",
                  fontSize: "12px",
                },
              }}
            />

            <TextField
              fullWidth
              label="RPC URL (optional)"
              value={config.rpcUrl}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, rpcUrl: e.target.value }))
              }
              placeholder="wss://api.calibration.node.glif.io/rpc/v1"
              helperText="Filecoin RPC endpoint (defaults to Calibration testnet)"
              sx={{
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "#FAFAFA",
                  borderRadius: "8px",
                  color: "#000000",
                  "& fieldset": {
                    borderColor: "#E0E0E0",
                  },
                  "&:hover fieldset": {
                    borderColor: "#BDBDBD",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#000000",
                    borderWidth: "2px",
                  },
                },
                "& .MuiInputLabel-root": {
                  color: "#6B6B6B",
                  fontSize: "14px",
                },
                "& .MuiInputLabel-root.Mui-focused": {
                  color: "#000000",
                },
                "& .MuiFormHelperText-root": {
                  color: "#6B6B6B",
                  fontSize: "12px",
                },
              }}
            />

            <TextField
              fullWidth
              label="Data Set ID (optional)"
              type="number"
              value={config.dataSetId || ""}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  dataSetId: e.target.value ? parseInt(e.target.value, 10) : undefined,
                }))
              }
              placeholder="Leave empty to create new"
              helperText="Use existing data set ID or leave empty to create a new one"
              sx={{
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "#FAFAFA",
                  borderRadius: "8px",
                  color: "#000000",
                  "& fieldset": {
                    borderColor: "#E0E0E0",
                  },
                  "&:hover fieldset": {
                    borderColor: "#BDBDBD",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#000000",
                    borderWidth: "2px",
                  },
                },
                "& .MuiInputLabel-root": {
                  color: "#6B6B6B",
                  fontSize: "14px",
                },
                "& .MuiInputLabel-root.Mui-focused": {
                  color: "#000000",
                },
                "& .MuiFormHelperText-root": {
                  color: "#6B6B6B",
                  fontSize: "12px",
                },
              }}
            />

            <Alert
              severity="info"
              sx={{
                backgroundColor: "#E3F2FD",
                color: "#1976D2",
                border: "1px solid #BBDEFB",
                borderRadius: "8px",
                "& .MuiAlert-icon": {
                  color: "#1976D2",
                },
              }}
            >
              <Typography
                sx={{
                  fontSize: "12px",
                  fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
                }}
              >
                <strong>Note:</strong> This uses Filecoin Calibration testnet. You'll need test FIL for gas and test USDFC for storage payments. Private keys are encrypted and stored securely on your device.
              </Typography>
            </Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          pb: 3,
          pt: 2,
          backgroundColor: "#FAFAFA",
          borderTop: "1px solid #F0F0F0",
          gap: 2,
        }}
      >
        <Button
          onClick={onClose}
          disabled={saving}
          sx={{
            color: "#6B6B6B",
            fontSize: "14px",
            fontWeight: 500,
            px: 3,
            py: 1,
            borderRadius: "8px",
            "&:hover": {
              backgroundColor: "#F5F5F5",
            },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={loading || saving || !config.privateKey.trim()}
          variant="contained"
          sx={{
            background: "linear-gradient(135deg, #2196F3 0%, #1976D2 100%)",
            color: "#FFFFFF",
            fontSize: "14px",
            fontWeight: 500,
            px: 4,
            py: 1,
            borderRadius: "8px",
            boxShadow: "none",
            "&:hover": {
              background: "linear-gradient(135deg, #1976D2 0%, #1565C0 100%)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            },
            "&:disabled": {
              backgroundColor: "#E0E0E0",
              color: "#9E9E9E",
            },
          }}
          startIcon={
            saving ? (
              <CircularProgress size={16} sx={{ color: "#FFFFFF" }} />
            ) : (
              <CloudUploadIcon />
            )
          }
        >
          {saving ? "Saving..." : "Save Configuration"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FilecoinConfigModal;

