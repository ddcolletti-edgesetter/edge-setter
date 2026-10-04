import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

import type { Situation, SituationEvent, SituationSnapshot } from "../situations-contract";

/**
 * Phase 0 guard for the retroactive situation_events churn cleanup.
 *
 * The cleanup (Phase 1) deletes the duplicate `situation_created` rows that
 * ESPN's re-reported injuries minted. The corrupted-situation confidence guard
 * decides whether a headline is trustworthy by COUNTING those rows, so deleting
 * them would silently un-flag every situation the cleanup touches and hand its
 * inflated confidence back to customers — and, worse, drop those situations into
 * the "clean" cohort whose median IS the cap, raising the ceiling for everything
 * else of the same league + type.
 *
 * `situation_founding_audit` breaks that coupling: it records the pre-cleanup
 * founding count, both read paths consult it, and these tests pin the result.
 * The headline assertion is the delete simulation below — the API response for a
 * corrupted situation must come back byte-identical across the cleanup apart
 * from an explicitly enumerated set of fields.
 *
 * Store-backed: isolated pipeline.db (PIPELINE_DATA_DIR set before the store is
 * imported) with ../../storage mocked, mirroring the other pipeline tests.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-founding-audit-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
}));

let store: typeof import("../situations-store");
let api: typeof import("../situations-api");
let guard: typeof import("../situations-confidence-guard");
/** The real pipeline.db under TMP_DIR — what the API mapper reads through. */
let pipelineDb: BetterSqlite3.Database;

beforeAll(async () => {
  store = await import("../situations-store");
  api = await import("../situations-api");
  guard = await import("../situations-confidence-guard");
  pipelineDb = (await import("../store")).getPipelineDb();
  store.ensureSituationSchema(pipelineDb);
});

const LEAGUE = "NFL";
const BASE_MS = Date.parse("2026-09-01T12:00:00.000Z");
const iso = (minutes: number) => new Date(BASE_MS + minutes * 60_000).toISOString();
const SUMMARY = "Starting tackle listed as questionable with an ankle injury";

/* ─── Fixture builders ────────────────────────────────────── */

function makeSituation(id: string, type: string, createdFromEventId: string | null): Situation {
  return {
    situation_id: id,
    canonical_hash: `hash-${id}`,
    sport: "football",
    league: LEAGUE,
    game_id: null,
    teams: ["KC"],
    players: ["Fixture Player"],
    player_espn_id: null,
    player_jersey: null,
    situation_type: type,
    semantic_fingerprint: `roster injury fixture ${id}`,
    created_from_event_id: createdFromEventId,
    created_at: iso(0),
  };
}

function makeSnapshot(situationId: string, score: number): SituationSnapshot {
  return {
    snapshot_id: `ss-${situationId}`,
    situation_id: situationId,
    lifecycle_state: "developing",
    confidence: {
      score,
      factors: {
        source_reliability: 0.6,
        independent_confirmations: 0.5,
        market_alignment: 0,
        validator_agreement: 0,
        official_confirmation: 0,
        freshness: 0.9,
        contradiction_penalty: 0,
      },
      reasoning: ["fixture"],
      computed_at: iso(0),
      replay_hash: `conf-${situationId}`,
    },
    summary: SUMMARY,
    escalation_score: 50,
    timing_pressure: "medium",
    evidence_event_ids: [`se_evidence_${situationId}`],
    replay_hash: `snapreplay-${situationId}`,
    previous_snapshot_hash: null,
    created_at: iso(0),
  };
}

/**
 * One founding (`situation_created`) row, prod-shaped.
 *
 * `source_id` is identical on every duplicate because that is what prod holds —
 * every churned row came from the one ESPN injuries feed. The response's
 * `sourceCount` therefore does not move when the duplicates go, so the
 * byte-identical assertion below says something about the cleanup rather than
 * about a fixture that happened to dodge the question.
 */
function foundingEvent(situationId: string, normalizedEventId: string, recordedMinutes: number): SituationEvent {
  return store.buildSituationEvent({
    situation_id: situationId,
    kind: "situation_created",
    raw_event_id: `raw-${normalizedEventId}`,
    normalized_event_id: normalizedEventId,
    source_id: "espn_nfl_injuries",
    observed_at: iso(recordedMinutes),
    recorded_at: iso(recordedMinutes),
    payload: {
      normalized_event: {
        normalized_event_id: normalizedEventId,
        raw_event_id: `raw-${normalizedEventId}`,
        event_type: "injury_report",
        source_type: "sports_api",
        source_id: "espn_nfl_injuries",
        summary: SUMMARY,
        occurred_at: iso(recordedMinutes),
        received_at: iso(recordedMinutes),
        // The real adapter payload shape — situations-lineage reads
        // normalized_event.payload.raw_payload off this.
        payload: { raw_payload: { source_event_id: `espn-${normalizedEventId}` } },
      },
    },
  });
}

interface SeedResult {
  readonly founding: readonly SituationEvent[];
  /** The founder — the row carrying `situations.created_from_event_id`. */
  readonly keeper: SituationEvent;
  readonly duplicates: readonly SituationEvent[];
}

/**
 * Seed a situation with `foundingCount` founding rows plus one snapshot.
 *
 * `founderIndex` picks which founding row `created_from_event_id` points at.
 * Defaults to 0 (the earliest); prod has 450 situations where it is not the
 * earliest, which is why the keep key is the id and not the timestamp.
 */
function seedSituation(
  dbHandle: BetterSqlite3.Database,
  situationId: string,
  type: string,
  foundingCount: number,
  confidence: number,
  founderIndex = 0,
): SeedResult {
  const normalizedIds = Array.from({ length: foundingCount }, (_, i) => `ne-${situationId}-${i}`);
  store.insertSituation(makeSituation(situationId, type, normalizedIds[founderIndex] ?? null), dbHandle);
  const founding = normalizedIds.map((normalizedId, i) => {
    const event = foundingEvent(situationId, normalizedId, i * 10);
    store.appendSituationEvent(event, dbHandle);
    return event;
  });
  store.appendSituationSnapshot(makeSnapshot(situationId, confidence), dbHandle);
  return {
    founding,
    keeper: founding[founderIndex],
    duplicates: founding.filter((_, i) => i !== founderIndex),
  };
}

/**
 * Delete rows from the append-only situation_events table exactly the way the
 * Phase 1 job will: drop the guard trigger, delete, recreate it — all inside one
 * transaction, so a crash can never leave the table unguarded.
 */
function deleteEventsLikeCleanup(dbHandle: BetterSqlite3.Database, eventIds: readonly string[]): void {
  dbHandle.transaction(() => {
    dbHandle.exec("DROP TRIGGER IF EXISTS situation_events_no_delete");
    const stmt = dbHandle.prepare("DELETE FROM situation_events WHERE event_id = ?");
    for (const id of eventIds) stmt.run(id);
    dbHandle.exec(`
      CREATE TRIGGER IF NOT EXISTS situation_events_no_delete
      BEFORE DELETE ON situation_events
      BEGIN
        SELECT RAISE(ABORT, 'situation_events is append-only');
      END;
    `);
  })();
}

function auditFor(seed: SeedResult, situationId: string) {
  return {
    situation_id: situationId,
    founding_row_count: seed.founding.length,
    kept_event_id: seed.keeper.event_id,
    keep_key_source: "created_from_event_id" as const,
    deleted_row_count: seed.duplicates.length,
    audited_at: iso(0),
  };
}

/* ─── Schema ──────────────────────────────────────────────── */

describe("situation_founding_audit schema", () => {
  let db: BetterSqlite3.Database;

  beforeEach(async () => {
    const sqlite = (await import("better-sqlite3")).default;
    db = new sqlite(":memory:");
    store.ensureSituationSchema(db);
  });

  it("is append-only like every other situations table", () => {
    const guards = store.verifySituationAppendOnlyGuards(db);
    expect(guards.ok).toBe(true);
    expect(guards.missing).toEqual([]);

    store.recordSituationFoundingAudit({
      situation_id: "sit-audit-immutable",
      founding_row_count: 7,
      kept_event_id: "se_keeper",
      keep_key_source: "created_from_event_id",
      deleted_row_count: 6,
      audited_at: iso(0),
    }, db);

    expect(() => db.prepare("UPDATE situation_founding_audit SET founding_row_count = 1 WHERE situation_id = ?")
      .run("sit-audit-immutable")).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM situation_founding_audit WHERE situation_id = ?")
      .run("sit-audit-immutable")).toThrow(/append-only/);
  });

  it("keeps the first (pre-cleanup) write when a resumed job re-audits a situation", () => {
    const first = {
      situation_id: "sit-audit-resume",
      founding_row_count: 1803,
      kept_event_id: "se_keeper",
      keep_key_source: "created_from_event_id" as const,
      deleted_row_count: 1802,
      audited_at: iso(0),
    };
    store.recordSituationFoundingAudit(first, db);
    // A resumed run re-reaches the situation, which now holds a single row.
    store.recordSituationFoundingAudit({ ...first, founding_row_count: 1, deleted_row_count: 0, audited_at: iso(60) }, db);

    expect(store.getSituationFoundingAudit("sit-audit-resume", db)?.founding_row_count).toBe(1803);
  });

  it("returns null for a situation with no audit row", () => {
    expect(store.getSituationFoundingAudit("sit-never-audited", db)).toBeNull();
  });
});

/* ─── Read path 1: the clean-baseline cohort ───────────────── */

describe("clean-baseline cohort gating (buildConfidenceBaselines)", () => {
  let db: BetterSqlite3.Database;
  const TYPE = "roster";

  beforeEach(async () => {
    const sqlite = (await import("better-sqlite3")).default;
    db = new sqlite(":memory:");
    store.ensureSituationSchema(db);
  });

  /** Three clean situations at 50/60/70 (median 60) + one corrupted at 99. */
  function seedCohort(): SeedResult {
    [50, 60, 70].forEach((score, i) => seedSituation(db, `sit-clean-${i}`, TYPE, 1, score));
    return seedSituation(db, "sit-corrupt", TYPE, 6, 99);
  }

  const baseline = () => guard.buildConfidenceBaselines(db).get(guard.confidenceBaselineKey(LEAGUE, TYPE));

  it("excludes a corrupted situation before the cleanup (live count > 1)", () => {
    seedCohort();
    expect(baseline()).toBe(60);
  });

  it("CONTROL: without an audit row the cleanup drags the inflated 99 into the cohort", () => {
    const seed = seedCohort();
    deleteEventsLikeCleanup(db, seed.duplicates.map((event) => event.event_id));

    // 50, 60, 70, 99 -> median at index floor(4/2) = 70. The cap ceiling just
    // rose for every corrupted NFL/roster situation. This is the regression the
    // audit clause exists to prevent; if this test ever reads 60, the control
    // has stopped controlling for anything.
    expect(baseline()).toBe(70);
  });

  it("keeps the corrupted situation out of the cohort after the cleanup when audited", () => {
    const seed = seedCohort();
    store.recordSituationFoundingAudit(auditFor(seed, "sit-corrupt"), db);
    deleteEventsLikeCleanup(db, seed.duplicates.map((event) => event.event_id));

    expect(store.listSituationEvents("sit-corrupt", db).filter((e) => e.kind === "situation_created")).toHaveLength(1);
    expect(baseline()).toBe(60);
  });

  it("does not exclude a situation whose audit row records a single founding", () => {
    [50, 60, 70].forEach((score, i) => seedSituation(db, `sit-clean-${i}`, TYPE, 1, score));
    store.recordSituationFoundingAudit({
      situation_id: "sit-clean-1",
      founding_row_count: 1,
      kept_event_id: "se_whatever",
      keep_key_source: "created_from_event_id",
      deleted_row_count: 0,
      audited_at: iso(0),
    }, db);

    expect(baseline()).toBe(60);
  });
});

/* ─── Read path 2: the API mapper's founding-row count ─────── */

/**
 * The ONLY fields the cleanup is allowed to move. Every other field in the API
 * response must come back byte-identical, and the first test below asserts the
 * actual divergence set equals this list exactly — so Phase 1 cannot widen the
 * blast radius without turning this test red.
 *
 * Every entry is the evidence-event COUNT restated:
 *   • evidenceCount                — literally `events.length`.
 *   • operationalVisibilityScore   — takes that count as a scoring input.
 *   • latestEvidence               — the newest 5 events; on a churned situation
 *                                    the duplicates ARE the newest, so the
 *                                    preview collapses to the surviving rows.
 *   • calibrationLimitations       — gains "fewer than three evidence events".
 *   • historicalPatternBasis       — gains "only one evidence event is available".
 *   • weakeningSignals             — gains "limited sample".
 * The last three are evidence depth in prose. Their post-cleanup wording is the
 * honest one (the churn is what made a single re-reported injury look like 1,803
 * observations), but it IS customer-visible copy that changes on every cleaned
 * situation, which is a product call and not a silent one.
 *
 * `confidence`, `confidenceLabel`, `sourceCount`, `escalationScore`, `severity`,
 * `historicalPatternConfidence`, `historicalPatternLabel`, `calibrationSummary`
 * and `replayHash` are deliberately NOT here, and are pinned individually below.
 * Any of them appearing on this list would mean the cleanup had been allowed to
 * change the number or the verdict a customer acts on.
 */
const CLEANUP_SENSITIVE_FIELDS = [
  "evidenceCount",
  "operationalVisibilityScore",
  "latestEvidence",
  "calibrationLimitations",
  "historicalPatternBasis",
  "weakeningSignals",
] as const;

describe("API response across the simulated cleanup", () => {
  /**
   * These tests run against the real pipeline.db (the API mapper reads through
   * getPipelineDb(), not a handle we can pass), and the situations tables are
   * append-only, so fixtures cannot be torn down between tests. Each test
   * therefore gets its OWN situation_type, which keeps both the listing query
   * and the baseline cohort key disjoint from every other test's rows.
   */
  function responseFor(situationId: string, type: string) {
    const record = store.listCanonicalSituations({ league: LEAGUE, situation_type: type }, pipelineDb)
      .find((candidate) => candidate.situation_id === situationId);
    if (!record) throw new Error(`fixture situation ${situationId} is not listable`);
    return api.mapCanonicalSituationToApiResponse(record, [], guard.buildConfidenceBaselines(pipelineDb));
  }

  /** Field-by-field JSON, so a divergence names the field that moved. */
  function fieldJson(response: Record<string, unknown>): Map<string, string> {
    const byField = new Map<string, string>();
    for (const key of Object.keys(response).sort()) byField.set(key, JSON.stringify(response[key]));
    return byField;
  }

  function divergentFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
    const left = fieldJson(before);
    const right = fieldJson(after);
    const keys = new Set([...left.keys(), ...right.keys()]);
    return [...keys].filter((key) => left.get(key) !== right.get(key)).sort();
  }

  it("holds confidence and every other field identical when the duplicates are audited and deleted", () => {
    const type = "roster_api_identical";
    [50, 60, 70].forEach((score, i) => seedSituation(pipelineDb, `sit-api-clean-${i}`, type, 1, score));
    const seed = seedSituation(pipelineDb, "sit-api-corrupt", type, 6, 99);

    const before = responseFor("sit-api-corrupt", type);
    // Corrupted (6 founding rows) and so capped to the clean median of 60.
    expect(before.confidence).toBe(60);
    expect(before.evidenceCount).toBe(6);

    store.recordSituationFoundingAudit(auditFor(seed, "sit-api-corrupt"), pipelineDb);
    deleteEventsLikeCleanup(pipelineDb, seed.duplicates.map((event) => event.event_id));
    api.resetSituationsApiBuildCaches();

    const after = responseFor("sit-api-corrupt", type);

    // Byte-identical everywhere except the enumerated set — and nowhere else.
    expect(divergentFields(before, after)).toEqual([...CLEANUP_SENSITIVE_FIELDS].sort());

    // The numbers and verdicts a customer acts on, pinned individually.
    expect(after.confidence).toBe(60);
    expect(after.confidenceLabel).toBe(before.confidenceLabel);
    expect(after.sourceCount).toBe(before.sourceCount);
    expect(after.escalationScore).toBe(before.escalationScore);
    expect(after.severity).toBe(before.severity);
    expect(after.lifecycleState).toBe(before.lifecycleState);
    expect(after.historicalPatternConfidence).toBe(before.historicalPatternConfidence);
    expect(after.historicalPatternLabel).toBe(before.historicalPatternLabel);
    expect(after.calibrationSummary).toBe(before.calibrationSummary);
    expect(after.replayHash).toBe(before.replayHash);

    expect(after.evidenceCount).toBe(1);
  });

  it("CONTROL: without the audit row the same deletes hand back the uncapped 99", () => {
    const type = "roster_api_control";
    [50, 60, 70].forEach((score, i) => seedSituation(pipelineDb, `sit-ctl-clean-${i}`, type, 1, score));
    const seed = seedSituation(pipelineDb, "sit-ctl-corrupt", type, 6, 99);

    expect(responseFor("sit-ctl-corrupt", type).confidence).toBe(60);

    deleteEventsLikeCleanup(pipelineDb, seed.duplicates.map((event) => event.event_id));
    api.resetSituationsApiBuildCaches();

    // No audit row -> live count reads 1 -> guard does not fire -> the inflated
    // headline is served, and the clean cohort has been poisoned besides.
    expect(responseFor("sit-ctl-corrupt", type).confidence).toBe(99);
  });

  it("keeps the guard firing when the kept founder is not the earliest row", () => {
    const type = "roster_api_founder";
    [50, 60, 70].forEach((score, i) => seedSituation(pipelineDb, `sit-fdr-clean-${i}`, type, 1, score));
    // created_from_event_id points at the 4th founding row, not the earliest —
    // the shape behind the 450 prod situations the keep key exists for.
    const seed = seedSituation(pipelineDb, "sit-fdr-corrupt", type, 6, 99, 3);
    expect(seed.keeper.event_id).not.toBe(seed.founding[0].event_id);

    store.recordSituationFoundingAudit(auditFor(seed, "sit-fdr-corrupt"), pipelineDb);
    deleteEventsLikeCleanup(pipelineDb, seed.duplicates.map((event) => event.event_id));
    api.resetSituationsApiBuildCaches();

    const surviving = store.listSituationEvents("sit-fdr-corrupt", pipelineDb)
      .filter((event) => event.kind === "situation_created");
    expect(surviving.map((event) => event.event_id)).toEqual([seed.keeper.event_id]);
    expect(responseFor("sit-fdr-corrupt", type).confidence).toBe(60);
  });

  it("is a no-op today: with the audit table empty the mapper reads the live count", () => {
    const type = "roster_api_noop";
    [50, 60, 70].forEach((score, i) => seedSituation(pipelineDb, `sit-noop-clean-${i}`, type, 1, score));
    seedSituation(pipelineDb, "sit-noop-corrupt", type, 6, 99);

    expect(store.getSituationFoundingAudit("sit-noop-corrupt", pipelineDb)).toBeNull();
    expect(responseFor("sit-noop-corrupt", type).confidence).toBe(60);
    expect(responseFor("sit-noop-clean-2", type).confidence).toBe(70);
  });
});
