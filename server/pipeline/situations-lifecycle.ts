import { computeCanonicalHash } from "./canonical-hash";
import type { SituationLifecycleState } from "./situations-contract";

export type SituationLifecycleTrigger =
  | "evidence_added"
  | "market_reaction"
  | "validator_confirmation"
  | "official_confirmation"
  | "contradiction"
  | "stale_tick"
  | "resolution"
  | "archive";

export interface SituationLifecycleInput {
  readonly current_state: SituationLifecycleState | null;
  readonly trigger: SituationLifecycleTrigger;
  readonly confidence: number;
  readonly evidence_count: number;
  readonly hours_since_latest_evidence: number;
  readonly contradiction_count?: number;
  readonly official?: boolean;
}

export interface SituationLifecycleTransition {
  readonly previous_state: SituationLifecycleState | null;
  readonly new_state: SituationLifecycleState;
  readonly transition_reason: string;
  readonly replay_hash: string;
  readonly metadata: Record<string, unknown>;
}

export function transitionSituationLifecycle(input: SituationLifecycleInput): SituationLifecycleTransition {
  const previous = input.current_state;
  const next = deriveNextState(input);
  const transition: Omit<SituationLifecycleTransition, "replay_hash"> = {
    previous_state: previous,
    new_state: next,
    transition_reason: transitionReason(input, next),
    metadata: {
      trigger: input.trigger,
      confidence: input.confidence,
      evidence_count: input.evidence_count,
      hours_since_latest_evidence: input.hours_since_latest_evidence,
      contradiction_count: input.contradiction_count ?? 0,
      official: input.official === true,
    },
  };

  return {
    ...transition,
    replay_hash: computeCanonicalHash(transition),
  };
}

function deriveNextState(input: SituationLifecycleInput): SituationLifecycleState {
  if (input.trigger === "archive") return "archived";
  if (input.trigger === "contradiction" && (input.contradiction_count ?? 1) > 0) {
    return input.confidence < 35 ? "invalidated" : "cooling";
  }
  if (input.trigger === "resolution") return input.official || input.confidence >= 82 ? "resolved" : "cooling";
  if (input.trigger === "official_confirmation" || input.official) return "official";
  if (input.trigger === "stale_tick") return decayState(input.current_state, input.hours_since_latest_evidence);

  if (input.confidence >= 88 && input.evidence_count >= 3) return "confirmed";
  if (input.confidence >= 74 && (input.trigger === "market_reaction" || input.evidence_count >= 2)) return "escalating";
  if (input.confidence >= 58 && input.evidence_count >= 2) return "developing";
  if (input.confidence >= 40 || input.evidence_count > 0) return "emerging";
  return "watching";
}

function decayState(current: SituationLifecycleState | null, hours: number): SituationLifecycleState {
  if (!current) return "watching";
  if (hours < 6) return current;
  if (hours >= 168) return "archived";
  if (hours >= 72) return current === "resolved" || current === "official" ? current : "cooling";
  if (hours >= 24 && (current === "escalating" || current === "developing" || current === "confirmed")) return "cooling";
  return current;
}

function transitionReason(input: SituationLifecycleInput, next: SituationLifecycleState): string {
  if (input.trigger === "stale_tick") return `Stale degradation applied after ${input.hours_since_latest_evidence}h without fresh evidence`;
  if (input.trigger === "contradiction") return "Contradictory evidence reduced situation pressure";
  if (input.trigger === "official_confirmation" || input.official) return "Official confirmation moved situation to earned finality";
  if (input.trigger === "market_reaction") return "Market reaction raised operational pressure";
  if (input.trigger === "resolution") return "Situation reached resolution criteria";
  if (next === "watching") return "Evidence is not strong enough to escalate";
  return `Lifecycle advanced to ${next} from evidence count and explainable confidence`;
}
