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
  Alert,
  CircularProgress,
  IconButton,
  Divider,
} from "@mui/material";
import {
  Add as AddIcon,
  Close as CloseIcon,
  Link as LinkIcon,
  LiveTv as LiveTvIcon,
} from "@mui/icons-material";
import { StreamInfo } from "@/types/video";

export interface AddLivestreamFormData {
  rtcUrl: string;
  streamName: string;
  mintId: string;
  symbol?: string;
  description?: string;
}

interface AddLivestreamModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AddLivestreamFormData) => Promise<void>;
  existingMintIds?: Set<string>;
}

const AddLivestreamModal: React.FC<AddLivestreamModalProps> = ({
  open,
  onClose,
  onSubmit,
  existingMintIds = new Set(),
}) => {
  const [formData, setFormData] = useState<AddLivestreamFormData>({
    rtcUrl: "",
    streamName: "",
    mintId: "",
    symbol: "",
    description: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AddLivestreamFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validateRtcUrl = (url: string): boolean => {
    if (!url.trim()) {
      return false;
    }
    // Accept WebSocket URLs (wss:// or ws://)
    if (url.startsWith("wss://") || url.startsWith("ws://")) {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    }
    // Accept LiveKit room URLs or connection strings
    // Format: room://room-name or similar patterns
    if (url.includes("://") || url.includes("/")) {
      return true;
    }
    // Accept mint_id as a fallback (for pump.fun streams)
    return url.length > 0;
  };

  const validateMintId = (mintId: string): boolean => {
    if (!mintId.trim()) {
      return false;
    }
    // Basic validation: non-empty string
    // Check for duplicates if existingMintIds is provided
    if (existingMintIds.has(mintId.trim())) {
      return false;
    }
    return true;
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof AddLivestreamFormData, string>> = {};

    // Validate RTC URL or connection string
    if (!formData.rtcUrl.trim()) {
      newErrors.rtcUrl = "RTC URL or connection string is required";
    } else if (!validateRtcUrl(formData.rtcUrl)) {
      newErrors.rtcUrl = "Invalid RTC URL format. Use wss://, ws://, or a valid connection string";
    }

    // Validate mint ID (required for identification)
    if (!formData.mintId.trim()) {
      newErrors.mintId = "Mint ID is required";
    } else if (!validateMintId(formData.mintId)) {
      if (existingMintIds.has(formData.mintId.trim())) {
        newErrors.mintId = "A livestream with this mint ID already exists";
      } else {
        newErrors.mintId = "Invalid mint ID format";
      }
    }

    // Validate stream name (optional but recommended)
    if (formData.streamName.trim() && formData.streamName.trim().length < 2) {
      newErrors.streamName = "Stream name must be at least 2 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof AddLivestreamFormData) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const value = event.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
    // Clear submit error when user makes changes
    if (submitError) {
      setSubmitError(null);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await onSubmit({
        rtcUrl: formData.rtcUrl.trim(),
        streamName: formData.streamName.trim() || formData.mintId.trim(),
        mintId: formData.mintId.trim(),
        symbol: formData.symbol?.trim() || undefined,
        description: formData.description?.trim() || undefined,
      });
      // Reset form on success
      setFormData({
        rtcUrl: "",
        streamName: "",
        mintId: "",
        symbol: "",
        description: "",
      });
      setErrors({});
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to add livestream"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) {
      return; // Prevent closing while submitting
    }
    // Reset form when closing
    setFormData({
      rtcUrl: "",
      streamName: "",
      mintId: "",
      symbol: "",
      description: "",
    });
    setErrors({});
    setSubmitError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
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
          <Box
            sx={{
              width: 32,
              height: 32,
              background: "linear-gradient(135deg, #000000 0%, #424242 100%)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AddIcon sx={{ color: "#FFFFFF", fontSize: 18 }} />
          </Box>
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
            Add RTC Livestream
          </Typography>
        </Box>
        <IconButton
          onClick={handleClose}
          disabled={isSubmitting}
          sx={{
            color: "#6B6B6B",
            "&:hover": {
              backgroundColor: "#F5F5F5",
            },
            "&:disabled": {
              opacity: 0.5,
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 3 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {submitError && (
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
              {submitError}
            </Alert>
          )}

          <Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                mb: 2,
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  backgroundColor: "#2196F3",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LinkIcon sx={{ color: "#FFFFFF", fontSize: 14 }} />
              </Box>
              <Typography
                variant="h6"
                sx={{
                  color: "#000000",
                  fontWeight: 500,
                  fontSize: "16px",
                }}
              >
                Connection Details
              </Typography>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                fullWidth
                required
                label="RTC URL or Connection String"
                value={formData.rtcUrl}
                onChange={handleInputChange("rtcUrl")}
                placeholder="wss://example.com/room or room://room-name"
                error={!!errors.rtcUrl}
                helperText={
                  errors.rtcUrl ||
                  "WebSocket URL (wss:// or ws://) or LiveKit connection string"
                }
                disabled={isSubmitting}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "#FAFAFA",
                    borderRadius: "8px",
                    color: "#000000",
                    "& fieldset": {
                      borderColor: errors.rtcUrl ? "#FF4D4D" : "#E0E0E0",
                    },
                    "&:hover fieldset": {
                      borderColor: errors.rtcUrl ? "#FF4D4D" : "#BDBDBD",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: errors.rtcUrl ? "#FF4D4D" : "#000000",
                      borderWidth: "2px",
                    },
                    "&.Mui-disabled": {
                      backgroundColor: "#F5F5F5",
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "#6B6B6B",
                    fontSize: "14px",
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: errors.rtcUrl ? "#FF4D4D" : "#000000",
                  },
                  "& .MuiFormHelperText-root": {
                    color: errors.rtcUrl ? "#FF4D4D" : "#6B6B6B",
                    fontSize: "12px",
                  },
                }}
              />

              <TextField
                fullWidth
                required
                label="Mint ID"
                value={formData.mintId}
                onChange={handleInputChange("mintId")}
                placeholder="Unique identifier for this stream"
                error={!!errors.mintId}
                helperText={
                  errors.mintId ||
                  "Unique identifier (e.g., pump.fun mint ID)"
                }
                disabled={isSubmitting}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "#FAFAFA",
                    borderRadius: "8px",
                    color: "#000000",
                    "& fieldset": {
                      borderColor: errors.mintId ? "#FF4D4D" : "#E0E0E0",
                    },
                    "&:hover fieldset": {
                      borderColor: errors.mintId ? "#FF4D4D" : "#BDBDBD",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: errors.mintId ? "#FF4D4D" : "#000000",
                      borderWidth: "2px",
                    },
                    "&.Mui-disabled": {
                      backgroundColor: "#F5F5F5",
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "#6B6B6B",
                    fontSize: "14px",
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: errors.mintId ? "#FF4D4D" : "#000000",
                  },
                  "& .MuiFormHelperText-root": {
                    color: errors.mintId ? "#FF4D4D" : "#6B6B6B",
                    fontSize: "12px",
                  },
                }}
              />
            </Box>
          </Box>

          <Divider sx={{ backgroundColor: "#F0F0F0" }} />

          <Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                mb: 2,
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  backgroundColor: "#F9A825",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LiveTvIcon sx={{ color: "#FFFFFF", fontSize: 14 }} />
              </Box>
              <Typography
                variant="h6"
                sx={{
                  color: "#000000",
                  fontWeight: 500,
                  fontSize: "16px",
                }}
              >
                Stream Information (Optional)
              </Typography>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                fullWidth
                label="Stream Name"
                value={formData.streamName}
                onChange={handleInputChange("streamName")}
                placeholder="Display name for the stream"
                error={!!errors.streamName}
                helperText={errors.streamName || "Optional: Display name"}
                disabled={isSubmitting}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "#FAFAFA",
                    borderRadius: "8px",
                    color: "#000000",
                    "& fieldset": {
                      borderColor: errors.streamName ? "#FF4D4D" : "#E0E0E0",
                    },
                    "&:hover fieldset": {
                      borderColor: errors.streamName ? "#FF4D4D" : "#BDBDBD",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: errors.streamName ? "#FF4D4D" : "#000000",
                      borderWidth: "2px",
                    },
                    "&.Mui-disabled": {
                      backgroundColor: "#F5F5F5",
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "#6B6B6B",
                    fontSize: "14px",
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: errors.streamName ? "#FF4D4D" : "#000000",
                  },
                  "& .MuiFormHelperText-root": {
                    color: errors.streamName ? "#FF4D4D" : "#6B6B6B",
                    fontSize: "12px",
                  },
                }}
              />

              <TextField
                fullWidth
                label="Symbol"
                value={formData.symbol}
                onChange={handleInputChange("symbol")}
                placeholder="e.g., BTC, ETH"
                disabled={isSubmitting}
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
                    "&.Mui-disabled": {
                      backgroundColor: "#F5F5F5",
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "#6B6B6B",
                    fontSize: "14px",
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: "#000000",
                  },
                }}
              />

              <TextField
                fullWidth
                label="Description"
                value={formData.description}
                onChange={handleInputChange("description")}
                placeholder="Optional description"
                multiline
                rows={3}
                disabled={isSubmitting}
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
                    "&.Mui-disabled": {
                      backgroundColor: "#F5F5F5",
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "#6B6B6B",
                    fontSize: "14px",
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: "#000000",
                  },
                }}
              />
            </Box>
          </Box>
        </Box>
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
          onClick={handleClose}
          disabled={isSubmitting}
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
            "&:disabled": {
              opacity: 0.5,
            },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          variant="contained"
          sx={{
            background: "linear-gradient(135deg, #000000 0%, #424242 100%)",
            color: "#FFFFFF",
            fontSize: "14px",
            fontWeight: 500,
            px: 4,
            py: 1,
            borderRadius: "8px",
            boxShadow: "none",
            "&:hover": {
              background: "linear-gradient(135deg, #424242 0%, #000000 100%)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            },
            "&:disabled": {
              backgroundColor: "#E0E0E0",
              color: "#9E9E9E",
            },
          }}
          startIcon={
            isSubmitting ? (
              <CircularProgress size={16} sx={{ color: "#FFFFFF" }} />
            ) : (
              <AddIcon />
            )
          }
        >
          {isSubmitting ? "Adding..." : "Add Livestream"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddLivestreamModal;

