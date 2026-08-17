/**
 * LockedSignalCard — replaces a full SignalCard when visitor is over the free limit.
 *
 * Shows: title + topic + source label (unblurred top section)
 * Blurs: the body/content area
 * Overlay: "Pro unlocks live detail, source context, and accuracy workflow"
 * Click anywhere → opens ProGateModal
 */
import type { Signal } from "@shared/schema";
import { useSignalGate } from "@/context/SignalGate";
import { publicConfidenceLabel } from "@/lib/storyLanguage";
import { Lock } from "lucide-react";

const T = {
  bg:        "#050505",
  surface1:  "#0A0F1A",
  surface2:  "#101827",
  gold:      "#F5B841",
  goldBright:"#FFD166",
  text:      "#F8FAFC",
  textMuted: "#94A3B8",
  textFaint: "#64748B",
  green:     "#3DAE72",
  amber:     "#FF8A00",
};

function VerdictPillBlurred({ type }: { type: string }) {
  const map: Record<string, { color: string; label: string }> = {
    confirmed:    { color: "#5AC8E0", label: "Confirmed" },
    likely:       { color: "#FFD166", label: "Likely" },
    rumor:        { color: "#A07ACC", label: "Rumor" },
    contradicted: { color: "#E08080", label: "Contradicted" },
    review:       { color: "#7A9CC8", label: "In Review" },
  };
  const key = Object.keys(map).find(k => type.toLowerCase().includes(k)) ?? "review";
  const s = map[key];
  return (
    <span style={{
      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
      fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase",
      background: `${s.color}18`, color: s.color,
      border: `1px solid ${s.color}44`,
      padding: "3px 8px", borderRadius: 2,
      display: "inline-flex", alignItems: "center", gap: 5,
      filter: "blur(0px)", // verdict pill stays clear
    }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

interface Props {
  signal: Signal;
  index: number; // position in full list (for "Signal #N locked" label)
}

export default function LockedSignalCard({ signal, index }: Props) {
  const { openModal } = useSignalGate();

  return (
    <div
      data-testid={`locked-signal-card-${signal.id}`}
      onClick={() => openModal()}
      style={{
        position: "relative",
        background: T.surface1,
        border: "1px solid rgba(245,184,65,0.08)",
        borderLeft: "3px solid rgba(245,184,65,0.18)",
        borderRadius: 4,
        marginBottom: 12,
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-left-color 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderLeftColor = "rgba(245,184,65,0.50)";
        el.style.boxShadow = "0 0 0 1px rgba(245,184,65,0.12)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderLeftColor = "rgba(245,184,65,0.18)";
        el.style.boxShadow = "none";
      }}
    >
      {/* Visible header — title + topic + source */}
      <div style={{ padding: "16px 20px 12px", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Verdict + type chips */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <VerdictPillBlurred type={signal.verdict?.toLowerCase() ?? "review"} />
              <span style={{
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: T.textFaint,
              }}>
                {signal.signal_type}
              </span>
            </div>
            {/* Title — fully visible */}
            <div style={{
              fontFamily: "'Playfair Display',Georgia,serif",
              fontSize: 17, fontWeight: 700,
              color: T.text, lineHeight: 1.3, marginBottom: 6,
            }}>
              {signal.title}
            </div>
            {/* Player + team */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: T.gold,
              }}>
                {signal.player_name}
              </span>
              <span style={{ color: T.textFaint, fontSize: 10 }}>·</span>
              <span style={{
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
                textTransform: "uppercase", color: T.textFaint,
              }}>
                {signal.team}
              </span>
            </div>
          </div>
          {/* Blurred confidence score */}
          <div style={{ textAlign: "right", flexShrink: 0, filter: "blur(6px)", userSelect: "none" }}>
            <div style={{
              fontFamily: "'Playfair Display',Georgia,serif",
              fontSize: 15, fontWeight: 700,
              color: T.gold, lineHeight: 1.15,
              letterSpacing: "-0.01em",
            }}>
              {publicConfidenceLabel(signal.confidence_score ?? 0)}
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: T.textFaint, marginTop: 2,
            }}>
              Confidence
            </div>
          </div>
        </div>
      </div>

      {/* Blurred body — summary + action takeaway ghost */}
      <div style={{
        padding: "0 20px 16px",
        filter: "blur(5px)",
        userSelect: "none",
        pointerEvents: "none",
        opacity: 0.45,
      }}>
        {/* Limited confidence preview */}
        <div style={{
          height: 3, background: "rgba(245,184,65,0.30)",
          borderRadius: 2, marginBottom: 14,
          width: "100%",
        }}>
          <div style={{
            height: 3, background: T.gold, borderRadius: 2,
            width: `${signal.confidence_score}%`,
          }} />
        </div>
        {/* Ghost text lines */}
        <div style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.65, marginBottom: 12 }}>
          {signal.summary?.slice(0, 80) ?? "Signal details available to Pro subscribers."}…
        </div>
        <div style={{
          height: 48, background: "rgba(245,184,65,0.06)",
          border: "1px solid rgba(245,184,65,0.12)",
          borderRadius: 3,
        }} />
      </div>

      {/* Lock overlay */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        background: "linear-gradient(to top, rgba(17,19,23,0.97) 0%, rgba(17,19,23,0.80) 60%, transparent 100%)",
        padding: "32px 20px 18px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
        zIndex: 3,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{
            width: 26, height: 26,
            background: "rgba(245,184,65,0.12)",
            border: "1px solid rgba(245,184,65,0.30)",
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Lock size={12} style={{ color: T.gold }} />
          </div>
          <span style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
            textTransform: "uppercase", color: T.gold,
          }}>
            Pro unlocks live detail, source context, and accuracy workflow
          </span>
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 6,
          width: "100%",
          paddingLeft: 34,
        }}>
          {["Confidence drivers", "Source stack", "Ledger context"].map(item => (
            <span key={item} style={{
              padding: "5px 6px",
              borderRadius: 4,
              border: "1px solid rgba(0,183,255,0.2)",
              background: "rgba(0,183,255,0.07)",
              color: "#CBD5E1",
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              textAlign: "center",
            }}>{item}</span>
          ))}
        </div>
        <span style={{
          fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: T.textFaint,
          paddingLeft: 34,
          transition: "color 0.15s",
        }}>
          Preview the Pro workflow →
        </span>
      </div>
    </div>
  );
}
