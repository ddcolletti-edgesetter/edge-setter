import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// useBreakpoint — single source of truth for responsive decisions
// Drop into src/hooks/useBreakpoint.ts
//
// Usage:
//   const { isMobile, isTablet, isDesktop, bp } = useBreakpoint();
// ─────────────────────────────────────────────────────────────────────────────

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface BreakpointState {
  bp: Breakpoint;
  isMobile: boolean;   // xs | sm  → < 768px
  isTablet: boolean;   // md       → 768–1023px
  isDesktop: boolean;  // lg | xl  → ≥ 1024px
  width: number;
}

const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 0,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
};

function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

function buildState(width: number): BreakpointState {
  const bp = getBreakpoint(width);
  return {
    bp,
    width,
    isMobile: bp === 'xs' || bp === 'sm',
    isTablet: bp === 'md',
    isDesktop: bp === 'lg' || bp === 'xl',
  };
}

export function useBreakpoint(): BreakpointState {
  const [state, setState] = useState<BreakpointState>(() =>
    buildState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  );

  const handleResize = useCallback(() => {
    const next = buildState(window.innerWidth);
    // Only re-render when the breakpoint bucket actually changes
    setState(prev =>
      prev.bp === next.bp && prev.width === next.width ? prev : next
    );
  }, []);

  useEffect(() => {
    // Prefer ResizeObserver on body for accuracy; fall back to window resize
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(handleResize);
      ro.observe(document.documentElement);
      return () => ro.disconnect();
    } else {
      window.addEventListener('resize', handleResize, { passive: true });
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [handleResize]);

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: render different content per breakpoint without prop drilling
// ─────────────────────────────────────────────────────────────────────────────
export function useResponsiveValue<T>(values: {
  mobile: T;
  tablet?: T;
  desktop: T;
}): T {
  const { isMobile, isTablet } = useBreakpoint();
  if (isMobile) return values.mobile;
  if (isTablet) return values.tablet ?? values.desktop;
  return values.desktop;
}
