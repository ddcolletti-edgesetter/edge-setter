/**
 * For every NFL/CFB injury situation with a known player name, searches that team's
 * ENTIRE RSS history (source_type='rss', matching team, no time window) for any
 * headline containing the player's last name.
 *
 * Purpose: answer whether ANY true-positive example exists in the data at all —
 * i.e. a case where official RSS ever named a player who also has an ESPN-sourced
 * injury situation. This is a precondition check before building Option B: if zero
 * hits exist here, the confirmation feature may not be buildable from this data
 * source at all, independent of matcher quality.
 *
 * Deliberately ignores timing — a real confirmation might land outside the ±48h
 * window the other diagnostics use, and that's exactly what would be missed by them.
 *
 * Run on Render:
 *   PIPELINE_DATA_DIR=/var/data npx tsx script/search-player-history.ts
 *
 * Read-only. Never writes.
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { normalizeSituationToken, normalizeSituationTokens } from "../server/pipeline/situations-hash";
import type { RawEvent } from "../server/pipeline/types";
import type { Situation } from "../server/pipeline/situations-contract";

const LEAGUES = ["NFL", "CFB"];
const SITUATION_LIMIT = 50;

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
function parseSituation(row: any): Situation {
  return { ...row, players: safeJson(row.players_json) ?? [], teams: safeJson(row.teams_json) ?? [] };
}
function safeJson(v: unknown): any {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
}
function lastName(fullName: string): string {
  const cleaned = String(fullName ?? "").toLowerCase().replace(/[^a-z0-9\s]+/g, " ").trim().replace(/\s+/g, " ");
  const tokens = cleaned.split(" ").filter((t) => !["jr", "sr", "ii", "iii", "iv", "v"].includes(t));
  return tokens[tokens.length - 1] ?? "";
}

function main() {
  const dbPath = resolveDbPath();
  console.error(`DB: ${dbPath}`);
  if (!fs.existsSync(dbPath)) { console.error("!! DB file does not exist."); return; }
  const db = new Database(dbPath, { readonly: true });
  db.pragma("busy_timeout = 5000");

  const leaguesSql = LEAGUES.map(() => "?").join(",");
  const situations = db.prepare(
    `SELECT * FROM situations WHERE league IN (${leaguesSql}) AND situation_type='injury' AND players_json IS NOT NULL AND players_json != '[]' ORDER BY created_at DESC LIMIT ${SITUATION_LIMIT}`
  ).all(...LEAGUES).map(parseSituation);
  console.error(`Situations with a named player: ${situations.length}`);

  let anyHits = 0;
  let playersChecked = 0;

  for (const sit of situations) {
    const sitTokens = new Set(normalizeSituationTokens(sit.teams ?? []));
    for (const playerName of sit.players ?? []) {
      const last = lastName(playerName as string);
      if (!last || last.length < 3) continue; // skip too-short/garbage names, avoid false hits
      playersChecked++;

      // Pull ALL RSS for this team, no time bound.
      const allRss = db.prepare(`SELECT * FROM raw_events WHERE source_type='rss'`).all().map(parseRaw);
      const teamRss = allRss.filter((raw) => {
        const t = normalizeSituationToken((raw as any).team ?? "");
        return t.length > 0 && sitTokens.has(t);
      });

      const hits = teamRss.filter((raw) => {
        const payload = (raw.payload ?? {}) as Record<string, any>;
        const headline = String(payload.headline ?? "").toLowerCase();
        return headline.includes(last);
      });

      if (hits.length > 0) {
        anyHits++;
        console.log(`\nHIT — situation ${sit.situation_id} | player "${playerName}" (searched last name: "${last}") | team ${JSON.stringify(sit.teams)}`);
        for (const h of hits) {
          const payload = (h.payload ?? {}) as Record<string, any>;
          console.log(`   [${(h as any).created_at}] ${(h as any).source_id ?? (h as any).source_type}: ${String(payload.headline ?? "").slice(0, 140)}`);
        }
      }
    }
  }

  console.error(`\nPlayers checked: ${playersChecked}`);
  console.error(`Players with at least one full-history RSS headline hit: ${anyHits}`);
  console.error(anyHits === 0
    ? "\nZERO hits across full history, any team, no time bound. No true-positive example exists in this data at all — this is a precondition failure, not a matcher problem."
    : `\n${anyHits} player(s) have at least one plausible hit — inspect the HIT lines above manually to confirm they're real injury confirmations, not name coincidences (e.g. a common last name appearing in an unrelated headline).`);

  db.close();
}

main();
