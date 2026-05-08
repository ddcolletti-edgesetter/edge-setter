import { Link, useLocation } from "wouter";
import { useState, createContext, useContext } from "react";
import {
  Home, LayoutGrid, Wrench, Star, List,
  ChevronDown, ChevronRight, Menu, X, Moon, Sun,
} from "lucide-react";
import { ProNavButton, NavLoginButton } from "./ProGate";

/* ─────────────────────────────────────────────
   LFL-BLEND DESIGN TOKENS
   Warmer, richer, luxury-scouting-dossier feel.
   Near-black with olive undertone (not blue-gray),
   warm gold (not neon), film grain via CSS.
───────────────────────────────────────────── */
export const T = {
  // Backgrounds — warm near-black, olive undertone
  bg:         "#0C0B09",
  surface1:   "#131110",
  surface2:   "#1A1714",
  surface3:   "#201D19",

  // Gold — luxury warm, not neon yellow
  gold:       "#C4A24A",
  goldBright: "#E0BB6A",
  goldDim:    "rgba(196,162,74,0.16)",
  goldGlow:   "rgba(196,162,74,0.08)",

  // Text — warm white, not pure white
  text:       "#EDE5D4",
  textMuted:  "#8A7A62",
  textFaint:  "#4A4235",

  // Status colors — unchanged, functional
  green:      "#3EBA6A",
  orange:     "#D98A42",
  cyan:       "#4AA8C8",
  danger:     "#D94B4B",

  // Borders
  border:     "rgba(196,162,74,0.14)",
  borderStrong: "rgba(196,162,74,0.38)",
};

/* ── Theme context ── */
export const ThemeCtx = createContext<boolean>(true);
export function useShellTheme() { return useContext(ThemeCtx); }

export type SportStatus = "LIVE" | "ACTIVE" | "BUILDING" | "OFFSEASON" | "COMING SOON";

const STATUS_STYLE: Record<SportStatus, { bg: string; color: string; dot: string }> = {
  "LIVE":        { bg: "rgba(62,186,106,0.12)",  color: "#3EBA6A", dot: "#3EBA6A" },
  "ACTIVE":      { bg: "rgba(74,168,200,0.10)",  color: "#4AA8C8", dot: "#4AA8C8" },
  "BUILDING":    { bg: "rgba(217,138,66,0.12)",  color: "#D98A42", dot: "#D98A42" },
  "OFFSEASON":   { bg: "rgba(74,66,53,0.25)",    color: "#4A4235", dot: "#4A4235" },
  "COMING SOON": { bg: "rgba(74,66,53,0.18)",    color: "#4A4235", dot: "#4A4235" },
};

export function SportBadge({ status }: { status: SportStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 2,
      background: s.bg, color: s.color,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
      border: `1px solid ${s.dot}30`,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%", background: s.dot,
        display: "inline-block",
        boxShadow: status === "LIVE" ? `0 0 5px ${s.dot}` : "none",
        animation: status === "LIVE" ? "shellPulse 2s ease-in-out infinite" : "none",
      }} />
      {status}
    </span>
  );
}

/* ── Sport Pill ── */
interface SportPillProps {
  sport: "NBA" | "MLB" | "NFL" | "CFB";
  status: SportStatus;
  href: string;
  disabled?: boolean;
  isCurrent?: boolean;
}
function SportPill({ sport, status, href, disabled = false, isCurrent = false }: SportPillProps) {
  const s = STATUS_STYLE[status];
  const isLive = status === "LIVE";
  const clickable = !disabled;

  const inner = (
    <>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: s.dot, display: "inline-block", flexShrink: 0,
        boxShadow: isLive ? `0 0 6px ${s.dot}` : "none",
        animation: isLive ? "shellPulse 2s ease-in-out infinite" : "none",
      }} />
      <span style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
        color: s.color,
      }}>{sport}</span>
    </>
  );

  const sharedStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    minHeight: 34, padding: "0 11px", borderRadius: 2,
    background: isCurrent ? `${s.dot}1E` : s.bg,
    border: `1px solid ${s.dot}${isCurrent ? "55" : clickable ? "35" : "18"}`,
    cursor: clickable ? "pointer" : "default",
    opacity: disabled ? 0.45 : 1,
    transition: "filter 0.12s, transform 0.1s",
    outline: "none",
    userSelect: "none" as const,
    textDecoration: "none",
  };

  if (!clickable) {
    return <span style={sharedStyle} aria-label={`${sport} — ${status}`}>{inner}</span>;
  }

  return (
    <Link href={href}>
      <a
        style={sharedStyle}
        aria-label={`Go to ${sport} board (${status})`}
        aria-current={isCurrent ? "page" : undefined}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.25)";
          (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.filter = "";
          (e.currentTarget as HTMLAnchorElement).style.transform = "";
        }}
      >
        {inner}
      </a>
    </Link>
  );
}

/* ─────────────────────────────────────────────
   CHALK SPORT BACKGROUNDS
   SVG data-URIs per sport — basketball court,
   baseball diamond, football field, CFB field.
   Used on board pages as subtle texture overlays.
─────────────────────────────────────────────── */
export const CHALK_BG: Record<string, string> = {
  NBA: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 400'%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1.5' stroke-dasharray='5,5' x='20' y='20' width='560' height='360' rx='4'/%3E%3Cellipse fill='none' stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,6' cx='300' cy='200' rx='90' ry='90'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='5,5' x1='300' y1='20' x2='300' y2='380'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x='20' y='130' width='130' height='140'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x='450' y='130' width='130' height='140'/%3E%3Cellipse fill='none' stroke='%23EDE5D4' stroke-width='1' stroke-dasharray='3,6' cx='300' cy='200' rx='24' ry='24'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1' stroke-dasharray='3,5' x='20' y='165' width='46' height='70' rx='2'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1' stroke-dasharray='3,5' x='534' y='165' width='46' height='70' rx='2'/%3E%3C/svg%3E")`,

  MLB: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 500'%3E%3Cellipse fill='none' stroke='%23EDE5D4' stroke-width='1.5' stroke-dasharray='5,5' cx='300' cy='320' rx='240' ry='200'/%3E%3Cpolygon fill='none' stroke='%23EDE5D4' stroke-width='1.8' stroke-dasharray='5,4' points='300,80 460,240 300,400 140,240'/%3E%3Ccircle fill='%23EDE5D4' r='7' cx='300' cy='80' opacity='0.6'/%3E%3Ccircle fill='%23EDE5D4' r='7' cx='460' cy='240' opacity='0.6'/%3E%3Ccircle fill='%23EDE5D4' r='7' cx='300' cy='400' opacity='0.6'/%3E%3Ccircle fill='%23EDE5D4' r='7' cx='140' cy='240' opacity='0.6'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,4' x1='300' y1='400' x2='215' y2='480'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,4' x1='300' y1='400' x2='385' y2='480'/%3E%3Cellipse fill='none' stroke='%23EDE5D4' stroke-width='1' stroke-dasharray='3,6' cx='300' cy='400' rx='32' ry='16'/%3E%3C/svg%3E")`,

  NFL: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 380'%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1.5' stroke-dasharray='5,5' x='20' y='20' width='660' height='340'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='86' y1='20' x2='86' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='152' y1='20' x2='152' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='218' y1='20' x2='218' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='284' y1='20' x2='284' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.8' stroke-dasharray='6,4' x1='350' y1='20' x2='350' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='416' y1='20' x2='416' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='482' y1='20' x2='482' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='548' y1='20' x2='548' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='614' y1='20' x2='614' y2='360'/%3E%3C/svg%3E")`,

  CFB: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 380'%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1.5' stroke-dasharray='5,5' x='20' y='20' width='660' height='340'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='86' y1='20' x2='86' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='152' y1='20' x2='152' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='218' y1='20' x2='218' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='284' y1='20' x2='284' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.8' stroke-dasharray='6,4' x1='350' y1='20' x2='350' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='416' y1='20' x2='416' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='482' y1='20' x2='482' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='548' y1='20' x2='548' y2='360'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='614' y1='20' x2='614' y2='360'/%3E%3Ctext x='350' y='210' text-anchor='middle' font-family='serif' font-size='120' fill='%23EDE5D4' opacity='0.35' font-weight='bold'%3EC%3C/text%3E%3C/svg%3E")`,
};

/* ── Nav items ── */
const TOP_NAV = [
  { href: "/v2",         label: "Home",    icon: Home       },
  { href: "/v2/nba",     label: "Boards",  icon: LayoutGrid },
  { href: "/v2/tools",   label: "Tools",   icon: Wrench     },
  { href: "/v2/my-edge", label: "My Edge", icon: Star       },
  { href: "/v2/sources", label: "Sources", icon: List       },
];

export const BOARDS_NAV = [
  { href: "/v2/nba", label: "NBA Board", status: "LIVE"   as SportStatus },
  { href: "/v2/mlb", label: "MLB Board", status: "ACTIVE" as SportStatus },
  { href: "/v2/nfl", label: "NFL Board", status: "ACTIVE" as SportStatus },
  { href: "/v2/cfb", label: "CFB Board", status: "ACTIVE" as SportStatus },
];

/* ─────────────────────────────────────────────
   GLOBAL CSS
   - LFL film grain overlay on the shell bg
   - Chalk sport bg helper class
   - Animations, focus rings, mobile breakpoints
─────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@300;400;500;600;700&family=Barlow:ital,wght@0,300;0,400;0,500;1,300&display=swap');

  @keyframes shellPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  @keyframes grainShift { 0%{transform:translate(0,0)} 25%{transform:translate(-1%,-1%)} 50%{transform:translate(1%,0)} 75%{transform:translate(0,1%)} 100%{transform:translate(-1%,0)} }

  /* ── Film grain overlay on shell root ── */
  [data-theme="dark"]::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9999;
    opacity: 0.028;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grain)' opacity='1'/%3E%3C/svg%3E");
    background-size: 220px;
    animation: grainShift 8s steps(10) infinite;
  }

  /* ── Chalk board bg helper — used on main board canvas ── */
  .es-chalk-nba {
    background-image: ${CHALK_BG.NBA};
    background-size: cover;
    background-position: center;
  }
  .es-chalk-mlb {
    background-image: ${CHALK_BG.MLB};
    background-size: cover;
    background-position: center;
  }
  .es-chalk-nfl {
    background-image: ${CHALK_BG.NFL};
    background-size: cover;
    background-position: center;
  }
  .es-chalk-cfb {
    background-image: ${CHALK_BG.CFB};
    background-size: cover;
    background-position: center;
  }

  /* ── Focus rings ── */
  .es-pill:focus-visible,
  .es-btn:focus-visible,
  .es-nav:focus-visible { outline: 2px solid #C4A24A; outline-offset: 2px; border-radius: 3px; }

  /* ── Signal row hover ── */
  .sig-row:hover { background: rgba(196,162,74,0.04) !important; }
  .sig-row:hover .sig-headline { color: #EDE5D4 !important; }

  /* ── Mobile ── */
  @media (max-width: 768px) {
    .board-main-wrap { flex-direction: column !important; }
    .board-subnav { display: none !important; }
    .board-main-col { min-width: 0 !important; }
    .board-detail-rail { width: 100% !important; border-left: none !important; border-top: 1px solid rgba(196,162,74,0.18) !important; }
    .board-slate-strip { flex-direction: column !important; gap: 10px !important; }
    .board-slate-card { width: 100% !important; }
    .mlb-grid-wrap { grid-template-columns: 1fr !important; }
    .sig-row-tap { min-height: 56px !important; padding: 12px 14px !important; }
    .filter-chip { min-height: 44px !important; padding: 0 14px !important; font-size: 14px !important; }
    .team-btn-mob { min-height: 44px !important; }
  }

  .sig-row-tap { min-height: 52px; }
  .es-status-only { cursor: default !important; pointer-events: none; }
  .shell-board-link { min-height: 40px; display: flex; align-items: center; }

  @media (max-width: 768px) {
    .shell-board-link { min-height: 48px; }
    .shell-sidebar-nav-item { min-height: 48px; }
  }
`;

interface V2ShellProps {
  children: React.ReactNode;
  boardsMode?: boolean;
}

export default function V2Shell({ children, boardsMode = false }: V2ShellProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  // Light mode keeps warm parchment feel, not stark white
  const bg      = darkMode ? T.bg       : "#F2EDE4";
  const surf1   = darkMode ? T.surface1 : "#FDFAF5";
  const goldD   = darkMode ? T.goldDim  : "rgba(196,162,74,0.2)";
  const txtMain = darkMode ? T.text     : "#1A1610";
  const txtMut  = darkMode ? T.textMuted : "#5A4E3C";
  const txtFnt  = darkMode ? T.textFaint : "#8C7A62";

  const activeTop = TOP_NAV.find(n =>
    n.href === "/v2"
      ? location === "/v2" || location === "/v2/"
      : location.startsWith(n.href)
  );

  const currentSport = location.startsWith("/v2/nba") ? "NBA"
    : location.startsWith("/v2/mlb") ? "MLB"
    : location.startsWith("/v2/nfl") ? "NFL"
    : location.startsWith("/v2/cfb") ? "CFB" : null;

  return (
    <div
      data-theme={darkMode ? "dark" : "light"}
      className="flex h-screen overflow-hidden"
      style={{ background: bg }}
    >
      <style>{GLOBAL_CSS}</style>

      {/* ───── Sidebar ───── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex-col md:static md:translate-x-0 md:flex ${mobileOpen ? "flex" : "hidden"}`}
        style={{
          width: 200,
          background: surf1,
          borderRight: `1px solid ${goldD}`,
          flexShrink: 0,
          overflowY: "auto",
        }}
      >
        {/* Brand */}
        <div style={{ padding: "14px 12px 10px", borderBottom: `1px solid ${goldD}`, flexShrink: 0 }}>
          <Link href="/v2" onClick={() => setMobileOpen(false)}>
            <a style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", textDecoration: "none" }}>
              <V2Logo />
              <div>
                <div style={{
                  fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
                  fontWeight: 400, fontSize: 19, color: T.gold,
                  letterSpacing: "3px", lineHeight: 1.1,
                }}>
                  EDGE SETTER
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                  <span style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.2em",
                    textTransform: "uppercase", color: txtFnt,
                  }}>
                    Multi-Sport Intel
                  </span>
                </div>
              </div>
            </a>
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "6px 6px", overflowY: "auto" }}>
          {TOP_NAV.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/v2"
              ? location === "/v2" || location === "/v2/"
              : location.startsWith(href);
            const isBoards = href === "/v2/nba";
            const showSub = isBoards && boardsMode;

            return (
              <div key={href}>
                <Link href={href} onClick={() => {
                  setMobileOpen(false);
                  if (isBoards) setBoardsOpen(o => !o);
                }}>
                  <a
                    className="es-nav shell-sidebar-nav-item"
                    aria-current={isActive ? "page" : undefined}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 10px", marginBottom: 1, borderRadius: 2,
                      borderLeft: `2px solid ${isActive ? T.gold : "transparent"}`,
                      background: isActive ? T.goldGlow : "transparent",
                      color: isActive ? T.gold : txtMut,
                      cursor: "pointer", transition: "background 0.1s, color 0.1s",
                      textDecoration: "none", minHeight: 40,
                    }}
                    onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLAnchorElement).style.background = T.goldGlow; (e.currentTarget as HTMLAnchorElement).style.color = txtMain; } }}
                    onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = txtMut; } }}
                  >
                    <Icon size={14} strokeWidth={isActive ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
                    <span style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13, fontWeight: 700, letterSpacing: "0.12em",
                      textTransform: "uppercase", flex: 1,
                    }}>{label}</span>
                    {isBoards && boardsMode && (
                      boardsOpen
                        ? <ChevronDown size={11} style={{ opacity: 0.4 }} />
                        : <ChevronRight size={11} style={{ opacity: 0.4 }} />
                    )}
                  </a>
                </Link>

                {showSub && boardsOpen && (
                  <div style={{ marginLeft: 12, marginBottom: 4 }}>
                    {BOARDS_NAV.map(b => {
                      const bActive = location === b.href || location.startsWith(b.href + "/");
                      const s = STATUS_STYLE[b.status];
                      return (
                        <Link key={b.href} href={b.href} onClick={() => setMobileOpen(false)}>
                          <a
                            className="es-nav shell-board-link"
                            aria-current={bActive ? "page" : undefined}
                            style={{
                              display: "flex", alignItems: "center", gap: 7,
                              padding: "7px 10px", marginBottom: 1, borderRadius: 2,
                              borderLeft: `2px solid ${bActive ? T.gold : "transparent"}`,
                              background: bActive ? T.goldGlow : "transparent",
                              color: bActive ? T.gold : txtMut,
                              cursor: "pointer", transition: "background 0.1s, color 0.1s",
                              textDecoration: "none", minHeight: 38,
                            }}
                            onMouseEnter={e => { if (!bActive) { (e.currentTarget as HTMLAnchorElement).style.background = T.goldGlow; (e.currentTarget as HTMLAnchorElement).style.color = txtMain; } }}
                            onMouseLeave={e => { if (!bActive) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = txtMut; } }}
                          >
                            <span style={{
                              width: 5, height: 5, borderRadius: "50%", background: s.dot,
                              display: "inline-block", flexShrink: 0,
                              boxShadow: b.status === "LIVE" ? `0 0 4px ${s.dot}` : "none",
                            }} />
                            <span style={{
                              fontFamily: "'Barlow Condensed', sans-serif",
                              fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                              textTransform: "uppercase", flex: 1,
                            }}>{b.label}</span>
                            <span style={{
                              fontFamily: "'Barlow Condensed', sans-serif",
                              fontSize: 9, fontWeight: 700, letterSpacing: "0.15em",
                              color: s.color, textTransform: "uppercase",
                            }}>{b.status}</span>
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

          {/* Pro CTA in sidebar */}
          <div style={{ padding: "0 2px 4px" }}>
            <div style={{
              border: `1px solid ${T.borderStrong}`,
              borderRadius: 3,
              background: T.goldGlow,
              position: "relative", overflow: "hidden",
            }}>
              {/* Gold top stripe */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.goldDim})` }} />
              <div style={{ padding: "14px 12px 12px" }}>
                <div style={{
                  fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
                  fontSize: 14, letterSpacing: "2px", color: T.gold, marginBottom: 3,
                }}>Pro Intelligence</div>
                <div style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 10, color: txtFnt, letterSpacing: "0.12em",
                  marginBottom: 10, textTransform: "uppercase",
                }}>
                  Alerts · Full Archive · Multi-sport
                </div>
                <Link href="/pro">
                  <button
                    className="es-btn"
                    style={{
                      width: "100%", minHeight: 38,
                      background: `linear-gradient(135deg, ${T.gold}, #8A6A28)`,
                      color: T.bg, border: "none", borderRadius: 2,
                      fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
                      fontSize: 14, fontWeight: 700, letterSpacing: "2px",
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.12)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = ""; }}
                  >
                    $19 / Month
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </nav>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ───── Content area ───── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top header */}
        <header style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 16px", minHeight: 50,
          background: surf1,
          borderBottom: `1px solid ${goldD}`,
          position: "sticky", top: 0, zIndex: 30, flexShrink: 0,
        }}>
          {/* Mobile menu */}
          <button
            className="md:hidden es-btn"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(o => !o)}
            style={{
              color: txtMut, background: "none", border: "none",
              cursor: "pointer", padding: 8, display: "flex", alignItems: "center",
              borderRadius: 3, minWidth: 44, minHeight: 44, justifyContent: "center",
            }}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.16em",
              textTransform: "uppercase", color: txtFnt,
            }}>Edge Setter</span>
            {activeTop && activeTop.href !== "/v2" && (
              <>
                <span style={{ color: txtFnt, fontSize: 11 }}>›</span>
                <span style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: txtMut,
                }}>{activeTop.label}</span>
              </>
            )}
          </div>

          {/* Right controls */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <div className="hidden sm:flex" style={{ gap: 5, alignItems: "center" }}>
              <SportPill sport="NBA" status="LIVE"   href="/v2/nba" isCurrent={currentSport === "NBA"} />
              <SportPill sport="MLB" status="ACTIVE" href="/v2/mlb" isCurrent={currentSport === "MLB"} />
              <SportPill sport="NFL" status="ACTIVE" href="/v2/nfl" isCurrent={currentSport === "NFL"} />
              <SportPill sport="CFB" status="ACTIVE" href="/v2/cfb" isCurrent={currentSport === "CFB"} />
            </div>

            <NavLoginButton />
            <ProNavButton sport={(currentSport as any) ?? "generic"} />

            {/* Dark toggle */}
            <button
              className="es-btn"
              onClick={() => setDarkMode(d => !d)}
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={darkMode}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                minHeight: 34, padding: "0 10px", borderRadius: 2,
                border: `1px solid ${goldD}`,
                background: "transparent", color: txtMut,
                cursor: "pointer",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                transition: "background 0.1s, color 0.1s, border-color 0.1s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = T.goldGlow;
                el.style.color = T.gold;
                el.style.borderColor = T.borderStrong;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = "transparent";
                el.style.color = txtMut;
                el.style.borderColor = goldD;
              }}
            >
              {darkMode ? <Moon size={12} /> : <Sun size={12} />}
              <span className="hidden sm:inline">{darkMode ? "Dark" : "Light"}</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overscroll-contain" style={{ background: bg }}>
          <ThemeCtx.Provider value={darkMode}>
            {children}
          </ThemeCtx.Provider>
        </main>
      </div>
    </div>
  );
}

/* ── Logo — updated to LFL gold ── */
function V2Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect width="30" height="30" rx="2" fill="#131110" />
      <polygon points="15,4 24,9.5 24,20.5 15,26 6,20.5 6,9.5" stroke="#C4A24A" strokeWidth="1.5" fill="none" />
      <line x1="15" y1="9" x2="15" y2="21" stroke="#C4A24A" strokeWidth="1.5" />
      <line x1="9" y1="15" x2="21" y2="15" stroke="#C4A24A" strokeWidth="1" opacity="0.5" />
      <circle cx="15" cy="15" r="2.2" fill="#E0BB6A" />
    </svg>
  );
}
