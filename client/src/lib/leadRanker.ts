// ─────────────────────────────────────────────────────────────────────────────
// EdgeSetter — Lead Ranker
//
// Canonical lead selection for the homepage and board pages.
//
// selectHomepageLead — canonical situations, Gate 1 (storyTypeTiers) +
//   Gate 2 (age cap) + scoring (confidence × proximity × recency + verification)
// selectFeaturedSituation — board pages, re-exported from boardSituations
//
// Both surfaces agree on which situation leads because they share the same
// compareLeadRank comparator (via boardSituations).
// ─────────────────────────────────────────────────────────────────────────────

import type { CanonicalSituationRecord } from "../types/situation";
import { isLeadEligible } from "./storyTypeTiers";
import { gameProximityScore } from "./gameProximityScore";

export { selectFeaturedSituation } from "./boardSituations";

/** Hard cap: situations older than this never lead the homepage. */
export const LEAD_MAX_AGE_HOURS = 7 * 24;

/**
 * Age in hours from an ISO timestamp to `referenceTime`.
 * Returns Infinity for invalid or missing timestamps.
 * Injectable referenceTime enables deterministic testing.
 */
export function ageHoursFrom(iso: string, referenceTime: number = Date.now()): number {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY;
  return (referenceTime - ms) / 3_600_000;
}

/**
 * Selects the homepage lead from a pool of canonical situation records.
 *
 * Gate 1 — story type: only LEAD_ELIGIBLE signal types qualify (storyTypeTiers).
 * Gate 2 — age cap: situations older than LEAD_MAX_AGE_HOURS are excluded.
 *
 * Scoring (higher = leads):
 *   confidenceScore × gameProximity × recency + verificationBoost
 *
 * Fresh pool preference: if any situation is < 24 hours old, older situations
 * are excluded from the final sort. This ensures a verified 24h-old story
 * doesn't permanently block a fresh developing story.
 *
 * @param referenceTime  Injectable "now" (ms since epoch). Defaults to Date.now().
 *   Pass a fixed value in tests for deterministic results.
 */
export function selectHomepageLead(
  situations: CanonicalSituationRecord[],
  referenceTime: number = Date.now(),
): CanonicalSituationRecord | null {
  const eligible = situations.filter((s) => {
    if (!isLeadEligible(s.signalType)) return false;
    const ageH = ageHoursFrom(s.firstDetected, referenceTime);
    return ageH <= LEAD_MAX_AGE_HOURS;
  });

  if (eligible.length === 0) return null;

  const freshPool = eligible.filter(
    (s) => ageHoursFrom(s.firstDetected, referenceTime) <= 24,
  );
  const pool = freshPool.length > 0 ? freshPool : eligible;

  return [...pool].sort((a, b) => {
    const scoreDiff = _leadScore(b, referenceTime) - _leadScore(a, referenceTime);
    if (scoreDiff !== 0) return scoreDiff;
    return (
      new Date(b.firstDetected).getTime() - new Date(a.firstDetected).getTime()
    );
  })[0] ?? null;
}

function _leadScore(s: CanonicalSituationRecord, referenceTime: number): number {
  const proximity = gameProximityScore(s.gameDate, referenceTime);
  const ageH = ageHoursFrom(s.firstDetected, referenceTime);
  const recency =
    ageH <= 1 ? 2.0
    : ageH <= 6 ? 1.5
    : ageH <= 24 ? 1.0
    : 0.6;
  const verificationBoost =
    s.verificationState === "verified" ? 20
    : s.verificationState === "escalating" ? 10
    : 0;
  return s.confidenceScore * proximity * recency + verificationBoost;
}
