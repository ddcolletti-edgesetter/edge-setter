import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Regression suite for the Deploy 2 in-play-closing exclusion sweep.
 *
 * The property that matters most here is NOT "the forward pass flags the right
 * rows" — it is that the REVERSE pass cannot release a row some other sweep
 * excluded. excluded_stale is a single shared boolean, so a reverse keyed on it
 * would silently resurrect the null-game stale matches that
 * runSettlementBacklogMigration excluded for an unrelated and still-valid
 * reason. Those rows are graded against a game that is weeks away from the
 * signal; putting them back into the public accuracy numbers would be a
 * regression nobody would notice until the numbers were already wrong.
 *
 * So the suite asserts that in BOTH run orders:
 *   - stale sweep first, then forward+reverse;
 *   - forward first on a row that also qualifies as stale, then reverse.
 *
 * Setup follows settlement-stale-matches.test.ts: PIPELINE_DATA_DIR points at a
 * throwaway dir before store.ts is imported, and ../../storage is mocked with a
 * stateful stub so the real edge_setter.db is never opened and the mirror's
 * behaviour is still observable.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-inplay-closing-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

// Stateful storage.db mirror stub. Tracks signal_id → reason, and enforces the
// same guards the real statements do: mark only claims rows not already
// excluded, clear only releases rows carrying the given reason.
const storageRows = new Map<string, { excluded: boolean; reason: string | null }>();
function seedStorageRow(signalId: string, excluded = false, reason: string | null = null) {
  storageRows.set(signalId, { excluded, reason });
}
const markSettledOutcomesExcludedMock = vi.fn((ids: string[], reason: string) => {
  let changed = 0;
  for (const id of ids) {
    const row = storageRows.get(id);
    if (row && !row.excluded) { row.excluded = true; row.reason = reason; changed++; }
  }
  return changed;
});
const clearSettledOutcomesExcludedMock = vi.fn((ids: string[], reason: string) => {
  let changed = 0;
  for (const id of ids) {
    const row = storageRows.get(id);
    if (row && row.reason === reason) { row.excluded = false; row.reason = null; changed++; }
  }
  return changed;
});
const countSettledOutcomesByReasonMock = vi.fn((reason: string) =>
  [...storageRows.values()].filter((r) => r.reason === reason).length);
const countStaleSettledOutcomesMock = vi.fn(() =>
  [...storageRows.values()].filter((r) => r.excluded).length);

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
  markSettledOutcomesStale: vi.fn(() => 0),
  markSettledOutcomesExcluded: markSettledOutcomesExcludedMock,
  clearSettledOutcomesExcluded: clearSettledOutcomesExcludedMock,
  countSettledOutcomesByReason: countSettledOutcomesByReasonMock,
  countStaleSettledOutcomes: countStaleSettledOutcomesMock,
}));

type StoreMod = typeof import("../store");
type SweepMod = typeof import("../inplay-closing-exclusion");

let store: StoreMod;
let sweep: SweepMod;

beforeAll(async () => {
  store = await import("../store");
  sweep = await import("../inplay-closing-exclusion");
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

/** Kickoff is in the past by default — these are settled games. */
function seedGame(id: string, overrides: Record<string, unknown> = {}): string {
  store.upsertGame({
    id,
    league: "NFL",
    home_team: "DAL",
    away_team: "NYG",
    game_time: iso(Date.now() - 3 * DAY),
    status: "scheduled",
    spread_line: -3.5,
    spread_team: "DAL",
    total_line: 45.5,
    moneyline_home: -170,
    moneyline_away: 150,
    open_spread: -3.5,
    open_total: 45.5,
    home_score: null,
    away_score: null,
    source_game_id: "999",
    ...overrides,
  } as any);
  store.updateGameFinal(id, 24, 17);
  return id;
}

function seedSignal(id: string, overrides: Record<string, unknown> = {}): string {
  store.upsertLiveSignal({
    id,
    league: "NFL",
    game_id: null,
    signal_type: "line_move",
    headline: "test",
    body: "", action_note: "", why_it_matters: "",
    team: "DAL", player: null, matchup: "NYG @ DAL",
    sources: [{ name: "Beat Writer", type: "beat_writer" }],
    source_count: 1,
    verdict: "confirmed",
    confidence: 85,
    confirmation_strength: "Consensus",
    line_movement: null,
    injury_designation: null, lineup_status: null, weather_note: null,
    betting_relevance: true, fantasy_relevance: false,
    score: 80, score_band: "strong",
    urgency_label: "", urgency_reason: "", trust_label: "", score_explanation: "",
    breakdown: {}, raw_event_ids: [],
    signal_time: iso(Date.now() - 4 * DAY),
    first_seen_at: iso(Date.now() - 4 * DAY),
    created_at: iso(Date.now() - 4 * DAY),
    updated_at: iso(Date.now() - 4 * DAY),
    outcome_id: null,
    ...overrides,
  } as any);
  return id;
}

/** An odds snapshot at an explicit wall-clock time, pre- or post-kickoff. */
function seedSnapshot(gameId: string, snapshotAt: string, league = "NFL"): void {
  store.getPipelineDb().prepare(`
    INSERT INTO odds_snapshots
      (id, game_id, league, sportsbook, market_source, spread_line, spread_team,
       total_line, moneyline_home, moneyline_away, source_game_id, snapshot_at, created_at)
    VALUES (?, ?, ?, 'pinnacle', 'the_odds_api', -3.5, ?, 45.5, -170, 150, '999', ?, ?)
  `).run(`snap_${gameId}_${snapshotAt}`, gameId, league, "DAL", snapshotAt, snapshotAt);
}

function seedOutcome(
  signalId: string,
  gameId: string,
  overrides: Record<string, unknown> = {},
): string {
  const o = store.createOutcome({
    signal_id: signalId,
    game_id: gameId,
    home_score: 24,
    away_score: 17,
    market: "spread",
    line_at_signal: -3.5,
    closing_line: -7.5,
    actual_result: 7,
    hit: true,
    clv: 4,
    recorded_at: iso(Date.now()),
    ...overrides,
  } as any);
  seedStorageRow(signalId);
  return o.id;
}

/** Read an outcome's exclusion state straight from the DB. */
function exclusionOf(outcomeId: string): { excluded_stale: number; excluded_reason: string | null } {
  return store.getPipelineDb()
    .prepare("SELECT excluded_stale, excluded_reason FROM outcomes WHERE id = ?")
    .get(outcomeId) as any;
}

/**
 * One contaminated row: kickoff 3 days ago, newest snapshot taken an hour AFTER
 * kickoff. Its signal carries a game_id, so it can never look stale-matched.
 */
function seedContaminated(tag: string, league = "NFL") {
  const kickoff = iso(Date.now() - 3 * DAY);
  const gameId = seedGame(`game_${tag}`, { league, game_time: kickoff });
  seedSnapshot(gameId, iso(Date.now() - 3 * DAY - 2 * HOUR), league); // pre-kickoff
  seedSnapshot(gameId, iso(Date.now() - 3 * DAY + 1 * HOUR), league); // post-kickoff ← contaminates
  const signalId = seedSignal(`sig_${tag}`, { league, game_id: gameId });
  const outcomeId = seedOutcome(signalId, gameId);
  return { gameId, signalId, outcomeId };
}

/** One clean row: every snapshot strictly before kickoff. */
function seedClean(tag: string, league = "NFL") {
  const kickoff = iso(Date.now() - 3 * DAY);
  const gameId = seedGame(`game_${tag}`, { league, game_time: kickoff });
  seedSnapshot(gameId, iso(Date.now() - 3 * DAY - 2 * HOUR), league);
  seedSnapshot(gameId, iso(Date.now() - 3 * DAY - 30 * 60 * 1000), league);
  const signalId = seedSignal(`sig_${tag}`, { league, game_id: gameId });
  const outcomeId = seedOutcome(signalId, gameId);
  return { gameId, signalId, outcomeId };
}

/**
 * A row that is BOTH contaminated and a null-game stale match: the signal has no
 * game_id and was created 30 days before a kickoff whose NFL window is 8 days.
 * This is the row the forward pass must refuse to claim.
 */
function seedContaminatedAndStale(tag: string) {
  const kickoff = iso(Date.now() - 3 * DAY);
  const gameId = seedGame(`game_${tag}`, { game_time: kickoff });
  seedSnapshot(gameId, iso(Date.now() - 3 * DAY + 1 * HOUR)); // post-kickoff
  const signalId = seedSignal(`sig_${tag}`, {
    game_id: null,
    created_at: iso(Date.now() - 33 * DAY), // 30 days before kickoff ≫ 8-day NFL window
  });
  const outcomeId = seedOutcome(signalId, gameId);
  return { gameId, signalId, outcomeId };
}

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["outcomes", "live_signals", "games", "odds_snapshots", "signal_state_history"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  vi.clearAllMocks();
  storageRows.clear();
});

/* ─────────────────────────────────────────────────────────────────────────── */

describe("excluded_reason column exists on pipeline.db", () => {
  it("is created by initSchema, nullable, and defaults to NULL", () => {
    const cols = store.getPipelineDb().prepare("PRAGMA table_info(outcomes)").all() as any[];
    const col = cols.find((c) => c.name === "excluded_reason");
    expect(col).toBeDefined();
    expect(col.type).toBe("TEXT");
    expect(col.notnull).toBe(0);

    const { outcomeId } = seedClean("default_check");
    expect(exclusionOf(outcomeId)).toEqual({ excluded_stale: 0, excluded_reason: null });
  });
});

describe("forward pass — which rows it claims", () => {
  it("claims an outcome whose newest snapshot is after kickoff", async () => {
    const { outcomeId } = seedContaminated("c1");
    const res = await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });

    expect(res.candidates.map((c) => c.id)).toEqual([outcomeId]);
    expect(res.pipeline_changed).toBe(1);
    expect(exclusionOf(outcomeId)).toEqual({
      excluded_stale: 1,
      excluded_reason: sweep.INPLAY_CLOSING_REASON,
    });
  });

  it("leaves an outcome alone when every snapshot is before kickoff", async () => {
    const { outcomeId } = seedClean("k1");
    const res = await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });

    expect(res.candidates).toHaveLength(0);
    expect(exclusionOf(outcomeId)).toEqual({ excluded_stale: 0, excluded_reason: null });
  });

  it("ignores an outcome with no closing_line — nothing in-play ever reached it", async () => {
    const kickoff = iso(Date.now() - 3 * DAY);
    const gameId = seedGame("game_noline", { game_time: kickoff });
    seedSnapshot(gameId, iso(Date.now() - 3 * DAY + HOUR));
    const signalId = seedSignal("sig_noline", { game_id: gameId });
    const outcomeId = seedOutcome(signalId, gameId, { closing_line: null, clv: null, hit: null });

    const res = await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });
    expect(res.candidates).toHaveLength(0);
    expect(exclusionOf(outcomeId).excluded_stale).toBe(0);
  });

  it("is a no-op the second time — re-running writes nothing", async () => {
    seedContaminated("c2");
    const first = await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });
    expect(first.pipeline_changed).toBe(1);

    const second = await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });
    expect(second.candidates).toHaveLength(0);
    expect(second.pipeline_changed).toBe(0);
  });
});

describe("dry run writes nothing", () => {
  it("reports the candidates and leaves every row untouched", async () => {
    const { outcomeId } = seedContaminated("d1");
    const res = await sweep.runSweep({ direction: "forward", refreshAccuracy: false });

    expect(res.wrote).toBe(false);
    expect(res.candidates).toHaveLength(1);
    expect(res.pipeline_changed).toBe(0);
    expect(res.storage_changed).toBe(0);
    expect(exclusionOf(outcomeId)).toEqual({ excluded_stale: 0, excluded_reason: null });
    expect(markSettledOutcomesExcludedMock).not.toHaveBeenCalled();
    // counts_after must equal counts_before on a dry run, or the operator is
    // reading a number that already moved.
    expect(res.counts_after).toEqual(res.counts_before);
    // The projection is what the operator decides on, so it has to be right.
    expect(res.counts_projected.pipeline_inplay_closing)
      .toBe(res.counts_before.pipeline_inplay_closing + 1);
    expect(res.counts_projected.accuracy_eligible)
      .toBe(res.counts_before.accuracy_eligible - 1);
  });

  it("projects exactly what the write then measures", async () => {
    seedContaminated("d2");
    seedContaminated("d3");
    const dry = await sweep.runSweep({ direction: "forward", refreshAccuracy: false });
    const wet = await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });

    expect(wet.counts_after.pipeline_excluded_total)
      .toBe(dry.counts_projected.pipeline_excluded_total);
    expect(wet.counts_after.pipeline_inplay_closing)
      .toBe(dry.counts_projected.pipeline_inplay_closing);
    expect(wet.counts_after.accuracy_eligible)
      .toBe(dry.counts_projected.accuracy_eligible);
  });
});

describe("--league scoping", () => {
  it("claims only the named league and leaves the others for a later pass", async () => {
    const cfb = seedContaminated("cfb1", "CFB");
    const nfl = seedContaminated("nfl1", "NFL");

    const res = await sweep.runSweep({
      direction: "forward", league: "CFB", write: true, refreshAccuracy: false,
    });

    expect(res.candidates.map((c) => c.id)).toEqual([cfb.outcomeId]);
    expect(exclusionOf(cfb.outcomeId).excluded_reason).toBe(sweep.INPLAY_CLOSING_REASON);
    expect(exclusionOf(nfl.outcomeId)).toEqual({ excluded_stale: 0, excluded_reason: null });
  });
});

describe("reverse pass", () => {
  it("releases exactly the rows the forward pass flagged", async () => {
    const { outcomeId } = seedContaminated("r1");
    await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });
    expect(exclusionOf(outcomeId).excluded_stale).toBe(1);

    const res = await sweep.runSweep({ direction: "reverse", write: true, refreshAccuracy: false });
    expect(res.candidates.map((c) => c.id)).toEqual([outcomeId]);
    expect(exclusionOf(outcomeId)).toEqual({ excluded_stale: 0, excluded_reason: null });
  });

  it("restores accuracy_eligible to its pre-forward value", async () => {
    seedContaminated("r2");
    seedClean("r3");
    const before = sweep.countExclusions().accuracy_eligible;

    await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });
    expect(sweep.countExclusions().accuracy_eligible).toBe(before - 1);

    await sweep.runSweep({ direction: "reverse", write: true, refreshAccuracy: false });
    expect(sweep.countExclusions().accuracy_eligible).toBe(before);
  });
});

/* ─── The property the operator is actually trusting ────────────────────── */

describe("a null-game-swept row stays flagged after the reverse", () => {
  it("order A: the stale sweep flagged it first — forward never claims it, reverse never frees it", async () => {
    const contaminated = seedContaminated("oa_clean");
    // A row the null-game stale sweep already owns: flagged, reason NULL, which
    // is exactly the shape runSettlementBacklogMigration leaves on prod.
    const stale = seedContaminatedAndStale("oa_stale");
    store.getPipelineDb()
      .prepare("UPDATE outcomes SET excluded_stale = 1, excluded_reason = NULL WHERE id = ?")
      .run(stale.outcomeId);
    seedStorageRow(stale.signalId, true, null);

    const fwd = await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });
    expect(fwd.candidates.map((c) => c.id)).toEqual([contaminated.outcomeId]);

    await sweep.runSweep({ direction: "reverse", write: true, refreshAccuracy: false });

    // The whole point: still excluded, still reasonless, in both databases.
    expect(exclusionOf(stale.outcomeId)).toEqual({ excluded_stale: 1, excluded_reason: null });
    expect(storageRows.get(stale.signalId)).toEqual({ excluded: true, reason: null });
    // …while our own row did come back.
    expect(exclusionOf(contaminated.outcomeId).excluded_stale).toBe(0);
  });

  it("order B: forward runs first on a row that also qualifies as stale — it must refuse to claim it", async () => {
    const stale = seedContaminatedAndStale("ob_stale");

    // Not yet flagged by anyone. The row is contaminated AND stale-matched, so a
    // forward pass that only checked excluded_stale = 0 would happily claim it,
    // and the reverse would then release a stale match. It must not be claimed.
    expect(exclusionOf(stale.outcomeId).excluded_stale).toBe(0);

    const fwd = await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });
    expect(fwd.candidates).toHaveLength(0);
    expect(exclusionOf(stale.outcomeId)).toEqual({ excluded_stale: 0, excluded_reason: null });

    // And so the reverse has nothing of its own to release here either.
    const rev = await sweep.runSweep({ direction: "reverse", write: true, refreshAccuracy: false });
    expect(rev.candidates).toHaveLength(0);
  });

  it("the reverse statement is scoped to this reason, not to excluded_stale", async () => {
    // A row excluded by some future sweep with a different reason. The reverse
    // must not know what it is, let alone release it.
    const other = seedContaminated("other_reason");
    store.getPipelineDb()
      .prepare("UPDATE outcomes SET excluded_stale = 1, excluded_reason = 'some_future_sweep' WHERE id = ?")
      .run(other.outcomeId);
    seedStorageRow(other.signalId, true, "some_future_sweep");

    const rev = await sweep.runSweep({ direction: "reverse", write: true, refreshAccuracy: false });
    expect(rev.candidates).toHaveLength(0);
    expect(exclusionOf(other.outcomeId)).toEqual({
      excluded_stale: 1, excluded_reason: "some_future_sweep",
    });
    expect(storageRows.get(other.signalId)).toEqual({ excluded: true, reason: "some_future_sweep" });
  });
});

/* ─── storage.db mirror ─────────────────────────────────────────────────── */

describe("storage.db mirror", () => {
  it("flags and releases the matching settled_outcomes rows", async () => {
    const { signalId } = seedContaminated("m1");

    await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });
    expect(markSettledOutcomesExcludedMock).toHaveBeenCalledWith(
      [signalId], sweep.INPLAY_CLOSING_REASON,
    );
    expect(storageRows.get(signalId)).toEqual({
      excluded: true, reason: sweep.INPLAY_CLOSING_REASON,
    });

    await sweep.runSweep({ direction: "reverse", write: true, refreshAccuracy: false });
    expect(storageRows.get(signalId)).toEqual({ excluded: false, reason: null });
  });

  it("reports a lower storage count when a signal never settled, without failing", async () => {
    const { signalId } = seedContaminated("m2");
    storageRows.delete(signalId); // settled_outcomes has no row for this signal

    const res = await sweep.runSweep({ direction: "forward", write: true, refreshAccuracy: false });
    expect(res.pipeline_changed).toBe(1);
    expect(res.storage_changed).toBe(0);
  });
});

/* ─── Chunking ──────────────────────────────────────────────────────────── */

describe("chunking", () => {
  it("writes every row across several chunks and yields between them", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(seedContaminated(`ch${i}`).outcomeId);

    const seen: Array<[number, number]> = [];
    const res = await sweep.runSweep({
      direction: "forward", write: true, refreshAccuracy: false,
      chunkSize: 2,
      onChunk: (done, total) => seen.push([done, total]),
    });

    expect(res.pipeline_changed).toBe(7);
    expect(seen).toEqual([[2, 7], [4, 7], [6, 7], [7, 7]]);
    for (const id of ids) expect(exclusionOf(id).excluded_stale).toBe(1);
  });
});

/* ─── Query plan ────────────────────────────────────────────────────────── */

describe("query plan", () => {
  it("drives the post-kickoff snapshot test off idx_odds_snapshots_game_time", () => {
    // The predicate is "this game has a snapshot after kickoff", which is the
    // same set as "this game's NEWEST snapshot is after kickoff" but reachable
    // as an index seek instead of a GROUP BY over the whole snapshot table.
    // If this plan ever flips to a scan, the sweep goes quadratic on prod.
    const plan = store.getPipelineDb()
      .prepare(`EXPLAIN QUERY PLAN ${sweep.forwardCandidateSql(null)}`)
      .all() as Array<{ detail: string }>;
    const detail = plan.map((r) => r.detail).join("\n");

    expect(detail).toContain("idx_odds_snapshots_game_time");
    expect(detail).not.toMatch(/SCAN odds_snapshots/);
  });
});
