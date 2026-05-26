import {
  signalAgeMinutes,
  signalConfidence,
  signalHasMovement,
  signalIsActionable,
  signalPriorityScore,
  type BoardSignalLike,
} from "./signalBoardUx";

export type BoardEscalation = "Breaking" | "Urgent" | "Elevated" | "Watch" | "Quiet";

export type SituationLane =
  | "escalating"
  | "live"
  | "decision"
  | "confirmed"
  | "background";

export const BOARD_ESCALATION_RANK: Record<BoardEscalation, number> = {
  Breaking: 5,
  Urgent: 4,
  Elevated: 3,
  Watch: 2,
  Quiet: 1,
};

export const SITUATION_LANE_RANK: Record<SituationLane, number> = {
  escalating: 5,
  live: 4,
  decision: 3,
  confirmed: 2,
  background: 1,
};

export type BoardEscalationInput = BoardSignalLike & {
  type?: string | null;
  bettingRelevance?: boolean | null;
  fantasyRelevance?: boolean | null;
  injuryDesignation?: string | null;
};

export function deriveBoardEscalation(
  signal: BoardEscalationInput,
  opts: { isLiveGame?: boolean; decisionWindowOpen?: boolean } = {},
): BoardEscalation {
  const score = signalPriorityScore(signal);
  const confidence = signalConfidence(signal);
  const age = signalAgeMinutes(signal);
  const hasMovement = signalHasMovement(signal);
  const isActionable = signalIsActionable(signal);
  const verdict = (signal.verdict ?? signal.status_tag ?? "").toLowerCase();
  const type = (signal.type ?? "").toLowerCase();
  const designation = (signal.injuryDesignation ?? "").toUpperCase();
  const isFresh = age === null || age <= 45;
  const isVeryFresh = age === null || age <= 30;
  const isConfirmed = verdict.includes("confirmed") || verdict.includes("verified");
  const statusChange = type.includes("injury") && (designation === "OUT" || designation === "D");

  if ((isConfirmed && statusChange && isVeryFresh) || (score >= 100 && isVeryFresh)) {
    return "Breaking";
  }

  if (
    (score >= 82 && isFresh && (hasMovement || opts.isLiveGame)) ||
    (score >= 76 && isActionable && opts.decisionWindowOpen !== false)
  ) {
    return "Urgent";
  }

  if (score >= 65 || hasMovement || confidence >= 85 || opts.isLiveGame) {
    return "Elevated";
  }

  if (score >= 48 || isActionable || confidence >= 65) {
    return "Watch";
  }

  return "Quiet";
}

export function laneForEscalation(
  escalation: BoardEscalation,
  opts: { isLiveGame?: boolean; isActionable?: boolean; isConfirmed?: boolean } = {},
): SituationLane {
  if (escalation === "Breaking" || escalation === "Urgent") return "escalating";
  if (opts.isLiveGame && escalation !== "Quiet") return "live";
  if (opts.isActionable && (escalation === "Elevated" || escalation === "Watch")) return "decision";
  if (opts.isConfirmed) return "confirmed";
  return "background";
}

export function compareEscalation(a: BoardEscalation, b: BoardEscalation) {
  return BOARD_ESCALATION_RANK[b] - BOARD_ESCALATION_RANK[a];
}

export function compareSituationLane(a: SituationLane, b: SituationLane) {
  return SITUATION_LANE_RANK[b] - SITUATION_LANE_RANK[a];
}
