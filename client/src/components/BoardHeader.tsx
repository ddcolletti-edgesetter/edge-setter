import React, { useState, useEffect, useRef } from 'react';
import { useBreakpoint } from '../hooks/useBreakpoint';

// ─────────────────────────────────────────────────────────────────────────────
// BoardHeader — sticky board header with live counts and filter tabs
// Drop into src/components/BoardHeader.tsx
//
// Usage:
//   <BoardHeader
//     league="NBA"
//     totalSignals={82}
//     liveCount={12}
//     filters={['All', 'Sharp', 'Public', 'Steam']}
//     activeFilter="All"
//     onFilterChange={setFilter}
//   />
// ─────────────────────────────────────────────────────────────────────────────

interface BoardHeaderProps {
  league: string;
  totalSignals: number;
  liveCount?: number;
  filters?: string[];
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  /** Called by parent to offset sticky header height (e.g. for scroll padding) */
  onHeightChange?: (height: number) => void;
}

export function BoardHeader({
  league,
  totalSignals,
  liveCount = 0,
  filters = [],
  activeFilter,
  onFilterChange,
  onHeightChange,
}: BoardHeaderProps) {
  const { isMobile } = useBreakpoint();
  const headerRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Shadow appears once user scrolls past the natural header position
  useEffect(() => {
    const handleScroll = () => {
      const el = headerRef.current;
      if (!el) return;
      setScrolled(window.scrollY > el.offsetTop + 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Notify parent of header height for scroll-padding-top
  useEffect(() => {
    if (!onHeightChange || !headerRef.current) return;
    const ro = new ResizeObserver(entries => {
      onHeightChange(entries[0].contentRect.height);
    });
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, [onHeightChange]);

  const tabsRef = useRef<HTMLDivElement>(null);

  // Keep active tab in view when filter changes on mobile
  useEffect(() => {
    if (!isMobile || !tabsRef.current || !activeFilter) return;
    const active = tabsRef.current.querySelector<HTMLButtonElement>('[data-active="true"]');
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeFilter, isMobile]);

  return (
    <div
      ref={headerRef}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'var(--color-surface, #0a0f1e)',
        borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.08))',
        boxShadow: scrolled ? '0 4px 24px rgba(0,0,0,0.5)' : 'none',
        transition: 'box-shadow 0.2s',
        // Extend behind safe area on iOS
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* ── Title row ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '10px 16px 8px' : '12px 24px 10px',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? 18 : 22,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: 'var(--color-text-primary, #f1f5f9)',
              lineHeight: 1,
            }}
          >
            {league}
          </h1>

          {/* Live pulse badge */}
          {liveCount > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.25)',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.02em',
                color: 'var(--color-accent, #22c55e)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  background: 'var(--color-accent, #22c55e)',
                  borderRadius: '50%',
                  flexShrink: 0,
                  animation: 'headerPulse 1.5s ease-in-out infinite',
                }}
              />
              <style>{`
                @keyframes headerPulse {
                  0%, 100% { opacity: 1; transform: scale(1); }
                  50%       { opacity: 0.5; transform: scale(0.7); }
                }
              `}</style>
              LIVE
            </span>
          )}
        </div>

        {/* Signal count */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          <span
            style={{
              fontSize: isMobile ? 20 : 24,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--color-text-primary, #f1f5f9)',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {totalSignals.toLocaleString()}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: 'var(--color-text-muted, #475569)',
              textTransform: 'uppercase',
            }}
          >
            {totalSignals === 1 ? 'Signal' : 'Signals'}
          </span>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      {filters.length > 0 && (
        <div
          ref={tabsRef}
          className="board-filter-tabs"
          style={{
            display: 'flex',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            padding: isMobile ? '0 16px 10px' : '0 24px 10px',
            gap: isMobile ? 8 : 6,
          }}
        >
          <style>{`
            .board-filter-tabs::-webkit-scrollbar { display: none; }
          `}</style>
          {filters.map(filter => {
            const isActive = filter === activeFilter;
            return (
              <button
                key={filter}
                data-active={isActive}
                onClick={() => onFilterChange?.(filter)}
                style={{
                  flexShrink: 0,
                  height: isMobile ? 44 : 34,
                  padding: '0 14px',
                  background: isActive
                    ? 'var(--color-accent, #22c55e)'
                    : 'rgba(255,255,255,0.05)',
                  border: isActive
                    ? '1px solid transparent'
                    : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 999,
                  color: isActive
                    ? '#000'
                    : 'var(--color-text-secondary, #94a3b8)',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: '-0.01em',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                  WebkitTapHighlightColor: 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                {filter}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
