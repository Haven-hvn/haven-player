import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LivestreamRecorderPage from '../../components/LivestreamRecorder/LivestreamRecorderPage';
import { streamService } from '../../services/api';
import { useRecording } from '../../hooks/useRecording';
import { StreamInfo } from '../../types/video';

// Mock the API service
jest.mock('../../services/api');
const mockStreamService = streamService as jest.Mocked<typeof streamService>;

// Mock the useRecording hook
jest.mock('../../hooks/useRecording');
const mockUseRecording = useRecording as jest.MockedFunction<typeof useRecording>;

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
    recording: false,
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
    recording: false,
  },
];

describe('LivestreamRecorder Integration', () => {
  const mockStartRecording = jest.fn();
  const mockStopRecording = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock for useRecording
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

  it('completes full recording workflow', async () => {
    mockStreamService.getPopular.mockResolvedValue(mockStreams);

    renderWithTheme(<LivestreamRecorderPage />);

    // Wait for streams to load
    await waitFor(() => {
      expect(screen.getByText('2 Live Streams')).toBeInTheDocument();
      expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    });

    // Start recording on first stream
    const recButtons = screen.getAllByRole('button', { name: /start recording/i });
    fireEvent.click(recButtons[0]);

    expect(mockStartRecording).toHaveBeenCalled();

    // Simulate recording state
    mockUseRecording.mockReturnValue({
      isRecording: true,
      duration: 15,
      progress: 50,
      error: null,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: false,
    });

    // Re-render to show recording state
    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Recording...')).toBeInTheDocument();
    });

    // Stop recording via context menu
    const menuButtons = screen.getAllByRole('button', { name: /more/i });
    fireEvent.click(menuButtons[0]);

    const stopMenuItem = screen.getByText('Stop Recording');
    fireEvent.click(stopMenuItem);

    expect(mockStopRecording).toHaveBeenCalled();
  });

  it('handles recording state changes correctly', async () => {
    mockStreamService.getPopular.mockResolvedValue(mockStreams);

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    });

    // Initially not recording
    expect(screen.getByText('Ready to Record')).toBeInTheDocument();

    // Simulate recording start
    mockUseRecording.mockReturnValue({
      isRecording: true,
      duration: 10,
      progress: 33,
      error: null,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: false,
    });

    // Re-render to show recording state
    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Recording...')).toBeInTheDocument();
    });

    // Simulate recording stop
    mockUseRecording.mockReturnValue({
      isRecording: false,
      duration: 0,
      progress: 0,
      error: null,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: false,
    });

    // Re-render to show stopped state
    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Ready to Record')).toBeInTheDocument();
    });
  });

  it('shows conditional context menu items based on recording state', async () => {
    mockStreamService.getPopular.mockResolvedValue(mockStreams);

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    });

    // Initially not recording - should not show Stop Recording
    const menuButtons = screen.getAllByRole('button', { name: /more/i });
    fireEvent.click(menuButtons[0]);

    expect(screen.queryByText('Stop Recording')).not.toBeInTheDocument();
    expect(screen.getByText('Hide livestream from list')).toBeInTheDocument();

    // Close menu
    fireEvent.click(document.body);

    // Simulate recording state
    mockUseRecording.mockReturnValue({
      isRecording: true,
      duration: 10,
      progress: 33,
      error: null,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: false,
    });

    // Re-render to show recording state
    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Recording...')).toBeInTheDocument();
    });

    // Now recording - should show Stop Recording
    fireEvent.click(menuButtons[0]);

    expect(screen.getByText('Stop Recording')).toBeInTheDocument();
    expect(screen.getByText('Hide livestream from list')).toBeInTheDocument();
  });

  it('handles multiple streams with different recording states', async () => {
    mockStreamService.getPopular.mockResolvedValue(mockStreams);

    // Mock different recording states for different streams
    mockUseRecording
      .mockReturnValueOnce({
        isRecording: true,
        duration: 10,
        progress: 33,
        error: null,
        startRecording: mockStartRecording,
        stopRecording: mockStopRecording,
        isLoading: false,
      })
      .mockReturnValueOnce({
        isRecording: false,
        duration: 0,
        progress: 0,
        error: null,
        startRecording: mockStartRecording,
        stopRecording: mockStopRecording,
        isLoading: false,
      });

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
      expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
    });

    // First stream should show recording state
    expect(screen.getAllByText('Recording...')).toHaveLength(1);
    expect(screen.getAllByText('Ready to Record')).toHaveLength(1);
  });

  it('handles API errors during stream loading', async () => {
    mockStreamService.getPopular.mockRejectedValue(new Error('API Error'));

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
  });

  it('handles recording errors gracefully', async () => {
    mockStreamService.getPopular.mockResolvedValue(mockStreams);

    mockUseRecording.mockReturnValue({
      isRecording: false,
      duration: 0,
      progress: 0,
      error: 'Failed to start recording',
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      isLoading: false,
    });

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    });

    // Error state should be handled by the useRecording hook
    expect(mockUseRecording).toHaveBeenCalledWith('mint-1');
  });

  it('maintains state consistency across re-renders', async () => {
    mockStreamService.getPopular.mockResolvedValue(mockStreams);

    const { rerender } = renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    });

    // Hide a stream
    const menuButtons = screen.getAllByRole('button', { name: /more/i });
    fireEvent.click(menuButtons[0]);

    const hideMenuItem = screen.getByText('Hide livestream from list');
    fireEvent.click(hideMenuItem);

    await waitFor(() => {
      expect(screen.getByText('1 Live Streams')).toBeInTheDocument();
    });

    // Re-render should maintain hidden state
    rerender(<LivestreamRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText('1 Live Streams')).toBeInTheDocument();
      expect(screen.queryByText('Test Stream 1')).not.toBeInTheDocument();
    });
  });
});
