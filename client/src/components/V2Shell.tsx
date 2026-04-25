import { Link, useLocation } from "wouter";
import { useState, createContext, useContext } from "react";
import {
  Home, LayoutGrid, Wrench, Star, List,
  ChevronDown, ChevronRight, Menu, X, Moon, Sun,
} from "lucide-react";
import { ProNavButton } from "./ProGate";

/* ── Design tokens ── */
const T = {
  bg:         "#0A0B0D",
  surface1:   "#111317",
  surface2:   "#16191E",
  gold:       "#CAA85A",
  goldBright: "#D8B86A",
  goldDim:    "rgba(202,168,90,0.16)",
  text:       "#F3EFE6",
  textMuted:  "#B7AFA0",
  textFaint:  "#7E776A",
  green:      "#4CAF82",
  orange:     "#D98A42",
  cyan:       "#4AA8C8",
  danger:     "#D94B4B",
};

/* ── Theme context — boards consume this to know dark/light ── */
export const ThemeCtx = createContext<boolean>(true);
export function useShellTheme() { return useContext(ThemeCtx); }

export type SportStatus = "LIVE" | "ACTIVE" | "BUILDING" | "OFFSEASON" | "COMING SOON";

const STATUS_STYLE: Record<SportStatus, { bg: string; color: string; dot: string }> = {
  "LIVE":        { bg: "rgba(76,175,130,0.15)",  color: "#4CAF82", dot: "#4CAF82" },
  "ACTIVE":      { bg: "rgba(74,168,200,0.12)",  color: "#4AA8C8", dot: "#4AA8C8" },
  "BUILDING":    { bg: "rgba(217,138,66,0.15)",  color: "#D98A42", dot: "#D98A42" },
  "OFFSEASON":   { bg: "rgba(126,119,106,0.18)", color: "#7E776A", dot: "#7E776A" },
  "COMING SOON": { bg: "rgba(126,119,106,0.12)", color: "#7E776A", dot: "#7E776A" },
};

export function SportBadge({ status }: { status: SportStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 2,
      background: s.bg, color: s.color,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

/* ── Sport Pill — top-right header, real button/link ── */
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
        width: 7, height: 7, borderRadius: "50%",
        background: s.dot, display: "inline-block", flexShrink: 0,
        boxShadow: isLive ? `0 0 7px ${s.dot}` : "none",
        animation: isLive ? "shellPulse 2s ease-in-out infinite" : "none",
      }} />
      <span style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 14, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
        color: s.color,
      }}>{sport}</span>
    </>
  );

  const sharedStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    minHeight: 44, padding: "0 14px", borderRadius: 4,
    background: isCurrent ? `${s.dot}22` : s.bg,
    border: `1px solid ${s.dot}${isCurrent ? "66" : clickable ? "40" : "20"}`,
    cursor: clickable ? "pointer" : "default",
    opacity: disabled ? 0.55 : 1,
    transition: "filter 0.12s, transform 0.1s, border-color 0.12s",
    outline: "none",
    userSelect: "none" as const,
    textDecoration: "none",
  };

  if (!clickable) {
    return (
      <span style={sharedStyle} aria-label={`${sport} — ${status}`}>
        {inner}
      </span>
    );
  }

  return (
    <Link href={href}>
      <a
        style={sharedStyle}
        aria-label={`Go to ${sport} board (${status})`}
        aria-current={isCurrent ? "page" : undefined}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.2)";
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

/* ── Top nav ── */
const TOP_NAV = [
  { href: "/v2",         label: "Home",    icon: Home       },
  { href: "/v2/nba",     label: "Boards",  icon: LayoutGrid },
  { href: "/v2/tools",   label: "Tools",   icon: Wrench     },
  { href: "/v2/my-edge", label: "My Edge", icon: Star       },
  { href: "/v2/sources", label: "Sources", icon: List       },
];

export const BOARDS_NAV = [
  { href: "/v2/nba", label: "NBA Board", status: "LIVE"        as SportStatus },
  { href: "/v2/mlb", label: "MLB Board", status: "ACTIVE"      as SportStatus },
  { href: "/v2/nfl", label: "NFL Board", status: "ACTIVE"      as SportStatus },
  { href: "/v2/cfb", label: "CFB Board", status: "ACTIVE"      as SportStatus },
];

/* ─────────────────────────────────────────────
   Global CSS injected once via <style>
   Covers mobile breakpoints, tap targets, and
   focus-visible outlines.
─────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @keyframes shellPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }

  /* Focus rings */
  .es-pill:focus-visible,
  .es-btn:focus-visible,
  .es-nav:focus-visible { outline: 2px solid #CAA85A; outline-offset: 2px; border-radius: 3px; }

  /* Mobile: stacked board layout */
  @media (max-width: 768px) {
    .board-main-wrap { flex-direction: column !important; }
    .board-subnav { display: none !important; }
    .board-main-col { min-width: 0 !important; }
    .board-detail-rail { width: 100% !important; border-left: none !important; border-top: 1px solid rgba(202,168,90,0.18) !important; }
    .board-slate-strip { flex-direction: column !important; gap: 10px !important; }
    .board-slate-card { width: 100% !important; }
    .mlb-grid-wrap { grid-template-columns: 1fr !important; }
    .playoff-band { flex-direction: column !important; gap: 8px !important; }

    /* Larger tap targets on mobile */
    .sig-row-tap { min-height: 56px !important; padding: 12px 14px !important; }
    .filter-chip { min-height: 44px !important; padding: 0 14px !important; font-size: 14px !important; }
    .team-btn-mob { min-height: 44px !important; }
    .matchup-card-wrap { min-height: 44px; }
  }

  /* Signal rows — min height for tap */
  .sig-row-tap { min-height: 52px; }

  /* Remove hover from disabled/status-only items */
  .es-status-only { cursor: default !important; pointer-events: none; }

  /* Shell subnav items */
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

  const bg      = darkMode ? T.bg        : "#F0ECE4";
  const surf1   = darkMode ? T.surface1  : "#FFFFFF";
  const goldD   = darkMode ? T.goldDim   : "rgba(202,168,90,0.25)";
  const txtMain = darkMode ? T.text      : "#1A1712";
  const txtMut  = darkMode ? T.textMuted : "#5A534A";
  const txtFnt  = darkMode ? T.textFaint : "#8C8277";

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
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          width: 220, background: surf1,
          borderRight: `1px solid ${goldD}`,
          flexShrink: 0, overflowY: "auto",
        }}
      >
        {/* Brand */}
        <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${goldD}`, flexShrink: 0 }}>
          <Link href="/v2" onClick={() => setMobileOpen(false)}>
            <a style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", textDecoration: "none" }}>
              <V2Logo />
              <div>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 18, color: txtMain, lineHeight: 1.2 }}>
                  Edge Setter
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: txtFnt }}>
                    Multi-Sport Intel
                  </span>
                </div>
              </div>
            </a>
          </Link>
        </div>

        {/* Main nav */}
        <nav style={{ flex: 1, padding: "8px 8px", overflowY: "auto" }}>
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
                      display: "flex", alignItems: "center", gap: 9,
                      padding: "10px 10px", marginBottom: 1,
                      borderRadius: 3,
                      borderLeft: `2px solid ${isActive ? T.gold : "transparent"}`,
                      background: isActive ? "rgba(202,168,90,0.08)" : "transparent",
                      color: isActive ? T.gold : txtMut,
                      cursor: "pointer", transition: "background 0.1s, color 0.1s",
                      textDecoration: "none",
                      minHeight: 44,
                    }}
                    onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(202,168,90,0.05)"; (e.currentTarget as HTMLAnchorElement).style.color = txtMain; } }}
                    onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = txtMut; } }}
                  >
                    <Icon size={16} strokeWidth={isActive ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", flex: 1 }}>
                      {label}
                    </span>
                    {isBoards && boardsMode && (
                      boardsOpen ? <ChevronDown size={12} style={{ opacity: 0.5 }} /> : <ChevronRight size={12} style={{ opacity: 0.5 }} />
                    )}
                  </a>
                </Link>

                {/* Board subnav */}
                {showSub && boardsOpen && (
                  <div style={{ marginLeft: 14, marginBottom: 4 }}>
                    {BOARDS_NAV.map(b => {
                      const bActive = location === b.href || location.startsWith(b.href + "/");
                      const disabled = b.status === "COMING SOON" || b.status === "OFFSEASON";  // BUILDING + ACTIVE are clickable
                      const s = STATUS_STYLE[b.status];

                      if (disabled) {
                        // Disabled boards: no hover, no pointer cursor
                        return (
                          <div
                            key={b.href}
                            className="shell-board-link"
                            aria-disabled="true"
                            style={{
                              display: "flex", alignItems: "center", gap: 7,
                              padding: "8px 10px", marginBottom: 1, borderRadius: 3,
                              borderLeft: "2px solid transparent",
                              color: T.textFaint, opacity: 0.45,
                              cursor: "not-allowed",
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block", flexShrink: 0 }} />
                            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", flex: 1 }}>{b.label}</span>
                            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint }}>{b.status === "OFFSEASON" ? "OFF" : "SOON"}</span>
                          </div>
                        );
                      }

                      return (
                        <Link key={b.href} href={b.href} onClick={() => setMobileOpen(false)}>
                          <a
                            className="es-nav shell-board-link"
                            aria-current={bActive ? "page" : undefined}
                            style={{
                              display: "flex", alignItems: "center", gap: 7,
                              padding: "8px 10px", marginBottom: 1, borderRadius: 3,
                              borderLeft: `2px solid ${bActive ? T.gold : "transparent"}`,
                              background: bActive ? "rgba(202,168,90,0.07)" : "transparent",
                              color: bActive ? T.gold : txtMut,
                              cursor: "pointer", transition: "background 0.1s, color 0.1s",
                              textDecoration: "none", minHeight: 40,
                            }}
                            onMouseEnter={e => { if (!bActive) { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(202,168,90,0.04)"; (e.currentTarget as HTMLAnchorElement).style.color = txtMain; } }}
                            onMouseLeave={e => { if (!bActive) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = txtMut; } }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block", flexShrink: 0 }} />
                            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", flex: 1 }}>{b.label}</span>
                          </a>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ margin: "12px 0", borderTop: `1px solid ${goldD}` }} />

          {/* Pro CTA */}
          <div style={{ padding: "0 2px 4px" }}>
            <div style={{ border: `1px solid rgba(202,168,90,0.22)`, borderRadius: 4, background: "rgba(202,168,90,0.04)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: T.gold }} />
              <div style={{ padding: "14px 12px 12px" }}>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14, fontWeight: 700, color: T.gold, marginBottom: 4 }}>Pro Intelligence</div>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textFaint, letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>
                  Alerts · Full Archive · Multi-sport
                </div>
                <Link href="/pro">
                  <button
                    className="es-btn"
                    style={{
                      width: "100%", minHeight: 44,
                      background: T.gold, color: T.bg, border: "none", borderRadius: 3,
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 15, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = T.goldBright; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.gold; }}
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
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ───── Content area ───── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top header bar ── */}
        <header style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 16px", minHeight: 52,
          background: surf1, borderBottom: `1px solid ${goldD}`,
          position: "sticky", top: 0, zIndex: 30, flexShrink: 0,
        }}>

          {/* Mobile menu button */}
          <button
            className="md:hidden es-btn"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(o => !o)}
            style={{
              color: T.textMuted, background: "none", border: "none",
              cursor: "pointer", padding: 8, display: "flex", alignItems: "center",
              borderRadius: 4, minWidth: 44, minHeight: 44, justifyContent: "center",
            }}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 14, fontWeight: 700, letterSpacing: "0.12em",
              textTransform: "uppercase", color: T.textFaint,
            }}>Edge Setter</span>
            {activeTop && activeTop.href !== "/v2" && (
              <>
                <span style={{ color: T.textFaint, fontSize: 13 }}>›</span>
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 14, fontWeight: 700, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: T.textMuted,
                }}>{activeTop.label}</span>
              </>
            )}
          </div>

          {/* Right controls — sport pills + pro button + dark toggle */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            {/* Pills — hidden on very small screens, shown md+ */}
            <div className="hidden sm:flex" style={{ gap: 6, alignItems: "center" }}>
              <SportPill sport="NBA" status="LIVE"      href="/v2/nba" isCurrent={currentSport === "NBA"} />
              <SportPill sport="MLB" status="ACTIVE"    href="/v2/mlb" isCurrent={currentSport === "MLB"} />
              <SportPill sport="NFL" status="ACTIVE"    href="/v2/nfl" isCurrent={currentSport === "NFL"} />
              <SportPill sport="CFB" status="ACTIVE"    href="/v2/cfb" isCurrent={currentSport === "CFB"} />
            </div>

            {/* Pro nav button */}
            <ProNavButton sport={(currentSport as any) ?? "generic"} />

            {/* Dark mode toggle */}
            <button
              className="es-btn"
              onClick={() => setDarkMode(d => !d)}
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={darkMode}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                minHeight: 44, padding: "0 12px", borderRadius: 4,
                border: `1px solid rgba(202,168,90,0.25)`,
                background: "transparent",
                color: T.textMuted,
                cursor: "pointer",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                transition: "background 0.12s, color 0.12s, border-color 0.12s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = "rgba(202,168,90,0.08)";
                el.style.color = T.gold;
                el.style.borderColor = "rgba(202,168,90,0.4)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = "transparent";
                el.style.color = T.textMuted;
                el.style.borderColor = "rgba(202,168,90,0.25)";
              }}
            >
              {darkMode ? <Moon size={13} /> : <Sun size={13} />}
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

function V2Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect width="30" height="30" rx="3" fill="#111317" />
      <polygon points="15,4 24,9.5 24,20.5 15,26 6,20.5 6,9.5" stroke="#CAA85A" strokeWidth="1.5" fill="none" />
      <line x1="15" y1="9" x2="15" y2="21" stroke="#CAA85A" strokeWidth="1.5" />
      <line x1="9" y1="15" x2="21" y2="15" stroke="#CAA85A" strokeWidth="1" opacity="0.55" />
      <circle cx="15" cy="15" r="2" fill="#D8B86A" />
    </svg>
  );
}
