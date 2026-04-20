import { Link, useLocation } from "wouter";
import { type Theme } from "../App";
import {
  LayoutDashboard, Star, Shield, Zap, ListChecks, FileText, Sun, Moon, Menu, X,
  Activity, Minus
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

/* Nav groups */
const navGroups = [
  { label: "Intelligence", items: ["/dashboard", "/draft"] },
  { label: "Analytics",    items: ["/leaderboard", "/alerts"] },
  { label: "Operations",   items: ["/admin", "/logs"] },
];

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
    <div className="flex h-screen overflow-hidden bg-background" data-testid="app-layout">

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-56 flex flex-col
          border-r
          transform transition-transform duration-200
          md:static md:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{
          background: "hsl(22 10% 9%)",
          borderColor: "hsl(22 10% 18%)",
        }}
        data-testid="sidebar"
      >
        {/* Logo + brand */}
        <div
          className="px-4 pt-4 pb-3"
          style={{ borderBottom: "1px solid hsl(22 10% 18%)" }}
        >
          <div className="flex items-center gap-2.5">
            <EdgeSetterLogo />
            <div className="min-w-0">
              <span
                className="block font-bold text-sm tracking-tight leading-tight"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "hsl(34 52% 89%)" }}
              >
                Edge Setter
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {/* Cyan live dot for analytics feel */}
                <span
                  className="live-dot w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
                  style={{ background: "hsl(194 56% 51%)" }}
                />
                <span className="data-label">NFL Intelligence</span>
              </div>
            </div>
          </div>
        </div>

        {/* Nav — grouped with section labels */}
        <nav className="flex-1 overflow-y-auto py-2 px-2" role="navigation" aria-label="Main navigation">
          {navGroups.map(group => {
            const groupItems = navItems.filter(i => group.items.includes(i.href));
            return (
              <div key={group.label} className="mb-3">
                <p className="px-3 pb-1 pt-2 text-[8px] font-bold uppercase tracking-[0.18em] select-none"
                  style={{ color: "hsl(25 9% 37%)" }}>
                  {group.label}
                </p>
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
                        className="flex items-center gap-2.5 px-3 py-2 mb-0.5 cursor-pointer text-xs font-medium transition-colors border-l-2 rounded-r-sm"
                        style={active ? {
                          borderLeftColor: "hsl(194 56% 51%)",
                          background: "hsl(194 56% 51% / 0.10)",
                          color: "hsl(194 56% 65%)",
                        } : {
                          borderLeftColor: "transparent",
                          color: "hsl(30 10% 58%)",
                        }}
                        onMouseEnter={e => {
                          if (!active) {
                            (e.currentTarget as HTMLDivElement).style.background = "hsl(22 10% 13% / 0.8)";
                            (e.currentTarget as HTMLDivElement).style.color = "hsl(34 52% 89%)";
                          }
                        }}
                        onMouseLeave={e => {
                          if (!active) {
                            (e.currentTarget as HTMLDivElement).style.background = "";
                            (e.currentTarget as HTMLDivElement).style.color = "hsl(30 10% 58%)";
                          }
                        }}
                      >
                        <Icon size={13} strokeWidth={active ? 2.5 : 1.75} className="flex-shrink-0" />
                        <span className="uppercase tracking-widest text-[9.5px] font-semibold">{label}</span>
                        {href === "/admin" && stats?.review_queue > 0 && (
                          <span
                            className="ml-auto text-[8px] px-1.5 py-0.5 rounded font-bold tabular-nums"
                            style={{ background: "hsl(330 42% 30%)", color: "hsl(330 42% 75%)" }}
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

        {/* Pro CTA */}
        <div
          className="mx-3 mb-3 rounded relative overflow-hidden"
          style={{
            border: "1px solid hsl(42 58% 46% / 0.28)",
            background: "hsl(42 58% 46% / 0.07)",
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: "hsl(42 58% 46% / 0.45)" }}
          />
          <div className="p-3">
            <p
              className="text-[11px] font-bold mb-0.5 leading-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "hsl(42 61% 57%)" }}
            >
              Pro Intelligence
            </p>
            <p className="text-[9px] mb-2.5 leading-relaxed" style={{ color: "hsl(30 10% 58%)" }}>
              Real-time alerts · Full archive
            </p>
            <Link href="/">
              <button
                data-testid="button-upgrade-pro"
                className="w-full text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded hover:opacity-88 transition-opacity"
                style={{ background: "hsl(42 58% 46%)", color: "hsl(34 52% 89%)" }}
              >
                $19 / month
              </button>
            </Link>
          </div>
        </div>

        {/* Stats strip */}
        {stats && (
          <div
            className="px-4 pb-3 grid grid-cols-2 gap-2 pt-3"
            style={{ borderTop: "1px solid hsl(22 10% 18%)" }}
          >
            <div className="text-center">
              <p
                className="text-sm font-bold tabular-nums"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "hsl(34 52% 89%)" }}
              >
                {stats.total_signals ?? 0}
              </p>
              <p className="data-label mt-0.5">Signals</p>
            </div>
            <div className="text-center">
              <p
                className="text-sm font-bold tabular-nums"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "hsl(34 52% 89%)" }}
              >
                {stats.sources_tracked ?? 0}
              </p>
              <p className="data-label mt-0.5">Sources</p>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header
          className="masthead-dateline flex items-center gap-3 px-5 py-2 sticky top-0 z-30 backdrop-blur-sm"
          data-testid="topbar"
        >
          <button
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(o => !o)}
            data-testid="button-mobile-menu"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={17} /> : <Menu size={17} />}
          </button>

          <div className="flex items-center gap-2 text-[9px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">
            {/* Cyan activity dot for analytics terminal feel */}
            <Activity size={9} style={{ color: "hsl(194 56% 51%)" }} />
            <span>NFL Intelligence</span>
            {stats?.review_queue > 0 && (
              <>
                <Minus size={7} className="opacity-40" />
                <span className="font-bold" style={{ color: "hsl(330 42% 62%)" }}>
                  {stats.review_queue} pending review
                </span>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              data-testid="button-theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <Link href="/">
              <button
                data-testid="button-go-home"
                className="text-[9px] uppercase tracking-widest font-semibold px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                Home
              </button>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main
          className="flex-1 overflow-y-auto overscroll-contain"
          data-testid="main-content"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function EdgeSetterLogo() {
  return (
    <svg
      width="28" height="28" viewBox="0 0 30 30" fill="none"
      aria-label="Edge Setter logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Deep graphite background */}
      <rect width="30" height="30" rx="3" fill="hsl(22, 10%, 7%)" />
      {/* Amber-gold rule lines */}
      <rect x="6" y="7"  width="18" height="2" rx="0.5" fill="hsl(42, 61%, 47%)" />
      <rect x="6" y="14" width="12" height="2" rx="0.5" fill="hsl(42, 61%, 47%)" />
      <rect x="6" y="21" width="18" height="2" rx="0.5" fill="hsl(42, 61%, 47%)" />
      {/* Cyan accent tick — analytics terminal */}
      <rect x="20" y="14" width="4" height="2" rx="0.5" fill="hsl(194, 56%, 51%)" />
    </svg>
  );
}
