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
}

export function NewSignalsToast({ count, onView, board }: NewSignalsToastProps) {
  const [userScrolled, setUserScrolled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const scrollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track scroll position (throttled)
  useEffect(() => {
    const handleScroll = () => {
      if (scrollRef.current) clearTimeout(scrollRef.current);
      scrollRef.current = setTimeout(() => {
        setUserScrolled(window.scrollY > SCROLL_THRESHOLD);
      }, 60);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollRef.current) clearTimeout(scrollRef.current);
    };
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
        animation: exiting
          ? 'toastOut 0.28s cubic-bezier(0.4,0,1,1) forwards'
          : 'toastIn 0.32s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        pointerEvents: 'auto',
      }}
    >
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.92); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)     scale(1);    }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateX(-50%) translateY(0)     scale(1);    }
          to   { opacity: 0; transform: translateX(-50%) translateY(10px)  scale(0.95); }
        }
        .new-signals-toast-btn:active {
          transform: scale(0.96) !important;
        }
      `}</style>

      <button
        className="new-signals-toast-btn"
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '11px 18px',
          background: 'var(--color-accent, #22c55e)',
          color: '#000',
          border: 'none',
          borderRadius: 999,
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 20px rgba(34,197,94,0.45), 0 1px 4px rgba(0,0,0,0.4)',
          WebkitTapHighlightColor: 'transparent',
          transition: 'transform 0.1s, box-shadow 0.1s',
          // 44px minimum touch target
          minHeight: 44,
        }}
      >
        {/* Pulsing dot */}
        <span
          style={{
            width: 8,
            height: 8,
            background: '#000',
            borderRadius: '50%',
            flexShrink: 0,
            opacity: 0.6,
            animation: 'pulseDot 1.4s ease-in-out infinite',
          }}
        />
        <style>{`
          @keyframes pulseDot {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50%       { opacity: 1;   transform: scale(1.3); }
          }
        `}</style>

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
