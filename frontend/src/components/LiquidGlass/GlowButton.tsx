import React, { forwardRef, useState, useCallback } from 'react';
import { Box, Button, ButtonProps, IconButton, IconButtonProps } from '@mui/material';
import { liquidGlassTokens, glowEffects } from '@/styles/liquidGlassTheme';

type GlowColor = 'cyan' | 'magenta' | 'amber' | 'success' | 'error';

interface GlowButtonProps extends Omit<ButtonProps, 'color'> {
  /** Glow accent color */
  glowColor?: GlowColor;
  /** Whether to show pulse animation on idle */
  pulse?: boolean;
}

interface GlowIconButtonProps extends Omit<IconButtonProps, 'color'> {
  /** Glow accent color */
  glowColor?: GlowColor;
  /** Whether to show pulse animation on idle */
  pulse?: boolean;
}

const colorMap: Record<GlowColor, { main: string; glow: (i: number) => string }> = {
  cyan: { main: liquidGlassTokens.neon.cyan, glow: glowEffects.cyan },
  magenta: { main: liquidGlassTokens.neon.magenta, glow: glowEffects.magenta },
  amber: { main: liquidGlassTokens.neon.amber, glow: glowEffects.amber },
  success: { main: liquidGlassTokens.neon.success, glow: glowEffects.success },
  error: { main: liquidGlassTokens.neon.error, glow: glowEffects.error },
};

/**
 * GlowButton - Interactive button with neon glow effects
 * 
 * A button component that exhibits the liquid glass aesthetic with
 * glowing edges and smooth hover transitions.
 */
export const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(({
  glowColor = 'cyan',
  pulse = false,
  children,
  sx,
  ...props
}, ref) => {
  const [isHovered, setIsHovered] = useState(false);
  const colors = colorMap[glowColor];
  
  return (
    <Button
      ref={ref}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        position: 'relative',
        background: `linear-gradient(135deg, ${colors.main}15 0%, ${colors.main}08 100%)`,
        border: `1px solid ${colors.main}40`,
        color: colors.main,
        borderRadius: liquidGlassTokens.radius.sm,
        padding: '10px 24px',
        fontWeight: 500,
        fontSize: '14px',
        textTransform: 'none',
        overflow: 'hidden',
        transition: `all ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
        
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%)`,
          opacity: 0,
          transition: `opacity ${liquidGlassTokens.motion.durationFast} ease`,
        },
        
        '&:hover': {
          background: `linear-gradient(135deg, ${colors.main}25 0%, ${colors.main}12 100%)`,
          borderColor: `${colors.main}60`,
          boxShadow: colors.glow(0.4),
          transform: 'translateY(-1px)',
          
          '&::before': {
            opacity: 1,
          },
        },
        
        '&:active': {
          transform: 'translateY(0)',
          boxShadow: colors.glow(0.2),
        },
        
        '&:focus-visible': {
          outline: 'none',
          boxShadow: `${colors.glow(0.3)}, 0 0 0 2px ${colors.main}40`,
        },
        
        '&.Mui-disabled': {
          opacity: 0.4,
          background: 'rgba(255, 255, 255, 0.05)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          color: 'rgba(255, 255, 255, 0.3)',
        },
        
        ...(pulse && {
          animation: 'pulse-glow 3s ease-in-out infinite',
        }),
        
        ...sx,
      }}
      {...props}
    >
      {children}
    </Button>
  );
});

GlowButton.displayName = 'GlowButton';

/**
 * GlowIconButton - Icon button with neon glow effects
 */
export const GlowIconButton = forwardRef<HTMLButtonElement, GlowIconButtonProps>(({
  glowColor = 'cyan',
  pulse = false,
  children,
  sx,
  ...props
}, ref) => {
  const colors = colorMap[glowColor];
  
  return (
    <IconButton
      ref={ref}
      sx={{
        color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
        borderRadius: liquidGlassTokens.radius.sm,
        padding: '8px',
        transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
        
        '&:hover': {
          background: `${colors.main}15`,
          color: colors.main,
          boxShadow: colors.glow(0.2),
        },
        
        '&:focus-visible': {
          outline: 'none',
          boxShadow: `0 0 0 2px ${colors.main}40`,
        },
        
        ...(pulse && {
          animation: 'pulse-glow 3s ease-in-out infinite',
        }),
        
        ...sx,
      }}
      {...props}
    >
      {children}
    </IconButton>
  );
});

GlowIconButton.displayName = 'GlowIconButton';

/**
 * GlowChip - Chip/tag component with glow effects
 */
export const GlowChip = forwardRef<HTMLDivElement, {
  label: string;
  glowColor?: GlowColor;
  active?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
}>(({
  label,
  glowColor = 'cyan',
  active = false,
  onClick,
  icon,
}, ref) => {
  const colors = colorMap[glowColor];
  const isClickable = !!onClick;
  
  return (
    <Box
      ref={ref}
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: 500,
        background: active ? `${colors.main}20` : 'rgba(255, 255, 255, 0.06)',
        border: `1px solid ${active ? `${colors.main}40` : 'rgba(255, 255, 255, 0.1)'}`,
        color: active ? colors.main : `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
        cursor: isClickable ? 'pointer' : 'default',
        transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
        userSelect: 'none',
        
        ...(isClickable && {
          '&:hover': {
            background: `${colors.main}15`,
            borderColor: `${colors.main}30`,
            color: colors.main,
          },
        }),
        
        ...(active && {
          boxShadow: colors.glow(0.15),
        }),
      }}
    >
      {icon}
      {label}
    </Box>
  );
});

GlowChip.displayName = 'GlowChip';

/**
 * MetricDisplay - Animated number display with glow effects
 */
export const MetricDisplay = forwardRef<HTMLDivElement, {
  value: number | string;
  label?: string;
  glowColor?: GlowColor;
  size?: 'small' | 'medium' | 'large';
  animate?: boolean;
}>(({
  value,
  label,
  glowColor = 'amber',
  size = 'medium',
  animate = false,
}, ref) => {
  const colors = colorMap[glowColor];
  
  const sizeStyles = {
    small: { fontSize: '24px', labelSize: '10px' },
    medium: { fontSize: '32px', labelSize: '11px' },
    large: { fontSize: '48px', labelSize: '12px' },
  };
  
  const styles = sizeStyles[size];
  
  return (
    <Box
      ref={ref}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '4px',
        
        ...(animate && {
          animation: 'reward-bloom 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        }),
      }}
    >
      <Box
        sx={{
          fontSize: styles.fontSize,
          fontWeight: 700,
          color: colors.main,
          lineHeight: 1,
          textShadow: colors.glow(0.5),
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Box>
      {label && (
        <Box
          sx={{
            fontSize: styles.labelSize,
            fontWeight: 500,
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {label}
        </Box>
      )}
    </Box>
  );
});

MetricDisplay.displayName = 'MetricDisplay';

/**
 * StatusIndicator - Small indicator dot with glow
 */
export const StatusIndicator = forwardRef<HTMLDivElement, {
  status: 'active' | 'inactive' | 'warning' | 'error';
  label?: string;
  pulse?: boolean;
}>(({
  status,
  label,
  pulse = false,
}, ref) => {
  const statusColors: Record<string, string> = {
    active: liquidGlassTokens.neon.success,
    inactive: 'rgba(255, 255, 255, 0.3)',
    warning: liquidGlassTokens.neon.amber,
    error: liquidGlassTokens.neon.error,
  };
  
  const color = statusColors[status];
  
  return (
    <Box
      ref={ref}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <Box
        sx={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 12px ${color}`,
          
          ...(pulse && status === 'active' && {
            animation: 'pulse-glow 2s ease-in-out infinite',
          }),
        }}
      />
      {label && (
        <Box
          sx={{
            fontSize: '12px',
            fontWeight: 500,
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
          }}
        >
          {label}
        </Box>
      )}
    </Box>
  );
});

StatusIndicator.displayName = 'StatusIndicator';

export default GlowButton;
