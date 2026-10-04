/**
 * Edge Setter — situation_events / situation_snapshots bloat report (DRY RUN)
 *
 * Sizes the cleanup that fix/espn-injury-daily-churn makes unnecessary going
 * forward but does nothing about retroactively. ESPN re-reported every listed
 * NFL injury with a fresh date each day, so the adapter minted a raw_event per
 * listed player per day (per poll before #64). Each one fanned out into a
 * situation_created + snapshot_created event and a near-identical snapshot:
 * situation_events reached ~1.1GB, the worst situations hold 2,500-3,600
 * events, and that is what took /api/v2/situations down and crash-looped #70.
 *
 * This script REPORTS ONLY: every statement it issues is a SELECT. It never
 * deletes, updates or inserts a row. The deletes live in
 * server/pipeline/situation-bloat-cleanup.ts, behind an authenticated admin POST
 * — there is no --write mode here on purpose. It opens the DB through the normal
 * getPipelineDb() path rather than a readonly handle, because a readonly
 * connection cannot attach to a WAL database when no other process holds the -shm
 * file — i.e. exactly when the service is down, which is when you most want this
 * report.
 *
 * WHAT IT COUNTS AS REMOVABLE is not decided here. The rule lives in
 * server/pipeline/situation-bloat-plan.ts and the reads that feed it in
 * situation-bloat-rows.ts, and the cleanup job calls exactly those two modules.
 * That is deliberate: a report and a deleter that each implement "what is
 * removable" are a pair that drifts silently — the report says 1.1GB, the job
 * removes something else, and nobody finds out until the rows are gone. Sharing
 * the code makes "dry-run counts equal real-run counts" true by construction
 * rather than by review, and a test asserts the equality.
 *
 * ORDERING IS ROWID. Earlier revisions of this report walked events by
 * (recorded_at, event_id) and snapshots by (created_at, snapshot_id). Both are
 * arbitrary on exactly the situations this is about: the duplicate rows of a
 * churned situation share one timestamp, and snapshot_id is a content hash, so
 * the tiebreak is a hash comparison. "The first snapshot" and "unchanged vs the
 * last kept" are order-dependent judgements, so an arbitrary order made the
 * report's own answer arbitrary — and made it disagree with whatever order the
 * cleanup happened to use. Both now order by rowid, SQLite's insertion order.
 *
 * ON SNAPSHOT BYTES. estimated_bytes_freed is MEASURED (length(CAST(col AS
 * BLOB)) per row), never modelled, so it does not assume the snapshot payload
 * grows with snapshot count — and it must not, because it does not. The engine
 * appends to the previous snapshot's evidence_event_ids
 * (situations-engine.ts), but getLatestSituationSnapshot resolves "previous" as
 * ORDER BY created_at DESC, snapshot_id ASC, and snapshot_id is a content hash.
 * When a situation's snapshots share one created_at — which is what repeated
 * polling of a single static ESPN report produces — the tiebreak picks the
 * lexicographically smallest hash rather than the row just written, so each new
 * snapshot re-forks from a short ancestor instead of extending the chain. The
 * list's length is then the count of running-minimum hashes, i.e. ~H(n) ≈ ln n,
 * not n: sit_a412cf2fd624c10bb9d80810 holds 1,803 snapshots whose longest
 * evidence_event_ids is 9 entries / 271 bytes, and 406KB of snapshot payload in
 * total. The reclaim here is dominated by situation_events.payload_json (a full
 * normalized_event per row), not by snapshots.
 *
 * Safe for the Render shell: situations are walked in keyset-paginated chunks,
 * and the per-row queries select lengths rather than payload_json itself, so
 * peak memory stays flat no matter how large the tables are.
 *
 * Usage:
 *   npx tsx server/scripts/report-situation-event-bloat.ts
 *   npx tsx server/scripts/report-situation-event-bloat.ts --chunk 500
 *   npx tsx server/scripts/report-situation-event-bloat.ts --league NFL
 *   npx tsx server/scripts/report-situation-event-bloat.ts --league NFL --type roster
 */

import { computeSituationCleanupPlan } from "../pipeline/situation-bloat-plan";
import {
  readBloatPlanEvents,
  readBloatPlanSnapshots,
  unthrottledPlanReads,
} from "../pipeline/situation-bloat-rows";
import { getPipelineDb } from "../pipeline/store";

const DEFAULT_CHUNK = 200;
const TOP_SITUATIONS = 10;

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const chunkSize = Math.max(1, Number(argValue("--chunk") ?? DEFAULT_CHUNK));
const leagueFilter = argValue("--league");
/** Mirrors the cleanup job's optional `type`, so a dry run can scope to what a run will. */
const typeFilter = argValue("--type");

interface SituationRow {
  situation_id: string;
  league: string;
  situation_type: string;
  created_from_event_id: string | null;
}

interface Counters {
  situations: number;
  events_scanned: number;
  events_removable: number;
  duplicate_situation_created: number;
  redundant_snapshot_created: number;
  snapshots_scanned: number;
  snapshots_removable: number;
  estimated_bytes_freed: number;
  /** Keeper resolved from situations.created_from_event_id (the good case). */
  keep_key_from_created_from_event_id: number;
  /** created_from_event_id is set but no founding row carries it. */
  keep_key_fallback_no_match: number;
  /** created_from_event_id is NULL on the situation. */
  keep_key_fallback_no_created_from: number;
  /**
   * Situations where the founder is NOT the earliest founding row — i.e. where
   * the old "keep the first row" rule would have deleted the founder. Prod
   * measured 450 of these on 2026-10-02.
   */
  keep_key_founder_not_earliest: number;
}

function emptyCounters(): Counters {
  return {
    situations: 0,
    events_scanned: 0,
    events_removable: 0,
    duplicate_situation_created: 0,
    redundant_snapshot_created: 0,
    snapshots_scanned: 0,
    snapshots_removable: 0,
    estimated_bytes_freed: 0,
    keep_key_from_created_from_event_id: 0,
    keep_key_fallback_no_match: 0,
    keep_key_fallback_no_created_from: 0,
    keep_key_founder_not_earliest: 0,
  };
}

function addInto(target: Counters, source: Counters): void {
  target.situations += source.situations;
  target.events_scanned += source.events_scanned;
  target.events_removable += source.events_removable;
  target.duplicate_situation_created += source.duplicate_situation_created;
  target.redundant_snapshot_created += source.redundant_snapshot_created;
  target.snapshots_scanned += source.snapshots_scanned;
  target.snapshots_removable += source.snapshots_removable;
  target.estimated_bytes_freed += source.estimated_bytes_freed;
  target.keep_key_from_created_from_event_id += source.keep_key_from_created_from_event_id;
  target.keep_key_fallback_no_match += source.keep_key_fallback_no_match;
  target.keep_key_fallback_no_created_from += source.keep_key_fallback_no_created_from;
  target.keep_key_founder_not_earliest += source.keep_key_founder_not_earliest;
}

const db = getPipelineDb();

const tables = new Set(
  (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>)
    .map((row) => row.name),
);
for (const required of ["situations", "situation_events", "situation_snapshots"]) {
  if (!tables.has(required)) {
    console.log(JSON.stringify({ error: `missing table: ${required}`, mode: "dry-run" }));
    process.exit(1);
  }
}

// Keyset pagination on the primary key: no OFFSET scan, stable under concurrent
// appends, and the page is the only thing ever held in memory.
const situationPage = db.prepare(`
  SELECT situation_id, league, situation_type, created_from_event_id
  FROM situations
  WHERE situation_id > ?
    ${leagueFilter ? "AND league = ?" : ""}
    ${typeFilter ? "AND situation_type = ?" : ""}
  ORDER BY situation_id ASC
  LIMIT ?
`);

const byGroup = new Map<string, Counters>();
const totals = emptyCounters();
const worst: Array<{ situation_id: string; league: string; situation_type: string; removable_events: number; removable_snapshots: number; bytes: number }> = [];

function recordWorst(entry: typeof worst[number]): void {
  if (entry.bytes <= 0) return;
  worst.push(entry);
  if (worst.length > TOP_SITUATIONS * 4) {
    worst.sort((a, b) => b.bytes - a.bytes);
    worst.length = TOP_SITUATIONS;
  }
}

let cursor = "";
let chunks = 0;

/**
 * This is a CLI script, so nothing here is racing a health check and the reads are
 * unthrottled. It still goes through the SAME paginated readers as the job — one
 * situation at a time, same SQL, same rowid ordering — so the report cannot drift
 * from what the job will do, and it inherits the cheaper octet_length /
 * kind-guarded json_extract select (measured 2.9x on a mixed table).
 */
const readController = unthrottledPlanReads();

async function walk(): Promise<void> {
for (;;) {
  const params: unknown[] = [cursor];
  if (leagueFilter) params.push(leagueFilter);
  if (typeFilter) params.push(typeFilter);
  params.push(chunkSize);

  const page = situationPage.all(...params) as SituationRow[];
  if (page.length === 0) break;

  chunks++;
  cursor = page[page.length - 1].situation_id;

  for (const situation of page) {
    const events = await readBloatPlanEvents(db, situation.situation_id, readController);
    const snapshots = await readBloatPlanSnapshots(db, situation.situation_id, readController);

    // The one and only definition of removable — shared verbatim with the job.
    const plan = computeSituationCleanupPlan({
      situationId: situation.situation_id,
      createdFromEventId: situation.created_from_event_id,
      events,
      snapshots,
    });

    const counters = emptyCounters();
    counters.situations = 1;
    counters.events_scanned = events.length;
    counters.snapshots_scanned = snapshots.length;
    counters.events_removable = plan.deleteEventIds.length;
    counters.duplicate_situation_created = plan.duplicateFoundingCount;
    counters.redundant_snapshot_created = plan.redundantSnapshotEventCount;
    counters.snapshots_removable = plan.deleteSnapshotIds.length;
    counters.estimated_bytes_freed = plan.bytes;
    if (plan.keepKeySource === "created_from_event_id") counters.keep_key_from_created_from_event_id = 1;
    else if (plan.keepKeySource === "earliest_no_match") counters.keep_key_fallback_no_match = 1;
    else if (plan.keepKeySource === "earliest_no_created_from") counters.keep_key_fallback_no_created_from = 1;
    if (plan.founderNotEarliest) counters.keep_key_founder_not_earliest = 1;

    const key = `${situation.league}|${situation.situation_type}`;
    const bucket = byGroup.get(key) ?? emptyCounters();
    addInto(bucket, counters);
    byGroup.set(key, bucket);
    addInto(totals, counters);

    recordWorst({
      situation_id: situation.situation_id,
      league: situation.league,
      situation_type: situation.situation_type,
      removable_events: counters.events_removable,
      removable_snapshots: counters.snapshots_removable,
      bytes: counters.estimated_bytes_freed,
    });
  }

  if (chunks % 25 === 0) {
    console.error(`[bloat-report] scanned ${totals.situations} situations (${chunks} chunks)…`);
  }
}
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Walk, then emit. Not top-level await: tsc's module target does not allow it. */
walk().then(() => {
  worst.sort((a, b) => b.bytes - a.bytes);

  const groups = [...byGroup.entries()]
    .map(([key, counters]) => {
      const [league, situation_type] = key.split("|");
      return { league, situation_type, ...counters, estimated_mb_freed: round2(counters.estimated_bytes_freed / 1_048_576) };
    })
    .sort((a, b) => b.estimated_bytes_freed - a.estimated_bytes_freed);

  console.log(JSON.stringify({
    mode: "dry-run",
    deletes_performed: 0,
    generated_at: new Date().toISOString(),
    chunk_size: chunkSize,
    league_filter: leagueFilter,
    type_filter: typeFilter,
    totals: { ...totals, estimated_mb_freed: round2(totals.estimated_bytes_freed / 1_048_576) },
    by_group: groups,
    top_situations: worst.slice(0, TOP_SITUATIONS),
  }, null, 2));
}).catch((err: unknown) => {
  console.error("[bloat-report] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
