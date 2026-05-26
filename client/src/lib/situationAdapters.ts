import type { SituationEscalationState } from "@/components/board/SituationRow";
import type { Sport } from "./leagueModifiers";
import type { BoardSituation } from "./boardSituations";
import type { BoardEscalation, SituationLane } from "./boardEscalation";
import type { OperationalLifecycle, SignalLifecycle } from "./signalBoardUx";
import {
  canonicalConfidenceSummary,
  canonicalEvidenceSummary,
  canonicalLifecycleLabel,
  canonicalOperationalState,
  canonicalUncertaintySummary,
  isCoolingCanonicalSituation,
  normalizeSituationType,
  rankCanonicalSituations,
  type CanonicalSituation,
} from "./situationsApi";

export function canonicalSituationsToBoardSituations(
  situations: readonly CanonicalSituation[],
  league: Sport,
): BoardSituation[] {
  return rankCanonicalSituations(situations.filter((situation) => situation.league === league))
    .map((situation) => canonicalSituationToBoardSituation(situation));
}

export function canonicalSituationToBoardSituation(situation: CanonicalSituation): BoardSituation {
  const escalation = boardEscalationForCanonicalSituation(situation);
  const lane = boardLaneForCanonicalSituation(situation, escalation);
  const subject = situation.players[0] ?? situation.teams.join(" / ") ?? situation.league;
  const latestEvidence = canonicalEvidenceSummary(situation);
  const cooling = isCoolingCanonicalSituation(situation);
  const confidenceMovement = confidenceMovementLabel(situation);
  const convergence = sourceConvergenceLabel(situation);

  return {
    id: `canonical-${situation.id}`,
    kind: "canonical",
    league: situation.league,
    lane,
    escalation,
    title: situation.title || `${subject} ${normalizeSituationType(situation.situationType)}`.trim(),
    detail: situation.summary,
    team: situation.teams[0],
    opponent: situation.teams[1],
    player: situation.players[0],
    signalType: situation.situationType,
    statusLabel: canonicalLifecycleLabel(situation.lifecycleState),
    timeLabel: relativeTime(situation.lastUpdatedAt),
    movementLabel: situation.latestEvidence.find((event) => event.marketImpact)?.marketImpact ?? undefined,
    score: situation.operationalVisibilityScore,
    confidence: situation.confidence,
    sourceCount: situation.sourceCount,
    trustLabel: situation.confidenceLabel,
    lifecycle: signalLifecycleForCanonicalSituation(situation),
    lifecycleStage: operationalLifecycleForCanonicalSituation(situation),
    confidenceNote: confidenceMovement
      ? `${confidenceMovement}: ${canonicalConfidenceSummary(situation)}`
      : canonicalConfidenceSummary(situation),
    sourceSummary: convergence,
    timingAdvantage: cooling ? quietTimingCopy(situation.lifecycleState) : timingPressureCopy(situation.timingPressure),
    marketReaction: situation.latestEvidence.find((event) => event.marketImpact)?.marketImpact ?? canonicalUncertaintySummary(situation) ?? latestEvidence,
    replayChain: [
      "First seen",
      canonicalLifecycleLabel(situation.lifecycleState),
      situation.replayHash ? "Replay-safe" : null,
    ].filter(Boolean) as string[],
    isLive: situation.timingPressure === "high" || situation.timingPressure === "critical",
    isActionable: !cooling && situation.operationalVisibilityScore >= 55,
    relatedSignalIds: [],
    canonicalSituation: situation,
  };
}

export function mergeCanonicalWithBoardSituations(
  canonical: readonly BoardSituation[],
  fallback: readonly BoardSituation[],
): BoardSituation[] {
  if (!canonical.length) return [...fallback];

  const canonicalKeys = new Set(canonical.map(storyKey));
  const remainingFallback = fallback.filter((situation) => {
    if (situation.kind === "game") return true;
    return !canonicalKeys.has(storyKey(situation));
  });

  return [...canonical, ...remainingFallback];
}

export function canonicalBoardEscalationState(situation: CanonicalSituation): SituationEscalationState {
  const state = canonicalOperationalState(situation.lifecycleState);
  if (state === "cooling") return "monitoring";
  return state;
}

function boardEscalationForCanonicalSituation(situation: CanonicalSituation): BoardEscalation {
  if (["resolved", "archived", "invalidated"].includes(situation.lifecycleState)) return "Quiet";
  if (situation.lifecycleState === "cooling") return "Watch";
  if (situation.severity === "critical" && situation.lifecycleState === "escalating") return "Urgent";
  if (situation.escalationScore >= 82 && situation.timingPressure !== "inactive") return "Urgent";
  if (situation.escalationScore >= 65 || situation.lifecycleState === "escalating") return "Elevated";
  if (situation.confidence >= 55 || situation.lifecycleState === "developing" || situation.lifecycleState === "emerging") return "Watch";
  return "Quiet";
}

function boardLaneForCanonicalSituation(situation: CanonicalSituation, escalation: BoardEscalation): SituationLane {
  if (situation.lifecycleState === "escalating" && (escalation === "Urgent" || escalation === "Elevated")) return "escalating";
  if (situation.timingPressure === "high" || situation.timingPressure === "critical") return "live";
  if (situation.lifecycleState === "confirmed" || situation.lifecycleState === "official") return "confirmed";
  if (situation.lifecycleState === "cooling" || situation.lifecycleState === "resolved" || situation.lifecycleState === "archived" || situation.lifecycleState === "invalidated") return "background";
  if (escalation === "Elevated" || escalation === "Watch") return "decision";
  return "background";
}

function signalLifecycleForCanonicalSituation(situation: CanonicalSituation): SignalLifecycle {
  if (situation.lifecycleState === "watching" || situation.lifecycleState === "emerging") return "Early";
  if (situation.lifecycleState === "developing" || situation.lifecycleState === "escalating") return "Developing";
  if (situation.lifecycleState === "confirmed" || situation.lifecycleState === "official") return "Confirmed";
  if (situation.lifecycleState === "cooling") return "Expiring";
  return "Stale";
}

function operationalLifecycleForCanonicalSituation(situation: CanonicalSituation): OperationalLifecycle {
  if (situation.lifecycleState === "watching" || situation.lifecycleState === "emerging") return "Detected";
  if (situation.lifecycleState === "developing") return "Developing";
  if (situation.lifecycleState === "escalating") return "Escalating";
  if (situation.lifecycleState === "confirmed" || situation.lifecycleState === "official") return "Verified";
  return "Resolved / Stale";
}

function timingPressureCopy(pressure: CanonicalSituation["timingPressure"]) {
  if (pressure === "critical") return "early signal; verify latest evidence before treating it as durable";
  if (pressure === "high") return "developing edge with active evidence";
  if (pressure === "medium") return "partially priced; confirmation still forming";
  if (pressure === "low") return "books holding; monitoring only";
  return "no remaining edge";
}

function quietTimingCopy(state: CanonicalSituation["lifecycleState"]) {
  if (state === "cooling") return "fully priced; timing advantage is fading";
  if (state === "resolved" || state === "archived" || state === "invalidated") return "no remaining edge; background context only";
  return "monitoring only";
}

function confidenceMovementLabel(situation: CanonicalSituation) {
  const delta = situation.confidenceHistoryPreview[0]?.delta;
  if (typeof delta !== "number" || delta === 0) return null;
  if (delta > 0) return `Confidence building +${Math.round(delta)}`;
  return `Confidence cooling ${Math.round(delta)}`;
}

function sourceConvergenceLabel(situation: CanonicalSituation) {
  const agreement = situation.latestEvidence.find((event) => event.validatorAgreement)?.validatorAgreement;
  if (situation.lifecycleState === "cooling" || situation.lifecycleState === "resolved") {
    return `${situation.sourceCount} sources / pressure receding`;
  }
  if (agreement) return `${situation.sourceCount} sources / ${agreement}`;
  if (situation.sourceCount >= 3) return `${situation.sourceCount} sources / convergence forming`;
  if (situation.sourceCount >= 2) return `${situation.sourceCount} sources / corroborating`;
  return `${situation.sourceCount} source / verification still thin`;
}

function storyKey(situation: BoardSituation) {
  const canonical = situation.canonicalSituation as CanonicalSituation | undefined;
  const type = normalizeSituationType(canonical?.situationType ?? situation.signalType);
  const player = normalizeStoryToken(canonical?.players?.[0] ?? situation.player);
  const team = normalizeStoryToken(canonical?.teams?.[0] ?? situation.team ?? situation.awayTeam);
  return [situation.league, type, player, team].filter(Boolean).join(":");
}

function normalizeStoryToken(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function relativeTime(iso: string) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return iso;
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
