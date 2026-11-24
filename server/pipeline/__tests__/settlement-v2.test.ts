import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Settlement v2 through the real write path: settleGame -> recordSettlement ->
 * outcomes + live_signals.outcome_id + signal_state_history + the storage.db
 * mirror (mocked here, asserted on its arguments). Also the SETTLEMENT_V2=0
 * kill switch, the no_grade/hit invariant at the writer, the accuracy SQL
 * population, and replay validation of a v2 outcome.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-settle-v2-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn(), recordSignalStateTransition: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
  markSettledOutcomesStale: vi.fn(() => 0),
  countStaleSettledOutcomes: vi.fn(() => 0),
}));
vi.mock("../adapters/mlb-statsapi", () => ({ fetchMLBFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nba", () => ({ fetchNBAFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nfl", () => ({ fetchNFLFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-cfb", () => ({ fetchCFBFinalScores: vi.fn(() => Promise.resolve([])) }));

type StoreMod = typeof import("../store");
type SettlementMod = typeof import("../settlement");
type ReplayValidationMod = typeof import("../replay-validation");

let store: StoreMod;
let settlement: SettlementMod;
let replayValidation: ReplayValidationMod;
let insertSettledOutcome: ReturnType<typeof vi.fn>;

const GAME_ID = "NFL_2026-11-22_BUF_KC";
const KICKOFF = "2026-11-22T18:00:00.000Z";
const SIGNAL_AT = "2026-11-22T12:00:00.000Z";

beforeAll(async () => {
  store = await import("../store");
  settlement = await import("../settlement");
  replayValidation = await import("../replay-validation");
  ({ insertSettledOutcome } = (await import("../../storage")) as any);
});

function seedGame() {
  store.upsertGame({
    id: GAME_ID, league: "NFL", home_team: "KC", away_team: "BUF",
    game_time: KICKOFF, status: "scheduled",
    spread_line: -4.5, spread_team: "KC", total_line: 46,
    moneyline_home: null, moneyline_away: null, open_spread: -2.5, open_total: 48,
    source_game_id: "src-1",
  } as any);
  for (const [at, spread, total] of [
    ["2026-11-21T12:00:00.000Z", -2.5, 48],
    [SIGNAL_AT, -3, 47.5],
    ["2026-11-22T17:30:00.000Z", -4.5, 46],
    // In-play prices (pre-guard style). Must never be read as the close.
    ["2026-11-22T19:30:00.000Z", -10, 38],
  ] as const) {
    store.insertOddsSnapshot({
      game_id: GAME_ID, league: "NFL", sportsbook: "draftkings",
      spread_line: spread, spread_team: "KC", total_line: total,
      moneyline_home: null, moneyline_away: null, source_game_id: "src-1", snapshot_at: at,
    });
  }
}

function seedSignal(overrides: Record<string, unknown>): string {
  const id = `sig_${Math.floor(Math.random() * 1e9)}`;
  store.upsertLiveSignal({
    id, league: "NFL", game_id: GAME_ID, signal_type: "weather_update",
    headline: "t", body: "", action_note: "", why_it_matters: "",
    team: "KC", player: null, matchup: "BUF @ KC",
    sources: [{ name: "wx", type: "api" }], source_count: 1,
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

function outcomeRow(signalId: string): any {
  return store.getPipelineDb().prepare("SELECT * FROM outcomes WHERE signal_id = ?").get(signalId);
}

function settledState(signalId: string): string | undefined {
  const rows = store.getSignalHistory(signalId) as Array<{ new_state: string }>;
  return rows.map((r) => r.new_state).find((s) => s.startsWith("SETTLED"));
}

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["outcomes", "live_signals", "games", "odds_snapshots", "signal_state_history", "raw_events"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  vi.clearAllMocks();
  delete process.env.SETTLEMENT_V2;
  // The fixture carries in-play prices, as every game did before the kickoff
  // guard. With the guard covering NFL, a post-kickoff snapshot means the
  // stored kickoff is stale (kickoff_time_unreliable, tested below), so the
  // base fixture runs as an unguarded league.
  process.env.ODDS_KICKOFF_GUARD = "0";
  seedGame();
});

afterEach(() => {
  delete process.env.SETTLEMENT_V2;
  delete process.env.ODDS_KICKOFF_GUARD;
});

describe("settlement v2 writes", () => {
  it("grades the high-wind Under and records state, version and signed CLV everywhere", () => {
    const id = seedSignal({ graded_side: "under", action_note: "Favour unders — wind above 15 MPH consistently suppresses scoring." });
    const res = settlement.settleGame(GAME_ID, 20, 17);
    expect(res).toMatchObject({ settled: 1, skipped: 0, errors: 0 });

    const o = outcomeRow(id);
    expect(o).toMatchObject({
      market: "total", line_at_signal: 47.5, closing_line: 46, actual_result: 37,
      hit: 1, clv: 1.5, settlement_state: "graded", no_grade_reason: null, grading_version: "v2",
    });
    expect(settledState(id)).toBe("SETTLED_WIN");
    expect(insertSettledOutcome).toHaveBeenCalledWith(expect.objectContaining({
      signal_id: id, hit: true, clv: 1.5, settlement_state: "graded", no_grade_reason: null, grading_version: "v2",
    }));
  });

  it("settles an injury signal as no_grade / no_side_claimed, recorded as SETTLED_NO_GRADE, never SETTLED_LOSS", () => {
    const id = seedSignal({ signal_type: "injury_update", player: "P", injury_designation: "OUT", action_note: "Adjust roster exposure immediately." });
    const res = settlement.settleGame(GAME_ID, 20, 17);
    expect(res).toMatchObject({ settled: 0, skipped: 1, errors: 0 });

    const o = outcomeRow(id);
    expect(o).toMatchObject({ hit: null, clv: null, market: "none", settlement_state: "no_grade", no_grade_reason: "no_side_claimed", grading_version: "v2" });
    expect(settledState(id)).toBe("SETTLED_NO_GRADE");
    // Settled for good: the signal is linked and never offered again.
    expect(store.getLiveSignal(id)!.outcome_id).toBe(o.id);
    expect(store.getSettleable().map((g: any) => g.id ?? g.game_id)).not.toContain(GAME_ID);
    expect(insertSettledOutcome).toHaveBeenCalledWith(expect.objectContaining({
      signal_id: id, hit: null, settlement_state: "no_grade", no_grade_reason: "no_side_claimed",
    }));
  });

  it("a line move keeps its market and kickoff-bounded lines as description, ungraded", () => {
    const id = seedSignal({ signal_type: "line_move", market: "total", line_movement: { open: 48, current: 47.5, delta: 0.5, direction: "down" } });
    settlement.settleGame(GAME_ID, 20, 17);
    expect(outcomeRow(id)).toMatchObject({
      market: "total", line_at_signal: 47.5, closing_line: 46, hit: null, clv: null,
      settlement_state: "no_grade", no_grade_reason: "no_side_claimed",
    });
  });

  it("with the guard covering the league, post-kickoff odds make it kickoff_time_unreliable", () => {
    delete process.env.ODDS_KICKOFF_GUARD; // default scope covers NFL
    const id = seedSignal({ graded_side: "under" });
    settlement.settleGame(GAME_ID, 20, 17);
    expect(outcomeRow(id)).toMatchObject({ hit: null, settlement_state: "no_grade", no_grade_reason: "kickoff_time_unreliable" });
  });

  it("no_grade rows stay out of the accuracy population", () => {
    seedSignal({ signal_type: "injury_update", player: "P" });
    seedSignal({ graded_side: "under" });
    settlement.settleGame(GAME_ID, 20, 17);
    const row = store.getPipelineDb().prepare(settlement.ACCURACY_OVERALL_SQL).get("NFL") as any;
    expect(row.total).toBe(1);
    expect(row.wins).toBe(1);
  });
});

describe("the writer refuses a no_grade outcome with a hit", () => {
  it("throws rather than let it into the accuracy numbers", () => {
    expect(() => store.createOutcome({
      signal_id: "x", game_id: GAME_ID, market: "total", home_score: 1, away_score: 1,
      line_at_signal: null, closing_line: null, actual_result: null, hit: true, clv: null,
      recorded_at: SIGNAL_AT, settlement_state: "no_grade", no_grade_reason: "push",
    })).toThrow(/must have hit = null/);
  });
});

describe("SETTLEMENT_V2=0 kill switch", () => {
  it("settles with the pre-v2 rules and marks rows as such", () => {
    process.env.SETTLEMENT_V2 = "0";
    const injury = seedSignal({ signal_type: "injury_update", player: "P" });
    const res = settlement.settleGame(GAME_ID, 20, 17);
    expect(res.settled).toBe(1);
    // Legacy: injury graded on game.spread_line, version NULL.
    expect(outcomeRow(injury)).toMatchObject({ market: "spread", settlement_state: "graded", grading_version: null });
    expect(outcomeRow(injury).hit).not.toBeNull();
  });

  it("a legacy no-result is no_grade / legacy_no_result, not SETTLED_LOSS", () => {
    process.env.SETTLEMENT_V2 = "0";
    const id = seedSignal({ signal_type: "transaction" });
    settlement.settleGame(GAME_ID, 20, 17);
    expect(outcomeRow(id)).toMatchObject({ hit: null, settlement_state: "no_grade", no_grade_reason: "legacy_no_result" });
    expect(settledState(id)).toBe("SETTLED_NO_GRADE");
  });
});

describe("replay validation of a v2 outcome", () => {
  it("regrades from the same inputs and matches", () => {
    const graded = seedSignal({ graded_side: "under" });
    const ungraded = seedSignal({ signal_type: "injury_update", player: "P" });
    settlement.settleGame(GAME_ID, 20, 17);
    expect(replayValidation.validateReplayAgainstOutcome(graded)).toMatchObject({ matched: true, replay_clv: 1.5, outcome_clv: 1.5 });
    expect(replayValidation.validateReplayAgainstOutcome(ungraded)).toMatchObject({ matched: true });
  });

  it("reports a mismatch when the stored outcome differs from a regrade", () => {
    const id = seedSignal({ graded_side: "under" });
    settlement.settleGame(GAME_ID, 20, 17);
    store.getPipelineDb().prepare("UPDATE outcomes SET clv = -1.5 WHERE signal_id = ?").run(id);
    expect(replayValidation.validateReplayAgainstOutcome(id)).toMatchObject({ matched: false, replay_clv: 1.5, outcome_clv: -1.5 });
  });
});
