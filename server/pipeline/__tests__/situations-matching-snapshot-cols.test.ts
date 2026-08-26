import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import type { Situation, SituationSnapshot } from "../situations-contract";
import {
  appendSituationSnapshot,
  ensureSituationSchema,
  insertSituation,
  listSituationsForMatching,
} from "../situations-store";

const CREATED_AT = "2026-08-26T12:00:00.000Z";

function makeSituation(overrides: Partial<Situation> = {}): Situation {
  return {
    situation_id: "sit-match-1",
    canonical_hash: "hash-match-1",
    sport: "football",
    league: "NFL",
    game_id: null,
    teams: ["KC"],
    players: ["Patrick Mahomes"],
    situation_type: "roster",
    semantic_fingerprint: "roster injury Patrick Mahomes KC",
    created_from_event_id: "ne_origin",
    created_at: CREATED_AT,
    ...overrides,
  };
}

function makeSnapshot(situationId: string, overrides: Partial<SituationSnapshot> = {}): SituationSnapshot {
  return {
    snapshot_id: "snap-match-1",
    situation_id: situationId,
    lifecycle_state: "watching",
    confidence: {
      score: 62,
      factors: {
        source_reliability: 0.6,
        independent_confirmations: 0.5,
        market_alignment: 0,
        validator_agreement: 0,
        official_confirmation: 0,
        freshness: 0.9,
        contradiction_penalty: 0,
      },
      reasoning: ["seed"],
      computed_at: CREATED_AT,
      replay_hash: "conf-replay-1",
    },
    summary: "Mahomes limited in practice, status uncertain.",
    escalation_score: 40,
    timing_pressure: "medium",
    evidence_event_ids: ["se_evidence_1"],
    replay_hash: "snap-replay-1",
    previous_snapshot_hash: null,
    created_at: CREATED_AT,
    ...overrides,
  };
}

describe("listSituationsForMatching", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    ensureSituationSchema(db);
  });

  // Regression: the old query aggregated with MAX(ss.created_at) AS latest_snapshot_at
  // and returned only a timestamp — no snapshot_id/confidence_json/summary — so
  // deserializeCanonicalSituationRecord always built latest_snapshot = null and
  // isUsableSituation filtered out every candidate (zero matches, ever, in prod).
  // The correlated-subquery rewrite pulls the actual latest snapshot row.
  it("returns records with a fully-populated latest_snapshot (not just a timestamp)", () => {
    const situation = makeSituation();
    insertSituation(situation, db);
    appendSituationSnapshot(makeSnapshot(situation.situation_id), db);

    const results = listSituationsForMatching({ league: "NFL", situation_type: "roster" }, db);

    expect(results).toHaveLength(1);
    const record = results[0];
    expect(record.situation_id).toBe(situation.situation_id);
    expect(record.latest_snapshot).not.toBeNull();
    expect(record.latest_snapshot?.snapshot_id).toBe("snap-match-1");
    expect(record.latest_snapshot?.confidence.score).toBe(62);
    expect(record.latest_snapshot?.summary).toBe("Mahomes limited in practice, status uncertain.");
    expect(record.latest_snapshot_at).toBe(CREATED_AT);
  });
});
