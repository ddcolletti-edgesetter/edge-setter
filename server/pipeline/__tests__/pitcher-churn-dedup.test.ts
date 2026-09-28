import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Regression for the probable-pitcher churn fix (fix/pitcher-churn-and-indexes).
 *
 * Old behaviour: ingestProbablePitchers deduped only against UNPROCESSED raw
 * events, so once the processor drained the queue it re-inserted a lineup_confirm
 * raw event for every probable pitcher every cycle. Each re-insert ran the full
 * processOne fan-out (upsertLiveSignal + insertSignalDetection + canonical
 * situation_events/snapshots/history + raw_event_ids growth) — the main storage
 * growth driver.
 *
 * New behaviour: a known game/team/pitcher combo (a lineup_confirm raw event
 * already exists, processed or not) does NOT re-insert; it only bumps the derived
 * live signal's updated_at, located via the SAME findExistingSignal fingerprint
 * lookup the processor uses. A genuinely new combo still inserts a raw event.
 *
 * Setup mirrors injury-dedup-window.test.ts: PIPELINE_DATA_DIR is redirected to a
 * throwaway dir before store.ts is imported, and ../../storage is mocked so the
 * real app DB is never opened. global.fetch is stubbed so fetchProbablePitchers
 * returns a controlled schedule.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-pitcher-churn-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { recordSignalStateTransition: vi.fn() },
}));

type StoreMod = typeof import("../store");
type AdapterMod = typeof import("../adapters/mlb-statsapi");
type CanonicalMod = typeof import("../canonical-game-id");

let store: StoreMod;
let adapter: AdapterMod;
let canonicalGameId: CanonicalMod["canonicalGameId"];

const HOUR_MS = 60 * 60 * 1000;

// Home NYY (id 147), Away BOS (id 111). One probable pitcher on the home side.
const GAME_DATE = `${new Date().toISOString().slice(0, 10)}T18:00:00Z`;
const HOME = "NYY";
const AWAY = "BOS";
const PITCHER = "Gerrit Cole";
let GAME_ID: string;

function scheduleWithPitcher() {
  return {
    dates: [{
      date: GAME_DATE.slice(0, 10),
      games: [{
        gameDate: GAME_DATE,
        teams: {
          home: { team: { id: 147 }, probablePitcher: { fullName: PITCHER } },
          away: { team: { id: 111 }, probablePitcher: null },
        },
      }],
    }],
  };
}

/** Stub global.fetch to return the given schedule JSON for any request. */
function stubFetch(payload: unknown) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: { get: () => null },
  })) as any;
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

/** Seed the today's-schedule game row so getGame(p.game_id) resolves. */
function seedGame() {
  store.upsertGame({
    id: GAME_ID,
    league: "MLB",
    home_team: HOME,
    away_team: AWAY,
    game_time: GAME_DATE,
    status: "scheduled",
    spread_line: null, spread_team: null, total_line: null,
    moneyline_home: null, moneyline_away: null,
    open_spread: null, open_total: null,
    home_score: null, away_score: null,
    source_game_id: "12345",
  } as any);
}

/** Seed a lineup_confirm live signal the fingerprint lookup will find. */
function seedPitcherSignal(createdAt: string, updatedAt: string): string {
  const id = `seed_pitcher_${createdAt}`;
  store.upsertLiveSignal({
    id,
    league: "MLB",
    game_id: GAME_ID,
    signal_type: "lineup_confirm",
    headline: "seeded",
    body: "", action_note: "", why_it_matters: "",
    team: HOME,
    player: PITCHER,
    matchup: `${AWAY} @ ${HOME}`,
    sources: [{ name: "MLB StatsAPI", type: "league_api" }],
    source_count: 1,
    verdict: "confirmed",
    confidence: 90,
    confirmation_strength: "Consensus",
    line_movement: null,
    injury_designation: null,
    lineup_status: "confirmed",
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: true,
    score: 70, score_band: "Strong",
    urgency_label: "", urgency_reason: "", trust_label: "",
    score_explanation: "", breakdown: {},
    raw_event_ids: [],
    signal_time: createdAt,
    first_seen_at: createdAt,
    created_at: createdAt,
    updated_at: updatedAt,
    outcome_id: null,
  } as any);
  // upsertLiveSignal stamps updated_at from the row we pass, but re-assert it so
  // the "before" value is exactly what we control (the insert path used it as-is).
  store.getPipelineDb().prepare(`UPDATE live_signals SET updated_at=? WHERE id=?`).run(updatedAt, id);
  return id;
}

beforeAll(async () => {
  store = await import("../store");
  adapter = await import("../adapters/mlb-statsapi");
  ({ canonicalGameId } = await import("../canonical-game-id"));
  GAME_ID = canonicalGameId("MLB", GAME_DATE, AWAY, HOME);
});

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["live_signals", "signal_state_history", "signal_detections", "raw_events", "games"]) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch { /* table may not exist yet */ }
  }
  vi.clearAllMocks();
  seedGame();
});

afterAll(() => {
  try { store.getPipelineDb().close(); } catch { /* already closed */ }
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("ingestProbablePitchers churn dedup", () => {
  it("new game/team/pitcher combo → inserts a raw event", async () => {
    stubFetch(scheduleWithPitcher());

    const res = await adapter.ingestProbablePitchers();

    expect(res.created).toBe(1);
    expect(res.refreshed).toBe(0);

    const raws = store.getRawEvents({ league: "MLB" }).filter(e => e.event_type === "lineup_confirm");
    expect(raws).toHaveLength(1);
    expect(raws[0].player).toBe(PITCHER);
    expect(store.lineupConfirmRawEventExists(GAME_ID, HOME, PITCHER)).toBe(true);
  });

  it("existing combo → no raw insert, and the existing signal's updated_at is bumped", async () => {
    // A lineup_confirm raw event already exists for the combo (existence check
    // keys on it, processed or not), plus the derived signal created 1h ago.
    store.insertRawEvent({
      source_id: "mlb_statsapi", source_type: "api", league: "MLB",
      game_id: GAME_ID, team: HOME, player: PITCHER,
      event_type: "lineup_confirm", payload: { pitcher_matchup: true },
    } as any);
    const before = isoHoursAgo(3);
    const signalId = seedPitcherSignal(isoHoursAgo(1), before);

    stubFetch(scheduleWithPitcher());
    const res = await adapter.ingestProbablePitchers();

    // No new raw event; the pre-seeded one is still the only lineup_confirm row.
    expect(res.created).toBe(0);
    expect(res.refreshed).toBe(1);
    const raws = store.getRawEvents({ league: "MLB" }).filter(e => e.event_type === "lineup_confirm");
    expect(raws).toHaveLength(1);

    // updated_at moved forward; nothing else changed (score untouched).
    const after = store.getLiveSignal(signalId)!;
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before).getTime());
    expect(after.score).toBe(70);
  });

  it("existing raw but signal aged out of the 4h window → no insert, nothing refreshed", async () => {
    store.insertRawEvent({
      source_id: "mlb_statsapi", source_type: "api", league: "MLB",
      game_id: GAME_ID, team: HOME, player: PITCHER,
      event_type: "lineup_confirm", payload: { pitcher_matchup: true },
    } as any);
    // Signal created 6h ago — outside the 4h fingerprint window, so findExistingSignal
    // returns null (exactly as processOne would). We still must not re-insert.
    seedPitcherSignal(isoHoursAgo(6), isoHoursAgo(6));

    stubFetch(scheduleWithPitcher());
    const res = await adapter.ingestProbablePitchers();

    expect(res.created).toBe(0);
    expect(res.refreshed).toBe(0);
    const raws = store.getRawEvents({ league: "MLB" }).filter(e => e.event_type === "lineup_confirm");
    expect(raws).toHaveLength(1);
  });
});
