import { useLocation } from "wouter";
import { Home, Star } from "lucide-react";
import { useBreakpoint } from "../hooks/useBreakpoint";

const ACCENT = "#F5B841";
const MUTED = "#64748B";
const SURFACE = "rgba(5,5,5,0.97)";
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
    label: "Feed",
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
        zIndex: 45,
        height: "calc(56px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: SURFACE,
        borderTop: `1px solid ${BORDER}`,
        display: "flex",
        alignItems: "stretch",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
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
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: "none",
              border: "none",
              cursor: "pointer",
              minHeight: 56,
              WebkitTapHighlightColor: "transparent",
              padding: "0 4px",
            }}
          >
            <Icon active={isActive} />
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: isActive ? ACCENT : MUTED,
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
