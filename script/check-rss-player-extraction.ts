/**
 * Checks how often raw_events.player is populated vs null for RSS sources, broken
 * down by source_id, to tell whether the Dimukeje null-player extraction miss was
 * a one-off or a systemic upstream problem across official RSS feeds.
 *
 * Run on Render:
 *   PIPELINE_DATA_DIR=/var/data npx tsx script/check-rss-player-extraction.ts
 *
 * Read-only. Never writes.
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

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
  console.log(`DB: ${dbPath}`);
  if (!fs.existsSync(dbPath)) { console.log("!! DB file does not exist."); return; }
  const db = new Database(dbPath, { readonly: true });
  db.pragma("busy_timeout = 5000");

  const overall = db.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN player IS NULL OR player = '' THEN 1 ELSE 0 END) as null_player,
       SUM(CASE WHEN player IS NOT NULL AND player != '' THEN 1 ELSE 0 END) as has_player
     FROM raw_events WHERE source_type='rss'`
  ).get() as any;

  console.log(`\n──────── OVERALL (source_type='rss') ────────`);
  console.log(`Total RSS raw_events: ${overall.total}`);
  console.log(`  player IS NULL/empty: ${overall.null_player} (${pct(overall.null_player, overall.total)}%)`);
  console.log(`  player populated:     ${overall.has_player} (${pct(overall.has_player, overall.total)}%)`);

  const perSource = db.prepare(
    `SELECT
       source_id,
       COUNT(*) as total,
       SUM(CASE WHEN player IS NULL OR player = '' THEN 1 ELSE 0 END) as null_player,
       SUM(CASE WHEN player IS NOT NULL AND player != '' THEN 1 ELSE 0 END) as has_player
     FROM raw_events WHERE source_type='rss'
     GROUP BY source_id
     ORDER BY total DESC`
  ).all() as any[];

  console.log(`\n──────── BY SOURCE ────────`);
  console.log(`SOURCE_ID`.padEnd(30) + `TOTAL`.padStart(8) + `NULL`.padStart(8) + `HAS_PLAYER`.padStart(12) + `  NULL_PCT`);
  for (const row of perSource) {
    console.log(
      String(row.source_id).padEnd(30) +
      String(row.total).padStart(8) +
      String(row.null_player).padStart(8) +
      String(row.has_player).padStart(12) +
      `  ${pct(row.null_player, row.total)}%`
    );
  }

  console.log(`\n──────── SAMPLE: RSS events WHERE player IS NULL but headline plausibly contains a name ────────`);
  console.log(`(payload not queryable via SQL LIKE on nested JSON reliably here — spot-check a few headlines manually)`);
  const sample = db.prepare(
    `SELECT source_id, created_at, payload FROM raw_events WHERE source_type='rss' AND (player IS NULL OR player = '') ORDER BY created_at DESC LIMIT 15`
  ).all() as any[];
  for (const row of sample) {
    const payload = safeJson(row.payload) as Record<string, any>;
    console.log(`  [${row.source_id}] ${String(payload?.headline ?? "").slice(0, 100)}`);
  }

  db.close();
}

function pct(n: number, total: number): string {
  if (!total) return "0.0";
  return ((n / total) * 100).toFixed(1);
}
function safeJson(v: unknown): any {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
}

main();
