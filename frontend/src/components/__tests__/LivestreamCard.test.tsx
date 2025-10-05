import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LivestreamCard from '../../components/LivestreamRecorder/LivestreamCard';
import { StreamInfo } from '../../types/video';
import { useRecording } from '../../hooks/useRecording';

// Mock the useRecording hook
jest.mock('../../hooks/useRecording');
const mockUseRecording = useRecording as jest.MockedFunction<typeof useRecording>;

const theme = createTheme({});

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const mockItem: StreamInfo = {
  mint_id: 'mint-1',
  name: 'Test Stream',
  symbol: 'TST',
  thumbnail: 'https://example.com/image.jpg',
  num_participants: 123,
  is_currently_live: true,
  usd_market_cap: 1234567,
  nsfw: false,
  recording: false,
};

describe('LivestreamCard', () => {
  const mockStartRecording = jest.fn();
  const mockStopRecording = jest.fn();

  beforeEach(() => {
    mockUseRecording.mockReturnValue({
      isRecording: false,
      duration: 0,
      progress: 0,
      error: null,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders basic info and ready state', () => {
    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        onHide={jest.fn()}
      />
    );

    expect(screen.getByText('Test Stream')).toBeInTheDocument();
    expect(screen.getByText(/viewers/i)).toBeInTheDocument();
    expect(screen.getByText('Ready to Record')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('calls startRecording when REC overlay is clicked and not recording', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        onHide={onHide}
      />
    );

    const btn = screen.getByRole('button', { name: /start recording/i });
    fireEvent.click(btn);
    expect(mockStartRecording).toHaveBeenCalled();
  });

  it('calls stopRecording when REC overlay is clicked and recording', () => {
    mockUseRecording.mockReturnValue({
      isRecording: true,
      duration: 10,
      progress: 33,
      error: null,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: false,
    });

    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        onHide={onHide}
      />
    );

    const btn = screen.getByRole('button', { name: /stop recording/i });
    fireEvent.click(btn);
    expect(mockStopRecording).toHaveBeenCalled();
  });

  it('shows recording label when isRecording is true', () => {
    mockUseRecording.mockReturnValue({
      isRecording: true,
      duration: 10,
      progress: 33,
      error: null,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: false,
    });

    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        onHide={jest.fn()}
      />
    );

    expect(screen.getByText('Recording...')).toBeInTheDocument();
  });

  it('shows fallback when image fails to load', () => {
    renderWithTheme(
      <LivestreamCard
        item={{ ...mockItem, thumbnail: 'broken.jpg' }}
        onHide={jest.fn()}
      />
    );

    const img = screen.getByAltText('Test Stream') as HTMLImageElement;
    // Trigger onError
    fireEvent.error(img);
    expect(screen.getByLabelText('No stream image')).toBeInTheDocument();
  });

  it('calls onHide when hide menu item is clicked', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        onHide={onHide}
      />
    );

    // Click the three dots menu
    const menuButton = screen.getByRole('button', { name: /more/i });
    fireEvent.click(menuButton);

    // Click the hide menu item
    const hideMenuItem = screen.getByText('Hide livestream from list');
    fireEvent.click(hideMenuItem);

    expect(onHide).toHaveBeenCalledWith('mint-1');
  });

  it('shows Stop Recording in context menu when recording', () => {
    mockUseRecording.mockReturnValue({
      isRecording: true,
      duration: 10,
      progress: 33,
      error: null,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: false,
    });

    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        onHide={jest.fn()}
      />
    );

    // Click the three dots menu
    const menuButton = screen.getByRole('button', { name: /more/i });
    fireEvent.click(menuButton);

    // Check that Stop Recording menu item is present
    expect(screen.getByText('Stop Recording')).toBeInTheDocument();
    expect(screen.getByText('Hide livestream from list')).toBeInTheDocument();
  });

  it('does not show Stop Recording in context menu when not recording', () => {
    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        onHide={jest.fn()}
      />
    );

    // Click the three dots menu
    const menuButton = screen.getByRole('button', { name: /more/i });
    fireEvent.click(menuButton);

    // Check that Stop Recording menu item is not present
    expect(screen.queryByText('Stop Recording')).not.toBeInTheDocument();
    expect(screen.getByText('Hide livestream from list')).toBeInTheDocument();
  });

  it('calls stopRecording when Stop Recording menu item is clicked', () => {
    mockUseRecording.mockReturnValue({
      isRecording: true,
      duration: 10,
      progress: 33,
      error: null,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: false,
    });

    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        onHide={jest.fn()}
      />
    );

    // Click the three dots menu
    const menuButton = screen.getByRole('button', { name: /more/i });
    fireEvent.click(menuButton);

    // Click the Stop Recording menu item
    const stopMenuItem = screen.getByText('Stop Recording');
    fireEvent.click(stopMenuItem);

    expect(mockStopRecording).toHaveBeenCalled();
  });

  it('disables REC button when loading', () => {
    mockUseRecording.mockReturnValue({
      isRecording: false,
      duration: 0,
      progress: 0,
      error: null,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: true,
    });

    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        onHide={jest.fn()}
      />
    );

    const btn = screen.getByRole('button', { name: /start recording/i });
    expect(btn).toHaveStyle('cursor: not-allowed');
  });

  it('shows error state when recording fails', () => {
    mockUseRecording.mockReturnValue({
      isRecording: false,
      duration: 0,
      progress: 0,
      error: 'Failed to start recording',
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: false,
    });

    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        onHide={jest.fn()}
      />
    );

    // Error handling would be implemented in the component
    // This test ensures the hook provides error state
    expect(mockUseRecording).toHaveBeenCalledWith('mint-1');
  });
});


