import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LivestreamListItem from '../LivestreamRecorder/LivestreamListItem';
import { StreamInfo } from '../../types/video';

// Mock the useLiveKitRecording hook
jest.mock('../../hooks/useLiveKitRecording');
import { useLiveKitRecording } from '../../hooks/useLiveKitRecording';
const mockUseLiveKitRecording = useLiveKitRecording as jest.MockedFunction<typeof useLiveKitRecording>;

// Mock livekitClient
jest.mock('../../services/livekitClient', () => ({
  liveKitClient: {
    connect: jest.fn(),
    disconnect: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

const theme = createTheme({});

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const mockStream: StreamInfo = {
  mint_id: 'mint-123',
  name: 'Test Stream',
  symbol: 'TST',
  thumbnail: 'https://example.com/image.jpg',
  num_participants: 123,
  is_currently_live: true,
  usd_market_cap: 1234567,
  nsfw: false,
};

describe('LivestreamListItem', () => {
  const mockStartRecording = jest.fn();
  const mockStopRecording = jest.fn();
  const mockConnectToRoom = jest.fn();
  const mockDisconnectFromRoom = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: false,
        isFinalizing: false,
        duration: 0,
        progress: 0,
        error: null,
        isConnected: false,
        participantId: null,
        participantSid: null,
      },
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      connectToRoom: mockConnectToRoom,
      disconnectFromRoom: mockDisconnectFromRoom,
      isLoading: false,
    });
  });

  it('renders stream information correctly', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    expect(screen.getByText('Test Stream')).toBeInTheDocument();
    expect(screen.getByText(/TST/)).toBeInTheDocument();
    expect(screen.getByText(/123 viewers/)).toBeInTheDocument();
  });

  it('renders thumbnail when available', () => {
    const onHide = jest.fn();
    const { container } = renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img?.getAttribute('src')).toBe('https://example.com/image.jpg');
  });

  it('renders fallback when thumbnail is missing', () => {
    const streamWithoutThumbnail: StreamInfo = {
      ...mockStream,
      thumbnail: undefined,
    };
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={streamWithoutThumbnail}
        onHide={onHide}
      />
    );

    expect(screen.getByText('No stream image')).toBeInTheDocument();
  });

  it('renders Live badge', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('calls onHide when hide is clicked from context menu', async () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    // Right-click to open context menu
    const listItem = screen.getByText('Test Stream').closest('div[role="button"]') || 
                     screen.getByText('Test Stream').closest('div');
    if (listItem) {
      fireEvent.contextMenu(listItem);
    }

    // Click hide menu item
    const hideMenuItem = await screen.findByText('Hide livestream from list');
    fireEvent.click(hideMenuItem);

    expect(onHide).toHaveBeenCalledWith('mint-123');
  });

  it('shows recording status when recording', () => {
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: true,
        isFinalizing: false,
        duration: 45,
        progress: 15,
        error: null,
        isConnected: true,
        participantId: 'participant-1',
        participantSid: 'sid-1',
      },
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      connectToRoom: mockConnectToRoom,
      disconnectFromRoom: mockDisconnectFromRoom,
      isLoading: false,
    });

    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    expect(screen.getByText(/Recording... 45s/)).toBeInTheDocument();
  });

  it('shows error status when error occurs', () => {
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: false,
        isFinalizing: false,
        duration: 0,
        progress: 0,
        error: 'Connection failed',
        isConnected: false,
        participantId: null,
        participantSid: null,
      },
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      connectToRoom: mockConnectToRoom,
      disconnectFromRoom: mockDisconnectFromRoom,
      isLoading: false,
    });

    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
  });

  it('shows connecting status when loading', () => {
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: false,
        isFinalizing: false,
        duration: 0,
        progress: 0,
        error: null,
        isConnected: false,
        participantId: null,
        participantSid: null,
      },
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      connectToRoom: mockConnectToRoom,
      disconnectFromRoom: mockDisconnectFromRoom,
      isLoading: true,
    });

    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    expect(screen.getByText('CONNECTING...')).toBeInTheDocument();
  });

  it('displays market cap correctly', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    expect(screen.getByText(/\$1,234,567/)).toBeInTheDocument();
  });

  it('displays mint_id in truncated format', () => {
    const streamWithLongMintId: StreamInfo = {
      ...mockStream,
      mint_id: 'mint-12345678901234567890',
    };
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={streamWithLongMintId}
        onHide={onHide}
      />
    );

    // Should show first 8 and last 8 characters
    expect(screen.getByText(/mint-123\.\.\.12345678/)).toBeInTheDocument();
  });

  it('handles click on record button', async () => {
    const onHide = jest.fn();
    const { container } = renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    // Find the record button overlay
    const recordButton = container.querySelector('[aria-label="Start recording"]');
    if (recordButton) {
      fireEvent.click(recordButton);
      await waitFor(() => {
        expect(mockStartRecording).toHaveBeenCalled();
      });
    }
  });

  it('shows stop recording option in menu when recording', async () => {
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: true,
        isFinalizing: false,
        duration: 30,
        progress: 10,
        error: null,
        isConnected: true,
        participantId: 'participant-1',
        participantSid: 'sid-1',
      },
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      connectToRoom: mockConnectToRoom,
      disconnectFromRoom: mockDisconnectFromRoom,
      isLoading: false,
    });

    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    // Open context menu
    const menuButton = screen.getByRole('button', { name: /more/i });
    fireEvent.click(menuButton);

    const stopRecordingMenuItem = await screen.findByText('Stop Recording');
    expect(stopRecordingMenuItem).toBeInTheDocument();
  });

  it('handles image error gracefully', () => {
    const onHide = jest.fn();
    const { container } = renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    const img = container.querySelector('img');
    if (img) {
      fireEvent.error(img);
      expect(screen.getByText('No stream image')).toBeInTheDocument();
    }
  });

  it('renders ready to record status when not recording', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={mockStream}
        onHide={onHide}
      />
    );

    expect(screen.getByText('Ready to Record')).toBeInTheDocument();
  });

  it('handles empty symbol gracefully', () => {
    const streamWithoutSymbol: StreamInfo = {
      ...mockStream,
      symbol: '',
    };
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={streamWithoutSymbol}
        onHide={onHide}
      />
    );

    expect(screen.getByText('Test Stream')).toBeInTheDocument();
  });

  it('handles zero market cap gracefully', () => {
    const streamWithZeroMarketCap: StreamInfo = {
      ...mockStream,
      usd_market_cap: 0,
    };
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamListItem
        item={streamWithZeroMarketCap}
        onHide={onHide}
      />
    );

    expect(screen.getByText(/\$0/)).toBeInTheDocument();
  });
});

