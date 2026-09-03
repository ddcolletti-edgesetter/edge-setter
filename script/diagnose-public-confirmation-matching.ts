/**
 * Diagnostic: why do ESPN-created NFL/CFB situations never get a public
 * confirmation from official team RSS feeds?
 *
 * For each recent NFL/CFB injury situation (ESPN is the injury source for these
 * leagues; `situations` has no source_id column to filter on directly — see note in
 * main()), find official-RSS raw_events in a time
 * window for the same team, reconstruct the NormalizedEvent EXACTLY as the
 * pipeline does (situations-adapter), and run the REAL matcher against the
 * situation. Prints the per-factor score breakdown and whether it clears the
 * 0.62 threshold — i.e. whether `evolution.matched` could ever be true.
 *
 * Run on Render (where the prod DB lives):
 *   PIPELINE_DATA_DIR=/var/data npx tsx script/diagnose-public-confirmation-matching.ts
 * Or point straight at a file:
 *   npx tsx script/diagnose-public-confirmation-matching.ts /var/data/pipeline.db
 *
 * Read-only. Never writes.
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { matchSituation, scoreCandidate } from "../server/pipeline/situations-matching";
import { rawEventToNormalizedEvent } from "../server/pipeline/situations-adapter";
import type { LiveSignal, RawEvent } from "../server/pipeline/types";
import type { Situation } from "../server/pipeline/situations-contract";

const OFFICIAL_RSS = ["rss_broncos_official", "rss_cowboys_official"];
const LEAGUES = ["NFL", "CFB"];
const WINDOW_HOURS = 48;
const THRESHOLD = 0.62;

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

/** Minimal LiveSignal stub — the adapter only reads a handful of fields for scoring. */
function stubSignal(raw: RawEvent): LiveSignal {
  const p = (raw.payload ?? {}) as Record<string, any>;
  return {
    id: `sig_${raw.id}`,
    headline: p.headline ?? "",
    body: p.notes ?? "",
    matchup: p.matchup ?? null,
    signal_type: p.signal_type ?? raw.event_type,
    verdict: p.verdict ?? "likely",
    trust_label: p.trust_label ?? null,
    score_band: p.score_band ?? null,
    confidence: Number(p.confidence ?? 0),
    source_count: Number(p.source_count ?? 1),
    sources: Array.isArray(p.sources) ? p.sources : [],
    line_movement: p.line_movement ?? null,
    injury_designation: p.designation ?? null,
    lineup_status: null,
  } as unknown as LiveSignal;
}

function parseRaw(row: any): RawEvent {
  return { ...row, payload: safeJson(row.payload) } as RawEvent;
}
function parseSituation(row: any): Situation & { latest_snapshot_at?: string | null } {
  // Real columns are teams_json / players_json (situations-store.ts schema).
  return {
    ...row,
    players: safeJson(row.players_json) ?? [],
    teams: safeJson(row.teams_json) ?? [],
  };
}
function safeJson(v: unknown): any {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
}

function main() {
  const dbPath = resolveDbPath();
  console.log(`\nDB: ${dbPath}`);
  if (!fs.existsSync(dbPath)) { console.log("!! DB file does not exist at that path."); return; }
  const db = new Database(dbPath, { readonly: true });

  const has = (t: string) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
  if (!has("situations") || !has("raw_events")) {
    console.log(`!! Missing tables (situations=${has("situations")}, raw_events=${has("raw_events")}). Wrong DB file?`);
    return;
  }

  // NOTE: `situations` has no source_id column, and its creator lineage is
  // created_from_event_id — a `ne_<hash>` normalized-event id (situations-engine.ts:167),
  // NOT a raw_events.id, and the hash can't be reliably recomputed to join back to a
  // source. So we can't filter by "created by ESPN" at the DB level. Instead we take
  // recent NFL/CFB *injury* situations (ESPN is the injury source for these leagues,
  // per espn-nfl.ts / espn-cfb.ts) and print created_from_event_id for eyeballing.
  const leaguesSql = LEAGUES.map(() => "?").join(",");
  const situations = db.prepare(
    `SELECT * FROM situations
     WHERE league IN (${leaguesSql}) AND situation_type='injury'
     ORDER BY created_at DESC LIMIT 5`
  ).all(...LEAGUES).map(parseSituation);

  console.log(`\nNFL/CFB injury situations, most recent 5: ${situations.length} found`);
  if (situations.length === 0) {
    console.log("  (none — no injury situations for these leagues.)");
    console.log("  Fallback — situation_type distribution for these leagues:");
    for (const r of db.prepare(
      `SELECT league, situation_type, COUNT(*) c FROM situations WHERE league IN (${leaguesSql})
       GROUP BY league, situation_type ORDER BY c DESC LIMIT 20`).all(...LEAGUES))
      console.log("   ", (r as any).league, (r as any).situation_type, "n=" + (r as any).c);
  }

  const rssSql = OFFICIAL_RSS.map(() => "?").join(",");
  for (const sit of situations) {
    console.log(`\n──────── situation ${sit.situation_id} | ${sit.league} | teams=${JSON.stringify(sit.teams)} players=${JSON.stringify(sit.players)} created=${sit.created_at} from_event=${sit.created_from_event_id ?? "—"}`);
    const rss = db.prepare(
      `SELECT * FROM raw_events
       WHERE source_id IN (${rssSql})
         AND created_at >= datetime(?, '-${WINDOW_HOURS} hours')
         AND created_at <= datetime(?, '+${WINDOW_HOURS} hours')
       ORDER BY created_at DESC`
    ).all(...OFFICIAL_RSS, sit.created_at, sit.created_at).map(parseRaw);

    if (rss.length === 0) {
      console.log(`  NO official-RSS raw_events within ±${WINDOW_HOURS}h → NOT a matching problem here (timing/coverage). Nothing to link.`);
      continue;
    }
    for (const raw of rss) {
      const norm = rawEventToNormalizedEvent(raw, stubSignal(raw));
      const typeMismatch = norm.situation_type !== sit.situation_type;
      const scored = scoreCandidate(norm, sit);
      const matched = matchSituation(norm, [sit], { threshold: THRESHOLD });
      console.log(`\n  RSS event ${raw.id} [${raw.source_id}] created=${raw.created_at}`);
      console.log(`    headline: ${(raw.payload as any)?.headline ?? ""}`);
      console.log(`    incoming.event_type=${norm.event_type} situation_type=${norm.situation_type} team=${JSON.stringify(norm.teams)} players=${JSON.stringify(norm.players)} game_id=${norm.game_id}`);
      if (typeMismatch) {
        console.log(`    >> situation_type MISMATCH (${norm.situation_type} ≠ ${sit.situation_type}) → filtered at matching:35, candidate never scored.`);
      }
      console.log(`    per-factor (score × weight = contribution):`);
      for (const f of scored.reasoning_breakdown)
        console.log(`      ${f.factor.padEnd(18)} ${String(f.score).padStart(5)} × ${f.weight} = ${f.contribution}`);
      console.log(`    TOTAL match_confidence = ${scored.match_confidence}  (threshold ${THRESHOLD}) → matched=${matched.matched_situation ? "YES" : "no"}`);
    }
  }
  db.close();
  console.log("\nDone.");
}

main();
