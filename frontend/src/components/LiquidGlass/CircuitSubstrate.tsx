import React, { useEffect, useRef, useMemo } from 'react';
import { Box } from '@mui/material';
import { liquidGlassTokens } from '@/styles/liquidGlassTheme';

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
  opacity = 0.15,
  networkActive = false,
  sx = {},
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  
  // Generate circuit pattern based on density
  const circuit = useMemo<Circuit>(() => {
    const nodes: Node[] = [];
    const paths: string[] = [];
    const gridSize = Math.max(3, Math.min(10, density));
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
  
  // Pulse animation effect
  useEffect(() => {
    if (!animated || !svgRef.current) return;
    
    const svg = svgRef.current;
    const paths = svg.querySelectorAll('.circuit-path');
    const nodes = svg.querySelectorAll('.circuit-node');
    
    let phase = 0;
    const basePeriod = networkActive ? 2000 : 8000;
    const period = basePeriod / speed;
    
    const animate = () => {
      phase = (phase + 16) % period;
      const intensity = 0.5 + 0.5 * Math.sin((phase / period) * Math.PI * 2);
      
      paths.forEach((path, index) => {
        const pathOpacity = intensity * (0.3 + 0.7 * Math.sin((phase / period + index * 0.1) * Math.PI * 2));
        (path as SVGPathElement).style.opacity = String(Math.max(0.1, pathOpacity));
      });
      
      nodes.forEach((node, index) => {
        const nodeOpacity = intensity * (0.4 + 0.6 * Math.sin((phase / period + index * 0.15) * Math.PI * 2));
        (node as SVGCircleElement).style.opacity = String(Math.max(0.2, nodeOpacity));
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animated, networkActive, speed]);
  
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
        ref={svgRef}
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
          {/* Glow filter for neon effect */}
          <filter id="circuit-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          
          {/* Gradient for paths */}
          <linearGradient id="circuit-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={secondaryColor} />
          </linearGradient>
        </defs>
        
        {/* Circuit paths */}
        <g filter="url(#circuit-glow)">
          {circuit.paths.map((path, index) => (
            <path
              key={`path-${index}`}
              className="circuit-path"
              d={path}
              fill="none"
              stroke="url(#circuit-gradient)"
              strokeWidth="0.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transition: 'opacity 0.3s ease',
              }}
            />
          ))}
        </g>
        
        {/* Circuit nodes (junctions) */}
        <g filter="url(#circuit-glow)">
          {circuit.nodes.map((node, index) => (
            <g key={`node-${index}`}>
              {/* Outer glow */}
              <circle
                cx={node.x}
                cy={node.y}
                r="1.5"
                fill={primaryColor}
                opacity="0.2"
                className="circuit-node-glow"
              />
              {/* Inner node */}
              <circle
                cx={node.x}
                cy={node.y}
                r="0.6"
                fill={primaryColor}
                className="circuit-node"
                style={{
                  transition: 'opacity 0.3s ease',
                }}
              />
            </g>
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
