import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OpenRingPluginConfig } from '../Plugins/OpenRingPluginConfig';
import { openringService } from '@/services/api';
import { OpenRingPluginConfig as ConfigType } from '@/types/plugin';

// Mock API
jest.mock('@/services/api', () => ({
  openringService: {
    getAuthStatus: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    discoverDevices: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  },
}));

const mockConfig: ConfigType = {
  segment_duration: 30,
  auto_recording_enabled: true,
  refresh_buffer_seconds: 60,
  devices: [],
};

describe('OpenRingPluginConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders login form when not authenticated', async () => {
    (openringService.getAuthStatus as jest.Mock).mockResolvedValue({
      status: 'logged_out',
      authenticated: false,
    });

    render(<OpenRingPluginConfig config={mockConfig} onChange={jest.fn()} />);

    // Initial loading state
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });

  test('renders devices when authenticated', async () => {
    (openringService.getAuthStatus as jest.Mock).mockResolvedValue({
      status: 'authenticated',
      authenticated: true,
    });
    (openringService.discoverDevices as jest.Mock).mockResolvedValue([
      { 
        source_id: '123', 
        metadata: { device_name: 'Front Door', is_online: true, kind: 'doorbell' }, 
        media_type: 'webrtc', 
        uri: 'webrtc://ring/123', 
        plugin: 'OpenRingPlugin', 
        priority: 'medium' 
      }
    ]);

    render(<OpenRingPluginConfig config={mockConfig} onChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Front Door')).toBeInTheDocument();
      expect(screen.getByText('doorbell')).toBeInTheDocument();
    });
  });

  test('calls login on form submit', async () => {
    (openringService.getAuthStatus as jest.Mock).mockResolvedValue({
      status: 'logged_out',
      authenticated: false,
    });
    (openringService.login as jest.Mock).mockResolvedValue({ success: true, status: 'authenticated' });

    render(<OpenRingPluginConfig config={mockConfig} onChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(openringService.login).toHaveBeenCalledWith('test@example.com', 'password123', undefined);
    });
  });

  test('handles 2FA requirement', async () => {
    (openringService.getAuthStatus as jest.Mock).mockResolvedValue({
      status: 'logged_out',
      authenticated: false,
    });
    (openringService.login as jest.Mock).mockResolvedValue({ 
      success: false, 
      status: 'two_factor_required', 
      error: 'Enter code sent to phone' 
    });

    render(<OpenRingPluginConfig config={mockConfig} onChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText('Enter code sent to phone')).toBeInTheDocument();
      expect(screen.getByLabelText(/Verification Code/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Verify Code/i })).toBeInTheDocument();
    });
  });
});
