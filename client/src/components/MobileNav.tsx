import React, { useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { useBreakpoint } from '../hooks/useBreakpoint';

// ─────────────────────────────────────────────────────────────────────────────
// MobileNav — hamburger button + full-screen slide-in drawer
// Drop into src/components/MobileNav.tsx
//
// Usage in your layout / App.tsx:
//   const [drawerOpen, setDrawerOpen] = useState(false);
//   ...
//   <MobileNav open={drawerOpen} onToggle={() => setDrawerOpen(o => !o)} />
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
}

interface MobileNavProps {
  open: boolean;
  onToggle: () => void;
  navItems?: NavItem[];
  // Injected from your global signal store
  liveSignalCount?: number;
}

// ── Default nav items — adjust paths/icons to match your router ──────────────
const DEFAULT_NAV: NavItem[] = [
  {
    label: 'Home',
    path: '/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="2" width="7" height="7" rx="1.5" fill="currentColor" />
        <rect x="11" y="2" width="7" height="7" rx="1.5" fill="currentColor" opacity=".6" />
        <rect x="2" y="11" width="7" height="7" rx="1.5" fill="currentColor" opacity=".6" />
        <rect x="11" y="11" width="7" height="7" rx="1.5" fill="currentColor" opacity=".4" />
      </svg>
    ),
  },
  {
    label: 'NBA',
    path: '/nba',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 4.5C6 4.5 8 7 8 10s-2 5.5-2 5.5M14 4.5C14 4.5 12 7 12 10s2 5.5 2 5.5M2 10h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'MLB',
    path: '/mlb',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 15L10 3l5 12M7 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'NFL',
    path: '/nfl',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <ellipse cx="10" cy="10" rx="7" ry="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 10h14M10 5v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'CFB',
    path: '/cfb',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <ellipse cx="10" cy="10" rx="7" ry="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 10h14M10 5v10M6 7l-1-2M14 7l1-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'My Edge',
    path: '/my-edge',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.2l5-.7L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Alerts',
    path: '/alerts',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 5h12M4 10h12M4 15h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Pro',
    path: '/pro',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 14l3-3 3 2 5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".55" />
      </svg>
    ),
  },
];

// ── HamburgerButton ──────────────────────────────────────────────────────────
export function HamburgerButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      aria-controls="mobile-drawer"
      style={{
        // 44×44 minimum touch target
        minWidth: 44,
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        color: 'var(--color-text-primary, #f1f5f9)',
        borderRadius: 8,
        WebkitTapHighlightColor: 'transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)')}
      onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        fill="none"
        style={{ transition: 'transform 0.25s' }}
      >
        <line
          x1="3" y1={open ? '11' : '6'} x2="19" y2={open ? '11' : '6'}
          stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
          style={{
            transformOrigin: '11px 11px',
            transform: open ? 'rotate(45deg)' : 'none',
            transition: 'transform 0.25s, y1 0.25s, y2 0.25s',
          }}
        />
        {!open && (
          <line
            x1="3" y1="11" x2="19" y2="11"
            stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
            style={{ opacity: open ? 0 : 1, transition: 'opacity 0.15s' }}
          />
        )}
        <line
          x1="3" y1={open ? '11' : '16'} x2="19" y2={open ? '11' : '16'}
          stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
          style={{
            transformOrigin: '11px 11px',
            transform: open ? 'rotate(-45deg)' : 'none',
            transition: 'transform 0.25s, y1 0.25s, y2 0.25s',
          }}
        />
      </svg>
    </button>
  );
}

// ── MobileNav drawer ─────────────────────────────────────────────────────────
export function MobileNav({
  open,
  onToggle,
  navItems = DEFAULT_NAV,
  liveSignalCount = 0,
}: MobileNavProps) {
  const [pathname] = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const { isMobile } = useBreakpoint();

  // Close on route change
  useEffect(() => {
    if (open) onToggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onToggle();
    },
    [open, onToggle]
  );
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // On desktop with drawer closed, render nothing; if open always render
  if (!isMobile && !open) return null;

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        aria-hidden
        onClick={onToggle}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 199,
          background: 'rgba(0,0,0,0.88)',
          backdropFilter: 'blur(4px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s',
        }}
      />

      {/* ── Drawer ── */}
      <div
        id="mobile-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 'min(320px, 88vw)',
          zIndex: 200,
          background: '#050505',
          borderRight: '1px solid #1F2937',
          boxShadow: '24px 0 56px rgba(0,0,0,0.62)',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #1F2937',
            background: '#0A0F1A',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: '-0.02em',
                color: 'var(--color-text-primary, #f1f5f9)',
              }}
            >
              EdgeSetter
            </span>
            {liveSignalCount > 0 && (
              <span
                style={{
                  background: 'var(--color-accent, #00E676)',
                  color: '#000',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 20,
                  lineHeight: 1,
                }}
              >
                {liveSignalCount} LIVE
              </span>
            )}
          </div>
          <button
            onClick={onToggle}
            aria-label="Close menu"
            style={{
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #94a3b8)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {navItems.map(item => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '13px 20px',
                  textDecoration: 'none',
                  color: isActive
                    ? 'var(--color-text-primary, #f1f5f9)'
                    : '#cbd5e1',
                  background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                  borderLeft: isActive
                    ? '2px solid var(--color-accent, #00E676)'
                    : '2px solid transparent',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 15,
                  letterSpacing: '-0.01em',
                  transition: 'background 0.15s, color 0.15s',
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                }}
              >
                <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.85 }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span
                    style={{
                      background: 'var(--color-accent, #00E676)',
                      color: '#000',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 20,
                      lineHeight: 1.2,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
              borderTop: '1px solid #1F2937',
              background: '#0A0F1A',
            flexShrink: 0,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: '#94A3B8',
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
            }}
          >
            Edge Setter · Betting Intelligence
          </p>
        </div>
      </div>
    </>
  );
}
