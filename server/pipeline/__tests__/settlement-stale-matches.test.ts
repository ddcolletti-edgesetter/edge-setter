import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Regression suite for fix/settlement-stale-matches.
 *
 * Covers the four behaviours the fix introduces:
 *   1. findNextFinalGameForTeam rejects a game far past the league window.
 *   2. autoSettleFinishedGames expires an old, never-matchable null-game signal
 *      so it drops out of the settlement queue permanently.
 *   3. Accuracy queries (getTrackRecord) ignore outcomes flagged excluded_stale.
 *   4. runSettlementBacklogMigration is idempotent (a second run is a no-op).
 *
 * Setup mirrors mlb-settlement-regression.test.ts: PIPELINE_DATA_DIR is pointed
 * at a throwaway dir before store.ts is imported, and ../../storage is mocked so
 * the persistent app DB is never touched. The four score fetchers are stubbed.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-stale-settle-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

const markSettledOutcomesStaleMock = vi.fn((ids: string[]) => ids.length);

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
  markSettledOutcomesStale: markSettledOutcomesStaleMock,
}));

vi.mock("../adapters/mlb-statsapi", () => ({ fetchMLBFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nba", () => ({ fetchNBAFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nfl", () => ({ fetchNFLFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-cfb", () => ({ fetchCFBFinalScores: vi.fn(() => Promise.resolve([])) }));

type StoreMod = typeof import("../store");
type SettlementMod = typeof import("../settlement");

let store: StoreMod;
let settlement: SettlementMod;

beforeAll(async () => {
  store = await import("../store");
  settlement = await import("../settlement");
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

function seedGame(overrides: Record<string, unknown>): string {
  const id = String(overrides.id ?? `game_${Math.floor(Math.random() * 1e9)}`);
  const homeScore = (overrides.home_score as number | undefined) ?? 24;
  const awayScore = (overrides.away_score as number | undefined) ?? 17;
  store.upsertGame({
    id,
    league: "NFL",
    home_team: "DAL",
    away_team: "NYG",
    game_time: iso(Date.now()),
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
    home_score: null,
    away_score: null,
  } as any);
  // Scores + final status are set through the real settlement path, since
  // upsertGame does not persist score columns.
  store.updateGameFinal(id, homeScore, awayScore);
  return id;
}

function seedSignal(overrides: Record<string, unknown>): string {
  const id = String(overrides.id ?? `sig_${Math.floor(Math.random() * 1e9)}`);
  const base = {
    id,
    league: "NFL",
    game_id: null,
    signal_type: "injury_update",
    headline: "test",
    body: "",
    action_note: "",
    why_it_matters: "",
    team: "DAL",
    player: "Test Player",
    matchup: "NYG @ DAL",
    sources: [{ name: "Beat Writer", type: "beat_writer" }],
    source_count: 1,
    verdict: "confirmed",
    confidence: 85,
    confirmation_strength: "Consensus",
    line_movement: null,
    injury_designation: "questionable",
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: false,
    score: 80,
    score_band: "strong",
    urgency_label: "",
    urgency_reason: "",
    trust_label: "",
    score_explanation: "",
    breakdown: {},
    raw_event_ids: [],
    signal_time: iso(Date.now()),
    first_seen_at: iso(Date.now()),
    created_at: iso(Date.now()),
    updated_at: iso(Date.now()),
    outcome_id: null,
  };
  store.upsertLiveSignal({ ...base, ...overrides } as any);
  return id;
}

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["outcomes", "live_signals", "games", "signal_state_history"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  vi.clearAllMocks();
});

describe("findNextFinalGameForTeam window bound", () => {
  it("rejects a final game 60 days after the signal but accepts one inside the NFL window", () => {
    const signalTime = iso(Date.parse("2026-09-01T12:00:00.000Z"));

    // 60 days later — well past the 8-day NFL window.
    seedGame({
      id: "far_game",
      game_time: "2026-10-31T20:00:00.000Z",
      home_team: "DAL",
      away_team: "PHI",
    });

    expect(
      store.findNextFinalGameForTeam("NFL", "DAL", signalTime),
    ).toBeNull();

    // 3 days later — inside the window; must now be found.
    seedGame({
      id: "near_game",
      game_time: "2026-09-04T20:00:00.000Z",
      home_team: "DAL",
      away_team: "WAS",
    });

    const match = store.findNextFinalGameForTeam("NFL", "DAL", signalTime);
    expect(match).not.toBeNull();
    expect(match.id).toBe("near_game");
  });
});

describe("null-game signal expiry", () => {
  it("parks an old, never-matchable signal so it leaves the settlement queue", async () => {
    // Signal created 30 days ago with no final game for its team anywhere.
    seedSignal({
      id: "stale_sig",
      created_at: iso(Date.now() - 30 * DAY),
      updated_at: iso(Date.now() - 30 * DAY),
      signal_time: iso(Date.now() - 30 * DAY),
    });

    expect(store.getUnsettledSignalsWithoutGameId().map((r: any) => r.id)).toContain("stale_sig");

    const result = await settlement.autoSettleFinishedGames();
    expect(result.signals_expired).toBe(1);

    // Gone from the queue, and never comes back.
    expect(store.getUnsettledSignalsWithoutGameId().map((r: any) => r.id)).not.toContain("stale_sig");

    // Audit trail records the terminal state.
    const history = store.getSignalHistory("stale_sig");
    expect(history.some((h) => h.new_state === "SETTLEMENT_EXPIRED")).toBe(true);
  });

  it("does NOT expire a recent signal that could still match a future game", async () => {
    seedSignal({
      id: "fresh_sig",
      created_at: iso(Date.now() - 1 * HOUR),
      updated_at: iso(Date.now() - 1 * HOUR),
      signal_time: iso(Date.now() - 1 * HOUR),
    });

    const result = await settlement.autoSettleFinishedGames();
    expect(result.signals_expired).toBe(0);
    expect(store.getUnsettledSignalsWithoutGameId().map((r: any) => r.id)).toContain("fresh_sig");
  });
});

describe("accuracy excludes stale-flagged outcomes", () => {
  it("getTrackRecord ignores outcomes with excluded_stale=1", () => {
    const db = store.getPipelineDb();
    const gameId = seedGame({ id: "acc_game" });

    // Two settled, game-linked signals: one good, one we will flag stale.
    const goodSig = seedSignal({ id: "good_sig", game_id: gameId });
    const staleSig = seedSignal({ id: "stale_sig", game_id: gameId });

    const good = store.createOutcome({
      signal_id: goodSig, game_id: gameId, market: "spread",
      home_score: 24, away_score: 17, line_at_signal: -3.5, closing_line: -3.5,
      actual_result: 7, hit: true, clv: 1.0, recorded_at: iso(Date.now()),
    } as any);
    store.linkOutcomeToSignal(goodSig, good.id);

    const stale = store.createOutcome({
      signal_id: staleSig, game_id: gameId, market: "spread",
      home_score: 24, away_score: 17, line_at_signal: -3.5, closing_line: -3.5,
      actual_result: 7, hit: false, clv: -1.0, recorded_at: iso(Date.now()),
    } as any);
    store.linkOutcomeToSignal(staleSig, stale.id);

    // Before flagging: both counted (1 win, 1 loss).
    let tr = store.getTrackRecord("NFL");
    expect(tr.overall.total_signals).toBe(2);
    expect(tr.overall.wins).toBe(1);
    expect(tr.overall.losses).toBe(1);

    // Flag the losing one as a stale match.
    db.prepare("UPDATE outcomes SET excluded_stale = 1 WHERE id = ?").run(stale.id);

    tr = store.getTrackRecord("NFL");
    expect(tr.overall.total_signals).toBe(1);
    expect(tr.overall.wins).toBe(1);
    expect(tr.overall.losses).toBe(0);
    expect(tr.overall.hit_rate).toBe(1);
  });
});

describe("runSettlementBacklogMigration idempotency", () => {
  it("expires + flags on the first run and is a no-op on the second", async () => {
    const db = store.getPipelineDb();

    // (a) An old null-game signal with no matchable game → should be expired.
    seedSignal({
      id: "backlog_sig",
      created_at: iso(Date.now() - 40 * DAY),
      updated_at: iso(Date.now() - 40 * DAY),
      signal_time: iso(Date.now() - 40 * DAY),
    });

    // (b) A settled outcome from a null-game signal matched to a game 60 days
    //     later → should be flagged excluded_stale.
    const staleGame = seedGame({
      id: "stale_match_game",
      game_time: "2026-10-31T20:00:00.000Z",
    });
    const staleMatchSig = seedSignal({
      id: "stale_match_sig",
      game_id: null, // null game_id is what marks it a fallback match
      created_at: "2026-09-01T12:00:00.000Z",
      updated_at: "2026-09-01T12:00:00.000Z",
      signal_time: "2026-09-01T12:00:00.000Z",
    });
    const o = store.createOutcome({
      signal_id: staleMatchSig, game_id: staleGame, market: "spread",
      home_score: 24, away_score: 17, line_at_signal: -3.5, closing_line: -3.5,
      actual_result: 7, hit: true, clv: 0.5, recorded_at: iso(Date.now()),
    } as any);
    store.linkOutcomeToSignal(staleMatchSig, o.id);

    const first = await settlement.runSettlementBacklogMigration();
    expect(first.expired).toBe(1);
    expect(first.stale_outcomes_flagged).toBe(1);

    // Flag is persisted, row is kept (not deleted).
    const flagged = db.prepare("SELECT excluded_stale FROM outcomes WHERE id = ?").get(o.id) as any;
    expect(flagged.excluded_stale).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM outcomes").get() as any).n).toBe(1);

    // Mirror into storage.db was invoked with the stale signal id.
    expect(markSettledOutcomesStaleMock).toHaveBeenCalled();
    expect(markSettledOutcomesStaleMock.mock.calls[0][0]).toContain(staleMatchSig);

    const second = await settlement.runSettlementBacklogMigration();
    expect(second.expired).toBe(0);
    expect(second.stale_outcomes_flagged).toBe(0);
  });
});
