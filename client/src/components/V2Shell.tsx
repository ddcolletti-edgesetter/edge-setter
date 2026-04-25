import { Link, useLocation } from "wouter";
import { useState } from "react";
import {
  Home, LayoutGrid, Wrench, Star, List,
  ChevronDown, ChevronRight, Menu, X, Moon, Sun,
  Circle
} from "lucide-react";

/* ── Design tokens ── */
const T = {
  bg:         "#0A0B0D",
  surface1:   "#111317",
  surface2:   "#16191E",
  surface3:   "#1B1F25",
  gold:       "#CAA85A",
  goldBright: "#D8B86A",
  goldDim:    "rgba(202,168,90,0.16)",
  text:       "#F3EFE6",
  textMuted:  "#B7AFA0",
  textFaint:  "#7E776A",
  green:      "#4CAF82",
  orange:     "#D98A42",
  cyan:       "#4AA8C8",
  dim:        "rgba(255,255,255,0.06)",
};

/* ── Sport status badges ── */
export type SportStatus = "LIVE" | "ACTIVE" | "BUILDING" | "OFFSEASON" | "COMING SOON";

const STATUS_STYLE: Record<SportStatus, { bg: string; color: string; dot: string }> = {
  "LIVE":         { bg: "rgba(76,175,130,0.15)", color: "#4CAF82", dot: "#4CAF82" },
  "ACTIVE":       { bg: "rgba(74,168,200,0.12)", color: "#4AA8C8", dot: "#4AA8C8" },
  "BUILDING":     { bg: "rgba(217,138,66,0.15)", color: "#D98A42", dot: "#D98A42" },
  "OFFSEASON":    { bg: "rgba(126,119,106,0.18)", color: "#7E776A", dot: "#7E776A" },
  "COMING SOON":  { bg: "rgba(126,119,106,0.12)", color: "#7E776A", dot: "#7E776A" },
};

export function SportBadge({ status }: { status: SportStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "2px 7px", borderRadius: 2,
        background: s.bg, color: s.color,
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

/* ── Top-right nav pill — now a real button/link ── */
interface SportPillProps {
  sport: "NBA" | "MLB" | "NFL" | "CFB";
  status: SportStatus;
  href: string;
  disabled?: boolean;
}
function SportPill({ sport, status, href, disabled = false }: SportPillProps) {
  const s = STATUS_STYLE[status];
  const isLive = status === "LIVE";
  const isActive = status === "ACTIVE";
  const clickable = !disabled;

  const pill = (
    <span
      tabIndex={clickable ? 0 : -1}
      role={clickable ? "button" : undefined}
      aria-label={`${sport} — ${status}`}
      onKeyDown={e => { if (clickable && (e.key === "Enter" || e.key === " ") && typeof window !== "undefined") { window.location.hash = `#${href}`; } }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 11px", borderRadius: 3,
        background: s.bg,
        border: `1px solid ${s.dot}${isLive ? "55" : "30"}`,
        color: s.color,
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
        cursor: clickable ? "pointer" : "default",
        transition: "filter 0.12s, transform 0.1s",
        outline: "none",
        userSelect: "none",
      }}
      onMouseEnter={e => { if (clickable) { (e.currentTarget as HTMLSpanElement).style.filter = "brightness(1.2)"; (e.currentTarget as HTMLSpanElement).style.transform = "translateY(-1px)"; } }}
      onMouseLeave={e => { if (clickable) { (e.currentTarget as HTMLSpanElement).style.filter = ""; (e.currentTarget as HTMLSpanElement).style.transform = ""; } }}
      onFocus={e => { if (clickable) { (e.currentTarget as HTMLSpanElement).style.filter = "brightness(1.15)"; } }}
      onBlur={e => { (e.currentTarget as HTMLSpanElement).style.filter = ""; }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: s.dot, display: "inline-block",
        boxShadow: isLive ? `0 0 6px ${s.dot}` : "none",
        animation: isLive ? "shellPulse 2s ease-in-out infinite" : "none",
      }} />
      <span style={{ opacity: 0.65, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em" }}>{status === "LIVE" ? "LIVE" : status === "ACTIVE" ? "ACT" : status === "OFFSEASON" ? "OFF" : "–"}</span>
      <span style={{ borderLeft: `1px solid ${s.dot}30`, paddingLeft: 6, fontSize: 14, fontWeight: 800, letterSpacing: "0.06em" }}>{sport}</span>
    </span>
  );

  if (!clickable) return pill;
  return <Link href={href}>{pill}</Link>;
}

/* ── Top nav items ── */
const TOP_NAV = [
  { href: "/v2",          label: "Home",    icon: Home        },
  { href: "/v2/nba",      label: "Boards",  icon: LayoutGrid  },
  { href: "/v2/tools",    label: "Tools",   icon: Wrench      },
  { href: "/v2/my-edge",  label: "My Edge", icon: Star        },
  { href: "/v2/sources",  label: "Sources", icon: List        },
];

/* ── Board subnav ── */
export const BOARDS_NAV = [
  { href: "/v2/nba", label: "NBA Board", status: "LIVE"        as SportStatus, abbr: "NBA" },
  { href: "/v2/mlb", label: "MLB Board", status: "ACTIVE"      as SportStatus, abbr: "MLB" },
  { href: "/v2/nfl", label: "NFL Board", status: "OFFSEASON"   as SportStatus, abbr: "NFL" },
  { href: "/v2/cfb", label: "CFB Board", status: "COMING SOON" as SportStatus, abbr: "CFB" },
];

interface V2ShellProps {
  children: React.ReactNode;
  boardsMode?: boolean;
}

export default function V2Shell({ children, boardsMode = false }: V2ShellProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(true);
  // Dark mode toggle state (persists within session only — no localStorage per product rules)
  const [darkMode, setDarkMode] = useState(true);

  const bg    = darkMode ? T.bg      : "#F0ECE4";
  const surf1 = darkMode ? T.surface1: "#FFFFFF";
  const goldD = darkMode ? T.goldDim : "rgba(202,168,90,0.25)";

  const activeTop = TOP_NAV.find(n => {
    if (n.href === "/v2") return location === "/v2" || location === "/v2/";
    return location.startsWith(n.href);
  });

  return (
    <div
      data-theme={darkMode ? "dark" : "light"}
      className="flex h-screen overflow-hidden"
      style={{ background: bg }}
    >
      <style>{`
        @keyframes shellPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .shell-nav-item:focus-visible { outline: 2px solid #CAA85A; outline-offset: 2px; border-radius: 3px; }
        .shell-sport-pill:focus-visible { outline: 2px solid #CAA85A; outline-offset: 2px; border-radius: 3px; }
      `}</style>

      {/* ───── Sidebar ───── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 220, background: surf1, borderRight: `1px solid ${goldD}`, flexShrink: 0 }}
      >
        {/* Brand */}
        <div style={{ padding: "18px 16px 14px", borderBottom: `1px solid ${goldD}` }}>
          <Link href="/v2" onClick={() => setMobileOpen(false)}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
              <V2Logo />
              <div>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 18, color: T.text, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                  Edge Setter
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint }}>
                    Multi-Sport Intel
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto" style={{ padding: "8px 8px" }}>
          {TOP_NAV.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/v2"
              ? location === "/v2" || location === "/v2/"
              : location.startsWith(href);
            const isBoards = href === "/v2/nba";
            const showBoardsSub = isBoards && boardsMode;

            return (
              <div key={href}>
                <Link href={href} onClick={() => { setMobileOpen(false); if (isBoards) setBoardsOpen(o => !o); }}>
                  <div
                    className="shell-nav-item"
                    tabIndex={0}
                    role="link"
                    aria-label={`Navigate to ${label}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", marginBottom: 1,
                      borderRadius: 3, borderLeft: `2px solid ${isActive ? T.gold : "transparent"}`,
                      background: isActive ? "rgba(202,168,90,0.08)" : "transparent",
                      color: isActive ? T.gold : T.textMuted,
                      cursor: "pointer", transition: "background 0.12s, color 0.12s",
                    }}
                    onMouseEnter={e => { if (!isActive) { const el = e.currentTarget as HTMLDivElement; el.style.background = "rgba(202,168,90,0.04)"; el.style.color = T.text; } }}
                    onMouseLeave={e => { if (!isActive) { const el = e.currentTarget as HTMLDivElement; el.style.background = "transparent"; el.style.color = T.textMuted; } }}
                  >
                    <Icon size={15} strokeWidth={isActive ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
                    <span style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 14, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", flex: 1,
                    }}>{label}</span>
                    {isBoards && boardsMode && (
                      boardsOpen
                        ? <ChevronDown size={12} style={{ opacity: 0.5 }} />
                        : <ChevronRight size={12} style={{ opacity: 0.5 }} />
                    )}
                  </div>
                </Link>

                {/* Boards subnav */}
                {showBoardsSub && boardsOpen && (
                  <div style={{ marginLeft: 12, marginBottom: 4 }}>
                    {BOARDS_NAV.map(b => {
                      const bActive = location === b.href || location.startsWith(b.href + "/");
                      const disabled = b.status === "COMING SOON" || b.status === "OFFSEASON";
                      const s = STATUS_STYLE[b.status];
                      return (
                        <Link key={b.href} href={disabled ? location : b.href} onClick={() => { if (!disabled) setMobileOpen(false); }}>
                          <div
                            tabIndex={disabled ? -1 : 0}
                            role="link"
                            aria-label={`Go to ${b.label}${disabled ? " (not available)" : ""}`}
                            aria-disabled={disabled}
                            className="shell-nav-item"
                            style={{
                              display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", marginBottom: 1,
                              borderRadius: 3, borderLeft: `2px solid ${bActive ? T.gold : "transparent"}`,
                              background: bActive ? "rgba(202,168,90,0.06)" : "transparent",
                              color: bActive ? T.gold : disabled ? T.textFaint : T.textMuted,
                              cursor: disabled ? "not-allowed" : "pointer",
                              opacity: disabled ? 0.5 : 1,
                              transition: "background 0.1s, color 0.1s",
                            }}
                            onMouseEnter={e => { if (!disabled && !bActive) { const el = e.currentTarget as HTMLDivElement; el.style.background = "rgba(202,168,90,0.04)"; el.style.color = T.text; } }}
                            onMouseLeave={e => { if (!disabled && !bActive) { const el = e.currentTarget as HTMLDivElement; el.style.background = "transparent"; el.style.color = T.textMuted; } }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block", flexShrink: 0 }} />
                            <span style={{
                              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                              fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", flex: 1,
                            }}>{b.label}</span>
                            {disabled && (
                              <span style={{
                                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                                fontSize: 11, color: T.textFaint, letterSpacing: "0.08em",
                              }}>{b.status === "OFFSEASON" ? "OFF" : "SOON"}</span>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Divider */}
          <div style={{ margin: "12px 0", borderTop: `1px solid ${goldD}` }} />

          {/* Pro CTA */}
          <div style={{ padding: "0 2px 4px" }}>
            <div style={{ border: `1px solid rgba(202,168,90,0.22)`, borderRadius: 4, background: "rgba(202,168,90,0.04)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: T.gold }} />
              <div style={{ padding: "14px 12px 12px" }}>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14, fontWeight: 700, color: T.gold, marginBottom: 3 }}>Pro Intelligence</div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 12, color: T.textFaint, letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase",
                }}>Alerts · Full Archive · Multi-sport</div>
                <Link href="/pro">
                  <button
                    style={{
                      width: "100%", minHeight: 36,
                      background: T.gold, color: T.bg, border: "none", borderRadius: 3,
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
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
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(0,0,0,0.65)" }} onClick={() => setMobileOpen(false)} />
      )}

      {/* ───── Content area ───── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top utility bar */}
        <header
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "0 20px", minHeight: 48,
            background: surf1, borderBottom: `1px solid ${goldD}`,
            position: "sticky", top: 0, zIndex: 30, flexShrink: 0,
          }}
        >
          {/* Mobile menu trigger */}
          <button
            className="md:hidden"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileOpen(o => !o)}
            style={{ color: T.textMuted, background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textFaint,
            }}>Edge Setter</span>
            {activeTop && activeTop.href !== "/v2" && (
              <>
                <span style={{ color: T.textFaint, fontSize: 12 }}>›</span>
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.textMuted,
                }}>{activeTop.label}</span>
              </>
            )}
          </div>

          {/* ── Sport pills — REAL clickable routing ── */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <SportPill sport="NBA" status="LIVE"     href="/v2/nba" />
            <SportPill sport="MLB" status="ACTIVE"   href="/v2/mlb" />
            <SportPill sport="NFL" status="OFFSEASON" href="/v2/nfl" disabled />
            <SportPill sport="CFB" status="COMING SOON" href="/v2/cfb" disabled />

            {/* Dark mode toggle — real click action */}
            <button
              onClick={() => setDarkMode(d => !d)}
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={darkMode}
              style={{
                marginLeft: 6,
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 3,
                border: `1px solid rgba(202,168,90,0.22)`,
                background: "transparent",
                color: T.textMuted,
                cursor: "pointer",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
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
                el.style.borderColor = "rgba(202,168,90,0.22)";
              }}
            >
              {darkMode ? <Moon size={11} /> : <Sun size={11} />}
              {darkMode ? "Dark" : "Light"}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overscroll-contain" style={{ background: bg }}>
          {children}
        </main>
      </div>
    </div>
  );
}

/* ── V2 Logo ── */
function V2Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-label="Edge Setter v2 logo" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect width="30" height="30" rx="3" fill="#111317" />
      <polygon points="15,4 24,9.5 24,20.5 15,26 6,20.5 6,9.5" stroke="#CAA85A" strokeWidth="1.5" fill="none" />
      <line x1="15" y1="9" x2="15" y2="21" stroke="#CAA85A" strokeWidth="1.5" />
      <line x1="9" y1="15" x2="21" y2="15" stroke="#CAA85A" strokeWidth="1" opacity="0.55" />
      <circle cx="15" cy="15" r="2" fill="#D8B86A" />
    </svg>
  );
}
