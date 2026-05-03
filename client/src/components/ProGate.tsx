/**
 * ProGate — shared Pro gating components used across NBA, MLB, NFL boards.
 *
 * Exports:
 *  - ProModal: full-screen overlay with upgrade CTA → /pro (Stripe checkout)
 *  - ProRowOverlay: blur + lock overlay for gated signal rows
 *  - ProActionGate: blurred Action block in detail rail with Pro teaser
 *  - ProNavButton: top-right header button (free → opens modal, Pro → ✓ PRO)
 */

import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Lock, Zap, X, CheckCircle2, TrendingUp, AlertCircle, BarChart2, LogIn, LogOut, User, ChevronDown } from "lucide-react";
import { useSignalGate, type ModalTrigger } from "../context/SignalGate";
import { useAuth } from "../context/AuthContext";

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

/* ── Per-sport modal copy ── */
interface SportCopy {
  headline: string;
  subhead: string;
  cta: string;
  features: { icon: React.ElementType; label: string; detail: string }[];
}

const MODAL_COPY: Record<ModalTrigger, SportCopy> = {
  NBA: {
    headline: "Full playoff intelligence.",
    subhead: "High-conviction signals with confidence scores, sharp money context, and market-aware edges — every game, fully readable.",
    cta: "Unlock Pro — $19/mo",
    features: [
      { icon: Zap,          label: "Full signal feed",          detail: "Every playoff signal — no blurring, no free limits." },
      { icon: AlertCircle,  label: "Injury & status intel",     detail: "Questionable tags, DNP reports, and practice designations before tip-off." },
      { icon: TrendingUp,   label: "Sharp money & line moves",  detail: "Exact sharp ticket percentages and steam moves — before the spread adjusts." },
      { icon: BarChart2,    label: "Action takeaways",          detail: "Concrete bet/DFS actions for every high-confidence signal." },
      { icon: CheckCircle2, label: "Props + player edges",      detail: "Player prop edges and matchup angles fully unlocked." },
    ],
  },
  MLB: {
    headline: "Every pitching change. Every lineup shift.",
    subhead: "Pitcher news, lineup movement, and sharp signals — before the line moves.",
    cta: "Unlock Pro — $19/mo",
    features: [
      { icon: Zap,          label: "Full signal feed",          detail: "Every pitcher and lineup signal — no blurring, no limits." },
      { icon: AlertCircle,  label: "Pitcher & health reports",  detail: "Scratches, bullpen load, and IL movement the moment it surfaces." },
      { icon: TrendingUp,   label: "Line movement & steam",     detail: "Sharp percentages and overnight line movement before first pitch." },
      { icon: BarChart2,    label: "Action takeaways",          detail: "Run-line, total, and prop angles for every high-confidence signal." },
      { icon: CheckCircle2, label: "Weather + park factors",    detail: "Wind direction, temperature, and ballpark edge signals unlocked." },
    ],
  },
  NFL: {
    headline: "Football intel before the market moves.",
    subhead: "High-conviction signals with confidence scores, injury context, and market-aware edges — every week, fully readable.",
    cta: "Unlock Pro — $19/mo",
    features: [
      { icon: Zap,          label: "Full signal feed",          detail: "Every injury, line move, and role change — nothing locked." },
      { icon: AlertCircle,  label: "Practice & injury reports", detail: "Wednesday through Friday designations and snap-share changes." },
      { icon: TrendingUp,   label: "Sharp money & line moves",  detail: "Steam moves, reverse line movement, and sharp side identification." },
      { icon: BarChart2,    label: "Action takeaways",          detail: "Spread, total, and prop actions for every high-confidence signal." },
      { icon: CheckCircle2, label: "Depth chart & role edges",  detail: "Target share shifts, backfield splits, and role changes — early." },
    ],
  },
  CFB: {
    headline: "Transfer intel. QB battles. Power ratings.",
    subhead: "Every CFB edge — depth charts, coaching changes, and sharp line moves — before the market adjusts.",
    cta: "Unlock Pro — $19/mo",
    features: [
      { icon: Zap,          label: "Full signal feed",          detail: "Every transfer, depth chart, and line move signal unlocked." },
      { icon: AlertCircle,  label: "Transfer portal & depth",   detail: "Portal commits, starter battles, and eligibility decisions — first." },
      { icon: TrendingUp,   label: "Sharp line movement",       detail: "Early CFB line moves and steam before the public arrives." },
      { icon: BarChart2,    label: "Action takeaways",          detail: "ATS, total, and player prop actions for every high-confidence signal." },
      { icon: CheckCircle2, label: "Coaching & scheme intel",   detail: "Coordinator moves, gameplanning tendencies, and motivational edges." },
    ],
  },
  generic: {
    headline: "Multi-sport intelligence terminal.",
    subhead: "High-conviction signals with confidence scores, context, and market-aware edges — so you act before the rest of the market catches up.",
    cta: "Unlock Pro — $19/mo",
    features: [
      { icon: Zap,          label: "Full signal feed",          detail: "Every signal across every sport — no blurring, no limits." },
      { icon: AlertCircle,  label: "Injury & status intel",     detail: "Practice designations, depth changes, and scratches instantly." },
      { icon: TrendingUp,   label: "Sharp money & line moves",  detail: "Steam moves and sharp percentages before the market adjusts." },
      { icon: BarChart2,    label: "Action takeaways",          detail: "Concrete bet and DFS actions for every high-confidence signal." },
      { icon: CheckCircle2, label: "All sports, one plan",      detail: "NBA · MLB · NFL · CFB — every sport covered in one subscription." },
    ],
  },
};

/* ─────────────────────────────────────────────────────────────
   ProModal — full overlay upgrade prompt
──────────────────────────────────────────────────────────────── */
export function ProModal() {
  const { modalOpen, modalTrigger, closeModal } = useSignalGate();
  const { login } = useAuth();
  const [signinMode, setSigninMode] = useState(false);
  const [signinEmail, setSigninEmail] = useState("");
  const [signinLoading, setSigninLoading] = useState(false);
  const [signinError, setSigninError] = useState("");

  // Trap scroll when open
  useEffect(() => {
    if (modalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [modalOpen]);

  // Reset sign-in state when modal closes
  useEffect(() => {
    if (!modalOpen) {
      setSigninMode(false);
      setSigninEmail("");
      setSigninError("");
    }
  }, [modalOpen]);

  async function handleSignin() {
    if (!signinEmail || signinLoading) return;
    setSigninLoading(true);
    setSigninError("");
    const err = await login(signinEmail);
    setSigninLoading(false);
    if (err) {
      setSigninError(err);
    } else {
      closeModal();
    }
  }

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
            fontSize: 30, fontWeight: 700, color: T.text, lineHeight: 1.2, marginBottom: 10,
          }}>
            {copy.headline}
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 15, color: T.textMuted, lineHeight: 1.6, letterSpacing: "0.02em",
          }}>
            {copy.subhead}
          </div>
        </div>

        {/* Features — sport-contextual */}
        <div style={{ padding: "0 28px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {copy.features.map(f => (
            <div key={f.label} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 3, flexShrink: 0,
                background: `${T.gold}18`,
                border: `1px solid ${T.gold}33`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <f.icon size={22} color={T.gold} />
              </div>
              <div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "0.04em",
                }}>
                  {f.label}
                </div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 15, color: T.textFaint, lineHeight: 1.45, marginTop: 1,
                }}>
                  {f.detail}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Price + CTA / Sign-in toggle */}
        <div style={{ padding: "0 28px 28px" }}>
          {signinMode ? (
            /* ── Sign-in panel ── */
            <div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, fontWeight: 700, color: T.textMuted,
                letterSpacing: "0.06em", marginBottom: 10,
              }}>
                Enter your subscription email to activate access:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 0, border: `1px solid ${T.gold}44`, borderRadius: 3, overflow: "hidden" }}>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={signinEmail}
                  autoFocus
                  onChange={e => { setSigninEmail(e.target.value); setSigninError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleSignin()}
                  style={{
                    background: T.surface2, border: "none",
                    borderRight: `1px solid ${T.gold}33`,
                    color: T.text, fontSize: 15, padding: "12px 14px",
                    outline: "none", fontFamily: "inherit", minWidth: 0,
                  }}
                />
                <button
                  onClick={handleSignin}
                  disabled={signinLoading || !signinEmail}
                  style={{
                    padding: "12px 16px",
                    background: signinLoading || !signinEmail ? T.goldDim : T.gold,
                    color: T.bg, border: "none",
                    cursor: signinLoading || !signinEmail ? "default" : "pointer",
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 13, fontWeight: 800, letterSpacing: "0.12em",
                    textTransform: "uppercase", whiteSpace: "nowrap",
                  }}
                >
                  {signinLoading ? "…" : "Activate"}
                </button>
              </div>
              {signinError && (
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, color: T.danger, marginTop: 8,
                }}>
                  {signinError}
                </div>
              )}
              <button
                onClick={() => { setSigninMode(false); setSigninError(""); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 12, color: T.textFaint, marginTop: 12,
                  letterSpacing: "0.06em", padding: 0,
                }}
              >
                ← Back to upgrade options
              </button>
            </div>
          ) : (
            /* ── Subscribe CTA ── */
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
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
                  cursor: "pointer", transition: "background 0.12s",
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

              <div style={{ textAlign: "center", marginTop: 14 }}>
                <button
                  onClick={() => setSigninMode(true)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, color: T.textFaint, letterSpacing: "0.06em",
                    padding: 0, textDecoration: "underline",
                  }}
                >
                  Already subscribed? Activate access →
                </button>
              </div>
            </div>
          )}
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

/* ─────────────────────────────────────────────────────────────
   NavLoginButton — top-bar login/account button for all layouts
   Not logged in: "Sign In" → inline email dropdown
   Logged in:     abbreviated email + dropdown with Sign Out
──────────────────────────────────────────────────────────────── */
export function NavLoginButton() {
  const { email, isPro, login, logout, authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [inputEmail, setInputEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function handleLogin() {
    if (!inputEmail || loading) return;
    setLoading(true);
    setError("");
    const err = await login(inputEmail);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setOpen(false);
      setInputEmail("");
    }
  }

  if (authLoading) return null;

  if (email) {
    const abbrev = email.length > 22 ? email.slice(0, 19) + "…" : email;
    return (
      <div ref={ref} style={{ position: "relative" }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            minHeight: 44, padding: "0 12px", borderRadius: 4,
            border: `1px solid rgba(202,168,90,0.22)`,
            background: "transparent",
            color: isPro ? T.green : T.textMuted,
            cursor: "pointer",
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.05em",
            transition: "background 0.12s, border-color 0.12s",
          }}
          onMouseEnter={e => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.background = "rgba(202,168,90,0.06)";
            b.style.borderColor = "rgba(202,168,90,0.35)";
          }}
          onMouseLeave={e => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.background = "transparent";
            b.style.borderColor = "rgba(202,168,90,0.22)";
          }}
        >
          <User size={12} />
          <span className="hidden sm:inline" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{abbrev}</span>
          <ChevronDown size={11} />
        </button>
        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0,
            background: T.surface2, border: `1px solid rgba(202,168,90,0.2)`,
            borderRadius: 4, minWidth: 200, overflow: "hidden", zIndex: 200,
            boxShadow: "0 6px 24px rgba(0,0,0,0.55)",
          }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid rgba(202,168,90,0.1)` }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700, color: T.textFaint,
                letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4,
              }}>Signed in as</div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, color: T.textMuted, wordBreak: "break-all",
              }}>{email}</div>
            </div>
            <button
              onClick={() => { logout(); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "11px 14px",
                background: "none", border: "none",
                color: T.textFaint, cursor: "pointer",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                transition: "background 0.1s, color 0.1s",
                textAlign: "left",
              }}
              onMouseEnter={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background = "rgba(217,75,75,0.08)";
                b.style.color = T.danger;
              }}
              onMouseLeave={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background = "none";
                b.style.color = T.textFaint;
              }}
            >
              <LogOut size={12} />
              Sign Out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          minHeight: 44, padding: "0 14px", borderRadius: 4,
          border: `1px solid rgba(202,168,90,0.3)`,
          background: open ? "rgba(202,168,90,0.06)" : "transparent",
          color: T.gold,
          cursor: "pointer",
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          transition: "background 0.12s, border-color 0.12s",
        }}
        onMouseEnter={e => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.background = "rgba(202,168,90,0.08)";
          b.style.borderColor = "rgba(202,168,90,0.5)";
        }}
        onMouseLeave={e => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.background = open ? "rgba(202,168,90,0.06)" : "transparent";
          b.style.borderColor = "rgba(202,168,90,0.3)";
        }}
      >
        <LogIn size={13} />
        <span className="hidden sm:inline">Sign In</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0,
          background: T.surface2, border: `1px solid rgba(202,168,90,0.25)`,
          borderRadius: 4, padding: 16, zIndex: 200, width: 290,
          boxShadow: "0 6px 24px rgba(0,0,0,0.55)",
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, color: T.textFaint,
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10,
          }}>
            Activate Pro Access
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr auto", gap: 0,
            border: `1px solid ${T.gold}44`, borderRadius: 3, overflow: "hidden",
          }}>
            <input
              type="email"
              placeholder="your@email.com"
              value={inputEmail}
              autoFocus
              onChange={e => { setInputEmail(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              style={{
                background: T.bg, border: "none",
                borderRight: `1px solid ${T.gold}33`,
                color: T.text, fontSize: 14, padding: "10px 12px",
                outline: "none", fontFamily: "inherit", minWidth: 0,
              }}
            />
            <button
              onClick={handleLogin}
              disabled={loading || !inputEmail}
              style={{
                padding: "10px 14px",
                background: loading || !inputEmail ? T.goldDim : T.gold,
                color: T.bg, border: "none",
                cursor: loading || !inputEmail ? "default" : "pointer",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {loading ? "…" : "Go"}
            </button>
          </div>
          {error && (
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, color: T.danger, marginTop: 8, lineHeight: 1.4,
            }}>
              {error}
            </div>
          )}
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, color: T.textFaint, marginTop: 10, lineHeight: 1.4,
          }}>
            Enter the email used for your Pro subscription.
          </div>
        </div>
      )}
    </div>
  );
}
