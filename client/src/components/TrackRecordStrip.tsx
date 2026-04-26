/**
 * TrackRecordStrip — Sprint 9
 *
 * A quiet 1–2 line meta strip rendered below the board title on each league board.
 * Purpose: quiet credibility, not hype. Never competes with signals.
 *
 * Rules:
 * - Small font, muted color — matches existing meta label treatment
 * - No charts, no big pills, no green-only bias
 * - Hides entirely on fetch error
 * - Shows disclaimer when total_signals < MIN_SAMPLE
 * - Numbers get slightly stronger color emphasis; labels stay faint
 */
import React from "react";
import { useTrackRecord, type TrackRecordSlice } from "../hooks/useTrackRecord";

const MIN_SAMPLE = 20; // threshold below which we show the warming-up disclaimer

interface Props {
  league: "NBA" | "MLB" | "NFL" | "CFB";
  darkMode: boolean;
}

function fmt_pct(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function fmt_clv(clv: number | null): string {
  if (clv === null) return "—";
  const sign = clv >= 0 ? "+" : "";
  return `${sign}${clv.toFixed(1)} pts`;
}

function SliceLabel({ slice, textColor, numColor }: {
  slice: TrackRecordSlice;
  textColor: string;
  numColor: string;
}) {
  const label = (slice.signal_type ?? "").replace(/_/g, " ");
  return (
    <span style={{ color: textColor }}>
      {label}:{" "}
      <span style={{ color: numColor }}>{fmt_pct(slice.hit_rate)}</span>
      {slice.avg_clv_points !== null && (
        <> / <span style={{ color: numColor }}>{fmt_clv(slice.avg_clv_points)}</span></>
      )}
    </span>
  );
}

export default function TrackRecordStrip({ league, darkMode }: Props) {
  const { data, loading, error } = useTrackRecord(league);

  // Don't render until resolved
  if (loading) return null;
  // Hide entirely on error — soft failure
  if (error || !data) return null;

  const { overall, by_signal_type } = data;

  // Colors — inherit from board's token set (dark or light)
  const textFaint  = darkMode ? "#7E776A" : "#9E9890";
  const textMuted  = darkMode ? "#B7AFA0" : "#7E776A";
  const numEmphasis = darkMode ? "#C5BDB2" : "#4A4540"; // slightly stronger, not gold
  const borderColor = darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";

  const FONT = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
  const hasData = overall.total_signals > 0;
  const smallSample = overall.total_signals < MIN_SAMPLE;

  return (
    <div style={{
      padding: "7px 20px 8px",
      borderBottom: `1px solid ${borderColor}`,
      flexShrink: 0,
    }}>
      {/* Primary line */}
      <div style={{
        fontFamily: FONT,
        fontSize: 12,
        letterSpacing: "0.03em",
        color: textMuted,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}>
        <span style={{ color: textFaint, textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10 }}>
          Track record
        </span>
        <span style={{ color: textFaint }}>·</span>

        {!hasData && (
          <span style={{ color: textFaint }}>No settled outcomes yet.</span>
        )}

        {hasData && smallSample && (
          <>
            <span style={{ color: numEmphasis }}>{fmt_pct(overall.hit_rate)}</span>
            <span style={{ color: textFaint }}>hit rate</span>
            {overall.avg_clv_points !== null && (
              <>
                <span style={{ color: textFaint }}>/</span>
                <span style={{ color: numEmphasis }}>{fmt_clv(overall.avg_clv_points)}</span>
                <span style={{ color: textFaint }}>avg CLV</span>
              </>
            )}
            <span style={{ color: textFaint }}>(sample size small — warming up)</span>
          </>
        )}

        {hasData && !smallSample && (
          <>
            <span style={{ color: numEmphasis }}>{fmt_pct(overall.hit_rate)}</span>
            <span style={{ color: textFaint }}>hit rate</span>
            {overall.avg_clv_points !== null && (
              <>
                <span style={{ color: textFaint }}>/</span>
                <span style={{ color: numEmphasis }}>{fmt_clv(overall.avg_clv_points)}</span>
                <span style={{ color: textFaint }}>avg CLV</span>
              </>
            )}
            <span style={{ color: textFaint }}>·</span>
            <span style={{ color: textFaint }}>{overall.total_signals} settled signals</span>
          </>
        )}
      </div>

      {/* Secondary line — per-type breakdown (only when > 1 type and enough sample) */}
      {hasData && by_signal_type.length > 1 && (
        <div style={{
          fontFamily: FONT,
          fontSize: 11,
          color: textFaint,
          marginTop: 2,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}>
          {by_signal_type.slice(0, 4).map(slice => (
            <SliceLabel
              key={slice.signal_type}
              slice={slice}
              textColor={textFaint}
              numColor={numEmphasis}
            />
          ))}
        </div>
      )}
    </div>
  );
}
