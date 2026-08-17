/**
 * ProValueModule — inline module on the Signal Board sidebar.
 * Live workflow value prop for non-Pro visitors.
 * Placed above the waitlist widget in the sidebar.
 */
import { Link } from "wouter";
import { useSignalGate, FREE_LIMIT } from "@/context/SignalGate";
import { Zap, BarChart2, Filter, BookOpen, CheckCircle2 } from "lucide-react";

const C = {
  surface1:   "#0A0F1A",
  surface2:   "#101827",
  gold:       "#F5B841",
  goldBright: "#FFD166",
  goldDim:    "rgba(245,184,65,0.12)",
  text:       "#F8FAFC",
  textMuted:  "#94A3B8",
  textFaint:  "#64748B",
  green:      "#3DAE72",
};

const ITEMS = [
  { icon: Zap,          label: "Full live signal feed" },
  { icon: BarChart2,    label: "Source context and movement tags" },
  { icon: Filter,       label: "Board filters across active sports" },
  { icon: BookOpen,     label: "Saved signals and source context" },
  { icon: CheckCircle2, label: "Signal drivers and action windows" },
];

export default function ProValueModule() {
  const { freeCount, isGated, isPro } = useSignalGate();
  const remaining = Math.max(0, FREE_LIMIT - freeCount);

  return (
    <div
      data-testid="pro-value-module"
      style={{
        background: C.surface1,
        border: "1px solid rgba(245,184,65,0.28)",
        borderTop: `3px solid ${C.gold}`,
        borderRadius: 4,
        padding: "22px 22px 20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle gold shimmer strip */}
      <div style={{
        position: "absolute", top: 3, left: 0, right: 0, height: 40,
        background: "linear-gradient(to bottom, rgba(245,184,65,0.04), transparent)",
        pointerEvents: "none",
      }} />

      {/* Eyebrow */}
      <div style={{
        fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
        fontSize: 10, fontWeight: 700, letterSpacing: "0.20em",
        textTransform: "uppercase", color: C.gold,
        marginBottom: 6,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.gold, display: "inline-block" }} />
        {isPro ? "Account Active" : "Live Workflow · Pro"}
      </div>

      {/* Headline */}
      <div style={{
        fontFamily: "'Playfair Display',Georgia,serif",
        fontSize: 18, fontWeight: 700,
        color: C.text, marginBottom: 4, lineHeight: 1.25,
      }}>
        {isPro ? "Available in your plan" : "Full signal workflow"}
      </div>
      <p style={{ fontSize: 14, color: C.textMuted, margin: "0 0 18px", lineHeight: 1.55 }}>
        {isPro
          ? "Full signal detail, source context, evidence context, and saved-signal monitoring are included in Pro."
          : "Move from limited board access into full signal detail, source context, evidence context, and saved-signal monitoring."}
      </p>

      {/* Free signal meter — only show if they've used some */}
      {freeCount > 0 && (
        <div style={{
          background: C.surface2,
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 3,
          padding: "10px 14px",
          marginBottom: 16,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 6,
          }}>
            <span style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: isGated ? C.gold : C.textFaint,
            }}>
              {isGated ? "Free limit reached" : `${remaining} free ${remaining === 1 ? "signal" : "signals"} remaining`}
            </span>
            <span style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
              color: C.textFaint,
            }}>
              {freeCount} / {FREE_LIMIT}
            </span>
          </div>
          {/* Progress bar */}
          <div style={{
            height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2,
          }}>
            <div style={{
              height: 3,
              width: `${Math.min(100, (freeCount / FREE_LIMIT) * 100)}%`,
              background: isGated ? C.gold : "rgba(245,184,65,0.50)",
              borderRadius: 2,
              transition: "width 0.3s ease",
            }} />
          </div>
        </div>
      )}

      {/* Feature list */}
      <div style={{ marginBottom: 20 }}>
        {ITEMS.map(({ icon: Icon, label }) => (
          <div key={label} style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
          }}>
            <Icon size={12} style={{ color: C.gold, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.textMuted }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Price + CTA */}
      {!isPro && <div style={{ marginBottom: 14 }}>
        <span style={{
          fontFamily: "'Playfair Display',Georgia,serif",
          fontSize: 28, fontWeight: 700,
          color: C.gold, lineHeight: 1,
          letterSpacing: "-0.03em",
        }}>
          $19
        </span>
        <span style={{
          fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
          fontSize: 13, color: C.textFaint, marginLeft: 3,
        }}>
          /month
        </span>
      </div>}

      <Link href={isPro ? "/alerts" : "/pro"}>
        <button
          data-testid="button-pro-value-cta"
          style={{
            width: "100%",
            padding: "11px 0",
            background: isPro ? "rgba(61,174,114,0.12)" : C.gold,
            color: isPro ? C.green : "#050505",
            border: isPro ? "1px solid rgba(61,174,114,0.32)" : "none",
            borderRadius: 3, cursor: "pointer",
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 11, fontWeight: 700,
            letterSpacing: "0.18em", textTransform: "uppercase",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = isPro ? "rgba(61,174,114,0.18)" : C.goldBright; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isPro ? "rgba(61,174,114,0.12)" : C.gold; }}
        >
          {isPro ? "Manage Alerts" : "Go Pro · $19/mo"}
        </button>
      </Link>

      {!isPro && <p style={{
        fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: C.textFaint, marginTop: 10, textAlign: "center",
      }}>
        Early adopter pricing · Cancel any time
      </p>}
    </div>
  );
}
