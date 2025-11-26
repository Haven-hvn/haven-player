import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import FilecoinConfigModal from '../FilecoinConfigModal';
import type { FilecoinConfig } from '@/types/filecoin';

// Mock electron ipcRenderer
const mockIpcRenderer = {
  invoke: jest.fn(),
};

jest.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
}), { virtual: true });

const theme = createTheme({ palette: { mode: 'light' } });

// Wrapper component with theme provider
const ThemeWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={theme}>
    {children}
  </ThemeProvider>
);

describe('FilecoinConfigModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn();

  const mockConfig: FilecoinConfig = {
    privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    rpcUrl: 'wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1',
    dataSetId: 123,
    encryptionEnabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIpcRenderer.invoke.mockReset();
  });

  const renderModal = (open: boolean = true) => {
    return render(
      <ThemeWrapper>
        <FilecoinConfigModal
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
      expect(screen.queryByText('Filecoin Configuration')).not.toBeInTheDocument();
    });

    it('should render when open', async () => {
      mockIpcRenderer.invoke.mockResolvedValue(null);
      
      renderModal(true);
      
      expect(screen.getByText('Filecoin Configuration')).toBeInTheDocument();
    });
  });

  describe('Data Loading', () => {
    it('should load saved configuration on open', async () => {
      mockIpcRenderer.invoke.mockResolvedValue(mockConfig);
      
      renderModal(true);

      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('get-filecoin-config');
      });
    });

    it('should display saved configuration values', async () => {
      mockIpcRenderer.invoke.mockResolvedValue(mockConfig);
      
      renderModal(true);

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfig.rpcUrl!)).toBeInTheDocument();
        expect(screen.getByDisplayValue(mockConfig.dataSetId!.toString())).toBeInTheDocument();
      });
    });

    it('should show loading state while fetching config', async () => {
      mockIpcRenderer.invoke.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      renderModal(true);
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Form Fields', () => {
    beforeEach(async () => {
      mockIpcRenderer.invoke.mockResolvedValue(mockConfig);
      renderModal(true);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfig.rpcUrl!)).toBeInTheDocument();
      });
    });

    it('should allow editing private key', () => {
      const privateKeyInput = screen.getByLabelText(/Private Key/i);
      
      fireEvent.change(privateKeyInput, { 
        target: { value: '0xnewprivatekey1234567890abcdef1234567890abcdef1234567890abcdef' } 
      });

      expect(screen.getByDisplayValue('0xnewprivatekey1234567890abcdef1234567890abcdef1234567890abcdef')).toBeInTheDocument();
    });

    it('should allow editing RPC URL', () => {
      const rpcUrlInput = screen.getByDisplayValue(mockConfig.rpcUrl!);
      
      fireEvent.change(rpcUrlInput, { target: { value: 'https://new-rpc-url.com' } });

      expect(screen.getByDisplayValue('https://new-rpc-url.com')).toBeInTheDocument();
    });

    it('should allow editing data set ID', () => {
      const dataSetIdInput = screen.getByDisplayValue(mockConfig.dataSetId!.toString());
      
      fireEvent.change(dataSetIdInput, { target: { value: '456' } });

      expect(screen.getByDisplayValue('456')).toBeInTheDocument();
    });
  });

  describe('Encryption Toggle', () => {
    beforeEach(async () => {
      mockIpcRenderer.invoke.mockResolvedValue(mockConfig);
      renderModal(true);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfig.rpcUrl!)).toBeInTheDocument();
      });
    });

    it('should display encryption toggle', () => {
      expect(screen.getByText('Encrypt videos before upload')).toBeInTheDocument();
    });

    it('should show encryption disabled message by default', () => {
      expect(screen.getByText('Videos will be uploaded to Filecoin without encryption.')).toBeInTheDocument();
    });

    it('should toggle encryption setting when clicked', async () => {
      const toggle = screen.getByRole('checkbox');
      
      // Initially unchecked
      expect(toggle).not.toBeChecked();
      
      // Click to enable
      fireEvent.click(toggle);
      
      await waitFor(() => {
        expect(toggle).toBeChecked();
        expect(screen.getByText(/Videos will be encrypted with Lit Protocol/)).toBeInTheDocument();
      });
    });

    it('should load encryption enabled state from saved config', async () => {
      const encryptedConfig = { ...mockConfig, encryptionEnabled: true };
      mockIpcRenderer.invoke.mockResolvedValue(encryptedConfig);
      
      const { unmount } = renderModal(true);
      unmount();
      
      renderModal(true);

      await waitFor(() => {
        const toggle = screen.getByRole('checkbox');
        expect(toggle).toBeChecked();
      });
    });
  });

  describe('Save Functionality', () => {
    beforeEach(async () => {
      mockIpcRenderer.invoke.mockResolvedValue(mockConfig);
      renderModal(true);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfig.rpcUrl!)).toBeInTheDocument();
      });
    });

    it('should save encryption setting when toggled', async () => {
      mockOnSave.mockResolvedValue(undefined);
      mockIpcRenderer.invoke.mockResolvedValue(undefined); // For save-filecoin-config
      
      // Toggle encryption on
      const toggle = screen.getByRole('checkbox');
      fireEvent.click(toggle);
      
      // Enter private key (required for save)
      const privateKeyInput = screen.getByLabelText(/Private Key/i);
      fireEvent.change(privateKeyInput, { 
        target: { value: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' } 
      });
      
      // Click save
      const saveButton = screen.getByRole('button', { name: /Save Configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
          'save-filecoin-config',
          expect.objectContaining({
            encryptionEnabled: true,
          })
        );
      });
    });

    it('should call onSave with current config including encryption setting', async () => {
      mockOnSave.mockResolvedValue(undefined);
      mockIpcRenderer.invoke.mockResolvedValue(undefined);
      
      // Enable encryption
      const toggle = screen.getByRole('checkbox');
      fireEvent.click(toggle);
      
      // Enter private key
      const privateKeyInput = screen.getByLabelText(/Private Key/i);
      fireEvent.change(privateKeyInput, { 
        target: { value: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' } 
      });
      
      // Save
      const saveButton = screen.getByRole('button', { name: /Save Configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            encryptionEnabled: true,
          })
        );
      });
    });

    it('should close modal after successful save', async () => {
      mockOnSave.mockResolvedValue(undefined);
      mockIpcRenderer.invoke.mockResolvedValue(undefined);
      
      // Enter private key
      const privateKeyInput = screen.getByLabelText(/Private Key/i);
      fireEvent.change(privateKeyInput, { 
        target: { value: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' } 
      });
      
      const saveButton = screen.getByRole('button', { name: /Save Configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should require private key for save', async () => {
      const saveButton = screen.getByRole('button', { name: /Save Configuration/i });
      
      // Button should be disabled when private key is empty
      expect(saveButton).toBeDisabled();
    });
  });

  describe('Cancel Functionality', () => {
    it('should call onClose when cancel button clicked', async () => {
      mockIpcRenderer.invoke.mockResolvedValue(null);
      renderModal(true);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Info Alert', () => {
    it('should display Lit Protocol info when encryption is enabled', async () => {
      mockIpcRenderer.invoke.mockResolvedValue(mockConfig);
      renderModal(true);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfig.rpcUrl!)).toBeInTheDocument();
      });

      // Enable encryption
      const toggle = screen.getByRole('checkbox');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(screen.getByText(/Lit Protocol encryption uses the Datil-dev network/)).toBeInTheDocument();
      });
    });

    it('should not display Lit Protocol info when encryption is disabled', async () => {
      mockIpcRenderer.invoke.mockResolvedValue(mockConfig);
      renderModal(true);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfig.rpcUrl!)).toBeInTheDocument();
      });

      expect(screen.queryByText(/Lit Protocol encryption uses the Datil-dev network/)).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should show error when private key is empty on save attempt', async () => {
      mockIpcRenderer.invoke.mockResolvedValue({
        ...mockConfig,
        privateKey: '',
      });
      
      renderModal(true);
      
      await waitFor(() => {
        const saveButton = screen.getByRole('button', { name: /Save Configuration/i });
        expect(saveButton).toBeDisabled();
      });
    });

    it('should handle save error gracefully', async () => {
      mockIpcRenderer.invoke.mockResolvedValue(mockConfig);
      renderModal(true);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue(mockConfig.rpcUrl!)).toBeInTheDocument();
      });

      // Set up save to fail
      mockOnSave.mockRejectedValue(new Error('Save failed'));
      mockIpcRenderer.invoke.mockResolvedValue(undefined);

      // Enter private key
      const privateKeyInput = screen.getByLabelText(/Private Key/i);
      fireEvent.change(privateKeyInput, { 
        target: { value: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' } 
      });

      const saveButton = screen.getByRole('button', { name: /Save Configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Save failed')).toBeInTheDocument();
      });

      // Modal should stay open
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    beforeEach(async () => {
      mockIpcRenderer.invoke.mockResolvedValue(null);
      renderModal(true);
    });

    it('should have proper dialog role', () => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have proper form labels', async () => {
      await waitFor(() => {
        expect(screen.getByLabelText(/Private Key/i)).toBeInTheDocument();
      });
    });

    it('should have proper button labels', () => {
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Save Configuration/i })).toBeInTheDocument();
    });

    it('should have accessible encryption toggle', async () => {
      await waitFor(() => {
        const toggle = screen.getByRole('checkbox');
        expect(toggle).toBeInTheDocument();
      });
    });
  });
});

