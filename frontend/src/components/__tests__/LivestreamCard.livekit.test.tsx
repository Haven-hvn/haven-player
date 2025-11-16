import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LivestreamCard from '@/components/LivestreamRecorder/LivestreamCard';
import { useLiveKitRecording } from '@/hooks/useLiveKitRecording';
import { StreamInfo } from '@/types/video';

// Mock the useLiveKitRecording hook
jest.mock('@/hooks/useLiveKitRecording');
const mockUseLiveKitRecording = useLiveKitRecording as jest.MockedFunction<typeof useLiveKitRecording>;

// Mock fetch
global.fetch = jest.fn();

describe('LivestreamCard', () => {
  const mockStreamInfo: StreamInfo = {
    mint_id: 'test-mint-123',
    name: 'Test Stream',
    symbol: 'TEST',
    num_participants: 42,
    usd_market_cap: 1234567,
    thumbnail: 'https://example.com/thumbnail.jpg',
    is_currently_live: true,
    nsfw: false,
  };

  const mockOnHide = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementation
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: false,
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

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        mint_id: 'test-mint-123',
        room_name: 'test-room',
        participant_sid: 'participant-123',
        livekit_url: 'wss://test.livekit.cloud',
        token: 'test-token',
        role: 'viewer',
        stream_data: {},
        connection_status: 'active'
      }),
    });
  });

  it('should render stream information correctly', () => {
    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    expect(screen.getByText('Test Stream')).toBeInTheDocument();
    expect(screen.getByText('42 viewers • $1,234,567')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('should show connecting status when not connected', () => {
    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    expect(screen.getByText('CONNECTING...')).toBeInTheDocument();
    expect(screen.getByText('Connecting to LiveKit...')).toBeInTheDocument();
  });

  it('should show ready to record when connected', () => {
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: false,
        duration: 0,
        progress: 0,
        error: null,
        isConnected: true,
        participantId: null,
        participantSid: null,
      },
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      connectToRoom: jest.fn(),
      disconnectFromRoom: jest.fn(),
      isLoading: false,
    });

    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    expect(screen.getByText('Ready to Record')).toBeInTheDocument();
  });

  it('should show recording status when recording', () => {
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: true,
        duration: 45,
        progress: 15,
        error: null,
        isConnected: true,
        participantId: 'participant-1',
        participantSid: 'participant-123',
      },
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      connectToRoom: jest.fn(),
      disconnectFromRoom: jest.fn(),
      isLoading: false,
    });

    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    expect(screen.getByText('Recording... 45s')).toBeInTheDocument();
  });

  it('should show error status when there is an error', () => {
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: false,
        duration: 0,
        progress: 0,
        error: 'Connection failed',
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

    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
  });

  it('should call startRecording when record button is clicked', async () => {
    const mockStartRecording = jest.fn();
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: false,
        duration: 0,
        progress: 0,
        error: null,
        isConnected: true,
        participantId: null,
        participantSid: 'participant-123',
      },
      startRecording: mockStartRecording,
      stopRecording: jest.fn(),
      connectToRoom: jest.fn(),
      disconnectFromRoom: jest.fn(),
      isLoading: false,
    });

    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    const recordButton = screen.getByRole('button', { name: /start recording/i });
    fireEvent.click(recordButton);
    
    expect(mockStartRecording).toHaveBeenCalledWith('participant-123');
  });

  it('should call stopRecording when stop button is clicked', async () => {
    const mockStopRecording = jest.fn();
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: true,
        duration: 30,
        progress: 10,
        error: null,
        isConnected: true,
        participantId: 'participant-1',
        participantSid: 'participant-123',
      },
      startRecording: jest.fn(),
      stopRecording: mockStopRecording,
      connectToRoom: jest.fn(),
      disconnectFromRoom: jest.fn(),
      isLoading: false,
    });

    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    const recordButton = screen.getByRole('button', { name: /stop recording/i });
    fireEvent.click(recordButton);
    
    expect(mockStopRecording).toHaveBeenCalled();
  });

  it('should disable record button when loading or not connected', () => {
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: false,
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
      isLoading: true,
    });

    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    const recordButton = screen.getByRole('button', { name: /start recording/i });
    expect(recordButton).toHaveStyle('cursor: not-allowed');
  });

  it('should show context menu on right click', () => {
    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    const card = screen.getByRole('img').closest('[role="img"]')?.parentElement;
    if (card) {
      fireEvent.contextMenu(card);
      expect(screen.getByText('Hide livestream from list')).toBeInTheDocument();
    }
  });

  it('should call onHide when hide option is clicked', () => {
    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    const card = screen.getByRole('img').closest('[role="img"]')?.parentElement;
    if (card) {
      fireEvent.contextMenu(card);
      const hideButton = screen.getByText('Hide livestream from list');
      fireEvent.click(hideButton);
      expect(mockOnHide).toHaveBeenCalledWith(mockStreamInfo.mint_id);
    }
  });

  it('should show stop recording option in context menu when recording', () => {
    mockUseLiveKitRecording.mockReturnValue({
      status: {
        isRecording: true,
        duration: 30,
        progress: 10,
        error: null,
        isConnected: true,
        participantId: 'participant-1',
        participantSid: 'participant-123',
      },
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      connectToRoom: jest.fn(),
      disconnectFromRoom: jest.fn(),
      isLoading: false,
    });

    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    const card = screen.getByRole('img').closest('[role="img"]')?.parentElement;
    if (card) {
      fireEvent.contextMenu(card);
      expect(screen.getByText('Stop Recording')).toBeInTheDocument();
    }
  });

  it('should handle thumbnail load error', () => {
    render(<LivestreamCard item={mockStreamInfo} onHide={mockOnHide} />);
    
    const thumbnail = screen.getByRole('img');
    fireEvent.error(thumbnail);
    
    expect(screen.getByText('No stream image')).toBeInTheDocument();
  });

  it('should format market cap correctly', () => {
    const streamWithLargeCap: StreamInfo = {
      ...mockStreamInfo,
      usd_market_cap: 1234567890,
    };

    render(<LivestreamCard item={streamWithLargeCap} onHide={mockOnHide} />);
    
    expect(screen.getByText('42 viewers • $1,234,567,890')).toBeInTheDocument();
  });

  it('should handle missing thumbnail', () => {
    const streamWithoutThumbnail: StreamInfo = {
      ...mockStreamInfo,
      thumbnail: undefined,
    };

    render(<LivestreamCard item={streamWithoutThumbnail} onHide={mockOnHide} />);
    
    expect(screen.getByText('No stream image')).toBeInTheDocument();
  });
});
