import { Link, useLocation } from "wouter";
import { useState } from "react";
import {
  Home, LayoutGrid, Wrench, Star, List,
  ChevronDown, ChevronRight, Menu, X, Moon,
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
        fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

/* ── Top nav items ── */
const TOP_NAV = [
  { href: "/v2",          label: "Home",    icon: Home        },
  { href: "/v2/nba",      label: "Boards",  icon: LayoutGrid  },
  { href: "/v2/tools",    label: "Tools",   icon: Wrench      },
  { href: "/v2/my-edge",  label: "My Edge", icon: Star        },
  { href: "/v2/sources",  label: "Sources", icon: List        },
];

/* ── Board subnav (only shown inside /v2/nba, /v2/mlb, etc.) ── */
export const BOARDS_NAV = [
  { href: "/v2/nba", label: "NBA Board", status: "LIVE"        as SportStatus, abbr: "NBA" },
  { href: "/v2/mlb", label: "MLB Board", status: "ACTIVE"      as SportStatus, abbr: "MLB" },
  { href: "/v2/nfl", label: "NFL Board", status: "OFFSEASON"   as SportStatus, abbr: "NFL" },
  { href: "/v2/cfb", label: "CFB Board", status: "COMING SOON" as SportStatus, abbr: "CFB" },
];

interface V2ShellProps {
  children: React.ReactNode;
  /** Show the boards subnav in the sidebar */
  boardsMode?: boolean;
}

export default function V2Shell({ children, boardsMode = false }: V2ShellProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(true);

  // Active top-nav detection
  const activeTop = TOP_NAV.find(n => {
    if (n.href === "/v2") return location === "/v2" || location === "/v2/";
    return location.startsWith(n.href);
  });

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: T.bg }}>
      {/* ───── Sidebar ───── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 220, background: T.surface1, borderRight: `1px solid ${T.goldDim}`, flexShrink: 0 }}
      >
        {/* Brand */}
        <div style={{ padding: "18px 16px 14px", borderBottom: `1px solid ${T.goldDim}` }}>
          <Link href="/v2" onClick={() => setMobileOpen(false)}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
              <V2Logo />
              <div>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 18, color: T.text, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                  Edge Setter
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textFaint }}>
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
                    <Icon size={14} strokeWidth={isActive ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", flex: 1 }}>
                      {label}
                    </span>
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
                        <Link key={b.href} href={disabled ? "#" : b.href} onClick={() => setMobileOpen(false)}>
                          <div
                            style={{
                              display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", marginBottom: 1,
                              borderRadius: 3, borderLeft: `2px solid ${bActive ? T.gold : "transparent"}`,
                              background: bActive ? "rgba(202,168,90,0.06)" : "transparent",
                              color: bActive ? T.gold : disabled ? T.textFaint : T.textMuted,
                              cursor: disabled ? "default" : "pointer",
                              opacity: disabled ? 0.55 : 1,
                            }}
                          >
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block", flexShrink: 0 }} />
                            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", flex: 1 }}>
                              {b.label}
                            </span>
                            {(disabled) && (
                              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.1em" }}>
                                {b.status}
                              </span>
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
          <div style={{ margin: "12px 0", borderTop: `1px solid ${T.goldDim}` }} />

          {/* Pro CTA */}
          <div style={{ padding: "0 2px 4px" }}>
            <div style={{ border: `1px solid rgba(202,168,90,0.22)`, borderRadius: 4, background: "rgba(202,168,90,0.04)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: T.gold }} />
              <div style={{ padding: "14px 12px 12px" }}>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 12, fontWeight: 700, color: T.gold, marginBottom: 3 }}>Pro Intelligence</div>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>
                  Alerts · Full Archive · Multi-sport
                </div>
                <Link href="/pro">
                  <button style={{ width: "100%", minHeight: 34, background: T.gold, color: T.bg, border: "none", borderRadius: 3, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
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
            display: "flex", alignItems: "center", gap: 12,
            padding: "0 20px", minHeight: 48,
            background: T.surface1, borderBottom: `1px solid ${T.goldDim}`,
            position: "sticky", top: 0, zIndex: 30, flexShrink: 0,
          }}
        >
          <button className="md:hidden" onClick={() => setMobileOpen(o => !o)} style={{ color: T.textMuted, background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint }}>
              Edge Setter
            </span>
            {activeTop && activeTop.href !== "/v2" && (
              <>
                <span style={{ color: T.textFaint, fontSize: 12 }}>›</span>
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textMuted }}>
                  {activeTop.label}
                </span>
              </>
            )}
          </div>

          {/* Sport status pills — right side */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <SportBadge status="LIVE" />
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.1em" }}>NBA</span>
            <span style={{ color: T.textFaint, fontSize: 10 }}>·</span>
            <SportBadge status="ACTIVE" />
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.1em" }}>MLB</span>
            <span className="hidden md:inline" style={{ color: T.textFaint, fontSize: 10 }}>·</span>
            <span className="hidden md:inline" style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.1em" }}>NFL OFFSEASON · CFB COMING SOON</span>

            {/* Dark indicator */}
            <div style={{ marginLeft: 8, display: "flex", alignItems: "center", gap: 4, padding: "3px 7px", borderRadius: 3, border: "1px solid rgba(202,168,90,0.14)", color: T.textFaint }}>
              <Moon size={9} />
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Dark</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overscroll-contain" style={{ background: T.bg }}>
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
      {/* Hexagon outline — multi-sport */}
      <polygon points="15,4 24,9.5 24,20.5 15,26 6,20.5 6,9.5" stroke="#CAA85A" strokeWidth="1.5" fill="none" />
      {/* Inner cross */}
      <line x1="15" y1="9" x2="15" y2="21" stroke="#CAA85A" strokeWidth="1.5" />
      <line x1="9" y1="15" x2="21" y2="15" stroke="#CAA85A" strokeWidth="1" opacity="0.55" />
      {/* Center dot */}
      <circle cx="15" cy="15" r="2" fill="#D8B86A" />
    </svg>
  );
}
