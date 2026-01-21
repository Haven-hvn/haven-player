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
  alpha,
} from "@mui/material";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import LinkIcon from "@mui/icons-material/Link";
import CloseIcon from "@mui/icons-material/Close";

interface AddVideoModalProps {
  open: boolean;
  onClose: () => void;
  onAddLocalFile: () => void;
  onAddMagnetUrl: (url: string) => void;
  isBitTorrentEnabled: boolean;
}

// Design tokens from Liquid Glass system
const glassTokens = {
  canvas: {
    base: '#0A0A0F',
    elevated: '#12121A',
  },
  glass: {
    fill: 'rgba(255, 255, 255, 0.06)',
    fillHover: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.08)',
    blur: 16,
  },
  neon: {
    cyan: '#00F5FF',
    magenta: '#FF00E5',
    amber: '#FFB800',
  },
  text: {
    primary: 'rgba(255, 255, 255, 1)',
    secondary: 'rgba(255, 255, 255, 0.7)',
    tertiary: 'rgba(255, 255, 255, 0.4)',
  },
  state: {
    success: '#00FF88',
    warning: '#FFB800',
    error: '#FF3366',
  },
};

const AddVideoModal: React.FC<AddVideoModalProps> = ({
  open,
  onClose,
  onAddLocalFile,
  onAddMagnetUrl,
  isBitTorrentEnabled,
}) => {
  const [magnetUrl, setMagnetUrl] = useState("");
  const [isFocused, setIsFocused] = useState(false);

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

  const isValidMagnet = validateMagnetUrl(magnetUrl);
  const hasError = magnetUrl.length > 0 && !isValidMagnet;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          background: glassTokens.canvas.elevated,
          backdropFilter: `blur(${glassTokens.glass.blur}px) saturate(180%)`,
          border: `1px solid ${glassTokens.glass.border}`,
          borderRadius: '16px',
          boxShadow: `
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            0 0 0 1px rgba(0, 0, 0, 0.5),
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 0 80px ${alpha(glassTokens.neon.cyan, 0.1)}
          `,
          overflow: 'hidden',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: `linear-gradient(90deg, 
              transparent 0%, 
              ${alpha(glassTokens.neon.cyan, 0.5)} 50%, 
              transparent 100%
            )`,
          },
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(4px)',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          color: glassTokens.text.primary,
          fontWeight: 700,
          fontSize: '20px',
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              background: `linear-gradient(135deg, ${alpha(glassTokens.neon.cyan, 0.2)} 0%, ${alpha(glassTokens.neon.magenta, 0.2)} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 20px ${alpha(glassTokens.neon.cyan, 0.3)}`,
            }}
          >
            <LinkIcon sx={{ fontSize: 18, color: glassTokens.neon.cyan }} />
          </Box>
          Add New Video
        </Box>
        <Button
          onClick={onClose}
          sx={{
            minWidth: 'auto',
            p: 0.5,
            borderRadius: '8px',
            color: glassTokens.text.tertiary,
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: glassTokens.text.primary,
            },
          }}
        >
          <CloseIcon fontSize="small" />
        </Button>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Local File Button */}
          <Button
            variant="outlined"
            onClick={handleAddLocal}
            startIcon={<FolderOpenIcon />}
            sx={{
              py: 2,
              px: 3,
              borderRadius: '12px',
              background: glassTokens.glass.fill,
              border: `1px solid ${glassTokens.glass.border}`,
              color: glassTokens.text.primary,
              fontWeight: 500,
              textTransform: 'none',
              fontSize: '14px',
              transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
              '&:hover': {
                background: glassTokens.glass.fillHover,
                border: `1px solid ${alpha(glassTokens.neon.cyan, 0.3)}`,
                boxShadow: `
                  0 0 20px ${alpha(glassTokens.neon.cyan, 0.15)},
                  inset 0 0 20px ${alpha(glassTokens.neon.cyan, 0.05)}
                `,
              },
              '& .MuiSvgIcon-root': {
                color: glassTokens.neon.cyan,
              },
            }}
          >
            Add from Local File
          </Button>

          {isBitTorrentEnabled && (
            <>
              {/* Divider */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Box
                  sx={{
                    flex: 1,
                    height: '1px',
                    background: `linear-gradient(90deg, transparent, ${glassTokens.glass.border})`,
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    color: glassTokens.text.tertiary,
                    fontSize: '12px',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  or
                </Typography>
                <Box
                  sx={{
                    flex: 1,
                    height: '1px',
                    background: `linear-gradient(90deg, ${glassTokens.glass.border}, transparent)`,
                  }}
                />
              </Box>

              {/* Magnet URL Input */}
              <TextField
                label="Magnet URL"
                placeholder="magnet:?xt=urn:btih:..."
                value={magnetUrl}
                onChange={(e) => setMagnetUrl(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                variant="outlined"
                fullWidth
                error={hasError}
                helperText={hasError ? "Invalid magnet URL format" : ""}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '12px',
                    backgroundColor: glassTokens.glass.fill,
                    transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
                    '& fieldset': {
                      borderColor: hasError 
                        ? alpha(glassTokens.state.error, 0.5) 
                        : glassTokens.glass.border,
                      transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
                    },
                    '&:hover fieldset': {
                      borderColor: hasError
                        ? glassTokens.state.error
                        : alpha(glassTokens.neon.magenta, 0.5),
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: hasError
                        ? glassTokens.state.error
                        : glassTokens.neon.magenta,
                      boxShadow: hasError
                        ? `0 0 20px ${alpha(glassTokens.state.error, 0.2)}`
                        : `0 0 20px ${alpha(glassTokens.neon.magenta, 0.2)}`,
                    },
                    '&.Mui-focused': {
                      backgroundColor: glassTokens.glass.fillHover,
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: glassTokens.text.tertiary,
                    '&.Mui-focused': {
                      color: hasError ? glassTokens.state.error : glassTokens.neon.magenta,
                    },
                  },
                  '& .MuiOutlinedInput-input': {
                    color: glassTokens.text.primary,
                    '&::placeholder': {
                      color: glassTokens.text.tertiary,
                      opacity: 1,
                    },
                  },
                  '& .MuiFormHelperText-root': {
                    color: glassTokens.state.error,
                    marginLeft: '4px',
                  },
                }}
              />

              {/* Add Magnet Button */}
              <Button
                variant="contained"
                onClick={handleAddMagnet}
                disabled={!isValidMagnet}
                startIcon={<LinkIcon />}
                sx={{
                  py: 1.5,
                  px: 3,
                  borderRadius: '12px',
                  background: isValidMagnet
                    ? `linear-gradient(135deg, ${glassTokens.neon.magenta} 0%, ${alpha(glassTokens.neon.cyan, 0.8)} 100%)`
                    : glassTokens.glass.fill,
                  color: isValidMagnet ? '#FFFFFF' : glassTokens.text.tertiary,
                  fontWeight: 600,
                  textTransform: 'none',
                  fontSize: '14px',
                  border: 'none',
                  boxShadow: isValidMagnet
                    ? `0 0 30px ${alpha(glassTokens.neon.magenta, 0.4)}`
                    : 'none',
                  transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
                  '&:hover': {
                    background: isValidMagnet
                      ? `linear-gradient(135deg, ${alpha(glassTokens.neon.magenta, 0.9)} 0%, ${glassTokens.neon.cyan} 100%)`
                      : glassTokens.glass.fill,
                    boxShadow: isValidMagnet
                      ? `0 0 40px ${alpha(glassTokens.neon.magenta, 0.5)}`
                      : 'none',
                  },
                  '&.Mui-disabled': {
                    background: glassTokens.glass.fill,
                    color: glassTokens.text.tertiary,
                  },
                }}
              >
                Add from Magnet URL
              </Button>
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: `1px solid ${glassTokens.glass.border}`,
        }}
      >
        <Button
          onClick={onClose}
          sx={{
            color: glassTokens.text.secondary,
            textTransform: 'none',
            fontWeight: 500,
            px: 2,
            borderRadius: '8px',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: glassTokens.text.primary,
            },
          }}
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddVideoModal;
