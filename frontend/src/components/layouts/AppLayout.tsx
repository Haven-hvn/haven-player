import React from 'react';
import { Box } from '@mui/material';
import Sidebar from '@/components/Sidebar';

/**
 * Props for the AppLayout component
 */
interface AppLayoutProps {
  /** Content to render in the main area */
  children: React.ReactNode;
  /** Whether to show the sidebar (default: true) */
  showSidebar?: boolean;
  /** Callback for refresh action in sidebar */
  onRefresh?: () => void;
  /** Additional styles for the main content area */
  contentSx?: Record<string, any>;
}

/**
 * Shared layout component that provides consistent structure across all pages.
 * Includes the sidebar and main content area with proper styling.
 * 
 * This component eliminates the repeated layout pattern found throughout App.tsx
 * and ensures consistent styling and behavior.
 * 
 * @example
 * ```tsx
 * <AppLayout onRefresh={handleRefresh}>
 *   <MyPageContent />
 * </AppLayout>
 * ```
 */
export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  showSidebar = true,
  onRefresh,
  contentSx = {},
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        height: '100vh',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        margin: '8px',
        border: '1px solid #F0F0F0',
        // CSS containment for performance
        contain: 'layout style',
      }}
    >
      {/* Sidebar */}
      {showSidebar && (
        <Box
          sx={{
            background: 'linear-gradient(180deg, #FAFAFA 0%, #F7F7F7 100%)',
            borderRight: '1px solid #E8E8E8',
            // CSS containment for sidebar
            contain: 'layout style paint',
          }}
        >
          <Sidebar onRefresh={onRefresh} />
        </Box>
      )}

      {/* Main content area */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          backgroundColor: '#FFFFFF',
          overflow: 'hidden',
          // CSS containment for main content
          contain: 'layout style',
          ...contentSx,
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

/**
 * Layout variant with scrollable content area
 */
export const AppLayoutScrollable: React.FC<AppLayoutProps> = ({
  children,
  showSidebar = true,
  onRefresh,
  contentSx = {},
}) => {
  return (
    <AppLayout showSidebar={showSidebar} onRefresh={onRefresh}>
      <Box
        sx={{
          flexGrow: 1,
          backgroundColor: '#FFFFFF',
          padding: '16px',
          height: '100%',
          overflow: 'auto',
          // CSS containment for scrollable content
          contain: 'strict',
          ...contentSx,
        }}
      >
        {children}
      </Box>
    </AppLayout>
  );
};

export default AppLayout;
