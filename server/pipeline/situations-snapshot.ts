import { computeCanonicalHash } from "./canonical-hash";
import type {
  SituationConfidenceExplanation,
  SituationLifecycleState,
  SituationSnapshot,
} from "./situations-contract";

export function createSituationSnapshot(input: {
  readonly situation_id: string;
  readonly lifecycle_state: SituationLifecycleState;
  readonly confidence: SituationConfidenceExplanation;
  readonly summary: string;
  readonly escalation_score: number;
  readonly timing_pressure: SituationSnapshot["timing_pressure"];
  readonly evidence_event_ids: readonly string[];
  readonly previous_snapshot_hash?: string | null;
  readonly created_at: string;
}): SituationSnapshot {
  const replayPayload = {
    situation_id: input.situation_id,
    lifecycle_state: input.lifecycle_state,
    confidence: input.confidence,
    summary: input.summary,
    escalation_score: Math.round(input.escalation_score),
    timing_pressure: input.timing_pressure,
    evidence_event_ids: [...input.evidence_event_ids].sort(),
    previous_snapshot_hash: input.previous_snapshot_hash ?? null,
    created_at: input.created_at,
  };
  const replayHash = computeCanonicalHash(replayPayload);

  return {
    snapshot_id: `ss_${replayHash.slice(0, 24)}`,
    ...replayPayload,
    replay_hash: replayHash,
  };
}

export function shouldCreateSituationSnapshot(input: {
  readonly previous_state: SituationLifecycleState | null;
  readonly next_state: SituationLifecycleState;
  readonly previous_confidence: number | null;
  readonly next_confidence: number;
  readonly evidence_count_changed?: boolean;
  readonly official_changed?: boolean;
}): boolean {
  if (input.previous_state !== input.next_state) return true;
  if (input.previous_confidence == null) return true;
  if (Math.abs(input.next_confidence - input.previous_confidence) >= 8) return true;
  if (input.evidence_count_changed) return true;
  if (input.official_changed) return true;
  return false;
}

export function verifySituationSnapshotIntegrity(snapshot: SituationSnapshot): boolean {
  const expected = createSituationSnapshot({
    situation_id: snapshot.situation_id,
    lifecycle_state: snapshot.lifecycle_state,
    confidence: snapshot.confidence,
    summary: snapshot.summary,
    escalation_score: snapshot.escalation_score,
    timing_pressure: snapshot.timing_pressure,
    evidence_event_ids: snapshot.evidence_event_ids,
    previous_snapshot_hash: snapshot.previous_snapshot_hash,
    created_at: snapshot.created_at,
  });

  return expected.snapshot_id === snapshot.snapshot_id && expected.replay_hash === snapshot.replay_hash;
}
