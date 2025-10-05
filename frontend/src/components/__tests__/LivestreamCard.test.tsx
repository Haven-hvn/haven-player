import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LivestreamCard, { LivestreamItem } from '../../components/LivestreamRecorder/LivestreamCard';

const theme = createTheme({});

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const mockItem: LivestreamItem = {
  mint: 'mint-1',
  name: 'Test Stream',
  symbol: 'TST',
  thumbnail: 'https://example.com/image.jpg',
  num_participants: 123,
  last_reply: Date.now(),
  usd_market_cap: 1234567,
};

describe('LivestreamCard', () => {
  it('renders basic info and ready state', () => {
    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        isRecording={false}
        progress={0}
        onToggleRecord={jest.fn()}
        onHide={jest.fn()}
      />
    );

    expect(screen.getByText('Test Stream')).toBeInTheDocument();
    expect(screen.getByText(/viewers/i)).toBeInTheDocument();
    expect(screen.getByText('Ready to Record')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('calls onToggleRecord when REC overlay is clicked', () => {
    const onToggle = jest.fn();
    const onHide = jest.fn();
    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        isRecording={false}
        progress={0}
        onToggleRecord={onToggle}
        onHide={onHide}
      />
    );

    const btn = screen.getByRole('button', { name: /start recording/i });
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith('mint-1');
  });

  it('shows recording label when isRecording is true', () => {
    renderWithTheme(
      <LivestreamCard
        item={mockItem}
        isRecording
        progress={10}
        onToggleRecord={jest.fn()}
        onHide={jest.fn()}
      />
    );

    expect(screen.getByText('Recording...')).toBeInTheDocument();
  });

  it('shows fallback when image fails to load', () => {
    renderWithTheme(
      <LivestreamCard
        item={{ ...mockItem, thumbnail: 'broken.jpg' }}
        isRecording={false}
        progress={0}
        onToggleRecord={jest.fn()}
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
        isRecording={false}
        progress={0}
        onToggleRecord={jest.fn()}
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
});


