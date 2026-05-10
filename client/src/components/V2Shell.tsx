import { Link, useLocation } from "wouter";
import { useState, createContext, useContext } from "react";
import {
  Home, LayoutGrid, Wrench, Star, List,
  ChevronDown, ChevronRight, Menu, X, Moon, Sun,
} from "lucide-react";
import { ProNavButton, NavLoginButton } from "./ProGate";

/* ═══════════════════════════════════════════════════════════════
   MASTER DESIGN TOKENS — LFL Luxury Sports Intelligence
═══════════════════════════════════════════════════════════════ */
export const T = {
  bg:           "#0C0B09",
  surface1:     "#131110",
  surface2:     "#1A1714",
  surface3:     "#201D19",
  gold:         "#C4A24A",
  goldBright:   "#E0BB6A",
  goldDim:      "rgba(196,162,74,0.15)",
  goldGlow:     "rgba(196,162,74,0.07)",
  goldStrong:   "rgba(196,162,74,0.35)",
  text:         "#EDE5D4",
  textMuted:    "#8A7A62",
  textFaint:    "#4A4235",
  green:        "#3EBA6A",
  greenDim:     "rgba(62,186,106,0.12)",
  cyan:         "#4AA8C8",
  cyanDim:      "rgba(74,168,200,0.10)",
  orange:       "#D98A42",
  danger:       "#D94B4B",
  dangerDim:    "rgba(217,75,75,0.10)",
  border:       "rgba(196,162,74,0.12)",
  borderMid:    "rgba(196,162,74,0.22)",
  borderStrong: "rgba(196,162,74,0.40)",
};

export const SPORT_THEME = {
  NBA: { primary: "#E87C2A", secondary: "#C4A24A", glow: "rgba(232,124,42,0.18)", dim: "rgba(232,124,42,0.08)", label: "rgba(232,124,42,0.22)" },
  MLB: { primary: "#3A8FE0", secondary: "#3EBA6A", glow: "rgba(58,143,224,0.16)", dim: "rgba(58,143,224,0.07)", label: "rgba(58,143,224,0.20)" },
  NFL: { primary: "#C4301A", secondary: "#C4A24A", glow: "rgba(196,48,26,0.18)",  dim: "rgba(196,48,26,0.08)",  label: "rgba(196,48,26,0.22)"  },
  CFB: { primary: "#8844CC", secondary: "#C4A24A", glow: "rgba(136,68,204,0.16)", dim: "rgba(136,68,204,0.07)", label: "rgba(136,68,204,0.20)" },
};

export const ThemeCtx = createContext<boolean>(true);
export function useShellTheme() { return useContext(ThemeCtx); }

export type SportStatus = "LIVE" | "ACTIVE" | "BUILDING" | "OFFSEASON" | "COMING SOON";

const STATUS_STYLE: Record<SportStatus, { bg: string; color: string; dot: string }> = {
  "LIVE":        { bg: "rgba(62,186,106,0.12)",  color: "#3EBA6A", dot: "#3EBA6A" },
  "ACTIVE":      { bg: "rgba(74,168,200,0.10)",  color: "#4AA8C8", dot: "#4AA8C8" },
  "BUILDING":    { bg: "rgba(217,138,66,0.12)",  color: "#D98A42", dot: "#D98A42" },
  "OFFSEASON":   { bg: "rgba(74,66,53,0.20)",    color: "#5A4E3C", dot: "#4A4235" },
  "COMING SOON": { bg: "rgba(74,66,53,0.15)",    color: "#4A4235", dot: "#4A4235" },
};

export function SportBadge({ status }: { status: SportStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 2,
      background: s.bg, color: s.color,
      border: `1px solid ${s.dot}30`,
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block",
        boxShadow: status === "LIVE" ? `0 0 5px ${s.dot}` : "none",
        animation: status === "LIVE" ? "esPulse 2s ease-in-out infinite" : "none",
      }} />
      {status}
    </span>
  );
}

interface SportPillProps {
  sport: "NBA" | "MLB" | "NFL" | "CFB";
  status: SportStatus;
  href: string;
  disabled?: boolean;
  isCurrent?: boolean;
}
function SportPill({ sport, status, href, disabled = false, isCurrent = false }: SportPillProps) {
  const s  = STATUS_STYLE[status];
  const th = SPORT_THEME[sport];
  const inner = (
    <>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: isCurrent ? th.primary : s.dot, display: "inline-block", flexShrink: 0,
        boxShadow: (status === "LIVE" || status === "ACTIVE") ? `0 0 6px ${isCurrent ? th.primary : s.dot}` : "none",
        animation: status === "LIVE" ? "esPulse 2s ease-in-out infinite" : "none",
      }} />
      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: isCurrent ? th.primary : s.color }}>
        {sport}
      </span>
    </>
  );
  const baseStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    minHeight: 32, padding: "0 11px", borderRadius: 2,
    background: isCurrent ? th.dim : s.bg,
    border: `1px solid ${isCurrent ? th.primary + "60" : s.dot + "35"}`,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
    transition: "filter 0.12s, transform 0.1s", textDecoration: "none", userSelect: "none" as const,
  };
  if (disabled) return <span style={baseStyle}>{inner}</span>;
  return (
    <Link href={href}>
      <a style={baseStyle}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.25)"; (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.filter = ""; (e.currentTarget as HTMLAnchorElement).style.transform = ""; }}
      >{inner}</a>
    </Link>
  );
}

const TOP_NAV = [
  { href: "/v2",         label: "Home",    icon: Home       },
  { href: "/v2/nba",     label: "Boards",  icon: LayoutGrid },
  { href: "/v2/tools",   label: "Tools",   icon: Wrench     },
  { href: "/v2/my-edge", label: "My Edge", icon: Star       },
  { href: "/v2/sources", label: "Sources", icon: List       },
];

export const BOARDS_NAV = [
  { href: "/v2/nba", label: "NBA Board", status: "LIVE"   as SportStatus, sport: "NBA" },
  { href: "/v2/mlb", label: "MLB Board", status: "ACTIVE" as SportStatus, sport: "MLB" },
  { href: "/v2/nfl", label: "NFL Board", status: "ACTIVE" as SportStatus, sport: "NFL" },
  { href: "/v2/cfb", label: "CFB Board", status: "ACTIVE" as SportStatus, sport: "CFB" },
];

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Barlow:ital,wght@0,300;0,400;0,500;1,300&display=swap');

  @keyframes esPulse   { 0%,100%{opacity:1} 50%{opacity:0.22} }
  @keyframes esShimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
  @keyframes esGrain   { 0%,100%{transform:translate(0,0)} 10%{transform:translate(-1%,-1%)} 20%{transform:translate(1%,0)} 30%{transform:translate(0,1%)} 40%{transform:translate(-1%,0)} 50%{transform:translate(1%,1%)} 60%{transform:translate(0,-1%)} 70%{transform:translate(-1%,1%)} 80%{transform:translate(1%,-1%)} 90%{transform:translate(-1%,0)} }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  body { background: #0C0B09; color: #EDE5D4; -webkit-font-smoothing: antialiased; }

  body::after {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 9999; opacity: 0.028;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
    background-size: 200px 200px;
    animation: esGrain 0.5s steps(1) infinite;
  }

  .es-chalk-nba {
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(196,162,74,0.18) 39px, rgba(196,162,74,0.18) 40px),
      repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(196,162,74,0.10) 39px, rgba(196,162,74,0.10) 40px);
    background-size: 40px 40px;
  }
  .es-chalk-mlb {
    background-image:
      repeating-linear-gradient(45deg, transparent, transparent 28px, rgba(58,143,224,0.14) 28px, rgba(58,143,224,0.14) 29px),
      repeating-linear-gradient(-45deg, transparent, transparent 28px, rgba(58,143,224,0.10) 28px, rgba(58,143,224,0.10) 29px);
    background-size: 40px 40px;
  }
  .es-chalk-nfl {
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(196,48,26,0.14) 19px, rgba(196,48,26,0.14) 20px);
    background-size: 100% 20px;
  }
  .es-chalk-cfb {
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(136,68,204,0.12) 19px, rgba(136,68,204,0.12) 20px);
    background-size: 100% 20px;
  }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(196,162,74,0.22); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(196,162,74,0.40); }

  .es-nav { transition: background 0.12s, color 0.12s, border-color 0.12s !important; }
  .es-btn { transition: filter 0.12s, transform 0.1s, background 0.15s !important; }
  .es-btn:active { transform: translateY(1px) !important; }
  .shell-board-link:hover { filter: brightness(1.2); }
`;

interface V2ShellProps {
  children: React.ReactNode;
  sport?: "NBA" | "MLB" | "NFL" | "CFB";
}

export function V2Shell({ children, sport }: V2ShellProps) {
  const [darkMode, setDarkMode] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(true);
  const [location] = useLocation();

  const sportTheme = sport ? SPORT_THEME[sport] : null;
  const currentSport = sport ?? null;

  const bg     = darkMode ? T.bg       : "#F5F0E8";
  const surf1  = darkMode ? T.surface1 : "#FFFDF8";
  const txt    = darkMode ? T.text     : "#1A1510";
  const txtM   = darkMode ? T.textMuted : "#5A4E3C";
  const txtF   = darkMode ? T.textFaint : "#8A7A62";
  const goldD  = darkMode ? T.border   : "rgba(196,162,74,0.25)";

  const activeTop = TOP_NAV.find(n => location === n.href || (n.href !== "/v2" && location.startsWith(n.href)));
  const boardsMode = activeTop?.label === "Boards" || location.startsWith("/v2/nba") || location.startsWith("/v2/mlb") || location.startsWith("/v2/nfl") || location.startsWith("/v2/cfb");

  return (
    <div className="flex h-full" style={{ background: bg, color: txt, fontFamily: "'Barlow', sans-serif" }}>
      <style>{GLOBAL_CSS}</style>

      {/* ── SIDEBAR ── */}
      <aside
        className={`${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{
          width: 152, flexShrink: 0,
          background: surf1,
          borderRight: `1px solid ${goldD}`,
          display: "flex", flexDirection: "column",
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50,
          transition: "transform 0.22s ease",
          boxShadow: darkMode ? `inset -1px 0 0 rgba(196,162,74,0.08), 2px 0 24px rgba(0,0,0,0.6)` : "none",
        }}
      >
        {/* ── LOGO LOCKUP ── */}
        <div style={{
          padding: "18px 14px 14px",
          borderBottom: `1px solid ${goldD}`,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.gold}, ${T.goldDim})` }} />
          <img src="/manus-storage/edgesetter-emblem_a9db2400.png" alt="Edge Setter" className="md:hidden" style={{ height: 36, width: "auto" }} />
          <div className="hidden md:flex" style={{ flexDirection: "column", lineHeight: 1, userSelect: "none" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: T.gold, letterSpacing: "0.05em" }}>EDGE</span>
              <span style={{ width: 1, height: 13, background: T.gold, opacity: 0.4, display: "inline-block", margin: "0 3px", alignSelf: "center" }} />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#F5F0E8", letterSpacing: "0.05em" }}>SETTER</span>
            </div>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 8, color: "#555", letterSpacing: "0.2em", textTransform: "uppercase", marginTop: 2 }}>INTELLIGENCE TERMINAL</span>
          </div>
          {sportTheme && (
            <div style={{ height: 1, background: `linear-gradient(90deg, ${sportTheme.primary}80, transparent)`, marginTop: 10 }} />
          )}
        </div>

        {/* ── NAV ── */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "10px 8px 0" }}>
          {TOP_NAV.map(({ href, label, icon: Icon }) => {
            const isActive = location === href || (href !== "/v2" && location.startsWith(href));
            const isBoards = label === "Boards";
            const showSub  = isBoards && boardsMode;

            return (
              <div key={href}>
                <Link href={href} onClick={() => { setMobileOpen(false); if (isBoards) setBoardsOpen(o => !o); }}>
                  <a className="es-nav" style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "9px 10px", marginBottom: 2, borderRadius: 3,
                    borderLeft: `3px solid ${isActive ? T.gold : "transparent"}`,
                    background: isActive ? `linear-gradient(90deg, rgba(196,162,74,0.10), transparent)` : "transparent",
                    color: isActive ? T.gold : txtM,
                    cursor: "pointer", textDecoration: "none", minHeight: 42,
                    boxShadow: isActive ? `inset 0 0 12px rgba(196,162,74,0.06)` : "none",
                  }}
                    onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLAnchorElement).style.background = `rgba(196,162,74,0.05)`; (e.currentTarget as HTMLAnchorElement).style.color = txt; } }}
                    onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = txtM; } }}
                  >
                    <Icon size={15} strokeWidth={isActive ? 2.5 : 1.75} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.65 }} />
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", flex: 1 }}>{label}</span>
                    {isBoards && boardsMode && (boardsOpen ? <ChevronDown size={11} style={{ opacity: 0.45 }} /> : <ChevronRight size={11} style={{ opacity: 0.45 }} />)}
                  </a>
                </Link>

                {showSub && boardsOpen && (
                  <div style={{ marginLeft: 8, marginBottom: 4 }}>
                    {BOARDS_NAV.map(b => {
                      const bActive = location === b.href || location.startsWith(b.href + "/");
                      const s  = STATUS_STYLE[b.status];
                      const th = SPORT_THEME[b.sport as keyof typeof SPORT_THEME];
                      return (
                        <Link key={b.href} href={b.href} onClick={() => setMobileOpen(false)}>
                          <a className="es-nav shell-board-link" style={{
                            display: "flex", alignItems: "center", gap: 7,
                            padding: "8px 10px", marginBottom: 1, borderRadius: 3,
                            borderLeft: `3px solid ${bActive ? th.primary : "transparent"}`,
                            background: bActive ? `linear-gradient(90deg, ${th.primary}14, transparent)` : "transparent",
                            color: bActive ? th.primary : txtM,
                            cursor: "pointer", textDecoration: "none", minHeight: 40,
                          }}
                            onMouseEnter={e => { if (!bActive) { (e.currentTarget as HTMLAnchorElement).style.background = `rgba(196,162,74,0.05)`; (e.currentTarget as HTMLAnchorElement).style.color = txt; } }}
                            onMouseLeave={e => { if (!bActive) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = txtM; } }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: bActive ? th.primary : s.dot, display: "inline-block", flexShrink: 0, boxShadow: bActive ? `0 0 6px ${th.primary}` : "none" }} />
                            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", flex: 1 }}>{b.label}</span>
                            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: bActive ? th.primary : s.color, textTransform: "uppercase", background: bActive ? `${th.primary}15` : `${s.dot}10`, padding: "1px 4px", borderRadius: 2 }}>{b.status}</span>
                          </a>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ margin: "12px 0 8px", borderTop: `1px solid ${goldD}` }} />

          {/* ── PRO CTA ── */}
          <div style={{ padding: "0 2px 12px" }}>
            <div style={{ border: `1px solid ${T.borderStrong}`, borderRadius: 4, background: `linear-gradient(145deg, rgba(196,162,74,0.08), rgba(196,162,74,0.03))`, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.goldDim})` }} />
              <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: `radial-gradient(circle at 100% 0%, rgba(196,162,74,0.12), transparent 70%)`, pointerEvents: "none" }} />
              <div style={{ padding: "14px 12px 12px" }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: "2.5px", color: T.gold, marginBottom: 3, lineHeight: 1 }}>Pro Intelligence</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: txtF, letterSpacing: "0.14em", marginBottom: 11, textTransform: "uppercase", lineHeight: 1.4 }}>Alerts · Full Archive · Multi-Sport</div>
                <Link href="/pro">
                  <button className="es-btn" style={{
                    width: "100%", minHeight: 40,
                    background: `linear-gradient(135deg, ${T.gold} 0%, #8A6A28 50%, ${T.gold} 100%)`,
                    backgroundSize: "200%",
                    color: T.bg, border: "none", borderRadius: 3,
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 16, letterSpacing: "3px", cursor: "pointer",
                    animation: "esShimmer 3s ease infinite",
                    boxShadow: `0 2px 12px rgba(196,162,74,0.25)`,
                  }}>$19 / Month</button>
                </Link>
              </div>
            </div>
          </div>
        </nav>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(0,0,0,0.72)" }} onClick={() => setMobileOpen(false)} />}

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden md:ml-[152px]">

        {/* ── HEADER ── */}
        <header style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 20px", minHeight: 56,
          background: surf1,
          borderBottom: `1px solid ${sportTheme ? sportTheme.primary + "40" : goldD}`,
          position: "sticky", top: 0, zIndex: 30, flexShrink: 0, overflow: "hidden",
        }}>
          {/* Sport accent line — bold 3px */}
          {sportTheme && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${sportTheme.primary} 0%, ${sportTheme.primary}80 40%, transparent 75%)` }} />
          )}
          {!sportTheme && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}60, transparent 60%)` }} />
          )}

          <button className="md:hidden es-btn" onClick={() => setMobileOpen(o => !o)} style={{ color: txtM, background: "none", border: "none", cursor: "pointer", padding: 8, display: "flex", minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 3 }}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Breadcrumb — Bebas Neue page name */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: txtF }}>Edge Setter</span>
            {activeTop && activeTop.href !== "/v2" && (
              <>
                <span style={{ color: txtF, fontSize: 12, opacity: 0.5 }}>›</span>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: "2px", color: sportTheme ? sportTheme.primary : T.gold }}>{currentSport ? `${currentSport} Board` : activeTop.label}</span>
              </>
            )}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <div className="hidden sm:flex" style={{ gap: 5 }}>
              <SportPill sport="NBA" status="LIVE"   href="/v2/nba" isCurrent={currentSport === "NBA"} />
              <SportPill sport="MLB" status="ACTIVE" href="/v2/mlb" isCurrent={currentSport === "MLB"} />
              <SportPill sport="NFL" status="ACTIVE" href="/v2/nfl" isCurrent={currentSport === "NFL"} />
              <SportPill sport="CFB" status="ACTIVE" href="/v2/cfb" isCurrent={currentSport === "CFB"} />
            </div>
            <NavLoginButton />
            <ProNavButton sport={(currentSport as any) ?? "generic"} />
            <button className="es-btn" onClick={() => setDarkMode(d => !d)} style={{
              display: "flex", alignItems: "center", gap: 4, minHeight: 32, padding: "0 10px", borderRadius: 2,
              border: `1px solid ${goldD}`, background: "transparent", color: txtM, cursor: "pointer",
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              {darkMode ? <Moon size={11} /> : <Sun size={11} />}
              <span className="hidden sm:inline">{darkMode ? "Dark" : "Light"}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain" style={{ background: bg }}>
          <ThemeCtx.Provider value={darkMode}>
            {children}
          </ThemeCtx.Provider>
        </main>
      </div>
    </div>
  );
}

export default V2Shell;
