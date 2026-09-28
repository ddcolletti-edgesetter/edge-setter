import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import {
  computeUrgency,
  recomputeUrgency,
  GAME_COMPLETED_GRACE_MIN,
} from "../urgency";
import { scoreSignal, type ScoreInputs } from "../scorer";

/**
 * Coverage for fix/stale-market-signals:
 *   • computeUrgency thresholds + game-completed override (pure)
 *   • read-time recompute demotes a finished game's URGENT signal to NOTE
 *   • archiveFinishedMarketSignals retires finished line_moves, keeps scheduled
 *   • the shared urgency function matches scorer.ts on representative inputs
 *
 * Store-backed tests use an isolated pipeline.db (PIPELINE_DATA_DIR set before
 * store import) with ../../storage mocked, mirroring the other pipeline tests.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-stale-market-"));
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

const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

/* ─── Pure computeUrgency ─────────────────────────────────── */

describe("computeUrgency thresholds", () => {
  const base = {
    totalScore: 70,
    ageMinutes: 5,
    minutesToGame: 180 as number | null,
    bettingRelevance: true,
    lineMovementDelta: 0,
    injuryDesignation: null as string | null,
    gameFinal: false,
  };

  it("demotes a final game to NOTE 'Game completed' regardless of score", () => {
    const r = computeUrgency({ ...base, totalScore: 95, gameFinal: true });
    expect(r.label).toBe("NOTE");
    expect(r.reason).toBe("Game completed");
  });

  it("demotes a game well past kickoff (> grace window) to NOTE 'Game completed'", () => {
    const r = computeUrgency({ ...base, totalScore: 95, minutesToGame: -(GAME_COMPLETED_GRACE_MIN + 1) });
    expect(r.label).toBe("NOTE");
    expect(r.reason).toBe("Game completed");
  });

  it("LIVE for a high, fresh score", () => {
    expect(computeUrgency({ ...base, totalScore: 85, ageMinutes: 10 }).label).toBe("LIVE");
  });

  it("URGENT for a strong, recent, betting-relevant signal with the window open", () => {
    expect(computeUrgency({ ...base, totalScore: 70, ageMinutes: 30 }).label).toBe("URGENT");
  });

  it("WATCH for a mid score with the window open", () => {
    expect(computeUrgency({ ...base, totalScore: 50, ageMinutes: 300, bettingRelevance: false }).label).toBe("WATCH");
  });

  it("NOTE (not completed) once the game is in progress but within the grace window", () => {
    // minutesToGame between -grace and +60 → decision window closed, but not
    // 'completed' yet, so it falls through to the low-urgency NOTE, NOT the
    // game-completed NOTE.
    const r = computeUrgency({ ...base, totalScore: 70, minutesToGame: -30 });
    expect(r.label).toBe("NOTE");
    expect(r.reason).not.toBe("Game completed");
  });
});

/* ─── Parity with scorer.ts ───────────────────────────────── */

describe("shared urgency function matches scorer.ts", () => {
  function lineMove(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
    return {
      sport: "NFL" as ScoreInputs["sport"],
      signalType: "line_move",
      verdict: "review",
      confidence: 90,
      sourceTypes: ["sportsbook"],
      sourceLabels: ["Pinnacle"],
      sourceCount: 1,
      confirmationStrength: "Developing",
      isoTimestamp: new Date().toISOString(),
      lineMovementDelta: 3,
      bettingRelevance: true,
      ...overrides,
    };
  }

  const cases: Array<{ name: string; inputs: ScoreInputs; gameTime: string }> = [
    { name: "fresh sharp line move", inputs: lineMove(), gameTime: iso(Date.now() + 3 * HOUR) },
    { name: "stale low-delta move", inputs: lineMove({ confidence: 55, lineMovementDelta: 0.5, isoTimestamp: iso(Date.now() - 8 * HOUR), bettingRelevance: false }), gameTime: iso(Date.now() + 3 * HOUR) },
    { name: "no game time known", inputs: lineMove({ confidence: 70 }), gameTime: "" },
  ];

  for (const c of cases) {
    it(`scoreSignal label equals computeUrgency for: ${c.name}`, () => {
      const now = Date.now();
      const result = scoreSignal(c.inputs, c.gameTime || undefined);
      const ageMinutes = (now - Date.parse(c.inputs.isoTimestamp)) / 60000;
      const minutesToGame = c.gameTime ? (Date.parse(c.gameTime) - now) / 60000 : null;
      const shared = computeUrgency({
        totalScore: result.totalScore,
        ageMinutes,
        minutesToGame,
        bettingRelevance: Boolean(c.inputs.bettingRelevance),
        lineMovementDelta: c.inputs.lineMovementDelta ?? 0,
        injuryDesignation: c.inputs.injuryDesignation,
        gameFinal: false,
      });
      expect(shared.label).toBe(result.urgencyLabel);
    });
  }
});

/* ─── Store-backed: read-time recompute + archive sweep ───── */

type StoreMod = typeof import("../store");
let store: StoreMod;

beforeAll(async () => {
  store = await import("../store");
});

function seedGame(id: string, overrides: Record<string, unknown>): void {
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
  } as any);
}

function seedSignal(id: string, overrides: Record<string, unknown>): void {
  const now = iso(Date.now());
  store.upsertLiveSignal({
    id,
    league: "NFL",
    game_id: null,
    signal_type: "line_move",
    headline: "test",
    body: "",
    action_note: "",
    why_it_matters: "",
    team: "DAL",
    player: null,
    matchup: "NYG @ DAL",
    sources: [{ name: "Pinnacle", type: "sportsbook" }],
    source_count: 1,
    verdict: "review",
    confidence: 80,
    confirmation_strength: "Developing",
    line_movement: { open: -3, current: -6, delta: 3, direction: "down" },
    injury_designation: null,
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: false,
    score: 80,
    score_band: "Strong",
    urgency_label: "URGENT",
    urgency_reason: "stored-at-score-time",
    trust_label: "Developing",
    score_explanation: "",
    breakdown: {},
    raw_event_ids: [],
    signal_time: now,
    first_seen_at: now,
    created_at: now,
    updated_at: now,
    outcome_id: null,
    ...overrides,
  } as any);
}

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["outcomes", "live_signals", "games", "signal_state_history"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  vi.clearAllMocks();
});

describe("read-time urgency recompute", () => {
  it("an URGENT-scored signal whose game is final reads back as NOTE 'Game completed'", () => {
    seedGame("final_game", { status: "final", game_time: iso(Date.now() - HOUR) });
    seedSignal("sig_final", { game_id: "final_game", urgency_label: "URGENT" });

    const [delivered] = store.applyReadTimeUrgency([store.getLiveSignal("sig_final")!]);
    expect(delivered.urgency_label).toBe("NOTE");
    expect(delivered.urgency_reason).toBe("Game completed");

    // Stored row is untouched.
    const stored = store.getLiveSignal("sig_final")!;
    expect(stored.urgency_label).toBe("URGENT");
  });

  it("keeps a live label for a scheduled future game", () => {
    seedGame("future_game", { status: "scheduled", game_time: iso(Date.now() + 3 * HOUR) });
    seedSignal("sig_future", { game_id: "future_game", score: 80 });

    const [delivered] = store.applyReadTimeUrgency([store.getLiveSignal("sig_future")!]);
    expect(delivered.urgency_label).not.toBe("NOTE");
    expect(delivered.urgency_reason).not.toBe("Game completed");
  });
});

describe("archiveFinishedMarketSignals sweep", () => {
  it("retires finished-game line_moves and leaves scheduled ones + non-market types", () => {
    const db = store.getPipelineDb();
    seedGame("final_game", { status: "final", game_time: iso(Date.now() - HOUR) });
    seedGame("old_game", { status: "scheduled", game_time: iso(Date.now() - (GAME_COMPLETED_GRACE_MIN + 60) * 60 * 1000) });
    seedGame("future_game", { status: "scheduled", game_time: iso(Date.now() + 3 * HOUR) });

    seedSignal("lm_final", { game_id: "final_game" });
    seedSignal("lm_old", { game_id: "old_game" });
    seedSignal("lm_future", { game_id: "future_game" });
    // Non-market type on a finished game — must NOT be archived by this sweep.
    seedSignal("injury_final", { game_id: "final_game", signal_type: "injury_update" });
    // Already-archived market signal — no double count.
    seedSignal("lm_already", { game_id: "final_game" });
    db.prepare("UPDATE live_signals SET is_archived = 1 WHERE id = 'lm_already'").run();

    const archived = store.archiveFinishedMarketSignals();
    expect(archived).toBe(2); // lm_final + lm_old only

    const flag = (id: string) =>
      (db.prepare("SELECT is_archived FROM live_signals WHERE id = ?").get(id) as any).is_archived;
    expect(flag("lm_final")).toBe(1);
    expect(flag("lm_old")).toBe(1);
    expect(flag("lm_future")).toBe(0);      // scheduled game — kept
    expect(flag("injury_final")).toBe(0);   // non-market type — kept
  });
});
