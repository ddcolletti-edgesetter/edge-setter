import { Link, useLocation } from "wouter";
import { type Theme } from "../App";
import {
  LayoutDashboard, Star, Shield, Zap, ListChecks, FileText,
  Sun, Moon, Menu, X, Activity
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const navItems = [
  { href: "/dashboard",   label: "Signal Board",  icon: LayoutDashboard },
  { href: "/draft",       label: "Draft Board",   icon: Star            },
  { href: "/leaderboard", label: "Sources",       icon: ListChecks      },
  { href: "/alerts",      label: "Alerts",        icon: Zap             },
  { href: "/admin",       label: "Review Queue",  icon: Shield          },
  { href: "/logs",        label: "Agent Logs",    icon: FileText        },
];

const navGroups = [
  { label: "Intelligence", items: ["/dashboard", "/draft"] },
  { label: "Analytics",    items: ["/leaderboard", "/alerts"] },
  { label: "Operations",   items: ["/admin", "/logs"] },
];

/* ── Design tokens ── */
const T = {
  bg:        "#0A0B0D",
  surface1:  "#111317",
  surface2:  "#16191E",
  gold:      "#CAA85A",
  goldBright:"#D8B86A",
  goldDim:   "rgba(202,168,90,0.16)",
  text:      "#F3EFE6",
  textMuted: "#B7AFA0",
  textFaint: "#7E776A",
  cyan:      "hsl(194 56% 55%)",
  danger:    "#D94B4B",
};

interface Props {
  children: React.ReactNode;
  theme: Theme;
  toggleTheme: () => void;
}

export default function AppLayout({ children, theme, toggleTheme }: Props) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    queryFn: () => apiRequest("GET", "/api/stats").then(r => r.json()),
    refetchInterval: 30000,
  });

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: T.bg }}
      data-testid="app-layout"
    >
      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col
          transform transition-transform duration-200
          md:static md:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{
          width: 224,
          background: T.surface1,
          borderRight: `1px solid ${T.goldDim}`,
          flexShrink: 0,
        }}
        data-testid="sidebar"
      >
        {/* ── Brand ── */}
        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom: `1px solid ${T.goldDim}`,
          }}
        >
          <Link href="/" onClick={() => setMobileOpen(false)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <EdgeSetterLogo />
              <div>
                <div
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontWeight: 700,
                    fontSize: 15,
                    letterSpacing: "-0.01em",
                    color: T.text,
                    lineHeight: 1.2,
                  }}
                >
                  Edge Setter
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                  <span
                    className="live-dot"
                    style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: T.gold, display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.16em",
                      textTransform: "uppercase", color: T.textFaint,
                    }}
                  >
                    NFL Intelligence
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* ── Nav ── */}
        <nav
          className="flex-1 overflow-y-auto"
          style={{ padding: "10px 10px" }}
          role="navigation"
          aria-label="Main navigation"
        >
          {navGroups.map(group => {
            const groupItems = navItems.filter(i => group.items.includes(i.href));
            return (
              <div key={group.label} style={{ marginBottom: 6 }}>
                <div
                  style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.22em",
                    textTransform: "uppercase", color: T.textFaint,
                    padding: "10px 12px 4px",
                    userSelect: "none",
                  }}
                >
                  {group.label}
                </div>
                {groupItems.map(({ href, label, icon: Icon }) => {
                  const active = location === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          padding: "9px 12px",
                          marginBottom: 2,
                          borderRadius: 3,
                          borderLeft: `2px solid ${active ? T.gold : "transparent"}`,
                          background: active ? "rgba(202,168,90,0.08)" : "transparent",
                          color: active ? T.gold : T.textMuted,
                          cursor: "pointer",
                          transition: "background 0.12s, color 0.12s",
                          fontSize: 13,
                          fontWeight: active ? 600 : 500,
                        }}
                        onMouseEnter={e => {
                          if (!active) {
                            const el = e.currentTarget as HTMLDivElement;
                            el.style.background = "rgba(202,168,90,0.05)";
                            el.style.color = T.text;
                          }
                        }}
                        onMouseLeave={e => {
                          if (!active) {
                            const el = e.currentTarget as HTMLDivElement;
                            el.style.background = "transparent";
                            el.style.color = T.textMuted;
                          }
                        }}
                      >
                        <Icon size={14} strokeWidth={active ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
                        <span
                          style={{
                            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                          }}
                        >
                          {label}
                        </span>
                        {href === "/admin" && stats?.review_queue > 0 && (
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: 9, fontWeight: 700,
                              padding: "2px 6px", borderRadius: 2,
                              background: "rgba(217,75,75,0.15)",
                              color: "#E07070",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {stats.review_queue}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* ── Pro CTA ── */}
        <div style={{ padding: "0 12px 12px" }}>
          <div
            style={{
              border: `1px solid rgba(202,168,90,0.28)`,
              borderRadius: 4,
              background: "rgba(202,168,90,0.05)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* gold top accent line */}
            <div
              style={{
                position: "absolute", top: 0, left: 0, right: 0,
                height: 2, background: T.gold,
                pointerEvents: "none",
              }}
            />
            <div style={{ padding: "16px 14px 14px" }}>
              <div
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 13, fontWeight: 700, color: T.gold,
                  marginBottom: 3, lineHeight: 1.3,
                }}
              >
                Pro Intelligence
              </div>
              <div
                style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, color: T.textFaint, letterSpacing: "0.08em",
                  marginBottom: 12, lineHeight: 1.5,
                  textTransform: "uppercase",
                }}
              >
                Real-time alerts · Full archive
              </div>
              <Link href="/">
                <button
                  data-testid="button-upgrade-pro"
                  style={{
                    width: "100%",
                    minHeight: 38,
                    background: T.gold,
                    color: T.bg,
                    border: "none",
                    borderRadius: 3,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "background 0.15s",
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

        {/* ── Stats strip ── */}
        {stats && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1,
              borderTop: `1px solid ${T.goldDim}`,
              background: T.goldDim,
            }}
          >
            {[
              { label: "Signals", value: stats.total_signals ?? 0 },
              { label: "Sources", value: stats.sources_tracked ?? 0 },
            ].map(stat => (
              <div
                key={stat.label}
                style={{
                  textAlign: "center",
                  padding: "14px 8px",
                  background: T.surface1,
                }}
              >
                <div
                  className="stat-num-display"
                  style={{ fontSize: 22, color: T.text }}
                >
                  {stat.value}
                </div>
                <div
                  className="data-label"
                  style={{ marginTop: 2 }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Mobile overlay — non-interactive background */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: "rgba(0,0,0,0.65)", pointerEvents: "auto" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header
          className="masthead-dateline flex items-center gap-4 sticky top-0 z-30"
          style={{ padding: "0 24px", minHeight: 52 }}
          data-testid="topbar"
        >
          {/* Mobile menu toggle */}
          <button
            className="md:hidden"
            onClick={() => setMobileOpen(o => !o)}
            data-testid="button-mobile-menu"
            aria-label="Toggle menu"
            style={{
              color: T.textMuted,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              transition: "color 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = T.text; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = T.textMuted; }}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity
              size={10}
              style={{ color: T.gold }}
            />
            <span
              style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700,
                letterSpacing: "0.16em", textTransform: "uppercase",
                color: T.textFaint,
              }}
            >
              NFL Intelligence
            </span>
            {stats?.review_queue > 0 && (
              <>
                <span style={{ color: T.textFaint, fontSize: 10 }}>·</span>
                <span
                  style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.10em", textTransform: "uppercase",
                    color: "#E07070",
                  }}
                >
                  {stats.review_queue} Pending Review
                </span>
              </>
            )}
          </div>

          {/* Right actions */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button
              data-testid="button-theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              style={{
                background: "none",
                border: "none",
                color: T.textFaint,
                cursor: "pointer",
                padding: "6px",
                display: "flex",
                alignItems: "center",
                borderRadius: 3,
                transition: "color 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = T.text; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = T.textFaint; }}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            <Link href="/">
              <button
                data-testid="button-go-home"
                style={{
                  background: "transparent",
                  border: `1px solid rgba(202,168,90,0.32)`,
                  borderRadius: 3,
                  color: T.gold,
                  cursor: "pointer",
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  padding: "7px 16px",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = "rgba(202,168,90,0.08)";
                  b.style.borderColor = "rgba(202,168,90,0.55)";
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = "transparent";
                  b.style.borderColor = "rgba(202,168,90,0.32)";
                }}
              >
                Home
              </button>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{ background: T.bg }}
          data-testid="main-content"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/* ── Edge Setter Logo SVG ── */
function EdgeSetterLogo() {
  return (
    <svg
      width="32" height="32" viewBox="0 0 32 32" fill="none"
      aria-label="Edge Setter logo"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      {/* Background */}
      <rect width="32" height="32" rx="3" fill="#111317" />
      {/* Top gold rule — full */}
      <rect x="6" y="7"  width="20" height="2.5" rx="0.5" fill="#CAA85A" />
      {/* Middle gold rule — short */}
      <rect x="6" y="14.75" width="13" height="2.5" rx="0.5" fill="#CAA85A" />
      {/* Bottom gold rule — full */}
      <rect x="6" y="22.5" width="20" height="2.5" rx="0.5" fill="#CAA85A" />
      {/* Gold accent right tick */}
      <rect x="21" y="14.75" width="5" height="2.5" rx="0.5" fill="#D8B86A" opacity="0.55" />
    </svg>
  );
}
