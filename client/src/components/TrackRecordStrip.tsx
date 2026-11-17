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
 *
 * WHY THERE IS NO CLV FIGURE HERE
 * ───────────────────────────────
 * This strip used to print "avg CLV" beside the hit rate. Both reasons it came
 * out are about the number, not the layout:
 *
 *  1. Wrong denominator, and the client cannot fix it. The API's `avg_clv_points`
 *     is an AVG over rows where `outcomes.clv IS NOT NULL`, and clv is only ever
 *     populated for `line_move` outcomes. On prod that is 987 of NFL's 5,295
 *     settled signals and 2,403 of CFB's 2,613. It was rendered inline next to
 *     "N settled signals", so it read as the CLV of all N. GET
 *     /api/stats/track-record returns no count of the non-null clv rows, so the
 *     strip has no honest denominator available to label it with.
 *
 *  2. `line_move` is exactly the population graded against a possibly in-play
 *     closing line. PR #87 stopped new in-play odds being ingested as pre-game
 *     market data; the existing outcomes graded against one are still in the
 *     table until the #88 sweep excludes them.
 *
 * The hit rate stays: it is a real count over settled outcomes with
 * `excluded_stale = 0`, and its denominator is the number printed beside it.
 *
 * A CLV figure can come back once #88 has excluded the in-play-graded outcomes
 * AND the endpoint also returns the number of rows the average covers.
 */
import React from "react";
import { useTrackRecord, type TrackRecordSlice } from "../hooks/useTrackRecord";

/**
 * SHOW_TRACK_RECORD_STRIP — off since 2026-11-17
 *
 * The strip is withheld from the NFL and CFB boards, the only two that render
 * it. The hit rate it prints is counted over settled outcomes of every signal
 * type, and `line_move` is a large share of that sample on exactly these two
 * boards: 987 of NFL's 5,295 settled signals and 2,403 of CFB's 2,613.
 *
 * `line_move` is the population that may have been graded against an in-play
 * closing line. PR #87 stopped new in-play odds being ingested as pre-game
 * market data, but the outcomes already graded against one are still in the
 * table — excluding them is #88, which is open and whose candidate predicate
 * is not yet right. So the 47-49% figures the strip shows are not backed, and
 * this follows #93 in withholding a board number we cannot stand behind.
 *
 * The component is not the problem and is left intact, with its tests: this
 * gates the two call sites only.
 *
 * Set back to `true` when BOTH hold:
 *   1. #88's sweep predicate is fixed AND the sweep has run, so outcomes graded
 *      against an in-play line are excluded from the track-record counts; and
 *   2. the hit rates have been re-measured against the swept data.
 */
export const SHOW_TRACK_RECORD_STRIP = false;

const MIN_SAMPLE = 20; // threshold below which we show the warming-up disclaimer

interface Props {
  league: "NBA" | "MLB" | "NFL" | "CFB";
  darkMode: boolean;
}

function fmt_pct(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
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
  const textFaint  = darkMode ? "#94A3B8" : "#64748B";
  const textMuted  = darkMode ? "#CBD5E1" : "#475569";
  const numEmphasis = darkMode ? "#F8FAFC" : "#0F172A";
  const borderColor = darkMode ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.12)";

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
        fontSize: 12.5,
        letterSpacing: "0.02em",
        color: textMuted,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}>
        <span style={{ color: textFaint, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10.5, fontWeight: 800 }}>
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
            <span style={{ color: textFaint }}>(sample size small — warming up)</span>
          </>
        )}

        {hasData && !smallSample && (
          <>
            <span style={{ color: numEmphasis }}>{fmt_pct(overall.hit_rate)}</span>
            <span style={{ color: textFaint }}>hit rate</span>
            <span style={{ color: textFaint }}>·</span>
            <span style={{ color: textFaint }}>{overall.total_signals} settled signals</span>
          </>
        )}
      </div>

      {/* Secondary line — per-type breakdown (only when > 1 type and enough sample) */}
      {hasData && by_signal_type.length > 1 && (
        <div style={{
          fontFamily: FONT,
          fontSize: 11.5,
          color: textFaint,
          fontWeight: 600,
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
