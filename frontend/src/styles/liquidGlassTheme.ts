import { createTheme } from '@mui/material/styles';

// Liquid Glass Design System Tokens
export const liquidGlassTokens = {
  // Canvas Colors
  canvas: {
    base: '#0A0A0F',
    elevated: '#12121A',
    deep: '#050508',
  },
  
  // Glass Properties
  glass: {
    fill: 'rgba(255, 255, 255, 0.06)',
    fillHover: 'rgba(255, 255, 255, 0.08)',
    fillActive: 'rgba(255, 255, 255, 0.04)',
    border: 'rgba(255, 255, 255, 0.08)',
    borderHover: 'rgba(255, 255, 255, 0.12)',
    borderFocus: 'rgba(0, 245, 255, 0.3)',
    blur: '16px',
    blurHover: '20px',
    blurFocus: '24px',
  },
  
  // Neon Accent Colors
  neon: {
    cyan: '#00F5FF',      // Archive/Data
    magenta: '#FF00E5',   // Active/Alert
    amber: '#FFB800',     // Rewards/Achievement
    success: '#00FF88',
    warning: '#FFB800',
    error: '#FF3366',
  },
  
  // Glow Properties
  glow: {
    radiusSm: '12px',
    radiusMd: '24px',
    radiusLg: '40px',
    opacity: 0.3,
    opacityHover: 0.2,
    opacityFocus: 0.4,
  },
  
  // Text Opacity
  text: {
    primary: 1,
    secondary: 0.7,
    tertiary: 0.4,
  },
  
  // Motion
  motion: {
    enter: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
    exit: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
    durationFast: '200ms',
    durationNormal: '300ms',
    durationSlow: '400ms',
  },
  
  // Spacing (8px base)
  spacing: {
    xs: 8,
    sm: 16,
    md: 24,
    lg: 32,
    xl: 48,
  },
  
  // Border Radius
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
  },
};

// CSS Custom Properties for the design system
export const liquidGlassCSSVariables = `
  :root {
    /* Canvas */
    --canvas-base: ${liquidGlassTokens.canvas.base};
    --canvas-elevated: ${liquidGlassTokens.canvas.elevated};
    --canvas-deep: ${liquidGlassTokens.canvas.deep};
    
    /* Glass */
    --glass-fill: ${liquidGlassTokens.glass.fill};
    --glass-fill-hover: ${liquidGlassTokens.glass.fillHover};
    --glass-fill-active: ${liquidGlassTokens.glass.fillActive};
    --glass-border: ${liquidGlassTokens.glass.border};
    --glass-border-hover: ${liquidGlassTokens.glass.borderHover};
    --glass-border-focus: ${liquidGlassTokens.glass.borderFocus};
    --glass-blur: ${liquidGlassTokens.glass.blur};
    --glass-blur-hover: ${liquidGlassTokens.glass.blurHover};
    --glass-blur-focus: ${liquidGlassTokens.glass.blurFocus};
    
    /* Neon */
    --neon-cyan: ${liquidGlassTokens.neon.cyan};
    --neon-magenta: ${liquidGlassTokens.neon.magenta};
    --neon-amber: ${liquidGlassTokens.neon.amber};
    --neon-success: ${liquidGlassTokens.neon.success};
    --neon-warning: ${liquidGlassTokens.neon.warning};
    --neon-error: ${liquidGlassTokens.neon.error};
    
    /* Glow */
    --glow-radius-sm: ${liquidGlassTokens.glow.radiusSm};
    --glow-radius-md: ${liquidGlassTokens.glow.radiusMd};
    --glow-radius-lg: ${liquidGlassTokens.glow.radiusLg};
    --glow-opacity: ${liquidGlassTokens.glow.opacity};
    
    /* Motion */
    --motion-enter: ${liquidGlassTokens.motion.enter};
    --motion-exit: ${liquidGlassTokens.motion.exit};
    --duration-fast: ${liquidGlassTokens.motion.durationFast};
    --duration-normal: ${liquidGlassTokens.motion.durationNormal};
    --duration-slow: ${liquidGlassTokens.motion.durationSlow};
    
    /* Spacing */
    --space-xs: ${liquidGlassTokens.spacing.xs}px;
    --space-sm: ${liquidGlassTokens.spacing.sm}px;
    --space-md: ${liquidGlassTokens.spacing.md}px;
    --space-lg: ${liquidGlassTokens.spacing.lg}px;
    --space-xl: ${liquidGlassTokens.spacing.xl}px;
    
    /* Radius */
    --radius-sm: ${liquidGlassTokens.radius.sm}px;
    --radius-md: ${liquidGlassTokens.radius.md}px;
    --radius-lg: ${liquidGlassTokens.radius.lg}px;
  }
`;

// Glass surface styles generator
export const glassStyles = {
  base: {
    background: liquidGlassTokens.glass.fill,
    backdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
    WebkitBackdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
    border: `1px solid ${liquidGlassTokens.glass.border}`,
    boxShadow: `
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 0 0 1px rgba(0, 0, 0, 0.5),
      0 8px 32px rgba(0, 0, 0, 0.4)
    `,
  },
  hover: {
    background: liquidGlassTokens.glass.fillHover,
    boxShadow: `
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 0 0 1px rgba(0, 0, 0, 0.5),
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 20px rgba(0, 245, 255, 0.1)
    `,
  },
  active: {
    background: liquidGlassTokens.glass.fillActive,
    border: `1px solid rgba(255, 255, 255, 0.15)`,
  },
  focused: {
    boxShadow: `
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 0 0 1px rgba(0, 0, 0, 0.5),
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 0 2px ${liquidGlassTokens.glass.borderFocus}
    `,
  },
  innerHighlight: {
    background: `linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.08) 0%,
      rgba(255, 255, 255, 0.02) 100%
    )`,
  },
};

// Glow effect generators
export const glowEffects = {
  cyan: (intensity: number = 0.3) => `0 0 ${liquidGlassTokens.glow.radiusMd} rgba(0, 245, 255, ${intensity})`,
  magenta: (intensity: number = 0.3) => `0 0 ${liquidGlassTokens.glow.radiusMd} rgba(255, 0, 229, ${intensity})`,
  amber: (intensity: number = 0.3) => `0 0 ${liquidGlassTokens.glow.radiusMd} rgba(255, 184, 0, ${intensity})`,
  success: (intensity: number = 0.3) => `0 0 ${liquidGlassTokens.glow.radiusMd} rgba(0, 255, 136, ${intensity})`,
  error: (intensity: number = 0.3) => `0 0 ${liquidGlassTokens.glow.radiusMd} rgba(255, 51, 102, ${intensity})`,
};

// Create the MUI theme
export const liquidGlassTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: liquidGlassTokens.neon.cyan,
      light: '#66F9FF',
      dark: '#00C4CC',
      contrastText: '#000000',
    },
    secondary: {
      main: liquidGlassTokens.neon.magenta,
      light: '#FF66F0',
      dark: '#CC00B8',
      contrastText: '#000000',
    },
    warning: {
      main: liquidGlassTokens.neon.amber,
      light: '#FFCC33',
      dark: '#CC9300',
    },
    success: {
      main: liquidGlassTokens.neon.success,
      light: '#66FFAA',
      dark: '#00CC6A',
    },
    error: {
      main: liquidGlassTokens.neon.error,
      light: '#FF6688',
      dark: '#CC2952',
    },
    background: {
      default: liquidGlassTokens.canvas.base,
      paper: liquidGlassTokens.canvas.elevated,
    },
    text: {
      primary: `rgba(255, 255, 255, ${liquidGlassTokens.text.primary})`,
      secondary: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
      disabled: `rgba(255, 255, 255, ${liquidGlassTokens.text.tertiary})`,
    },
    divider: 'rgba(255, 255, 255, 0.08)',
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    // Display: 32px / 700 weight - for primary metrics
    h1: {
      fontWeight: 700,
      fontSize: '32px',
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontWeight: 700,
      fontSize: '32px',
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h3: {
      fontWeight: 700,
      fontSize: '24px',
      lineHeight: 1.3,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontWeight: 600,
      fontSize: '20px',
      lineHeight: 1.4,
    },
    h5: {
      fontWeight: 600,
      fontSize: '18px',
      lineHeight: 1.4,
    },
    h6: {
      fontWeight: 600,
      fontSize: '16px',
      lineHeight: 1.5,
    },
    // Body: 14px / 400 weight - for content
    body1: {
      fontWeight: 400,
      fontSize: '14px',
      lineHeight: 1.6,
    },
    body2: {
      fontWeight: 400,
      fontSize: '14px',
      lineHeight: 1.5,
    },
    // Caption: 12px / 500 weight - for labels
    caption: {
      fontWeight: 500,
      fontSize: '12px',
      lineHeight: 1.4,
      letterSpacing: '0.02em',
    },
    overline: {
      fontWeight: 500,
      fontSize: '11px',
      lineHeight: 1.4,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
    button: {
      fontWeight: 500,
      fontSize: '14px',
      textTransform: 'none',
      letterSpacing: '0.01em',
    },
  },
  shape: {
    borderRadius: liquidGlassTokens.radius.md,
  },
  spacing: 8, // 8px base
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        ${liquidGlassCSSVariables}
        
        * {
          box-sizing: border-box;
        }
        
        body {
          background: ${liquidGlassTokens.canvas.base};
          color: rgba(255, 255, 255, ${liquidGlassTokens.text.primary});
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        
        ::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          transition: background 0.2s ease;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        ::selection {
          background: rgba(0, 245, 255, 0.3);
          color: white;
        }
        
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.25; }
        }
        
        @keyframes circuit-flow {
          0% { stroke-dashoffset: 100; }
          100% { stroke-dashoffset: 0; }
        }
        
        @keyframes surface-in {
          0% {
            opacity: 0;
            transform: translateY(16px);
            backdrop-filter: blur(0px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
            backdrop-filter: blur(16px);
          }
        }
        
        @keyframes glow-bloom {
          0% {
            box-shadow: 0 0 0 rgba(0, 245, 255, 0);
          }
          50% {
            box-shadow: 0 0 40px rgba(0, 245, 255, 0.4);
          }
          100% {
            box-shadow: 0 0 20px rgba(0, 245, 255, 0.2);
          }
        }
        
        @keyframes reward-bloom {
          0% {
            box-shadow: 0 0 0 rgba(255, 184, 0, 0);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 60px rgba(255, 184, 0, 0.5);
            transform: scale(1.02);
          }
          100% {
            box-shadow: 0 0 30px rgba(255, 184, 0, 0.2);
            transform: scale(1);
          }
        }
        
        .surface-enter {
          animation: surface-in 0.4s cubic-bezier(0.4, 0.0, 0.2, 1) forwards;
        }
        
        .glow-bloom {
          animation: glow-bloom 0.6s cubic-bezier(0.4, 0.0, 0.2, 1) forwards;
        }
        
        .reward-bloom {
          animation: reward-bloom 0.8s cubic-bezier(0.4, 0.0, 0.2, 1) forwards;
        }
      `,
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: liquidGlassTokens.radius.sm,
          textTransform: 'none',
          fontWeight: 500,
          padding: '10px 20px',
          transition: `all ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%)',
            opacity: 0,
            transition: `opacity ${liquidGlassTokens.motion.durationFast} ease`,
          },
          '&:hover::before': {
            opacity: 1,
          },
        },
        contained: {
          ...glassStyles.base,
          color: 'white',
          '&:hover': {
            ...glassStyles.hover,
          },
        },
        containedPrimary: {
          background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}20 0%, ${liquidGlassTokens.neon.cyan}10 100%)`,
          border: `1px solid ${liquidGlassTokens.neon.cyan}40`,
          color: liquidGlassTokens.neon.cyan,
          '&:hover': {
            background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}30 0%, ${liquidGlassTokens.neon.cyan}15 100%)`,
            boxShadow: glowEffects.cyan(0.3),
          },
        },
        containedSecondary: {
          background: `linear-gradient(135deg, ${liquidGlassTokens.neon.magenta}20 0%, ${liquidGlassTokens.neon.magenta}10 100%)`,
          border: `1px solid ${liquidGlassTokens.neon.magenta}40`,
          color: liquidGlassTokens.neon.magenta,
          '&:hover': {
            background: `linear-gradient(135deg, ${liquidGlassTokens.neon.magenta}30 0%, ${liquidGlassTokens.neon.magenta}15 100%)`,
            boxShadow: glowEffects.magenta(0.3),
          },
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.2)',
          color: 'rgba(255, 255, 255, 0.9)',
          '&:hover': {
            borderColor: liquidGlassTokens.neon.cyan,
            background: 'rgba(0, 245, 255, 0.05)',
            boxShadow: glowEffects.cyan(0.15),
          },
        },
        text: {
          color: 'rgba(255, 255, 255, 0.7)',
          '&:hover': {
            background: 'rgba(255, 255, 255, 0.05)',
            color: 'white',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          ...glassStyles.base,
          borderRadius: liquidGlassTokens.radius.lg,
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          ...glassStyles.base,
          borderRadius: liquidGlassTokens.radius.lg,
          backgroundImage: 'none',
          transition: `all ${liquidGlassTokens.motion.durationNormal} ${liquidGlassTokens.motion.enter}`,
          '&:hover': {
            ...glassStyles.hover,
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 20,
          fontWeight: 500,
          fontSize: '12px',
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
          '&:hover': {
            background: 'rgba(255, 255, 255, 0.12)',
          },
        },
        colorPrimary: {
          background: `${liquidGlassTokens.neon.cyan}20`,
          borderColor: `${liquidGlassTokens.neon.cyan}40`,
          color: liquidGlassTokens.neon.cyan,
        },
        colorSecondary: {
          background: `${liquidGlassTokens.neon.magenta}20`,
          borderColor: `${liquidGlassTokens.neon.magenta}40`,
          color: liquidGlassTokens.neon.magenta,
        },
        colorSuccess: {
          background: `${liquidGlassTokens.neon.success}20`,
          borderColor: `${liquidGlassTokens.neon.success}40`,
          color: liquidGlassTokens.neon.success,
        },
        colorWarning: {
          background: `${liquidGlassTokens.neon.amber}20`,
          borderColor: `${liquidGlassTokens.neon.amber}40`,
          color: liquidGlassTokens.neon.amber,
        },
        colorError: {
          background: `${liquidGlassTokens.neon.error}20`,
          borderColor: `${liquidGlassTokens.neon.error}40`,
          color: liquidGlassTokens.neon.error,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: liquidGlassTokens.radius.sm,
            background: 'rgba(255, 255, 255, 0.03)',
            transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.1)',
              transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.2)',
            },
            '&.Mui-focused': {
              background: 'rgba(0, 245, 255, 0.03)',
              '& fieldset': {
                borderColor: liquidGlassTokens.neon.cyan,
                borderWidth: 1,
                boxShadow: glowEffects.cyan(0.15),
              },
            },
          },
          '& .MuiInputLabel-root': {
            color: 'rgba(255, 255, 255, 0.5)',
            '&.Mui-focused': {
              color: liquidGlassTokens.neon.cyan,
            },
          },
          '& .MuiInputBase-input': {
            color: 'rgba(255, 255, 255, 0.9)',
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          padding: 8,
        },
        switchBase: {
          '&.Mui-checked': {
            color: liquidGlassTokens.neon.cyan,
            '& + .MuiSwitch-track': {
              backgroundColor: `${liquidGlassTokens.neon.cyan}60`,
              opacity: 1,
            },
          },
        },
        track: {
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 12,
          opacity: 1,
        },
        thumb: {
          boxShadow: `0 0 8px ${liquidGlassTokens.neon.cyan}40`,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          height: 6,
          borderRadius: 3,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
        },
        bar: {
          borderRadius: 3,
          background: `linear-gradient(90deg, ${liquidGlassTokens.neon.cyan} 0%, ${liquidGlassTokens.neon.magenta} 100%)`,
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: liquidGlassTokens.neon.cyan,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255, 255, 255, 0.06)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          ...glassStyles.base,
          fontSize: '12px',
          padding: '8px 12px',
          borderRadius: liquidGlassTokens.radius.sm,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: liquidGlassTokens.radius.md,
          backdropFilter: 'blur(12px)',
        },
        standardInfo: {
          background: `${liquidGlassTokens.neon.cyan}10`,
          border: `1px solid ${liquidGlassTokens.neon.cyan}30`,
          color: liquidGlassTokens.neon.cyan,
        },
        standardSuccess: {
          background: `${liquidGlassTokens.neon.success}10`,
          border: `1px solid ${liquidGlassTokens.neon.success}30`,
          color: liquidGlassTokens.neon.success,
        },
        standardWarning: {
          background: `${liquidGlassTokens.neon.amber}10`,
          border: `1px solid ${liquidGlassTokens.neon.amber}30`,
          color: liquidGlassTokens.neon.amber,
        },
        standardError: {
          background: `${liquidGlassTokens.neon.error}10`,
          border: `1px solid ${liquidGlassTokens.neon.error}30`,
          color: liquidGlassTokens.neon.error,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: liquidGlassTokens.radius.sm,
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
          '&:hover': {
            background: 'rgba(255, 255, 255, 0.08)',
          },
        },
      },
    },
    MuiList: {
      styleOverrides: {
        root: {
          padding: 0,
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: liquidGlassTokens.radius.sm,
          transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
          '&:hover': {
            background: 'rgba(255, 255, 255, 0.04)',
          },
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 600,
          fontSize: '10px',
        },
        colorPrimary: {
          background: liquidGlassTokens.neon.cyan,
          color: '#000',
          boxShadow: glowEffects.cyan(0.4),
        },
      },
    },
  },
});

export default liquidGlassTheme;
