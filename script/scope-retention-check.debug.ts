/**
 * SCRATCH DEBUG. READ-ONLY. Sanity check for the Part 3 fired-pairs plateau.
 *
 * Observation to explain: in scope-weight-budget.debug.ts Part 3, fired pairs
 * plateaued at ~523 by situation #800 (injury situations ordered created_at DESC)
 * and did NOT increase across the remaining ~1176 older situations.
 *
 * Hypothesis: RSS raw_events retention doesn't reach as far back as the oldest
 * injury situations, so those older situations have NO candidate events inside
 * their +/-72h window and can never fire. That is retention, not a bug.
 *
 * This script prints the evidence to confirm-or-refute, mirroring the EXACT scan
 * ordering (injury, created_at DESC) and the EXACT candidate filter
 * (source_id LIKE 'rss_%_official' AND event_type='injury_update') from Part 3.
 *
 * VERDICT RULE (printed at the end):
 *   - If the earliest rss injury_update event is NEWER than (situation #1976
 *     created_at MINUS 72h), then older situations genuinely have no candidate in
 *     window  ->  plateau is RETENTION (expected).
 *   - If rss coverage extends further back than that and pairs still don't fire,
 *     that's a REAL BUG to investigate before proceeding.
 *
 *   npx tsx script/scope-retention-check.debug.ts /var/data/pipeline.db
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

const WINDOW_HOURS = 72;

function resolveDbPath(): string {
  const arg = process.argv[2];
  if (arg) return arg;
  for (const dir of [process.env.PIPELINE_DATA_DIR, process.env.DATA_DIR, "/var/data", "."]) {
    if (!dir) continue;
    const p = path.join(dir, "pipeline.db");
    if (fs.existsSync(p)) return p;
  }
  return "pipeline.db";
}

function main() {
  const dbPath = resolveDbPath();
  console.log(`DB (read-only): ${dbPath}`);
  if (!fs.existsSync(dbPath)) { console.log("ERROR: no db at that path"); return; }
  const db = new Database(dbPath, { readonly: true });
  const hasTable = (t: string) =>
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t) !== undefined;
  if (!hasTable("raw_events") || !hasTable("situations")) {
    console.log("ERROR: need raw_events AND situations (prod /var/data/pipeline.db)."); db.close(); return;
  }

  // ── Scan order, identical to Part 3: injury situations, created_at DESC. ──
  // Pull only created_at ordered; index i (1-based) = the i-th situation the scan sees.
  const injuryCreatedAt = db.prepare(
    `SELECT created_at FROM situations WHERE situation_type='injury' ORDER BY created_at DESC`,
  ).all().map((r: any) => r.created_at as string);
  const total = injuryCreatedAt.length;
  console.log(`\ninjury situations total: ${total}`);

  const at = (oneBased: number): string | null =>
    oneBased >= 1 && oneBased <= total ? injuryCreatedAt[oneBased - 1] : null;

  const first = at(1);
  const s800 = at(800);
  const sLast = at(total);           // #1976 in the reported run (whatever total is now)
  console.log(`\nscan-order created_at markers (DESC, so #1 is newest, #${total} is oldest):`);
  console.log(`  #1     (newest): ${first}`);
  console.log(`  #800           : ${s800}`);
  console.log(`  #${total} (oldest): ${sLast}`);

  // ── RSS candidate retention. Print both the broad and the exact-scan filter. ──
  const rssAllMin = db.prepare(
    `SELECT MIN(created_at) AS mn, MAX(created_at) AS mx, COUNT(*) AS n
     FROM raw_events WHERE source_id LIKE 'rss_%_official'`,
  ).get() as any;
  const rssInjMin = db.prepare(
    `SELECT MIN(created_at) AS mn, MAX(created_at) AS mx, COUNT(*) AS n
     FROM raw_events WHERE source_id LIKE 'rss_%_official' AND event_type='injury_update'`,
  ).get() as any;
  console.log(`\nraw_events source_id LIKE 'rss_%_official' (ALL event_types):`);
  console.log(`  count=${rssAllMin.n}  min(created_at)=${rssAllMin.mn}  max=${rssAllMin.mx}`);
  console.log(`raw_events source_id LIKE 'rss_%_official' AND event_type='injury_update' (the exact Part 3 candidate filter):`);
  console.log(`  count=${rssInjMin.n}  min(created_at)=${rssInjMin.mn}  max=${rssInjMin.mx}`);

  // ── Verdict: can the oldest situation possibly have a candidate in window? ──
  // A situation at created_at C can only fire if some rss injury_update event exists
  // with event.created_at >= C - 72h. The earliest such event is rssInjMin.mn.
  // So the OLDEST situation that could still fire is one whose created_at <= rssInjMin.mn + 72h.
  const earliestFirableCutoff = rssInjMin.mn
    ? (db.prepare(`SELECT datetime(?, '+${WINDOW_HOURS} hours') AS c`).get(rssInjMin.mn) as any).c
    : null;
  console.log(`\nearliest rss injury_update event: ${rssInjMin.mn}`);
  console.log(`=> oldest situation that could still find a candidate in its +/-72h window: created_at <= ${earliestFirableCutoff}`);

  if (!earliestFirableCutoff || !sLast) {
    console.log("\nVERDICT: INSUFFICIENT DATA (empty rss injury events or no situations). Investigate.");
  } else if (sLast >= earliestFirableCutoff) {
    // Oldest situation is NEWER than the cutoff -> it IS within reach of candidates.
    // Retention does NOT explain the plateau. Possible real bug.
    console.log(`\nVERDICT: *** POSSIBLE BUG ***`);
    console.log(`  Oldest injury situation (#${total}, ${sLast}) is within candidate reach`);
    console.log(`  (>= cutoff ${earliestFirableCutoff}), yet Part 3 reported no new fires past #800.`);
    console.log(`  Retention does NOT explain the plateau. STOP and investigate before implementing.`);
  } else {
    console.log(`\nVERDICT: RETENTION (expected, not a bug).`);
    console.log(`  Oldest injury situation (#${total}, ${sLast}) is OLDER than the earliest`);
    console.log(`  candidate-reachable cutoff (${earliestFirableCutoff}), so situations past the`);
    console.log(`  retention boundary have no rss injury_update event in their +/-72h window`);
    console.log(`  and cannot fire. The ~523 plateau is the real firable population.`);
    // Extra: how many situations fall on the firable side of the boundary?
    const firable = db.prepare(
      `SELECT COUNT(*) AS n FROM situations
       WHERE situation_type='injury' AND created_at >= ?`,
    ).get(earliestFirableCutoff) as any;
    console.log(`  injury situations at-or-after the cutoff (candidate-reachable): ${firable.n} of ${total}`);
  }

  db.close();
  console.log("\nDone.");
}

process.on("uncaughtException", (e) => { console.error("UNCAUGHT:", e); process.exitCode = 1; });
process.on("unhandledRejection", (e) => { console.error("UNHANDLED REJECTION:", e); process.exitCode = 1; });
process.stdout.on("error", (e: any) => { if (e && e.code === "EPIPE") process.exit(0); });

try {
  main();
} catch (e) {
  console.error("FATAL in main():", e);
  console.log(`\nFATAL in main() (details on stderr): ${(e as Error)?.message ?? e}`);
  process.exitCode = 1;
}
