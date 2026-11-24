import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Settlement v2 regrade (regrade-v2.ts) and its CLI argument handling.
 *
 * Fixture: outcomes settled by the PRE-v2 rules (SETTLEMENT_V2=0) against a
 * game whose stored lines the odds adapter overwrote with in-play prices, as
 * happened before the kickoff guard. The regrade must re-run the v2 grader on
 * them, audit every change in outcome_regrades, mirror it to storage.db, and
 * be exactly reversible.
 *
 * storage.db is replaced by an in-memory mirror implementing the three calls
 * the regrade makes, so the two-database behaviour (including drift) is
 * observable.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-regrade-v2-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

const mirror = new Map<string, any>();

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn(), recordSignalStateTransition: vi.fn() },
  getSettledOutcomesForAccuracy: vi.fn(() => []),
  markSettledOutcomesStale: vi.fn(() => 0),
  countStaleSettledOutcomes: vi.fn(() => 0),
  setStorageBusyTimeoutMs: vi.fn(),
  clearWithdrawnSettlementAccuracy: vi.fn(() => []),
  insertSettledOutcome: vi.fn((d: any) => {
    if (mirror.has(d.signal_id)) return;
    mirror.set(d.signal_id, {
      market: d.market, line_at_signal: d.line_at_signal, closing_line: d.closing_line,
      actual_result: d.actual_result, hit: d.hit === null ? null : (d.hit ? 1 : 0), clv: d.clv,
      settlement_state: d.settlement_state ?? "graded", no_grade_reason: d.no_grade_reason ?? null,
      grading_version: d.grading_version ?? null,
    });
  }),
  getSettledOutcomeGrade: vi.fn((id: string) => (mirror.has(id) ? { ...mirror.get(id) } : null)),
  updateSettledOutcomeGrade: vi.fn((id: string, g: any) => {
    if (!mirror.has(id)) return 0;
    mirror.set(id, { ...g });
    return 1;
  }),
}));
vi.mock("../adapters/mlb-statsapi", () => ({ fetchMLBFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nba", () => ({ fetchNBAFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nfl", () => ({ fetchNFLFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-cfb", () => ({ fetchCFBFinalScores: vi.fn(() => Promise.resolve([])) }));

type StoreMod = typeof import("../store");
type SettlementMod = typeof import("../settlement");
type RegradeMod = typeof import("../regrade-v2");
type CliMod = typeof import("../../scripts/regrade-settlement-v2");

let store: StoreMod;
let settlement: SettlementMod;
let regrade: RegradeMod;
let cli: CliMod;

const GAME_ID = "NFL_2026-11-22_BUF_KC";
const KICKOFF = "2026-11-22T18:00:00.000Z";
const SIGNAL_AT = "2026-11-22T12:00:00.000Z";
const HIGH_WIND = "Favour unders — wind above 15 MPH consistently suppresses scoring.";

beforeAll(async () => {
  store = await import("../store");
  settlement = await import("../settlement");
  regrade = await import("../regrade-v2");
  cli = await import("../../scripts/regrade-settlement-v2");
});

function seedGame() {
  // games.spread_line / total_line hold IN-PLAY numbers: the pre-guard adapter
  // overwrote them in the pass that wrote the in-play snapshot.
  store.upsertGame({
    id: GAME_ID, league: "NFL", home_team: "KC", away_team: "BUF",
    game_time: KICKOFF, status: "scheduled",
    spread_line: -10, spread_team: "KC", total_line: 38,
    moneyline_home: null, moneyline_away: null, open_spread: -2.5, open_total: 48,
    source_game_id: "src-1",
  } as any);
  for (const [at, spread, total] of [
    ["2026-11-21T12:00:00.000Z", -2.5, 48],
    [SIGNAL_AT, -3, 47.5],
    ["2026-11-22T17:30:00.000Z", -4.5, 46],
    ["2026-11-22T19:30:00.000Z", -10, 38],
  ] as const) {
    store.insertOddsSnapshot({
      game_id: GAME_ID, league: "NFL", sportsbook: "draftkings",
      spread_line: spread, spread_team: "KC", total_line: total,
      moneyline_home: null, moneyline_away: null, source_game_id: "src-1", snapshot_at: at,
    });
  }
}

let n = 0;
function seedSignal(overrides: Record<string, unknown>): string {
  const id = `sig_${++n}_${overrides.signal_type ?? "weather_update"}`;
  store.upsertLiveSignal({
    id, league: "NFL", game_id: GAME_ID, signal_type: "weather_update",
    headline: "t", body: "", action_note: "", why_it_matters: "",
    team: "KC", player: null, matchup: "BUF @ KC",
    sources: [{ name: "x", type: "api" }], source_count: 1,
    verdict: "likely", confidence: 70, confirmation_strength: "Developing",
    line_movement: null, injury_designation: null, lineup_status: null, weather_note: null,
    betting_relevance: true, fantasy_relevance: false,
    score: 60, score_band: "Watchlist", urgency_label: "", urgency_reason: "", trust_label: "",
    score_explanation: "", breakdown: {}, raw_event_ids: [],
    signal_time: SIGNAL_AT, first_seen_at: SIGNAL_AT, created_at: SIGNAL_AT, updated_at: SIGNAL_AT,
    outcome_id: null,
    ...overrides,
  } as any);
  return id;
}

/** Seed the legacy population and settle it with the PRE-v2 rules. */
function seedLegacy() {
  const ids = {
    injury: seedSignal({ signal_type: "injury_update", player: "P1", injury_designation: "OUT" }),
    lineup: seedSignal({ signal_type: "lineup_confirm", player: "P2", lineup_status: "confirmed" }),
    lineMove: seedSignal({ signal_type: "line_move", market: "total", line_movement: { open: 48, current: 47.5, delta: 0.5, direction: "down" } }),
    windOld: seedSignal({ action_note: HIGH_WIND }), // pre-column: claim read from copy
    calm: seedSignal({ action_note: "Weather is a minor factor today; no large adjustment needed." }),
  };
  process.env.SETTLEMENT_V2 = "0";
  settlement.settleGame(GAME_ID, 20, 17);
  delete process.env.SETTLEMENT_V2;
  return ids;
}

const outcome = (signalId: string): any =>
  store.getPipelineDb().prepare("SELECT * FROM outcomes WHERE signal_id = ?").get(signalId);
const count = (table: string): number =>
  (store.getPipelineDb().prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as any).c;

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["outcomes", "live_signals", "games", "odds_snapshots", "signal_state_history",
    "raw_events", "regrade_runs", "outcome_regrades"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  mirror.clear();
  vi.clearAllMocks();
  process.env.ODDS_KICKOFF_GUARD = "0"; // the fixture carries pre-guard in-play prices
  seedGame();
});

afterEach(() => {
  delete process.env.SETTLEMENT_V2;
  delete process.env.ODDS_KICKOFF_GUARD;
});

describe("the legacy fixture is what pre-v2 settlement produced", () => {
  it("graded injury and lineup on an inferred side, against the in-play spread", () => {
    const ids = seedLegacy();
    expect(outcome(ids.injury)).toMatchObject({ market: "spread", closing_line: -10, grading_version: null });
    expect(outcome(ids.injury).hit).not.toBeNull();
    expect(outcome(ids.lineup).hit).not.toBeNull();
    // Line move graded as a spread, CLV by move direction.
    expect(outcome(ids.lineMove)).toMatchObject({ market: "spread" });
    // Weather graded against the in-play total, and calm weather graded too.
    expect(outcome(ids.windOld)).toMatchObject({ market: "total", closing_line: 38 });
    expect(outcome(ids.calm).hit).not.toBeNull();
  });
});

describe("planRegrade (dry run)", () => {
  it("applies the v2 rules and writes nothing", () => {
    const ids = seedLegacy();
    const before = store.getPipelineDb().prepare("SELECT * FROM outcomes ORDER BY id").all();
    const plan = regrade.planRegrade();

    expect(plan.scanned).toBe(5);
    expect(plan.changes).toHaveLength(5);
    const after = Object.fromEntries(plan.changes.map((c) => [c.signal_id, c.after]));
    for (const id of [ids.injury, ids.lineup, ids.lineMove, ids.calm]) {
      expect(after[id]).toMatchObject({ settlement_state: "no_grade", no_grade_reason: "no_side_claimed", hit: null, grading_version: "v2" });
    }
    // The line move keeps its own market and kickoff-bounded lines, as description.
    expect(after[ids.lineMove]).toMatchObject({ market: "total", line_at_signal: 47.5, closing_line: 46, clv: null });
    // The old high-wind row is graded: claim from its stored copy, pregame lines, signed CLV.
    expect(after[ids.windOld]).toMatchObject({
      settlement_state: "graded", market: "total", line_at_signal: 47.5, closing_line: 46, hit: 1, clv: 1.5,
    });

    expect(plan.accuracy.NFL).toMatchObject({ eligible_before: 5, eligible_after: 1 });
    expect(Object.keys(plan.transitions).some((k) => k.startsWith("injury_update:") && k.includes("no_grade(no_side_claimed)"))).toBe(true);

    // Nothing written.
    expect(store.getPipelineDb().prepare("SELECT * FROM outcomes ORDER BY id").all()).toEqual(before);
    expect(count("regrade_runs")).toBe(0);
    expect(count("outcome_regrades")).toBe(0);
  });

  it("every planned no_grade has hit null", () => {
    seedLegacy();
    for (const c of regrade.planRegrade().changes) {
      if (c.after.settlement_state === "no_grade") expect(c.after.hit).toBeNull();
    }
  });

  it("--league scopes it", () => {
    seedLegacy();
    expect(regrade.planRegrade({ league: "NBA" }).scanned).toBe(0);
    expect(regrade.planRegrade({ league: "NFL" }).scanned).toBe(5);
  });

  it("--max-rows caps the work oldest-first, and the rest is reported as deferred", () => {
    seedLegacy();
    const plan = regrade.planRegrade({ maxRows: 2 });
    expect(plan.changes).toHaveLength(2);
    expect(plan.deferred).toBe(3);
  });
});

describe("applyRegrade (--write)", () => {
  it("writes outcomes, one audit row per change with the exact before and after, and the mirror", async () => {
    const ids = seedLegacy();
    const plan = regrade.planRegrade();
    const legacyInjury = outcome(ids.injury);

    const r = await regrade.applyRegrade(plan, { pauseMs: 0, recompute: false });
    expect(r).toMatchObject({ changed: 5, conflicts: 0, mirror_updated: 5, mirror_missing: 0, mirror_repaired: 0 });

    expect(outcome(ids.injury)).toMatchObject({ settlement_state: "no_grade", no_grade_reason: "no_side_claimed", hit: null, grading_version: "v2" });
    const audit = store.getPipelineDb().prepare("SELECT * FROM outcome_regrades WHERE signal_id = ?").get(ids.injury) as any;
    expect(audit).toMatchObject({
      run_id: r.run_id, outcome_id: legacyInjury.id,
      before_hit: legacyInjury.hit, before_market: "spread", before_closing_line: -10, before_grading_version: null,
      after_hit: null, after_settlement_state: "no_grade", after_no_grade_reason: "no_side_claimed", after_grading_version: "v2",
      reversed_at: null,
    });
    expect(count("outcome_regrades")).toBe(5);
    const run = store.getPipelineDb().prepare("SELECT * FROM regrade_runs WHERE run_id = ?").get(r.run_id) as any;
    expect(run).toMatchObject({ mode: "write", rule_version: "v2", candidates: 5, changed: 5 });
    expect(run.finished_at).toBeTruthy();

    expect(mirror.get(ids.windOld)).toMatchObject({ hit: 1, clv: 1.5, settlement_state: "graded", grading_version: "v2" });
    expect(mirror.get(ids.injury)).toMatchObject({ hit: null, settlement_state: "no_grade" });
  });

  it("is idempotent: a second run changes nothing", async () => {
    seedLegacy();
    await regrade.applyRegrade(regrade.planRegrade(), { pauseMs: 0, recompute: false });
    const again = regrade.planRegrade();
    expect(again.changes).toHaveLength(0);
    expect(again.unchanged).toBe(5);
  });

  it("never touches excluded_stale", async () => {
    const ids = seedLegacy();
    store.getPipelineDb().prepare("UPDATE outcomes SET excluded_stale = 1 WHERE signal_id = ?").run(ids.injury);
    const plan = regrade.planRegrade();
    // A stale-excluded row is regraded (so a reverse is exact) but stays excluded,
    // and is not in the public population either side.
    expect(plan.accuracy.NFL.eligible_before).toBe(4);
    await regrade.applyRegrade(plan, { pauseMs: 0, recompute: false });
    expect(outcome(ids.injury)).toMatchObject({ excluded_stale: 1, settlement_state: "no_grade" });
  });

  it("a row changed between plan and write is a counted conflict, not overwritten, and gets no audit row", async () => {
    const ids = seedLegacy();
    const plan = regrade.planRegrade();
    store.getPipelineDb().prepare("UPDATE outcomes SET clv = 9.9 WHERE signal_id = ?").run(ids.lineMove);
    const r = await regrade.applyRegrade(plan, { pauseMs: 0, recompute: false });
    expect(r).toMatchObject({ changed: 4, conflicts: 1 });
    expect(outcome(ids.lineMove).clv).toBe(9.9);
    expect(store.getPipelineDb().prepare("SELECT COUNT(*) AS c FROM outcome_regrades WHERE signal_id = ?").get(ids.lineMove)).toEqual({ c: 0 });
  });

  it("chunks are clamped and each one is reported", async () => {
    seedLegacy();
    const holds: number[] = [];
    await regrade.applyRegrade(regrade.planRegrade(), { chunk: 2, pauseMs: 0, recompute: false, onChunk: (ms) => holds.push(ms) });
    expect(holds).toHaveLength(3); // 5 rows, 2 per chunk
    const big: number[] = [];
    seedSignal({ signal_type: "injury_update", player: "P9" });
    process.env.SETTLEMENT_V2 = "0"; settlement.settleGame(GAME_ID, 20, 17); delete process.env.SETTLEMENT_V2;
    await regrade.applyRegrade(regrade.planRegrade(), { chunk: 50_000, pauseMs: 0, recompute: false, onChunk: (ms) => big.push(ms) });
    expect(big).toHaveLength(1);
  });

  it("counts a signal with no mirror row as missing, not drift", async () => {
    const ids = seedLegacy();
    mirror.delete(ids.calm);
    const r = await regrade.applyRegrade(regrade.planRegrade(), { pauseMs: 0, recompute: false });
    expect(r).toMatchObject({ mirror_updated: 4, mirror_missing: 1, mirror_repaired: 0 });
    expect(regrade.planRegrade().mirror_drift).toBe(0);
  });

  it("recomputes the accuracy table when something changed, and only then", async () => {
    seedLegacy();
    const db = store.getPipelineDb();
    db.prepare("DELETE FROM pipeline_source_accuracy").run();
    await regrade.applyRegrade(regrade.planRegrade(), { pauseMs: 0, recompute: false });
    expect(count("pipeline_source_accuracy")).toBe(0);

    // Re-seed a legacy row so there is something to change, then let it recompute.
    seedSignal({ signal_type: "injury_update", player: "P8" });
    process.env.SETTLEMENT_V2 = "0"; settlement.settleGame(GAME_ID, 20, 17); delete process.env.SETTLEMENT_V2;
    db.prepare("DELETE FROM pipeline_source_accuracy").run();
    await regrade.applyRegrade(regrade.planRegrade(), { pauseMs: 0 });
    expect(count("pipeline_source_accuracy")).toBeGreaterThan(0);
  });
});

describe("--write removes the accuracy rows the regrade withdraws", () => {
  it("per-type rows for injury, lineup and line moves are gone after the write, and the ledger reads fresh", async () => {
    seedLegacy();
    settlement.forceAccuracyRecompute(); // the ledger as prod has it: legacy grades
    const typeRows = () => (store.getPipelineDb()
      .prepare("SELECT signal_type FROM pipeline_source_accuracy WHERE league = 'NFL' AND signal_type IS NOT NULL ORDER BY signal_type")
      .all() as Array<{ signal_type: string }>).map((r) => r.signal_type);
    expect(typeRows()).toEqual(expect.arrayContaining(["injury_update", "lineup_confirm", "line_move"]));

    const r = await regrade.applyRegrade(regrade.planRegrade(), { pauseMs: 0 });

    expect(r.accuracy).not.toBeNull();
    expect(r.accuracy!.stale_after).toBe(false);
    expect(r.accuracy!.rows_deleted).toBeGreaterThan(r.accuracy!.rows_written);
    const left = typeRows();
    for (const t of ["injury_update", "lineup_confirm", "line_move"]) expect(left).not.toContain(t);
    // No row from the pre-regrade recompute survives.
    expect((store.getPipelineDb().prepare("SELECT COUNT(DISTINCT computed_at) c FROM pipeline_source_accuracy").get() as any).c).toBe(1);
  });
});

describe("two databases: an interrupted mirror is reported and repaired", () => {
  it("a dry run reports mirror_drift; a write repairs it even with nothing left to regrade", async () => {
    const ids = seedLegacy();
    await regrade.applyRegrade(regrade.planRegrade(), { pauseMs: 0, recompute: false });
    // Simulate the crash window: pipeline regraded, storage still legacy.
    mirror.set(ids.injury, { ...mirror.get(ids.injury), hit: 1, settlement_state: "graded", grading_version: null });

    const dry = regrade.planRegrade();
    expect(dry.changes).toHaveLength(0);
    expect(dry.mirror_drift).toBe(1);

    const r = await regrade.applyRegrade(dry, { pauseMs: 0, recompute: false });
    expect(r).toMatchObject({ changed: 0, mirror_repaired: 1 });
    expect(mirror.get(ids.injury)).toMatchObject({ hit: null, settlement_state: "no_grade", grading_version: "v2" });
    expect(regrade.planRegrade().mirror_drift).toBe(0);
  });
});

describe("reverseRun (--reverse)", () => {
  it("restores every before grade exactly, in both databases, and stamps the audit rows", async () => {
    const ids = seedLegacy();
    const legacy = store.getPipelineDb().prepare("SELECT * FROM outcomes ORDER BY id").all();
    const legacyMirror = new Map([...mirror].map(([k, v]) => [k, { ...v }]));
    const w = await regrade.applyRegrade(regrade.planRegrade(), { pauseMs: 0, recompute: false });

    expect(regrade.planReverse(w.run_id)).toMatchObject({ restorable: 5, conflicts: 0, already_reversed: 0 });
    const r = await regrade.reverseRun(w.run_id, { pauseMs: 0, recompute: false });
    expect(r).toMatchObject({ changed: 5, conflicts: 0, mirror_updated: 5 });

    expect(store.getPipelineDb().prepare("SELECT * FROM outcomes ORDER BY id").all()).toEqual(legacy);
    for (const [k, v] of legacyMirror) expect(mirror.get(k)).toEqual(v);
    const stamped = store.getPipelineDb().prepare("SELECT COUNT(*) AS c FROM outcome_regrades WHERE reversed_by_run_id = ?").get(r.run_id) as any;
    expect(stamped.c).toBe(5);
    expect(store.getPipelineDb().prepare("SELECT mode, reverses_run_id FROM regrade_runs WHERE run_id = ?").get(r.run_id))
      .toEqual({ mode: "reverse", reverses_run_id: w.run_id });
    // And a regrade after the reverse offers the same changes again.
    expect(regrade.planRegrade().changes).toHaveLength(5);
    void ids;
  });

  it("a second reverse of the same run does nothing", async () => {
    seedLegacy();
    const w = await regrade.applyRegrade(regrade.planRegrade(), { pauseMs: 0, recompute: false });
    await regrade.reverseRun(w.run_id, { pauseMs: 0, recompute: false });
    expect(regrade.planReverse(w.run_id)).toMatchObject({ restorable: 0, already_reversed: 5 });
    const again = await regrade.reverseRun(w.run_id, { pauseMs: 0, recompute: false });
    expect(again.changed).toBe(0);
  });

  it("leaves a row that changed after the run alone, as a conflict", async () => {
    const ids = seedLegacy();
    const w = await regrade.applyRegrade(regrade.planRegrade(), { pauseMs: 0, recompute: false });
    store.getPipelineDb().prepare("UPDATE outcomes SET no_grade_reason = 'push' WHERE signal_id = ?").run(ids.injury);
    expect(regrade.planReverse(w.run_id)).toMatchObject({ restorable: 4, conflicts: 1 });
    const r = await regrade.reverseRun(w.run_id, { pauseMs: 0, recompute: false });
    expect(r).toMatchObject({ changed: 4, conflicts: 1 });
    expect(outcome(ids.injury).no_grade_reason).toBe("push");
  });

  it("refuses an unknown run and a reverse run", async () => {
    seedLegacy();
    expect(() => regrade.planReverse("rg_nope")).toThrow(/No regrade run/);
    const w = await regrade.applyRegrade(regrade.planRegrade(), { pauseMs: 0, recompute: false });
    const r = await regrade.reverseRun(w.run_id, { pauseMs: 0, recompute: false });
    expect(() => regrade.planReverse(r.run_id)).toThrow(/only a write run/);
  });
});

describe("CLI arguments", () => {
  it("parses the documented flags", () => {
    expect(cli.parseArgs(["--league", "nfl", "--write", "--max-rows", "200", "--chunk", "100", "--pause-ms", "50"]))
      .toMatchObject({ league: "NFL", write: true, maxRows: 200, chunk: 100, pauseMs: 50 });
    expect(cli.parseArgs([])).toMatchObject({ write: false, league: null, reverse: null });
  });

  it("refuses an unknown flag, a bad league, a bad number and a bad run id", () => {
    expect(() => cli.parseArgs(["--wirte"])).toThrow(/Unknown flag/);
    expect(() => cli.parseArgs(["--league", "NHL"])).toThrow(/--league/);
    expect(() => cli.parseArgs(["--max-rows", "-1"])).toThrow(/non-negative/);
    expect(() => cli.parseArgs(["--reverse", "abc"])).toThrow(/run id/);
  });

  it("quiet window is 07:00–11:59 UTC", () => {
    expect(cli.inQuietWindow(new Date("2026-11-24T06:59:00Z"))).toBe(false);
    expect(cli.inQuietWindow(new Date("2026-11-24T07:00:00Z"))).toBe(true);
    expect(cli.inQuietWindow(new Date("2026-11-24T11:59:00Z"))).toBe(true);
    expect(cli.inQuietWindow(new Date("2026-11-24T12:00:00Z"))).toBe(false);
  });
});
