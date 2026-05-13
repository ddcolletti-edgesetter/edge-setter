/**
 * ProGateModal — shown when a visitor clicks a locked signal.
 * Lightweight overlay: benefit bullets + CTA to /#/pro.
 */
import { useEffect } from "react";
import { useSignalGate } from "@/context/SignalGate";
import { Link } from "wouter";
import { X, Zap, BarChart2, CheckCircle2, BookOpen, Filter } from "lucide-react";
import { trackPaywallModalOpen } from "@/lib/analytics";

const C = {
  bg:         "#0A0B0D",
  surface1:   "#111317",
  surface2:   "#16191E",
  gold:       "#CAA85A",
  goldBright: "#D8B86A",
  goldDim:    "rgba(202,168,90,0.15)",
  text:       "#F3EFE6",
  textMuted:  "#B7AFA0",
  textFaint:  "#7E776A",
  green:      "#3DAE72",
};

const BULLETS = [
  { icon: Zap,         text: "Full live signal feed — no limit" },
  { icon: BarChart2,   text: "Full Draft Board with intel + movement tags" },
  { icon: Filter,      text: "Topic filters: Draft, Free Agency, Injuries, Trades, Depth Chart, Coaching" },
  { icon: BookOpen,    text: "Today's Top Signal history — see every edge we've surfaced" },
  { icon: CheckCircle2,text: "Confidence scores, verdict detail, and action takeaways on every signal" },
];

export default function ProGateModal() {
  const { modalOpen, closeModal } = useSignalGate();

  // Fire analytics event each time the modal opens
  useEffect(() => {
    if (modalOpen) trackPaywallModalOpen();
  }, [modalOpen]);

  if (!modalOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="modal-backdrop"
        onClick={closeModal}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(10,11,13,0.82)",
          backdropFilter: "blur(4px)",
          zIndex: 9000,
        }}
      />

      {/* Panel */}
      <div
        data-testid="pro-gate-modal"
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9001,
          width: "min(540px, calc(100vw - 40px))",
          background: C.surface1,
          border: "1px solid rgba(202,168,90,0.28)",
          borderTop: `3px solid ${C.gold}`,
          borderRadius: 6,
          padding: "32px 32px 28px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.60)",
        }}
      >
        {/* Close */}
        <button
          data-testid="button-modal-close"
          onClick={closeModal}
          style={{
            position: "absolute", top: 7, right: 7,
            background: "none", border: "none",
            color: C.textFaint, cursor: "pointer",
            padding: 13, lineHeight: 1,
            minWidth: 44, minHeight: 44,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "color 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.textFaint; }}
        >
          <X size={18} />
        </button>

        {/* Eyebrow */}
        <div style={{
          fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.20em",
          textTransform: "uppercase", color: C.gold,
          marginBottom: 12,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.gold, display: "inline-block" }} />
          Pro — $19/month
        </div>

        {/* Headline */}
        <p style={{
          fontFamily: "'Playfair Display',Georgia,serif",
          fontSize: 22, fontWeight: 700,
          color: C.text, margin: "0 0 6px",
          lineHeight: 1.2, maxWidth: 420,
        }}>
          Stop chasing tweets.
        </p>
        <p style={{
          fontSize: 15, color: C.textMuted,
          margin: "0 0 24px", lineHeight: 1.55,
        }}>
          See the signals, confidence, and action in one feed — before your league or the market does.
        </p>

        {/* Bullets */}
        <div style={{ marginBottom: 28 }}>
          {BULLETS.map(({ icon: Icon, text }) => (
            <div key={text} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              marginBottom: 10,
            }}>
              <div style={{
                width: 26, height: 26, flexShrink: 0,
                background: C.goldDim,
                border: "1px solid rgba(202,168,90,0.20)",
                borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginTop: 1,
              }}>
                <Icon size={12} style={{ color: C.gold }} />
              </div>
              <span style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.5, paddingTop: 4 }}>
                {text}
              </span>
            </div>
          ))}
        </div>

        {/* Draft week note */}
        <div style={{
          background: "rgba(202,168,90,0.06)",
          border: "1px solid rgba(202,168,90,0.22)",
          borderLeft: `3px solid ${C.gold}`,
          borderRadius: 3,
          padding: "10px 14px",
          marginBottom: 24,
        }}>
          <span style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.16em",
            textTransform: "uppercase", color: C.gold,
          }}>
            ⚡ Draft Week active
          </span>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "4px 0 0", lineHeight: 1.5 }}>
            <strong style={{ color: C.text }}>2026 NFL Draft is Apr 24–26.</strong>{" "}
            Act on draft-week movement before your league or the market does.
          </p>
        </div>

        {/* CTA */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/pro">
            <button
              data-testid="button-modal-go-pro"
              onClick={closeModal}
              style={{
                padding: "12px 28px",
                background: C.gold, color: C.bg,
                border: "none", borderRadius: 3, cursor: "pointer",
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 11, fontWeight: 700,
                letterSpacing: "0.18em", textTransform: "uppercase",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.goldBright; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = C.gold; }}
            >
              Go Pro · $19/mo
            </button>
          </Link>
          <Link href="/pro">
            <span
              data-testid="link-modal-see-pro"
              onClick={closeModal}
              style={{
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: C.textFaint,
                cursor: "pointer",
                transition: "color 0.15s",
                paddingTop: 2,
                display: "inline-block",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.color = C.gold; }}
              onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.color = C.textFaint; }}
            >
              See what Pro unlocks →
            </span>
          </Link>
        </div>
      </div>
    </>
  );
}
