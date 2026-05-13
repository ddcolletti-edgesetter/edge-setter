import React, { useState, useRef, useEffect } from 'react';
import { useBreakpoint } from '../hooks/useBreakpoint';

// ─────────────────────────────────────────────────────────────────────────────
// FeaturedEdge — collapses to a slim preview strip on mobile
// Drop into src/components/FeaturedEdge.tsx
//
// Desktop: renders children normally (full panel, no change)
// Mobile:  shows a collapsed strip with key stats; tap to expand
//
// Usage:
//   <FeaturedEdge
//     title="Featured Edge"
//     subtitle="NBA · Spread · Lakers -4.5"
//     metrics={[
//       { label: 'Sharp', value: '78%', highlight: true },
//       { label: 'Line', value: '-4 → -4.5' },
//       { label: 'Value', value: '+4.2%', highlight: true },
//     ]}
//   >
//     {/* Your existing full FeaturedEdge content */}
//   </FeaturedEdge>
// ─────────────────────────────────────────────────────────────────────────────

interface EdgeMetric {
  label: string;
  value: string;
  highlight?: boolean;
}

interface FeaturedEdgeProps {
  title?: string;
  subtitle?: string;
  metrics?: EdgeMetric[];
  /** Full content shown on desktop and when expanded on mobile */
  children?: React.ReactNode;
  /** Default open state on mobile */
  defaultOpen?: boolean;
}

export function FeaturedEdge({
  title = 'Featured Edge',
  subtitle,
  metrics = [],
  children,
  defaultOpen = false,
}: FeaturedEdgeProps) {
  const { isMobile } = useBreakpoint();
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  // Measure real content height for smooth animation
  useEffect(() => {
    if (!contentRef.current) return;
    const ro = new ResizeObserver(() => {
      setContentHeight(contentRef.current?.scrollHeight ?? 0);
    });
    ro.observe(contentRef.current);
    setContentHeight(contentRef.current.scrollHeight);
    return () => ro.disconnect();
  }, [children]);

  // Desktop — render normally
  if (!isMobile) {
    return (
      <div
        style={{
          background: 'var(--color-surface-elevated, #0f172a)',
          border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
          borderRadius: 16,
          padding: '20px 24px',
        }}
      >
        {children}
      </div>
    );
  }

  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!navigator.share) return;
    try {
      await navigator.share({
        title,
        text: subtitle,
        url: window.location.href,
      });
    } catch {
      // User cancelled or share failed — no action needed
    }
  };

  // Mobile — collapsible
  return (
    <div
      style={{
        background: 'var(--color-surface-elevated, #0f172a)',
        border: `1px solid ${open ? 'rgba(34,197,94,0.2)' : 'var(--color-border, rgba(255,255,255,0.08))'}`,
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'border-color 0.25s',
        marginBottom: 8,
      }}
    >
      {/* ── Collapsed header row: toggle + share ── */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          WebkitTapHighlightColor: 'transparent',
          minHeight: 52,
        }}
      >
        {/* Star icon */}
        <span
          style={{
            flexShrink: 0,
            width: 28,
            height: 28,
            background: 'rgba(34,197,94,0.12)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1l1.545 3.09L12 4.635l-2.5 2.41.59 3.41L7 8.9l-3.09 1.555.59-3.41L2 4.635l3.455-.545L7 1z"
              fill="#22c55e"
            />
          </svg>
        </span>

        {/* Title + subtitle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--color-accent, #22c55e)',
              lineHeight: 1,
              marginBottom: 3,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-primary, #f1f5f9)',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* Quick metrics (visible when collapsed) */}
        {!open && metrics.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {metrics.slice(0, 2).map((m, i) => (
              <span
                key={i}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: m.highlight
                    ? 'var(--color-accent, #22c55e)'
                    : 'var(--color-text-secondary, #94a3b8)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {m.value}
              </span>
            ))}
          </div>
        )}

        {/* Chevron */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            flexShrink: 0,
            color: 'var(--color-text-muted, #475569)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s',
          }}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Share button — mobile only, gated on Web Share API */}
      {canShare && (
        <button
          onClick={handleShare}
          aria-label="Share this edge"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 44,
            minHeight: 44,
            padding: '0 12px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            color: 'var(--color-text-muted, #475569)',
          }}
        >
          {/* Upload / share icon */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M9 2v9M6 5l3-3 3 3"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3 11v3a1 1 0 001 1h10a1 1 0 001-1v-3"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
      </div>

      {/* Metrics strip (always visible) */}
      {metrics.length > 0 && (
        <div
          style={{
            display: 'flex',
            borderTop: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            borderBottom: open ? '1px solid var(--color-border, rgba(255,255,255,0.06))' : 'none',
          }}
        >
          {metrics.map((m, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '8px 6px',
                gap: 2,
                borderRight:
                  i < metrics.length - 1
                    ? '1px solid var(--color-border, rgba(255,255,255,0.06))'
                    : 'none',
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: m.highlight
                    ? 'var(--color-accent, #22c55e)'
                    : 'var(--color-text-primary, #f1f5f9)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.01em',
                }}
              >
                {m.value}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--color-text-muted, #475569)',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                {m.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Expandable content ── */}
      <div
        style={{
          maxHeight: open ? contentHeight : 0,
          overflow: 'hidden',
          transition: 'max-height 0.32s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div ref={contentRef} style={{ padding: '14px 14px 16px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
