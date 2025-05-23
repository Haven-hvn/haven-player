import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createTheme } from '@mui/material/styles';
import Header from '../Header';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={darkTheme}>
      {component}
    </ThemeProvider>
  );
};

describe('Header Component', () => {
  const mockOnAddVideo = jest.fn();
  const mockOnAnalyzeAll = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders video count correctly', () => {
    renderWithTheme(
      <Header
        videoCount={5}
        onAddVideo={mockOnAddVideo}
        onAnalyzeAll={mockOnAnalyzeAll}
        isAnalyzing={false}
      />
    );

    expect(screen.getByText('📁 5 videos')).toBeInTheDocument();
  });

  it('calls onAddVideo when add button is clicked', () => {
    renderWithTheme(
      <Header
        videoCount={0}
        onAddVideo={mockOnAddVideo}
        onAnalyzeAll={mockOnAnalyzeAll}
        isAnalyzing={false}
      />
    );

    const addButton = screen.getByRole('button', { name: /add/i });
    fireEvent.click(addButton);

    expect(mockOnAddVideo).toHaveBeenCalledTimes(1);
  });

  it('calls onAnalyzeAll when analyze button is clicked', () => {
    renderWithTheme(
      <Header
        videoCount={3}
        onAddVideo={mockOnAddVideo}
        onAnalyzeAll={mockOnAnalyzeAll}
        isAnalyzing={false}
      />
    );

    const analyzeButton = screen.getByRole('button', { name: /analyze all/i });
    fireEvent.click(analyzeButton);

    expect(mockOnAnalyzeAll).toHaveBeenCalledTimes(1);
  });

  it('disables analyze button when no videos', () => {
    renderWithTheme(
      <Header
        videoCount={0}
        onAddVideo={mockOnAddVideo}
        onAnalyzeAll={mockOnAnalyzeAll}
        isAnalyzing={false}
      />
    );

    const analyzeButton = screen.getByRole('button', { name: /analyze all/i });
    expect(analyzeButton).toBeDisabled();
  });

  it('shows analyzing state correctly', () => {
    renderWithTheme(
      <Header
        videoCount={3}
        onAddVideo={mockOnAddVideo}
        onAnalyzeAll={mockOnAnalyzeAll}
        isAnalyzing={true}
      />
    );

    expect(screen.getByText('📊 Analyzing...')).toBeInTheDocument();
    
    const analyzeButton = screen.getByRole('button', { name: /analyzing/i });
    expect(analyzeButton).toBeDisabled();
  });
}); 