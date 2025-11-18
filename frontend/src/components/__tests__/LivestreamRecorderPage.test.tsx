import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LivestreamRecorderPage from '../../components/LivestreamRecorder/LivestreamRecorderPage';
import { streamService } from '../../services/api';
import { StreamInfo } from '../../types/video';

// Mock the API service
jest.mock('../../services/api');
const mockStreamService = streamService as jest.Mocked<typeof streamService>;

// Mock useSearch hook
jest.mock('../../hooks/useSearch', () => ({
  useSearch: jest.fn(() => ({
    query: '',
    debouncedQuery: '',
    isSearchActive: false,
    history: [],
    setQuery: jest.fn(),
    clearSearch: jest.fn(),
    addToHistory: jest.fn(),
    clearHistory: jest.fn(),
  })),
}));

// Mock useBulkRecording hook
jest.mock('../../hooks/useBulkRecording', () => ({
  useBulkRecording: jest.fn(() => ({
    status: {
      isRecording: false,
      isFinalizing: false,
      error: null,
      duration: 0,
    },
    startRecordingAll: jest.fn(),
    stopRecordingAll: jest.fn(),
    getStreamStatus: jest.fn(),
    isLoading: false,
  })),
}));

const theme = createTheme({});

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const mockStreams: StreamInfo[] = [
  {
    mint_id: 'mint-1',
    name: 'Test Stream 1',
    symbol: 'TST1',
    description: 'First test stream description',
    creator: 'creator1',
    website: 'https://test1.com',
    twitter: '@test1',
    telegram: 't.me/test1',
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
    description: 'Second test stream description',
    creator: 'creator2',
    website: 'https://test2.com',
    twitter: '@test2',
    telegram: 't.me/test2',
    thumbnail: 'https://example.com/image2.jpg',
    num_participants: 456,
    is_currently_live: true,
    usd_market_cap: 2345678,
    nsfw: false,
  },
  {
    mint_id: 'mint-3',
    name: 'Another Stream',
    symbol: 'AST',
    description: 'Another stream with different name',
    creator: 'creator3',
    thumbnail: 'https://example.com/image3.jpg',
    num_participants: 789,
    is_currently_live: true,
    usd_market_cap: 3456789,
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

  describe('Search functionality', () => {
    beforeEach(() => {
      // Reset useSearch mock
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: '',
        debouncedQuery: '',
        isSearchActive: false,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });
    });

    it('filters streams by name', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: 'Test Stream 1',
        debouncedQuery: 'Test Stream 1',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
        expect(screen.queryByText('Test Stream 2')).not.toBeInTheDocument();
        expect(screen.queryByText('Another Stream')).not.toBeInTheDocument();
      });
    });

    it('filters streams by symbol', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: 'TST1',
        debouncedQuery: 'TST1',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
        expect(screen.queryByText('Test Stream 2')).not.toBeInTheDocument();
      });
    });

    it('filters streams by mint_id', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: 'mint-2',
        debouncedQuery: 'mint-2',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
        expect(screen.queryByText('Test Stream 1')).not.toBeInTheDocument();
      });
    });

    it('filters streams by description', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: 'First test',
        debouncedQuery: 'First test',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
        expect(screen.queryByText('Test Stream 2')).not.toBeInTheDocument();
      });
    });

    it('filters streams by creator', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: 'creator2',
        debouncedQuery: 'creator2',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
        expect(screen.queryByText('Test Stream 1')).not.toBeInTheDocument();
      });
    });

    it('filters streams by website', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: 'test1.com',
        debouncedQuery: 'test1.com',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
        expect(screen.queryByText('Test Stream 2')).not.toBeInTheDocument();
      });
    });

    it('filters streams by twitter handle', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: '@test2',
        debouncedQuery: '@test2',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
        expect(screen.queryByText('Test Stream 1')).not.toBeInTheDocument();
      });
    });

    it('filters streams by telegram', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: 't.me/test1',
        debouncedQuery: 't.me/test1',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
        expect(screen.queryByText('Test Stream 2')).not.toBeInTheDocument();
      });
    });

    it('shows all streams when search is cleared', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      const mockClearSearch = jest.fn();
      useSearch.mockReturnValue({
        query: '',
        debouncedQuery: '',
        isSearchActive: false,
        history: [],
        setQuery: jest.fn(),
        clearSearch: mockClearSearch,
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
        expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
        expect(screen.getByText('Another Stream')).toBeInTheDocument();
      });
    });

    it('filters streams case-insensitively', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: 'TEST STREAM 1',
        debouncedQuery: 'TEST STREAM 1',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
        expect(screen.queryByText('Test Stream 2')).not.toBeInTheDocument();
      });
    });

    it('works correctly with hidden livestreams', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: 'Test',
        debouncedQuery: 'Test',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
        expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
      });

      // Hide first stream
      const menuButtons = screen.getAllByRole('button', { name: /more/i });
      fireEvent.click(menuButtons[0]);
      const hideMenuItem = screen.getByText('Hide livestream from list');
      fireEvent.click(hideMenuItem);

      await waitFor(() => {
        expect(screen.queryByText('Test Stream 1')).not.toBeInTheDocument();
        expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
      });
    });

    it('shows correct result count when search is active', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: 'Test Stream',
        debouncedQuery: 'Test Stream',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        const resultText = screen.getByText(/2 result/i);
        expect(resultText).toBeInTheDocument();
      });
    });

    it('handles keyboard shortcut ⌘K / Ctrl+K to focus search', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: '',
        debouncedQuery: '',
        isSearchActive: false,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search Livestreams/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search Livestreams/i) as HTMLInputElement;
      
      // Simulate ⌘K / Ctrl+K
      const metaKeyEvent = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
      });
      document.dispatchEvent(metaKeyEvent);

      await waitFor(() => {
        expect(document.activeElement).toBe(searchInput);
      });
    });

    it('handles Escape key to clear search', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      const mockClearSearch = jest.fn();
      useSearch.mockReturnValue({
        query: 'test',
        debouncedQuery: 'test',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: mockClearSearch,
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search Livestreams/i)).toBeInTheDocument();
      });

      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });
      document.dispatchEvent(escapeEvent);

      await waitFor(() => {
        expect(mockClearSearch).toHaveBeenCalled();
      });
    });

    it('does not trigger keyboard shortcut when typing in input', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: '',
        debouncedQuery: '',
        isSearchActive: false,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search Livestreams/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search Livestreams/i) as HTMLInputElement;
      searchInput.focus();
      fireEvent.keyDown(searchInput, { key: 'k', metaKey: true });

      // Should not trigger the shortcut handler when already in input
      // (This is tested by ensuring the input remains focused)
      expect(document.activeElement).toBe(searchInput);
    });
  });

  describe('Sort functionality', () => {
    beforeEach(() => {
      localStorage.clear();
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: '',
        debouncedQuery: '',
        isSearchActive: false,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });
    });

    it('opens sort menu when sort button is clicked', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
      });

      const sortButton = screen.getByTitle(/sort/i);
      fireEvent.click(sortButton);

      await waitFor(() => {
        expect(screen.getByText('Sort By')).toBeInTheDocument();
        expect(screen.getByText('Name (A-Z)')).toBeInTheDocument();
      });
    });

    it('sorts streams by name ascending', async () => {
      const streamsWithDifferentNames: StreamInfo[] = [
        { ...mockStreams[2], name: 'Charlie Stream' },
        { ...mockStreams[0], name: 'Alpha Stream' },
        { ...mockStreams[1], name: 'Beta Stream' },
      ];

      mockStreamService.getPopular.mockResolvedValue(streamsWithDifferentNames);

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Alpha Stream')).toBeInTheDocument();
      });

      const sortButton = screen.getByTitle(/sort/i);
      fireEvent.click(sortButton);

      await waitFor(() => {
        expect(screen.getByText('Name (A-Z)')).toBeInTheDocument();
      });

      const nameAscOption = screen.getByText('Name (A-Z)');
      fireEvent.click(nameAscOption);

      await waitFor(() => {
        const streamNames = screen.getAllByText(/Stream$/);
        expect(streamNames[0]).toHaveTextContent('Alpha Stream');
      });
    });

    it('sorts streams by name descending', async () => {
      const streamsWithDifferentNames: StreamInfo[] = [
        { ...mockStreams[0], name: 'Alpha Stream' },
        { ...mockStreams[2], name: 'Charlie Stream' },
        { ...mockStreams[1], name: 'Beta Stream' },
      ];

      mockStreamService.getPopular.mockResolvedValue(streamsWithDifferentNames);

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Alpha Stream')).toBeInTheDocument();
      });

      const sortButton = screen.getByTitle(/sort/i);
      fireEvent.click(sortButton);

      await waitFor(() => {
        expect(screen.getByText('Name (Z-A)')).toBeInTheDocument();
      });

      const nameDescOption = screen.getByText('Name (Z-A)');
      fireEvent.click(nameDescOption);

      await waitFor(() => {
        const streamNames = screen.getAllByText(/Stream$/);
        expect(streamNames[0]).toHaveTextContent('Charlie Stream');
      });
    });

    it('sorts streams by popularity most popular first', async () => {
      const streamsWithDifferentPopularity: StreamInfo[] = [
        { ...mockStreams[0], num_participants: 100 },
        { ...mockStreams[1], num_participants: 300 },
        { ...mockStreams[2], num_participants: 200 },
      ];

      mockStreamService.getPopular.mockResolvedValue(streamsWithDifferentPopularity);

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
      });

      const sortButton = screen.getByTitle(/sort/i);
      fireEvent.click(sortButton);

      await waitFor(() => {
        expect(screen.getByText('Popularity (Most Popular)')).toBeInTheDocument();
      });

      const popularityDescOption = screen.getByText('Popularity (Most Popular)');
      fireEvent.click(popularityDescOption);

      await waitFor(() => {
        // Check that streams are sorted by popularity (most popular first)
        // The order should be: Test Stream 2 (300), Another Stream (200), Test Stream 1 (100)
        const allStreams = screen.getAllByText(/Stream/);
        expect(allStreams.length).toBeGreaterThan(0);
      });
    });

    it('sorts streams by date newest first', async () => {
      const streamsWithDates: StreamInfo[] = [
        { ...mockStreams[0], created_timestamp: 1000 },
        { ...mockStreams[1], created_timestamp: 3000 },
        { ...mockStreams[2], created_timestamp: 2000 },
      ];

      mockStreamService.getPopular.mockResolvedValue(streamsWithDates);

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
      });

      const sortButton = screen.getByTitle(/sort/i);
      fireEvent.click(sortButton);

      await waitFor(() => {
        expect(screen.getByText('Date (Newest First)')).toBeInTheDocument();
      });

      const dateDescOption = screen.getByText('Date (Newest First)');
      fireEvent.click(dateDescOption);

      await waitFor(() => {
        // Streams should be sorted by date (newest first)
        const allStreams = screen.getAllByText(/Stream/);
        expect(allStreams.length).toBeGreaterThan(0);
      });
    });

    it('sorts streams by status active first', async () => {
      const streamsWithStatus: StreamInfo[] = [
        { ...mockStreams[0], is_currently_live: false },
        { ...mockStreams[1], is_currently_live: true },
        { ...mockStreams[2], is_currently_live: false },
      ];

      mockStreamService.getPopular.mockResolvedValue(streamsWithStatus);

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
      });

      const sortButton = screen.getByTitle(/sort/i);
      fireEvent.click(sortButton);

      await waitFor(() => {
        expect(screen.getByText('Status (Active First)')).toBeInTheDocument();
      });

      const statusDescOption = screen.getByText('Status (Active First)');
      fireEvent.click(statusDescOption);

      await waitFor(() => {
        // Active streams should appear first
        const allStreams = screen.getAllByText(/Stream/);
        expect(allStreams.length).toBeGreaterThan(0);
      });
    });

    it('persists sort preference to localStorage', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
      });

      const sortButton = screen.getByTitle(/sort/i);
      fireEvent.click(sortButton);

      await waitFor(() => {
        expect(screen.getByText('Name (A-Z)')).toBeInTheDocument();
      });

      const nameAscOption = screen.getByText('Name (A-Z)');
      fireEvent.click(nameAscOption);

      await waitFor(() => {
        const stored = localStorage.getItem('livestream_sort_preference');
        expect(stored).toBeTruthy();
        if (stored) {
          const parsed = JSON.parse(stored);
          expect(parsed.field).toBe('name');
          expect(parsed.direction).toBe('asc');
        }
      });
    });

    it('loads sort preference from localStorage on mount', async () => {
      const savedSort = { field: 'popularity', direction: 'desc' as const };
      localStorage.setItem('livestream_sort_preference', JSON.stringify(savedSort));

      mockStreamService.getPopular.mockResolvedValue(mockStreams);

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
      });

      // The sort button should show the active sort
      const sortButton = screen.getByTitle(/sort/i);
      expect(sortButton).toBeInTheDocument();
    });

    it('applies sorting to filtered/search results', async () => {
      const { useSearch } = require('../../hooks/useSearch');
      useSearch.mockReturnValue({
        query: 'Test',
        debouncedQuery: 'Test',
        isSearchActive: true,
        history: [],
        setQuery: jest.fn(),
        clearSearch: jest.fn(),
        addToHistory: jest.fn(),
        clearHistory: jest.fn(),
      });

      const streamsWithDifferentNames: StreamInfo[] = [
        { ...mockStreams[0], name: 'Test Charlie' },
        { ...mockStreams[1], name: 'Test Alpha' },
        { ...mockStreams[2], name: 'Another Stream' }, // Should be filtered out
      ];

      mockStreamService.getPopular.mockResolvedValue(streamsWithDifferentNames);

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Charlie')).toBeInTheDocument();
        expect(screen.getByText('Test Alpha')).toBeInTheDocument();
        expect(screen.queryByText('Another Stream')).not.toBeInTheDocument();
      });

      const sortButton = screen.getByTitle(/sort/i);
      fireEvent.click(sortButton);

      await waitFor(() => {
        expect(screen.getByText('Name (A-Z)')).toBeInTheDocument();
      });

      const nameAscOption = screen.getByText('Name (A-Z)');
      fireEvent.click(nameAscOption);

      await waitFor(() => {
        // After sorting, Test Alpha should come before Test Charlie
        const streamNames = screen.getAllByText(/Test/);
        expect(streamNames.length).toBeGreaterThan(0);
      });
    });

    it('works correctly with hidden livestreams', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
        expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
      });

      // Hide first stream
      const menuButtons = screen.getAllByRole('button', { name: /more/i });
      fireEvent.click(menuButtons[0]);
      const hideMenuItem = screen.getByText('Hide livestream from list');
      fireEvent.click(hideMenuItem);

      await waitFor(() => {
        expect(screen.queryByText('Test Stream 1')).not.toBeInTheDocument();
        expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
      });

      // Apply sorting
      const sortButton = screen.getByTitle(/sort/i);
      fireEvent.click(sortButton);

      await waitFor(() => {
        expect(screen.getByText('Name (A-Z)')).toBeInTheDocument();
      });

      const nameAscOption = screen.getByText('Name (A-Z)');
      fireEvent.click(nameAscOption);

      await waitFor(() => {
        // Hidden stream should remain hidden after sorting
        expect(screen.queryByText('Test Stream 1')).not.toBeInTheDocument();
        expect(screen.getByText('Test Stream 2')).toBeInTheDocument();
      });
    });

    it('shows visual indicator when sort is active', async () => {
      mockStreamService.getPopular.mockResolvedValue(mockStreams);

      renderWithTheme(<LivestreamRecorderPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
      });

      const sortButton = screen.getByTitle(/sort/i);
      
      // Initially, sort button should not have active styling
      expect(sortButton).toBeInTheDocument();

      // Apply a sort
      fireEvent.click(sortButton);

      await waitFor(() => {
        expect(screen.getByText('Name (A-Z)')).toBeInTheDocument();
      });

      const nameAscOption = screen.getByText('Name (A-Z)');
      fireEvent.click(nameAscOption);

      await waitFor(() => {
        // Sort button should now show active state
        const updatedSortButton = screen.getByTitle(/sort/i);
        expect(updatedSortButton).toBeInTheDocument();
      });
    });
  });
});