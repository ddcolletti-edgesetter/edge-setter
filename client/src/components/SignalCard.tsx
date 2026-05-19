import React, { useState } from 'react';
import { useBreakpoint } from '../hooks/useBreakpoint';

// ─────────────────────────────────────────────────────────────────────────────
// SignalCard — mobile-first card layout for NBA/MLB/NFL/CFB boards
// Drop into src/components/SignalCard.tsx
//
// Desktop: shows all data inline in a wide row (your existing layout)
// Mobile:  stacks into a compact card with progressive disclosure
//
// The shape of `signal` matches what you likely already have — adjust the
// field names to match your existing Signal type.
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalData {
  id: string;
  type: 'sharp' | 'public' | 'steam' | 'reverse' | 'injury' | 'line';
  league: string;
  game: string;           // e.g. "LAL @ BOS"
  gameTime?: string;      // e.g. "7:30 PM ET"
  market: string;         // e.g. "Spread", "Total", "Moneyline"
  side: string;           // e.g. "Lakers -4.5"
  line?: string;          // e.g. "-4.5"
  odds?: string;          // e.g. "-110"
  sharpPct?: number;      // 0-100
  publicPct?: number;     // 0-100
  moneyPct?: number;      // 0-100
  movement?: string;      // e.g. "-4 → -4.5"
  value?: string;         // e.g. "+EV 4.2%"
  confidence?: 'low' | 'medium' | 'high';
  timestamp?: string;     // e.g. "2m ago"
  isNew?: boolean;
}

const TYPE_META: Record<
  SignalData['type'],
  { label: string; color: string; bg: string }
> = {
  sharp: { label: 'SHARP', color: '#00E676', bg: 'rgba(0,230,118,0.10)' },
  public: { label: 'PUBLIC', color: '#60a5fa', bg: 'rgba(96,165,250,0.10)' },
  steam: { label: 'STEAM', color: '#f97316', bg: 'rgba(249,115,22,0.10)' },
  reverse: { label: 'REVERSE', color: '#a78bfa', bg: 'rgba(167,139,250,0.10)' },
  injury: { label: 'INJURY', color: '#fb7185', bg: 'rgba(251,113,133,0.10)' },
  line: { label: 'LINE MOVE', color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' },
};

const CONF_META = {
  high: { label: '▲▲▲', color: '#00E676' },
  medium: { label: '▲▲', color: '#fbbf24' },
  low: { label: '▲', color: '#94a3b8' },
};

interface SignalCardProps {
  signal: SignalData;
  onBookmark?: (id: string) => void;
  onExpand?: (id: string) => void;
  isBookmarked?: boolean;
}

// ── Desktop row (your existing UI, keep as-is or swap your component here) ──
function DesktopRow({ signal }: { signal: SignalData }) {
  const meta = TYPE_META[signal.type];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr 120px 90px 100px 90px 80px',
        alignItems: 'center',
        gap: 12,
        padding: '12px 20px',
        borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.06))',
        background: signal.isNew
          ? 'rgba(0,230,118,0.03)'
          : 'transparent',
        transition: 'background 0.3s',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          padding: '3px 8px',
          background: meta.bg,
          color: meta.color,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.06em',
          borderRadius: 4,
          textAlign: 'center',
        }}
      >
        {meta.label}
      </span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #f1f5f9)', letterSpacing: '-0.01em' }}>
          {signal.side}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted, #475569)', marginTop: 2 }}>
          {signal.game} · {signal.market}
        </div>
      </div>
      {signal.odds && <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #94a3b8)' }}>{signal.odds}</span>}
      {signal.sharpPct != null && (
        <BarStat label="Sharp" value={signal.sharpPct} color="#00E676" />
      )}
      {signal.publicPct != null && (
        <BarStat label="Public" value={signal.publicPct} color="#60a5fa" />
      )}
      {signal.movement && <span style={{ fontSize: 12, color: '#fbbf24' }}>{signal.movement}</span>}
      <span style={{ fontSize: 11, color: 'var(--color-text-muted, #475569)', textAlign: 'right' }}>
        {signal.timestamp}
      </span>
    </div>
  );
}

// ── Mobile card ──────────────────────────────────────────────────────────────
function MobileCard({ signal, onBookmark, onExpand, isBookmarked }: SignalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[signal.type];
  const conf = signal.confidence ? CONF_META[signal.confidence] : null;

  return (
    <div
      style={{
        background: 'var(--color-surface-elevated, #0f172a)',
        borderRadius: 12,
        border: `1px solid ${signal.isNew ? 'rgba(0,230,118,0.25)' : 'var(--color-border, rgba(255,255,255,0.07))'}`,
        overflow: 'hidden',
        // New signal glow
        boxShadow: signal.isNew ? '0 0 0 1px rgba(0,230,118,0.15)' : 'none',
        transition: 'border-color 0.5s, box-shadow 0.5s',
        marginBottom: 8,
      }}
    >
      {/* ── Card top row ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px 0',
        }}
      >
        {/* Type badge */}
        <span
          style={{
            padding: '3px 7px',
            background: meta.bg,
            color: meta.color,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.06em',
            borderRadius: 4,
            flexShrink: 0,
          }}
        >
          {meta.label}
        </span>

        {/* Market */}
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-text-muted, #475569)',
            fontWeight: 600,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          {signal.market}
        </span>

        <span style={{ flex: 1 }} />

        {/* Confidence */}
        {conf && (
          <span style={{ fontSize: 11, color: conf.color, fontWeight: 700, letterSpacing: '-0.01em' }}>
            {conf.label}
          </span>
        )}

        {/* Timestamp */}
        <span style={{ fontSize: 11, color: 'var(--color-text-muted, #475569)' }}>
          {signal.timestamp}
        </span>
      </div>

      {/* ── Primary content ── */}
      <div style={{ padding: '8px 12px 10px' }}>
        {/* Game */}
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary, #94a3b8)',
            marginBottom: 3,
            letterSpacing: '-0.01em',
          }}
        >
          {signal.game}
          {signal.gameTime && (
            <span style={{ opacity: 0.6 }}> · {signal.gameTime}</span>
          )}
        </div>

        {/* Side — main emphasis */}
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--color-text-primary, #f1f5f9)',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}
        >
          {signal.side}
          {signal.odds && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 14,
                color: 'var(--color-text-secondary, #94a3b8)',
                fontWeight: 500,
              }}
            >
              {signal.odds}
            </span>
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderTop: '1px solid var(--color-border, rgba(255,255,255,0.06))',
          borderBottom: expanded ? '1px solid var(--color-border, rgba(255,255,255,0.06))' : 'none',
        }}
      >
        {signal.sharpPct != null && (
          <StatCell label="Sharp" value={`${signal.sharpPct}%`} accent="#00E676" />
        )}
        {signal.publicPct != null && (
          <StatCell label="Public" value={`${signal.publicPct}%`} accent="#60a5fa" />
        )}
        {signal.movement && (
          <StatCell label="Move" value={signal.movement} accent="#fbbf24" />
        )}
        {signal.value && (
          <StatCell label="Value" value={signal.value} accent="#a78bfa" />
        )}

        {/* Expand toggle */}
        <button
          onClick={() => {
            setExpanded(e => !e);
            onExpand?.(signal.id);
          }}
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
          style={{
            marginLeft: 'auto',
            minWidth: 44,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            cursor: 'pointer',
            color: 'var(--color-text-muted, #475569)',
            transition: 'color 0.15s',
            WebkitTapHighlightColor: 'transparent',
            flexShrink: 0,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          >
            <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── Expanded detail panel ── */}
      <div
        style={{
          maxHeight: expanded ? 200 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div style={{ padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {signal.sharpPct != null && (
            <BarDetail label="Sharp money" value={signal.sharpPct} color="#00E676" />
          )}
          {signal.moneyPct != null && (
            <BarDetail label="Total money" value={signal.moneyPct} color="#60a5fa" />
          )}
          {signal.publicPct != null && (
            <BarDetail label="Public bets" value={signal.publicPct} color="#94a3b8" />
          )}

          {/* Action row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={() => onBookmark?.(signal.id)}
              style={{
                flex: 1,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: isBookmarked ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isBookmarked ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8,
                cursor: 'pointer',
                color: isBookmarked ? '#fbbf24' : 'var(--color-text-secondary, #94a3b8)',
                fontSize: 12,
                fontWeight: 600,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                <path d="M2 2h9v10L6.5 9 2 12V2z" strokeLinejoin="round" />
              </svg>
              {isBookmarked ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Public component that switches based on breakpoint ───────────────────────
export function SignalCard(props: SignalCardProps) {
  const { isMobile } = useBreakpoint();
  if (isMobile) return <MobileCard {...props} />;
  return <DesktopRow signal={props.signal} />;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '7px 6px',
        gap: 2,
        borderRight: '1px solid var(--color-border, rgba(255,255,255,0.06))',
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: accent,
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 9,
          color: 'var(--color-text-muted, #475569)',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function BarStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted, #475569)' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{value}%</span>
      </div>
      <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
        <div
          style={{
            width: `${value}%`,
            height: '100%',
            background: color,
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}

function BarDetail({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #94a3b8)' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
          {value}%
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: 4,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 4,
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: '100%',
            background: color,
            borderRadius: 4,
            transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>
    </div>
  );
}
