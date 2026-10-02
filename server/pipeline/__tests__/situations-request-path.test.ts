import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Regression suite for fix/situations-request-path.
 *
 * Oct 2 2026 02:38 UTC: a single GET /api/v2/situations blocked the event loop
 * >40s (it rebuilt the comparable corpus + confidence baselines INLINE — an N+1
 * over the multi-GB situation_events.payload_json plus per-signal outcome
 * lookups), the Render health check timed out, and the instance was killed.
 *
 * The fix moves the corpus + baseline build off the request path entirely: it is
 * built in the background by the ingestion cycle (buildSituationsEnrichmentCache),
 * and requests read the last built snapshot (stale-while-revalidate), serving
 * unenriched responses before the first build rather than building inline.
 *
 * This suite proves:
 *   1. listCanonicalSituationApiResponses performs ZERO enrichment builds on the
 *      request path — before OR after a background build.
 *   2. Before any background build, the request path still returns situations
 *      (unenriched), never throwing on the empty cache.
 *   3. getCanonicalSituationApiResponse fetches one situation by id (no feed
 *      scan) and likewise never builds.
 *   4. buildSituationsEnrichmentCache is the only thing that increments the build
 *      counter, and it populates the request-read cache.
 *
 * Setup mirrors the PIPELINE_DATA_DIR pattern used by the other store-backed
 * suites (redirect to a throwaway dir BEFORE store.ts is imported).
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-situations-reqpath-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;
process.env.CANONICAL_SITUATIONS_ENABLED = "true";

type StoreMod = typeof import("../situations-store");
type CoreStoreMod = typeof import("../store");
type ApiMod = typeof import("../situations-api");

let store: StoreMod;
let coreStore: CoreStoreMod;
let api: ApiMod;

const CREATED_AT = "2026-10-01T12:00:00.000Z";

beforeAll(async () => {
  coreStore = await import("../store");
  store = await import("../situations-store");
  api = await import("../situations-api");
});

function seedSituation(id: string, league: string, type: string, score: number): void {
  const db = coreStore.getPipelineDb();
  store.ensureSituationSchema(db);
  store.insertSituation({
    situation_id: id,
    canonical_hash: `hash-${id}`,
    sport: "football",
    league,
    game_id: null, // null game → passes the active-feed future-game filter
    teams: ["KC"],
    players: ["Patrick Mahomes"],
    situation_type: type,
    semantic_fingerprint: `${type} ${id}`,
    created_from_event_id: `ne-${id}`,
    created_at: CREATED_AT,
  }, db);

  // One founding event + one matched event, each carrying a normalized_event so
  // the mapper's payload reads exercise the narrowed batch SELECT.
  for (const [i, kind] of [["0", "situation_created"], ["1", "situation_matched"]] as const) {
    store.appendSituationEvent(store.buildSituationEvent({
      situation_id: id,
      kind,
      raw_event_id: `raw-${id}-${i}`,
      normalized_event_id: `ne-${id}-${i}`,
      source_id: `src-${id}-${i}`,
      observed_at: CREATED_AT,
      recorded_at: CREATED_AT,
      payload: {
        summary: `${type} update ${i}`,
        normalized_event: {
          event_type: type,
          source_type: "wire",
          summary: `${type} update ${i}`,
          occurred_at: CREATED_AT,
          received_at: CREATED_AT,
          market_context: { market: "spread", delta: 1.5, direction: "up" },
          payload: { signalId: `sig-${id}-${i}` },
        },
      },
    }), db);
  }

  store.appendSituationSnapshot({
    snapshot_id: `snap-${id}`,
    situation_id: id,
    lifecycle_state: "escalating",
    confidence: {
      score,
      factors: {
        source_reliability: 14,
        independent_confirmations: 10,
        market_alignment: 8,
        validator_agreement: 8,
        official_confirmation: 0,
        freshness: 8,
        contradiction_penalty: 0,
      },
      reasoning: ["seed"],
      computed_at: CREATED_AT,
      replay_hash: `conf-${id}`,
    },
    summary: `${type} developing for KC`,
    escalation_score: 70,
    timing_pressure: "high",
    evidence_event_ids: [`se_${id}_0`, `se_${id}_1`],
    replay_hash: `snap-replay-${id}`,
    previous_snapshot_hash: null,
    created_at: CREATED_AT,
  }, db);

  store.appendSituationStateHistory({
    history_id: `sh-${id}`,
    situation_id: id,
    previous_state: "watching",
    new_state: "escalating",
    transition_reason: "evidence strengthened",
    trigger_event_id: `se_${id}_1`,
    metadata: {},
    replay_hash: `sh-replay-${id}`,
    created_at: CREATED_AT,
  }, db);

  store.appendSituationConfidenceHistory({
    history_id: `ch-${id}`,
    situation_id: id,
    previous_confidence: score - 10,
    new_confidence: score,
    factor_breakdown: {
      source_reliability: 14,
      independent_confirmations: 10,
      market_alignment: 8,
      validator_agreement: 8,
      official_confirmation: 0,
      freshness: 8,
      contradiction_penalty: 0,
    },
    reasoning: ["seed"],
    event_id: `se_${id}_1`,
    replay_hash: `ch-replay-${id}`,
    created_at: CREATED_AT,
  }, db);
}

describe("situations request path never builds the enrichment corpus", () => {
  beforeEach(() => {
    api.resetSituationsApiBuildCaches();
    seedSituation("sit-req-1", "NFL", "roster", 72);
    seedSituation("sit-req-2", "NFL", "roster", 64);
    seedSituation("sit-req-3", "NFL", "injury", 58);
  });

  it("serves the list unenriched before any background build, with zero builds", () => {
    const before = api.getSituationsEnrichmentMetrics().buildCount;

    const situations = api.listCanonicalSituationApiResponses({ league: "NFL", limit: 50 });

    expect(situations.length).toBeGreaterThanOrEqual(3);
    // No background build has run, so there is no cache to read from.
    expect(api.getSituationsEnrichmentMetrics().hasCache).toBe(false);
    // The request path must not have built anything.
    expect(api.getSituationsEnrichmentMetrics().buildCount).toBe(before);
    // With no corpus, comparable matching reports missing corpus (unenriched).
    const anyCalibrated = situations.find((s) => s.id === "sit-req-1");
    expect(anyCalibrated?.calibrationLimitations ?? []).toContain(
      "Missing corpus data: no prior comparable situation records are available.",
    );
  });

  it("builds only in the background job, which populates the request-read cache", async () => {
    const before = api.getSituationsEnrichmentMetrics().buildCount;

    const built = await api.buildSituationsEnrichmentCache({ chunkSize: 2 });

    expect(built.corpus.length).toBeGreaterThanOrEqual(3);
    expect(api.getSituationsEnrichmentMetrics().buildCount).toBe(before + 1);
    expect(api.getSituationsEnrichmentMetrics().hasCache).toBe(true);
  });

  it("does ZERO builds across many list + by-id requests after the cache is warm", async () => {
    await api.buildSituationsEnrichmentCache({ chunkSize: 2 });
    const afterBuild = api.getSituationsEnrichmentMetrics().buildCount;

    for (let i = 0; i < 5; i += 1) {
      api.listCanonicalSituationApiResponses({ league: "NFL", limit: 50 });
      api.listCanonicalSituationApiResponses({ orderBy: "operational_visibility_score", limit: 25 });
      api.getCanonicalSituationApiResponse("sit-req-1");
      api.getCanonicalSituationApiResponse("does-not-exist");
    }

    // The request path consumed the cache but never rebuilt it.
    expect(api.getSituationsEnrichmentMetrics().buildCount).toBe(afterBuild);
  });

  it("getCanonicalSituationApiResponse returns one situation by id, null for unknown, with zero builds", () => {
    const before = api.getSituationsEnrichmentMetrics().buildCount;

    const found = api.getCanonicalSituationApiResponse("sit-req-2");
    const missing = api.getCanonicalSituationApiResponse("nope");

    expect(found?.id).toBe("sit-req-2");
    expect(missing).toBeNull();
    expect(api.getSituationsEnrichmentMetrics().buildCount).toBe(before);
  });
});
