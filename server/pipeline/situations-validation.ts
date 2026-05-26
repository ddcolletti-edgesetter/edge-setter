import { computeSituationConfidence } from "./situations-confidence";
import type { NormalizedEvent, Situation } from "./situations-contract";
import { buildSituationFromNormalizedEvent } from "./situations-engine";
import { generateCanonicalSituationId } from "./situations-hash";
import { matchSituation } from "./situations-matching";
import { createSituationSnapshot, verifySituationSnapshotIntegrity } from "./situations-snapshot";
import {
  ensureSituationSchema,
  insertSituation,
  verifySituationAppendOnlyGuards,
} from "./situations-store";
import { getPipelineDb } from "./store";

export interface SituationValidationResult {
  readonly name: string;
  readonly ok: boolean;
  readonly details: Record<string, unknown>;
}

export function validateDeterministicReplayConsistency(): SituationValidationResult {
  const event = sampleNormalizedEvent();
  const identity = {
    sport: event.sport,
    league: event.league,
    teams: event.teams,
    players: event.players,
    situation_type: event.situation_type,
    semantic_fingerprint: event.semantic_fingerprint,
  };
  const first = generateCanonicalSituationId(identity);
  const second = generateCanonicalSituationId({ ...identity, teams: [...event.teams].reverse(), players: [...event.players].reverse() });

  return {
    name: "deterministic_replay_consistency",
    ok: first === second,
    details: { first, second },
  };
}

export function validateCanonicalMatchingStability(): SituationValidationResult {
  const event = sampleNormalizedEvent();
  const situation = buildSituationFromNormalizedEvent(event);
  const distractor: Situation = {
    ...situation,
    situation_id: "sit_distractor",
    canonical_hash: "distractor",
    players: ["Different Player"],
    semantic_fingerprint: "weather delay wind",
  };
  const left = matchSituation(event, [distractor, situation]);
  const right = matchSituation(event, [situation, distractor]);

  return {
    name: "canonical_matching_stability",
    ok: left.matched_situation?.situation_id === situation.situation_id &&
      right.matched_situation?.situation_id === situation.situation_id &&
      left.match_confidence === right.match_confidence,
    details: {
      left_match: left.matched_situation?.situation_id ?? null,
      right_match: right.matched_situation?.situation_id ?? null,
      confidence: left.match_confidence,
    },
  };
}

export function validateSnapshotIntegrity(): SituationValidationResult {
  const event = sampleNormalizedEvent();
  const situation = buildSituationFromNormalizedEvent(event);
  const confidence = computeSituationConfidence({
    source_reliability: 18,
    independent_confirmations: 12,
    market_alignment: 9,
    validator_agreement: 8,
    official_confirmation: 0,
    freshness: 9,
    contradiction_penalty: 0,
    computed_at: event.received_at,
  });
  const snapshot = createSituationSnapshot({
    situation_id: situation.situation_id,
    lifecycle_state: "developing",
    confidence,
    summary: event.summary,
    escalation_score: 72,
    timing_pressure: "medium",
    evidence_event_ids: ["se_alpha"],
    previous_snapshot_hash: null,
    created_at: event.received_at,
  });
  const tampered = { ...snapshot, summary: "tampered summary" };

  return {
    name: "snapshot_integrity",
    ok: verifySituationSnapshotIntegrity(snapshot) && !verifySituationSnapshotIntegrity(tampered),
    details: {
      snapshot_id: snapshot.snapshot_id,
      replay_hash: snapshot.replay_hash,
    },
  };
}

export function validateAppendOnlyVerification(): SituationValidationResult {
  ensureSituationSchema();
  const situation = buildSituationFromNormalizedEvent(sampleNormalizedEvent());
  insertSituation(situation);
  const guards = verifySituationAppendOnlyGuards();

  let updateRejected = false;
  let deleteRejected = false;
  try {
    getPipelineDb().prepare("UPDATE situations SET league = ? WHERE situation_id = ?").run("NFL", situation.situation_id);
  } catch {
    updateRejected = true;
  }
  try {
    getPipelineDb().prepare("DELETE FROM situations WHERE situation_id = ?").run(situation.situation_id);
  } catch {
    deleteRejected = true;
  }

  return {
    name: "append_only_verification",
    ok: guards.ok && updateRejected && deleteRejected,
    details: {
      missing_guards: guards.missing,
      update_rejected: updateRejected,
      delete_rejected: deleteRejected,
    },
  };
}

export function runAllSituationValidations(): SituationValidationResult[] {
  return [
    validateDeterministicReplayConsistency(),
    validateCanonicalMatchingStability(),
    validateSnapshotIntegrity(),
    validateAppendOnlyVerification(),
  ];
}

function sampleNormalizedEvent(): NormalizedEvent {
  return {
    normalized_event_id: "ne_validation_alpha",
    raw_event_id: "raw_validation_alpha",
    source_id: "validation_source",
    source_type: "api",
    sport: "baseball",
    league: "MLB",
    game_id: "mlb_2026_05_23_wsh_atl",
    teams: ["WSH", "ATL"],
    players: ["Example Starter"],
    event_type: "injury_update",
    situation_type: "injury",
    semantic_fingerprint: "example starter questionable lower body injury",
    occurred_at: "2026-05-23T18:00:00.000Z",
    received_at: "2026-05-23T18:03:00.000Z",
    summary: "Example Starter moved to questionable before first pitch.",
    market_context: {
      market: "spread",
      open: -1.5,
      current: -1,
      delta: 0.5,
      direction: "up",
      sportsbook: "validation-book",
    },
    roster_context: {
      position: "SP",
      starter: true,
      depth_chart_role: "probable starter",
      replacement_player: null,
    },
    payload: { validation: true },
  };
}
