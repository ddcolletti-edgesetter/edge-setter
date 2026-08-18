import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * End-to-end settlement regression for the MLB game-identity fix.
 *
 * Proves the thing the diagnosis was actually about: after unifying MLB onto the
 * canonical (odds-bearing) game row, `autoSettleFinishedGames()` produces outcomes
 * with NON-NULL hit values — for both the game_id-linked path (pitcher
 * lineup_confirm) and the null-game_id fallback (injury_update) — and
 * `runCalibration()` then sees `total_settled_outcomes > 0` instead of 0.
 *
 * Before the fix, MLB scores landed on a spreadless `mlb_${gamePk}` row, so every
 * settlement returned hit=null and this count sat at zero for weeks.
 *
 * Setup notes:
 *  - PIPELINE_DATA_DIR is pointed at a throwaway dir BEFORE store.ts is imported,
 *    so getPipelineDb() builds a fresh, isolated pipeline.db with the full schema.
 *  - ../storage is mocked (settlement mirrors outcomes there + reads it back for
 *    accuracy sync); we assert the pipeline.db side, which is what calibration
 *    actually queries.
 *  - The four score fetchers are mocked so no network is touched; only MLB
 *    returns a Final score.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-mlb-settle-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

// Mock the persistent storage layer so the test never opens the real app DB.
// store.ts pulls backfill helpers from here; settlement.ts pulls the mirror
// helpers — provide both so neither import binding is undefined.
vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
}));

// No network: only MLB yields a Final score; the rest return empty.
vi.mock("../adapters/mlb-statsapi", () => ({ fetchMLBFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nba", () => ({ fetchNBAFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nfl", () => ({ fetchNFLFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-cfb", () => ({ fetchCFBFinalScores: vi.fn(() => Promise.resolve([])) }));

type StoreMod = typeof import("../store");
type SettlementMod = typeof import("../settlement");
type CalibrationMod = typeof import("../calibration");
type CanonMod = typeof import("../canonical-game-id");

let store: StoreMod;
let settlement: SettlementMod;
let calibration: CalibrationMod;
let canon: CanonMod;
let fetchMLBFinalScores: ReturnType<typeof vi.fn>;

const GAME_TIME = "2026-08-17T23:05:00.000Z";
const SIGNAL_TIME = "2026-08-17T12:00:00.000Z"; // before game time
let GAME_ID: string;

beforeAll(async () => {
  store = await import("../store");
  settlement = await import("../settlement");
  calibration = await import("../calibration");
  canon = await import("../canonical-game-id");
  ({ fetchMLBFinalScores } = (await import("../adapters/mlb-statsapi")) as any);
  GAME_ID = canon.canonicalGameId("MLB", GAME_TIME, "NYY", "BOS");
});

function seedSignal(overrides: Record<string, unknown>): string {
  const id = `sig_${Math.floor(Math.random() * 1e9)}_${overrides.signal_type}`;
  const base = {
    id,
    league: "MLB",
    game_id: null,
    signal_type: "injury_update",
    headline: "test",
    body: "",
    action_note: "",
    why_it_matters: "",
    team: "BOS",
    player: "Test Player",
    matchup: "NYY @ BOS",
    sources: [{ name: "MLB StatsAPI", type: "league_api" }],
    source_count: 1,
    verdict: "confirmed",
    confidence: 85,
    confirmation_strength: "Consensus",
    line_movement: null,
    injury_designation: null,
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: true,
    score: 80,
    score_band: "strong",
    urgency_label: "",
    urgency_reason: "",
    trust_label: "",
    score_explanation: "",
    breakdown: {},
    raw_event_ids: [],
    signal_time: SIGNAL_TIME,
    first_seen_at: SIGNAL_TIME,
    created_at: SIGNAL_TIME,
    updated_at: SIGNAL_TIME,
    outcome_id: null,
  };
  store.upsertLiveSignal({ ...base, ...overrides } as any);
  return id;
}

beforeEach(() => {
  // Fresh state each test: clear the pipeline tables we touch.
  const db = store.getPipelineDb();
  for (const t of ["outcomes", "live_signals", "games", "signal_state_history"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  vi.clearAllMocks();
  fetchMLBFinalScores.mockResolvedValue([]);
});

describe("MLB settlement produces non-null hits after game-identity unification", () => {
  it("settles both the pitcher (game_id) and injury (null game_id) paths to non-null hits", async () => {
    // Seed the CANONICAL (odds-bearing) game row — the one settlement must use.
    store.upsertGame({
      id: GAME_ID,
      league: "MLB",
      home_team: "BOS",
      away_team: "NYY",
      game_time: GAME_TIME,
      status: "scheduled",
      spread_line: -1.5,          // run line lives on THIS row
      spread_team: "BOS",
      total_line: 8.5,
      moneyline_home: -150,
      moneyline_away: 130,
      open_spread: -1.5,
      open_total: 8.5,
      home_score: null,
      away_score: null,
      source_game_id: "777001",
    } as any);

    // Pitcher confirmation bound to the canonical game id.
    const pitcherId = seedSignal({
      signal_type: "lineup_confirm",
      game_id: GAME_ID,
      lineup_status: "confirmed starter",
      team: "BOS",
    });
    // Injury with NO game_id — settles via findNextFinalGameForTeam fallback.
    const injuryId = seedSignal({
      signal_type: "injury_update",
      game_id: null,
      injury_designation: "IL-10",
      team: "BOS",
    });

    // The MLB fetcher reports the game Final, keyed to the canonical id.
    fetchMLBFinalScores.mockResolvedValue([
      { game_id: GAME_ID, home_score: 5, away_score: 3 },
    ]);

    const result = await settlement.autoSettleFinishedGames();

    // Game row is now final + scored on the canonical row.
    const game = store.getGame(GAME_ID)!;
    expect(game.status).toBe("final");
    expect(game.home_score).toBe(5);
    expect(game.away_score).toBe(3);

    // Both signals settled to non-null hits.
    expect(result.signals_settled).toBe(2);

    const pitcherOutcomes = store.getOutcomes(pitcherId);
    const injuryOutcomes = store.getOutcomes(injuryId);
    expect(pitcherOutcomes).toHaveLength(1);
    expect(injuryOutcomes).toHaveLength(1);
    expect(pitcherOutcomes[0].hit).not.toBeNull();
    expect(injuryOutcomes[0].hit).not.toBeNull();

    // The metric the diagnosis was about: no longer zero.
    const report = calibration.runCalibration();
    expect(report.total_settled_outcomes).toBe(2);
  });

  it("regression guard: MLB scores resolve onto a row that HAS a spread", async () => {
    // If a future change re-introduced a spreadless score row, the settled
    // outcome would go back to hit=null. Assert the settled game carries a line.
    store.upsertGame({
      id: GAME_ID,
      league: "MLB",
      home_team: "BOS",
      away_team: "NYY",
      game_time: GAME_TIME,
      status: "scheduled",
      spread_line: -1.5,
      spread_team: "BOS",
      total_line: 8.5,
      moneyline_home: -150,
      moneyline_away: 130,
      open_spread: -1.5,
      open_total: 8.5,
      home_score: null,
      away_score: null,
      source_game_id: "777001",
    } as any);
    seedSignal({ signal_type: "lineup_confirm", game_id: GAME_ID, team: "BOS" });
    fetchMLBFinalScores.mockResolvedValue([
      { game_id: GAME_ID, home_score: 5, away_score: 3 },
    ]);

    await settlement.autoSettleFinishedGames();

    const settledGame = store.getGame(GAME_ID)!;
    expect(settledGame.spread_line).not.toBeNull();
    expect(settledGame.status).toBe("final");
  });

  it("documents the legitimate null-hit case: a game with no spread grades to hit=null without crashing", async () => {
    // A spread-less canonical row (e.g. odds never arrived) is allowed and must
    // grade to hit=null — so total_settled_outcomes only ever counts real lines.
    store.upsertGame({
      id: GAME_ID,
      league: "MLB",
      home_team: "BOS",
      away_team: "NYY",
      game_time: GAME_TIME,
      status: "scheduled",
      spread_line: null,
      spread_team: null,
      total_line: null,
      moneyline_home: null,
      moneyline_away: null,
      open_spread: null,
      open_total: null,
      home_score: null,
      away_score: null,
      source_game_id: "777001",
    } as any);
    const sigId = seedSignal({ signal_type: "lineup_confirm", game_id: GAME_ID, team: "BOS" });
    fetchMLBFinalScores.mockResolvedValue([
      { game_id: GAME_ID, home_score: 5, away_score: 3 },
    ]);

    await settlement.autoSettleFinishedGames();

    const outcomes = store.getOutcomes(sigId);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].hit).toBeNull();
    expect(calibration.runCalibration().total_settled_outcomes).toBe(0);
  });
});
