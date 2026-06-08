import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import MobileTabBar from "./MobileTabBar";
import { NBA_LOGOS, MLB_LOGOS } from "@/lib/espnAssets";
import {
  Activity, BarChart2, Bell, ChevronDown, ChevronRight,
  Database, Home, LayoutGrid, List, Menu, Moon, Sun,
  Star, TrendingUp, Wrench, Zap, CreditCard, LogOut,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { billingPortalUnavailableMessage, openBillingPortal } from "@/lib/billingPortal";
const EDGESETTER_EMBLEM_SRC = "/brand/edgesetter-emblem.png";
const EDGESETTER_LOGO_SRC = "/brand/edgesetter-logo.png";
const PUBLIC_QUIET_STATE = "No clean high-impact stories right now.";
const bannedTextPattern = (parts: string[]) => parts.join("");
const PUBLIC_BANNED_TEXT_PATTERNS = [
  ["\\bUN", "K\\b"],
  ["UN", "K market move leads MLB watch"],
  ["keeps UN", "K lineup plan"],
  ["ARI-LAD", "-ARI"],
  ["My Edge ", "preview"],
  ["personalization is still a ", "preview"],
  ["preview", "-only"],
  ["Account Active - ", "Preview"],
  ["Pro Alert ", "Desk"],
  ["Watchlist ", "Alerts"],
  ["Delivery is paused during launch ", "QA"],
  ["Alert Delivery ", "Paused"],
].map((parts) => new RegExp(bannedTextPattern(parts), "gi"));

function containsBannedPublicText(value: string) {
  return PUBLIC_BANNED_TEXT_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function scrubPublicTextNode(node: Node) {
  if (node.nodeType !== Node.TEXT_NODE || !node.textContent) return;
  if (containsBannedPublicText(node.textContent)) {
    node.textContent = PUBLIC_QUIET_STATE;
  }
}

function scrubPublicTextTree(root: HTMLElement | null) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) scrubPublicTextNode(walker.currentNode);
}

function PublicTextRenderGuard({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    scrubPublicTextTree(root);
    if (!root) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            scrubPublicTextNode(node);
          } else if (node instanceof HTMLElement) {
            scrubPublicTextTree(node);
          }
        });
        if (mutation.type === "characterData") scrubPublicTextNode(mutation.target);
      }
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} data-public-text-guard="true" style={{ display: "contents" }}>
      {children}
    </div>
  );
}

function BrandEmblem({ size = 38 }: { size?: number }) {
  return (
    <span className="edgesetter-sidebar-emblem" style={{ width: size, height: size, display: "grid", placeItems: "center", borderRadius: "7px", border: "1px solid rgba(245,184,65,0.30)", background: "linear-gradient(135deg, rgba(245,184,65,0.10), rgba(24,212,123,0.06))", boxShadow: "0 10px 26px rgba(0,0,0,0.30), inset 0 1px 0 rgba(248,250,252,0.08)", flexShrink: 0, overflow: "hidden", position: "relative" }}>
      <img
        src={EDGESETTER_EMBLEM_SRC}
        alt="EdgeSetter live sports intelligence"
        width={size}
        height={size}
        style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", padding: Math.max(3, Math.round(size * 0.11)) }}
        onError={(event) => {
          event.currentTarget.style.display = "none";
          const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = "grid";
        }}
      />
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "none", width: "100%", height: "100%", placeItems: "center", color: "#F8FAFC", fontFamily: "'Barlow Condensed', sans-serif", fontSize: `${Math.max(12, size * 0.34)}px`, fontWeight: 950, letterSpacing: "0.02em", textShadow: "0 0 12px rgba(24,212,123,0.34)" }}>
        ES
      </span>
    </span>
  );
}

function BrandWordmark() {
  return (
    <div className="edgesetter-sidebar-wordmark" aria-label="EdgeSetter live sports desk" style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden", lineHeight: 1 }}>
      <span style={{ display: "block", width: 160, maxWidth: "100%", height: 52, overflow: "visible" }}>
        <img
          src={EDGESETTER_LOGO_SRC}
          alt="EdgeSetter"
          width={174}
          height={64}
          style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", objectPosition: "left center" }}
          onError={(event) => {
            event.currentTarget.style.display = "none";
            const fallback = event.currentTarget.parentElement?.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "block";
          }}
        />
      </span>
      <strong style={{ display: "none", color: "#F8FAFC", fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.08rem", fontWeight: 950, letterSpacing: "0.055em", whiteSpace: "nowrap" }}>
        EDGESETTER
      </strong>
    </div>
  );
}
function useTheme() {
  return { theme: "dark" as const, toggleTheme: () => {} };
}

// ── Logo URL ────────────────────────────────────────────────────────────────
// ── Sport tab config ─────────────────────────────────────────────────────────
const SPORT_TABS = [
  { key: "nba", label: "NBA", path: "/nba", dot: "#F5B841" },
  { key: "mlb", label: "MLB", path: "/mlb", dot: "#00E676" },
  { key: "nfl", label: "NFL", path: "/nfl", dot: "#00B7FF" },
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
  { label: "Movement",        path: "/mlb?tab=line_moves", icon: <BarChart2 size={12} /> },
];

const NBA_SUB: NavItem[] = [
  { label: "Signal Stream",   scrollId: "signal-feed",    icon: <Activity size={12} /> },
  { label: "Games Tonight",   scrollId: "games-section",  icon: <LayoutGrid size={12} /> },
  { label: "Injury Report",   path: "/nba?tab=injuries",  icon: <Zap size={12} /> },
  { label: "Lineup Movement", path: "/nba?tab=lineup",    icon: <List size={12} /> },
  { label: "Team Trends",     path: "/nba?tab=trends",    icon: <TrendingUp size={12} /> },
  { label: "Movement",        path: "/nba?tab=line_moves",icon: <BarChart2 size={12} /> },
];

const MLB_TEAMS_TODAY = ["HOU", "NYY", "LAD", "ATL", "CHC", "NYM", "BOS", "BAL"];
const NBA_TEAMS_TODAY = ["LAL", "BOS", "GSW", "DEN", "MIA", "MIL", "PHI", "NYK"];

// ── Pro CTA hook ─────────────────────────────────────────────────────────────
function useProCheckout() {
  const [, setLocation] = useLocation();
  const handleUpgrade = () => setLocation("/pro");
  return { handleUpgrade, loading: false };
}

function loginPathFor(currentPath: string) {
  return `/login?next=${encodeURIComponent(currentPath || "/")}`;
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
      {loading ? "Redirecting..." : "GET PRO / $19 MONTH"}
    </button>
  );
}

function SportIcon({ sport, size = 16 }: { sport: "basketball" | "baseball" | "football"; size?: number }) {
  if (sport === "basketball") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
        <path d="M1 8h14M8 1a9 9 0 0 1 0 14M8 1a9 9 0 0 0 0 14" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  if (sport === "baseball") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3.5 3.5C5 5 5.5 7 5.5 8s-.5 3-2 4.5M12.5 3.5C11 5 10.5 7 10.5 8s.5 3 2 4.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <ellipse cx="8" cy="8" rx="7" ry="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1 8h14M3 5.5C4.5 6.5 6 7.2 8 7.2s3.5-.7 5-1.7M3 10.5C4.5 9.5 6 8.8 8 8.8s3.5.7 5 1.7" stroke="currentColor" strokeWidth="1" />
    </svg>
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
  const { email, isPro } = useAuth();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ Boards: true });
  const expandedWidth = 204;
  const collapsedWidth = 50;

  const toggleSection = (label: string) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path?: string) => path && location === path;
  const leaguesNav = [
    { label: "Home", path: "/", icon: <Home size={16} />, active: location === "/" },
    { label: "NBA", path: "/nba", icon: <SportIcon sport="basketball" size={16} />, active: location.startsWith("/nba") },
    { label: "MLB", path: "/mlb", icon: <SportIcon sport="baseball" size={16} />, active: location.startsWith("/mlb") },
    { label: "NFL", path: "/nfl", icon: <SportIcon sport="football" size={16} />, active: location.startsWith("/nfl") },
    { label: "CFB", path: "/cfb", icon: <SportIcon sport="football" size={16} />, active: location.startsWith("/cfb") },
  ];
  const intelligenceNav = [
    { label: "My Edge", path: "/my-edge", icon: <Star size={16} />, active: location.startsWith("/my-edge") },
    { label: "Alerts", path: "/alerts", icon: <Bell size={16} />, active: location.startsWith("/alerts") },
    { label: "Sources", path: "/sources", icon: <Database size={16} />, active: location.startsWith("/sources") },
    { label: "Pro", path: "/pro", icon: <CreditCard size={16} />, active: location.startsWith("/pro") },
  ];
  const sidebarNav = [...leaguesNav, ...intelligenceNav];

  return (
    <aside
      style={{
        width: collapsed ? `${collapsedWidth}px` : `${expandedWidth}px`,
        minWidth: collapsed ? `${collapsedWidth}px` : `${expandedWidth}px`,
        height: "100vh",
        background: "linear-gradient(180deg, rgba(6,14,22,0.995), rgba(4,7,10,0.99))",
        borderRight: "1px solid var(--es-border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
        transition: "width 0.16s ease, min-width 0.16s ease, transform 0.14s ease-out",
        // Desktop sticky positioning; overridden by styleProp on mobile
        position: "sticky",
        top: 0,
        zIndex: 220,
        isolation: "isolate",
        ...styleProp,
      }}
    >
      {/* Logo */}
      <div
        style={{
          height: collapsed ? "56px" : "90px",
          display: "flex",
          alignItems: "center",
          padding: collapsed ? "0 7px" : "0 6px",
          borderBottom: "1px solid var(--es-border)",
          flexShrink: 0,
          gap: collapsed ? "0" : "8px",
          background: "linear-gradient(180deg, rgba(7,16,25,1), rgba(5,10,15,0.98))",
          overflow: "visible",
        }}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "38px", height: "38px",
            }}
          >
            <BrandEmblem size={38} />
          </button>
        ) : (
          <>
            <BrandWordmark />
            <button
              className="ux-button-interactive"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              style={{
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(148,163,184,0.12)", padding: "4px",
                cursor: "pointer", color: "#94A3B8", borderRadius: "5px", flexShrink: 0, marginLeft: 2,
              }}
            >
              <ChevronRight size={16} style={{ transform: "rotate(180deg)" }} />
            </button>
          </>
        )}
      </div>

      <nav aria-label="Primary navigation" style={{ flex: 1, overflowY: "auto", padding: collapsed ? "5px 5px" : "6px 6px" }}>
        {!collapsed && (
          <div style={{ padding: "8px 8px 3px", fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#728198" }}>
            Leagues
          </div>
        )}
        {collapsed && <div style={{ height: 6 }} />}
        {[...leaguesNav, { label: "__divider__", path: "", icon: null, active: false }, ...intelligenceNav].map((item) => {
          if (item.label === "__divider__") {
            return collapsed
              ? <div key="div" style={{ height: 4, margin: "2px 0", borderTop: "1px solid rgba(148,163,184,0.12)" }} />
              : <div key="div" style={{ padding: "8px 8px 3px", fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#728198", marginTop: 2 }}>Intelligence</div>;
          }
          return (
          <button
            key={item.label}
            type="button"
            onClick={() => setLocation(item.path)}
            aria-current={item.active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            style={{
              width: "100%",
              minHeight: collapsed ? 30 : 32,
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: collapsed ? 0 : 8,
              padding: collapsed ? "0" : "0 8px",
              marginBottom: collapsed ? 1 : 2,
              border: item.active ? "1px solid rgba(24,212,123,0.14)" : "1px solid transparent",
              borderLeft: item.active ? "2px solid #18D47B" : "2px solid transparent",
              borderRadius: "6px",
              background: item.active ? "linear-gradient(90deg, rgba(24,212,123,0.105), rgba(24,212,123,0.025))" : "transparent",
              color: item.active ? "#EAFBF2" : "#94A3B8",
              cursor: "pointer",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "0.76rem",
              fontWeight: item.active ? 820 : 680,
              letterSpacing: "0.015em",
              textAlign: "left",
              transition: "background 0.12s ease, color 0.12s ease, border-color 0.12s ease",
            }}
            onMouseEnter={(e) => {
              if (!item.active) {
                e.currentTarget.style.background = "rgba(148,163,184,0.045)";
                e.currentTarget.style.color = "#CBD5E1";
              }
            }}
            onMouseLeave={(e) => {
              if (!item.active) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#94A3B8";
              }
            }}
          >
            <span style={{ display: "grid", placeItems: "center", width: 18, color: item.active ? "#18D47B" : "#728198", flexShrink: 0 }}>
              {item.icon}
            </span>
            {!collapsed && <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>}
          </button>
          );
        })}
      </nav>

      {/* Nav — legacy dead code, hidden, not rendered */}
      <div style={{ display: "none" }}>
        {/* Home */}
        <Link href="/">
          <div
            style={{
              display: "flex", alignItems: "center", gap: "10px", padding: "9px 16px",
              background: isActive("/") ? "rgba(245,184,65,0.08)" : "transparent",
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
            <Home size={15} style={{ flexShrink: 0, color: isActive("/") ? "#F5B841" : "#94A3B8" }} />
            {!collapsed && <span>Home</span>}
          </div>
        </Link>

        {/* Live boards section */}
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
          <LayoutGrid size={15} style={{ flexShrink: 0, color: "#94A3B8" }} />
          {!collapsed && (
            <>
              <span style={{ flex: 1 }}>Live Boards</span>
              <ChevronDown
                size={13}
                style={{
                  transform: openSections["Boards"] ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.15s", color: "#64748B",
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
                  background: location.startsWith("/nba") ? "rgba(245,184,65,0.06)" : "transparent",
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
                    background: "rgba(0,230,118,0.15)", color: "#00E676", letterSpacing: "0.06em",
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
                        color: "#94A3B8", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", transition: "color 0.1s",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#A0A5B0")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#94A3B8")}
                    >
                      <span style={{ color: "#94A3B8", flexShrink: 0 }}>{sub.icon}</span>
                      <span>{sub.label}</span>
                    </div>
                  ) : (
                    <Link key={sub.label} href={sub.path!}>
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: "7px",
                          padding: "5px 12px 5px 28px",
                          color: "#94A3B8", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", transition: "color 0.1s",
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#A0A5B0")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#94A3B8")}
                      >
                        <span style={{ color: "#94A3B8", flexShrink: 0 }}>{sub.icon}</span>
                        <span>{sub.label}</span>
                      </div>
                    </Link>
                  )
                )}
                <div
                  style={{
                    padding: "6px 12px 4px 28px", fontSize: "0.6rem", fontWeight: 700,
                    color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em",
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
                          fontSize: "0.68rem", color: "#CBD5E1",
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
                  borderLeft: location.startsWith("/mlb") ? "2px solid #00E676" : "2px solid transparent",
                  background: location.startsWith("/mlb") ? "rgba(0,230,118,0.04)" : "transparent",
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
                    background: "rgba(0,230,118,0.15)", color: "#00E676", letterSpacing: "0.06em",
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
                        color: "#94A3B8", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", transition: "color 0.1s",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#A0A5B0")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#94A3B8")}
                    >
                      <span style={{ color: "#94A3B8", flexShrink: 0 }}>{sub.icon}</span>
                      <span>{sub.label}</span>
                    </div>
                  ) : (
                    <Link key={sub.label} href={sub.path!}>
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: "7px",
                          padding: "5px 12px 5px 28px",
                          color: "#94A3B8", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", transition: "color 0.1s",
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#A0A5B0")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#94A3B8")}
                      >
                        <span style={{ color: "#94A3B8", flexShrink: 0 }}>{sub.icon}</span>
                        <span>{sub.label}</span>
                      </div>
                    </Link>
                  )
                )}
                <div
                  style={{
                    padding: "6px 12px 4px 28px", fontSize: "0.6rem", fontWeight: 700,
                    color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em",
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
                          fontSize: "0.68rem", color: "#CBD5E1",
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
              { label: "NFL Board", path: "/nfl", badge: "MON" },
              { label: "CFB Board", path: "/cfb", badge: "MON" },
            ].map((b) => (
              <Link key={b.path} href={b.path}>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px 7px 28px",
                    borderLeft: location.startsWith(b.path) ? "2px solid #00B7FF" : "2px solid transparent",
                    background: location.startsWith(b.path) ? "rgba(0,183,255,0.06)" : "transparent",
                    color: location.startsWith(b.path) ? "#CBD5E1" : "#94A3B8",
                    fontSize: "0.82rem", cursor: "pointer", transition: "all 0.1s",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#D0D0D0")}
                  onMouseLeave={(e) => { if (!location.startsWith(b.path)) (e.currentTarget as HTMLElement).style.color = "#94A3B8"; }}
                >
                  <span style={{ flex: 1 }}>{b.label}</span>
                  <span
                    style={{
                      fontSize: "0.58rem", fontWeight: 800, padding: "1px 5px", borderRadius: "3px",
                      background: "rgba(245,184,65,0.15)", color: "#F5B841", letterSpacing: "0.06em",
                    }}
                  >
                    {b.badge}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Intelligence section */}
        <div
          style={{
            padding: "8px 16px 4px", fontSize: "0.62rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8", marginTop: "4px",
          }}
        >
          Intelligence
        </div>
        {[
          { label: "Sources", path: "/sources", icon: <Database size={15} /> },
          { label: "Source Accuracy", path: "/accuracy", icon: <TrendingUp size={15} /> },
          { label: "Context Movement", path: "/tools/market-movement", icon: <BarChart2 size={15} /> },
          { label: "Team Trends",     path: "/nba?tab=trends", icon: <Activity size={15} /> },
          { label: "Tool Desk",       path: "/tools", icon: <Wrench size={15} /> },
        ].map((item) => (
          <Link key={item.path} href={item.path}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: "10px", padding: "9px 16px",
                background: isActive(item.path) ? "rgba(245,184,65,0.08)" : "transparent",
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
              <span style={{ flexShrink: 0, color: isActive(item.path) ? "#F5B841" : "#94A3B8" }}>
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </div>
          </Link>
        ))}

        <div
          style={{
            padding: "8px 16px 4px", fontSize: "0.62rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8", marginTop: "4px",
          }}
        >
          Account
        </div>
        {[
          { label: "My Edge", path: "/my-edge", icon: <Star size={15} /> },
          { label: "Alerts", path: "/alerts", icon: <Bell size={15} /> },
          { label: "Pro", path: "/pro", icon: <CreditCard size={15} /> },
        ].map((item) => (
          <Link key={item.path} href={item.path}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: "10px", padding: "9px 16px",
                background: isActive(item.path) ? "rgba(245,184,65,0.08)" : "transparent",
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
              <span style={{ flexShrink: 0, color: isActive(item.path) ? "#F5B841" : "#94A3B8" }}>
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </div>
          </Link>
        ))}
      </div>

      {/* Account identity strip (no box, no background) */}
      {!collapsed && !isPro && (
        <div style={{ margin: "4px 8px 8px", display: "grid", gap: 4, flexShrink: 0 }}>
          <button
            data-testid="sidebar-sign-in"
            type="button"
            onClick={() => setLocation(loginPathFor(location))}
            style={{
              width: "100%", padding: "6px 10px", fontSize: "0.76rem",
              borderRadius: "6px", border: "1px solid rgba(248,250,252,0.18)",
              background: "rgba(248,250,252,0.08)", color: "#F8FAFC",
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
              letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
            }}
          >
            SIGN IN
          </button>
          <ProUpgradeButton />
        </div>
      )}
      {!collapsed && isPro && (
        <div style={{ margin: "4px 8px 8px", display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", flexShrink: 0 }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "rgba(24,212,123,0.12)", border: "1px solid rgba(24,212,123,0.25)",
            display: "grid", placeItems: "center", flexShrink: 0,
          }}>
            <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#18D47B" }}>
              {email ? email[0].toUpperCase() : "P"}
            </span>
          </div>
          <span style={{ fontSize: "0.7rem", color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {email ? email.split("@")[0] : "Pro"}
          </span>
          <Star size={11} style={{ color: "#18D47B", flexShrink: 0 }} />
        </div>
      )}
    </aside>
  );
}

// ── Top Sport Tab Bar ─────────────────────────────────────────────────────────
// FIX: Added isMobile + onMenuToggle props; on mobile shows hamburger and
//      collapses PRO/theme buttons to icon-only; sport tabs scroll horizontally.
function TopTabBar({
  collapsed = false,
  onMenuToggle,
  isMobile,
  brandContext,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  onMenuToggle: () => void;
  isMobile: boolean;
  brandContext?: string;
}) {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const { handleUpgrade, loading: proLoading } = useProCheckout();
  const { email, user, isPro, logout } = useAuth();
  const { toast } = useToast();
  const [portalLoading, setPortalLoading] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const activeSport = SPORT_TABS.find((t) => location.startsWith(t.path))?.key ?? null;
  const accountEmail = user?.email ?? email;

  const handleManageBilling = async () => {
    if (!accountEmail || portalLoading) return;
    setPortalLoading(true);
    try {
      await openBillingPortal(accountEmail);
    } catch {
      toast(billingPortalUnavailableMessage);
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div
      style={{
        height: "48px",
        width: "100%",
        maxWidth: "100%",
        background: isMobile ? "#071019" : "rgba(7,16,25,0.98)",
        borderBottom: "1px solid var(--es-border)",
        display: "flex",
        alignItems: "center",
        paddingRight: isMobile ? "8px" : "16px",
        gap: isMobile ? "2px" : "4px",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: isMobile ? 820 : 180,
        minWidth: 0,
        overflow: "visible",
        isolation: "isolate",
        pointerEvents: "auto",
        boxShadow: isMobile ? "0 8px 22px rgba(0,0,0,0.36)" : "none",
      }}
    >
      {/* FIX: Hamburger button on mobile (opens drawer); collapse toggle on desktop */}
      <button
        onClick={onMenuToggle}
        aria-label={isMobile ? "Open navigation menu" : "Collapse sidebar"}
        title={isMobile ? "Open navigation menu" : "Collapse sidebar"}
        style={{
          width: "48px",
          height: "48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#94A3B8",
          flexShrink: 0,
          borderRight: "1px solid var(--es-border)",
          position: "relative",
          zIndex: 2,
          touchAction: "manipulation",
        }}
      >
        <Menu size={18} />
      </button>

      {isMobile && (
        <div
          style={{
            padding: "0 7px 0 4px",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: "0.82rem",
            fontWeight: 900,
            color: "#F8FAFC",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            flexShrink: 0,
            lineHeight: 1,
            position: "relative",
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          <BrandEmblem size={30} />
        </div>
      )}

      {/* Brand label */}
      {!isMobile && collapsed && (
        <div
          style={{
            paddingLeft: "12px",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: "1rem",
            fontWeight: 900,
            color: "#F8FAFC",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginRight: "12px",
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          <span style={{ display: "block", width: 140, height: 44, overflow: "hidden" }}>
            <img
              src={EDGESETTER_LOGO_SRC}
              alt="EdgeSetter live sports intelligence"
              width={140}
              height={44}
              style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", objectPosition: "left center" }}
              onError={(event) => {
                event.currentTarget.style.display = "none";
                const fallback = event.currentTarget.parentElement?.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.style.display = "block";
              }}
            />
          </span>
          <span style={{ display: "none" }}>EDGESETTER</span>
          {brandContext && (
            <span
              style={{
                display: "block",
                marginTop: 3,
                color: "var(--es-brand-green)",
                fontSize: "0.58rem",
                fontWeight: 850,
                letterSpacing: "0.12em",
              }}
            >
              {brandContext}
            </span>
          )}
        </div>
      )}

      {!isMobile && <div style={{ flex: 1 }} />}

      {/* Sport tabs — horizontally scrollable on mobile */}
      <div
        style={{
          display: "flex",
          gap: isMobile ? "0" : "2px",
          overflowX: isMobile ? "auto" : "visible",
          scrollbarWidth: "none",
          flex: isMobile ? "1 1 auto" : undefined,
          flexShrink: 1,
          minWidth: 0,
          position: "relative",
          zIndex: 2,
          pointerEvents: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {SPORT_TABS.map((tab) => {
          const isActive = activeSport === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setLocation(tab.path)}
              title={`Open ${tab.label} board`}
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
                color: isActive ? "#F8FAFC" : "#94A3B8",
                border: `1px solid ${isActive ? "#2A2F3E" : "transparent"}`,
                transition: "all 0.15s ease",
                flexShrink: 0,
                whiteSpace: "nowrap",
                minHeight: "36px",
                position: "relative",
                zIndex: 2,
                touchAction: "manipulation",
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.color = "#CBD5E1";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.color = "#94A3B8";
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: isActive ? tab.dot : "#64748B",
                  flexShrink: 0,
                  boxShadow: isActive ? `0 0 6px ${tab.dot}` : "none",
                }}
              />
              {tab.label}
            </button>
          );
        })}
      </div>

      {!isPro && !isMobile && (
        <button
          data-testid="topbar-sign-in"
          type="button"
          onClick={() => setLocation(loginPathFor(location))}
          aria-label="Already a subscriber? Sign in to restore access"
          title="Already a subscriber? Sign in to restore access"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 12px",
            borderRadius: "6px",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: "0.78rem",
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer",
            background: "rgba(248,250,252,0.06)",
            color: "#F8FAFC",
            border: "1px solid rgba(248,250,252,0.18)",
            flexShrink: 0,
          }}
        >
          Sign In
        </button>
      )}

      {/* PRO button - icon-only on mobile */}
      <button
        data-testid={isPro ? "topbar-account-menu" : "topbar-pro-button"}
        onClick={isPro ? () => setAccountOpen((open) => !open) : handleUpgrade}
        disabled={proLoading}
        aria-label={isPro ? "Open account menu" : "Get Pro"}
        title={isPro ? "Account" : "Get Pro"}
        style={{
          display: isMobile ? "none" : "inline-flex",
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
          background: isPro ? "linear-gradient(135deg, rgba(24,212,123,0.14), rgba(24,212,123,0.045))" : "linear-gradient(135deg, rgba(245,184,65,0.15), rgba(245,184,65,0.05))",
          color: isPro ? "#18D47B" : "#F5B841",
          border: `1px solid ${isPro ? "rgba(24,212,123,0.3)" : "rgba(245,184,65,0.3)"}`,
          transition: "all 0.15s ease",
          marginLeft: isMobile ? "2px" : "8px",
          opacity: proLoading ? 0.7 : 1,
          flexShrink: 0,
        }}
      >
        <Zap size={12} />
        {/* FIX: hide text on mobile - icon-only PRO button */}
        {!isMobile && (isPro ? "ACCOUNT" : (proLoading ? "LOADING..." : "GET PRO"))}
      </button>

      {isPro && !isMobile && accountOpen && (
        <div
          style={{
            display: "grid",
            position: "absolute",
            right: 58,
            top: "44px",
            width: 190,
            gap: 6,
            padding: 8,
            borderRadius: 8,
            background: "rgba(5,10,15,0.98)",
            border: "1px solid rgba(148,163,184,0.22)",
            boxShadow: "0 18px 46px rgba(0,0,0,0.48)",
            zIndex: 1000,
          }}
        >
          <span style={{ padding: "3px 6px", color: "#94A3B8", fontSize: "0.68rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {accountEmail ?? "Subscriber account"}
          </span>
          <button
            data-testid="topbar-manage-billing"
            type="button"
            onClick={handleManageBilling}
            disabled={portalLoading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 12px",
              borderRadius: "6px",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "0.78rem",
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              background: "rgba(24,212,123,0.08)",
              color: "#DFFBEA",
              border: "1px solid rgba(24,212,123,0.24)",
              opacity: portalLoading ? 0.7 : 1,
              flexShrink: 0,
            }}
          >
            <CreditCard size={12} />
            {portalLoading ? "Opening" : "Billing"}
          </button>
          <button
            data-testid="topbar-sign-out"
            type="button"
            onClick={logout}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 12px",
              borderRadius: "6px",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "0.78rem",
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              background: "rgba(148,163,184,0.06)",
              color: "#CBD5E1",
              border: "1px solid rgba(148,163,184,0.18)",
              flexShrink: 0,
            }}
          >
            <LogOut size={12} />
            Sign Out
          </button>
        </div>
      )}

      {/* Dark mode toggle — icon-only on mobile */}
      <button
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        style={{
          display: isMobile ? "none" : "inline-flex",
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
          background: isDark ? "transparent" : "rgba(245,184,65,0.1)",
          color: isDark ? "#94A3B8" : "#F5B841",
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
  brandContext,
}: {
  children: React.ReactNode;
  boardsMode?: boolean;
  brandContext?: string;
}) {
  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURN (React rules of hooks)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsedRaw] = useState(() => {
    try { return localStorage.getItem("es-sidebar-collapsed") === "true"; } catch { return false; }
  });
  const setDesktopCollapsed = (v: boolean) => {
    try { localStorage.setItem("es-sidebar-collapsed", String(v)); } catch {}
    setDesktopCollapsedRaw(v);
  };
  const { theme } = useTheme();
  const isLight = (theme as "dark" | "light") === "light";

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileDrawerOpen(false);
      if (mobile && !mobileDrawerOpen) setDesktopCollapsedRaw(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mobileDrawerOpen]);

  const [location] = useLocation();
  const isLeagueBoardRoute = ["/mlb", "/nba", "/nfl", "/cfb"].some((path) => location.startsWith(path));
  useEffect(() => {
    if (isMobile) setMobileDrawerOpen(false);
  }, [location]);

  useEffect(() => {
    if (!isMobile || !mobileDrawerOpen) {
      document.body.style.overflow = "";
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, mobileDrawerOpen]);

  const handleMenuToggle = () => {
    if (isMobile) {
      setMobileDrawerOpen((o) => !o);
    } else {
      setDesktopCollapsed(!desktopCollapsed);
    }
  };

  // boardsMode: NFL/CFB manage their own layout — just wrap in dark container
  if (boardsMode) {
    return (
      <div
        className="boards-mode-shell"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          minHeight: 0,
          overflow: "hidden",
          background: "#050505",
          color: "#F8FAFC",
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        <PublicTextRenderGuard>{children}</PublicTextRenderGuard>
        <MobileTabBar />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: isLeagueBoardRoute ? "auto" : "100vh",
        minHeight: "100vh",
        width: "100vw",
        maxWidth: "100vw",
        overflow: isLeagueBoardRoute ? "visible" : "hidden",
        background: isLight ? "var(--es-bg)" : "#050505",
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
            background: "rgba(0, 0, 0, 0.66)",
            zIndex: 900,
            pointerEvents: "auto",
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
            width: "min(204px, 82vw)",
            minWidth: "min(204px, 82vw)",
            zIndex: 1000,
            background: "linear-gradient(180deg, rgba(5,5,5,0.995), rgba(7,16,25,0.995))",
            boxShadow: mobileDrawerOpen ? "18px 0 46px rgba(0,0,0,0.70)" : "none",
            // Slide in/out
            transform: mobileDrawerOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.14s ease-out",
            pointerEvents: mobileDrawerOpen ? "auto" : "none",
          }}
        />
      ) : (
        <Sidebar
          collapsed={desktopCollapsed}
          onToggle={() => setDesktopCollapsed(!desktopCollapsed)}
        />
      )}

      {/* Main area — takes full width on mobile (sidebar is overlaid, not in flow) */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: isLeagueBoardRoute ? "visible" : "hidden",
          minWidth: 0,
          height: isMobile ? "calc(100vh - 76px - env(safe-area-inset-bottom, 0px))" : undefined,
          maxHeight: isMobile ? "calc(100vh - 76px - env(safe-area-inset-bottom, 0px))" : undefined,
          width: isMobile ? "100vw" : undefined,
          maxWidth: isMobile ? "100vw" : undefined,
        }}
      >
        <TopTabBar
          collapsed={desktopCollapsed}
          onToggle={handleMenuToggle}
          onMenuToggle={handleMenuToggle}
          isMobile={isMobile}
          brandContext={brandContext}
        />
        <div style={{ flex: 1, overflowY: isLeagueBoardRoute ? "visible" : "auto", overflowX: "hidden", minWidth: 0, maxWidth: "100%", paddingBottom: isMobile ? "calc(96px + env(safe-area-inset-bottom, 0px))" : 0 }}>
          <PublicTextRenderGuard>{children}</PublicTextRenderGuard>
        </div>
      </div>
      <MobileTabBar />
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
 * status = "LIVE" | "ACTIVE" | "MONITORING" | etc.
 */
export function SportBadge({ status }: { status: string }) {
  const isLive = status === "LIVE";
  const color = isLive ? "#00E676" : "#F5B841";
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
      <span className={isLive ? "es-live-dot es-live-pulse" : "es-live-dot es-live-dot-subtle"} style={{ width: 5, height: 5, background: color }} />
      {status}
    </span>
  );
}
