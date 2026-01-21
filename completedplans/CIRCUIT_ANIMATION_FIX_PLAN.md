# Circuit Animation Performance Fix Plan

## Problem Statement

The `CircuitSubstrate` component's RAF (requestAnimationFrame) loop can run continuously even when:
1. The component isn't visible in the viewport
2. The app window is hidden or unfocused
3. Animation is explicitly disabled

While the current implementation already uses `useBackgroundThrottling()` to pause when the app is in the background, it lacks **viewport visibility detection** - meaning the animation continues running even when the component is scrolled out of view.

## Current State Analysis

### CircuitSubstrate.tsx (Current)
```typescript
// ✅ Already implemented:
const { shouldThrottle } = useBackgroundThrottling();

useEffect(() => {
  if (!animated || shouldThrottle || !svgRef.current) {
    // Cancel animation when throttled
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
    return;
  }
  // ... animation logic
}, [animated, networkActive, speed, shouldThrottle]);
```

### What's Missing
1. **Viewport visibility detection** - Animation runs even when component is scrolled out of view
2. **`isVisible` usage** - Only using `shouldThrottle`, not the more granular `isVisible` flag
3. **Idle timeout** - No mechanism to stop animation after a period of inactivity

## Proposed Changes

### Phase 1: Add Viewport Visibility Detection

**File:** `frontend/src/components/LiquidGlass/CircuitSubstrate.tsx`

#### Changes:
1. Import `isVisible` from `useBackgroundThrottling` hook
2. Add viewport intersection check inside the animation loop
3. Stop animation when component is not in viewport

```typescript
// Before
const { shouldThrottle } = useBackgroundThrottling();

// After
const { shouldThrottle, isVisible } = useBackgroundThrottling();
```

#### Animation Loop Enhancement:
```typescript
const animate = () => {
  // Check if SVG is in viewport before animating
  if (svgRef.current) {
    const rect = svgRef.current.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    
    if (!inViewport) {
      // Component not visible in viewport, stop animation
      animationRef.current = undefined;
      return;
    }
  }

  // ... existing animation logic ...
  
  animationRef.current = requestAnimationFrame(animate);
};
```

### Phase 2: Add Intersection Observer for Efficient Viewport Detection

Instead of checking `getBoundingClientRect()` on every frame (which can cause layout thrashing), use `IntersectionObserver` for more efficient viewport detection.

#### New State:
```typescript
const [isInViewport, setIsInViewport] = useState(true);
```

#### New Effect for Intersection Observer:
```typescript
useEffect(() => {
  if (!svgRef.current) return;
  
  const observer = new IntersectionObserver(
    ([entry]) => {
      setIsInViewport(entry.isIntersecting);
    },
    { threshold: 0 } // Trigger when any part is visible
  );
  
  observer.observe(svgRef.current);
  
  return () => observer.disconnect();
}, []);
```

#### Updated Animation Effect Dependencies:
```typescript
useEffect(() => {
  // Stop if throttled, not visible, not in viewport, or explicitly disabled
  if (!animated || shouldThrottle || !isVisible || !isInViewport || !svgRef.current) {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
    return;
  }
  
  // ... animation logic ...
  
}, [animated, networkActive, speed, shouldThrottle, isVisible, isInViewport]);
```

### Phase 3: Consider Using `useThrottledRAF` Hook

The `useBackgroundThrottling.ts` file already exports a `useThrottledRAF` hook that handles RAF lifecycle automatically. Consider refactoring to use this hook for cleaner code.

**Option A: Keep current implementation** (recommended for this component)
- More control over animation timing and phase
- Easier to integrate viewport detection

**Option B: Refactor to use `useThrottledRAF`**
- Cleaner code, less boilerplate
- Would need to extend hook to support viewport detection

## Implementation Checklist

- [ ] **Step 1:** Update `useBackgroundThrottling` import to include `isVisible`
- [ ] **Step 2:** Add `isInViewport` state variable
- [ ] **Step 3:** Add `IntersectionObserver` effect for viewport detection
- [ ] **Step 4:** Update animation effect to check all visibility conditions
- [ ] **Step 5:** Update effect dependencies array
- [ ] **Step 6:** Add cleanup for IntersectionObserver
- [ ] **Step 7:** Test animation pauses when:
  - [ ] Component scrolled out of view
  - [ ] App window hidden/minimized
  - [ ] App window loses focus
  - [ ] `animated` prop set to false
- [ ] **Step 8:** Verify animation resumes correctly when conditions change

## Final Code Structure

```typescript
const CircuitSubstrate: React.FC<CircuitSubstrateProps> = ({
  animated = true,
  // ... other props
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const [isInViewport, setIsInViewport] = useState(true);
  
  const { shouldThrottle, isVisible } = useBackgroundThrottling();
  
  // Viewport detection with IntersectionObserver
  useEffect(() => {
    if (!svgRef.current) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => setIsInViewport(entry.isIntersecting),
      { threshold: 0 }
    );
    
    observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, []);
  
  // Animation effect with all visibility checks
  useEffect(() => {
    const shouldAnimate = animated && !shouldThrottle && isVisible && isInViewport && svgRef.current;
    
    if (!shouldAnimate) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      return;
    }
    
    // ... animation logic ...
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animated, networkActive, speed, shouldThrottle, isVisible, isInViewport]);
  
  return (/* ... */);
};
```

## Performance Impact

| Scenario | Before | After |
|----------|--------|-------|
| Component in viewport, app focused | RAF running | RAF running |
| Component scrolled out of view | RAF running ❌ | RAF stopped ✅ |
| App window hidden | RAF stopped ✅ | RAF stopped ✅ |
| App window unfocused | RAF stopped ✅ | RAF stopped ✅ |
| `animated={false}` | RAF stopped ✅ | RAF stopped ✅ |

## Testing Strategy

1. **Manual Testing:**
   - Scroll the component in and out of view, verify animation pauses/resumes
   - Minimize/restore the app window
   - Switch to another application and back
   - Toggle the `animated` prop

2. **Performance Profiling:**
   - Use Chrome DevTools Performance tab
   - Verify no RAF callbacks when component is not visible
   - Check CPU usage drops when animation is paused

3. **Unit Tests:**
   - Mock `IntersectionObserver`
   - Test that animation stops when `isIntersecting` is false
   - Test cleanup on unmount

## Related Files

- `frontend/src/components/LiquidGlass/CircuitSubstrate.tsx` - Main component to modify
- `frontend/src/hooks/useBackgroundThrottling.ts` - Throttling hook (no changes needed)
- `frontend/src/components/LiquidGlass/index.ts` - Exports (no changes needed)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| IntersectionObserver not supported in old browsers | Check browser support; fallback to always-visible |
| Animation doesn't resume after scrolling back | Ensure effect re-runs when `isInViewport` changes |
| Multiple observers created | Use ref to track observer, clean up properly |
| Layout thrashing from getBoundingClientRect | Use IntersectionObserver instead (async, batched) |

## Estimated Effort

- **Implementation:** 30 minutes
- **Testing:** 30 minutes
- **Total:** 1 hour
