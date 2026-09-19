/**
 * Edge Setter — Situation lifecycle state machine.
 *
 * ── Conclusion on the "confirmed" state (Sep 2026 investigation) ────────────
 * The confirmed-state ceiling investigation established that "confirmed" via
 * the evidence path is, by design, effectively UNREACHABLE for the signals the
 * pipeline actually produces — and that this is correct, not a bug to paper
 * over:
 *
 *   1. Confidence: the consensus blend (consensus-evaluator.ts) structurally
 *      caps around 73–76 for a single-source signal, because ~0.45 of the vote
 *      weight (Corroboration 0.25 + Market 0.20) cannot rise without a 2nd/3rd
 *      source or real line movement. Prod is single-source almost everywhere
 *      (distinct_sources ~= 1.0 across every type), so 88 is rarely met.
 *   2. Corroboration: the second conjunct now gates on DISTINCT SOURCES (>= 3),
 *      the thing "confirmed" actually claims. The former `evidence_count >= 3`
 *      term was a no-op (prod evidence_count averaged 6–138 across every type)
 *      and, for injury, was ~14x inflated by re-polls of one source.
 *
 * The 88 confidence bar is deliberately NOT lowered: doing so would let a lone
 * source masquerade as "confirmed", the exact dishonesty the display-language
 * pass fought. Earned finality instead flows through the OFFICIAL path
 * (`official_confirmation` trigger / `official` flag → "official" state), which
 * a single legitimate official source can reach. "confirmed" is reserved for
 * genuine multi-source corroboration and stays honestly rare.
 */
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
  /** Distinct observations backing the situation (deduped; see summarizeSituationEvidence). */
  readonly evidence_count: number;
  /** Distinct independent sources on record. Gates "confirmed" — the state word claims corroboration. */
  readonly distinct_source_count?: number;
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
      distinct_source_count: input.distinct_source_count ?? 0,
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

  // "confirmed" is the promotable, corroboration-claiming state, so its second
  // conjunct gates on DISTINCT SOURCES, not raw evidence volume. The old
  // `evidence_count >= 3` term was a no-op (prod avg evidence_count ran 6–138
  // across every type) and, for injury, was inflated ~14x by re-polls of a
  // single source — so it certified "confirmed" off one source seen many times.
  // The 88 confidence bar is unchanged.
  if (input.confidence >= 88 && (input.distinct_source_count ?? 0) >= 3) return "confirmed";
  // Escalating gate lowered 74 -> 65 (#46: p85 of the real historical confidence distribution; max ever
  // recorded was 73, median 56, so nothing had ever crossed 74). Flags the top ~15% of situations. Stays
  // above the developing gate (58) below and under confirmed (88), so the state ordering is preserved.
  if (input.confidence >= 65 && (input.trigger === "market_reaction" || input.evidence_count >= 2)) return "escalating";
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
