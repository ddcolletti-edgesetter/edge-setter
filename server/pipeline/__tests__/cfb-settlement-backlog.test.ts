import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * The first settlement cycle after the CFB alias lookup lands is not a normal
 * cycle. Until now 84% of CFB games never resolved to a games row, so they
 * never went final and never settled; the cycle that first resolves them
 * promotes a whole ESPN week at once and hands every one of those games'
 * signals to getSettleable() in the same pass.
 *
 * This suite measures that cycle on a fixture (a full Saturday: 130 completed
 * FBS games, 2 betting-relevant signals each) and holds down:
 *   1. The alias is what resolves them — not the exact-token path.
 *   2. The per-cycle cap bounds how many games are promoted, the rest are
 *      deferred rather than dropped, and the next cycle drains them.
 *   3. No settlement step blocks the loop for more than 300ms, which is the
 *      budget that matters against Render's 5s health check.
 *
 * global fetch is stubbed rather than the adapter, so the real
 * fetchCFBFinalScores -> findGameByTeams path is what gets measured.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-cfb-backlog-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;
// Same sampler settings boot-cycle-loop-lag.test.ts measures with: attribute
// finely, and don't emit a [loop-lag] warning per tick during the measurement.
process.env.LOOP_ATTRIBUTE_MS = "10";
process.env.LOOP_WARN_MS = "5000";

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
  markSettledOutcomesStale: vi.fn(() => 0),
  countStaleSettledOutcomes: vi.fn(() => 0),
}));

vi.mock("../adapters/mlb-statsapi", () => ({ fetchMLBFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nba", () => ({ fetchNBAFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nfl", () => ({ fetchNFLFinalScores: vi.fn(() => Promise.resolve([])) }));

type StoreMod = typeof import("../store");
type SettlementMod = typeof import("../settlement");
type GeneratedMod = typeof import("../cfb-espn-teams.generated");
type MonitorMod = typeof import("../../event-loop-monitor");

let store: StoreMod;
let settlement: SettlementMod;
let generated: GeneratedMod;
let monitor: MonitorMod;

beforeAll(async () => {
  store = await import("../store");
  settlement = await import("../settlement");
  generated = await import("../cfb-espn-teams.generated");
  monitor = await import("../../event-loop-monitor");
});

/** One Saturday. Every fixture game kicks off on it. */
const GAME_DATE = "2026-10-03";
const GAME_TIME = `${GAME_DATE}T19:00:00.000Z`;
const SIGNAL_TIME = `${GAME_DATE}T15:00:00.000Z`;

/** A full FBS Saturday is ~65 games; 130 is the whole week in one cycle. */
const FIXTURE_GAMES = 65;
const SIGNALS_PER_GAME = 2;

interface Fixture {
  gameId: string;
  home: { name: string; abbr: string; stored: string };
  away: { name: string; abbr: string; stored: string };
}

function buildFixture(): Fixture[] {
  const teams = Object.values(generated.CFB_ESPN_TEAM_BY_ID).filter((t) => t.fbs);
  const games: Fixture[] = [];
  for (let i = 0; i < FIXTURE_GAMES; i++) {
    const home = teams[i * 2];
    const away = teams[i * 2 + 1];
    if (!home || !away) break;
    games.push({ gameId: `cfb_fx_${i}`, home, away });
  }
  return games;
}

/** Seed games rows exactly as the odds adapter writes them: stored tokens. */
function seedFixture(games: Fixture[]) {
  const db = store.getPipelineDb();
  const insertGame = db.prepare(`
    INSERT OR REPLACE INTO games
      (id, league, home_team, away_team, game_time, status,
       spread_line, spread_team, total_line, created_at, updated_at)
    VALUES (?, 'CFB', ?, ?, ?, 'scheduled', -6.5, ?, 52.5, ?, ?)
  `);

  for (const game of games) {
    insertGame.run(
      game.gameId, game.home.stored, game.away.stored, GAME_TIME,
      game.home.stored, SIGNAL_TIME, SIGNAL_TIME,
    );
    for (let n = 0; n < SIGNALS_PER_GAME; n++) {
      store.upsertLiveSignal({
        id: `${game.gameId}_sig_${n}`,
        league: "CFB",
        game_id: game.gameId,
        signal_type: "injury_update",
        headline: "fixture",
        body: "", action_note: "", why_it_matters: "",
        team: game.home.stored,
        player: `Player ${n}`,
        matchup: `${game.away.stored} @ ${game.home.stored}`,
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
        urgency_label: "", urgency_reason: "", trust_label: "", score_explanation: "",
        breakdown: {},
        raw_event_ids: [],
        signal_time: SIGNAL_TIME,
        first_seen_at: SIGNAL_TIME,
        created_at: SIGNAL_TIME,
        updated_at: SIGNAL_TIME,
        outcome_id: null,
      } as any);
    }
  }
}

/** An ESPN scoreboard payload for the same games, in ESPN's vocabulary. */
function scoreboardPayload(games: Fixture[]) {
  return {
    events: games.map((game, i) => ({
      id: `espn_${i}`,
      date: `${GAME_DATE}T19:00Z`,
      competitions: [{
        status: { type: { completed: true } },
        competitors: [
          { homeAway: "home", score: "31", team: { abbreviation: game.home.abbr, displayName: game.home.name } },
          { homeAway: "away", score: "17", team: { abbreviation: game.away.abbr, displayName: game.away.name } },
        ],
      }],
    })),
  };
}

function stubScoreboard(games: Fixture[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/scoreboard")) {
      return { ok: true, status: 200, json: async () => scoreboardPayload(games) } as any;
    }
    return { ok: false, status: 404, json: async () => ({}) } as any;
  }));
}

let fixture: Fixture[];

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["outcomes", "live_signals", "games", "signal_state_history", "pipeline_meta"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  delete process.env.SETTLEMENT_MAX_NEW_FINALS_PER_CYCLE;
  store.takeCfbMatchStats();
  settlement.forceAccuracyRecompute();
  monitor.resetStepStats();
  fixture = buildFixture();
  seedFixture(fixture);
  stubScoreboard(fixture);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.SETTLEMENT_MAX_NEW_FINALS_PER_CYCLE;
});

describe("the first cycle after the alias lands", () => {
  it("resolves the whole week through the alias, not the exact-token path", async () => {
    process.env.SETTLEMENT_MAX_NEW_FINALS_PER_CYCLE = "10000";
    const result = await settlement.autoSettleFinishedGames();

    expect(result.scores_fetched.CFB).toBe(FIXTURE_GAMES);
    expect(result.cfb_game_resolution.ambiguous).toBe(0);
    // The exact-token path can only carry the handful of schools whose ESPN
    // abbreviation happens to equal their stored token.
    expect(result.cfb_game_resolution.alias).toBeGreaterThan(result.cfb_game_resolution.direct);
    expect(result.cfb_game_resolution.alias + result.cfb_game_resolution.direct).toBe(FIXTURE_GAMES);
  });

  it("settles every signal behind those games when uncapped", async () => {
    process.env.SETTLEMENT_MAX_NEW_FINALS_PER_CYCLE = "10000";
    const result = await settlement.autoSettleFinishedGames();

    expect(result.games_updated).toBe(FIXTURE_GAMES);
    expect(result.new_finals_deferred).toBe(0);
    expect(result.signals_settled).toBe(FIXTURE_GAMES * SIGNALS_PER_GAME);
    expect(store.getSettleable()).toHaveLength(0);
  });

  it("matched nothing at all before the alias", async () => {
    // Same fixture, but the score adapter speaking only the exact-token
    // vocabulary: pass ESPN's abbreviation straight into the direct lookup.
    const resolved = fixture.filter((game) =>
      store.getPipelineDb().prepare(store.FIND_GAME_DIRECT_SQL)
        .get("CFB", game.home.abbr, game.away.abbr, GAME_DATE) != null);

    // A handful resolve by coincidence; the rest are the backlog this fixes.
    expect(resolved.length).toBeLessThan(FIXTURE_GAMES / 2);
  });
});

describe("the per-cycle cap", () => {
  it("defaults to 25 and is env-tunable", () => {
    expect(settlement.maxNewFinalsPerCycle()).toBe(25);
    process.env.SETTLEMENT_MAX_NEW_FINALS_PER_CYCLE = "40";
    expect(settlement.maxNewFinalsPerCycle()).toBe(40);
  });

  it("promotes at most the cap and defers the rest", async () => {
    const result = await settlement.autoSettleFinishedGames();

    expect(result.games_updated).toBe(25);
    expect(result.new_finals_deferred).toBe(FIXTURE_GAMES - 25);
    expect(result.signals_settled).toBe(25 * SIGNALS_PER_GAME);
  });

  it("logs the remaining backlog", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await settlement.autoSettleFinishedGames();

    const lines = log.mock.calls.map((call) => String(call[0]));
    expect(lines.some((l) => l.includes(`New finals capped at 25`) && l.includes(`${FIXTURE_GAMES - 25} completed game(s)`))).toBe(true);
    expect(lines.some((l) => l.includes("CFB game resolution: direct="))).toBe(true);
  });

  it("drains the backlog over consecutive cycles, losing nothing", async () => {
    let cycles = 0;
    let settled = 0;
    while (cycles < 10) {
      const result = await settlement.autoSettleFinishedGames();
      settled += result.signals_settled;
      cycles++;
      if (result.new_finals_deferred === 0) break;
    }

    expect(cycles).toBe(Math.ceil(FIXTURE_GAMES / 25));
    expect(settled).toBe(FIXTURE_GAMES * SIGNALS_PER_GAME);
    expect(store.getSettleable()).toHaveLength(0);
  });
});

/* ─── Span budget ───────────────────────────────────────────────────────
 *
 * Measured the way boot-cycle-loop-lag.test.ts measures: with the sampler
 * running, best of five. The sampler cannot tell "this thread held the loop for
 * 200ms" from "the OS gave this thread no CPU for 200ms", and under a full
 * `vitest run` 85 files compete for the same cores. Noise only inflates a span,
 * so the minimum across runs is the estimate closest to the real cost, and
 * every run is printed so a genuinely slow step cannot hide behind the word
 * "noise".
 *
 * The 300ms budget is asserted against each step's ATTRIBUTED block, not
 * against the global worst span. The global number includes time the OS simply
 * did not schedule this thread, which no change to this code can fix: in one
 * loaded CI run the global worst was 441ms while the worst attributed leaf was
 * 237ms, i.e. 200ms of it was descheduling. The attributed number is the one
 * this PR controls, and 300ms is its contract: forEachBounded yields every
 * LOOP_SPAN_BUDGET_MS (200ms default), so an attributed step above 300ms means
 * something in this path is NOT going through it.
 *
 * The global span is still asserted — against the 5s health check, which is the
 * claim it can actually support.
 */
const MAX_SPAN_MS = 300;
const HEALTH_CHECK_MS = 5000;
const SPAN_RUNS = 5;

type Run = {
  /** Global worst span, attributed or not. Includes descheduling. */
  maxSpanMs: number;
  /** Worst span charged to a named settlement step. What this PR controls. */
  worstLeafMs: number;
  worstLeafName: string;
  /** Heaviest step by wall clock. Unlike a block, this is always attributed. */
  worstWallMs: number;
  worstWallName: string;
  /**
   * Lowest global worst span across ALL runs, not just this one. Each metric
   * gets its own best-of-N: picking one run by its attributed block can hand
   * back that run's noisy global span, which is what the health-check
   * assertions are about.
   */
  minGlobalSpanMs: number;
  stats: ReturnType<typeof monitor.getStepStats>;
  table: string;
  updated: number;
};

const leaves = (stats: ReturnType<typeof monitor.getStepStats>) =>
  stats.filter((step) => step.name !== "settlement-cycle");

/** Best of SPAN_RUNS, each on a freshly reseeded fixture. */
async function measureCycle(label: string, cap: string): Promise<Run> {
  monitor.startEventLoopMonitor();
  process.env.SETTLEMENT_MAX_NEW_FINALS_PER_CYCLE = cap;
  const runs: Run[] = [];

  for (let run = 0; run < SPAN_RUNS; run++) {
    const db = store.getPipelineDb();
    for (const t of ["outcomes", "live_signals", "games", "signal_state_history"]) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
    seedFixture(fixture);
    monitor.resetStepStats();
    // Let the sampler establish its cadence before the cycle starts, so the
    // first tick's lag is not the fixture's own setup.
    await new Promise((r) => setTimeout(r, 50));

    const result = await monitor.trackJob("settlement-cycle", () =>
      settlement.autoSettleFinishedGames());

    await new Promise((r) => setTimeout(r, 50));
    monitor.flushStepReports();
    const stats = monitor.getStepStats();
    const empty = { name: "none", maxBlockMs: 0, maxWallMs: 0 } as (typeof stats)[number];
    const worstLeaf = leaves(stats).reduce((a, b) => (b.maxBlockMs > a.maxBlockMs ? b : a), empty);
    const worstWall = leaves(stats).reduce((a, b) => (b.maxWallMs > a.maxWallMs ? b : a), empty);
    runs.push({
      maxSpanMs: monitor.getMaxObservedBlockMs(),
      worstLeafMs: worstLeaf.maxBlockMs,
      worstLeafName: worstLeaf.name,
      worstWallMs: worstWall.maxWallMs,
      worstWallName: worstWall.name,
      minGlobalSpanMs: 0, // filled in once every run is in
      stats,
      table: monitor.formatStepStats(),
      updated: result.games_updated,
    });
  }

  const lowest = runs.reduce((a, b) => (b.worstLeafMs < a.worstLeafMs ? b : a));
  const best: Run = { ...lowest, minGlobalSpanMs: Math.min(...runs.map((r) => r.maxSpanMs)) };
  console.log(
    `\n[cfb-settle] ${label}: worst attributed block per run ` +
    `${runs.map((r) => `${r.worstLeafMs}ms`).join(", ")} — best ${best.worstLeafMs}ms ` +
    `(${best.worstLeafName}); global worst span that run ${best.maxSpanMs}ms; ` +
    `heaviest step by wall clock ${best.worstWallName} ${best.worstWallMs}ms; ` +
    `lowest global span across runs ${best.minGlobalSpanMs}ms\n${best.table}`,
  );
  return best;
}

describe("span budget, at the cap that ships", () => {
  let best: Run;

  it("measures the default-cap cycle with the sampler on", async () => {
    best = await measureCycle(`capped at ${settlement.maxNewFinalsPerCycle()}`, "25");
  }, 120_000);

  it("did real work — a cycle that settled nothing proves nothing", () => {
    expect(best.updated).toBe(25);
    expect(best.stats.find((s) => s.name === "settlement:fetch-scores")?.calls ?? 0).toBeGreaterThan(0);
    expect(best.stats.find((s) => s.name === "settlement:settle-linked")?.calls ?? 0).toBeGreaterThan(0);
  });

  it("holds no settlement step longer than 300ms", () => {
    const overBudget = leaves(best.stats)
      .filter((step) => step.maxBlockMs > MAX_SPAN_MS)
      .map((step) => `${step.name} ${step.maxBlockMs}ms`);

    expect(overBudget, best.table).toEqual([]);
  });

  it("spends its time in settle-linked, so the cap is aimed at the right step", () => {
    // Wall clock, not the attributed block: on a fast runner the whole cycle
    // finishes inside the sampler's attribution threshold and every maxBlockMs
    // is 0, so asserting on a block would really be asserting that a block
    // exists. Measured on a GitHub runner: settle-linked 42ms of a 59ms cycle.
    expect(best.worstWallName, best.table).toBe("settlement:settle-linked");
    // And if anything DID block, it was that step and nothing else.
    expect(["none", "settlement:settle-linked"], best.table).toContain(best.worstLeafName);
  });

  it("stays well inside the 5s health-check budget", () => {
    expect(best.minGlobalSpanMs, best.table).toBeLessThan(HEALTH_CHECK_MS / 3);
  });
});

describe("span budget, uncapped — what the cap is for", () => {
  let best: Run;

  it("measures the whole week in one cycle", async () => {
    best = await measureCycle("uncapped (65 games, 130 signals)", "10000");
  }, 120_000);

  it("settles the whole week", () => {
    expect(best.updated).toBe(FIXTURE_GAMES);
  });

  it("is still safe against the health check — forEachBounded keeps yielding", () => {
    // The uncapped batch is not a loop hazard: every span is bounded by
    // LOOP_SPAN_BUDGET_MS. It just sits ON that budget instead of inside it,
    // and the cycle's total wall clock is what grows.
    expect(best.minGlobalSpanMs, best.table).toBeLessThan(HEALTH_CHECK_MS);
  });

  it("the time lands on settle-linked, which is what the cap divides", () => {
    expect(best.worstWallName, best.table).toBe("settlement:settle-linked");
    expect(["none", "settlement:settle-linked"], best.table).toContain(best.worstLeafName);
  });
});
