import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ConfigurationModal from '../ConfigurationModal';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

const darkTheme = createTheme({ palette: { mode: 'dark' } });

// Wrapper component with theme provider
const ThemeWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={darkTheme}>
    {children}
  </ThemeProvider>
);

// Mock response data
const mockConfigResponse = {
  id: 1,
  analysis_tags: 'person,car,bicycle,motorcycle',
  llm_base_url: 'http://localhost:1234',
  llm_model: 'HuggingFaceTB/SmolVLM-Instruct',
  max_batch_size: 1,
  updated_at: '2024-01-15T10:30:00Z'
};

const mockModelsResponse = {
  models: ['HuggingFaceTB/SmolVLM-Instruct', 'another-model']
};

describe('ConfigurationModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  const renderModal = (open: boolean = true) => {
    return render(
      <ThemeWrapper>
        <ConfigurationModal
          open={open}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      </ThemeWrapper>
    );
  };

  describe('Modal Visibility', () => {
    it('should not render when closed', () => {
      renderModal(false);
      expect(screen.queryByText('AI Analysis Configuration')).not.toBeInTheDocument();
    });

    it('should render when open', () => {
      // Mock successful config load
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse)
        }));

      renderModal(true);
      expect(screen.getByText('AI Analysis Configuration')).toBeInTheDocument();
    });
  });

  describe('Data Loading', () => {
    it('should load configuration and available models on open', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse)
        }));

      renderModal(true);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/config/');
        expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/config/available-models/');
      });
    });

    it('should show loading state while fetching config', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderModal(true);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should handle config loading error', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: false,
          status: 500
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse)
        }));

      renderModal(true);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load configuration/)).toBeInTheDocument();
      });
    });

    it('should handle models loading error gracefully', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: false,
          status: 500
        }));

      renderModal(true);

      // Should still work with fallback model
      await waitFor(() => {
        expect(screen.getByDisplayValue('HuggingFaceTB/SmolVLM-Instruct')).toBeInTheDocument();
      });
    });
  });

  describe('Form Fields', () => {
    beforeEach(async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse)
        }));

      renderModal(true);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfigResponse.analysis_tags)).toBeInTheDocument();
      });
    });

    it('should display loaded configuration values', () => {
      expect(screen.getByDisplayValue(mockConfigResponse.analysis_tags)).toBeInTheDocument();
      expect(screen.getByDisplayValue(mockConfigResponse.llm_base_url)).toBeInTheDocument();
      expect(screen.getByDisplayValue(mockConfigResponse.llm_model)).toBeInTheDocument();
      expect(screen.getByDisplayValue(mockConfigResponse.max_batch_size.toString())).toBeInTheDocument();
    });

    it('should allow editing analysis tags', async () => {
      const tagsInput = screen.getByDisplayValue(mockConfigResponse.analysis_tags);

      fireEvent.change(tagsInput, { target: { value: 'new,tags,test' } });

      expect(screen.getByDisplayValue('new,tags,test')).toBeInTheDocument();
    });

    it('should allow editing LLM base URL', async () => {
      const urlInput = screen.getByDisplayValue(mockConfigResponse.llm_base_url);

      fireEvent.change(urlInput, { target: { value: 'http://localhost:8080' } });

      expect(screen.getByDisplayValue('http://localhost:8080')).toBeInTheDocument();
    });

    it('should allow editing batch size', async () => {
      const batchSizeInput = screen.getByDisplayValue(mockConfigResponse.max_batch_size.toString());

      fireEvent.change(batchSizeInput, { target: { value: '5' } });

      expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    });
  });

  describe('Tags Preview', () => {
    beforeEach(async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse)
        }));

      renderModal(true);

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfigResponse.analysis_tags)).toBeInTheDocument();
      });
    });

    it('should display tag chips for each tag', () => {
      const tags = mockConfigResponse.analysis_tags.split(',');
      tags.forEach(tag => {
        expect(screen.getByText(tag)).toBeInTheDocument();
      });
    });

    it('should update tag preview when tags change', async () => {
      const tagsInput = screen.getByDisplayValue(mockConfigResponse.analysis_tags);

      fireEvent.change(tagsInput, { target: { value: 'test,preview' } });

      await waitFor(() => {
        expect(screen.getByText('test')).toBeInTheDocument();
        expect(screen.getByText('preview')).toBeInTheDocument();
      });
    });

    it('should show tag count', () => {
      const tagCount = mockConfigResponse.analysis_tags.split(',').length;
      expect(screen.getByText(`Tags Preview (${tagCount} tags):`)).toBeInTheDocument();
    });
  });

  describe('Save Functionality', () => {
    beforeEach(async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse)
        }));

      renderModal(true);

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfigResponse.analysis_tags)).toBeInTheDocument();
      });
    });

    it('should call onSave with current form data when save button clicked', async () => {
      mockOnSave.mockResolvedValue(undefined);

      // Modify some fields
      const tagsInput = screen.getByDisplayValue(mockConfigResponse.analysis_tags);
      fireEvent.change(tagsInput, { target: { value: 'updated,tags' } });

      const saveButton = screen.getByRole('button', { name: /Save Configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({
          analysis_tags: 'updated,tags',
          llm_base_url: mockConfigResponse.llm_base_url,
          llm_model: mockConfigResponse.llm_model,
          max_batch_size: mockConfigResponse.max_batch_size,
        });
      });
    });

    it('should close modal after successful save', async () => {
      mockOnSave.mockResolvedValue(undefined);

      const saveButton = screen.getByRole('button', { name: /Save Configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should show saving state during save', async () => {
      mockOnSave.mockImplementation(() => new Promise(() => {})); // Never resolves

      const saveButton = screen.getByRole('button', { name: /Save Configuration/i });
      fireEvent.click(saveButton);

      expect(screen.getByText('Saving...')).toBeInTheDocument();
      expect(saveButton).toBeDisabled();
    });

    it('should handle save error', async () => {
      const errorMessage = 'Save failed';
      mockOnSave.mockRejectedValue(new Error(errorMessage));

      const saveButton = screen.getByRole('button', { name: /Save Configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });

      // Modal should stay open
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Cancel Functionality', () => {
    it('should call onClose when cancel button clicked', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse)
        }));

      renderModal(true);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when clicking outside modal', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse)
        }));

      renderModal(true);

      // Click on backdrop
      const backdrop = document.querySelector('[role="presentation"]');
      if (backdrop) {
        fireEvent.click(backdrop);
        expect(mockOnClose).toHaveBeenCalled();
      }
    });
  });

  describe('Form Validation Display', () => {
    beforeEach(async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse)
        }));

      renderModal(true);

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfigResponse.analysis_tags)).toBeInTheDocument();
      });
    });

    it('should show helper text for batch size field', () => {
      expect(screen.getByText('Number of videos to process simultaneously (1-10)')).toBeInTheDocument();
    });

    it('should enforce batch size input constraints', () => {
      const batchSizeInput = screen.getByDisplayValue(mockConfigResponse.max_batch_size.toString());
      
      expect(batchSizeInput).toHaveAttribute('min', '1');
      expect(batchSizeInput).toHaveAttribute('max', '10');
      expect(batchSizeInput).toHaveAttribute('type', 'number');
    });
  });

  describe('Accessibility', () => {
    beforeEach(async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse)
        }));

      renderModal(true);

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfigResponse.analysis_tags)).toBeInTheDocument();
      });
    });

    it('should have proper dialog role', () => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have proper form labels', () => {
      expect(screen.getByLabelText(/Analysis Tags/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/LLM Base URL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Visual Language Model/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Max Batch Size/i)).toBeInTheDocument();
    });

    it('should have proper button labels', () => {
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Save Configuration/i })).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      renderModal(true);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load configuration/)).toBeInTheDocument();
      });
    });

    it('should clear error when modal is reopened', async () => {
      // First open with error
      mockFetch.mockRejectedValue(new Error('Network error'));
      const { rerender } = renderModal(true);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load configuration/)).toBeInTheDocument();
      });

      // Close modal
      rerender(
        <ThemeWrapper>
          <ConfigurationModal
            open={false}
            onClose={mockOnClose}
            onSave={mockOnSave}
          />
        </ThemeWrapper>
      );

      // Reopen with successful fetch
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse)
        }));

      rerender(
        <ThemeWrapper>
          <ConfigurationModal
            open={true}
            onClose={mockOnClose}
            onSave={mockOnSave}
          />
        </ThemeWrapper>
      );

      await waitFor(() => {
        expect(screen.queryByText(/Failed to load configuration/)).not.toBeInTheDocument();
      });
    });
  });
}); 