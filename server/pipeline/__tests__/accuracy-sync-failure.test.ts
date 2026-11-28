// @vitest-environment node
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * #126: syncAccuracyToStorageDb() swallowed every failure (an outer catch that
 * logged and returned {synced: 0}, a per-source catch that only warned), so
 * trackJob("settlement:accuracy-sync") recorded a success when the sync failed
 * and forceAccuracyRecompute() could not tell failure from "nothing to sync".
 *
 * Real pipeline.db and storage.db in a temp dir. Failures are real: the whole
 * sync fails because settled_outcomes is gone; one source fails because its
 * upsert throws.
 */

vi.mock("../adapters/mlb-statsapi", () => ({ fetchMLBFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nba", () => ({ fetchNBAFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-nfl", () => ({ fetchNFLFinalScores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../adapters/espn-cfb", () => ({ fetchCFBFinalScores: vi.fn(() => Promise.resolve([])) }));

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-acc-sync-fail-"));
process.env.DATA_DIR = TMP_DIR;
process.env.PIPELINE_DATA_DIR = TMP_DIR;

let store: typeof import("../store");
let settlement: typeof import("../settlement");
let storage: typeof import("../../storage");
let monitor: typeof import("../../event-loop-monitor");

const AT = "2026-11-01T12:00:00.000Z";
const A = { id: "src_a", name: "Writer A", type: "x" };
const B = { id: "src_b", name: "Writer B", type: "x" };
const C = { id: "src_c", name: "Writer C", type: "x" };

beforeAll(async () => {
  store = await import("../store");
  settlement = await import("../settlement");
  storage = await import("../../storage");
  monitor = await import("../../event-loop-monitor");
});

beforeEach(() => {
  const p = store.getPipelineDb();
  for (const t of ["outcomes", "live_signals", "pipeline_source_accuracy"]) {
    try { p.prepare(`DELETE FROM ${t}`).run(); } catch { /* table created lazily */ }
  }
  const s = storage.getStorageDb();
  s.prepare("DELETE FROM settled_outcomes").run();
  s.prepare("DELETE FROM source_scores").run();
  monitor.resetStepStats();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

let n = 0;
function seedSettled(sources: object[], hit: 0 | 1): void {
  const id = `sig_${++n}`;
  storage.getStorageDb().prepare(`
    INSERT INTO settled_outcomes (id, signal_id, game_id, league, signal_type, sources, hit, clv, recorded_at)
    VALUES (?, ?, 'G1', 'NFL', 'injury_update', ?, ?, 0.5, ?)
  `).run(`so_${id}`, id, JSON.stringify(sources), hit, AT);
}

const scores = () =>
  storage.getStorageDb()
    .prepare("SELECT source_id, source_name, overall_accuracy, draft_accuracy FROM source_scores ORDER BY source_id")
    .all() as Array<{ source_id: string; source_name: string; overall_accuracy: number | null; draft_accuracy: number | null }>;

/** Make the whole sync fail for real: its read of settled_outcomes throws. */
function withSettledOutcomesGone<T>(fn: () => T): T {
  const s = storage.getStorageDb();
  s.prepare("ALTER TABLE settled_outcomes RENAME TO settled_outcomes_hidden").run();
  try { return fn(); } finally {
    s.prepare("ALTER TABLE settled_outcomes_hidden RENAME TO settled_outcomes").run();
  }
}

/** One source's upsert throws; every other source goes through untouched. */
function failUpsertFor(sourceId: string) {
  const real = storage.storage.upsertSourceScore.bind(storage.storage);
  return vi.spyOn(storage.storage, "upsertSourceScore").mockImplementation((data) => {
    if (data.source_id === sourceId) throw new Error(`disk I/O error for ${sourceId}`);
    return real(data);
  });
}

describe("syncAccuracyToStorageDb reports failure instead of swallowing it", () => {
  it("whole-sync failure: ok=false with the error, not a silent {synced: 0}", () => {
    seedSettled([A], 1);
    const res = withSettledOutcomesGone(() => settlement.syncAccuracyToStorageDb());

    expect(res.ok).toBe(false);
    expect(res.synced).toBe(0);
    expect(res.error).toMatch(/settled_outcomes/);
    expect(scores()).toEqual([]);
  });

  it("one source failing among several: ok=false, failed=1, the others still synced", () => {
    seedSettled([A], 1);
    seedSettled([B], 0);
    seedSettled([C], 1);
    failUpsertFor(B.id);

    const res = settlement.syncAccuracyToStorageDb();

    expect(res.ok).toBe(false);
    expect(res.synced).toBe(2);
    expect(res.failed).toBe(1);
    expect(res.error).toBe(`source ${B.id}: disk I/O error for ${B.id}`);
    expect(scores().map((r) => r.source_id)).toEqual([A.id, C.id]);
  });

  it("success: ok=true, nothing failed, and the rows written are what they always were", () => {
    seedSettled([A], 1);
    seedSettled([A], 0);
    seedSettled([B], 1);

    const res = settlement.syncAccuracyToStorageDb();

    expect(res).toEqual({ ok: true, synced: 2, failed: 0, cleared: [], error: null });
    expect(scores()).toEqual([
      { source_id: A.id, source_name: A.name, overall_accuracy: 50, draft_accuracy: 50 },
      { source_id: B.id, source_name: B.name, overall_accuracy: 100, draft_accuracy: 100 },
    ]);
  });

  it("forceAccuracyRecompute tells its caller the sync failed", () => {
    seedSettled([A], 1);
    seedSettled([B], 1);
    failUpsertFor(A.id);

    const res = settlement.forceAccuracyRecompute();

    expect(res.source_scores_sync).toEqual({
      ok: false, synced: 1, failed: 1, error: `source ${A.id}: disk I/O error for ${A.id}`,
    });
  });
});

describe("the settlement cycle records a failed sync as a failed step, and keeps going", () => {
  async function cyclePastDebounce() {
    settlement.forceAccuracyRecompute();             // stamps the debounce clock
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);   // past ACCURACY_DEBOUNCE_MS
    // Ledger stale (accuracyLedgerIsStale: no stored overall row), so the
    // cycle runs compute + sync.
    store.getPipelineDb().prepare("DELETE FROM pipeline_source_accuracy").run();
    monitor.resetStepStats();
    return settlement.autoSettleFinishedGames();
  }
  const step = (name: string) => monitor.getStepStats().find((s) => s.name === name);

  it("one source failing: the cycle resolves, settlement:accuracy-sync has failures=1", async () => {
    seedSettled([A], 1);
    failUpsertFor(A.id);

    const res = await cyclePastDebounce();

    expect(res.signals_settled).toBe(0);
    expect(step("settlement:accuracy-sync")).toMatchObject({ calls: 1, failures: 1 });
    expect(step("settlement:compute-accuracy")).toMatchObject({ calls: 1, failures: 0 });
    // The step after it still ran.
    expect(step("settlement:archive-finished-market")).toMatchObject({ calls: 1, failures: 0 });
  });

  it("success: settlement:accuracy-sync has failures=0", async () => {
    seedSettled([A], 1);

    await cyclePastDebounce();

    expect(step("settlement:accuracy-sync")).toMatchObject({ calls: 1, failures: 0 });
    expect(scores().map((r) => r.source_id)).toEqual([A.id]);
  });
});
