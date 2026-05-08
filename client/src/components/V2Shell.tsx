import { Link, useLocation } from "wouter";
import { useState, createContext, useContext } from "react";
import {
  Home, LayoutGrid, Wrench, Star, List,
  ChevronDown, ChevronRight, Menu, X, Moon, Sun,
} from "lucide-react";
import { ProNavButton, NavLoginButton } from "./ProGate";

/* ═══════════════════════════════════════════════════════════════
   MASTER DESIGN TOKENS — LFL Luxury Sports Intelligence
   Near-black with olive undertone. Warm luxury gold.
   Each sport owns its color temperature.
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

/* ── Sport color themes — each sport has its own personality ── */
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
        boxShadow: (status === "LIVE" || status === "ACTIVE") ? `0 0 5px ${isCurrent ? th.primary : s.dot}` : "none",
        animation: status === "LIVE" ? "esPulse 2s ease-in-out infinite" : "none",
      }} />
      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: isCurrent ? th.primary : s.color }}>
        {sport}
      </span>
    </>
  );
  const baseStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    minHeight: 30, padding: "0 10px", borderRadius: 2,
    background: isCurrent ? th.dim : s.bg,
    border: `1px solid ${isCurrent ? th.primary + "50" : s.dot + "35"}`,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
    transition: "filter 0.12s, transform 0.1s", textDecoration: "none", userSelect: "none" as const,
  };
  if (disabled) return <span style={baseStyle}>{inner}</span>;
  return (
    <Link href={href}>
      <a style={baseStyle}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.2)"; (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)"; }}
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
  @keyframes esShimmer { 0%{background-position:0%} 50%{background-position:100%} 100%{background-position:0%} }
  @keyframes esFadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes esGrain   { 0%{transform:translate(0,0)} 25%{transform:translate(-1%,-1%)} 50%{transform:translate(1%,0)} 75%{transform:translate(0,1%)} 100%{transform:translate(-1%,0)} }
  @keyframes esTicker  { from{transform:translateX(0)} to{transform:translateX(-50%)} }
  @keyframes esGlow    { 0%,100%{opacity:0.6} 50%{opacity:1} }

  [data-theme="dark"]::before {
    content:''; position:fixed; inset:0; pointer-events:none; z-index:9999; opacity:0.03;
    background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E");
    background-size:220px; animation:esGrain 9s steps(8) infinite;
  }

  .es-chalk-nba {
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 500'%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1.8' stroke-dasharray='6,5' x='24' y='24' width='652' height='452' rx='4'/%3E%3Cellipse fill='none' stroke='%23EDE5D4' stroke-width='1.4' stroke-dasharray='5,6' cx='350' cy='250' rx='95' ry='95'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.4' stroke-dasharray='5,5' x1='350' y1='24' x2='350' y2='476'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1.4' stroke-dasharray='5,5' x='24' y='150' width='140' height='200'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1.4' stroke-dasharray='5,5' x='536' y='150' width='140' height='200'/%3E%3Cellipse fill='none' stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,7' cx='350' cy='250' rx='26' ry='26'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1' stroke-dasharray='3,5' x='24' y='185' width='50' height='130' rx='2'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1' stroke-dasharray='3,5' x='626' y='185' width='50' height='130' rx='2'/%3E%3C/svg%3E");
    background-size:cover; background-position:center;
  }
  .es-chalk-mlb {
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 600'%3E%3Cellipse fill='none' stroke='%23EDE5D4' stroke-width='1.6' stroke-dasharray='5,5' cx='350' cy='420' rx='260' ry='210'/%3E%3Cpolygon fill='none' stroke='%23EDE5D4' stroke-width='2' stroke-dasharray='5,4' points='350,100 530,280 350,460 170,280'/%3E%3Ccircle fill='%23EDE5D4' r='9' cx='350' cy='100' opacity='0.55'/%3E%3Ccircle fill='%23EDE5D4' r='9' cx='530' cy='280' opacity='0.55'/%3E%3Ccircle fill='%23EDE5D4' r='9' cx='350' cy='460' opacity='0.55'/%3E%3Ccircle fill='%23EDE5D4' r='9' cx='170' cy='280' opacity='0.55'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.4' stroke-dasharray='4,4' x1='350' y1='460' x2='255' y2='560'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.4' stroke-dasharray='4,4' x1='350' y1='460' x2='445' y2='560'/%3E%3C/svg%3E");
    background-size:cover; background-position:center 30%;
  }
  .es-chalk-nfl {
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 450'%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='2' stroke-dasharray='6,5' x='24' y='24' width='752' height='402'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='98' y1='24' x2='98' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='173' y1='24' x2='173' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='248' y1='24' x2='248' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='323' y1='24' x2='323' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='2' stroke-dasharray='7,4' x1='400' y1='24' x2='400' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='477' y1='24' x2='477' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='552' y1='24' x2='552' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='627' y1='24' x2='627' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='702' y1='24' x2='702' y2='426'/%3E%3C/svg%3E");
    background-size:cover; background-position:center;
  }
  .es-chalk-cfb {
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 450'%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='2' stroke-dasharray='6,5' x='24' y='24' width='752' height='402'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='98' y1='24' x2='98' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='248' y1='24' x2='248' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='2' stroke-dasharray='7,4' x1='400' y1='24' x2='400' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='552' y1='24' x2='552' y2='426'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.3' stroke-dasharray='4,5' x1='702' y1='24' x2='702' y2='426'/%3E%3Ctext x='400' y='260' text-anchor='middle' font-family='serif' font-size='160' fill='%23EDE5D4' opacity='0.28' font-weight='bold'%3EC%3C/text%3E%3C/svg%3E");
    background-size:cover; background-position:center;
  }

  .sig-row:hover { background: rgba(196,162,74,0.045) !important; }
  .sig-row:hover .sig-headline { color: #EDE5D4 !important; }
  .es-btn:focus-visible, .es-nav:focus-visible { outline: 2px solid #C4A24A; outline-offset: 2px; border-radius: 2px; }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(196,162,74,0.18); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(196,162,74,0.38); }

  @media (max-width: 768px) {
    .board-main-wrap { flex-direction:column !important; }
    .board-right-rail { display:none !important; }
    .sig-row-tap { min-height:56px !important; padding:12px 14px !important; }
  }
  .sig-row-tap { min-height:50px; }
  .shell-board-link { min-height:38px; display:flex; align-items:center; }
`;

interface V2ShellProps {
  children: React.ReactNode;
  boardsMode?: boolean;
}

export default function V2Shell({ children, boardsMode = false }: V2ShellProps) {
  const [location]   = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(true);
  const [darkMode, setDarkMode]     = useState(true);

  const bg    = darkMode ? T.bg       : "#F2EDE4";
  const surf1 = darkMode ? T.surface1 : "#FDFAF5";
  const goldD = darkMode ? T.goldDim  : "rgba(196,162,74,0.18)";
  const txt   = darkMode ? T.text     : "#1A1610";
  const txtM  = darkMode ? T.textMuted : "#5A4E3C";
  const txtF  = darkMode ? T.textFaint : "#8C7A62";

  const activeTop    = TOP_NAV.find(n => n.href === "/v2" ? (location === "/v2" || location === "/v2/") : location.startsWith(n.href));
  const currentSport = location.startsWith("/v2/nba") ? "NBA" : location.startsWith("/v2/mlb") ? "MLB" : location.startsWith("/v2/nfl") ? "NFL" : location.startsWith("/v2/cfb") ? "CFB" : null;
  const sportTheme   = currentSport ? SPORT_THEME[currentSport] : null;

  return (
    <div data-theme={darkMode ? "dark" : "light"} className="flex h-screen overflow-hidden" style={{ background: bg }}>
      <style>{GLOBAL_CSS}</style>

      {/* ── Sidebar ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex-col md:static md:translate-x-0 md:flex ${mobileOpen ? "flex" : "hidden"}`}
        style={{ width: 196, background: surf1, borderRight: `1px solid ${goldD}`, flexShrink: 0, overflowY: "auto" }}
      >
        <div style={{ padding: "14px 12px 10px", borderBottom: `1px solid ${goldD}`, flexShrink: 0 }}>
          <Link href="/v2" onClick={() => setMobileOpen(false)}>
            <a style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", textDecoration: "none" }}>
              <V2Logo />
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: "3px", color: T.gold, lineHeight: 1.1 }}>EDGE SETTER</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block", animation: "esPulse 2s ease-in-out infinite" }} />
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: txtF }}>Intelligence Verified</span>
                </div>
              </div>
            </a>
          </Link>
        </div>

        <nav style={{ flex: 1, padding: "6px", overflowY: "auto" }}>
          {TOP_NAV.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/v2" ? (location === "/v2" || location === "/v2/") : location.startsWith(href);
            const isBoards = href === "/v2/nba";
            const showSub  = isBoards && boardsMode;
            return (
              <div key={href}>
                <Link href={href} onClick={() => { setMobileOpen(false); if (isBoards) setBoardsOpen(o => !o); }}>
                  <a className="es-nav" style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 9px", marginBottom: 1, borderRadius: 2,
                    borderLeft: `2px solid ${isActive ? T.gold : "transparent"}`,
                    background: isActive ? T.goldGlow : "transparent",
                    color: isActive ? T.gold : txtM,
                    cursor: "pointer", textDecoration: "none", minHeight: 38, transition: "background 0.1s, color 0.1s",
                  }}
                    onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLAnchorElement).style.background = T.goldGlow; (e.currentTarget as HTMLAnchorElement).style.color = txt; } }}
                    onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = txtM; } }}
                  >
                    <Icon size={14} strokeWidth={isActive ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", flex: 1 }}>{label}</span>
                    {isBoards && boardsMode && (boardsOpen ? <ChevronDown size={11} style={{ opacity: 0.4 }} /> : <ChevronRight size={11} style={{ opacity: 0.4 }} />)}
                  </a>
                </Link>
                {showSub && boardsOpen && (
                  <div style={{ marginLeft: 10, marginBottom: 4 }}>
                    {BOARDS_NAV.map(b => {
                      const bActive = location === b.href || location.startsWith(b.href + "/");
                      const s  = STATUS_STYLE[b.status];
                      const th = SPORT_THEME[b.sport as keyof typeof SPORT_THEME];
                      return (
                        <Link key={b.href} href={b.href} onClick={() => setMobileOpen(false)}>
                          <a className="es-nav shell-board-link" style={{
                            display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", marginBottom: 1, borderRadius: 2,
                            borderLeft: `2px solid ${bActive ? th.primary : "transparent"}`,
                            background: bActive ? th.dim : "transparent",
                            color: bActive ? th.primary : txtM,
                            cursor: "pointer", textDecoration: "none", transition: "background 0.1s, color 0.1s",
                          }}
                            onMouseEnter={e => { if (!bActive) { (e.currentTarget as HTMLAnchorElement).style.background = T.goldGlow; (e.currentTarget as HTMLAnchorElement).style.color = txt; } }}
                            onMouseLeave={e => { if (!bActive) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = txtM; } }}
                          >
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: bActive ? th.primary : s.dot, display: "inline-block", flexShrink: 0, boxShadow: bActive ? `0 0 5px ${th.primary}` : "none" }} />
                            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", flex: 1 }}>{b.label}</span>
                            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: bActive ? th.primary : s.color, textTransform: "uppercase" }}>{b.status}</span>
                          </a>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ margin: "10px 0", borderTop: `1px solid ${goldD}` }} />

          <div style={{ padding: "0 2px 4px" }}>
            <div style={{ border: `1px solid ${T.borderStrong}`, borderRadius: 3, background: T.goldGlow, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.goldDim})` }} />
              <div style={{ padding: "12px 10px 10px" }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: "2px", color: T.gold, marginBottom: 2 }}>Pro Intelligence</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, color: txtF, letterSpacing: "0.14em", marginBottom: 9, textTransform: "uppercase" }}>Alerts · Full Archive · Multi-Sport</div>
                <Link href="/pro">
                  <button className="es-btn" style={{
                    width: "100%", minHeight: 36,
                    background: `linear-gradient(135deg, ${T.gold} 0%, #8A6A28 50%, ${T.gold} 100%)`,
                    backgroundSize: "200%",
                    color: T.bg, border: "none", borderRadius: 2,
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 13, letterSpacing: "2.5px", cursor: "pointer",
                    animation: "esShimmer 3s ease infinite",
                  }}>$19 / Month</button>
                </Link>
              </div>
            </div>
          </div>
        </nav>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(0,0,0,0.72)" }} onClick={() => setMobileOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 16px", minHeight: 48,
          background: surf1,
          borderBottom: `1px solid ${sportTheme ? sportTheme.primary + "38" : goldD}`,
          position: "sticky", top: 0, zIndex: 30, flexShrink: 0,
        }}>
          {/* Sport color accent line */}
          {sportTheme && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${sportTheme.primary}60, ${sportTheme.primary}20, transparent)` }} />}

          <button className="md:hidden es-btn" onClick={() => setMobileOpen(o => !o)} style={{ color: txtM, background: "none", border: "none", cursor: "pointer", padding: 8, display: "flex", minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 3 }}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: txtF }}>Edge Setter</span>
            {activeTop && activeTop.href !== "/v2" && (
              <>
                <span style={{ color: txtF, fontSize: 10 }}>›</span>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: sportTheme ? sportTheme.primary : txtM }}>{activeTop.label}</span>
              </>
            )}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
            <div className="hidden sm:flex" style={{ gap: 4 }}>
              <SportPill sport="NBA" status="LIVE"   href="/v2/nba" isCurrent={currentSport === "NBA"} />
              <SportPill sport="MLB" status="ACTIVE" href="/v2/mlb" isCurrent={currentSport === "MLB"} />
              <SportPill sport="NFL" status="ACTIVE" href="/v2/nfl" isCurrent={currentSport === "NFL"} />
              <SportPill sport="CFB" status="ACTIVE" href="/v2/cfb" isCurrent={currentSport === "CFB"} />
            </div>
            <NavLoginButton />
            <ProNavButton sport={(currentSport as any) ?? "generic"} />
            <button className="es-btn" onClick={() => setDarkMode(d => !d)} style={{
              display: "flex", alignItems: "center", gap: 4, minHeight: 30, padding: "0 9px", borderRadius: 2,
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

function V2Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect width="30" height="30" rx="2" fill="#131110" />
      <polygon points="15,4 24,9.5 24,20.5 15,26 6,20.5 6,9.5" stroke="#C4A24A" strokeWidth="1.5" fill="none" />
      <line x1="15" y1="9" x2="15" y2="21" stroke="#C4A24A" strokeWidth="1.5" />
      <line x1="9" y1="15" x2="21" y2="15" stroke="#C4A24A" strokeWidth="1" opacity="0.45" />
      <circle cx="15" cy="15" r="2.2" fill="#E0BB6A" />
    </svg>
  );
}
