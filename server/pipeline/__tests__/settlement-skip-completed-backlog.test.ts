import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Regression suite for fix/skip-completed-backlog-migration.
 *
 * runSettlementBacklogMigration is a one-time cleanup. After its first full run
 * it expires nothing new, yet steps 1–2b still re-scanned every null-game signal
 * on every boot (a ~17s event-loop block on prod). The fix persists a completion
 * marker in pipeline_meta and short-circuits the whole body on later boots.
 *
 * This suite proves:
 *   1. The first run sets the marker.
 *   2. A later run with the marker set logs "already complete — skipped", returns
 *      an all-zero result, and performs ZERO candidate reads (never prepares the
 *      null-game candidate scan) — so a freshly-aged backlog signal is left
 *      untouched by the migration (autoSettleFinishedGames handles it per-cycle).
 *
 * Setup mirrors settlement-stale-matches.test.ts.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-skip-backlog-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

const storageStale = new Set<string>();
vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
  markSettledOutcomesStale: vi.fn((ids: string[]) => {
    const before = storageStale.size;
    for (const id of ids) storageStale.add(id);
    return storageStale.size - before;
  }),
  countStaleSettledOutcomes: vi.fn(() => storageStale.size),
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

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

// Signature unique to the Step-1 null-game candidate scan; present in no other
// prepared statement, so a prepare() call carrying it is a "candidate read".
const CANDIDATE_SCAN_SIGNATURE = "settlement_expired = 0";
const DONE_KEY = "settlement_backlog_migration_complete";

function seedBacklogSignal(id: string): string {
  const old = iso(Date.now() - 40 * DAY);
  store.upsertLiveSignal({
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
    signal_time: old,
    first_seen_at: old,
    created_at: old,
    updated_at: old,
    outcome_id: null,
  } as any);
  return id;
}

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["outcomes", "live_signals", "games", "signal_state_history", "pipeline_meta"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  storageStale.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runSettlementBacklogMigration completion marker", () => {
  it("sets the marker after the first full run", async () => {
    expect(store.getPipelineMeta(DONE_KEY)).toBeNull();

    seedBacklogSignal("backlog_sig");
    const first = await settlement.runSettlementBacklogMigration();

    // First run actually scanned and expired the aged backlog signal.
    expect(first.scanned).toBe(1);
    expect(first.expired).toBe(1);
    // Marker is now persisted.
    expect(store.getPipelineMeta(DONE_KEY)).not.toBeNull();
  });

  it("second run with marker set does zero candidate reads and is an all-zero no-op", async () => {
    // First full run sets the marker.
    seedBacklogSignal("backlog_sig_1");
    const first = await settlement.runSettlementBacklogMigration();
    expect(first.scanned).toBe(1);
    expect(store.getPipelineMeta(DONE_KEY)).not.toBeNull();

    // Seed a fresh aged backlog signal that the Step-1 scan WOULD expire — proving
    // the skip path never touches it.
    seedBacklogSignal("backlog_sig_2");
    expect(
      store.getUnsettledSignalsWithoutGameId().map((r: any) => r.id),
    ).toContain("backlog_sig_2");

    // Spy on the live DB handle: capture every prepared SQL on the second run.
    const db = store.getPipelineDb();
    const prepareSpy = vi.spyOn(db, "prepare");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const second = await settlement.runSettlementBacklogMigration();

    // Zero candidate reads: the null-game candidate scan was never prepared.
    const candidateReads = prepareSpy.mock.calls.filter((c) =>
      String(c[0]).includes(CANDIDATE_SCAN_SIGNATURE),
    );
    expect(candidateReads).toHaveLength(0);

    // Logged the skip line.
    expect(
      logSpy.mock.calls.some((c) =>
        String(c[0]).includes("Backlog migration already complete — skipped"),
      ),
    ).toBe(true);

    // All-zero no-op result.
    expect(second).toEqual({
      scanned: 0,
      expired: 0,
      stale_outcomes_flagged: 0,
      stale_outcomes_mirrored: 0,
    });

    // The freshly-aged backlog signal was NOT expired by the skipped migration.
    expect(
      store.getUnsettledSignalsWithoutGameId().map((r: any) => r.id),
    ).toContain("backlog_sig_2");
  });
});
