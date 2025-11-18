import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LivestreamList from '../LivestreamRecorder/LivestreamList';
import { StreamInfo } from '../../types/video';

// Mock the useLiveKitRecording hook
jest.mock('../../hooks/useLiveKitRecording');
import { useLiveKitRecording } from '../../hooks/useLiveKitRecording';
const mockUseLiveKitRecording = useLiveKitRecording as jest.MockedFunction<typeof useLiveKitRecording>;

// Mock LivestreamListItem
jest.mock('../LivestreamRecorder/LivestreamListItem', () => {
  return function MockLivestreamListItem({ item, onHide }: { item: StreamInfo; onHide: (mint: string) => void }) {
    return (
      <div data-testid={`list-item-${item.mint_id}`}>
        <span>{item.name}</span>
        <button onClick={() => onHide(item.mint_id)}>Hide</button>
      </div>
    );
  };
});

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

describe('LivestreamList', () => {
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

  it('renders all streams in list', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamList
        items={mockStreams}
        onHide={onHide}
      />
    );

    expect(screen.getByTestId('list-item-mint-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-item-mint-2')).toBeInTheDocument();
    expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
  });

  it('renders empty list when no streams', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamList
        items={[]}
        onHide={onHide}
      />
    );

    expect(screen.queryByTestId('list-item-mint-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-item-mint-2')).not.toBeInTheDocument();
  });

  it('calls onHide with correct mint_id when hide is triggered', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamList
        items={mockStreams}
        onHide={onHide}
      />
    );

    const hideButtons = screen.getAllByText('Hide');
    fireEvent.click(hideButtons[0]);

    expect(onHide).toHaveBeenCalledWith('mint-1');
  });

  it('renders correct number of list items', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamList
        items={mockStreams}
        onHide={onHide}
      />
    );

    const listItems = screen.getAllByTestId(/list-item-/);
    expect(listItems).toHaveLength(2);
  });

  it('uses correct mint_id as key for each stream', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamList
        items={mockStreams}
        onHide={onHide}
      />
    );

    expect(screen.getByTestId('list-item-mint-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-item-mint-2')).toBeInTheDocument();
  });

  it('passes correct props to LivestreamListItem components', () => {
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamList
        items={mockStreams}
        onHide={onHide}
      />
    );

    expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
  });

  it('handles single stream correctly', () => {
    const singleStream = [mockStreams[0]];
    const onHide = jest.fn();
    
    renderWithTheme(
      <LivestreamList
        items={singleStream}
        onHide={onHide}
      />
    );

    expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Stream 2')).not.toBeInTheDocument();
  });

  it('maintains list layout structure', () => {
    const onHide = jest.fn();
    const { container } = renderWithTheme(
      <LivestreamList
        items={mockStreams}
        onHide={onHide}
      />
    );

    const listContainer = container.firstChild;
    expect(listContainer).toBeInTheDocument();
    
    const listItems = screen.getAllByTestId(/list-item-/);
    expect(listItems).toHaveLength(2);
  });

  it('handles many streams correctly', () => {
    const manyStreams = Array.from({ length: 10 }, (_, i) => ({
      ...mockStreams[0],
      mint_id: `mint-${i}`,
      name: `Stream ${i}`,
    }));

    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamList
        items={manyStreams}
        onHide={onHide}
      />
    );

    const listItems = screen.getAllByTestId(/list-item-/);
    expect(listItems).toHaveLength(10);
  });
});

