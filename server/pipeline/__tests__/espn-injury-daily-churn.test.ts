import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Regression for the ESPN NFL daily injury churn (fix/espn-injury-daily-churn).
 *
 * ESPN re-reports an UNCHANGED injury with a new `inj.date` every day, so the
 * old dedup key (player + designation + date day) never matched the prior row
 * and minted one raw_event per listed player per day — ~150/day, and one per
 * poll before #64. Each one fanned out into situation_created +
 * snapshot_created events and a near-identical snapshot: situation_events grew
 * to ~1.1GB (worst situations 2,500-3,600 events), which took
 * /api/v2/situations down and crash-looped #70.
 *
 * Two independent guards are locked in here:
 *   1. the adapter keys dedup on the player's CURRENT state (latest stored
 *      designation + team), so a date bump alone is not news, and
 *   2. the situation engine refuses to re-found a situation or to write a
 *      snapshot that says exactly what the last one said.
 *
 * Setup mirrors pitcher-churn-dedup.test.ts: PIPELINE_DATA_DIR is redirected to
 * a throwaway dir BEFORE store.ts is imported, ../../storage is mocked so the
 * real app DB is never opened, and global.fetch is stubbed with a controlled
 * ESPN payload.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-espn-injury-churn-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { recordSignalStateTransition: vi.fn() },
}));

type StoreMod = typeof import("../store");
type AdapterMod = typeof import("../adapters/espn-nfl");
type EngineMod = typeof import("../situations-engine");
type SituationsStoreMod = typeof import("../situations-store");
type ContractMod = typeof import("../situations-contract");
type ConfidenceMod = typeof import("../situations-confidence");

let store: StoreMod;
let adapter: AdapterMod;
let engine: EngineMod;
let situationsStore: SituationsStoreMod;

const DAY_MS = 24 * 60 * 60 * 1000;
const PLAYER = "Aaron Donald";
const TEAM = "LAR";

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

interface FeedRow {
  player?: string;
  team?: string;
  status: string;
  date: string;
}

/** One ESPN /injuries response in its real grouped-by-team shape. */
function injuryFeed(rows: FeedRow[]) {
  return {
    injuries: rows.map((row) => ({
      abbreviation: row.team ?? TEAM,
      displayName: "Los Angeles Rams",
      injuries: [{
        date: row.date,
        status: row.status,
        athlete: {
          displayName: row.player ?? PLAYER,
          position: { abbreviation: "DT" },
        },
      }],
    })),
  };
}

function stubFetch(payload: unknown) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: { get: () => null },
  })) as any;
}

/** Every NFL injury raw event on record, oldest first. */
function injuryRawEvents() {
  return store.getRawEvents({ league: "NFL" })
    .filter((event) => event.event_type === "injury_update")
    .sort((left, right) => left.received_at.localeCompare(right.received_at));
}

beforeAll(async () => {
  store = await import("../store");
  adapter = await import("../adapters/espn-nfl");
  engine = await import("../situations-engine");
  situationsStore = await import("../situations-store");
});

beforeEach(() => {
  const db = store.getPipelineDb();
  situationsStore.ensureSituationSchema(db);
  for (const table of ["raw_events", "situations", "situation_events", "situation_snapshots", "situation_confidence_history", "situation_state_history"]) {
    try { db.prepare(`DELETE FROM ${table}`).run(); } catch { /* table may not exist yet */ }
  }
  vi.clearAllMocks();
});

afterAll(() => {
  try { store.getPipelineDb().close(); } catch { /* already closed */ }
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("ESPN NFL injury ingestion dedup", () => {
  it("skips a daily date bump that carries the same designation", async () => {
    stubFetch(injuryFeed([{ status: "Questionable", date: daysAgo(2) }]));
    const first = await adapter.ingestNFLInjuries();
    expect(first.created).toBe(1);

    // Same injury, same designation, ESPN's date rolled forward a day. This is
    // the ~150/day churn: pre-fix it inserted a second raw event.
    stubFetch(injuryFeed([{ status: "Questionable", date: daysAgo(1) }]));
    const second = await adapter.ingestNFLInjuries();

    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.diagnostics.rows_skipped_unchanged).toBe(1);
    expect(injuryRawEvents()).toHaveLength(1);
  });

  it("stays deduped across many consecutive days of re-reports", async () => {
    stubFetch(injuryFeed([{ status: "IR", date: daysAgo(10) }]));
    await adapter.ingestNFLInjuries();

    // A season-long IR listing re-reported every day — the sit_a412cf2f… shape.
    for (let day = 9; day >= 1; day--) {
      stubFetch(injuryFeed([{ status: "IR", date: daysAgo(day) }]));
      const run = await adapter.ingestNFLInjuries();
      expect(run.created).toBe(0);
    }

    expect(injuryRawEvents()).toHaveLength(1);
  });

  it("creates a new raw event when the designation changes", async () => {
    stubFetch(injuryFeed([{ status: "Questionable", date: daysAgo(2) }]));
    await adapter.ingestNFLInjuries();

    // Questionable → Out is real news, even though only the status moved.
    stubFetch(injuryFeed([{ status: "Out", date: daysAgo(1) }]));
    const second = await adapter.ingestNFLInjuries();

    expect(second.created).toBe(1);
    const events = injuryRawEvents();
    expect(events).toHaveLength(2);
    expect(events.map((event) => (event.payload as any).designation)).toEqual(["Questionable", "OUT"]);
  });

  it("creates a new raw event when the player changes team", async () => {
    stubFetch(injuryFeed([{ status: "Questionable", date: daysAgo(2) }]));
    await adapter.ingestNFLInjuries();

    stubFetch(injuryFeed([{ status: "Questionable", team: "SF", date: daysAgo(1) }]));
    const second = await adapter.ingestNFLInjuries();

    expect(second.created).toBe(1);
    expect(injuryRawEvents().map((event) => event.team)).toEqual([TEAM, "SF"]);
  });

  it("de-dupes a player listed twice inside one payload", async () => {
    stubFetch(injuryFeed([
      { status: "Questionable", date: daysAgo(2) },
      { status: "Questionable", date: daysAgo(2) },
    ]));
    const run = await adapter.ingestNFLInjuries();

    expect(run.created).toBe(1);
    expect(injuryRawEvents()).toHaveLength(1);
  });

  it("stamps received_at with arrival time and keeps ESPN's date in the payload", async () => {
    const espnDate = daysAgo(2);
    const before = Date.now();
    stubFetch(injuryFeed([{ status: "Questionable", date: espnDate }]));
    await adapter.ingestNFLInjuries();
    const after = Date.now();

    const [event] = injuryRawEvents();
    const receivedMs = Date.parse(event.received_at);

    // Arrival time — not ESPN's report date, which used to be written here via
    // { eventTime } and backdated the row the pipeline orders and ages by.
    expect(receivedMs).toBeGreaterThanOrEqual(before);
    expect(receivedMs).toBeLessThanOrEqual(after);
    expect(Date.parse(event.created_at)).toBeGreaterThanOrEqual(before);
    expect(receivedMs).toBeGreaterThan(Date.parse(espnDate));

    // ESPN's timestamp is preserved where situations-adapter reads occurred_at.
    expect((event.payload as any).occurred_at).toBe(espnDate);
    expect((event.payload as any).event_time).toBe(espnDate);
  });

  it("serves the dedup lookup from idx_raw_events_source_player", () => {
    const plan = store.getPipelineDb()
      .prepare(`EXPLAIN QUERY PLAN ${adapter.LATEST_NFL_INJURY_SQL}`)
      .all(PLAYER) as Array<{ detail: string }>;
    const detail = plan.map((row) => row.detail).join(" | ");

    expect(detail).toContain("idx_raw_events_source_player");
    // A full table scan here is the ~21s cold-boot stall #64 fixed.
    expect(detail).not.toContain("SCAN raw_events");
  });
});

describe("canonical situation engine churn guards", () => {
  const OCCURRED_AT = "2026-09-30T17:00:00.000Z";

  function normalizedEvent(sequence: number): ContractMod["NormalizedEvent"] {
    return {
      normalized_event_id: `ne_churn_${sequence}`,
      raw_event_id: `raw_churn_${sequence}`,
      source_id: "espn",
      source_type: "api",
      sport: "football",
      league: "NFL",
      game_id: "nfl_2026_lar_sf",
      teams: [TEAM],
      players: [PLAYER],
      event_type: "injury_update",
      situation_type: "injury",
      semantic_fingerprint: "injury|lar|aaron donald|questionable",
      occurred_at: OCCURRED_AT,
      received_at: OCCURRED_AT,
      summary: `${PLAYER} (${TEAM}) listed Questionable.`,
      payload: { designation: "Questionable" },
    } as ContractMod["NormalizedEvent"];
  }

  /**
   * Point-valued factors on the same scale confidenceInputFromRawEvent emits
   * (source_reliability caps at 22, official_confirmation at 20, …) — an
   * ESPN-shaped injury report. Fraction-scaled values would score ~3 and be
   * filtered out of the match candidates by isUsableSituation's confidence
   * floor, so the situation would never match itself.
   */
  function confidenceInput(): ConfidenceMod["SituationConfidenceInput"] {
    return {
      source_reliability: 18,
      independent_confirmations: 6,
      market_alignment: 0,
      validator_agreement: 8,
      official_confirmation: 8,
      freshness: 12,
      contradiction_penalty: 0,
      computed_at: OCCURRED_AT,
      situation_type: "injury",
    } as ConfidenceMod["SituationConfidenceInput"];
  }

  function eventKinds(situationId: string): string[] {
    return situationsStore.listSituationEvents(situationId).map((event) => event.kind);
  }

  it("re-delivering the same observation writes one situation_created and one snapshot", () => {
    // Three physically distinct raw events (new ids each time, as a re-poll or
    // a daily re-report produces) carrying an identical observation.
    const first = engine.evolveCanonicalSituation({ event: normalizedEvent(1), confidence_input: confidenceInput() });
    const second = engine.evolveCanonicalSituation({ event: normalizedEvent(2), confidence_input: confidenceInput() });
    const third = engine.evolveCanonicalSituation({ event: normalizedEvent(3), confidence_input: confidenceInput() });

    // All three land on one situation.
    expect(first.matched).toBe(false);
    expect(second.matched).toBe(true);
    expect(third.matched).toBe(true);
    const situationId = first.situation.situation_id;
    expect(second.situation.situation_id).toBe(situationId);
    expect(third.situation.situation_id).toBe(situationId);

    const kinds = eventKinds(situationId);
    expect(kinds.filter((kind) => kind === "situation_created")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "snapshot_created")).toHaveLength(1);
    // Evidence is still recorded for every delivery — only the restatements go.
    expect(kinds.filter((kind) => kind === "situation_matched")).toHaveLength(2);

    expect(situationsStore.listSituationSnapshots(situationId)).toHaveLength(1);
    // Callers still get the situation's live state when nothing moved.
    expect(third.snapshot.snapshot_id).toBe(first.snapshot.snapshot_id);
  });

  it("still writes a snapshot when the state actually moves", () => {
    const first = engine.evolveCanonicalSituation({ event: normalizedEvent(1), confidence_input: confidenceInput() });
    const situationId = first.situation.situation_id;

    // Same situation, stronger corroboration: confidence and the summary move,
    // so this is a new chapter and must be snapshotted.
    const escalated = engine.evolveCanonicalSituation({
      event: {
        ...normalizedEvent(2),
        summary: `${PLAYER} (${TEAM}) ruled OUT.`,
      } as ContractMod["NormalizedEvent"],
      confidence_input: {
        ...confidenceInput(),
        independent_confirmations: 18,
        official_confirmation: 20,
      } as ConfidenceMod["SituationConfidenceInput"],
    });

    expect(escalated.matched).toBe(true);
    expect(escalated.situation.situation_id).toBe(situationId);
    expect(escalated.snapshot.snapshot_id).not.toBe(first.snapshot.snapshot_id);

    const snapshots = situationsStore.listSituationSnapshots(situationId);
    expect(snapshots).toHaveLength(2);
    expect(eventKinds(situationId).filter((kind) => kind === "snapshot_created")).toHaveLength(2);
    // The chain still links the new snapshot to the one it replaces.
    expect(snapshots[1].previous_snapshot_hash).toBe(snapshots[0].replay_hash);
  });

  it("keeps every written snapshot replay-verifiable", async () => {
    const { verifySituationSnapshotIntegrity } = await import("../situations-snapshot");
    const first = engine.evolveCanonicalSituation({ event: normalizedEvent(1), confidence_input: confidenceInput() });
    engine.evolveCanonicalSituation({ event: normalizedEvent(2), confidence_input: confidenceInput() });

    const snapshots = situationsStore.listSituationSnapshots(first.situation.situation_id);
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every(verifySituationSnapshotIntegrity)).toBe(true);
  });
});
