import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  SmartToy as AIIcon,
  Storage as ServerIcon,
  WorkspacePremium as BatchIcon,
} from '@mui/icons-material';

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
  onSave: (config: Omit<AppConfig, 'id' | 'updated_at'>) => Promise<void>;
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
    analysis_tags: '',
    llm_base_url: 'http://localhost:1234',
    llm_model: 'HuggingFaceTB/SmolVLM-Instruct',
    max_batch_size: 1,
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Load configuration when modal opens
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
      const response = await fetch('http://localhost:8000/api/config/');
      if (!response.ok) throw new Error('Failed to load configuration');
      
      const data = await response.json();
      setConfig({
        analysis_tags: data.analysis_tags,
        llm_base_url: data.llm_base_url,
        llm_model: data.llm_model,
        max_batch_size: data.max_batch_size,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableModels = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/config/available-models/');
      if (!response.ok) throw new Error('Failed to load available models');
      
      const data = await response.json();
      setAvailableModels(data.models);
    } catch (err) {
      console.error('Failed to load available models:', err);
      // Fallback to default model
      setAvailableModels(['HuggingFaceTB/SmolVLM-Instruct']);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave(config);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTagsChange = (value: string) => {
    setConfig(prev => ({ ...prev, analysis_tags: value }));
  };

  // Parse tags for display
  const tagList = config.analysis_tags.split(',').map(tag => tag.trim()).filter(tag => tag);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: '#2d2d2d',
          color: 'white',
          border: '1px solid #3a3a3a',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <SettingsIcon />
        <Typography variant="h6">AI Analysis Configuration</Typography>
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 1 }}>
            {error && (
              <Alert severity="error" sx={{ backgroundColor: '#4a1a1a', color: 'white' }}>
                {error}
              </Alert>
            )}

            {/* Analysis Tags Section */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AIIcon sx={{ color: '#90caf9' }} />
                <Typography variant="h6" sx={{ color: '#90caf9' }}>
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
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: '#1e1e1e',
                    color: 'white',
                    '& fieldset': { borderColor: '#3a3a3a' },
                    '&:hover fieldset': { borderColor: '#90caf9' },
                    '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                  },
                  '& .MuiInputLabel-root': { color: '#999' },
                  '& .MuiInputLabel-root.Mui-focused': { color: '#90caf9' },
                }}
              />
              
              {/* Tag Preview */}
              {tagList.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" sx={{ color: '#999', mb: 1 }}>
                    Tags Preview ({tagList.length} tags):
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 100, overflow: 'auto' }}>
                    {tagList.map((tag, index) => (
                      <Chip
                        key={index}
                        label={tag}
                        size="small"
                        sx={{
                          backgroundColor: '#3a3a3a',
                          color: 'white',
                          '&:hover': { backgroundColor: '#4a4a4a' },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>

            <Divider sx={{ backgroundColor: '#3a3a3a' }} />

            {/* LLM Configuration Section */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <ServerIcon sx={{ color: '#90caf9' }} />
                <Typography variant="h6" sx={{ color: '#90caf9' }}>
                  Language Model Configuration
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  fullWidth
                  label="LLM Base URL"
                  value={config.llm_base_url}
                  onChange={(e) => setConfig(prev => ({ ...prev, llm_base_url: e.target.value }))}
                  placeholder="http://localhost:1234"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: '#1e1e1e',
                      color: 'white',
                      '& fieldset': { borderColor: '#3a3a3a' },
                      '&:hover fieldset': { borderColor: '#90caf9' },
                      '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                    },
                    '& .MuiInputLabel-root': { color: '#999' },
                    '& .MuiInputLabel-root.Mui-focused': { color: '#90caf9' },
                  }}
                />

                <FormControl fullWidth>
                  <InputLabel sx={{ color: '#999', '&.Mui-focused': { color: '#90caf9' } }}>
                    Visual Language Model
                  </InputLabel>
                  <Select
                    value={config.llm_model}
                    onChange={(e) => setConfig(prev => ({ ...prev, llm_model: e.target.value }))}
                    sx={{
                      backgroundColor: '#1e1e1e',
                      color: 'white',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3a3a3a' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                      '& .MuiSvgIcon-root': { color: 'white' },
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          backgroundColor: '#2d2d2d',
                          border: '1px solid #3a3a3a',
                        },
                      },
                    }}
                  >
                    {availableModels.map((model) => (
                      <MenuItem key={model} value={model} sx={{ color: 'white' }}>
                        {model}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>

            <Divider sx={{ backgroundColor: '#3a3a3a' }} />

            {/* Processing Configuration Section */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <BatchIcon sx={{ color: '#90caf9' }} />
                <Typography variant="h6" sx={{ color: '#90caf9' }}>
                  Processing Configuration
                </Typography>
              </Box>

              <TextField
                fullWidth
                label="Max Batch Size"
                type="number"
                value={config.max_batch_size}
                onChange={(e) => setConfig(prev => ({ ...prev, max_batch_size: parseInt(e.target.value) || 1 }))}
                inputProps={{ min: 1, max: 10 }}
                helperText="Number of videos to process simultaneously (1-10)"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: '#1e1e1e',
                    color: 'white',
                    '& fieldset': { borderColor: '#3a3a3a' },
                    '&:hover fieldset': { borderColor: '#90caf9' },
                    '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                  },
                  '& .MuiInputLabel-root': { color: '#999' },
                  '& .MuiInputLabel-root.Mui-focused': { color: '#90caf9' },
                  '& .MuiFormHelperText-root': { color: '#999' },
                }}
              />
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onClose}
          disabled={saving}
          sx={{ color: '#999' }}
          startIcon={<CancelIcon />}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={loading || saving}
          variant="contained"
          sx={{
            backgroundColor: '#90caf9',
            color: '#000',
            '&:hover': { backgroundColor: '#7ab8f5' },
            '&:disabled': { backgroundColor: '#3a3a3a', color: '#666' },
          }}
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfigurationModal; 