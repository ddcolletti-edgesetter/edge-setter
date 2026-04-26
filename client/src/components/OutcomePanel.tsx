/**
 * Edge Setter — OutcomePanel  (Sprint 8)
 *
 * Minimal per-signal outcome + CLV display for signal detail panels.
 * Only renders when an Outcome exists for the signal.
 * Shows nothing (null) if no outcome has been recorded.
 *
 * Design: secondary meta — not a badge, not a dashboard.
 * Aligned with existing detail panel typography: Barlow Condensed labels,
 * 14px body, T.textMuted / T.textFaint palette.
 */

import { useState, useEffect } from "react";
import { fetchOutcomesForSignal } from "../lib/signalsApi";
import type { Outcome } from "../lib/signalsApi";
import { T } from "./v2/SportVisuals";

interface OutcomePanelProps {
  signalId: string;
  darkMode: boolean;
}

export default function OutcomePanel({ signalId, darkMode }: OutcomePanelProps) {
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!signalId) return;
    let cancelled = false;
    fetchOutcomesForSignal(signalId).then(data => {
      if (!cancelled) {
        setOutcomes(data);
        setLoaded(true);
      }
    }).catch(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [signalId]);

  // Don't render anything until loaded, and only render if outcomes exist
  if (!loaded || outcomes.length === 0) return null;

  const TH = {
    surface2:  darkMode ? T.surface2  : "#F5F1EB",
    border:    darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)",
    text:      darkMode ? T.text      : "#1A1712",
    textMuted: darkMode ? T.textMuted : "#4A443C",
    textFaint: darkMode ? T.textFaint : "#8C8277",
  };

  const outcome = outcomes[0]; // show most recent outcome

  // Resolve display values
  const hitLabel = outcome.hit === true ? "Won" : outcome.hit === false ? "Lost" : "Pending";
  const hitColor = outcome.hit === true ? T.green : outcome.hit === false ? T.danger : TH.textFaint;

  const clvVal = outcome.clv ?? (outcome as any).clv_points ?? null;
  const hasClv = clvVal !== null && typeof clvVal === "number";
  const clvPositive = hasClv && clvVal > 0;
  const clvColor = clvPositive ? T.green : !hasClv ? TH.textFaint : T.danger;
  const clvDisplay = hasClv
    ? `${clvPositive ? "+" : ""}${clvVal.toFixed(1)} pts`
    : "N/A";

  const marketLabel = outcome.market === "spread" ? "Spread"
    : outcome.market === "total" ? "Total"
    : outcome.market === "moneyline" ? "ML"
    : "Market";

  return (
    <div
      data-testid="outcome-panel"
      style={{
        margin: "10px 16px",
        padding: "10px 14px",
        background: TH.surface2,
        border: `1px solid ${TH.border}`,
        borderRadius: 4,
        borderLeft: `3px solid ${hitColor}`,
      }}
    >
      {/* Section label */}
      <div style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: TH.textFaint,
        marginBottom: 8,
      }}>
        Settled Outcome
      </div>

      {/* Outcome + CLV row */}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* Hit/Loss */}
        <div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
            color: TH.textFaint, marginBottom: 2,
          }}>Result</div>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: hitColor,
          }}>{hitLabel}</div>
        </div>

        {/* CLV */}
        <div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
            color: TH.textFaint, marginBottom: 2,
          }}>CLV</div>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: clvColor,
          }}>{clvDisplay}</div>
        </div>

        {/* Market */}
        <div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
            color: TH.textFaint, marginBottom: 2,
          }}>Market</div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 13, color: TH.textMuted,
          }}>{marketLabel}</div>
        </div>

        {/* Line context */}
        {outcome.line_at_signal != null && outcome.closing_line != null && (
          <div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
              color: TH.textFaint, marginBottom: 2,
            }}>Line</div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, color: TH.textMuted,
            }}>
              {outcome.line_at_signal > 0 ? "+" : ""}{outcome.line_at_signal}
              {" → "}
              {outcome.closing_line > 0 ? "+" : ""}{outcome.closing_line}
            </div>
          </div>
        )}
      </div>

      {/* CLV explainer — secondary meta */}
      {hasClv && (
        <div style={{
          marginTop: 7,
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 11,
          color: TH.textFaint,
          fontStyle: "italic",
          lineHeight: 1.4,
        }}>
          {clvPositive
            ? `Beat the closing line by ${Math.abs(clvVal).toFixed(1)} pts — signal added positive EV.`
            : `Market moved ${Math.abs(clvVal).toFixed(1)} pts against the signal — negative CLV.`}
        </div>
      )}
      {!hasClv && outcome.market !== "moneyline" && (
        <div style={{
          marginTop: 7,
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 11, color: TH.textFaint, fontStyle: "italic",
        }}>
          No numeric line recorded — CLV not applicable for this signal type.
        </div>
      )}
      {!hasClv && outcome.market === "moneyline" && (
        <div style={{
          marginTop: 7,
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 11, color: TH.textFaint, fontStyle: "italic",
        }}>
          Moneyline CLV computed via implied probability — coming next sprint.
        </div>
      )}
    </div>
  );
}
