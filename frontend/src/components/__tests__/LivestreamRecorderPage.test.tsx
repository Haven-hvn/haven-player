import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LivestreamRecorderPage from '../../components/LivestreamRecorder/LivestreamRecorderPage';
import { streamService } from '../../services/api';
import { StreamInfo } from '../../types/video';

// Mock the API service
jest.mock('../../services/api');
const mockStreamService = streamService as jest.Mocked<typeof streamService>;

const theme = createTheme({});

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const mockStreams: StreamInfo[] = [
  {
    mint_id: 'mint-1',
    name: 'Test Stream 1',
    symbol: 'TST1',
    thumbnail: 'https://example.com/image1.jpg',
    num_participants: 123,
    is_currently_live: true,
    usd_market_cap: 1234567,
    nsfw: false,
  },
  {
    mint_id: 'mint-2',
    name: 'Test Stream 2',
    symbol: 'TST2',
    thumbnail: 'https://example.com/image2.jpg',
    num_participants: 456,
    is_currently_live: true,
    usd_market_cap: 2345678,
    nsfw: false,
  },
];

describe('LivestreamRecorderPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockStreamService.getPopular.mockImplementation(() => new Promise(() => {})); // Never resolves

    renderWithTheme(<LivestreamRecorderPage />);

    expect(screen.getByText('Loading live streams…')).toBeInTheDocument();
  });

  it('renders streams when loaded successfully', async () => {
    mockStreamService.getPopular.mockResolvedValue(mockStreams);

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Livestream Recorder')).toBeInTheDocument();
      expect(screen.getByText('2 Live Streams')).toBeInTheDocument();
      expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
      expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
    });

    expect(mockStreamService.getPopular).toHaveBeenCalledWith(20);
  });

  it('renders error state when API fails', async () => {
    mockStreamService.getPopular.mockRejectedValue(new Error('API Error'));

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
  });

  it('renders empty state when no streams', async () => {
    mockStreamService.getPopular.mockResolvedValue([]);

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('No livestreams active')).toBeInTheDocument();
      expect(screen.getByText('Check back later for live Pump.fun streams')).toBeInTheDocument();
    });
  });

  it('hides streams when hide is called', async () => {
    mockStreamService.getPopular.mockResolvedValue(mockStreams);

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
      expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
    });

    // Click the three dots menu on first stream
    const menuButtons = screen.getAllByRole('button', { name: /more/i });
    fireEvent.click(menuButtons[0]);

    // Click the hide menu item
    const hideMenuItem = screen.getByText('Hide livestream from list');
    fireEvent.click(hideMenuItem);

    await waitFor(() => {
      expect(screen.queryByText('Test Stream 1')).not.toBeInTheDocument();
      expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
      expect(screen.getByText('1 Live Streams')).toBeInTheDocument();
    });
  });

  it('updates header count when streams are hidden', async () => {
    mockStreamService.getPopular.mockResolvedValue(mockStreams);

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('2 Live Streams')).toBeInTheDocument();
    });

    // Hide one stream
    const menuButtons = screen.getAllByRole('button', { name: /more/i });
    fireEvent.click(menuButtons[0]);

    const hideMenuItem = screen.getByText('Hide livestream from list');
    fireEvent.click(hideMenuItem);

    await waitFor(() => {
      expect(screen.getByText('1 Live Streams')).toBeInTheDocument();
    });
  });

  it('handles multiple hide operations', async () => {
    mockStreamService.getPopular.mockResolvedValue(mockStreams);

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('2 Live Streams')).toBeInTheDocument();
    });

    // Hide first stream
    const menuButtons = screen.getAllByRole('button', { name: /more/i });
    fireEvent.click(menuButtons[0]);

    let hideMenuItem = screen.getByText('Hide livestream from list');
    fireEvent.click(hideMenuItem);

    await waitFor(() => {
      expect(screen.getByText('1 Live Streams')).toBeInTheDocument();
    });

    // Hide second stream
    fireEvent.click(menuButtons[1]);

    hideMenuItem = screen.getByText('Hide livestream from list');
    fireEvent.click(hideMenuItem);

    await waitFor(() => {
      expect(screen.getByText('No livestreams active')).toBeInTheDocument();
    });
  });

  it('shows correct stream count in header', async () => {
    const manyStreams = Array.from({ length: 5 }, (_, i) => ({
      ...mockStreams[0],
      mint_id: `mint-${i}`,
      name: `Stream ${i}`,
    }));

    mockStreamService.getPopular.mockResolvedValue(manyStreams);

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('5 Live Streams')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    mockStreamService.getPopular.mockRejectedValue(new Error('Network error'));

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('calls getPopular with correct parameters', async () => {
    mockStreamService.getPopular.mockResolvedValue(mockStreams);

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(mockStreamService.getPopular).toHaveBeenCalledWith(20);
    });
  });
});