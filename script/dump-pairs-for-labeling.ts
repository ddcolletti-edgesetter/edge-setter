/**
 * Dumps per-pair detail for the same-team RSS/situation dataset so each pair can be
 * hand-labeled (should this RSS event confirm this situation: yes/no) as ground
 * truth for building the Option B decoupled confirmation matcher.
 *
 * Same filter as script/diagnose-same-team-confirmation-matching.ts and
 * script/simulate-option-d-payoff.ts — same-team, same-league, situation_type match,
 * ±48h window, LIMIT 50 situations. This script does NOT score anything; it just
 * prints what a human needs to judge each pair.
 *
 * Run on Render:
 *   PIPELINE_DATA_DIR=/var/data npx tsx script/dump-pairs-for-labeling.ts > pairs.txt
 *
 * Read-only. Never writes to the DB. Writes only to stdout (redirect to a file).
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { normalizeSituationToken, normalizeSituationTokens } from "../server/pipeline/situations-hash";
import type { RawEvent } from "../server/pipeline/types";
import type { Situation } from "../server/pipeline/situations-contract";

const LEAGUES = ["NFL", "CFB"];
const SITUATION_LIMIT = 50;
const WINDOW_HOURS = 48;

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
function parseRaw(row: any): RawEvent {
  return { ...row, payload: safeJson(row.payload) } as RawEvent;
}
function parseSituation(row: any): Situation & { latest_snapshot_at?: string | null } {
  return { ...row, players: safeJson(row.players_json) ?? [], teams: safeJson(row.teams_json) ?? [] };
}
function safeJson(v: unknown): any {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
}

function main() {
  const dbPath = resolveDbPath();
  console.error(`DB: ${dbPath}`);
  if (!fs.existsSync(dbPath)) { console.error("!! DB file does not exist."); return; }
  const db = new Database(dbPath, { readonly: true });
  db.pragma("busy_timeout = 5000");

  const leaguesSql = LEAGUES.map(() => "?").join(",");
  const situations = db.prepare(
    `SELECT * FROM situations WHERE league IN (${leaguesSql}) AND situation_type='injury' ORDER BY created_at DESC LIMIT ${SITUATION_LIMIT}`
  ).all(...LEAGUES).map(parseSituation);
  console.error(`Situations: ${situations.length}`);

  let pairNum = 0;
  console.log("PAIR#\tSIT_ID\tSIT_PLAYERS\tSIT_TEAMS\tSIT_TYPE\tSIT_CREATED\tRSS_SOURCE\tRSS_HEADLINE\tRSS_PLAYER\tRSS_TEAM\tRSS_CREATED\tHOURS_APART\tLABEL(y/n/unsure)");

  for (const sit of situations) {
    const sitTokens = new Set(normalizeSituationTokens(sit.teams ?? []));
    const rss = db.prepare(
      `SELECT * FROM raw_events
       WHERE source_type='rss'
         AND league = ?
         AND created_at >= datetime(?, '-${WINDOW_HOURS} hours')
         AND created_at <= datetime(?, '+${WINDOW_HOURS} hours')
       ORDER BY created_at DESC`
    ).all(sit.league, sit.created_at, sit.created_at).map(parseRaw);

    for (const raw of rss) {
      const t = normalizeSituationToken((raw as any).team ?? "");
      if (!(t.length > 0 && sitTokens.has(t))) continue;

      pairNum++;
      const payload = (raw.payload ?? {}) as Record<string, any>;
      const headline = String(payload.headline ?? "").replace(/\t/g, " ").slice(0, 120);
      const hoursApart = round1(
        (new Date((raw as any).created_at).getTime() - new Date(sit.created_at).getTime()) / 3_600_000,
      );
      console.log(
        [
          pairNum,
          sit.situation_id,
          JSON.stringify(sit.players ?? []),
          JSON.stringify(sit.teams ?? []),
          sit.situation_type,
          sit.created_at,
          (raw as any).source_id ?? (raw as any).source_type,
          headline,
          (raw as any).player ?? "",
          (raw as any).team ?? "",
          (raw as any).created_at,
          hoursApart,
          "",
        ].join("\t"),
      );
    }
  }
  console.error(`\nTotal pairs printed: ${pairNum}`);
  db.close();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

main();
