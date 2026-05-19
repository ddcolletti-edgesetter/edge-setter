/* Edge Setter — Signal Impact Panel (Session 9)
 *
 * Two-column DFS / Betting data layer shown in every signal detail rail.
 * Displays the full data picture of what's affected — no picks or recommendations.
 */

import { T } from "../v2/SportVisuals";
import { computeImpact, type SignalForImpact, type ImpactMetric } from "../../lib/signalImpact";

const DFS_COLOR     = "#00E676";
const BETTING_COLOR = "#00B7FF";

interface Props {
  signal: SignalForImpact;
  darkMode?: boolean;
}

function MetricRow({
  metric, textColor, mutedColor,
}: {
  metric: ImpactMetric;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 6,
      padding: "4px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 11,
        color: mutedColor,
        letterSpacing: "0.03em",
        flexShrink: 0,
      }}>
        {metric.label}
      </span>
      <span style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 11,
        fontWeight: 700,
        color: metric.alert ? T.gold : textColor,
        textAlign: "right",
        lineHeight: 1.3,
      }}>
        {metric.value}
      </span>
    </div>
  );
}

function TagPill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color,
      background: `${color}18`,
      border: `1px solid ${color}33`,
      borderRadius: 2,
      padding: "1px 5px",
    }}>
      {label}
    </span>
  );
}

export default function SignalImpactPanel({ signal, darkMode = true }: Props) {
  const impact = computeImpact(signal);

  if (!impact.dfs && !impact.betting) return null;

  const surfaceBg  = darkMode ? T.surface1  : "#FFFFFF";
  const goldDim    = "rgba(245,184,65,0.15)";
  const textColor  = darkMode ? T.text      : "#1A1712";
  const mutedColor = darkMode ? T.textMuted : "#5A544C";
  const faintColor = darkMode ? T.textFaint : "#64748B";

  const hasBoth = !!(impact.dfs && impact.betting);

  return (
    <div style={{
      border: `1px solid ${goldDim}`,
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{
        background: `${T.gold}0A`,
        borderBottom: `1px solid ${goldDim}`,
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <div style={{
          width: 2,
          height: 12,
          background: T.gold,
          borderRadius: 1,
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: T.gold,
        }}>
          Impact Overview
        </span>
      </div>

      {/* Columns */}
      <div style={{
        display: "grid",
        gridTemplateColumns: hasBoth ? "1fr 1fr" : "1fr",
      }}>
        {/* DFS column */}
        {impact.dfs && (
          <div style={{
            padding: "10px 12px",
            borderRight: hasBoth ? `1px solid ${goldDim}` : "none",
            background: surfaceBg,
          }}>
            {/* Column header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginBottom: 8,
            }}>
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: DFS_COLOR,
              }}>
                ◈ DFS
              </span>
              {impact.dfs.ownershipDirection === "drop" && (
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: T.danger,
                }}>
                  ▼ DROP
                </span>
              )}
              {impact.dfs.ownershipDirection === "spike" && (
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: DFS_COLOR,
                }}>
                  ▲ ADD
                </span>
              )}
            </div>

            {/* Metrics */}
            {impact.dfs.metrics.map((m, i) => (
              <MetricRow
                key={i}
                metric={m}
                textColor={textColor}
                mutedColor={mutedColor}
              />
            ))}

            {/* Position tags */}
            {impact.dfs.affectedPositions.length > 0 && (
              <div style={{ marginTop: 7, display: "flex", gap: 4, flexWrap: "wrap" }}>
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 9,
                  color: faintColor,
                  letterSpacing: "0.06em",
                  marginRight: 2,
                }}>
                  Affected:
                </span>
                {impact.dfs.affectedPositions.map(pos => (
                  <TagPill key={pos} label={pos} color={DFS_COLOR} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Betting column */}
        {impact.betting && (
          <div style={{
            padding: "10px 12px",
            background: surfaceBg,
          }}>
            {/* Column header */}
            <div style={{
              marginBottom: 8,
            }}>
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: BETTING_COLOR,
              }}>
                ◆ BETTING
              </span>
            </div>

            {/* Metrics */}
            {impact.betting.metrics.map((m, i) => (
              <MetricRow
                key={i}
                metric={m}
                textColor={textColor}
                mutedColor={mutedColor}
              />
            ))}

            {/* Market tags */}
            {impact.betting.affectedMarkets.length > 0 && (
              <div style={{ marginTop: 7, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {impact.betting.affectedMarkets.map(market => (
                  <TagPill key={market} label={market} color={BETTING_COLOR} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
