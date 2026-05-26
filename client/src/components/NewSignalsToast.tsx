import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// NewSignalsToast — "N new signals" pinned button
// Drop into src/components/NewSignalsToast.tsx
//
// Shows a sticky pill at the bottom of the screen when:
//   1. New signals have arrived in the background, AND
//   2. The user has scrolled away from the top of the board
//
// Clicking it calls onView(), which should scroll to top / flush new signals.
// Content is NEVER auto-injected; this component only signals intent.
//
// Usage:
//   <NewSignalsToast
//     count={pendingSignalCount}
//     onView={() => {
//       flushPendingSignals();          // merge pending → visible list
//       boardRef.current?.scrollTo(0,0); // scroll to top
//     }}
//   />
// ─────────────────────────────────────────────────────────────────────────────

const SCROLL_THRESHOLD = 200; // px from top before toast appears

interface NewSignalsToastProps {
  count: number;
  onView: () => void;
  /** Optional: which board this belongs to, for labelling */
  board?: string;
  /** Optional: ref to the scrolling container div (falls back to window) */
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

export function NewSignalsToast({ count, onView, board, scrollContainerRef }: NewSignalsToastProps) {
  const [userScrolled, setUserScrolled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const scrollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track scroll position (throttled). Uses scrollContainerRef if provided, else window.
  useEffect(() => {
    const el: EventTarget = scrollContainerRef?.current ?? window;
    const getScrollTop = () =>
      scrollContainerRef?.current ? scrollContainerRef.current.scrollTop : window.scrollY;

    const handleScroll = () => {
      if (scrollRef.current) clearTimeout(scrollRef.current);
      scrollRef.current = setTimeout(() => {
        setUserScrolled(getScrollTop() > SCROLL_THRESHOLD);
      }, 60);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    el.addEventListener('scroll', handleScroll, { passive: true } as any);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (el as any).removeEventListener('scroll', handleScroll);
      if (scrollRef.current) clearTimeout(scrollRef.current);
    };
  // scrollContainerRef is a stable ref object; its .current is populated before this effect runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show only when there are new signals AND user has scrolled
  useEffect(() => {
    if (count > 0 && userScrolled) {
      setExiting(false);
      setVisible(true);
    } else if (visible) {
      triggerExit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, userScrolled]);

  const triggerExit = useCallback(() => {
    setExiting(true);
    setTimeout(() => setVisible(false), 280);
  }, []);

  const handleClick = useCallback(() => {
    triggerExit();
    onView();
  }, [triggerExit, onView]);

  if (!visible || count === 0) return null;

  const label = board
    ? `${count} new ${board} signal${count !== 1 ? 's' : ''}`
    : `${count} new signal${count !== 1 ? 's' : ''}`;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 300,
        pointerEvents: 'auto',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 0.18s ease',
      }}
    >
      <style>{`.new-signals-toast-btn:active { transform: scale(0.98) !important; }`}</style>

      <button
        className="new-signals-toast-btn es-update-flash es-ticker-enter"
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '11px 18px',
          background: 'var(--color-accent, #00E676)',
          color: '#000',
          border: 'none',
          borderRadius: 999,
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 20px rgba(0,230,118,0.45), 0 1px 4px rgba(0,0,0,0.4)',
          WebkitTapHighlightColor: 'transparent',
          transition: 'transform 0.1s, box-shadow 0.1s',
          // 44px minimum touch target
          minHeight: 44,
        }}
      >
        <span className="es-live-dot" style={{ width: 8, height: 8, background: '#000', opacity: 0.72, boxShadow: 'none' }} />

        {/* Arrow up */}
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
          <path d="M6.5 11V2M6.5 2L2.5 6M6.5 2L10.5 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {label}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// usePendingSignals — manages the pending queue that feeds NewSignalsToast
//
// Usage in your board page:
//   const { pending, flush, addSignals } = usePendingSignals();
//   // addSignals(newBatch) is called by your polling / websocket handler
//   // flush() is called from the toast's onView
// ─────────────────────────────────────────────────────────────────────────────

export interface Signal {
  id: string;
  [key: string]: unknown;
}

export function usePendingSignals<T extends Signal>(
  onFlush: (pending: T[]) => void
) {
  const [pending, setPending] = useState<T[]>([]);

  const addSignals = useCallback((incoming: T[]) => {
    if (!incoming.length) return;
    setPending(prev => {
      // De-duplicate by id
      const existingIds = new Set(prev.map(s => s.id));
      const fresh = incoming.filter(s => !existingIds.has(s.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  const flush = useCallback(() => {
    setPending(prev => {
      if (prev.length) onFlush(prev);
      return [];
    });
  }, [onFlush]);

  return { pending, pendingCount: pending.length, addSignals, flush };
}
