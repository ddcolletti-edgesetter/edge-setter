// ─────────────────────────────────────────────────────────────────────────────
// EdgeSetter — Story Age
//
// Leaf module: timestamp-age math shared by the homepage lead ranker
// (leadRanker) and the board featured-situation selector (boardSituations).
//
// This lives on its own, with no imports of its own, specifically so those two
// modules can share it without forming an import cycle — leadRanker re-exports
// selectFeaturedSituation from boardSituations, so boardSituations must not
// import back from leadRanker.
// ─────────────────────────────────────────────────────────────────────────────

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
