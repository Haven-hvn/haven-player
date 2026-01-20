import React, { forwardRef, useState, useCallback } from 'react';
import { Box, BoxProps } from '@mui/material';
import { liquidGlassTokens, glassStyles, glowEffects } from '@/styles/liquidGlassTheme';

type GlowColor = 'cyan' | 'magenta' | 'amber' | 'success' | 'error' | 'none';
type CardVariant = 'surface' | 'elevated' | 'hero' | 'compact';

interface GlassCardProps extends Omit<BoxProps, 'ref'> {
  /** Card variant affecting depth and prominence */
  variant?: CardVariant;
  /** Glow accent color */
  glowColor?: GlowColor;
  /** Whether the card has hover effects */
  interactive?: boolean;
  /** Whether the card is currently focused/selected */
  focused?: boolean;
  /** Whether to animate entry */
  animateEntry?: boolean;
  /** Border radius override */
  borderRadius?: number | string;
  /** Inner highlight gradient */
  showHighlight?: boolean;
  /** Callback when card gains focus via keyboard */
  onFocusVisible?: () => void;
  /** Children components */
  children?: React.ReactNode;
}

/**
 * GlassCard - The canonical glass surface component
 * 
 * This is the foundational surface for all content in the Liquid Glass design system.
 * Every card exhibits translucent glass material properties with blur, glow states,
 * and subtle depth cues.
 */
const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(({
  variant = 'surface',
  glowColor = 'none',
  interactive = true,
  focused = false,
  animateEntry = false,
  borderRadius,
  showHighlight = true,
  onFocusVisible,
  children,
  sx,
  ...props
}, ref) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusVisible, setIsFocusVisible] = useState(false);
  
  // Variant-specific styles
  const variantStyles = {
    surface: {
      borderRadius: borderRadius ?? liquidGlassTokens.radius.lg,
      padding: liquidGlassTokens.spacing.md,
    },
    elevated: {
      borderRadius: borderRadius ?? liquidGlassTokens.radius.lg,
      padding: liquidGlassTokens.spacing.lg,
      boxShadow: `
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 0 0 1px rgba(0, 0, 0, 0.5),
        0 16px 48px rgba(0, 0, 0, 0.5)
      `,
    },
    hero: {
      borderRadius: borderRadius ?? liquidGlassTokens.radius.lg,
      padding: liquidGlassTokens.spacing.lg,
      background: 'rgba(255, 255, 255, 0.08)',
      boxShadow: `
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        0 0 0 1px rgba(0, 0, 0, 0.5),
        0 24px 64px rgba(0, 0, 0, 0.6)
      `,
    },
    compact: {
      borderRadius: borderRadius ?? liquidGlassTokens.radius.sm,
      padding: liquidGlassTokens.spacing.sm,
    },
  };
  
  // Glow color mapping
  const glowColorMap: Record<GlowColor, string | null> = {
    cyan: glowEffects.cyan(0.25),
    magenta: glowEffects.magenta(0.25),
    amber: glowEffects.amber(0.25),
    success: glowEffects.success(0.25),
    error: glowEffects.error(0.25),
    none: null,
  };
  
  // Handle focus visibility for keyboard navigation
  const handleFocus = useCallback((e: React.FocusEvent) => {
    if (e.target === e.currentTarget) {
      setIsFocusVisible(true);
      onFocusVisible?.();
    }
  }, [onFocusVisible]);
  
  const handleBlur = useCallback(() => {
    setIsFocusVisible(false);
  }, []);
  
  const handleMouseEnter = useCallback(() => {
    if (interactive) setIsHovered(true);
  }, [interactive]);
  
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);
  
  // Compute current glow
  const currentGlow = glowColorMap[glowColor];
  const shouldGlow = focused || isFocusVisible || (isHovered && currentGlow);
  
  return (
    <Box
      ref={ref}
      tabIndex={interactive ? 0 : undefined}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        // Base glass properties
        ...glassStyles.base,
        ...variantStyles[variant],
        
        // Position for inner highlight
        position: 'relative',
        overflow: 'hidden',
        
        // Transition for smooth state changes
        transition: `
          all ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter},
          transform ${liquidGlassTokens.motion.durationFast} ${liquidGlassTokens.motion.enter}
        `,
        
        // Entry animation
        ...(animateEntry && {
          animation: `surface-in ${liquidGlassTokens.motion.durationSlow} ${liquidGlassTokens.motion.enter} forwards`,
        }),
        
        // Hover state
        ...(interactive && isHovered && {
          background: liquidGlassTokens.glass.fillHover,
          transform: 'translateY(-2px)',
          boxShadow: `
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            0 0 0 1px rgba(0, 0, 0, 0.5),
            0 12px 40px rgba(0, 0, 0, 0.5)
            ${currentGlow ? `, ${currentGlow}` : ''}
          `,
        }),
        
        // Focus/selected state
        ...((focused || isFocusVisible) && {
          boxShadow: `
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            0 0 0 1px rgba(0, 0, 0, 0.5),
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 0 0 2px ${liquidGlassTokens.glass.borderFocus}
            ${currentGlow ? `, ${currentGlow}` : ''}
          `,
          outline: 'none',
        }),
        
        // Focus visible outline for accessibility
        '&:focus-visible': {
          outline: 'none',
        },
        
        // Custom styles override
        ...sx,
      }}
      {...props}
    >
      {/* Inner highlight gradient overlay */}
      {showHighlight && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '50%',
            ...glassStyles.innerHighlight,
            pointerEvents: 'none',
            borderRadius: 'inherit',
            opacity: isHovered ? 0.8 : 0.5,
            transition: `opacity ${liquidGlassTokens.motion.durationFast} ease`,
          }}
        />
      )}
      
      {/* Content */}
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        {children}
      </Box>
    </Box>
  );
});

GlassCard.displayName = 'GlassCard';

/**
 * GlassPanel - A larger glass surface for containing multiple cards
 */
export const GlassPanel = forwardRef<HTMLDivElement, GlassCardProps>(({
  children,
  sx,
  ...props
}, ref) => (
  <GlassCard
    ref={ref}
    variant="surface"
    interactive={false}
    showHighlight={false}
    sx={{
      padding: liquidGlassTokens.spacing.lg,
      ...sx,
    }}
    {...props}
  >
    {children}
  </GlassCard>
));

GlassPanel.displayName = 'GlassPanel';

/**
 * GlassSurface - Minimal glass surface without padding
 */
export const GlassSurface = forwardRef<HTMLDivElement, Omit<GlassCardProps, 'variant'>>(({
  children,
  sx,
  ...props
}, ref) => (
  <Box
    ref={ref}
    sx={{
      ...glassStyles.base,
      borderRadius: liquidGlassTokens.radius.md,
      overflow: 'hidden',
      ...sx,
    }}
    {...props}
  >
    {children}
  </Box>
));

GlassSurface.displayName = 'GlassSurface';

/**
 * HeroCard - The largest, most prominent card for primary content
 */
export const HeroCard = forwardRef<HTMLDivElement, Omit<GlassCardProps, 'variant'>>(({
  children,
  glowColor = 'cyan',
  ...props
}, ref) => (
  <GlassCard
    ref={ref}
    variant="hero"
    glowColor={glowColor}
    {...props}
  >
    {children}
  </GlassCard>
));

HeroCard.displayName = 'HeroCard';

/**
 * CompactCard - Smaller card for utility purposes
 */
export const CompactCard = forwardRef<HTMLDivElement, Omit<GlassCardProps, 'variant'>>(({
  children,
  ...props
}, ref) => (
  <GlassCard
    ref={ref}
    variant="compact"
    {...props}
  >
    {children}
  </GlassCard>
));

CompactCard.displayName = 'CompactCard';

export default GlassCard;
