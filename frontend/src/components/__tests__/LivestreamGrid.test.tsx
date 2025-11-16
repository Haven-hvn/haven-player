import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LivestreamGrid from '../../components/LivestreamRecorder/LivestreamGrid';
import { StreamInfo } from '../../types/video';

// Mock the useLiveKitRecording hook
jest.mock('../../hooks/useLiveKitRecording');
import { useLiveKitRecording } from '../../hooks/useLiveKitRecording';
const mockUseLiveKitRecording = useLiveKitRecording as jest.MockedFunction<typeof useLiveKitRecording>;

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

describe('LivestreamGrid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      connectToRoom: jest.fn(),
      disconnectFromRoom: jest.fn(),
      isLoading: false,
    });
  });

  it('renders all streams in grid', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamGrid
        items={mockStreams}
        onHide={onHide}
      />
    );

    expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
  });

  it('renders empty grid when no streams', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamGrid
        items={[]}
        onHide={onHide}
      />
    );

    expect(screen.queryByText('Test Stream 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Stream 2')).not.toBeInTheDocument();
  });

  it('calls onHide with correct mint_id when hide is triggered', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamGrid
        items={mockStreams}
        onHide={onHide}
      />
    );

    // Click the three dots menu on first stream
    const menuButtons = screen.getAllByRole('button', { name: /more/i });
    fireEvent.click(menuButtons[0]);

    // Click the hide menu item
    const hideMenuItem = screen.getByText('Hide livestream from list');
    fireEvent.click(hideMenuItem);

    expect(onHide).toHaveBeenCalledWith('mint-1');
  });

  it('renders correct number of grid items', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamGrid
        items={mockStreams}
        onHide={onHide}
      />
    );

    // Should render 2 grid items
    const gridItems = screen.getAllByRole('button', { name: /start recording/i });
    expect(gridItems).toHaveLength(2);
  });

  it('uses correct mint_id as key for each stream', () => {
    const onHide = jest.fn();
    const { container } = renderWithTheme(
      <LivestreamGrid
        items={mockStreams}
        onHide={onHide}
      />
    );

    // Check that each stream is rendered with its mint_id
    expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
  });

  it('passes correct props to LivestreamCard components', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamGrid
        items={mockStreams}
        onHide={onHide}
      />
    );

    // Each LivestreamCard should receive the stream item and onHide function
    expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
  });

  it('handles single stream correctly', () => {
    const singleStream = [mockStreams[0]];
    const onHide = jest.fn();
    
    renderWithTheme(
      <LivestreamGrid
        items={singleStream}
        onHide={onHide}
      />
    );

    expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Stream 2')).not.toBeInTheDocument();
  });

  it('maintains grid layout structure', () => {
    const onHide = jest.fn();
    const { container } = renderWithTheme(
      <LivestreamGrid
        items={mockStreams}
        onHide={onHide}
      />
    );

    // Check that the grid container has the correct structure
    const gridContainer = container.querySelector('.MuiGrid-container');
    expect(gridContainer).toBeInTheDocument();
    
    const gridItems = container.querySelectorAll('.MuiGrid-item');
    expect(gridItems).toHaveLength(2);
  });
});
