/**
 * Edge Setter — LandingPage v6 (Luxury Film Ledger)
 *
 * Primary reference: luxury_film_ledger_dark.jpg (Kane card style)
 * Palette: #0A0B0D bg, #CAA85A gold, #F3EFE6 text
 * Philosophy: premium intelligence terminal — sell product first, dashboard second
 */
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type Theme } from "../App";
import { Sun, Moon, ChevronRight, CheckCircle2, X, Menu, Activity } from "lucide-react";

interface Props { theme: Theme; toggleTheme: () => void; }

/* ── Design tokens ── */
const T = {
  bg:        "#0A0B0D",
  surface1:  "#111317",
  surface2:  "#16191E",
  surface3:  "#1B1F25",
  gold:      "#CAA85A",
  goldBright:"#D8B86A",
  goldDim:   "rgba(202,168,90,0.16)",
  text:      "#F3EFE6",
  textMuted: "#B7AFA0",
  textFaint: "#7E776A",
  danger:    "#D94B4B",
  green:     "#3DAE72",
  cyan:      "#38AACB",
};

/* ── Primitives ── */

function GoldRule({ opacity = 0.22, my = 0 }: { opacity?: number; my?: number }) {
  return (
    <div style={{
      height: 1, background: T.gold, opacity,
      margin: `${my}px 0`, flexShrink: 0,
      pointerEvents: "none",
    }} />
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 11, fontWeight: 700,
      letterSpacing: "0.22em", textTransform: "uppercase",
      color: T.gold, marginBottom: 12,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      {children}
      <div style={{ flex: 1, maxWidth: 32, height: 1, background: T.gold, opacity: 0.35, pointerEvents: "none" }} />
    </div>
  );
}

function VerdictPill({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    confirmed:    { bg: "rgba(56,170,203,0.12)", color: "#5AC8E0", label: "Confirmed" },
    likely:       { bg: "rgba(202,168,90,0.12)", color: "#D8B86A", label: "Likely" },
    rumor:        { bg: "rgba(120,80,176,0.12)", color: "#A07ACC", label: "Rumor" },
    contradicted: { bg: "rgba(207,74,74,0.12)", color: "#E08080", label: "Contradicted" },
    review:       { bg: "rgba(78,111,160,0.12)", color: "#7A9CC8", label: "In Review" },
  };
  const s = map[type.toLowerCase()] ?? map.review;
  return (
    <span style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase",
      background: s.bg, color: s.color,
      border: `1px solid ${s.color}44`,
      padding: "3px 8px", borderRadius: 2,
      display: "inline-flex", alignItems: "center",
    }}>
      {s.label}
    </span>
  );
}

/* ── Chalk football field SVG (background decoration) ── */
function ChalkField() {
  const s  = "rgba(255,255,255,0.18)";
  const yl = "rgba(255,255,255,0.14)";
  const mid = "rgba(255,255,255,0.26)";
  const h  = "rgba(255,255,255,0.11)";
  const ez = "rgba(255,255,255,0.06)";
  const FL = 60, FR = 740, FT = 16, FB = 340;
  const FH = FB - FT;
  const EZW = 68;
  const EL = FL + EZW;
  const ER = FR - EZW;
  const H1 = FT + FH * 0.185;
  const H2 = FT + FH * 0.815;
  const HW = 7;
  const tenYardLines = [1,2,3,4,5,6,7,8,9].map(i => EL + i * EZW);
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox="0 0 800 356" preserveAspectRatio="xMidYMid slice" fill="none"
    >
      <rect x={FL} y={FT} width={EZW} height={FH} fill={ez} />
      <rect x={ER}  y={FT} width={EZW} height={FH} fill={ez} />
      <rect x={FL} y={FT} width={FR - FL} height={FH} stroke={s} strokeWidth="1.5" />
      <line x1={EL} y1={FT} x2={EL} y2={FB} stroke={s} strokeWidth="1.4" />
      <line x1={ER} y1={FT} x2={ER} y2={FB} stroke={s} strokeWidth="1.4" />
      {tenYardLines.map((x, i) => (
        <line key={i} x1={x} y1={FT} x2={x} y2={FB}
          stroke={i === 4 ? mid : yl} strokeWidth={i === 4 ? "1.8" : "0.9"} />
      ))}
      {tenYardLines.map((x, i) => (
        <line key={`ht${i}`} x1={x} y1={H1 - HW/2} x2={x} y2={H1 + HW/2} stroke={h} strokeWidth="1.2" />
      ))}
      {tenYardLines.map((x, i) => (
        <line key={`hb${i}`} x1={x} y1={H2 - HW/2} x2={x} y2={H2 + HW/2} stroke={h} strokeWidth="1.2" />
      ))}
      {/* Play routes */}
      <path d="M 200 178 Q 280 118 362 148" stroke="rgba(202,168,90,0.18)" strokeWidth="1.4" strokeDasharray="7 5" />
      <path d="M 362 148 L 374 138" stroke="rgba(202,168,90,0.18)" strokeWidth="1.4" />
      <path d="M 600 178 Q 520 238 444 210" stroke="rgba(202,168,90,0.18)" strokeWidth="1.4" strokeDasharray="7 5" />
      <path d="M 444 210 L 436 222" stroke="rgba(202,168,90,0.18)" strokeWidth="1.4" />
    </svg>
  );
}

function LandingLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 32 32" fill="none" aria-label="Edge Setter">
      <rect width="32" height="32" rx="3" fill="#111317" />
      <rect x="6" y="7" width="20" height="2.5" rx="0.5" fill="#CAA85A" />
      <rect x="6" y="14.75" width="13" height="2.5" rx="0.5" fill="#CAA85A" />
      <rect x="6" y="22.5" width="20" height="2.5" rx="0.5" fill="#CAA85A" />
      <rect x="21" y="14.75" width="5" height="2.5" rx="0.5" fill="#D8B86A" opacity="0.6" />
    </svg>
  );
}

/* ── Featured Player Card (Kane-style) ── */
function FeaturedCard({ signal }: { signal: any }) {
  const name = signal?.player_name ?? "Patrick Mahomes";
  const team = signal?.team ?? "KC Chiefs";
  const title = signal?.title ?? "Full go after ankle scare";
  const conf = signal?.confidence_score ?? 92;
  const verdict = signal?.verdict ?? "Confirmed";
  const initial = name.split(" ").pop()?.charAt(0) ?? "M";

  return (
    <div
      style={{
        background: T.surface1,
        border: `1px solid rgba(202,168,90,0.28)`,
        borderRadius: 6,
        overflow: "hidden",
        position: "relative",
        minWidth: 280,
        maxWidth: 360,
        width: "100%",
      }}
    >
      {/* Gold top bar */}
      <div style={{
        height: 2, background: T.gold,
        pointerEvents: "none",
      }} />

      {/* Field backdrop */}
      <div style={{ position: "relative", height: 180, background: "#0D0F12", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <ChalkField />
        </div>

        {/* Main card overlay */}
        <div style={{
          position: "absolute",
          left: 16, top: 16, right: 16, bottom: 16,
          background: "rgba(10,11,13,0.85)",
          backdropFilter: "blur(4px)",
          border: `1px solid rgba(202,168,90,0.22)`,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "16px 18px",
        }}>
          {/* Large initial */}
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 80, fontWeight: 700,
            color: T.gold, lineHeight: 1,
            letterSpacing: "-0.04em",
            textShadow: `0 0 40px rgba(202,168,90,0.30)`,
            userSelect: "none",
            flexShrink: 0,
          }}>
            {initial}
          </div>

          {/* Player info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 22, fontWeight: 700,
                color: T.text, lineHeight: 1.1,
                letterSpacing: "-0.01em",
              }}
            >
              {name.split(",").length > 1 ? name : name.split(" ").slice(-1)[0] + ","}
            </div>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 22, fontWeight: 700,
              color: T.text, lineHeight: 1.1,
              letterSpacing: "-0.01em",
              marginBottom: 6,
            }}>
              {name.split(" ")[0]}
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700,
              letterSpacing: "0.18em", textTransform: "uppercase",
              color: T.gold,
            }}>
              {team}
            </div>
          </div>

          {/* Stat boxes */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            <StatBox value={`${conf}`} label="Score" />
            <StatBox value={verdict.charAt(0).toUpperCase() + verdict.slice(1,4)} label="Status" highlight />
          </div>
        </div>
      </div>

      {/* Signal brief */}
      <div style={{ padding: "16px 20px 20px" }}>
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 10, fontWeight: 700,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: T.textFaint, marginBottom: 8,
        }}>
          Featured Intelligence
        </div>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 15, fontWeight: 700,
          color: T.text, lineHeight: 1.35,
          marginBottom: 12,
        }}>
          {title}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <VerdictPill type={verdict.toLowerCase()} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              className="live-dot"
              style={{ width: 5, height: 5, borderRadius: "50%", background: T.gold, display: "inline-block" }}
            />
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: T.textFaint,
            }}>
              Live
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? "rgba(202,168,90,0.10)" : "#16191E",
      border: `1px solid ${highlight ? "rgba(202,168,90,0.35)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 3,
      padding: "6px 10px",
      textAlign: "center",
      minWidth: 58,
    }}>
      <div style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: 20, fontWeight: 700,
        color: highlight ? T.gold : T.text,
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 9, fontWeight: 700,
        letterSpacing: "0.12em", textTransform: "uppercase",
        color: T.textFaint,
        marginTop: 3,
      }}>
        {label}
      </div>
    </div>
  );
}

/* ── Signal Feed Tile ── */
function SignalTile({ signal }: { signal: any }) {
  return (
    <div
      style={{
        background: T.surface2,
        border: `1px solid rgba(202,168,90,0.10)`,
        borderLeft: `3px solid rgba(202,168,90,0.50)`,
        borderRadius: 4,
        padding: "18px 20px",
        transition: "border-left-color 0.15s, background 0.15s",
        cursor: "default",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderLeftColor = T.gold;
        el.style.background = T.surface3;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderLeftColor = "rgba(202,168,90,0.50)";
        el.style.background = T.surface2;
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: T.gold, marginBottom: 4,
          }}>
            {signal.player_name ?? "Signal"} · {signal.team ?? ""}
          </div>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 16, fontWeight: 700,
            color: T.text, lineHeight: 1.3,
          }}>
            {signal.title}
          </div>
        </div>
        <VerdictPill type={(signal.verdict ?? "review").toLowerCase()} />
      </div>
      {signal.summary && (
        <p style={{
          fontSize: 14, color: T.textMuted, lineHeight: 1.6,
          margin: "8px 0 10px",
        }}>
          {signal.summary}
        </p>
      )}
      {signal.action_takeaway && (
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
          color: T.gold, textTransform: "uppercase",
        }}>
          → {signal.action_takeaway}
        </div>
      )}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginTop: 12,
        paddingTop: 10, borderTop: "1px solid rgba(202,168,90,0.08)",
      }}>
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: T.textFaint,
        }}>
          Confidence
        </div>
        <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, position: "relative" }}>
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0,
            width: `${signal.confidence_score ?? 70}%`,
            background: T.gold, borderRadius: 2,
          }} />
        </div>
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 11, fontWeight: 700, color: T.gold,
        }}>
          {signal.confidence_score ?? 70}
        </div>
      </div>
    </div>
  );
}

/* ── Waitlist form ── */
function WaitlistForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", league: "" });
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/waitlist", data).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "You're on the list.", description: "We'll reach out when spots open." });
      onSuccess();
    },
    onError: () => {
      toast({ title: "Submission failed.", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim()) return;
    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[
        { id: "name",   label: "Full Name",      placeholder: "Your name",       type: "text" },
        { id: "email",  label: "Email Address",  placeholder: "you@example.com", type: "email", required: true },
        { id: "league", label: "Leagues / Format", placeholder: "e.g. Redraft, Dynasty, DFS", type: "text" },
      ].map(f => (
        <div key={f.id}>
          <label className="label-premium" htmlFor={f.id}>{f.label}</label>
          <input
            id={f.id}
            type={f.type}
            required={f.required}
            placeholder={f.placeholder}
            className="input-premium"
            value={(form as any)[f.id]}
            onChange={e => setForm(prev => ({ ...prev, [f.id]: e.target.value }))}
          />
        </div>
      ))}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="btn-primary"
        style={{ marginTop: 8, width: "100%" }}
      >
        {mutation.isPending ? "Submitting…" : "Request Pro Access"}
        {!mutation.isPending && <ChevronRight size={14} />}
      </button>
    </form>
  );
}

/* ══ MAIN LANDING PAGE ══════════════════════════════════════════════ */
export default function LandingPage({ theme, toggleTheme }: Props) {
  const [, navigate] = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  const { data: signals } = useQuery<any[]>({
    queryKey: ["/api/signals"],
    queryFn: () => apiRequest("GET", "/api/signals").then(r => r.json()),
  });

  const publicSignals = (signals ?? []).filter((s: any) => s.is_public !== false).slice(0, 4);
  const featuredSignal = (signals ?? []).find((s: any) => s.is_featured) ?? publicSignals[0];

  // Close nav on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setNavOpen(false);
      }
    };
    if (navOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [navOpen]);

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: "100vh" }}>

      {/* ══ HEADER ══════════════════════════════════════════════════ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(10,11,13,0.96)",
        borderBottom: "1px solid rgba(202,168,90,0.14)",
        borderTop: "2px solid rgba(202,168,90,0.60)",
        backdropFilter: "blur(16px)",
      }}>
        <div style={{
          maxWidth: 1440, margin: "0 auto",
          padding: "0 32px",
          display: "flex", alignItems: "center",
          minHeight: 60, gap: 24,
        }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
            <LandingLogo />
            <div>
              <div style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontWeight: 700, fontSize: 17,
                color: T.text, letterSpacing: "-0.01em",
              }}>
                Edge Setter
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.20em",
                textTransform: "uppercase", color: T.textFaint,
              }}>
                NFL Intelligence
              </div>
            </div>
          </div>

          {/* Nav — desktop */}
          <nav style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 32 }}
            className="hidden md:flex">
            {[
              { label: "Signal Board", href: "/dashboard" },
              { label: "Draft Board", href: "/draft" },
              { label: "Sources", href: "/leaderboard" },
            ].map(item => (
              <Link key={item.href} href={item.href}>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 12, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  color: T.textMuted, cursor: "pointer",
                  padding: "6px 14px", borderRadius: 3,
                  transition: "color 0.15s, background 0.15s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.color = T.gold;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.color = T.textMuted;
                }}>
                  {item.label}
                </div>
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={toggleTheme} aria-label="Toggle theme" style={{
              background: "none", border: "none",
              color: T.textFaint, cursor: "pointer", padding: 4,
              display: "flex", alignItems: "center",
              transition: "color 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = T.text; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = T.textFaint; }}>
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Hamburger — mobile */}
            <div ref={navRef} style={{ position: "relative" }} className="md:hidden">
              <button
                onClick={() => setNavOpen(o => !o)}
                style={{
                  background: "none", border: "none",
                  color: T.textMuted, cursor: "pointer", padding: 4,
                  display: "flex", alignItems: "center",
                }}
              >
                {navOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
              {navOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0,
                  background: T.surface1,
                  border: `1px solid rgba(202,168,90,0.22)`,
                  borderRadius: 4, minWidth: 180,
                  zIndex: 100, overflow: "hidden",
                }}>
                  {[
                    { label: "Signal Board", href: "/dashboard" },
                    { label: "Draft Board", href: "/draft" },
                    { label: "Sources", href: "/leaderboard" },
                    { label: "Go Pro — $19/mo", href: "/pro" },
                  ].map(item => (
                    <Link key={item.href} href={item.href}>
                      <div
                        onClick={() => setNavOpen(false)}
                        style={{
                          padding: "13px 18px",
                          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                          fontSize: 12, fontWeight: 700,
                          letterSpacing: "0.14em", textTransform: "uppercase",
                          color: item.href === "/pro" ? T.gold : T.textMuted,
                          borderBottom: "1px solid rgba(202,168,90,0.08)",
                          cursor: "pointer",
                          transition: "background 0.12s, color 0.12s",
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLDivElement).style.background = "rgba(202,168,90,0.06)";
                          (e.currentTarget as HTMLDivElement).style.color = T.gold;
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLDivElement).style.background = "transparent";
                          (e.currentTarget as HTMLDivElement).style.color = item.href === "/pro" ? T.gold : T.textMuted;
                        }}
                      >
                        {item.label}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* CTA */}
            <button
              onClick={() => navigate("/pro")}
              style={{
                background: T.gold, color: T.bg,
                border: "none", borderRadius: 3,
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase",
                padding: "0 20px", minHeight: 40,
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = T.goldBright; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.gold; }}
            >
              Go Pro · $19
            </button>
          </div>
        </div>
      </header>

      {/* ══ HERO ════════════════════════════════════════════════════ */}
      <section style={{
        maxWidth: 1440, margin: "0 auto",
        padding: "80px 32px 72px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "64px 56px",
        alignItems: "center",
      }}
      className="block md:grid"
      >
        {/* Left: copy */}
        <div style={{ maxWidth: 620 }}>
          <Eyebrow>Premium NFL Intelligence</Eyebrow>

          <h1
            className="display-serif"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              color: T.text,
              marginBottom: 24,
              lineHeight: 1.04,
            }}
          >
            The intelligence
            <br />
            <span style={{
              background: `linear-gradient(135deg, ${T.gold} 0%, ${T.goldBright} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              edge you need.
            </span>
          </h1>

          <p style={{
            fontSize: "1.125rem",
            color: T.textMuted,
            lineHeight: 1.65,
            maxWidth: 520,
            marginBottom: 36,
          }}>
            Real-time NFL signals with verified sources, confidence scoring,
            and tactical context — built for serious fantasy players and analysts
            who need actionable intelligence before the market moves.
          </p>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/pro")}
              className="btn-primary"
            >
              Get Pro Access · $19
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="btn-secondary"
            >
              View Signal Board
            </button>
          </div>

          {/* Trust indicators */}
          <div style={{
            display: "flex", alignItems: "center", gap: 24,
            marginTop: 40,
            paddingTop: 32,
            borderTop: "1px solid rgba(202,168,90,0.12)",
            flexWrap: "wrap", rowGap: 12,
          }}>
            {[
              { val: "12+",    label: "Sources Tracked" },
              { val: "Live",   label: "Signal Updates" },
              { val: "$19",    label: "Per Month Pro" },
            ].map(stat => (
              <div key={stat.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 28, fontWeight: 700,
                  color: T.gold, lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}>
                  {stat.val}
                </div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.16em", textTransform: "uppercase",
                  color: T.textFaint,
                }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: featured player card */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <FeaturedCard signal={featuredSignal} />
        </div>
      </section>

      {/* ══ GOLD RULE ════════════════════════════════════════════════ */}
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px" }}>
        <GoldRule opacity={0.18} />
      </div>

      {/* ══ INTELLIGENCE FEED ════════════════════════════════════════ */}
      {publicSignals.length > 0 && (
        <section style={{ maxWidth: 1440, margin: "0 auto", padding: "72px 32px 64px" }}>
          <Eyebrow>Live Intelligence Feed</Eyebrow>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, gap: 16 }}>
            <h2 style={{ fontSize: "clamp(1.375rem, 2vw, 1.875rem)", color: T.text, margin: 0 }}>
              Latest Signals
            </h2>
            <Link href="/dashboard">
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: T.gold, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
                transition: "color 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = T.goldBright; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = T.gold; }}>
                View All <ChevronRight size={12} />
              </div>
            </Link>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}>
            {publicSignals.map((signal: any) => (
              <SignalTile key={signal.id} signal={signal} />
            ))}
          </div>
        </section>
      )}

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px" }}>
        <GoldRule opacity={0.12} />
      </div>

      {/* ══ HOW IT WORKS ═════════════════════════════════════════════ */}
      <section style={{ maxWidth: 1440, margin: "0 auto", padding: "72px 32px 64px" }}>
        <Eyebrow>Intelligence Pipeline</Eyebrow>
        <h2 style={{ fontSize: "clamp(1.375rem, 2vw, 1.875rem)", color: T.text, marginBottom: 48 }}>
          From signal to edge — in seconds
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 2,
        }}>
          {[
            { n: "01", title: "Signal Ingestion", body: "Beat writers, beat podcasters, and team insiders monitored in real time across 12+ verified sources." },
            { n: "02", title: "Confidence Scoring", body: "Each signal receives a 0–100 confidence score based on source reliability, corroboration, and timing." },
            { n: "03", title: "Verdict Assignment", body: "Signals are classified: Confirmed, Likely, Rumor, or Contradicted — with reasoning you can trust." },
            { n: "04", title: "Action Takeaway", body: "Every signal includes a concrete action step — what to do with this intelligence in your leagues." },
          ].map(step => (
            <div key={step.n} style={{
              background: T.surface1,
              border: "1px solid rgba(202,168,90,0.10)",
              padding: "28px 24px",
              position: "relative",
            }}>
              <div style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 56, fontWeight: 700,
                color: "rgba(202,168,90,0.10)",
                lineHeight: 1,
                position: "absolute", top: 16, right: 20,
                letterSpacing: "-0.04em",
                pointerEvents: "none",
                userSelect: "none",
              }}>
                {step.n}
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700,
                letterSpacing: "0.18em", textTransform: "uppercase",
                color: T.gold, marginBottom: 12,
              }}>
                Step {step.n}
              </div>
              <h3 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 18, fontWeight: 700,
                color: T.text, marginBottom: 12, lineHeight: 1.25,
              }}>
                {step.title}
              </h3>
              <p style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.65, margin: 0 }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px" }}>
        <GoldRule opacity={0.12} />
      </div>

      {/* ══ PRICING ══════════════════════════════════════════════════ */}
      <section style={{ maxWidth: 1440, margin: "0 auto", padding: "72px 32px 64px" }}>
        <Eyebrow>Access Tiers</Eyebrow>
        <h2 style={{ fontSize: "clamp(1.375rem, 2vw, 1.875rem)", color: T.text, marginBottom: 48 }}>
          Choose your edge
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
          maxWidth: 900,
        }}>
          {/* Free tier */}
          <div style={{
            background: T.surface1,
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4,
            padding: "32px 28px",
          }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
              textTransform: "uppercase", color: T.textFaint, marginBottom: 12,
            }}>
              Free
            </div>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 40, fontWeight: 700, color: T.text,
              letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 6,
            }}>
              $0
            </div>
            <div style={{
              fontSize: 14, color: T.textFaint, marginBottom: 28,
            }}>
              Public signals only
            </div>
            <GoldRule opacity={0.10} my={0} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 20 }}>
              {["Latest 3 signals", "Public verdict labels", "Basic confidence scores"].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={14} style={{ color: T.textFaint, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, color: T.textMuted }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pro tier */}
          <div style={{
            background: T.surface1,
            border: `1px solid rgba(202,168,90,0.40)`,
            borderRadius: 4,
            padding: "32px 28px",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Gold top bar */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0,
              height: 3, background: T.gold, pointerEvents: "none",
            }} />
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
                textTransform: "uppercase", color: T.gold, marginBottom: 12,
              }}>
                Pro
              </div>
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase",
                background: "rgba(202,168,90,0.15)",
                color: T.gold,
                border: "1px solid rgba(202,168,90,0.30)",
                padding: "3px 8px", borderRadius: 2,
              }}>
                Most Popular
              </span>
            </div>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 40, fontWeight: 700, color: T.gold,
              letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 6,
            }}>
              $19
            </div>
            <div style={{ fontSize: 14, color: T.textFaint, marginBottom: 28 }}>
              per month
            </div>
            <GoldRule opacity={0.20} my={0} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 20, marginBottom: 28 }}>
              {[
                "Full signal archive",
                "Real-time alerts",
                "All confidence data",
                "Action takeaways",
                "Draft board access",
                "Source leaderboard",
              ].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={14} style={{ color: T.gold, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, color: T.textMuted }}>{f}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate("/pro")}
              className="btn-primary"
              style={{ width: "100%" }}
            >
              Get Pro Access
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px" }}>
        <GoldRule opacity={0.12} />
      </div>

      {/* ══ WAITLIST / REQUEST ACCESS ════════════════════════════════ */}
      <section id="waitlist" style={{ maxWidth: 1440, margin: "0 auto", padding: "72px 32px 80px" }}>
        <div style={{ maxWidth: 560 }}>
          <Eyebrow>Early Access</Eyebrow>
          {waitlistDone ? (
            <div style={{
              background: "rgba(61,174,114,0.08)",
              border: "1px solid rgba(61,174,114,0.25)",
              borderRadius: 4,
              padding: "32px 28px",
              display: "flex", alignItems: "flex-start", gap: 16,
            }}>
              <CheckCircle2 size={22} style={{ color: T.green, flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 20, fontWeight: 700,
                  color: T.text, marginBottom: 8,
                }}>
                  You're on the list.
                </div>
                <p style={{ fontSize: 15, color: T.textMuted, margin: 0, lineHeight: 1.6 }}>
                  We'll reach out when Pro spots open. Watch your inbox.
                </p>
              </div>
            </div>
          ) : (
            <>
              <h2 style={{
                fontSize: "clamp(1.375rem, 2vw, 1.875rem)",
                color: T.text, marginBottom: 12,
              }}>
                Request early access
              </h2>
              <p style={{ fontSize: 16, color: T.textMuted, lineHeight: 1.65, marginBottom: 36 }}>
                Pro spots are limited during the early access period.
                Get on the list and we'll notify you when your access is ready.
              </p>
              <WaitlistForm onSuccess={() => setWaitlistDone(true)} />
            </>
          )}
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════ */}
      <footer style={{
        borderTop: "1px solid rgba(202,168,90,0.14)",
        background: T.surface1,
      }}>
        <div style={{
          maxWidth: 1440, margin: "0 auto",
          padding: "40px 32px",
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", gap: 40,
          flexWrap: "wrap", rowGap: 32,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <LandingLogo />
              <span style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 16, fontWeight: 700,
                color: T.text,
              }}>
                Edge Setter
              </span>
            </div>
            <p style={{ fontSize: 14, color: T.textFaint, maxWidth: 240, lineHeight: 1.6, margin: 0 }}>
              Premium NFL intelligence for fantasy players and analysts.
            </p>
          </div>

          <div style={{ display: "flex", gap: 48, flexWrap: "wrap", rowGap: 24 }}>
            {[
              {
                heading: "Intelligence",
                links: [
                  { label: "Signal Board", href: "/dashboard" },
                  { label: "Draft Board", href: "/draft" },
                  { label: "Sources", href: "/leaderboard" },
                ],
              },
              {
                heading: "Account",
                links: [
                  { label: "Go Pro", href: "/pro" },
                  { label: "Alerts", href: "/alerts" },
                ],
              },
            ].map(col => (
              <div key={col.heading}>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  color: T.textFaint, marginBottom: 16,
                }}>
                  {col.heading}
                </div>
                {col.links.map(link => (
                  <Link key={link.href} href={link.href}>
                    <div style={{
                      fontSize: 15, color: T.textMuted,
                      marginBottom: 10, cursor: "pointer",
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = T.gold; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = T.textMuted; }}>
                      {link.label}
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{
          borderTop: "1px solid rgba(202,168,90,0.08)",
          padding: "18px 32px",
          maxWidth: 1440, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
        }}>
          <span style={{ fontSize: 13, color: T.textFaint }}>
            © 2025 Edge Setter. All rights reserved.
          </span>
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700,
            letterSpacing: "0.16em", textTransform: "uppercase",
            color: T.textFaint,
          }}>
            For informational purposes only
          </span>
        </div>
      </footer>
    </div>
  );
}
