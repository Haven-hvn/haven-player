import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { Box } from '@mui/material';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';
import { useBackgroundThrottling } from '@/hooks/useBackgroundThrottling';

// Target ~10fps for background animations (saves ~85% CPU vs 60fps)
const ANIMATION_FRAME_INTERVAL = 33; // ms (~10fps)

interface CircuitSubstrateProps {
  /** Primary color for the circuit traces */
  primaryColor?: string;
  /** Secondary color for the circuit traces */
  secondaryColor?: string;
  /** Density of circuit nodes (1-10) */
  density?: number;
  /** Animation speed multiplier */
  speed?: number;
  /** Whether to show pulse animation */
  animated?: boolean;
  /** Opacity of the substrate */
  opacity?: number;
  /** Whether network activity is high (triggers faster pulse) */
  networkActive?: boolean;
  /** Additional styles */
  sx?: object;
}

interface Node {
  x: number;
  y: number;
  connections: number[];
}

interface Circuit {
  nodes: Node[];
  paths: string[];
}

/**
 * CircuitSubstrate - The animated background layer that represents the network
 * 
 * This component creates a living circuit board visualization that pulses
 * with the heartbeat of the decentralized network. It sits beneath all
 * glass surfaces, visible through the translucent layers.
 */
const CircuitSubstrate: React.FC<CircuitSubstrateProps> = ({
  primaryColor = liquidGlassTokens.neon.cyan,
  secondaryColor = liquidGlassTokens.neon.magenta,
  density = 5,
  speed = 1,
  animated = true,
  opacity = 0.22,
  networkActive = false,
  sx = {},
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgMounted, setSvgMounted] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef<number>(0);
  const phaseRef = useRef<number>(0);
  // Note: IntersectionObserver removed - it fails when element is behind 
  // transparent layers. We rely on useBackgroundThrottling for pause/resume.
  
  // Cache element references to avoid querySelectorAll per frame
  const elementsRef = useRef<{
    paths: SVGPathElement[];
    nodes: SVGCircleElement[];
    pathsGroup: SVGGElement | null;
    nodesGroup: SVGGElement | null;
  }>({ paths: [], nodes: [], pathsGroup: null, nodesGroup: null });
  
  // Generate circuit pattern based on density - capped for performance
  const circuit = useMemo<Circuit>(() => {
    const nodes: Node[] = [];
    const paths: string[] = [];
    // Cap density to prevent too many elements (max 6x6 grid)
    const gridSize = Math.max(3, Math.min(6, density));
    const spacing = 100 / gridSize;
    
    // Create grid of nodes
    for (let y = 0; y <= gridSize; y++) {
      for (let x = 0; x <= gridSize; x++) {
        // Add some randomness to node positions
        const jitterX = (Math.random() - 0.5) * spacing * 0.3;
        const jitterY = (Math.random() - 0.5) * spacing * 0.3;
        
        nodes.push({
          x: x * spacing + jitterX + spacing / 2,
          y: y * spacing + jitterY + spacing / 2,
          connections: [],
        });
      }
    }
    
    // Create connections between adjacent nodes
    const cols = gridSize + 1;
    for (let i = 0; i < nodes.length; i++) {
      const x = i % cols;
      const y = Math.floor(i / cols);
      
      // Connect to right neighbor
      if (x < gridSize && Math.random() > 0.3) {
        const rightIndex = i + 1;
        nodes[i].connections.push(rightIndex);
        paths.push(createOrthogonalPath(nodes[i], nodes[rightIndex]));
      }
      
      // Connect to bottom neighbor
      if (y < gridSize && Math.random() > 0.3) {
        const bottomIndex = i + cols;
        nodes[i].connections.push(bottomIndex);
        paths.push(createOrthogonalPath(nodes[i], nodes[bottomIndex]));
      }
    }
    
    return { nodes, paths };
  }, [density]);
  
  // Create orthogonal path between two nodes (circuit board style)
  function createOrthogonalPath(from: Node, to: Node): string {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    
    // Decide randomly whether to go horizontal first or vertical first
    if (Math.random() > 0.5) {
      return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
    } else {
      return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
    }
  }
  
  // Use background throttling to pause animation when app is hidden
  const { shouldThrottle, isVisible } = useBackgroundThrottling();
  
  // Cache DOM elements once on mount - avoids querySelectorAll per frame
  useEffect(() => {
    if (!svgRef.current) return;
    
    const svg = svgRef.current;
    elementsRef.current = {
      paths: Array.from(svg.querySelectorAll('.circuit-path')) as SVGPathElement[],
      nodes: Array.from(svg.querySelectorAll('.circuit-node')) as SVGCircleElement[],
      pathsGroup: svg.querySelector('.circuit-paths-group') as SVGGElement | null,
      nodesGroup: svg.querySelector('.circuit-nodes-group') as SVGGElement | null,
    };
  }, [circuit]); // Re-cache when circuit changes
  
  // Optimized animation - only updates every 100ms (10fps), batches DOM writes
  const animate = useCallback((timestamp: number) => {
    // Frame rate limiting - 10fps max
    if (timestamp - lastFrameTimeRef.current < ANIMATION_FRAME_INTERVAL) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }
    
    lastFrameTimeRef.current = timestamp;
    
    // Slower period for less frequent updates
    const period = networkActive ? 3000 : 10000;
    phaseRef.current = (phaseRef.current + ANIMATION_FRAME_INTERVAL) % period;
    const normalizedPhase = phaseRef.current / period;
    
    // Single intensity calculation
    const intensity = 0.5 + 0.3 * Math.sin(normalizedPhase * Math.PI * 2);
    
    // Batch all DOM writes in single frame
    requestAnimationFrame(() => {
      const { pathsGroup, nodesGroup } = elementsRef.current;
      if (pathsGroup) {
        pathsGroup.style.opacity = String(0.4 + intensity * 0.4);
      }
      if (nodesGroup) {
        nodesGroup.style.opacity = String(0.5 + intensity * 0.3);
      }
    });
    
    animationRef.current = requestAnimationFrame(animate);
  }, [networkActive]);
  
  // Pulse animation effect - pauses when app is in background
  useEffect(() => {
    // Debug logging (remove in production)
    if (process.env.NODE_ENV === 'development') {
      console.log('CircuitSubstrate animation check:', { 
        animated, 
        shouldThrottle, 
        isVisible, 
        hasSvg: !!svgRef.current 
      });
    }
    
    // Only animate when enabled and visible
    // Note: shouldThrottle can have false positives on initial mount, so we only
    // use it to PAUSE an existing animation, not prevent starting one
    const isRunning = animationRef.current !== undefined;
    const shouldAnimate = animated && isVisible && svgMounted;
    const shouldStop = !animated || !isVisible || (isRunning && shouldThrottle);
    
    if (shouldStop) {
      // Cancel any existing animation when conditions not met
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      return;
    }
    
    // Start animation if not already running
    if (shouldAnimate && !isRunning) {
      // Reset timing refs when animation restarts
      lastFrameTimeRef.current = 0;
      phaseRef.current = 0; // Reset phase to prevent animation jump after throttle
      animationRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animated, shouldThrottle, isVisible, animate, svgMounted]);
  
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
        opacity,
        ...sx,
      }}
    >
      <svg
        ref={(el) => {
          svgRef.current = el;
          if (el && !svgMounted) {
            setSvgMounted(true);
          }
        }}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        <defs>
          {/* Optimized glow filter - minimal blur for performance */}
          <filter id="circuit-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="0.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          
          {/* Gradient for paths */}
          <linearGradient id="circuit-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={secondaryColor} />
          </linearGradient>
          
          {/* Animated gradient for flowing effect */}
          <linearGradient id="circuit-flow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor={primaryColor} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
          
          {/* CSS animation for flowing data */}
          <style>{`
            @keyframes circuit-flow {
              0% { stroke-dashoffset: 60; }
              100% { stroke-dashoffset: 0; }
            }
            .circuit-path-animated {
              stroke-dasharray: 15 45;
              animation: circuit-flow 4s linear infinite;
              will-change: stroke-dashoffset;
            }
          `}</style>
        </defs>
        
        {/* Circuit paths - no glow filter for static paths to save GPU */}
        <g 
          className="circuit-paths-group"
          style={{ opacity: 0.7 }}
        >
          {circuit.paths.map((path, index) => (
            <path
              key={`path-${index}`}
              className="circuit-path"
              d={path}
              fill="none"
              stroke="url(#circuit-gradient)"
              strokeWidth="0.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
        
        {/* Animated flowing overlay paths - only 20% of paths to reduce CPU */}
        {animated && (
          <g 
            className="circuit-flow-group"
            style={{ 
              opacity: 0.6,
              mixBlendMode: 'screen',
            }}
          >
            {circuit.paths.filter((_, i) => i % 5 === 0).slice(0, 8).map((path, index) => (
              <path
                key={`flow-${index}`}
                d={path}
                fill="none"
                stroke={primaryColor}
                strokeWidth="0.5"
                strokeLinecap="round"
                className="circuit-path-animated"
                style={{
                  animationDelay: `${index * 0.8}s`,
                  animationDuration: '4s', // Slower animation = less CPU
                }}
              />
            ))}
          </g>
        )}
        
        {/* Circuit nodes (junctions) - simplified, no glow filter */}
        <g 
          className="circuit-nodes-group"
          style={{ opacity: 0.6 }}
        >
          {circuit.nodes.map((node, index) => (
            <circle
              key={`node-${index}`}
              cx={node.x}
              cy={node.y}
              r="0.6"
              fill={primaryColor}
              className="circuit-node"
            />
          ))}
        </g>
      </svg>
    </Box>
  );
};

/**
 * CircuitSubstrateSimple - A lighter weight version using CSS only
 * For areas where SVG might be too heavy
 */
export const CircuitSubstrateSimple: React.FC<{
  color?: string;
  opacity?: number;
  animated?: boolean;
}> = ({
  color = liquidGlassTokens.neon.cyan,
  opacity = 0.1,
  animated = true,
}) => {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
        opacity,
        background: `
          linear-gradient(90deg, ${color}10 1px, transparent 1px) 0 0 / 40px 40px,
          linear-gradient(${color}10 1px, transparent 1px) 0 0 / 40px 40px
        `,
        '&::before': animated ? {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `radial-gradient(circle at 50% 50%, ${color}20 0%, transparent 70%)`,
          animation: 'pulse-glow 8s ease-in-out infinite',
        } : {},
      }}
    />
  );
};

/**
 * CircuitLine - A single animated circuit line for specific use cases
 */
export const CircuitLine: React.FC<{
  direction?: 'horizontal' | 'vertical';
  color?: string;
  animated?: boolean;
  length?: string;
}> = ({
  direction = 'horizontal',
  color = liquidGlassTokens.neon.cyan,
  animated = true,
  length = '100%',
}) => {
  const isHorizontal = direction === 'horizontal';
  
  return (
    <Box
      sx={{
        position: 'relative',
        width: isHorizontal ? length : '2px',
        height: isHorizontal ? '2px' : length,
        background: `linear-gradient(${isHorizontal ? '90deg' : '180deg'}, transparent, ${color}, transparent)`,
        borderRadius: '1px',
        overflow: 'hidden',
        '&::after': animated ? {
          content: '""',
          position: 'absolute',
          top: 0,
          left: isHorizontal ? '-100%' : 0,
          right: 0,
          bottom: isHorizontal ? 0 : '-100%',
          width: isHorizontal ? '50%' : '100%',
          height: isHorizontal ? '100%' : '50%',
          background: `linear-gradient(${isHorizontal ? '90deg' : '180deg'}, transparent, ${color}, transparent)`,
          animation: `circuit-flow 3s linear infinite`,
          animationDirection: isHorizontal ? 'normal' : 'normal',
        } : {},
      }}
    />
  );
};

export default CircuitSubstrate;
