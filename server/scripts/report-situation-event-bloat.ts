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
 * deletes, updates or inserts a row — the situations tables are append-only
 * (BEFORE UPDATE / BEFORE DELETE triggers RAISE(ABORT)), so any real cleanup is
 * a separate, deliberate migration. There is no --write mode here on purpose.
 * It opens the DB through the normal getPipelineDb() path rather than a
 * readonly handle, because a readonly connection cannot attach to a WAL
 * database when no other process holds the -shm file — i.e. exactly when the
 * service is down, which is when you most want this report.
 *
 * What it counts as removable, per situation:
 *   - situation_created events after the first one (a situation is founded
 *     exactly once; the rest are churn),
 *   - snapshots whose lifecycle_state, confidence_score, summary and
 *     escalation_score all match the previous KEPT snapshot — the same test
 *     situations-engine.ts now applies before writing one,
 *   - the snapshot_created event belonging to each of those snapshots.
 * Everything else — real state changes, every evidence event — is kept.
 *
 * Safe for the Render shell: situations are walked in keyset-paginated chunks,
 * and the per-row queries select lengths rather than payload_json itself, so
 * peak memory stays flat no matter how large the tables are.
 *
 * Usage:
 *   npx tsx server/scripts/report-situation-event-bloat.ts
 *   npx tsx server/scripts/report-situation-event-bloat.ts --chunk 500
 *   npx tsx server/scripts/report-situation-event-bloat.ts --league NFL
 */

import { getPipelineDb } from "../pipeline/store";

const DEFAULT_CHUNK = 200;
const TOP_SITUATIONS = 10;

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const chunkSize = Math.max(1, Number(argValue("--chunk") ?? DEFAULT_CHUNK));
const leagueFilter = argValue("--league");

interface SituationRow {
  situation_id: string;
  league: string;
  situation_type: string;
}

interface EventRow {
  situation_id: string;
  event_id: string;
  kind: string;
  snapshot_id: string | null;
  payload_bytes: number;
}

interface SnapshotRow {
  situation_id: string;
  snapshot_id: string;
  lifecycle_state: string;
  confidence_score: number;
  summary: string;
  escalation_score: number;
  payload_bytes: number;
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
  SELECT situation_id, league, situation_type
  FROM situations
  WHERE situation_id > ?
    ${leagueFilter ? "AND league = ?" : ""}
  ORDER BY situation_id ASC
  LIMIT ?
`);

/** length(CAST(x AS BLOB)) is bytes, where length(x) on TEXT would be characters. */
function eventsForChunk(ids: string[]): EventRow[] {
  const placeholders = ids.map(() => "?").join(",");
  return db.prepare(`
    SELECT situation_id,
           event_id,
           kind,
           json_extract(payload_json, '$.snapshot_id') AS snapshot_id,
           length(CAST(payload_json AS BLOB)) AS payload_bytes
    FROM situation_events
    WHERE situation_id IN (${placeholders})
    ORDER BY situation_id ASC, recorded_at ASC, event_id ASC
  `).all(...ids) as EventRow[];
}

function snapshotsForChunk(ids: string[]): SnapshotRow[] {
  const placeholders = ids.map(() => "?").join(",");
  return db.prepare(`
    SELECT situation_id,
           snapshot_id,
           lifecycle_state,
           confidence_score,
           summary,
           escalation_score,
           length(CAST(confidence_json AS BLOB))
             + length(CAST(evidence_event_ids_json AS BLOB))
             + length(CAST(summary AS BLOB)) AS payload_bytes
    FROM situation_snapshots
    WHERE situation_id IN (${placeholders})
    ORDER BY situation_id ASC, created_at ASC, snapshot_id ASC
  `).all(...ids) as SnapshotRow[];
}

function groupRows<T extends { situation_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.situation_id);
    if (bucket) bucket.push(row);
    else grouped.set(row.situation_id, [row]);
  }
  return grouped;
}

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

for (;;) {
  const params = leagueFilter ? [cursor, leagueFilter, chunkSize] : [cursor, chunkSize];
  const page = situationPage.all(...params) as SituationRow[];
  if (page.length === 0) break;

  chunks++;
  cursor = page[page.length - 1].situation_id;
  const ids = page.map((row) => row.situation_id);
  const eventsBySituation = groupRows(eventsForChunk(ids));
  const snapshotsBySituation = groupRows(snapshotsForChunk(ids));

  for (const situation of page) {
    const events = eventsBySituation.get(situation.situation_id) ?? [];
    const snapshots = snapshotsBySituation.get(situation.situation_id) ?? [];

    const counters = emptyCounters();
    counters.situations = 1;
    counters.events_scanned = events.length;
    counters.snapshots_scanned = snapshots.length;

    // Snapshots first: a redundant snapshot also condemns its snapshot_created
    // event, so collect their ids before walking the event log.
    const redundantSnapshotIds = new Set<string>();
    let lastKept: SnapshotRow | null = null;
    for (const snapshot of snapshots) {
      const unchanged = lastKept !== null
        && lastKept.lifecycle_state === snapshot.lifecycle_state
        && lastKept.confidence_score === snapshot.confidence_score
        && lastKept.summary === snapshot.summary
        && Math.round(lastKept.escalation_score) === Math.round(snapshot.escalation_score);

      if (unchanged) {
        redundantSnapshotIds.add(snapshot.snapshot_id);
        counters.snapshots_removable++;
        counters.estimated_bytes_freed += snapshot.payload_bytes;
      } else {
        lastKept = snapshot;
      }
    }

    let seenCreated = false;
    for (const event of events) {
      let removable = false;
      if (event.kind === "situation_created") {
        if (seenCreated) {
          removable = true;
          counters.duplicate_situation_created++;
        }
        seenCreated = true;
      } else if (event.kind === "snapshot_created" && event.snapshot_id && redundantSnapshotIds.has(event.snapshot_id)) {
        removable = true;
        counters.redundant_snapshot_created++;
      }

      if (removable) {
        counters.events_removable++;
        counters.estimated_bytes_freed += event.payload_bytes;
      }
    }

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

worst.sort((a, b) => b.bytes - a.bytes);

const groups = [...byGroup.entries()]
  .map(([key, counters]) => {
    const [league, situation_type] = key.split("|");
    return { league, situation_type, ...counters, estimated_mb_freed: round2(counters.estimated_bytes_freed / 1_048_576) };
  })
  .sort((a, b) => b.estimated_bytes_freed - a.estimated_bytes_freed);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

console.log(JSON.stringify({
  mode: "dry-run",
  deletes_performed: 0,
  generated_at: new Date().toISOString(),
  chunk_size: chunkSize,
  league_filter: leagueFilter,
  totals: { ...totals, estimated_mb_freed: round2(totals.estimated_bytes_freed / 1_048_576) },
  by_group: groups,
  top_situations: worst.slice(0, TOP_SITUATIONS),
}, null, 2));
