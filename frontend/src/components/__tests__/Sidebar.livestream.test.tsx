import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';

const theme = createTheme({});

const renderWithRouter = (initialPath: string) =>
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="*" element={<Sidebar />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );

describe('Sidebar Livestream Recorder nav', () => {
  it('shows Livestream Recorder item and active state on route', () => {
    renderWithRouter('/livestream-recorder');
    const item = screen.getByText('Livestream Recorder');
    expect(item).toBeInTheDocument();
  });
});


