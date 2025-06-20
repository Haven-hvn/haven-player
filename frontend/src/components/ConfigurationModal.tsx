import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Box,
  Typography,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  IconButton,
} from "@mui/material";
import {
  Settings as SettingsIcon,
  Save as SaveIcon,
  Close as CloseIcon,
  SmartToy as AIIcon,
  Storage as ServerIcon,
  WorkspacePremium as BatchIcon,
} from "@mui/icons-material";

interface AppConfig {
  id: number;
  analysis_tags: string;
  llm_base_url: string;
  llm_model: string;
  max_batch_size: number;
  updated_at: string;
}

interface ConfigurationModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: Omit<AppConfig, "id" | "updated_at">) => Promise<void>;
}

const ConfigurationModal: React.FC<ConfigurationModalProps> = ({
  open,
  onClose,
  onSave,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState({
    analysis_tags: "",
    llm_base_url: "http://localhost:1234",
    llm_model: "HuggingFaceTB/SmolVLM-Instruct",
    max_batch_size: 1,
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      loadConfig();
      loadAvailableModels();
    }
  }, [open]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("http://localhost:8000/api/config/");
      if (!response.ok) throw new Error("Failed to load configuration");

      const data = await response.json();
      setConfig({
        analysis_tags: data.analysis_tags,
        llm_base_url: data.llm_base_url,
        llm_model: data.llm_model,
        max_batch_size: data.max_batch_size,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load configuration"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableModels = async () => {
    try {
      const response = await fetch(
        "http://localhost:8000/api/config/available-models/"
      );
      if (!response.ok) throw new Error("Failed to load available models");

      const data = await response.json();
      setAvailableModels(data.models);
    } catch (err) {
      console.error("Failed to load available models:", err);
      setAvailableModels(["HuggingFaceTB/SmolVLM-Instruct"]);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
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

  const handleTagsChange = (value: string) => {
    setConfig((prev) => ({ ...prev, analysis_tags: value }));
  };

  const tagList = config.analysis_tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
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
          {/* <Box
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
            <SettingsIcon sx={{ color: "#FFFFFF", fontSize: 18 }} />
          </Box> */}
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
            AI Analysis Configuration
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
          <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
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

            <Box sx={{ mt: 6 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  mb: 3,
                  pt: 2,
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
                  <AIIcon sx={{ color: "#FFFFFF", fontSize: 14 }} />
                </Box>
                <Typography
                  variant="h6"
                  sx={{
                    color: "#000000",
                    fontWeight: 500,
                    fontSize: "16px",
                  }}
                >
                  Analysis Tags
                </Typography>
              </Box>

              <TextField
                fullWidth
                label="Analysis Tags (comma-separated)"
                value={config.analysis_tags}
                onChange={(e) => handleTagsChange(e.target.value)}
                placeholder="person,car,bicycle,walking,running..."
                multiline
                rows={3}
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
                }}
              />

              {tagList.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "#6B6B6B",
                      mb: 2,
                      fontSize: "12px",
                      fontWeight: 500,
                    }}
                  >
                    TAGS PREVIEW ({tagList.length} tags)
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 1,
                      maxHeight: 120,
                      overflow: "auto",
                      p: 2,
                      backgroundColor: "#F7F7F7",
                      borderRadius: "8px",
                      border: "1px solid #F0F0F0",
                    }}
                  >
                    {tagList.map((tag, index) => (
                      <Chip
                        key={index}
                        label={tag}
                        size="small"
                        sx={{
                          backgroundColor: "#FFFFFF",
                          color: "#000000",
                          border: "1px solid #E0E0E0",
                          borderRadius: "16px",
                          fontSize: "12px",
                          fontWeight: 500,
                          "&:hover": {
                            backgroundColor: "#F5F5F5",
                            borderColor: "#BDBDBD",
                          },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>

            <Divider sx={{ backgroundColor: "#F0F0F0" }} />

            <Box>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}
              >
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    backgroundColor: "#4CAF50",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ServerIcon sx={{ color: "#FFFFFF", fontSize: 14 }} />
                </Box>
                <Typography
                  variant="h6"
                  sx={{
                    color: "#000000",
                    fontWeight: 500,
                    fontSize: "16px",
                  }}
                >
                  Language Model Configuration
                </Typography>
              </Box>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <TextField
                  fullWidth
                  label="LLM Base URL"
                  value={config.llm_base_url}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      llm_base_url: e.target.value,
                    }))
                  }
                  placeholder="http://localhost:1234"
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
                  }}
                />

                <FormControl fullWidth>
                  <InputLabel
                    sx={{
                      color: "#6B6B6B",
                      fontSize: "14px",
                      "&.Mui-focused": {
                        color: "#000000",
                      },
                    }}
                  >
                    Visual Language Model
                  </InputLabel>
                  <Select
                    value={config.llm_model}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        llm_model: e.target.value,
                      }))
                    }
                    sx={{
                      backgroundColor: "#FAFAFA",
                      borderRadius: "8px",
                      color: "#000000",
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: "#E0E0E0",
                      },
                      "&:hover .MuiOutlinedInput-notchedOutline": {
                        borderColor: "#BDBDBD",
                      },
                      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                        borderColor: "#000000",
                        borderWidth: "2px",
                      },
                      "& .MuiSvgIcon-root": {
                        color: "#6B6B6B",
                      },
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          backgroundColor: "#FFFFFF",
                          border: "1px solid #F0F0F0",
                          borderRadius: "8px",
                          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
                          mt: 1,
                        },
                      },
                    }}
                  >
                    {availableModels.map((model) => (
                      <MenuItem
                        key={model}
                        value={model}
                        sx={{
                          color: "#000000",
                          fontSize: "14px",
                          "&:hover": {
                            backgroundColor: "#F5F5F5",
                          },
                          "&.Mui-selected": {
                            backgroundColor: "#F0F0F0",
                            "&:hover": {
                              backgroundColor: "#EEEEEE",
                            },
                          },
                        }}
                      >
                        {model}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>

            <Divider sx={{ backgroundColor: "#F0F0F0" }} />

            <Box>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}
              >
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    backgroundColor: "#6B6B6B",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <BatchIcon sx={{ color: "#FFFFFF", fontSize: 14 }} />
                </Box>
                <Typography
                  variant="h6"
                  sx={{
                    color: "#000000",
                    fontWeight: 500,
                    fontSize: "16px",
                  }}
                >
                  Processing Configuration
                </Typography>
              </Box>

              <TextField
                fullWidth
                label="Max Batch Size"
                type="number"
                value={config.max_batch_size}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    max_batch_size: parseInt(e.target.value) || 1,
                  }))
                }
                inputProps={{ min: 1, max: 10 }}
                helperText="Number of videos to process simultaneously (1-10)"
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
            </Box>
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
          disabled={loading || saving}
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
            saving ? (
              <CircularProgress size={16} sx={{ color: "#FFFFFF" }} />
            ) : (
              <SaveIcon />
            )
          }
        >
          {saving ? "Saving..." : "Save Configuration"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfigurationModal;
