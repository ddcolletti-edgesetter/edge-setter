import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { NBA_LOGOS, MLB_LOGOS } from "@/lib/espnAssets";
import {
  Activity, BarChart2, ChevronDown, ChevronRight,
  Home, LayoutGrid, List, Menu, Moon, Sun,
  Star, TrendingUp, Wrench, Zap, CreditCard,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
function useTheme() {
  return { theme: "dark" as const, toggleTheme: () => {} };
}

// ── Logo URL ────────────────────────────────────────────────────────────────
const LOGO_URL = "/edgesetter-logo-transparent_6b7a9796.png";

// ── Sport tab config ─────────────────────────────────────────────────────────
const SPORT_TABS = [
  { key: "nba", label: "NBA", path: "/nba", dot: "#F5A623" },
  { key: "mlb", label: "MLB", path: "/mlb", dot: "#39FF14" },
  { key: "nfl", label: "NFL", path: "/nfl", dot: "#4A9EFF" },
  { key: "cfb", label: "CFB", path: "/cfb", dot: "#B06EFF" },
];

// scroll helper
const scrollTo = (id: string) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

type NavItem = {
  label: string; path?: string; scrollId?: string;
  icon?: React.ReactNode; badge?: string; sub?: NavItem[];
};

const MLB_SUB: NavItem[] = [
  { label: "Signal Stream",   scrollId: "signal-feed",     icon: <Activity size={12} /> },
  { label: "Games Today",     scrollId: "games-section",   icon: <LayoutGrid size={12} /> },
  { label: "Pitcher News",    path: "/mlb?tab=pitchers",   icon: <Zap size={12} /> },
  { label: "Lineup Movement", path: "/mlb?tab=lineup",     icon: <List size={12} /> },
  { label: "Team Trends",     path: "/mlb?tab=trends",     icon: <TrendingUp size={12} /> },
  { label: "Line Movement",   path: "/mlb?tab=line_moves", icon: <BarChart2 size={12} /> },
];

const NBA_SUB: NavItem[] = [
  { label: "Signal Stream",   scrollId: "signal-feed",    icon: <Activity size={12} /> },
  { label: "Games Tonight",   scrollId: "games-section",  icon: <LayoutGrid size={12} /> },
  { label: "Injury Report",   path: "/nba?tab=injuries",  icon: <Zap size={12} /> },
  { label: "Lineup Movement", path: "/nba?tab=lineup",    icon: <List size={12} /> },
  { label: "Team Trends",     path: "/nba?tab=trends",    icon: <TrendingUp size={12} /> },
  { label: "Line Movement",   path: "/nba?tab=line_moves",icon: <BarChart2 size={12} /> },
];

const MLB_TEAMS_TODAY = ["HOU", "NYY", "LAD", "ATL", "CHC", "NYM", "BOS", "BAL"];
const NBA_TEAMS_TODAY = ["LAL", "BOS", "GSW", "DEN", "MIA", "MIL", "PHI", "NYK"];

// ── Pro CTA hook ─────────────────────────────────────────────────────────────
function useProCheckout() {
  const handleUpgrade = () => {};
  return { handleUpgrade, loading: false };
}

function ProUpgradeButton() {
  const { handleUpgrade, loading } = useProCheckout();
  return (
    <button
      onClick={handleUpgrade}
      disabled={loading}
      className="btn-gold"
      style={{ width: "100%", padding: "7px 12px", fontSize: "0.78rem", opacity: loading ? 0.7 : 1 }}
    >
      {loading ? "Redirecting…" : "$19 / Month"}
    </button>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
// FIX: Added `style` prop so AppShell can inject position:fixed for mobile drawer
function Sidebar({
  collapsed,
  onToggle,
  style: styleProp,
}: {
  collapsed: boolean;
  onToggle: () => void;
  style?: React.CSSProperties;
}) {
  const [location, setLocation] = useLocation();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (label: string) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path?: string) => path && location === path;

  return (
    <aside
      style={{
        width: "240px",
        minWidth: "240px",
        height: "100vh",
        background: "var(--es-surface-alt)",
        borderRight: "1px solid var(--es-border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
        // Desktop sticky positioning; overridden by styleProp on mobile
        position: "sticky",
        top: 0,
        ...styleProp,
      }}
    >
      {/* Logo */}
      <div
        style={{
          height: "72px",
          display: "flex",
          alignItems: "center",
          padding: collapsed ? "0 10px" : "0 14px 0 12px",
          borderBottom: "1px solid var(--es-border)",
          flexShrink: 0,
          gap: "8px",
          background: "var(--es-surface-alt)",
        }}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "36px", height: "36px",
            }}
          >
            <img
              src="/edgesetter-logo-transparent_6b7a9796.png"
              alt="Edge Setter"
              style={{ width: 34, height: 34, objectFit: "contain", borderRadius: "4px" }}
            />
          </button>
        ) : (
          <>
            <img
              src={LOGO_URL}
              alt="Edge Setter"
              style={{ height: "68px", maxWidth: "200px", objectFit: "contain", objectPosition: "left center" }}
              onError={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.display = "none";
                const p = el.parentElement!;
                const fb = document.createElement("div");
                fb.style.cssText =
                  "font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:1.4rem;color:#F5A623;letter-spacing:0.04em";
                fb.textContent = "EDGE SETTER";
                p.prepend(fb);
              }}
            />
            <div style={{ flex: 1 }} />
            <button
              onClick={onToggle}
              style={{
                background: "none", border: "none", padding: "4px",
                cursor: "pointer", color: "#555A66", borderRadius: "4px", flexShrink: 0,
              }}
            >
              <ChevronRight size={16} style={{ transform: "rotate(180deg)" }} />
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {/* Home */}
        <Link href="/">
          <div
            style={{
              display: "flex", alignItems: "center", gap: "10px", padding: "9px 16px",
              background: isActive("/") ? "rgba(245,166,35,0.08)" : "transparent",
              color: isActive("/") ? "var(--es-gold)" : "var(--es-text-muted)",
              fontSize: "0.82rem", fontWeight: isActive("/") ? 700 : 500,
              cursor: "pointer", transition: "all 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!isActive("/")) (e.currentTarget as HTMLElement).style.color = "var(--es-text-secondary)";
            }}
            onMouseLeave={(e) => {
              if (!isActive("/")) (e.currentTarget as HTMLElement).style.color = "var(--es-text-muted)";
            }}
          >
            <Home size={15} style={{ flexShrink: 0, color: isActive("/") ? "#F5A623" : "#555A66" }} />
            {!collapsed && <span>Home</span>}
          </div>
        </Link>

        {/* Boards section */}
        <button
          onClick={() => (collapsed ? setLocation("/nba") : toggleSection("Boards"))}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "9px 16px",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--es-text-muted)", fontSize: "0.82rem", fontWeight: 600,
            textAlign: "left", transition: "color 0.1s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--es-text-secondary)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--es-text-muted)")}
        >
          <LayoutGrid size={15} style={{ flexShrink: 0, color: "#555A66" }} />
          {!collapsed && (
            <>
              <span style={{ flex: 1 }}>Boards</span>
              <ChevronDown
                size={13}
                style={{
                  transform: openSections["Boards"] ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.15s", color: "#3A3F4E",
                }}
              />
            </>
          )}
        </button>

        {!collapsed && openSections["Boards"] && (
          <div>
            {/* NBA Board */}
            <Link href="/nba">
              <div
                style={{
                  display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px 7px 28px",
                  borderLeft: location.startsWith("/nba") ? "2px solid var(--es-gold)" : "2px solid transparent",
                  background: location.startsWith("/nba") ? "rgba(245,166,35,0.06)" : "transparent",
                  color: location.startsWith("/nba") ? "var(--es-gold)" : "var(--es-text-muted)",
                  fontSize: "0.82rem", fontWeight: location.startsWith("/nba") ? 700 : 500,
                  cursor: "pointer", transition: "all 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!location.startsWith("/nba"))
                    (e.currentTarget as HTMLElement).style.color = "var(--es-text-secondary)";
                }}
                onMouseLeave={(e) => {
                  if (!location.startsWith("/nba"))
                    (e.currentTarget as HTMLElement).style.color = "var(--es-text-muted)";
                }}
              >
                <span style={{ flex: 1 }}>NBA Board</span>
                <span
                  style={{
                    fontSize: "0.58rem", fontWeight: 800, padding: "1px 5px", borderRadius: "3px",
                    background: "rgba(57,255,20,0.15)", color: "#39FF14", letterSpacing: "0.06em",
                  }}
                >
                  LIVE
                </span>
              </div>
            </Link>
            {/* NBA sub-nav */}
            {location.startsWith("/nba") && (
              <div style={{ paddingLeft: "12px" }}>
                {NBA_SUB.map((sub) =>
                  sub.scrollId ? (
                    <div
                      key={sub.label}
                      onClick={() => scrollTo(sub.scrollId!)}
                      style={{
                        display: "flex", alignItems: "center", gap: "7px",
                        padding: "5px 12px 5px 28px",
                        color: "#555A66", fontSize: "0.75rem", cursor: "pointer", transition: "color 0.1s",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#A0A5B0")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#555A66")}
                    >
                      <span style={{ color: "#3A3F4E", flexShrink: 0 }}>{sub.icon}</span>
                      <span>{sub.label}</span>
                    </div>
                  ) : (
                    <Link key={sub.label} href={sub.path!}>
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: "7px",
                          padding: "5px 12px 5px 28px",
                          color: "#555A66", fontSize: "0.75rem", cursor: "pointer", transition: "color 0.1s",
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#A0A5B0")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#555A66")}
                      >
                        <span style={{ color: "#3A3F4E", flexShrink: 0 }}>{sub.icon}</span>
                        <span>{sub.label}</span>
                      </div>
                    </Link>
                  )
                )}
                <div
                  style={{
                    padding: "6px 12px 4px 28px", fontSize: "0.6rem", fontWeight: 700,
                    color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em",
                  }}
                >
                  Teams
                </div>
                <div style={{ padding: "0 8px 6px 28px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {NBA_TEAMS_TODAY.map((abbr) => (
                    <div
                      key={abbr}
                      style={{
                        display: "flex", alignItems: "center", gap: "4px",
                        padding: "3px 6px", borderRadius: "4px",
                        background: "rgba(255,255,255,0.03)", cursor: "pointer",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)")
                      }
                    >
                      <img
                        src={NBA_LOGOS[abbr] ?? ""}
                        alt={abbr}
                        style={{ width: 14, height: 14, objectFit: "contain" }}
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = "none";
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.68rem", color: "#8A9099",
                          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                        }}
                      >
                        {abbr}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MLB Board */}
            <Link href="/mlb">
              <div
                style={{
                  display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px 7px 28px",
                  borderLeft: location.startsWith("/mlb") ? "2px solid #39FF14" : "2px solid transparent",
                  background: location.startsWith("/mlb") ? "rgba(57,255,20,0.04)" : "transparent",
                  color: location.startsWith("/mlb") ? "var(--es-green)" : "var(--es-text-muted)",
                  fontSize: "0.82rem", fontWeight: location.startsWith("/mlb") ? 700 : 500,
                  cursor: "pointer", transition: "all 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!location.startsWith("/mlb"))
                    (e.currentTarget as HTMLElement).style.color = "var(--es-text-secondary)";
                }}
                onMouseLeave={(e) => {
                  if (!location.startsWith("/mlb"))
                    (e.currentTarget as HTMLElement).style.color = "var(--es-text-muted)";
                }}
              >
                <span style={{ flex: 1 }}>MLB Board</span>
                <span
                  style={{
                    fontSize: "0.58rem", fontWeight: 800, padding: "1px 5px", borderRadius: "3px",
                    background: "rgba(57,255,20,0.15)", color: "#39FF14", letterSpacing: "0.06em",
                  }}
                >
                  LIVE
                </span>
              </div>
            </Link>
            {/* MLB sub-nav */}
            {location.startsWith("/mlb") && (
              <div style={{ paddingLeft: "12px" }}>
                {MLB_SUB.map((sub) =>
                  sub.scrollId ? (
                    <div
                      key={sub.label}
                      onClick={() => scrollTo(sub.scrollId!)}
                      style={{
                        display: "flex", alignItems: "center", gap: "7px",
                        padding: "5px 12px 5px 28px",
                        color: "#555A66", fontSize: "0.75rem", cursor: "pointer", transition: "color 0.1s",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#A0A5B0")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#555A66")}
                    >
                      <span style={{ color: "#3A3F4E", flexShrink: 0 }}>{sub.icon}</span>
                      <span>{sub.label}</span>
                    </div>
                  ) : (
                    <Link key={sub.label} href={sub.path!}>
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: "7px",
                          padding: "5px 12px 5px 28px",
                          color: "#555A66", fontSize: "0.75rem", cursor: "pointer", transition: "color 0.1s",
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#A0A5B0")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#555A66")}
                      >
                        <span style={{ color: "#3A3F4E", flexShrink: 0 }}>{sub.icon}</span>
                        <span>{sub.label}</span>
                      </div>
                    </Link>
                  )
                )}
                <div
                  style={{
                    padding: "6px 12px 4px 28px", fontSize: "0.6rem", fontWeight: 700,
                    color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em",
                  }}
                >
                  Teams
                </div>
                <div style={{ padding: "0 8px 6px 28px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {MLB_TEAMS_TODAY.map((abbr) => (
                    <div
                      key={abbr}
                      style={{
                        display: "flex", alignItems: "center", gap: "4px",
                        padding: "3px 6px", borderRadius: "4px",
                        background: "rgba(255,255,255,0.03)", cursor: "pointer",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)")
                      }
                    >
                      <img
                        src={MLB_LOGOS[abbr] ?? ""}
                        alt={abbr}
                        style={{ width: 14, height: 14, objectFit: "contain" }}
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = "none";
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.68rem", color: "#8A9099",
                          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                        }}
                      >
                        {abbr}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* NFL / CFB */}
            {[
              { label: "NFL Board", path: "/nfl", badge: "PRE" },
              { label: "CFB Board", path: "/cfb", badge: "PRE" },
            ].map((b) => (
              <Link key={b.path} href={b.path}>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px 7px 28px",
                    borderLeft: "2px solid transparent", color: "#555A66",
                    fontSize: "0.82rem", cursor: "pointer", transition: "all 0.1s",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#D0D0D0")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#555A66")}
                >
                  <span style={{ flex: 1 }}>{b.label}</span>
                  <span
                    style={{
                      fontSize: "0.58rem", fontWeight: 800, padding: "1px 5px", borderRadius: "3px",
                      background: "rgba(245,166,35,0.15)", color: "#F5A623", letterSpacing: "0.06em",
                    }}
                  >
                    {b.badge}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Tools section */}
        <div
          style={{
            padding: "8px 16px 4px", fontSize: "0.62rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.1em", color: "#3A3F4E", marginTop: "4px",
          }}
        >
          Tools
        </div>
        {[
          { label: "Tools Hub",       path: "/tools",    icon: <Wrench size={15} /> },
          { label: "My Edge",         path: "/my-edge",  icon: <Star size={15} /> },
          { label: "Sources",         path: "/sources",  icon: <BarChart2 size={15} /> },
          { label: "Accuracy Ledger", path: "/accuracy", icon: <TrendingUp size={15} /> },
          { label: "Billing",         path: "/billing",  icon: <CreditCard size={15} /> },
        ].map((item) => (
          <Link key={item.path} href={item.path}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: "10px", padding: "9px 16px",
                background: isActive(item.path) ? "rgba(245,166,35,0.08)" : "transparent",
                color: isActive(item.path) ? "var(--es-gold)" : "var(--es-text-muted)",
                fontSize: "0.82rem", fontWeight: isActive(item.path) ? 700 : 500,
                cursor: "pointer", transition: "all 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!isActive(item.path))
                  (e.currentTarget as HTMLElement).style.color = "var(--es-text-secondary)";
              }}
              onMouseLeave={(e) => {
                if (!isActive(item.path))
                  (e.currentTarget as HTMLElement).style.color = "var(--es-text-muted)";
              }}
            >
              <span style={{ flexShrink: 0, color: isActive(item.path) ? "#F5A623" : "#555A66" }}>
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </div>
          </Link>
        ))}
      </div>

      {/* Pro CTA */}
      {!collapsed && (
        <div
          style={{
            margin: "8px 12px 12px",
            padding: "12px 14px",
            background: "linear-gradient(135deg, rgba(245,166,35,0.12), rgba(245,166,35,0.04))",
            border: "1px solid rgba(245,166,35,0.25)",
            borderRadius: "8px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: "0.72rem", fontWeight: 700, color: "#F5A623",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px",
            }}
          >
            Pro Intelligence
          </div>
          <div style={{ fontSize: "0.72rem", color: "#8A9099", marginBottom: "10px", lineHeight: 1.4 }}>
            Alerts · Full Archive · Multi-Sport
          </div>
          <ProUpgradeButton />
        </div>
      )}
    </aside>
  );
}

// ── Top Sport Tab Bar ─────────────────────────────────────────────────────────
// FIX: Added isMobile + onMenuToggle props; on mobile shows hamburger and
//      collapses PRO/theme buttons to icon-only; sport tabs scroll horizontally.
function TopTabBar({
  onMenuToggle,
  isMobile,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  onMenuToggle: () => void;
  isMobile: boolean;
}) {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const { handleUpgrade, loading: proLoading } = useProCheckout();
  const activeSport = SPORT_TABS.find((t) => location.startsWith(t.path))?.key ?? null;

  return (
    <div
      style={{
        height: "48px",
        background: "var(--es-surface-alt)",
        borderBottom: "1px solid var(--es-border)",
        display: "flex",
        alignItems: "center",
        paddingRight: isMobile ? "8px" : "16px",
        gap: isMobile ? "2px" : "4px",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 40,
        minWidth: 0,
      }}
    >
      {/* FIX: Hamburger button on mobile (opens drawer); collapse toggle on desktop */}
      <button
        onClick={onMenuToggle}
        style={{
          width: "48px",
          height: "48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#8A9099",
          flexShrink: 0,
          borderRight: "1px solid var(--es-border)",
        }}
      >
        <Menu size={18} />
      </button>

      {/* Brand label — hidden on mobile to save space */}
      {!isMobile && (
        <div
          style={{
            paddingLeft: "12px",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: "0.85rem",
            fontWeight: 800,
            color: "var(--es-text-faint)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginRight: "8px",
            flexShrink: 0,
          }}
        >
          EDGE SETTER
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Sport tabs — horizontally scrollable on mobile */}
      <div
        style={{
          display: "flex",
          gap: isMobile ? "0" : "2px",
          overflowX: isMobile ? "auto" : "visible",
          scrollbarWidth: "none",
          flexShrink: 1,
          minWidth: 0,
        }}
      >
        {SPORT_TABS.map((tab) => {
          const isActive = activeSport === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setLocation(tab.path)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: isMobile ? "6px 10px" : "6px 14px",
                borderRadius: "6px",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: isMobile ? "0.8rem" : "0.85rem",
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
                background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                color: isActive ? "#F0F0F0" : "#555A66",
                border: `1px solid ${isActive ? "#2A2F3E" : "transparent"}`,
                transition: "all 0.15s ease",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.color = "#A0A5B0";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.color = "#555A66";
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: isActive ? tab.dot : "#3A3F4E",
                  flexShrink: 0,
                  boxShadow: isActive ? `0 0 6px ${tab.dot}` : "none",
                }}
              />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* PRO button — icon-only on mobile */}
      <button
        onClick={handleUpgrade}
        disabled={proLoading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: isMobile ? "6px 10px" : "6px 14px",
          borderRadius: "6px",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: "0.82rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: "pointer",
          background: "linear-gradient(135deg, rgba(245,166,35,0.15), rgba(245,166,35,0.05))",
          color: "#F5A623",
          border: "1px solid rgba(245,166,35,0.3)",
          transition: "all 0.15s ease",
          marginLeft: isMobile ? "2px" : "8px",
          opacity: proLoading ? 0.7 : 1,
          flexShrink: 0,
        }}
      >
        <Zap size={12} />
        {/* FIX: hide text on mobile — icon-only PRO button */}
        {!isMobile && (proLoading ? "LOADING…" : "PRO — $19/MO")}
      </button>

      {/* Dark mode toggle — icon-only on mobile */}
      <button
        onClick={toggleTheme}
        title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: isMobile ? "6px 10px" : "6px 12px",
          borderRadius: "6px",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: "0.78rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: "pointer",
          background: isDark ? "transparent" : "rgba(139,105,20,0.1)",
          color: isDark ? "#555A66" : "#8B6914",
          border: `1px solid ${isDark ? "#1A1E2A" : "#C8BB9A"}`,
          marginLeft: "2px",
          transition: "all 0.2s ease",
          flexShrink: 0,
        }}
      >
        {isDark ? <Moon size={12} /> : <Sun size={12} />}
        {/* FIX: hide text on mobile */}
        {!isMobile && (isDark ? "DARK" : "LIGHT")}
      </button>
    </div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────
// boardsMode = true → NFL/CFB boards manage their own full layout (sidebar, header).
// V2Shell just provides the dark background wrapper + theme context in that case.
export default function AppShell({
  children,
  boardsMode,
}: {
  children: React.ReactNode;
  boardsMode?: boolean;
}) {
  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURN (React rules of hooks)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const { theme } = useTheme();
  const isLight = theme === "light";

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileDrawerOpen(false);
      if (mobile && !mobileDrawerOpen) setDesktopCollapsed(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mobileDrawerOpen]);

  const [location] = useLocation();
  useEffect(() => {
    if (isMobile) setMobileDrawerOpen(false);
  }, [location]);

  const handleMenuToggle = () => {
    if (isMobile) {
      setMobileDrawerOpen((o) => !o);
    } else {
      setDesktopCollapsed((c) => !c);
    }
  };

  // boardsMode: NFL/CFB manage their own layout — just wrap in dark container
  if (boardsMode) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          background: "#0C0B09",
          color: "#F3EFE6",
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: isLight ? "var(--es-bg)" : "#0C0B09",
        backgroundImage: isLight ? "var(--es-paper-texture)" : "none",
        backgroundSize: isLight ? "300px 300px" : "auto",
        color: "var(--es-text-primary)",
        fontFamily: "var(--es-body-font)",
      }}
    >
      {/* FIX: Mobile overlay backdrop — tapping it closes the drawer */}
      {isMobile && mobileDrawerOpen && (
        <div
          onClick={() => setMobileDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            zIndex: 49,
          }}
        />
      )}

      {/* FIX: On mobile, sidebar is a fixed overlay drawer (no layout impact).
               On desktop, it stays in flow as before. */}
      {isMobile ? (
        <Sidebar
          collapsed={false}
          onToggle={() => setMobileDrawerOpen(false)}
          style={{
            // Overlay the content instead of pushing it
            position: "fixed",
            top: 0,
            left: 0,
            height: "100dvh",
            zIndex: 50,
            // Slide in/out
            transform: mobileDrawerOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.25s ease",
          }}
        />
      ) : (
        <Sidebar
          collapsed={desktopCollapsed}
          onToggle={() => setDesktopCollapsed((c) => !c)}
        />
      )}

      {/* Main area — takes full width on mobile (sidebar is overlaid, not in flow) */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        <TopTabBar
          collapsed={desktopCollapsed}
          onToggle={handleMenuToggle}
          onMenuToggle={handleMenuToggle}
          isMobile={isMobile}
        />
        <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Named exports required by NFL/CFB boards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useShellTheme — returns true when the app is in dark mode.
 * Used by NFLBoard, CFBBoard, FlagshipHome to drive their own theme tokens.
 */
export function useShellTheme(): boolean {
  const { theme } = useTheme();
  return theme === "dark";
}

/**
 * SportBadge — small status pill shown in board headers.
 * status = "LIVE" | "ACTIVE" | "PRE" | etc.
 */
export function SportBadge({ status }: { status: string }) {
  const isLive = status === "LIVE";
  const color = isLive ? "#39FF14" : "#F5A623";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 9px",
        borderRadius: "3px",
        background: `${color}18`,
        border: `1px solid ${color}44`,
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: "0.65rem",
        fontWeight: 800,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          boxShadow: isLive ? `0 0 6px ${color}` : "none",
        }}
      />
      {status}
    </span>
  );
}
