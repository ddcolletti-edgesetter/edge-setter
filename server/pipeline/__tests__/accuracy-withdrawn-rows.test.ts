// @vitest-environment node
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Withdrawn accuracy must leave storage, not wait for a key to reappear.
 *
 * The v2 regrade turns injury/lineup/line-move grades into no_grade. Before
 * this change:
 *   - computeSourceAccuracy() only upserted keys the current population
 *     produced, so per-type and per-source rows for withdrawn grades kept their
 *     old wins/losses/hit_rate in pipeline_source_accuracy;
 *   - syncAccuracyToStorageDb() only touched sources still in the graded tally,
 *     so source_scores.overall_accuracy (which agents.ts cites as
 *     globalAccuracyScore / sourceAccuracyOverride) kept the withdrawn number;
 *   - the cycle recomputed only when signalsSettled > 0, which counts graded
 *     settlements only, so once everything settles no_grade it never fired.
 *
 * Real pipeline.db and storage.db in a temp dir. No mocks: the point is that
 * the rows are gone, read back with SQL.
 */

vi.mock("../adapters/mlb-statsapi", () => ({ fetchMLBFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nba", () => ({ fetchNBAFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nfl", () => ({ fetchNFLFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-cfb", () => ({ fetchCFBFinalScores: vi.fn(() => Promise.resolve([])) }));

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-acc-withdrawn-"));
process.env.DATA_DIR = TMP_DIR;
process.env.PIPELINE_DATA_DIR = TMP_DIR;

let store: typeof import("../store");
let settlement: typeof import("../settlement");
let storage: typeof import("../../storage");

const AT = "2026-11-01T12:00:00.000Z";
const WRITER = { id: "src_writer", name: "Beat Writer", type: "x" };
const PRIOR = { id: "src_prior", name: "Seeded Prior", type: "x" };

beforeAll(async () => {
  store = await import("../store");
  settlement = await import("../settlement");
  storage = await import("../../storage");
});

beforeEach(() => {
  const p = store.getPipelineDb();
  for (const t of ["outcomes", "live_signals", "pipeline_source_accuracy"]) {
    try { p.prepare(`DELETE FROM ${t}`).run(); } catch { /* table created lazily */ }
  }
  const s = storage.getStorageDb();
  s.prepare("DELETE FROM settled_outcomes").run();
  s.prepare("DELETE FROM source_scores").run();
});

let n = 0;
function seedGraded(signalType: string, sources: object[], hit: 0 | 1): string {
  const id = `sig_${++n}`;
  store.upsertLiveSignal({
    id, league: "NFL", game_id: "G1", signal_type: signalType,
    headline: "t", body: "", action_note: "", why_it_matters: "",
    team: "KC", player: null, matchup: "BUF @ KC",
    sources, source_count: sources.length,
    verdict: "likely", confidence: 70, confirmation_strength: "Developing",
    line_movement: null, injury_designation: null, lineup_status: null, weather_note: null,
    betting_relevance: true, fantasy_relevance: false,
    score: 60, score_band: "Watchlist", urgency_label: "", urgency_reason: "", trust_label: "",
    score_explanation: "", breakdown: {}, raw_event_ids: [],
    signal_time: AT, first_seen_at: AT, created_at: AT, updated_at: AT, outcome_id: null,
  } as any);
  store.getPipelineDb().prepare(`
    INSERT INTO outcomes (id, signal_id, game_id, market, hit, clv, recorded_at, created_at)
    VALUES (?, ?, 'G1', 'spread', ?, 0.5, ?, ?)
  `).run(`o_${id}`, id, hit, AT, AT);
  storage.getStorageDb().prepare(`
    INSERT INTO settled_outcomes (id, signal_id, game_id, league, signal_type, sources, hit, clv, recorded_at)
    VALUES (?, ?, 'G1', 'NFL', ?, ?, ?, 0.5, ?)
  `).run(`so_${id}`, id, signalType, JSON.stringify(sources), hit, AT);
  return id;
}

/** What the v2 regrade does to a row: hit -> NULL, settlement_state no_grade, in both DBs. */
function regradeToNoGrade(signalId: string) {
  store.getPipelineDb().prepare(
    "UPDATE outcomes SET hit = NULL, clv = NULL, settlement_state = 'no_grade', no_grade_reason = 'no_side_claimed', grading_version = 'v2' WHERE signal_id = ?",
  ).run(signalId);
  storage.getStorageDb().prepare("UPDATE settled_outcomes SET hit = NULL, clv = NULL WHERE signal_id = ?").run(signalId);
}

const accuracyRows = () =>
  store.getPipelineDb().prepare("SELECT id, total_signals, wins, hit_rate FROM pipeline_source_accuracy ORDER BY id").all() as
    Array<{ id: string; total_signals: number; wins: number; hit_rate: number | null }>;

const score = (sourceId: string) =>
  storage.getStorageDb().prepare("SELECT overall_accuracy, draft_accuracy, team_accuracies FROM source_scores WHERE source_id = ?").get(sourceId) as
    { overall_accuracy: number | null; draft_accuracy: number | null; team_accuracies: string } | undefined;

describe("withdrawn accuracy is deleted, not left for a recompute to overwrite", () => {
  it("removes per-type and per-source rows whose graded outcomes were all withdrawn", () => {
    const a = seedGraded("injury_update", [WRITER], 1);
    const b = seedGraded("injury_update", [WRITER], 0);
    seedGraded("weather_update", [{ id: "src_wx", name: "WX", type: "api" }], 1);
    settlement.forceAccuracyRecompute();

    const before = accuracyRows().map((r) => r.id);
    expect(before).toContain("NFL|injury_update|ALL");
    expect(before).toContain("NFL|ALL|src_writer");

    regradeToNoGrade(a);
    regradeToNoGrade(b);
    const res = settlement.forceAccuracyRecompute();

    const after = accuracyRows();
    const ids = after.map((r) => r.id);
    // The rows are GONE, not zeroed and not stale.
    expect(ids).not.toContain("NFL|injury_update|ALL");
    expect(ids).not.toContain("NFL|ALL|src_writer");
    // What the population still supports is still there, and correct.
    expect(after.find((r) => r.id === "NFL|weather_update|ALL")).toMatchObject({ total_signals: 1, wins: 1 });
    expect(after.find((r) => r.id === "NFL|ALL|ALL")).toMatchObject({ total_signals: 1, wins: 1 });
    expect(res.rows_deleted).toBe(before.length);
    expect(res.rows_written).toBe(after.length);
  });

  it("every row of a recompute carries one computed_at", () => {
    seedGraded("injury_update", [WRITER], 1);
    seedGraded("weather_update", [PRIOR], 0);
    settlement.forceAccuracyRecompute();
    const stamps = store.getPipelineDb().prepare("SELECT DISTINCT computed_at FROM pipeline_source_accuracy").all();
    expect(stamps).toHaveLength(1);
  });

  it("withdraws a sync-written source_scores accuracy, and leaves a seeded prior alone", () => {
    const w = seedGraded("injury_update", [WRITER], 1);
    const p = seedGraded("injury_update", [PRIOR], 1);
    settlement.forceAccuracyRecompute();
    expect(Number(score(WRITER.id)?.overall_accuracy)).toBe(100);

    // PRIOR's row was last written by a seed (seed-cfb-sources shape: overall
    // reset to a prior, draft left different), so it is not a settlement number.
    storage.storage.upsertSourceScore({ source_id: PRIOR.id, overall_accuracy: "72" });
    storage.getStorageDb().prepare("UPDATE source_scores SET team_accuracies = '{\"KC\":1}' WHERE source_id = ?").run(WRITER.id);

    regradeToNoGrade(w);
    regradeToNoGrade(p);
    const res = settlement.forceAccuracyRecompute();

    expect(res.source_scores_cleared).toBe(1);
    const writer = score(WRITER.id)!;
    expect(writer.overall_accuracy).toBeNull();
    expect(writer.draft_accuracy).toBeNull();
    expect(writer.team_accuracies).toBe('{"KC":1}'); // row kept, only accuracy cleared
    expect(Number(score(PRIOR.id)!.overall_accuracy)).toBe(72);
  });

  it("keeps a source that still has a graded row", () => {
    const a = seedGraded("injury_update", [WRITER], 1);
    seedGraded("weather_update", [WRITER], 0);
    settlement.forceAccuracyRecompute();
    regradeToNoGrade(a);
    const res = settlement.forceAccuracyRecompute();
    expect(res.source_scores_cleared).toBe(0);
    expect(Number(score(WRITER.id)!.overall_accuracy)).toBe(0); // 0 wins of 1 graded
  });
});

describe("accuracyLedgerIsStale: the trigger no longer depends on a graded settlement", () => {
  it("is false right after a recompute", () => {
    seedGraded("injury_update", [WRITER], 1);
    settlement.forceAccuracyRecompute();
    expect(settlement.accuracyLedgerIsStale()).toBe(false);
  });

  it("is true when grades are withdrawn with no new graded settlement (signalsSettled stays 0)", () => {
    const a = seedGraded("injury_update", [WRITER], 1);
    settlement.forceAccuracyRecompute();
    regradeToNoGrade(a);
    expect(settlement.accuracyLedgerIsStale()).toBe(true);
    settlement.forceAccuracyRecompute();
    expect(settlement.accuracyLedgerIsStale()).toBe(false);
    // and the population is now empty, with the per-type row gone
    expect(accuracyRows().map((r) => r.id)).toEqual(["CFB|ALL|ALL", "MLB|ALL|ALL", "NBA|ALL|ALL", "NFL|ALL|ALL"]);
  });

  it("is true when an older recompute left rows behind (the state prod is in before this deploys)", () => {
    seedGraded("injury_update", [WRITER], 1);
    settlement.forceAccuracyRecompute();
    store.getPipelineDb().prepare(`
      INSERT INTO pipeline_source_accuracy (id, league, signal_type, total_signals, wins, losses, hit_rate, computed_at)
      VALUES ('NFL|lineup_change|ALL', 'NFL', 'lineup_change', 40, 30, 10, 0.75, '2026-10-01T00:00:00.000Z')
    `).run();
    expect(settlement.accuracyLedgerIsStale()).toBe(true);
    settlement.forceAccuracyRecompute();
    expect(accuracyRows().map((r) => r.id)).not.toContain("NFL|lineup_change|ALL");
  });

  it("is true when a new graded outcome lands", () => {
    seedGraded("injury_update", [WRITER], 1);
    settlement.forceAccuracyRecompute();
    seedGraded("injury_update", [WRITER], 0);
    expect(settlement.accuracyLedgerIsStale()).toBe(true);
  });
});

describe("autoSettleFinishedGames recomputes with zero graded settlements", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("clears withdrawn rows on the next cycle past the debounce, though signals_settled is 0", async () => {
    const a = seedGraded("injury_update", [WRITER], 1);
    settlement.forceAccuracyRecompute();           // stamps the debounce clock
    regradeToNoGrade(a);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61 * 60 * 1000); // past ACCURACY_DEBOUNCE_MS
    const res = await settlement.autoSettleFinishedGames();

    expect(res.signals_settled).toBe(0);          // the old trigger would not have fired
    expect(accuracyRows().map((r) => r.id)).not.toContain("NFL|injury_update|ALL");
    expect(accuracyRows().map((r) => r.id)).not.toContain("NFL|ALL|src_writer");
    expect(score(WRITER.id)!.overall_accuracy).toBeNull();
    expect(settlement.accuracyLedgerIsStale()).toBe(false);
  });
});
