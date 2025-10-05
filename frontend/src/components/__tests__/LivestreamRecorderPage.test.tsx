import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LivestreamRecorderPage from '../../components/LivestreamRecorder/LivestreamRecorderPage';

const theme = createTheme({});

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('LivestreamRecorderPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('renders empty state when no streams', async () => {
    // @ts-expect-error - override global fetch in test scope
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => expect(screen.getByText(/No livestreams active/i)).toBeInTheDocument());
    expect(screen.getByText(/Check back later/i)).toBeInTheDocument();
  });

  it('renders header count and grid when streams exist', async () => {
    // @ts-expect-error - override global fetch in test scope
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          mint: 'm1',
          name: 'S1',
          symbol: 'S1',
          thumbnail: '',
          num_participants: 10,
          last_reply: 0,
          usd_market_cap: 100,
        },
        {
          mint: 'm2',
          name: 'S2',
          symbol: 'S2',
          thumbnail: '',
          num_participants: 20,
          last_reply: 0,
          usd_market_cap: 200,
        },
      ],
    });

    renderWithTheme(<LivestreamRecorderPage />);

    await waitFor(() => expect(screen.getByText(/Livestream Recorder/i)).toBeInTheDocument());
    expect(screen.getByText('2 Live Streams')).toBeInTheDocument();
  });
});


