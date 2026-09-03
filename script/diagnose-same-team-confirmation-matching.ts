/**
 * Diagnostic: score ONLY genuine same-team, same-league pairs.
 *
 * The sibling script (diagnose-public-confirmation-matching.ts) cross-joins every
 * recent injury situation against every Broncos/Cowboys RSS event, so most printed
 * pairs are different-team (team_overlap=0 is correct there, not a bug). This script
 * removes that noise: for each recent NFL/CFB injury situation it keeps only the RSS
 * events whose team AND league actually match the situation, then runs the REAL
 * matcher and prints the per-factor breakdown for those apples-to-apples pairs.
 *
 * "team matches" is decided with the SAME normalizer the matcher uses
 * (normalizeSituationToken from situations-hash), so the filter can't disagree with
 * how setOverlap() scores team_overlap.
 *
 * It also dumps teams_json / players_json VERBATIM (the raw column strings) next to
 * the RSS team/player fields, so any data-shape mismatch is visible directly.
 *
 * Run on Render (where the prod DB lives):
 *   PIPELINE_DATA_DIR=/var/data npx tsx script/diagnose-same-team-confirmation-matching.ts
 * Or point straight at a file:
 *   npx tsx script/diagnose-same-team-confirmation-matching.ts /var/data/pipeline.db
 *
 * Read-only. Never writes. No matching-logic changes — imports the real functions.
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { matchSituation, scoreCandidate } from "../server/pipeline/situations-matching";
import { rawEventToNormalizedEvent } from "../server/pipeline/situations-adapter";
import { normalizeSituationToken, normalizeSituationTokens } from "../server/pipeline/situations-hash";
import type { LiveSignal, RawEvent } from "../server/pipeline/types";
import type { Situation } from "../server/pipeline/situations-contract";

const LEAGUES = ["NFL", "CFB"];
const WINDOW_HOURS = 48;
const THRESHOLD = 0.62;
const SITUATION_LIMIT = 50; // scan this many recent injury situations looking for same-team RSS coverage

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

/** Team-token set exactly as setOverlap() would see it (situations-matching.ts:84). */
function teamTokens(teams: readonly string[]): Set<string> {
  return new Set(normalizeSituationTokens(teams));
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

  const leaguesSql = LEAGUES.map(() => "?").join(",");
  const situationRows = db.prepare(
    `SELECT * FROM situations
     WHERE league IN (${leaguesSql}) AND situation_type='injury'
     ORDER BY created_at DESC LIMIT ${SITUATION_LIMIT}`
  ).all(...LEAGUES) as any[];

  console.log(`\nScanned ${situationRows.length} recent NFL/CFB injury situations for same-team RSS coverage.`);
  console.log(`(window ±${WINDOW_HOURS}h, team match via normalizeSituationToken, threshold ${THRESHOLD})`);

  // Pull candidate RSS events once per (league) and filter in JS by team-token match,
  // using the SAME normalizer the matcher uses so the filter agrees with scoring.
  let situationsWithCoverage = 0;
  let pairsScored = 0;
  let pairsAtOrAboveThreshold = 0;

  for (const row of situationRows) {
    const sit = parseSituation(row);
    const sitTokens = teamTokens(sit.teams);

    if (sitTokens.size === 0) {
      // No usable team on the situation — nothing could ever match on team. Skip quietly.
      continue;
    }

    // Same league, within window, from any RSS feed. Team match applied in JS below.
    const rssCandidates = db.prepare(
      `SELECT * FROM raw_events
       WHERE source_type='rss'
         AND league = ?
         AND created_at >= datetime(?, '-${WINDOW_HOURS} hours')
         AND created_at <= datetime(?, '+${WINDOW_HOURS} hours')
       ORDER BY created_at DESC`
    ).all(sit.league, sit.created_at, sit.created_at) as any[];

    const sameTeam = rssCandidates
      .map(parseRaw)
      .filter((raw) => {
        const t = normalizeSituationToken(raw.team ?? "");
        return t.length > 0 && sitTokens.has(t);
      });

    if (sameTeam.length === 0) continue; // no genuine same-team RSS event for this situation

    situationsWithCoverage++;
    console.log(`\n════════ situation ${sit.situation_id} | ${sit.league} | ${sit.situation_type} | created=${sit.created_at}`);
    console.log(`  teams_json   (verbatim): ${row.teams_json ?? "NULL"}`);
    console.log(`  players_json (verbatim): ${row.players_json ?? "NULL"}`);
    console.log(`  normalized team tokens : ${JSON.stringify(Array.from(sitTokens))}`);
    console.log(`  same-team RSS events in window: ${sameTeam.length}`);

    for (const raw of sameTeam) {
      const norm = rawEventToNormalizedEvent(raw, stubSignal(raw));
      const scored = scoreCandidate(norm, sit);
      const matched = matchSituation(norm, [sit], { threshold: THRESHOLD });
      pairsScored++;
      if (scored.match_confidence >= THRESHOLD) pairsAtOrAboveThreshold++;

      console.log(`\n  ──── RSS event ${raw.id} [${raw.source_id}] created=${raw.created_at}`);
      console.log(`    RSS team   (verbatim): ${JSON.stringify(raw.team)}    RSS player (verbatim): ${JSON.stringify(raw.player)}`);
      console.log(`    RSS event_type=${raw.event_type} → incoming.situation_type=${norm.situation_type}`);
      console.log(`    incoming.teams=${JSON.stringify(norm.teams)}  incoming.players=${JSON.stringify(norm.players)}  game_id=${norm.game_id}`);
      console.log(`    headline: ${(raw.payload as any)?.headline ?? ""}`);
      if (norm.situation_type !== sit.situation_type) {
        console.log(`    >> situation_type MISMATCH (${norm.situation_type} ≠ ${sit.situation_type}) → matchSituation() filters this at situations-matching.ts:35.`);
      }
      console.log(`    per-factor (score × weight = contribution):`);
      for (const f of scored.reasoning_breakdown)
        console.log(`      ${f.factor.padEnd(18)} ${String(f.score).padStart(5)} × ${f.weight} = ${f.contribution}   (${f.reason})`);
      console.log(`    TOTAL match_confidence = ${scored.match_confidence}  (threshold ${THRESHOLD}) → matched=${matched.matched_situation ? "YES" : "no"}`);
    }
  }

  console.log(`\n──────── summary`);
  console.log(`  situations scanned                 : ${situationRows.length}`);
  console.log(`  situations with same-team RSS event : ${situationsWithCoverage}`);
  console.log(`  genuine same-team pairs scored      : ${pairsScored}`);
  console.log(`  pairs clearing threshold (${THRESHOLD})     : ${pairsAtOrAboveThreshold}`);
  if (situationsWithCoverage === 0) {
    console.log(`\n  No same-team RSS coverage found for any scanned situation.`);
    console.log(`  → the matching score is moot; the gap is timing/coverage (no official-team RSS event`);
    console.log(`    for that team within ±${WINDOW_HOURS}h), not team_overlap normalization.`);
  }
  db.close();
  console.log("\nDone.");
}

main();
