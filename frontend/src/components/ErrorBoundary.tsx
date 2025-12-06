import React from 'react';
import { Box, Button, Typography } from '@mui/material';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: undefined };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface uncaught renderer errors to the console for debugging instead of silently blanking the UI.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Uncaught renderer error', { error, info });
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          minHeight="100vh"
          gap={2}
          p={4}
          bgcolor="background.default"
        >
          <Typography variant="h5" fontWeight={600}>
            Something went wrong.
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {this.state.errorMessage ?? 'An unexpected error occurred. Please try again.'}
          </Typography>
          <Button variant="contained" onClick={this.handleReload}>
            Reload app
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

