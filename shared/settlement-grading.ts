/**
 * Settlement states and the named reasons a settled signal is not graded.
 *
 * Shared by the server (which writes them on outcomes / settled_outcomes) and
 * the client (which shows the description instead of "Pending"). These
 * descriptions ARE the documentation for each reason. Keep them true: a reason
 * whose description no longer matches what the grader does is a bug.
 *
 * Invariant: an outcome in state "no_grade" always has hit = NULL. That is
 * what keeps it out of every accuracy, track-record and calibration figure
 * (they all filter `hit IS NOT NULL`), so no index or plan-pinned query has to
 * know about this column.
 */

export type SettlementState = "graded" | "no_grade";

/** The side a signal's own card copy claimed. Stored on the signal, never inferred at settlement. */
export type GradedSide = "home" | "away" | "over" | "under";

export const GRADED_SIDES: readonly GradedSide[] = ["home", "away", "over", "under"];

export function isGradedSide(value: unknown): value is GradedSide {
  return typeof value === "string" && (GRADED_SIDES as readonly string[]).includes(value);
}

export const NO_GRADE_REASONS = {
  no_side_claimed:
    "The signal's card did not claim a side (home, away, over or under), so there is nothing to grade. " +
    "Line moves, injury and lineup signals report news and market movement; they make no pick.",
  signal_after_kickoff:
    "The signal was created after the game's scheduled kickoff, so any claim it made was not a pre-game claim.",
  no_signal_line:
    "No pre-game line for the claimed market was recorded at or before the time of the signal.",
  no_pregame_line:
    "No line for the claimed market was recorded before kickoff.",
  push:
    "The final result landed exactly on the line the claim was made against.",
  ambiguous_game:
    "Odds for more than one real game were recorded against this game row (for example both games of an MLB doubleheader), " +
    "so the lines cannot be attributed to the right game.",
  kickoff_time_unreliable:
    "The stored kickoff time is known to be stale: the odds feed was still treating the game as not started after it. " +
    "This happens when a game is postponed to later the same day, because the stored kickoff time is never updated. " +
    "KNOWN LIMITATION: this is only detectable for leagues the odds kickoff guard covers, and only for odds recorded " +
    "after the guard went live. A postponed game outside that coverage is graded against its original kickoff time.",
  legacy_no_result:
    "Settled by the pre-v2 rules (SETTLEMENT_V2=0), which produced no result for this signal.",
} as const;

export type NoGradeReason = keyof typeof NO_GRADE_REASONS;

export function isNoGradeReason(value: unknown): value is NoGradeReason {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(NO_GRADE_REASONS, value);
}

/** Customer-facing one-liner for a no-grade outcome. Falls back to a neutral sentence for an unknown code. */
export function describeNoGrade(reason: string | null | undefined): string {
  return isNoGradeReason(reason) ? NO_GRADE_REASONS[reason] : "This signal was settled without a grade.";
}
