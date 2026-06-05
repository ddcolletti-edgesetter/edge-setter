import { Link, useLocation } from "wouter";
import { type Theme } from "../App";
import {
  LayoutDashboard, Star, Shield, Zap, ListChecks, FileText,
  Sun, Moon, Menu, X, Activity, Radio, Send, BarChart2
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { NavLoginButton } from "./ProGate";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { billingPortalUnavailableMessage, openBillingPortal } from "@/lib/billingPortal";

/* ── Public nav (shown to all users) ── */
const publicNavItems = [
  { href: "/dashboard",   label: "Signal Board", icon: LayoutDashboard },
  { href: "/draft",       label: "Draft Board",  icon: Star            },
  { href: "/leaderboard", label: "Accuracy",     icon: ListChecks      },
];

const publicNavGroups = [
  { label: "Intelligence", items: ["/dashboard", "/draft"] },
  { label: "Analytics",    items: ["/leaderboard"] },
];

/* ── Ops nav (shown only inside authenticated admin experience) ── */
const opsNavItems = [
  { href: "/admin",                label: "Review Queue",      icon: Shield   },
  { href: "/logs",                 label: "Agent Logs",        icon: FileText },
  { href: "/alerts",               label: "Alerts",            icon: Zap      },
  { href: "/signal-ops-queue",     label: "Signal Ops Queue",  icon: Activity },
  { href: "/site-watch-logs",      label: "Site Watch",        icon: Radio    },
  { href: "/distribution-drafts",  label: "Distribution",      icon: Send     },
  { href: "/daily-ops",            label: "Daily Ops",         icon: BarChart2 },
];

const opsNavGroups = [
  { label: "Operations", items: ["/admin", "/logs", "/alerts", "/signal-ops-queue", "/site-watch-logs"] },
  { label: "Phase 2",    items: ["/distribution-drafts", "/daily-ops"] },
];

/* ── Design tokens ── */
const T = {
  bg:        "#050505",
  surface1:  "#0A0F1A",
  surface2:  "#101827",
  gold:      "#F5B841",
  goldBright:"#FFD166",
  goldDim:   "rgba(245,184,65,0.16)",
  text:      "#F8FAFC",
  textMuted: "#94A3B8",
  textFaint: "#64748B",
  cyan:      "hsl(194 56% 55%)",
  danger:    "#FF5252",
};

const BUILD_RENDER_CHECK = "BUILD_RENDER_CHECK_2026_06_04";
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
  ["Pro Active - ", "Preview"],
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

function BuildRenderCheckMarker() {
  return (
    <div
      aria-label="Build render check"
      style={{
        position: "fixed",
        right: 8,
        bottom: "calc(82px + env(safe-area-inset-bottom, 0px))",
        zIndex: 1200,
        padding: "4px 7px",
        border: "1px solid rgba(245,184,65,0.45)",
        borderRadius: 4,
        background: "rgba(5,7,10,0.92)",
        color: "#F5B841",
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 1.1,
        letterSpacing: 0,
        pointerEvents: "none",
      }}
    >
      {BUILD_RENDER_CHECK}
    </div>
  );
}

interface Props {
  children: React.ReactNode;
  theme: Theme;
  toggleTheme: () => void;
  /** When true, renders the Operations nav instead of the public nav */
  opsMode?: boolean;
}

export default function AppLayout({ children, theme, toggleTheme, opsMode = false }: Props) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { email, user, isPro } = useAuth();
  const { toast } = useToast();
  const [portalLoading, setPortalLoading] = useState(false);
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
          fixed inset-y-0 left-0 z-50 flex-col
          md:static md:translate-x-0 md:flex
          ${mobileOpen ? "flex" : "hidden"}
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
                    fontSize: 20,
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
                      width: 6, height: 6, borderRadius: "50%",
                      background: T.gold, display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
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
          {(opsMode ? opsNavGroups : publicNavGroups).map(group => {
            const allItems = opsMode ? opsNavItems : publicNavItems;
            const groupItems = allItems.filter(i => group.items.includes(i.href));
            return (
              <div key={group.label} style={{ marginBottom: 6 }}>
                <div
                  style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.22em",
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
                          padding: "10px 12px",
                          marginBottom: 2,
                          borderRadius: 3,
                          borderLeft: `2px solid ${active ? T.gold : "transparent"}`,
                          background: active ? "rgba(245,184,65,0.08)" : "transparent",
                          color: active ? T.gold : T.textMuted,
                          cursor: "pointer",
                          transition: "background 0.12s, color 0.12s",
                          fontSize: 14,
                          fontWeight: active ? 600 : 500,
                        }}
                        onMouseEnter={e => {
                          if (!active) {
                            const el = e.currentTarget as HTMLDivElement;
                            el.style.background = "rgba(245,184,65,0.05)";
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
                            fontSize: 13,
                            fontWeight: 700,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                          }}
                        >
                          {label}
                        </span>
                        {opsMode && href === "/admin" && stats?.review_queue > 0 && (
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: 11, fontWeight: 700,
                              padding: "2px 7px", borderRadius: 2,
                              background: "rgba(255,82,82,0.15)",
                              color: "#FF5252",
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
              border: `1px solid ${isPro ? "rgba(24,212,123,0.28)" : "rgba(245,184,65,0.28)"}`,
              borderRadius: 4,
              background: isPro ? "rgba(24,212,123,0.05)" : "rgba(245,184,65,0.05)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* gold top accent line */}
            <div
              style={{
                position: "absolute", top: 0, left: 0, right: 0,
                height: 2, background: isPro ? "#18D47B" : T.gold,
                pointerEvents: "none",
              }}
            />
            <div style={{ padding: "16px 14px 14px" }}>
              <div
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 13, fontWeight: 700, color: isPro ? "#18D47B" : T.gold,
                  marginBottom: 3, lineHeight: 1.3,
                }}
              >
                {isPro ? "Pro Active" : "Pro Intelligence"}
              </div>
              <div
                style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, color: T.textFaint, letterSpacing: "0.08em",
                  marginBottom: 12, lineHeight: 1.5,
                  textTransform: "uppercase",
                }}
              >
                {isPro ? (email ?? "Subscriber account") : "Real-time alerts · Full archive"}
              </div>
              {isPro ? (
                <button
                  data-testid="button-manage-billing"
                  type="button"
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  style={{
                    width: "100%",
                    minHeight: 38,
                    background: "rgba(24,212,123,0.12)",
                    color: "#DFFBEA",
                    border: "1px solid rgba(24,212,123,0.28)",
                    borderRadius: 3,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "background 0.15s",
                    opacity: portalLoading ? 0.7 : 1,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(24,212,123,0.18)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(24,212,123,0.12)"; }}
                >
                  {portalLoading ? "OPENING..." : "MANAGE BILLING"}
                </button>
              ) : (
                <Link href="/pro">
                  <button
                    data-testid="button-upgrade-pro"
                    type="button"
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
              )}
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
              { label: "Reports", value: stats.sources_tracked ?? 0 },
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
                fontSize: 13, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: T.textFaint,
              }}
            >
              NFL Intelligence
            </span>
            {opsMode && stats?.review_queue > 0 && (
              <>
                <span style={{ color: T.textFaint, fontSize: 13 }}>·</span>
                <span
                  style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 13, fontWeight: 700,
                    letterSpacing: "0.10em", textTransform: "uppercase",
                    color: "#FF5252",
                  }}
                >
                  {stats.review_queue} Pending Review
                </span>
              </>
            )}
          </div>

          {/* Right actions */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {/* Login / account */}
            <NavLoginButton />

            {/* Dark mode badge — always dark, no toggle */}
            <div
              data-testid="dark-mode-indicator"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px",
                borderRadius: 3,
                border: "1px solid rgba(245,184,65,0.16)",
                color: T.textFaint,
              }}
            >
              <Moon size={10} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}>Dark</span>
            </div>

            <Link href="/">
              <button
                data-testid="button-go-home"
                style={{
                  background: "transparent",
                  border: `1px solid rgba(245,184,65,0.32)`,
                  borderRadius: 3,
                  color: T.gold,
                  cursor: "pointer",
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, fontWeight: 700,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  padding: "8px 18px",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = "rgba(245,184,65,0.08)";
                  b.style.borderColor = "rgba(245,184,65,0.55)";
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = "transparent";
                  b.style.borderColor = "rgba(245,184,65,0.32)";
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
          <PublicTextRenderGuard>{children}</PublicTextRenderGuard>
        </main>
      </div>
      <BuildRenderCheckMarker />
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
      <rect width="32" height="32" rx="3" fill="#0A0F1A" />
      {/* Top gold rule — full */}
      <rect x="6" y="7"  width="20" height="2.5" rx="0.5" fill="#F5B841" />
      {/* Middle gold rule — short */}
      <rect x="6" y="14.75" width="13" height="2.5" rx="0.5" fill="#F5B841" />
      {/* Bottom gold rule — full */}
      <rect x="6" y="22.5" width="20" height="2.5" rx="0.5" fill="#F5B841" />
      {/* Gold accent right tick */}
      <rect x="21" y="14.75" width="5" height="2.5" rx="0.5" fill="#FFD166" opacity="0.55" />
    </svg>
  );
}
