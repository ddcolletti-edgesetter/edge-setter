import type Database from "better-sqlite3";

import { getCleanFoundingSituationConfidences } from "./situations-store";
import type { SituationEvent } from "./situations-contract";

/**
 * Corrupted-situation confidence guard.
 *
 * A canonical situation is founded once (a single `situation_created` event) and
 * thereafter re-detections attach as `situation_matched`. When the matcher
 * mis-founds, the same situation accumulates many `situation_created` rows, and
 * that duplicate founding evidence inflates the headline confidence far above
 * what a cleanly-founded situation of the same type ever shows. This was
 * confirmed live on two prod situations carrying 46 and 454 founding rows while
 * clean situations carry exactly 1.
 *
 * The guard does not touch the stored snapshot or attempt to recompute the
 * "true" confidence (the honest value is unrecoverable once the founding
 * evidence is duplicated). It caps the *presented* headline down to the clean
 * cohort's baseline for the same league + situation_type, so the situation stays
 * visible but never shows a number higher than a comparable clean situation.
 * Capping only ever lowers the number; it never raises it.
 */

/**
 * A situation with strictly more than this many `situation_created` (founding)
 * rows is treated as corrupted. A situation's identity (situation_id) is
 * deterministic from its content, so any second `situation_created` row for the
 * same situation_id is definitionally a matcher mis-founding, not a legitimate
 * re-detection — there is no gray zone to preserve. Clean situations have
 * exactly 1 founding row; anything with 2+ is corrupted.
 */
export const CORRUPTED_FOUNDING_ROW_THRESHOLD = 1;

/** Keys a baseline by league + situation_type, case-insensitive on league. */
export function confidenceBaselineKey(league: string, situationType: string): string {
  return `${(league ?? "").toUpperCase()}|${situationType ?? ""}`;
}

/** Count of distinct founding (`situation_created`) events for a situation. */
export function countFoundingRows(events: readonly Pick<SituationEvent, "kind">[]): number {
  let count = 0;
  for (const event of events) {
    if (event.kind === "situation_created") count += 1;
  }
  return count;
}

/** Median of a non-empty numeric list; null for an empty list. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Median headline confidence of the clean single-founding cohort, grouped by
 * league + situation_type. This is the ceiling a corrupted situation of the same
 * cohort is capped to.
 */
export function buildConfidenceBaselines(
  db?: Database.Database,
): Map<string, number> {
  const rows = getCleanFoundingSituationConfidences(db);
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const key = confidenceBaselineKey(row.league, row.situation_type);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row.confidence_score);
    else grouped.set(key, [row.confidence_score]);
  }
  const baselines = new Map<string, number>();
  for (const [key, values] of grouped) {
    const m = median(values);
    if (m != null) baselines.set(key, m);
  }
  return baselines;
}

/**
 * Cap a raw headline confidence down to the clean baseline when the situation is
 * corrupted (founding rows over the threshold).
 *
 * `corrupted` reports whether the founding-row count crosses the threshold — it
 * is the authoritative corruption signal and is set even when no cap was applied
 * (no baseline, or raw already at/below baseline). `capped` reports only whether
 * the number was actually lowered. The official-confirmation override is gated
 * on `corrupted`, not `capped`, so a corrupted situation is never pushed to 100
 * even when its cohort has no clean baseline to cap against.
 */
export function capCorruptedConfidence(input: {
  readonly rawConfidence: number;
  readonly foundingRowCount: number;
  readonly baseline: number | null | undefined;
  readonly threshold?: number;
}): { readonly confidence: number; readonly capped: boolean; readonly corrupted: boolean } {
  const threshold = input.threshold ?? CORRUPTED_FOUNDING_ROW_THRESHOLD;
  const corrupted = input.foundingRowCount > threshold;
  if (!corrupted) {
    return { confidence: input.rawConfidence, capped: false, corrupted: false };
  }
  if (input.baseline == null) {
    return { confidence: input.rawConfidence, capped: false, corrupted: true };
  }
  if (input.rawConfidence <= input.baseline) {
    return { confidence: input.rawConfidence, capped: false, corrupted: true };
  }
  return { confidence: input.baseline, capped: true, corrupted: true };
}

/**
 * Resolve the headline confidence shown to customers, applying the
 * official-confirmation override that lifts a confirmed situation to 100 — but
 * only when the situation is NOT corrupted. A corrupted situation's identity is
 * untrustworthy (it was mis-founded multiple times), so an official confirmation
 * must not push it to 100; it stays at its (already cap-adjusted) score, the
 * same treatment as any other corrupted situation.
 *
 * `rawConfidence` here is the post-cap value from capCorruptedConfidence.
 */
export function resolveHeadlineConfidence(input: {
  readonly rawConfidence: number;
  readonly corrupted: boolean;
  readonly lifecycleState: string;
  readonly hasOfficialConfirmation: boolean;
  readonly hasContradiction: boolean;
}): number {
  const officialOverride =
    input.lifecycleState === "official" ||
    (input.lifecycleState === "confirmed" && input.hasOfficialConfirmation && !input.hasContradiction);
  if (officialOverride && !input.corrupted) return 100;
  return input.rawConfidence;
}
