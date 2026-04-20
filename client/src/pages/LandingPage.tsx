/**
 * Edge Setter — LandingPage v5 (Cinematic Unity Pass)
 *
 * Changes from v4:
 * - Unified background: all sections on C.void — no more void/shell alternation bands
 * - Removed freestanding section label headers ("Intelligence Suite", "Access Tiers")
 * - Hero name enlarged (36→44px) — more dominant centerpiece
 * - Section padding compressed throughout — less equal-weight breathing room
 * - Pipeline section: no label row — just the numbered sequence
 * - Waitlist: no GR top rule — h2 heads straight in
 * - Intel grid: tighter gap + reduced top margin
 * - Overall: one unified black/gold board, not a sequence of bands
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type Theme } from "../App";
import { Sun, Moon, ChevronRight, CheckCircle2 } from "lucide-react";

interface Props { theme: Theme; toggleTheme: () => void; }

/* ── palette ───────────────────────────────────────────────────── */
const C = {
  void:       "#080706",
  shell:      "#0C0A08",
  panel:      "#111009",
  lift:       "#181410",

  gold:       "#C9A84C",
  goldBright: "#E2BE6A",
  goldDim:    "#6A5218",
  goldBar:    "#B8932A",

  ivory:      "#F0E8D6",
  ivoryMid:   "#B8AD98",
  ivoryDim:   "#6E6458",
  ivoryFaint: "#242018",

  green:  "#3DAE72",
  greenDim: "#162E20",
  cyan:   "#38A8C8",
  cyanDim:"#0A2A38",
  amber:  "#D4932A",
  amberDim:"#342010",
  red:    "#C04040",
  plum:   "#7850B0",
};

/* ── minimal primitives ─────────────────────────────────────────── */

/** 1px gold rule — use sparingly */
function GR({ my = 0, opacity = 1 }: { my?: number; opacity?: number }) {
  return (
    <div style={{
      height: 1, background: C.gold, opacity,
      margin: `${my}px 0`, flexShrink: 0,
    }} />
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: "50%",
      background: color, display: "inline-block", flexShrink: 0,
    }} />
  );
}

/** Condensed ALL-CAPS label */
function Cap({ children, color = C.ivoryDim, size = 9 }: {
  children: React.ReactNode; color?: string; size?: number;
}) {
  return (
    <span style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: size, fontWeight: 700, letterSpacing: "0.18em",
      textTransform: "uppercase", color,
    }}>
      {children}
    </span>
  );
}

/** Gold filled bar */
function BarRow({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
      <Cap size={8}>{label}</Cap>
      <div style={{ flex: 1, height: 7, background: C.ivoryFaint, position: "relative" }}>
        <div style={{
          position: "absolute", inset: 0,
          width: `${Math.min(100, (value / max) * 100)}%`,
          background: C.goldBar,
        }} />
      </div>
      <span style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 10, fontWeight: 700, color: C.ivory, width: 22, textAlign: "right",
      }}>
        {value}
      </span>
    </div>
  );
}

/** Data row */
function DR({ label, value, accent = C.ivory }: {
  label: string; value: string | number; accent?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      justifyContent: "space-between", padding: "2px 0",
    }}>
      <Cap>{label}</Cap>
      <span style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 10, fontWeight: 700, color: accent,
      }}>
        {value}
      </span>
    </div>
  );
}

/* ── chalk field ─────────────────────────────────────────────────────
   American football field — yard lines, hash marks, end zones.
   viewBox 800×356. Field oriented horizontally (landscape).
   120 total yards: 10 end zone each side + 100 playing field.
   Inner area: x=60..740 (680px wide), y=16..340 (324px tall).
   End zones: left x=60..128, right x=672..740 (68px = 10yds each).
   10-yard lines: 9 internal lines across playing field.
   Hash marks: NFL-style two rows at ~18% and ~82% of field height. */
function ChalkField() {
  const s  = "rgba(255,255,255,0.22)";   // sidelines / boundary
  const yl = "rgba(255,255,255,0.20)";   // 10-yard lines
  const mid = "rgba(255,255,255,0.32)";  // 50-yard midfield line
  const h  = "rgba(255,255,255,0.16)";   // hash marks
  const ez = "rgba(255,255,255,0.09)";   // end-zone fill
  const d  = "rgba(255,255,255,0.13)";   // play diagram

  // Field geometry
  const FL = 60, FR = 740, FT = 16, FB = 340;
  const FH = FB - FT;   // 324
  const EZW = 68;       // end-zone width (10 yards)
  const EL = FL + EZW;  // 128
  const ER = FR - EZW;  // 672

  // Hash mark y positions (NFL: ~18.5% and ~81.5% from top)
  const H1 = FT + FH * 0.185;
  const H2 = FT + FH * 0.815;
  const HW = 7; // hash tick height

  // 10-yard line x positions (9 lines across 100-yard field)
  const tenYardLines = [1,2,3,4,5,6,7,8,9].map(i => EL + i * EZW);
  // 5-yard minor lines (every 34px — half of EZW)
  const step = EZW / 2;
  const fiveYardLines: number[] = [];
  for (let i = 1; i < 20; i++) {
    const x = EL + i * step;
    if (!tenYardLines.includes(x)) fiveYardLines.push(x);
  }

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox="0 0 800 356" preserveAspectRatio="xMidYMid slice" fill="none"
    >
      {/* End zone fills */}
      <rect x={FL} y={FT} width={EZW} height={FH} fill={ez} />
      <rect x={ER} y={FT} width={EZW} height={FH} fill={ez} />

      {/* Outer boundary */}
      <rect x={FL} y={FT} width={FR - FL} height={FH} stroke={s} strokeWidth="1.6" />

      {/* End-zone goal lines */}
      <line x1={EL} y1={FT} x2={EL} y2={FB} stroke={s} strokeWidth="1.5" />
      <line x1={ER} y1={FT} x2={ER} y2={FB} stroke={s} strokeWidth="1.5" />

      {/* 5-yard minor lines (very faint, sideline-to-sideline) */}
      {fiveYardLines.map((x, i) => (
        <line key={`f${i}`} x1={x} y1={FT} x2={x} y2={FB}
          stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
      ))}

      {/* 10-yard lines */}
      {tenYardLines.map((x, i) => (
        <line key={`t${i}`} x1={x} y1={FT} x2={x} y2={FB}
          stroke={yl} strokeWidth="1.0" />
      ))}

      {/* 50-yard midfield line (heavier + brighter) */}
      <line x1={EL + 4.5 * EZW} y1={FT} x2={EL + 4.5 * EZW} y2={FB}
        stroke={mid} strokeWidth="2.0" />

      {/* Hash marks — top row */}
      {[...tenYardLines, ...fiveYardLines, EL, ER].map((x, i) => (
        <line key={`ht${i}`} x1={x} y1={H1 - HW / 2} x2={x} y2={H1 + HW / 2}
          stroke={h} strokeWidth="1.2" />
      ))}

      {/* Hash marks — bottom row */}
      {[...tenYardLines, ...fiveYardLines, EL, ER].map((x, i) => (
        <line key={`hb${i}`} x1={x} y1={H2 - HW / 2} x2={x} y2={H2 + HW / 2}
          stroke={h} strokeWidth="1.2" />
      ))}

      {/* Goal post silhouettes — uprights in end zones */}
      {/* Left upright */}
      <line x1={FL + 12} y1={FT + FH * 0.36} x2={FL + 12} y2={FT + FH * 0.64}
        stroke="rgba(255,255,255,0.26)" strokeWidth="1.3" />
      <line x1={FL + 4}  y1={FT + FH * 0.36} x2={FL + 20} y2={FT + FH * 0.36}
        stroke="rgba(255,255,255,0.26)" strokeWidth="1.3" />
      {/* Right upright */}
      <line x1={FR - 12} y1={FT + FH * 0.36} x2={FR - 12} y2={FT + FH * 0.64}
        stroke="rgba(255,255,255,0.26)" strokeWidth="1.3" />
      <line x1={FR - 20} y1={FT + FH * 0.36} x2={FR - 4}  y2={FT + FH * 0.36}
        stroke="rgba(255,255,255,0.26)" strokeWidth="1.3" />

      {/* Play diagram — route tree overlay */}
      <path d="M 200 178 Q 280 118 362 148" stroke={d} strokeWidth="1.4" strokeDasharray="7 5" />
      <path d="M 362 148 L 374 138" stroke={d} strokeWidth="1.4" />
      <path d="M 600 178 Q 520 238 444 210" stroke={d} strokeWidth="1.4" strokeDasharray="7 5" />
      <path d="M 444 210 L 436 222" stroke={d} strokeWidth="1.4" />
      <path d="M 158 292 Q 228 240 308 264" stroke={d} strokeWidth="1" strokeDasharray="5 4" />
      <path d="M 642 264 Q 572 240 502 258" stroke={d} strokeWidth="1" strokeDasharray="5 4" />
      <line x1="178" y1="278" x2="192" y2="292" stroke={d} strokeWidth="1" />
      <line x1="192" y1="278" x2="178" y2="292" stroke={d} strokeWidth="1" />
      <line x1="616" y1="250" x2="630" y2="264" stroke={d} strokeWidth="1" />
      <line x1="630" y1="250" x2="616" y2="264" stroke={d} strokeWidth="1" />
    </svg>
  );
}

/* ── mini chalk diagram ──────────────────────────────────────────────
   American football field miniature — same structure at 200×120. */
function MiniField() {
  const s = "rgba(255,255,255,0.24)";
  const h = "rgba(255,255,255,0.16)";
  const d = "rgba(255,255,255,0.15)";
  // viewBox 200×120
  // Outer: 5,5 → 195,115 (190×110)
  // End zones: left 5..23, right 177..195 (18px = 10yds)
  // 10-yard lines: every 15.4px across 154px playing field
  const ezW = 18;
  const EL = 5 + ezW;   // 23
  const ER = 195 - ezW; // 177
  const FW = ER - EL;   // 154
  const tenYds = [1,2,3,4,5,6,7,8,9].map(i => EL + i * (FW / 10));
  const H1 = 5 + 110 * 0.185;
  const H2 = 5 + 110 * 0.815;
  return (
    <svg viewBox="0 0 200 120" fill="none" style={{ width: "100%", height: "100%", display: "block" }}>
      {/* End zone fills */}
      <rect x="5" y="5" width={ezW} height="110" fill="rgba(255,255,255,0.08)" />
      <rect x={195 - ezW} y="5" width={ezW} height="110" fill="rgba(255,255,255,0.08)" />
      {/* Outer boundary */}
      <rect x="5" y="5" width="190" height="110" stroke={s} strokeWidth="1.2" />
      {/* Goal lines */}
      <line x1={EL} y1="5" x2={EL} y2="115" stroke={s} strokeWidth="1.0" />
      <line x1={ER} y1="5" x2={ER} y2="115" stroke={s} strokeWidth="1.0" />
      {/* 10-yard lines */}
      {tenYds.map((x, i) => (
        <line key={i} x1={x} y1="5" x2={x} y2="115"
          stroke={i === 4 ? "rgba(255,255,255,0.28)" : s}
          strokeWidth={i === 4 ? "1.4" : "0.7"} />
      ))}
      {/* Hash marks top */}
      {tenYds.map((x, i) => (
        <line key={`ht${i}`} x1={x} y1={H1 - 3} x2={x} y2={H1 + 3} stroke={h} strokeWidth="1.0" />
      ))}
      {/* Hash marks bottom */}
      {tenYds.map((x, i) => (
        <line key={`hb${i}`} x1={x} y1={H2 - 3} x2={x} y2={H2 + 3} stroke={h} strokeWidth="1.0" />
      ))}
      {/* Play diagram */}
      <path d="M 48 58 Q 76 28 116 44" stroke={d} strokeWidth="1.4" strokeDasharray="5 4" />
      <path d="M 116 44 L 123 37" stroke={d} strokeWidth="1.4" />
    </svg>
  );
}

function Logo({ small = false }: { small?: boolean }) {
  const sz = small ? 22 : 26;
  return (
    <svg width={sz} height={sz} viewBox="0 0 30 30" fill="none" aria-label="Edge Setter">
      <rect width="30" height="30" rx="2" fill={C.panel} stroke={C.gold} strokeWidth="0.8" />
      <rect x="6" y="7"  width="18" height="1.5" rx="0.4" fill={C.gold} />
      <rect x="6" y="13" width="12" height="1.5" rx="0.4" fill={C.gold} />
      <rect x="6" y="19" width="18" height="1.5" rx="0.4" fill={C.gold} />
      <rect x="20" y="13" width="4"  height="1.5" rx="0.4" fill={C.cyan} />
    </svg>
  );
}

/* ══ SIGNAL TILE ROW ════════════════════════════════════════════════
   Ghost numbers at 0.28 — intentionally visible, LFL-exact         */
function SignalTileRow() {
  const tiles = [
    { num: "15", player: "T. BASS",     team: "BUF · K",  conf: "CONF",   pct: "92%", dot: C.green, sc: C.green },
    { num: "1",  player: "P. MAHOMES",  team: "KC · QB",  conf: "CONF",   pct: "92%", dot: C.green, sc: C.green },
    { num: "10", player: "D. ADAMS",    team: "LV · WR",  conf: "LIKELY", pct: "75%", dot: C.amber, sc: C.amber },
    { num: "4",  player: "D. PRESCOTT", team: "DAL · QB", conf: "RUMOR",  pct: "61%", dot: C.plum,  sc: C.plum  },
    { num: "11", player: "T. HILL",     team: "MIA · WR", conf: "CONF",   pct: "88%", dot: C.green, sc: C.green },
    { num: "87", player: "T. KELCE",    team: "KC · TE",  conf: "CONF",   pct: "96%", dot: C.green, sc: C.green },
  ];
  return (
    <div className="es-tile-row" style={{
      display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1,
    }}>
      {tiles.map(({ num, player, team, conf, pct, dot, sc }) => (
        <div key={player} style={{
          position: "relative", overflow: "hidden",
          background: C.panel,
          border: `1px solid ${C.gold}40`,
          padding: "9px 8px 7px",
        }}>
          {/* Ghost jersey number */}
          <div style={{
            position: "absolute", right: 2, top: -4,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 48, fontWeight: 900,
            color: `${C.gold}47`,   // ~28%
            lineHeight: 1, pointerEvents: "none", userSelect: "none",
          }}>
            {num}
          </div>
          <p style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
            textTransform: "uppercase", color: C.ivory,
            margin: "0 0 1px", position: "relative", zIndex: 1,
          }}>
            {player}
          </p>
          <p style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 8, letterSpacing: "0.10em", textTransform: "uppercase",
            color: C.ivoryDim, margin: "0 0 5px",
            position: "relative", zIndex: 1,
          }}>
            {team}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative", zIndex: 1 }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, color: sc,
            }}>
              {conf}:
            </span>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, color: C.goldBright,
            }}>
              {pct}
            </span>
            <div style={{ marginLeft: "auto" }}>
              <Dot color={dot} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══ MAIN COMPONENT ════════════════════════════════════════════════ */
export default function LandingPage({ theme, toggleTheme }: Props) {
  const [email, setEmail]  = useState("");
  const [name, setName]    = useState("");
  const [role, setRole]    = useState("bettor");
  const { toast }          = useToast();
  const qc                 = useQueryClient();

  const { data: countData } = useQuery({
    queryKey: ["/api/waitlist/count"],
    queryFn: () => apiRequest("GET", "/api/waitlist/count").then(r => r.json()),
  });

  const waitlistMutation = useMutation({
    mutationFn: (data: { email: string; name: string; role: string }) =>
      apiRequest("POST", "/api/waitlist", data).then(r => {
        if (!r.ok) return r.json().then(e => { throw new Error(e.error); });
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "Access request received.", description: "We'll notify you when Edge Setter launches." });
      setEmail(""); setName("");
      qc.invalidateQueries({ queryKey: ["/api/waitlist/count"] });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    waitlistMutation.mutate({ email, name, role });
  };

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div
      data-testid="landing-page"
      style={{ minHeight: "100vh", background: C.void, color: C.ivory,
        fontFamily: "'Playfair Display', Georgia, serif" }}
    >
      <style>{`
        @media (max-width: 600px) {
          .es-hero-outer   { padding: 0 10px !important; }
          .es-dossier      { grid-template-columns: 1fr !important; }
          .es-stat-tiles   { display: none !important; }
          .es-brief-row    { grid-template-columns: 1fr !important; }
          .es-tile-row     { grid-template-columns: repeat(3, 1fr) !important; }
          .es-intel-grid   { grid-template-columns: 1fr !important; }
          .es-pipe-row     { grid-template-columns: repeat(4, 1fr) !important; }
          .es-tiers-grid   { grid-template-columns: 1fr !important; }
          .es-waitlist-grid{ grid-template-columns: 1fr !important; }
          .es-tagline      { display: none !important; }
        }
        @media (min-width: 601px) and (max-width: 900px) {
          .es-tile-row     { grid-template-columns: repeat(3, 1fr) !important; }
          .es-intel-grid   { grid-template-columns: repeat(2, 1fr) !important; }
          .es-pipe-row     { grid-template-columns: repeat(4, 1fr) !important; }
          .es-waitlist-grid{ grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ══ HEADER ══════════════════════════════════════════════════ */}
      <header style={{
        background: C.shell,
        borderBottom: `1px solid ${C.gold}`,
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto", padding: "0 20px",
          height: 46, display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Logo />
            <div>
              <p style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 14, fontWeight: 700, letterSpacing: "0.22em",
                textTransform: "uppercase", color: C.ivory, margin: 0, lineHeight: 1,
              }}>
                Edge Setter<span style={{ color: C.gold, marginLeft: 2 }}>.</span>
              </p>
              <p style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 7, letterSpacing: "0.20em", textTransform: "uppercase",
                color: C.ivoryDim, margin: 0, marginTop: 2,
              }}>
                NFL Intelligence System
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Dot color={C.green} />
            <Cap color={C.ivoryDim} size={8}>Signal Feed Active</Cap>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={toggleTheme}
              data-testid="button-theme-toggle-landing"
              style={{ background: "none", border: "none", color: C.ivoryDim, cursor: "pointer", padding: 3 }}
            >
              {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
            </button>
            <Link href="/signals">
              <span data-testid="button-view-signal-board" style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase",
                color: C.ivoryDim, cursor: "pointer",
              }}>
                Dashboard
              </span>
            </Link>
            <button
              onClick={scrollTo("waitlist")}
              data-testid="button-get-access"
              style={{
                background: "none", border: `1px solid ${C.gold}`,
                color: C.gold,
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
                padding: "5px 12px", cursor: "pointer",
              }}
            >
              Request Access
            </button>
          </div>
        </div>
      </header>

      {/* ══ HERO ════════════════════════════════════════════════════
          Full-width field card — the dominant centerpiece.
          No separate stat column. Hero carries all identity.        */}
      <section style={{ background: C.void, paddingBottom: 0 }}>
        <div className="es-hero-outer" style={{ maxWidth: 1100, margin: "0 auto", padding: "4px 20px 0" }}>

          {/* ── Main field card — full width ───────────────────── */}
          <div style={{
            position: "relative", overflow: "hidden",
            border: `1px solid ${C.gold}`,
            borderTopWidth: 2,
            background: C.shell,
          }}>
            <ChalkField />

            {/* Source tag + live badge — floats at top */}
            <div style={{
              position: "relative", zIndex: 2,
              padding: "12px 16px 0",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  background: C.cyanDim, border: `1px solid ${C.cyan}44`,
                  color: C.cyan,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 8, fontWeight: 700, letterSpacing: "0.18em",
                  textTransform: "uppercase", padding: "2px 7px",
                }}>
                  T1 · Ian Rapaport
                </span>
                <Cap color={C.ivoryDim} size={8}>via NFL Network</Cap>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Dot color={C.green} />
                <Cap color={C.green} size={8}>Live</Cap>
              </div>
            </div>

            {/* ── Dossier row: name block + 3 stat tiles ───────── */}
            <div
              className="es-dossier"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                position: "relative", zIndex: 2,
                padding: "16px 20px 18px",
              }}
            >
              {/* Name block — no border, no frame. Text on field. */}
              <div style={{ position: "relative" }}>
                {/* Gold initial — 28% opacity */}
                <div style={{
                  position: "absolute", right: 0, top: -8,
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 148, fontWeight: 900,
                  color: `${C.gold}47`,
                  lineHeight: 1, pointerEvents: "none", userSelect: "none",
                  letterSpacing: "-0.05em",
                }}>
                  M
                </div>
                <div style={{ position: "relative", zIndex: 1 }}>
                  <p style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: 44, fontWeight: 900, color: C.goldBright,
                    margin: "0 0 0px", lineHeight: 1.0, letterSpacing: "-0.01em",
                  }}>
                    MAHOMES,
                  </p>
                  <p style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: 44, fontWeight: 900, color: C.ivory,
                    margin: "0 0 8px", lineHeight: 1.0,
                  }}>
                    Patrick
                  </p>
                  <Cap color={C.goldBright} size={10}>QB · KC CHIEFS</Cap>
                </div>
              </div>

              {/* 3 stat tiles — compact, gold-bordered squares */}
              <div className="es-stat-tiles" style={{
                display: "flex", flexDirection: "column", gap: 3, minWidth: 90,
              }}>
                {[
                  { v: "92%",  l: "Confidence", dot: C.red   },
                  { v: "CONF", l: "Verdict",    dot: C.green },
                  { v: "T1",   l: "Src Tier",   dot: C.gold  },
                ].map(({ v, l, dot }) => (
                  <div key={l} style={{
                    border: `1px solid ${C.gold}`,
                    background: `${C.panel}CC`,
                    padding: "7px 10px", textAlign: "center",
                  }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 2 }}>
                      <Dot color={dot} />
                    </div>
                    <p style={{
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: 22, fontWeight: 900, color: C.ivory,
                      margin: "0 0 1px", lineHeight: 1,
                    }}>
                      {v}
                    </p>
                    <Cap size={8}>{l}</Cap>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Two brief columns — no individual borders ────── */}
            <div
              className="es-brief-row"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                position: "relative", zIndex: 2,
                borderTop: `1px solid ${C.gold}55`,
              }}
            >
              {/* LEFT: Signal Brief */}
              <div style={{ padding: "10px 14px 12px", borderRight: `1px solid ${C.gold}40` }}>
                <GR opacity={0.7} />
                <p style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.13em",
                  textTransform: "uppercase", color: C.ivory,
                  margin: "7px 0 6px", lineHeight: 1.2,
                }}>
                  Signal Brief: Injury Status
                </p>
                <DR label="Practice"  value="Limited" accent={C.amber} />
                <DR label="High Risk" value="True"    accent={C.red}   />
                <DR label="Impact"    value="Playoff" accent={C.ivory} />
                <div style={{ marginTop: 8, height: 56, overflow: "hidden", opacity: 0.7 }}>
                  <MiniField />
                </div>
              </div>

              {/* RIGHT: Source Check */}
              <div style={{ padding: "10px 14px 12px" }}>
                <GR opacity={0.7} />
                <p style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.13em",
                  textTransform: "uppercase", color: C.ivory,
                  margin: "7px 0 6px", lineHeight: 1.2,
                }}>
                  Source Check: Verification
                </p>
                <DR label="Support"        value="3"   />
                <DR label="Contradictions" value="0"   accent={C.green} />
                <DR label="Lead Time"      value="42m" accent={C.cyan}  />
                <div style={{ marginTop: 8 }}>
                  <GR opacity={0.3} />
                  <div style={{ marginTop: 6 }}>
                    <BarRow label="SRC" value={90} />
                    <BarRow label="VER" value={92} />
                    <BarRow label="INJ" value={75} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Signal tile row — directly below, single GR above ── */}
          <div style={{ marginTop: 2 }}>
            <SignalTileRow />
          </div>

        </div>
      </section>

      {/* ══ INTEL ═══════════════════════════════════════════════════
          No individual module boxes — plain type grid              */}
      <section style={{ background: C.void, paddingTop: 0 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 20px 14px" }}>

          <div
            className="es-intel-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
              marginTop: 4,
            }}
          >
            {intelModules.map((m, i) => (
              <div
                key={m.title}
                data-testid={`feature-${m.title.toLowerCase().replace(/\s+/g, "-")}`}
                style={{ paddingBottom: 4 }}
              >
                {/* Accent dot + category */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                  <Dot color={moduleAccents[i % moduleAccents.length]} />
                  <Cap size={8}>{m.category}</Cap>
                </div>
                {/* Title */}
                <p style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 14, fontWeight: 700, color: C.ivory,
                  margin: "0 0 5px", lineHeight: 1.25,
                }}>
                  {m.title}
                </p>
                {/* Fine rule */}
                <div style={{ height: 1, background: C.ivoryFaint, marginBottom: 6 }} />
                {/* Description */}
                <p style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, color: C.ivoryDim,
                  margin: "0 0 8px", lineHeight: 1.4,
                }}>
                  {m.desc}
                </p>
                {m.metric && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: 16, fontWeight: 900,
                      color: moduleAccents[i % moduleAccents.length],
                    }}>
                      {m.metric.value}
                    </span>
                    <Cap size={8}>{m.metric.label}</Cap>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PIPELINE ════════════════════════════════════════════════
          Bare numbered sequence — no individual boxes              */}
      <section style={{ background: C.void }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 20px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <div style={{ width: 18, height: 1, background: C.gold, opacity: 0.4 }} />
            <Cap color={C.ivoryDim} size={8}>7-agent verification chain · every claim processed before the feed</Cap>
          </div>
          <div
            className="es-pipe-row"
            style={{
              display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
              gap: 1,
            }}
          >
            {pipeline.map((s, i) => (
              <div
                key={s.name}
                style={{
                  padding: "8px 8px 7px",
                  background: i === pipeline.length - 1 ? C.greenDim : "transparent",
                  borderTop: `2px solid ${i === pipeline.length - 1 ? C.green : C.goldDim}`,
                  textAlign: "center",
                }}
              >
                <p style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 14, fontWeight: 900,
                  color: i === pipeline.length - 1 ? C.green : C.gold,
                  margin: "0 0 2px",
                }}>
                  {i + 1}
                </p>
                <Cap
                  color={i === pipeline.length - 1 ? C.green : C.ivory}
                  size={9}
                >
                  {s.name}
                </Cap>
                <p style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 8, color: C.ivoryDim, margin: "2px 0 0", lineHeight: 1.3,
                }}>
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ ACCESS TIERS ════════════════════════════════════════════
          Two clean panels — minimal internal chrome                */}
      <section style={{ background: C.void }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 20px 14px" }}>
          <div
            className="es-tiers-grid"
            style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 2, marginTop: 0, maxWidth: 620,
            }}
          >
            {/* Free tier */}
            <div
              data-testid="pricing-free"
              style={{
                border: `1px solid ${C.goldDim}`,
                background: C.shell,
                padding: "14px 14px 12px",
              }}
            >
              <Cap size={8} color={C.ivoryDim}>Tier 01</Cap>
              <GR my={6} opacity={0.3} />
              <p style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 12, fontWeight: 700, color: C.ivoryDim, margin: "0 0 2px",
              }}>
                Signal Board
              </p>
              <p style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 26, fontWeight: 900, color: C.ivory, margin: "0 0 10px", lineHeight: 1,
              }}>
                Free
              </p>
              {["Live signal feed", "Injury intel", "Source leaderboard", "Draft board"].map(f => (
                <div key={f} style={{ display: "flex", gap: 6, alignItems: "center", padding: "2px 0" }}>
                  <Dot color={C.ivoryDim} />
                  <Cap size={9} color={C.ivoryMid}>{f}</Cap>
                </div>
              ))}
              <button
                onClick={scrollTo("waitlist")}
                data-testid="button-pricing-free-cta"
                style={{
                  marginTop: 10, width: "100%",
                  background: "none", border: `1px solid ${C.ivoryDim}`,
                  color: C.ivoryDim,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
                  textTransform: "uppercase", padding: "7px", cursor: "pointer",
                }}
              >
                Get Free Access
              </button>
            </div>

            {/* Pro tier */}
            <div
              data-testid="pricing-pro"
              style={{
                border: `1px solid ${C.gold}`,
                borderTopWidth: 2,
                background: C.lift,
                padding: "14px 14px 12px",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Cap size={8} color={C.ivoryDim}>Tier 02</Cap>
                <span style={{
                  background: C.amberDim, border: `1px solid ${C.goldDim}`,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 7, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                  color: C.goldBright, padding: "2px 5px",
                }}>
                  PRO
                </span>
              </div>
              <GR my={6} opacity={0.4} />
              <p style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 12, fontWeight: 700, color: C.gold, margin: "0 0 2px",
              }}>
                Pro Intelligence
              </p>
              <p style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 26, fontWeight: 900, color: C.ivory, margin: "0 0 10px", lineHeight: 1,
              }}>
                $19/mo
              </p>
              {["All Signal Board", "Priority alerts", "Bettor verdicts", "Fantasy scoring", "Full archive"].map(f => (
                <div key={f} style={{ display: "flex", gap: 6, alignItems: "center", padding: "2px 0" }}>
                  <Dot color={C.cyan} />
                  <Cap size={9} color={C.ivoryMid}>{f}</Cap>
                </div>
              ))}
              <button
                onClick={scrollTo("waitlist")}
                data-testid="button-pricing-pro-cta"
                style={{
                  marginTop: 10, width: "100%",
                  background: C.gold, border: "none",
                  color: C.void,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
                  textTransform: "uppercase", padding: "7px", cursor: "pointer",
                }}
              >
                Request Pro Access
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ══ WAITLIST ════════════════════════════════════════════════
          Editorial open composition — the conversion centerpiece   */}
      <section id="waitlist" style={{ background: C.void }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 24px" }}>
          <div style={{ height: 1, background: C.gold, opacity: 0.25, marginBottom: 22 }} />
          <div
            className="es-waitlist-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 300px",
              gap: 32, marginTop: 0,
            }}
          >
            {/* Left — editorial copy, open, no boxes */}
            <div>
              <h2 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 38, fontWeight: 900, fontStyle: "italic",
                color: C.ivory, margin: "0 0 6px", letterSpacing: "-0.02em", lineHeight: 1.05,
              }}>
                Request entry.
              </h2>
              <p style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, letterSpacing: "0.06em", color: C.ivoryMid,
                margin: "0 0 20px", maxWidth: 360, lineHeight: 1.5,
              }}>
                Early members access the full verified-signal workflow before public rollout.
                Founding tier includes Pro features at no cost.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { dot: C.green, label: "VERIFIED SIGNALS",    desc: "Scored · human-reviewed · actionable" },
                  { dot: C.cyan,  label: "SOURCE TELEMETRY",    desc: "Track accuracy across every reporter" },
                  { dot: C.gold,  label: "PRO ALERTS INCLUDED", desc: "Founding tier at no extra cost" },
                ].map(({ dot, label, desc }) => (
                  <div key={label} style={{
                    display: "flex", gap: 10,
                    borderLeft: `2px solid ${dot}`, paddingLeft: 10,
                  }}>
                    <div>
                      <Cap color={dot} size={9}>{label}</Cap>
                      <br />
                      <Cap color={C.ivoryDim} size={9}>{desc}</Cap>
                    </div>
                  </div>
                ))}
              </div>
              {countData?.count > 0 && (
                <p style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase",
                  color: C.ivoryDim, margin: "16px 0 0",
                }} data-testid="waitlist-count">
                  <span style={{ color: C.goldBright, fontWeight: 700 }}>{countData.count}</span> access requests filed
                </p>
              )}
            </div>

            {/* Right — clean form, gold top border only */}
            <div style={{
              borderTop: `2px solid ${C.gold}`,
              paddingTop: 14,
            }}>
              <form
                onSubmit={handleSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 7 }}
                data-testid="waitlist-form"
              >
                {[
                  { type: "text",  placeholder: "Name (optional)",  val: name,  set: setName,  tid: "input-waitlist-name",  req: false },
                  { type: "email", placeholder: "Email address *",  val: email, set: setEmail, tid: "input-waitlist-email", req: true  },
                ].map(f => (
                  <input
                    key={f.tid}
                    type={f.type}
                    placeholder={f.placeholder}
                    value={f.val}
                    onChange={e => f.set(e.target.value)}
                    required={f.req}
                    data-testid={f.tid}
                    style={{
                      background: C.void,
                      border: `1px solid ${C.ivoryFaint}`,
                      color: C.ivory,
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 11, letterSpacing: "0.06em",
                      padding: "8px 10px", outline: "none",
                    }}
                  />
                ))}
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  data-testid="select-waitlist-role"
                  style={{
                    background: C.void,
                    border: `1px solid ${C.ivoryFaint}`,
                    color: C.ivoryMid,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, letterSpacing: "0.06em",
                    padding: "8px 10px", outline: "none",
                  }}
                >
                  <option value="bettor">Sports Bettor</option>
                  <option value="fantasy">Fantasy Player</option>
                  <option value="both">Both</option>
                  <option value="media">Media / Analyst</option>
                </select>
                <button
                  type="submit"
                  disabled={waitlistMutation.isPending}
                  data-testid="button-waitlist-submit"
                  style={{
                    background: C.gold, border: "none", color: C.void,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
                    textTransform: "uppercase", padding: "10px", cursor: "pointer",
                    opacity: waitlistMutation.isPending ? 0.6 : 1,
                  }}
                >
                  {waitlistMutation.isPending ? "Submitting..." : "Submit Access Request"}
                </button>
              </form>
              {waitlistMutation.isSuccess && (
                <div style={{
                  marginTop: 10, padding: "7px 10px",
                  background: `${C.green}18`, border: `1px solid ${C.green}44`,
                  display: "flex", alignItems: "center", gap: 6,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 9, color: C.green,
                }} data-testid="text-waitlist-success">
                  <CheckCircle2 size={10} /> Access request received.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════ */}
      <footer style={{
        background: C.shell,
        borderTop: `1px solid ${C.gold}40`,
        padding: "11px 20px",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Logo small />
            <p style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.20em",
              textTransform: "uppercase", color: C.ivory, margin: 0,
            }}>
              Edge Setter<span style={{ color: C.gold }}>.</span>
            </p>
          </div>
          <p style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase",
            color: C.ivoryFaint, margin: 0,
          }}>
            © 2026 Edge Setter · For informational purposes only
          </p>
          <div style={{ display: "flex", gap: 18 }}>
            {[
              { label: "Signal Board", href: "/signals" },
              { label: "Sources",   href: "/leaderboard" },
              { label: "Draft",     href: "/draft" },
            ].map(({ label, href }) => (
              <Link key={label} href={href}>
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase",
                  color: C.ivoryDim, cursor: "pointer",
                }}>
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ══ DATA ══════════════════════════════════════════════════════════ */
const moduleAccents = [C.cyan, C.amber, C.green, C.plum, C.gold, C.cyan];

const intelModules = [
  { category: "Verification",  title: "Multi-Source Verification",  desc: "Every claim cross-referenced against official sources, beat reporters, and wire services before a verdict is issued.", metric: { value: "3+",   label: "checks per claim"    } },
  { category: "Injury Intel",  title: "Real-Time Injury Detection", desc: "QB, RB, WR updates scored for fantasy and betting impact within minutes. High-risk flags trigger human review.",      metric: { value: "<2m",  label: "detection time"      } },
  { category: "Trust Scoring", title: "Source Trust Scoring",       desc: "Every source earns a dynamic reliability score based on accuracy rate, speed, and false positive frequency.",           metric: { value: "88%",  label: "top-tier accuracy"   } },
  { category: "Draft Intel",   title: "Draft Intel Board",           desc: "NFL Draft movement, combine performance, and team-interest signals in one ranked, scored view.",                        metric: { value: "12+",  label: "sources"             } },
  { category: "Pro Delivery",  title: "Pro Email Alerts",            desc: "Priority delivery for confirmed and likely signals matching your interests. Bettor and fantasy modes.",                 metric: { value: "50+",  label: "verdicts/day"        } },
  { category: "QA Control",    title: "Admin Review Queue",          desc: "High-risk claims — QB injuries, first-round picks, head coaching changes — require editor sign-off before publish.",   metric: { value: "100%", label: "high-risk reviewed"  } },
];

const pipeline = [
  { name: "Scout",    desc: "Ingests wire feeds" },
  { name: "Cluster",  desc: "Groups duplicates" },
  { name: "Retrieve", desc: "Fetches evidence" },
  { name: "Verify",   desc: "Issues verdict" },
  { name: "Score",    desc: "Updates trust" },
  { name: "Publish",  desc: "Creates alerts" },
  { name: "QA",       desc: "Validates all" },
];
