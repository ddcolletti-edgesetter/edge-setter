import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

import type { Situation, SituationEvent, SituationSnapshot } from "../situations-contract";

/**
 * Phase 1 of the retroactive situation churn cleanup — the job that deletes.
 *
 * Phase 0 (#74) built situation_founding_audit and pointed both confidence-guard
 * read paths at it, so the guard survives having the founding rows removed. This
 * suite covers the removal itself, and the properties that make it something you
 * can point at prod:
 *
 *   - it keeps the founder, not merely the first row (450 prod situations have an
 *     earliest founding row that is NOT their founder),
 *   - it keeps every real state change, and the snapshot the read path serves,
 *   - a cleaned situation's API response moves only in the six fields Phase 0
 *     enumerated — in particular not confidence, and not replayHash,
 *   - the append-only guard triggers are back afterwards, including after a
 *     failure mid-chunk,
 *   - maxSituations, the kill switch, and resumption all actually bound it,
 *   - the dry run's counts are the real run's counts.
 *
 * Store-backed: isolated pipeline.db (PIPELINE_DATA_DIR set before the store is
 * imported) with ../../storage mocked, mirroring situation-founding-audit.test.ts.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-bloat-cleanup-"));
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
let cleanup: typeof import("../situation-bloat-cleanup");
/** The real pipeline.db under TMP_DIR — what the API mapper reads through. */
let pipelineDb: BetterSqlite3.Database;

beforeAll(async () => {
  store = await import("../situations-store");
  api = await import("../situations-api");
  guard = await import("../situations-confidence-guard");
  cleanup = await import("../situation-bloat-cleanup");
  pipelineDb = (await import("../store")).getPipelineDb();
  store.ensureSituationSchema(pipelineDb);
});

const LEAGUE = "NFL";
const BASE_MS = Date.parse("2026-09-01T12:00:00.000Z");
const iso = (minutes: number) => new Date(BASE_MS + minutes * 60_000).toISOString();
const SUMMARY = "Starting tackle listed as questionable with an ankle injury";

/* ─── Fixture builders ────────────────────────────────────── */

/**
 * A fresh in-memory DB carrying the situations schema AND pipeline_meta.
 *
 * pipeline_meta lives in store.ts's own schema, which an in-memory handle never
 * runs; the cleanup keeps its kill switch, cursor and completion markers there,
 * so the tests have to provide it.
 */
async function freshDb(): Promise<BetterSqlite3.Database> {
  const sqlite = (await import("better-sqlite3")).default;
  const db = new sqlite(":memory:");
  store.ensureSituationSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_meta (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

interface SnapshotSpec {
  /** Suffix only; the full snapshot_id is built from it so ordering is controllable. */
  readonly id: string;
  readonly state: string;
  readonly conf: number;
  readonly summary: string;
  readonly esc: number;
  /** Minutes past BASE_MS. Equal values reproduce prod's tied created_at. */
  readonly at: number;
}

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

function makeSnapshot(situationId: string, spec: SnapshotSpec): SituationSnapshot {
  return {
    snapshot_id: `ss-${situationId}-${spec.id}`,
    situation_id: situationId,
    lifecycle_state: spec.state,
    confidence: {
      score: spec.conf,
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
      computed_at: iso(spec.at),
      replay_hash: `conf-${situationId}-${spec.id}`,
    },
    summary: spec.summary,
    escalation_score: spec.esc,
    timing_pressure: spec.state === "confirmed" ? "high" : "medium",
    evidence_event_ids: [`se_evidence_${situationId}_${spec.id}`],
    replay_hash: `snapreplay-${situationId}-${spec.id}`,
    previous_snapshot_hash: null,
    created_at: iso(spec.at),
  } as SituationSnapshot;
}

/** One founding (situation_created) row, prod-shaped — see situation-founding-audit.test.ts. */
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
        payload: { raw_payload: { source_event_id: `espn-${normalizedEventId}` } },
      },
    },
  });
}

/** The snapshot_created event the engine pairs with each snapshot. */
function snapshotEvent(situationId: string, snapshotId: string, minutes: number): SituationEvent {
  return store.buildSituationEvent({
    situation_id: situationId,
    kind: "snapshot_created",
    raw_event_id: null,
    normalized_event_id: null,
    source_id: "canonical_situation_engine",
    observed_at: iso(minutes),
    recorded_at: iso(minutes),
    payload: { snapshot_id: snapshotId, snapshot_replay_hash: `snapreplay-${snapshotId}` },
  });
}

/** An evidence row the cleanup must never touch. */
function matchedEvent(situationId: string, index: number): SituationEvent {
  return store.buildSituationEvent({
    situation_id: situationId,
    kind: "situation_matched",
    raw_event_id: `raw-match-${situationId}-${index}`,
    normalized_event_id: `ne-match-${situationId}-${index}`,
    source_id: "beat_reporter",
    observed_at: iso(index),
    recorded_at: iso(index),
    payload: { normalized_event: { summary: SUMMARY } },
  });
}

interface Seed {
  readonly situationId: string;
  readonly founding: readonly SituationEvent[];
  readonly keeper: SituationEvent;
  readonly duplicates: readonly SituationEvent[];
  readonly snapshotIds: readonly string[];
  /** snapshot_id -> the snapshot_created event that announced it. */
  readonly snapshotEventBySnapshotId: ReadonlyMap<string, string>;
  readonly matched: readonly SituationEvent[];
}

const ONE_SNAPSHOT: SnapshotSpec[] = [{ id: "a", state: "developing", conf: 70, summary: SUMMARY, esc: 50, at: 0 }];

/**
 * Seed a situation. Rows are inserted in the order given, which IS rowid order —
 * the order the plan reads them in.
 */
function seed(
  db: BetterSqlite3.Database,
  opts: {
    situationId: string;
    type: string;
    foundingCount: number;
    founderIndex?: number;
    snapshots?: SnapshotSpec[];
    matchedCount?: number;
  },
): Seed {
  const { situationId, type, foundingCount } = opts;
  const founderIndex = opts.founderIndex ?? 0;
  const snapshotSpecs = opts.snapshots ?? ONE_SNAPSHOT;

  const normalizedIds = Array.from({ length: foundingCount }, (_, i) => `ne-${situationId}-${i}`);
  store.insertSituation(makeSituation(situationId, type, normalizedIds[founderIndex] ?? null), db);

  const founding = normalizedIds.map((normalizedId, i) => {
    const event = foundingEvent(situationId, normalizedId, i * 10);
    store.appendSituationEvent(event, db);
    return event;
  });

  const matched = Array.from({ length: opts.matchedCount ?? 0 }, (_, i) => {
    const event = matchedEvent(situationId, i);
    store.appendSituationEvent(event, db);
    return event;
  });

  const snapshotIds: string[] = [];
  const snapshotEventBySnapshotId = new Map<string, string>();
  for (const spec of snapshotSpecs) {
    const snapshot = makeSnapshot(situationId, spec);
    store.appendSituationSnapshot(snapshot, db);
    const event = snapshotEvent(situationId, snapshot.snapshot_id, spec.at);
    store.appendSituationEvent(event, db);
    snapshotIds.push(snapshot.snapshot_id);
    snapshotEventBySnapshotId.set(snapshot.snapshot_id, event.event_id);
  }

  return {
    situationId,
    founding,
    keeper: founding[founderIndex],
    duplicates: founding.filter((_, i) => i !== founderIndex),
    snapshotIds,
    snapshotEventBySnapshotId,
    matched,
  };
}

/* ─── Readers ─────────────────────────────────────────────── */

function eventIds(db: BetterSqlite3.Database, situationId: string, kind?: string): string[] {
  const sql = kind
    ? `SELECT event_id FROM situation_events WHERE situation_id = ? AND kind = ? ORDER BY rowid ASC`
    : `SELECT event_id FROM situation_events WHERE situation_id = ? ORDER BY rowid ASC`;
  const rows = (kind ? db.prepare(sql).all(situationId, kind) : db.prepare(sql).all(situationId)) as { event_id: string }[];
  return rows.map((row) => row.event_id);
}

function snapshotIdsOf(db: BetterSqlite3.Database, situationId: string): string[] {
  return (db.prepare(`SELECT snapshot_id FROM situation_snapshots WHERE situation_id = ? ORDER BY rowid ASC`)
    .all(situationId) as { snapshot_id: string }[]).map((row) => row.snapshot_id);
}

function run(db: BetterSqlite3.Database, overrides: Partial<import("../situation-bloat-cleanup").SituationBloatCleanupOptions> = {}) {
  return cleanup.runSituationBloatCleanup({ league: LEAGUE, maxSituations: 1000, db, ...overrides });
}

/* ─── 1. What survives ────────────────────────────────────── */

describe("what the cleanup leaves behind", () => {
  let db: BetterSqlite3.Database;
  beforeEach(async () => { db = await freshDb(); });

  it("keeps the founder, every state change, and every evidence row", async () => {
    /* developing(kept, first) → developing(restates) → developing(restates)
       → escalating(state change, kept) → escalating(restates)
       → confirmed(state change, kept). Distinct created_at, so the served
       snapshot is the last one and the pin is not what carries this test. */
    const specs: SnapshotSpec[] = [
      { id: "a", state: "developing", conf: 40, summary: "A", esc: 50, at: 0 },
      { id: "b", state: "developing", conf: 40, summary: "A", esc: 50, at: 10 },
      { id: "c", state: "developing", conf: 40, summary: "A", esc: 50, at: 20 },
      { id: "d", state: "escalating", conf: 70, summary: "B", esc: 80, at: 30 },
      { id: "e", state: "escalating", conf: 70, summary: "B", esc: 80, at: 40 },
      { id: "f", state: "confirmed", conf: 90, summary: "C", esc: 95, at: 50 },
    ];
    const s = seed(db, { situationId: "sit-survive", type: "roster", foundingCount: 6, snapshots: specs, matchedCount: 3 });

    const result = await run(db);
    expect(result.status).toBe("completed");

    // One founding row, and it is the founder.
    expect(eventIds(db, "sit-survive", "situation_created")).toEqual([s.keeper.event_id]);

    // The first snapshot and both state changes; the three restatements are gone.
    expect(snapshotIdsOf(db, "sit-survive")).toEqual([
      s.snapshotIds[0], s.snapshotIds[3], s.snapshotIds[5],
    ]);

    // Exactly the paired events of the deleted snapshots went with them, and the
    // paired events of the KEPT snapshots are all still there.
    const survivingEvents = new Set(eventIds(db, "sit-survive"));
    for (const keptId of [s.snapshotIds[0], s.snapshotIds[3], s.snapshotIds[5]]) {
      expect(survivingEvents.has(s.snapshotEventBySnapshotId.get(keptId)!)).toBe(true);
    }
    for (const goneId of [s.snapshotIds[1], s.snapshotIds[2], s.snapshotIds[4]]) {
      expect(survivingEvents.has(s.snapshotEventBySnapshotId.get(goneId)!)).toBe(false);
    }

    // Evidence rows are not the cleanup's business.
    for (const event of s.matched) expect(survivingEvents.has(event.event_id)).toBe(true);
    expect(eventIds(db, "sit-survive", "situation_matched")).toHaveLength(3);

    // And the audit row carries the PRE-delete founding count.
    const audit = store.getSituationFoundingAudit("sit-survive", db);
    expect(audit).toMatchObject({
      founding_row_count: 6,
      kept_event_id: s.keeper.event_id,
      keep_key_source: "created_from_event_id",
      deleted_row_count: 5,
    });
  });

  it("keeps the founder when the founder is not the earliest row", async () => {
    // created_from_event_id points at the 4th founding row — the shape behind the
    // 450 prod situations where "keep the first" would delete the founder.
    const s = seed(db, { situationId: "sit-founder", type: "roster", foundingCount: 6, founderIndex: 3 });
    expect(s.keeper.event_id).not.toBe(s.founding[0].event_id);

    const result = await run(db);
    expect(result.status).toBe("completed");

    expect(eventIds(db, "sit-founder", "situation_created")).toEqual([s.keeper.event_id]);
    expect(store.getSituationFoundingAudit("sit-founder", db)).toMatchObject({
      kept_event_id: s.keeper.event_id,
      keep_key_source: "created_from_event_id",
      founding_row_count: 6,
    });
    expect(result.keepKey.founder_not_earliest).toBe(1);
    expect(result.keepKey.created_from_event_id).toBe(1);
  });

  it("falls back to the earliest row by ROWID when nothing carries created_from_event_id", async () => {
    const s = seed(db, { situationId: "sit-nofounder", type: "roster", foundingCount: 4 });
    // Blow the keep key away. situations is append-only, so re-seed instead:
    // a situation whose created_from_event_id is NULL.
    const t = seed(db, { situationId: "sit-nullfounder", type: "roster", foundingCount: 4, founderIndex: 99 });
    expect(t.keeper).toBeUndefined();

    const result = await run(db);
    expect(result.status).toBe("completed");

    // sit-nullfounder keeps its first row by rowid, and says so.
    expect(eventIds(db, "sit-nullfounder", "situation_created")).toEqual([t.founding[0].event_id]);
    expect(store.getSituationFoundingAudit("sit-nullfounder", db)?.keep_key_source)
      .toBe("earliest_no_created_from");
    expect(result.keepKey.earliest_no_created_from).toBe(1);
    // ...and the well-formed one is unaffected by its neighbour.
    expect(eventIds(db, "sit-nofounder", "situation_created")).toEqual([s.keeper.event_id]);
  });

  it("leaves an already-clean situation entirely alone", async () => {
    const s = seed(db, { situationId: "sit-clean", type: "roster", foundingCount: 1, matchedCount: 2 });
    const before = eventIds(db, "sit-clean");

    const result = await run(db);
    expect(result.status).toBe("completed");
    expect(result.situationsCleaned).toBe(0);
    expect(eventIds(db, "sit-clean")).toEqual(before);
    // No deletes means no audit row: there is nothing for the guard to remember.
    expect(store.getSituationFoundingAudit("sit-clean", db)).toBeNull();
    expect(s.keeper).toBeDefined();
  });
});

/* ─── 2. The snapshot the read path serves ────────────────── */

describe("the served snapshot is pinned", () => {
  let db: BetterSqlite3.Database;
  beforeEach(async () => { db = await freshDb(); });

  /**
   * The four-field rule on its own is not enough to leave the API alone. The read
   * path picks its snapshot with ORDER BY created_at DESC, snapshot_id ASC, and on
   * a churned situation every snapshot shares one created_at — so the winner is
   * the smallest content hash, which is very often one of the restatements. That
   * row carries the same STATE as the row we keep but its own replay_hash and
   * timing_pressure, and situations-api serves both straight off it.
   */
  it("keeps a restating snapshot when it is the one being served", async () => {
    // All tied at at:0. Ids are ss-<sit>-<suffix>, so "a" < "b" < "c": the served
    // snapshot is the FIRST here, which the rule keeps anyway. Invert it.
    const specs: SnapshotSpec[] = [
      { id: "b", state: "developing", conf: 40, summary: "A", esc: 50, at: 0 },
      { id: "a", state: "developing", conf: 40, summary: "A", esc: 50, at: 0 },
      { id: "c", state: "developing", conf: 40, summary: "A", esc: 50, at: 0 },
    ];
    const s = seed(db, { situationId: "sit-served", type: "roster", foundingCount: 1, snapshots: specs });

    const servedBefore = store.getLatestSituationSnapshot("sit-served", db);
    expect(servedBefore?.snapshot_id).toBe(s.snapshotIds[1]); // the "a" row, 2nd inserted

    const result = await run(db);
    expect(result.status).toBe("completed");

    // "b" is kept because it is first by rowid; "a" is kept because it is served;
    // "c" restates and is not served, so it goes.
    expect(snapshotIdsOf(db, "sit-served")).toEqual([s.snapshotIds[0], s.snapshotIds[1]]);

    const servedAfter = store.getLatestSituationSnapshot("sit-served", db);
    expect(servedAfter).toEqual(servedBefore);
    expect(servedAfter?.replay_hash).toBe(servedBefore?.replay_hash);
    expect(servedAfter?.timing_pressure).toBe(servedBefore?.timing_pressure);
  });

  it("still removes restatements when the served snapshot was already a kept one", async () => {
    const specs: SnapshotSpec[] = [
      { id: "a", state: "developing", conf: 40, summary: "A", esc: 50, at: 0 },
      { id: "b", state: "developing", conf: 40, summary: "A", esc: 50, at: 0 },
      { id: "c", state: "developing", conf: 40, summary: "A", esc: 50, at: 0 },
    ];
    const s = seed(db, { situationId: "sit-served2", type: "roster", foundingCount: 1, snapshots: specs });
    expect(store.getLatestSituationSnapshot("sit-served2", db)?.snapshot_id).toBe(s.snapshotIds[0]);

    await run(db);
    expect(snapshotIdsOf(db, "sit-served2")).toEqual([s.snapshotIds[0]]);
  });
});

/* ─── 3. Bounds: maxSituations, kill switch, resumption ──── */

describe("bounds on a destructive job", () => {
  let db: BetterSqlite3.Database;
  beforeEach(async () => { db = await freshDb(); });

  /** Five dirty situations, each with 4 removable founding rows. */
  function seedFive(): Seed[] {
    return [0, 1, 2, 3, 4].map((i) =>
      seed(db, { situationId: `sit-bound-${i}`, type: "roster", foundingCount: 5 }));
  }

  it("maxSituations caps how many situations a run deletes from", async () => {
    const seeds = seedFive();

    const first = await run(db, { maxSituations: 2 });
    expect(first.status).toBe("capped");
    expect(first.situationsCleaned).toBe(2);

    // Exactly two situations were touched. The other three are untouched, with no
    // audit row — a capped run must not half-audit what it did not delete.
    const cleaned = seeds.filter((s) => eventIds(db, s.situationId, "situation_created").length === 1);
    expect(cleaned).toHaveLength(2);
    expect(seeds.filter((s) => store.getSituationFoundingAudit(s.situationId, db) !== null)).toHaveLength(2);
    for (const s of seeds.filter((candidate) => !cleaned.includes(candidate))) {
      expect(eventIds(db, s.situationId, "situation_created")).toHaveLength(5);
    }

    // Resume: the cursor carries on from where the cap bit.
    const second = await run(db, { maxSituations: 2 });
    expect(second.situationsCleaned).toBe(2);
    const third = await run(db, { maxSituations: 2 });
    expect(third.situationsCleaned).toBe(1);
    expect(third.status).toBe("completed");

    for (const s of seeds) {
      expect(eventIds(db, s.situationId, "situation_created")).toEqual([s.keeper.event_id]);
    }
  });

  it("a resumed run is a no-op on situations the previous run finished", async () => {
    const seeds = seedFive();
    const first = await run(db);
    expect(first.status).toBe("completed");
    expect(first.situationsCleaned).toBe(5);

    const auditsBefore = seeds.map((s) => store.getSituationFoundingAudit(s.situationId, db));
    const eventsBefore = seeds.map((s) => eventIds(db, s.situationId));

    // A finished scope is a single point lookup and reads nothing.
    const skipped = await run(db);
    expect(skipped.status).toBe("skipped");
    expect(skipped.situationsScanned).toBe(0);
    expect(skipped.eventsDeleted).toBe(0);

    // And even with the completion marker cleared, re-walking changes nothing:
    // the plan for a cleaned situation is empty, and the audit row's pre-cleanup
    // count survives because the insert is INSERT OR IGNORE.
    db.prepare(`DELETE FROM pipeline_meta WHERE key LIKE 'situation_bloat_cleanup:%'`).run();
    const rerun = await run(db);
    expect(rerun.status).toBe("completed");
    expect(rerun.situationsCleaned).toBe(0);
    expect(rerun.eventsDeleted).toBe(0);
    expect(rerun.snapshotsDeleted).toBe(0);
    expect(seeds.map((s) => store.getSituationFoundingAudit(s.situationId, db))).toEqual(auditsBefore);
    expect(seeds.map((s) => eventIds(db, s.situationId))).toEqual(eventsBefore);
    for (const audit of auditsBefore) expect(audit?.founding_row_count).toBe(5);
  });

  it("the kill switch stops the job between chunks, keeping committed chunks", async () => {
    // Situation A alone exceeds the 200-row chunk budget (74 duplicate founding
    // rows + 74 redundant snapshots + 74 paired events = 222), so it flushes as
    // chunk 1 and the stop check runs before B is ever committed.
    const bigSnapshots: SnapshotSpec[] = Array.from({ length: 75 }, (_, i) => ({
      id: `s${String(i).padStart(3, "0")}`, state: "developing", conf: 40, summary: "A", esc: 50, at: i,
    }));
    const a = seed(db, { situationId: "sit-stop-a", type: "roster", foundingCount: 75, snapshots: bigSnapshots });
    const b = seed(db, { situationId: "sit-stop-b", type: "roster", foundingCount: 5 });

    const result = await run(db, {
      beforeChunkCommit: (chunkIndex) => {
        if (chunkIndex === 1) cleanup.requestSituationBloatCleanupStop(db);
      },
    });

    expect(result.status).toBe("stopped");
    expect(result.chunks).toBe(1);

    // Chunk 1 committed in full.
    expect(eventIds(db, "sit-stop-a", "situation_created")).toEqual([a.keeper.event_id]);
    expect(snapshotIdsOf(db, "sit-stop-a")).toEqual([a.snapshotIds[0], a.snapshotIds[74]]);
    expect(store.getSituationFoundingAudit("sit-stop-a", db)?.founding_row_count).toBe(75);

    // B was never reached: no deletes, no audit row.
    expect(eventIds(db, "sit-stop-b", "situation_created")).toHaveLength(5);
    expect(store.getSituationFoundingAudit("sit-stop-b", db)).toBeNull();

    // Stopping is not completing: no marker, and the triggers are back.
    expect(cleanup.getSituationBloatCleanupStatus(db).completedScopes).toEqual([]);
    expect(store.situationAppendOnlyGuardStatus(db).ok).toBe(true);

    // Starting again supersedes the stop and finishes B.
    const resumed = await run(db);
    expect(resumed.status).toBe("completed");
    expect(eventIds(db, "sit-stop-b", "situation_created")).toEqual([b.keeper.event_id]);
  });
});

/* ─── 4. The append-only guards ───────────────────────────── */

describe("append-only guard triggers", () => {
  let db: BetterSqlite3.Database;
  beforeEach(async () => { db = await freshDb(); });

  it("are back after a normal completion, and the tables are closed again", async () => {
    const s = seed(db, { situationId: "sit-guard-ok", type: "roster", foundingCount: 4 });
    const result = await run(db);
    expect(result.status).toBe("completed");

    const guards = store.situationAppendOnlyGuardStatus(db);
    expect(guards.ok).toBe(true);
    expect(guards.missing).toEqual([]);

    expect(() => db.prepare(`DELETE FROM situation_events WHERE event_id = ?`).run(s.keeper.event_id))
      .toThrow(/append-only/);
    expect(() => db.prepare(`DELETE FROM situation_snapshots WHERE snapshot_id = ?`).run(s.snapshotIds[0]))
      .toThrow(/append-only/);
  });

  it("are back after a failure injected mid-chunk, with the chunk rolled back whole", async () => {
    const s = seed(db, { situationId: "sit-guard-fail", type: "roster", foundingCount: 4 });
    const before = eventIds(db, "sit-guard-fail");

    const result = await run(db, {
      beforeChunkCommit: () => { throw new Error("injected mid-chunk failure"); },
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("injected mid-chunk failure");
    // The error must NOT be the one about the guards being gone.
    expect(result.error).not.toContain("GUARDS MISSING");

    // SQLite rolls DDL back with the rows, so the dropped trigger came back with
    // them. This is the whole reason the drop lives inside the transaction.
    const guards = store.situationAppendOnlyGuardStatus(db);
    expect(guards.ok).toBe(true);
    expect(guards.missing).toEqual([]);
    expect(() => db.prepare(`DELETE FROM situation_events WHERE event_id = ?`).run(s.duplicates[0].event_id))
      .toThrow(/append-only/);

    // Nothing was deleted and nothing was audited: the chunk is atomic.
    expect(eventIds(db, "sit-guard-fail")).toEqual(before);
    expect(store.getSituationFoundingAudit("sit-guard-fail", db)).toBeNull();
  });

  /**
   * The job's one ensureSituationSchema call runs BEFORE the walk, so a guard that
   * was already missing when the job started is repaired rather than inherited —
   * it never begins deleting against a table that was left open by something else.
   * The pre-start assertion after it is therefore belt-and-braces (it fires only
   * if ensure itself failed to install a trigger), which is why this asserts the
   * repair rather than a refusal.
   */
  it("repairs a guard that was already missing before it starts deleting", async () => {
    const s = seed(db, { situationId: "sit-guard-pre", type: "roster", foundingCount: 4 });
    db.exec("DROP TRIGGER IF EXISTS situation_events_no_delete");
    expect(store.situationAppendOnlyGuardStatus(db).ok).toBe(false);

    const result = await run(db);
    expect(result.status).toBe("completed");
    expect(store.situationAppendOnlyGuardStatus(db).ok).toBe(true);
    expect(eventIds(db, "sit-guard-pre", "situation_created")).toEqual([s.keeper.event_id]);
    expect(() => db.prepare(`DELETE FROM situation_events WHERE event_id = ?`).run(s.keeper.event_id))
      .toThrow(/append-only/);
  });
});

/* ─── 5. Dry run ──────────────────────────────────────────── */

describe("dry run", () => {
  let db: BetterSqlite3.Database;
  beforeEach(async () => { db = await freshDb(); });

  it("counts exactly what the real run then deletes, and changes nothing itself", async () => {
    const specs: SnapshotSpec[] = [
      { id: "a", state: "developing", conf: 40, summary: "A", esc: 50, at: 0 },
      { id: "b", state: "developing", conf: 40, summary: "A", esc: 50, at: 10 },
      { id: "c", state: "escalating", conf: 70, summary: "B", esc: 80, at: 20 },
      { id: "d", state: "escalating", conf: 70, summary: "B", esc: 80, at: 30 },
    ];
    seed(db, { situationId: "sit-dry-0", type: "roster", foundingCount: 6, snapshots: specs, matchedCount: 2 });
    seed(db, { situationId: "sit-dry-1", type: "roster", foundingCount: 3, founderIndex: 2 });
    seed(db, { situationId: "sit-dry-2", type: "roster", foundingCount: 1 });

    const eventsBefore = db.prepare(`SELECT COUNT(*) AS n FROM situation_events`).get() as { n: number };
    const snapshotsBefore = db.prepare(`SELECT COUNT(*) AS n FROM situation_snapshots`).get() as { n: number };

    const dry = await run(db, { dryRun: true });

    // Not a single row, marker or cursor moved.
    expect((db.prepare(`SELECT COUNT(*) AS n FROM situation_events`).get() as { n: number }).n).toBe(eventsBefore.n);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM situation_snapshots`).get() as { n: number }).n).toBe(snapshotsBefore.n);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM situation_founding_audit`).get() as { n: number }).n).toBe(0);
    const status = cleanup.getSituationBloatCleanupStatus(db);
    expect(status.completedScopes).toEqual([]);
    expect(status.cursors).toEqual([]);

    const real = await run(db);

    // The headline equality. The dry run and the real run share one plan module
    // and one set of ordered reads, so this is structural rather than lucky — but
    // it is asserted because "the report said 1.1GB" has to mean something.
    const comparable = (r: typeof real) => ({
      situationsScanned: r.situationsScanned,
      situationsCleaned: r.situationsCleaned,
      eventsDeleted: r.eventsDeleted,
      snapshotsDeleted: r.snapshotsDeleted,
      duplicateFoundingDeleted: r.duplicateFoundingDeleted,
      redundantSnapshotEventsDeleted: r.redundantSnapshotEventsDeleted,
      bytesFreed: r.bytesFreed,
      keepKey: r.keepKey,
    });
    expect(comparable(dry)).toEqual(comparable(real));
    expect(real.eventsDeleted).toBeGreaterThan(0);
    expect(real.snapshotsDeleted).toBeGreaterThan(0);
  });

  it("respects maxSituations so a dry run previews the run it is previewing", async () => {
    for (const i of [0, 1, 2, 3]) seed(db, { situationId: `sit-drycap-${i}`, type: "roster", foundingCount: 4 });
    const dry = await run(db, { dryRun: true, maxSituations: 2 });
    expect(dry.status).toBe("capped");
    expect(dry.situationsCleaned).toBe(2);
  });
});

/* ─── 6. Scope ────────────────────────────────────────────── */

describe("scope", () => {
  let db: BetterSqlite3.Database;
  beforeEach(async () => { db = await freshDb(); });

  it("touches only the requested league and type, and marks only that scope done", async () => {
    const roster = seed(db, { situationId: "sit-scope-roster", type: "roster", foundingCount: 4 });
    const injury = seed(db, { situationId: "sit-scope-injury", type: "injury", foundingCount: 4 });

    const result = await cleanup.runSituationBloatCleanup({ league: LEAGUE, type: "roster", maxSituations: 100, db });
    expect(result.status).toBe("completed");
    expect(result.scope).toBe("NFL:roster");

    expect(eventIds(db, "sit-scope-roster", "situation_created")).toEqual([roster.keeper.event_id]);
    expect(eventIds(db, "sit-scope-injury", "situation_created")).toHaveLength(4);
    expect(injury.keeper).toBeDefined();

    const status = cleanup.getSituationBloatCleanupStatus(db);
    expect(status.completedScopes.map((s) => s.scope)).toEqual(["NFL:roster"]);

    // The league-wide scope is a different marker, so it still has work to do.
    const wide = await run(db);
    expect(wide.status).toBe("completed");
    expect(eventIds(db, "sit-scope-injury", "situation_created")).toEqual([injury.keeper.event_id]);
  });

  it("rejects an unknown league rather than walking everything", async () => {
    await expect(cleanup.runSituationBloatCleanup({ league: "XFL", db })).rejects.toThrow(/league must be one of/);
  });
});

/* ─── 7. The Phase 0 contract: six fields, and no more ───── */

/**
 * Copied verbatim from situation-founding-audit.test.ts (#74). Duplicated rather
 * than imported on purpose: that list is the contract between the two phases, and
 * a shared constant would let one edit move both sides at once. If these two
 * lists ever disagree, the disagreement is the finding.
 */
const CLEANUP_SENSITIVE_FIELDS = [
  "evidenceCount",
  "operationalVisibilityScore",
  "latestEvidence",
  "calibrationLimitations",
  "historicalPatternBasis",
  "weakeningSignals",
] as const;

describe("API response across a REAL cleanup run", () => {
  /**
   * These run against the real pipeline.db (the API mapper reads through
   * getPipelineDb()) and the situations tables are append-only, so fixtures
   * cannot be torn down. Each test gets its OWN situation_type, which keeps both
   * the listing query, the baseline cohort key and the cleanup's scope disjoint
   * from every other test's rows.
   */
  function responseFor(situationId: string, type: string) {
    const record = store.listCanonicalSituations({ league: LEAGUE, situation_type: type }, pipelineDb)
      .find((candidate) => candidate.situation_id === situationId);
    if (!record) throw new Error(`fixture situation ${situationId} is not listable`);
    return api.mapCanonicalSituationToApiResponse(record, [], guard.buildConfidenceBaselines(pipelineDb));
  }

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

  function pinned(before: Record<string, any>, after: Record<string, any>): void {
    expect(after.confidence).toBe(before.confidence);
    expect(after.confidenceLabel).toBe(before.confidenceLabel);
    expect(after.sourceCount).toBe(before.sourceCount);
    expect(after.escalationScore).toBe(before.escalationScore);
    expect(after.severity).toBe(before.severity);
    expect(after.lifecycleState).toBe(before.lifecycleState);
    expect(after.timingPressure).toBe(before.timingPressure);
    expect(after.historicalPatternConfidence).toBe(before.historicalPatternConfidence);
    expect(after.historicalPatternLabel).toBe(before.historicalPatternLabel);
    expect(after.calibrationSummary).toBe(before.calibrationSummary);
    expect(after.replayHash).toBe(before.replayHash);
  }

  it("moves exactly the six enumerated fields on a founding-duplicate cleanup", async () => {
    const type = "roster_run_identical";
    [50, 60, 70].forEach((score, i) => seed(pipelineDb, {
      situationId: `sit-run-clean-${i}`, type, foundingCount: 1,
      snapshots: [{ id: "a", state: "developing", conf: score, summary: SUMMARY, esc: 50, at: 0 }],
    }));
    seed(pipelineDb, {
      situationId: "sit-run-corrupt", type, foundingCount: 6,
      snapshots: [{ id: "a", state: "developing", conf: 99, summary: SUMMARY, esc: 50, at: 0 }],
    });

    const before = responseFor("sit-run-corrupt", type);
    expect(before.confidence).toBe(60); // corrupted -> capped to the clean median
    // 6 founding rows + the 1 snapshot_created event the engine pairs with the
    // snapshot. (#74's fixture seeded no snapshot event, hence its 6.)
    expect(before.evidenceCount).toBe(7);

    const result = await cleanup.runSituationBloatCleanup({ league: LEAGUE, type, maxSituations: 100, db: pipelineDb });
    expect(result.status).toBe("completed");
    expect(result.situationsCleaned).toBe(1);
    api.resetSituationsApiBuildCaches();

    const after = responseFor("sit-run-corrupt", type);
    expect(divergentFields(before, after)).toEqual([...CLEANUP_SENSITIVE_FIELDS].sort());
    pinned(before, after);
    // The guard still fires: the audit row, not the live count, is what it reads.
    expect(after.confidence).toBe(60);
    expect(after.evidenceCount).toBe(2); // the founder + the surviving snapshot event
  });

  it("moves no MORE than those six when redundant snapshots go too", async () => {
    // The case #74's fixture could not reach: snapshots tied on created_at, the
    // served one a restatement. Without the pin this run moves replayHash and
    // timingPressure, which the Phase 0 contract forbids.
    const type = "roster_run_snapshots";
    [50, 60, 70].forEach((score, i) => seed(pipelineDb, {
      situationId: `sit-snap-clean-${i}`, type, foundingCount: 1,
      snapshots: [{ id: "a", state: "developing", conf: score, summary: SUMMARY, esc: 50, at: 0 }],
    }));
    const corrupt = seed(pipelineDb, {
      situationId: "sit-snap-corrupt", type, foundingCount: 6,
      snapshots: [
        { id: "d", state: "developing", conf: 99, summary: SUMMARY, esc: 50, at: 0 },
        { id: "b", state: "developing", conf: 99, summary: SUMMARY, esc: 50, at: 0 },
        { id: "c", state: "developing", conf: 99, summary: SUMMARY, esc: 50, at: 0 },
        { id: "e", state: "developing", conf: 99, summary: SUMMARY, esc: 50, at: 0 },
      ],
    });
    // The served snapshot is "b" — a restatement, and NOT the first by rowid.
    const servedBefore = store.getLatestSituationSnapshot("sit-snap-corrupt", pipelineDb);
    expect(servedBefore?.snapshot_id).toBe(corrupt.snapshotIds[1]);

    const before = responseFor("sit-snap-corrupt", type);

    const result = await cleanup.runSituationBloatCleanup({ league: LEAGUE, type, maxSituations: 100, db: pipelineDb });
    expect(result.status).toBe("completed");
    expect(result.snapshotsDeleted).toBe(2); // "c" and "e"; "d" is first, "b" is served
    api.resetSituationsApiBuildCaches();

    const after = responseFor("sit-snap-corrupt", type);
    const moved = divergentFields(before, after);
    expect(moved.filter((field) => !(CLEANUP_SENSITIVE_FIELDS as readonly string[]).includes(field))).toEqual([]);
    pinned(before, after);
    expect(store.getLatestSituationSnapshot("sit-snap-corrupt", pipelineDb)).toEqual(servedBefore);
  });
});

/* ─── 8. Structural guards ────────────────────────────────── */

describe("structural guards", () => {
  const read = (relative: string) =>
    fs.readFileSync(path.join(__dirname, "..", "..", "..", relative), "utf8");

  /**
   * These files explain themselves at length, and the explanations name the very
   * things the assertions below forbid ("No VACUUM", "ORDER BY created_at DESC,
   * snapshot_id ASC"). Asserting against the raw text would be asserting about the
   * prose. Strip comments first so the assertions are about the code.
   */
  const code = (relative: string) =>
    read(relative)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  /**
   * The cleanup must have exactly one trigger: an authenticated admin POST. The
   * last two situations outages were a boot-time job and an unbounded read loop
   * on a synchronous DB driver, so a destructive job reachable from boot or from
   * the ingestion cycle would start itself during a deploy with nobody watching.
   */
  it("is not reachable from boot or from the ingestion cycle", () => {
    for (const file of [
      "server/index.ts",
      "server/pipeline/ingestion.ts",
      "server/pipeline/processor.ts",
      "server/pipeline/settlement.ts",
      "server/pipeline/situations-engine.ts",
    ]) {
      expect(read(file)).not.toContain("situation-bloat-cleanup");
    }
  });

  it("is imported by routes.ts only lazily, inside the handlers", () => {
    const routes = read("server/pipeline/routes.ts");
    expect(routes).toContain(`await import("./situation-bloat-cleanup")`);
    // No top-level static import: registering the routes must not pull the
    // deleter into the boot graph at all.
    expect(routes).not.toMatch(/^import .*situation-bloat-cleanup/m);
  });

  /**
   * The dry-run report and the job must not re-implement "what is removable", and
   * must not order rows by timestamp: the duplicate rows of a churned situation
   * share a created_at, and snapshot_id is a content hash, so a timestamp order
   * is an arbitrary order — and two arbitrary orders disagree.
   */
  it("keeps the report and the job on one shared plan and one row order", () => {
    const report = code("server/scripts/report-situation-event-bloat.ts");
    expect(report).toContain("computeSituationCleanupPlan");
    expect(report).toContain("fetchBloatPlanEvents");
    expect(report).toContain("fetchBloatPlanSnapshots");
    // No private copy of the rule or of the reads: the report must not query
    // either table itself, or its counts stop being the job's counts.
    expect(report).not.toContain("FROM situation_events");
    expect(report).not.toContain("FROM situation_snapshots");

    const job = code("server/pipeline/situation-bloat-cleanup.ts");
    expect(job).toContain("computeSituationCleanupPlan");
    expect(job).toContain("fetchBloatPlanEvents");

    // One ordering, rowid, for both tables — and no timestamp ordering anywhere,
    // because on a churned situation a timestamp order is an arbitrary order.
    const rows = code("server/pipeline/situation-bloat-rows.ts");
    expect(rows.match(/ORDER BY situation_id ASC, rowid ASC/g)).toHaveLength(2);
    const orderByLines = rows.split("\n").filter((line) => line.includes("ORDER BY"));
    expect(orderByLines).toHaveLength(2);
    for (const line of orderByLines) {
      expect(line).not.toMatch(/created_at|recorded_at|snapshot_id|event_id/);
    }
  });

  it("never deletes from a history table or from situations, and never VACUUMs", () => {
    const job = code("server/pipeline/situation-bloat-cleanup.ts");
    const deletes = job.match(/DELETE FROM (\w+)/g) ?? [];
    expect(deletes.sort()).toEqual(["DELETE FROM situation_events", "DELETE FROM situation_snapshots"]);
    // VACUUM is a long exclusive rewrite of the whole file; reclaiming the free
    // pages is a separate decision from removing the rows.
    expect(job).not.toContain("VACUUM");
    // The guards it lifts are the DELETE guards, never the UPDATE ones.
    expect(job).not.toContain("no_update");

    const storeSrc = code("server/pipeline/situations-store.ts");
    expect(storeSrc).toContain("DROP TRIGGER IF EXISTS ${table}_no_delete");
    expect(storeSrc).not.toContain("DROP TRIGGER IF EXISTS ${table}_no_update");
  });
});
