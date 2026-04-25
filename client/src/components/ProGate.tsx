/**
 * ProGate — shared Pro gating components used across NBA, MLB, NFL boards.
 *
 * Exports:
 *  - ProModal: full-screen overlay with upgrade CTA → /pro (Stripe checkout)
 *  - ProRowOverlay: blur + lock overlay for gated signal rows
 *  - ProActionGate: blurred Action block in detail rail with Pro teaser
 *  - ProNavButton: top-right header button (free → opens modal, Pro → ✓ PRO)
 */

import React, { useEffect } from "react";
import { Link } from "wouter";
import { Lock, Zap, X, CheckCircle2, TrendingUp, AlertCircle, BarChart2 } from "lucide-react";
import { useSignalGate, type ModalTrigger } from "../context/SignalGate";

/* ── Design tokens ── */
const T = {
  bg:        "#0A0B0D",
  surface1:  "#111317",
  surface2:  "#16191E",
  gold:      "#CAA85A",
  goldBright:"#D8B86A",
  goldDim:   "rgba(202,168,90,0.18)",
  text:      "#F3EFE6",
  textMuted: "#B7AFA0",
  textFaint: "#7E776A",
  green:     "#4CAF82",
  orange:    "#D98A42",
  cyan:      "#4AA8C8",
  danger:    "#D94B4B",
};

/* ── Per-sport headline copy ── */
const MODAL_COPY: Record<ModalTrigger, { headline: string; subhead: string; cta: string }> = {
  NBA: {
    headline: "Full playoff intelligence.",
    subhead: "Sharp money. Injury intel. Line movement. Every signal, every game.",
    cta: "Unlock Pro — $19/mo",
  },
  MLB: {
    headline: "Every pitching change. Every lineup shift.",
    subhead: "Pitcher news, lineup movement, and sharp signals — before the line moves.",
    cta: "Unlock Pro — $19/mo",
  },
  NFL: {
    headline: "Football intel before the market moves.",
    subhead: "Injuries. Camp battles. Line movement. Sharp money. Every signal, every week.",
    cta: "Unlock Pro — $19/mo",
  },
  CFB: {
    headline: "Transfer intel. QB battles. Power ratings.",
    subhead: "Every CFB edge — depth charts, coaching changes, and sharp line moves.",
    cta: "Unlock Pro — $19/mo",
  },
  generic: {
    headline: "The information gap closes fast.",
    subhead: "Get there first. Every signal, every sport, fully readable.",
    cta: "Unlock Pro — $19/mo",
  },
};

const PRO_FEATURES = [
  { icon: Zap,           label: "Full signal feed",       detail: "All signals fully readable — no blurring, no limits." },
  { icon: AlertCircle,   label: "Priority injuries",      detail: "Every injury designation and practice report, instantly." },
  { icon: TrendingUp,    label: "Sharp money & line moves", detail: "Exact sharp percentages and steam moves — before the line adjusts." },
  { icon: BarChart2,     label: "Action takeaways",       detail: "Concrete bet/fantasy actions for every high-confidence signal." },
  { icon: CheckCircle2,  label: "Props + advanced edges", detail: "Prop analysis and matchup edges fully unlocked." },
];

/* ─────────────────────────────────────────────────────────────
   ProModal — full overlay upgrade prompt
──────────────────────────────────────────────────────────────── */
export function ProModal() {
  const { modalOpen, modalTrigger, closeModal } = useSignalGate();

  // Trap scroll when open
  useEffect(() => {
    if (modalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [modalOpen]);

  if (!modalOpen) return null;

  const copy = MODAL_COPY[modalTrigger];

  return (
    <div
      onClick={closeModal}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(10,11,13,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: T.surface1,
          border: `1px solid rgba(202,168,90,0.3)`,
          borderRadius: 6,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Gold top bar */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${T.gold}, ${T.goldBright}, ${T.gold})` }} />

        {/* Close button */}
        <button
          onClick={closeModal}
          style={{
            position: "absolute", top: 14, right: 14,
            background: "rgba(255,255,255,0.06)", border: "none", borderRadius: "50%",
            color: T.textMuted, cursor: "pointer",
            width: 30, height: 30,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={14} />
        </button>

        {/* Header */}
        <div style={{ padding: "24px 28px 20px" }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
            color: T.gold, marginBottom: 10,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Lock size={11} /> Edge Setter Pro
          </div>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 22, fontWeight: 700, color: T.text, lineHeight: 1.25, marginBottom: 8,
          }}>
            {copy.headline}
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 15, color: T.textMuted, lineHeight: 1.5,
          }}>
            {copy.subhead}
          </div>
        </div>

        {/* Features */}
        <div style={{ padding: "0 28px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {PRO_FEATURES.map(f => (
            <div key={f.label} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 3, flexShrink: 0,
                background: `${T.gold}18`,
                border: `1px solid ${T.gold}33`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <f.icon size={14} color={T.gold} />
              </div>
              <div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: "0.04em",
                }}>
                  {f.label}
                </div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, color: T.textFaint, lineHeight: 1.45, marginTop: 1,
                }}>
                  {f.detail}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Price + CTA */}
        <div style={{ padding: "0 28px 28px" }}>
          <div style={{
            display: "flex", alignItems: "baseline", gap: 6, marginBottom: 14,
          }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 36, fontWeight: 800, color: T.gold, lineHeight: 1,
            }}>$19</span>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 15, color: T.textFaint, fontWeight: 700,
            }}>/month · cancel anytime</span>
          </div>

          <Link href="/pro" onClick={closeModal}>
            <a style={{
              display: "block", width: "100%", padding: "14px 0",
              background: T.gold, color: T.bg,
              borderRadius: 3, border: "none",
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 16, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
              textAlign: "center", textDecoration: "none",
              cursor: "pointer",
              transition: "background 0.12s",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = T.goldBright; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = T.gold; }}
            >
              {copy.cta}
            </a>
          </Link>

          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textFaint, textAlign: "center", marginTop: 10,
          }}>
            NBA · MLB · NFL · CFB — all sports in one subscription
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ProRowOverlay — placed over gated signal rows
   Usage: wrap the row div, set position: relative on parent
──────────────────────────────────────────────────────────────── */
interface ProRowOverlayProps {
  sport?: ModalTrigger;
  /** If true, only blur the content, don't show the full lock overlay */
  softBlur?: boolean;
}

export function ProRowOverlay({ sport = "generic", softBlur = false }: ProRowOverlayProps) {
  const { openModal } = useSignalGate();

  return (
    <div
      onClick={e => { e.stopPropagation(); openModal(sport); }}
      style={{
        position: "absolute", inset: 0, zIndex: 4,
        background: softBlur ? "rgba(10,11,13,0.35)" : "rgba(10,11,13,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        backdropFilter: softBlur ? "blur(3px)" : "blur(2px)",
        WebkitBackdropFilter: softBlur ? "blur(3px)" : "blur(2px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Lock size={13} color={T.gold} />
        <span style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 12, fontWeight: 700, color: T.gold,
          letterSpacing: "0.1em", textTransform: "uppercase",
          background: `${T.gold}18`,
          padding: "3px 8px", borderRadius: 2,
          border: `1px solid ${T.gold}44`,
        }}>
          Pro
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ProActionGate — replaces or wraps the Action block in detail rail
──────────────────────────────────────────────────────────────── */
interface ProActionGateProps {
  children: React.ReactNode;
  sport?: ModalTrigger;
  /** The raw action text — shown blurred behind overlay */
  actionText?: string;
  darkMode?: boolean;
}

export function ProActionGate({ children, sport = "generic", actionText, darkMode = true }: ProActionGateProps) {
  const { isPro, openModal } = useSignalGate();

  if (isPro) return <>{children}</>;

  return (
    <div
      style={{ position: "relative", borderRadius: 4, overflow: "hidden", cursor: "pointer" }}
      onClick={() => openModal(sport)}
    >
      {/* Blurred content underneath */}
      <div style={{
        filter: "blur(4px)", pointerEvents: "none", userSelect: "none",
        opacity: 0.6,
      }}>
        {actionText ? (
          <div style={{
            background: `${T.gold}12`, border: `1px solid ${T.gold}33`,
            borderRadius: 4, padding: "12px 14px",
          }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 11, fontWeight: 700, color: T.gold,
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
            }}>
              <Zap size={11} style={{ display: "inline", marginRight: 4 }} />
              Action →
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 14, color: darkMode ? T.text : "#1A1712", lineHeight: 1.55,
            }}>
              {actionText}
            </div>
          </div>
        ) : (
          children
        )}
      </div>

      {/* Lock overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(10,11,13,0.7)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 6, borderRadius: 4,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Lock size={14} color={T.gold} />
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 13, fontWeight: 800, color: T.gold, letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            Pro
          </span>
        </div>
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 12, color: T.textFaint, letterSpacing: "0.06em",
        }}>
          Action takeaways are Pro only
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ProNavButton — top-right V2Shell header button
   Free: gold button → opens modal
   Pro:  muted "✓ PRO" label
──────────────────────────────────────────────────────────────── */
interface ProNavButtonProps {
  sport?: ModalTrigger;
}

export function ProNavButton({ sport = "generic" }: ProNavButtonProps) {
  const { isPro, openModal } = useSignalGate();

  if (isPro) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "0 10px", minHeight: 44,
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 13, fontWeight: 700, color: T.green,
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        <CheckCircle2 size={13} />
        Pro
      </div>
    );
  }

  return (
    <button
      onClick={() => openModal(sport)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        minHeight: 44, padding: "0 14px", borderRadius: 4,
        background: T.gold, color: T.bg,
        border: "none", cursor: "pointer",
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 14, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
        transition: "background 0.12s",
        flexShrink: 0,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = T.goldBright; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.gold; }}
    >
      <Zap size={13} />
      Pro — $19/mo
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   ProBoardBanner — shown below the filter tabs on free boards
   "Showing 3 of 12 signals — upgrade for full access"
──────────────────────────────────────────────────────────────── */
interface ProBoardBannerProps {
  freeCount: number;
  totalCount: number;
  sport?: ModalTrigger;
  darkMode?: boolean;
}

export function ProBoardBanner({ freeCount, totalCount, sport = "generic", darkMode = true }: ProBoardBannerProps) {
  const { isPro, openModal } = useSignalGate();
  if (isPro || totalCount <= freeCount) return null;

  const gated = totalCount - freeCount;

  return (
    <div
      onClick={() => openModal(sport)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "9px 20px",
        background: `${T.gold}0C`,
        borderBottom: `1px solid ${T.gold}33`,
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${T.gold}16`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = `${T.gold}0C`; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Lock size={12} color={T.gold} />
        <span style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 13, color: darkMode ? T.textMuted : "#4A443C",
          letterSpacing: "0.04em",
        }}>
          <strong style={{ color: T.gold }}>{gated} signals locked</strong> — Pro members see the full feed
        </span>
      </div>
      <span style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 12, fontWeight: 800, color: T.gold,
        letterSpacing: "0.1em", textTransform: "uppercase",
        background: `${T.gold}18`, padding: "3px 10px", borderRadius: 2,
        border: `1px solid ${T.gold}44`,
      }}>
        Unlock Pro
      </span>
    </div>
  );
}
