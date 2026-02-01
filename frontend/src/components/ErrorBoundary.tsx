import React from 'react';
import { Box, Button, Typography } from '@mui/material';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
  errorStack?: string;
  componentStack?: string | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: undefined };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { 
      hasError: true, 
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface uncaught renderer errors to the console for debugging instead of silently blanking the UI.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Uncaught renderer error', { error, info });
    
    // Update state with component stack for rendering
    this.setState({ componentStack: info.componentStack ?? null });
    
    // Log additional context that might help debugging
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      const { errorMessage, errorStack, componentStack } = this.state;
      
      // Check for known issues
      let troubleshootingTip: string | null = null;
      if (errorMessage?.includes('base_x') || errorMessage?.includes('base-x')) {
        troubleshootingTip = 'This appears to be a module loading issue with base-x (a cryptographic encoding library). Try reloading the app.';
      } else if (errorMessage?.includes('multiformats') || errorMessage?.includes('CID')) {
        troubleshootingTip = 'This appears to be a module loading issue with multiformats (IPFS/CID library). Try reloading the app.';
      } else if (errorMessage?.includes('is not a function') || errorMessage?.includes('is not defined')) {
        troubleshootingTip = 'This appears to be a module loading issue. Try reloading the app.';
      }
      
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
          <Typography variant="body1" color="error.main" textAlign="center" sx={{ fontFamily: 'monospace', fontSize: '0.875rem', maxWidth: '600px', wordBreak: 'break-word' }}>
            {errorMessage ?? 'An unexpected error occurred. Please try again.'}
          </Typography>
          
          {troubleshootingTip && (
            <Typography variant="body2" color="warning.main" textAlign="center" sx={{ maxWidth: '500px' }}>
              💡 {troubleshootingTip}
            </Typography>
          )}
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="contained" onClick={this.handleReload}>
              Reload app
            </Button>
          </Box>
          
          {/* Show detailed error info in development */}
          {(process.env.NODE_ENV === 'development' || window.location.hash.includes('debug')) && (errorStack || componentStack) && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1, maxWidth: '800px', maxHeight: '300px', overflow: 'auto' }}>
              <Typography variant="caption" color="text.secondary" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                {errorStack && `Error Stack:\n${errorStack}\n\n`}
                {componentStack && `Component Stack:\n${componentStack}`}
              </Typography>
            </Box>
          )}
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

