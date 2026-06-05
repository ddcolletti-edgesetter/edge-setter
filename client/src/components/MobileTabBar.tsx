import { useLocation } from "wouter";
import { Home, Star } from "lucide-react";
import { useBreakpoint } from "../hooks/useBreakpoint";

const ACCENT = "#F5B841";
const MUTED = "#64748B";
const LIVE = "#18D47B";
const BORDER = "rgba(245,184,65,0.14)";

function BasketballIcon({ active }: { active: boolean }) {
  const c = active ? ACCENT : MUTED;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke={c} strokeWidth="1.5" />
      <path
        d="M6 4.5C6 4.5 8 7 8 10s-2 5.5-2 5.5M14 4.5C14 4.5 12 7 12 10s2 5.5 2 5.5M2 10h16"
        stroke={c} strokeWidth="1.5" strokeLinecap="round"
      />
    </svg>
  );
}

function BaseballIcon({ active }: { active: boolean }) {
  const c = active ? ACCENT : MUTED;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke={c} strokeWidth="1.5" />
      <path d="M8 3.5 Q5 10 8 16.5" stroke={c} strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M12 3.5 Q15 10 12 16.5" stroke={c} strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

const TABS = [
  {
    label: "Live",
    path: "/",
    exact: true,
    Icon: ({ active }: { active: boolean }) => <Home size={20} color={active ? ACCENT : MUTED} />,
  },
  {
    label: "NBA",
    path: "/nba",
    exact: false,
    Icon: BasketballIcon,
  },
  {
    label: "MLB",
    path: "/mlb",
    exact: false,
    Icon: BaseballIcon,
  },
  {
    label: "My Edge",
    path: "/my-edge",
    exact: false,
    Icon: ({ active }: { active: boolean }) => <Star size={20} color={active ? ACCENT : MUTED} />,
  },
];

export default function MobileTabBar() {
  const [location, navigate] = useLocation();
  const { isMobile } = useBreakpoint();

  if (!isMobile) return null;

  return (
    <nav
      aria-label="Bottom navigation"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100vw",
        maxWidth: "100vw",
        zIndex: 850,
        height: "calc(76px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "linear-gradient(180deg, rgba(10,15,26,0.98), rgba(5,5,5,0.99))",
        borderTop: `1px solid ${BORDER}`,
        display: "flex",
        alignItems: "stretch",
        boxSizing: "border-box",
        overflow: "hidden",
        boxShadow: "0 -18px 44px rgba(0,0,0,0.42), inset 0 1px 0 rgba(248,250,252,0.035)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {TABS.map(tab => {
        const isActive = tab.exact
          ? location === tab.path
          : location.startsWith(tab.path);
        const { Icon } = tab;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            aria-label={tab.label}
            aria-current={isActive ? "page" : undefined}
            style={{
              flex: "1 1 0",
              width: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: isActive ? "linear-gradient(180deg, rgba(245,184,65,0.13), rgba(245,184,65,0.02))" : "none",
              border: "none",
              cursor: "pointer",
              minHeight: 70,
              WebkitTapHighlightColor: "transparent",
              padding: "6px 4px 5px",
              minWidth: 0,
              borderTop: isActive ? `3px solid ${ACCENT}` : "3px solid transparent",
              boxShadow: isActive ? "inset 0 1px 0 rgba(245,184,65,0.12)" : "none",
            }}
          >
            <span style={{
              position: "relative",
              display: "grid",
              placeItems: "center",
              width: 28,
              height: 26,
              borderRadius: 7,
              background: isActive ? "rgba(245,184,65,0.1)" : "transparent",
            }}>
              {tab.path === "/" && (
                <i style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: LIVE,
                  boxShadow: "0 0 8px rgba(24,212,123,0.55)",
                }} />
              )}
              <Icon active={isActive} />
            </span>
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 10.5,
                fontWeight: 850,
                letterSpacing: "0.11em",
                textTransform: "uppercase",
                color: isActive ? ACCENT : MUTED,
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </span>
            {isActive && (
              <span style={{
                width: 22,
                height: 2,
                borderRadius: 999,
                background: ACCENT,
                boxShadow: "0 0 10px rgba(245,184,65,0.36)",
              }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
