import React, { forwardRef, Children, isValidElement, cloneElement } from 'react';
import { Box, BoxProps } from '@mui/material';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';

type CellSize = 'small' | 'medium' | 'large' | 'hero';
type GapSize = 'tight' | 'standard' | 'expanded';

interface BentoGridProps extends Omit<BoxProps, 'ref'> {
  /** Number of columns in the grid */
  columns?: number;
  /** Gap between cells */
  gap?: GapSize;
  /** Maximum width of the grid */
  maxWidth?: number | string;
  /** Children - should be BentoCell components */
  children?: React.ReactNode;
}

interface BentoCellProps extends Omit<BoxProps, 'ref'> {
  /** Number of columns this cell spans */
  colSpan?: number;
  /** Number of rows this cell spans */
  rowSpan?: number;
  /** Pre-defined size (maps to colSpan/rowSpan) */
  size?: CellSize;
  /** Whether this cell should animate on entry */
  animateEntry?: boolean;
  /** Delay for staggered animation (in ms) */
  animationDelay?: number;
  /** Children */
  children?: React.ReactNode;
}

const gapMap: Record<GapSize, number> = {
  tight: liquidGlassTokens.spacing.xs,
  standard: liquidGlassTokens.spacing.sm,
  expanded: liquidGlassTokens.spacing.md,
};

const sizeMap: Record<CellSize, { colSpan: number; rowSpan: number }> = {
  small: { colSpan: 1, rowSpan: 1 },
  medium: { colSpan: 2, rowSpan: 1 },
  large: { colSpan: 2, rowSpan: 2 },
  hero: { colSpan: 3, rowSpan: 2 },
};

/**
 * BentoGrid - The layout container with responsive reflow
 * 
 * A 12-column fluid grid system that organizes content into
 * contained universes. Large cells anchor the composition,
 * small cells orbit. Asymmetry is intentional.
 */
export const BentoGrid = forwardRef<HTMLDivElement, BentoGridProps>(({
  columns = 12,
  gap = 'standard',
  maxWidth = 1200,
  children,
  sx,
  ...props
}, ref) => {
  const gapValue = gapMap[gap];
  
  return (
    <Box
      ref={ref}
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridAutoRows: 'minmax(80px, auto)',
        gap: `${gapValue}px`,
        width: '100%',
        maxWidth,
        margin: '0 auto',
        
        // Responsive breakpoints
        '@media (max-width: 1200px)': {
          gridTemplateColumns: 'repeat(8, 1fr)',
        },
        '@media (max-width: 900px)': {
          gridTemplateColumns: 'repeat(6, 1fr)',
        },
        '@media (max-width: 600px)': {
          gridTemplateColumns: 'repeat(4, 1fr)',
        },
        
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
});

BentoGrid.displayName = 'BentoGrid';

/**
 * BentoCell - Individual cell within the bento grid
 */
export const BentoCell = forwardRef<HTMLDivElement, BentoCellProps>(({
  colSpan,
  rowSpan,
  size = 'medium',
  animateEntry = false,
  animationDelay = 0,
  children,
  sx,
  ...props
}, ref) => {
  const { colSpan: defaultColSpan, rowSpan: defaultRowSpan } = sizeMap[size];
  const finalColSpan = colSpan ?? defaultColSpan;
  const finalRowSpan = rowSpan ?? defaultRowSpan;
  
  return (
    <Box
      ref={ref}
      sx={{
        gridColumn: `span ${finalColSpan}`,
        gridRow: `span ${finalRowSpan}`,
        minHeight: 0,
        
        // Responsive adjustments
        '@media (max-width: 900px)': {
          gridColumn: finalColSpan > 4 ? 'span 4' : `span ${Math.min(finalColSpan, 4)}`,
        },
        '@media (max-width: 600px)': {
          gridColumn: finalColSpan > 2 ? 'span 4' : `span ${Math.min(finalColSpan * 2, 4)}`,
        },
        
        // Entry animation
        ...(animateEntry && {
          animation: `surface-in ${liquidGlassTokens.motion.durationSlow} ${liquidGlassTokens.motion.enter} forwards`,
          animationDelay: `${animationDelay}ms`,
          opacity: 0,
        }),
        
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
});

BentoCell.displayName = 'BentoCell';

/**
 * BentoSection - A logical grouping of cells with optional title
 */
export const BentoSection = forwardRef<HTMLDivElement, BoxProps & { title?: string }>(({
  title,
  children,
  sx,
  ...props
}, ref) => (
  <Box
    ref={ref}
    sx={{
      display: 'contents', // Allows grid items to flow naturally
      ...sx,
    }}
    {...props}
  >
    {title && (
      <Box
        sx={{
          gridColumn: '1 / -1',
          color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
          fontSize: '12px',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          padding: `${liquidGlassTokens.spacing.sm}px 0`,
        }}
      >
        {title}
      </Box>
    )}
    {children}
  </Box>
));

BentoSection.displayName = 'BentoSection';

/**
 * SidebarLayout - Layout with sidebar and main content area
 */
export const SidebarLayout = forwardRef<HTMLDivElement, BoxProps & {
  sidebarWidth?: number;
  sidebarCollapsed?: boolean;
}>(({
  sidebarWidth = 240,
  sidebarCollapsed = false,
  children,
  sx,
  ...props
}, ref) => {
  const collapsedWidth = 72;
  const currentWidth = sidebarCollapsed ? collapsedWidth : sidebarWidth;
  
  return (
    <Box
      ref={ref}
      sx={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: liquidGlassTokens.canvas.base,
        ...sx,
      }}
      {...props}
    >
      {/* Sidebar */}
      <Box
        sx={{
          width: currentWidth,
          flexShrink: 0,
          transition: `width ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
          overflow: 'hidden',
        }}
      >
        {Children.toArray(children)[0]}
      </Box>
      
      {/* Main content */}
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {Children.toArray(children).slice(1)}
      </Box>
    </Box>
  );
});

SidebarLayout.displayName = 'SidebarLayout';

/**
 * ContentArea - Scrollable content area within layout
 */
export const ContentArea = forwardRef<HTMLDivElement, BoxProps>(({
  children,
  sx,
  ...props
}, ref) => (
  <Box
    ref={ref}
    sx={{
      flex: 1,
      overflow: 'auto',
      padding: liquidGlassTokens.spacing.md,
      
      // Custom scrollbar
      '&::-webkit-scrollbar': {
        width: '8px',
      },
      '&::-webkit-scrollbar-track': {
        background: 'rgba(255, 255, 255, 0.02)',
      },
      '&::-webkit-scrollbar-thumb': {
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '4px',
      },
      
      ...sx,
    }}
    {...props}
  >
    {children}
  </Box>
));

ContentArea.displayName = 'ContentArea';

export default BentoGrid;
