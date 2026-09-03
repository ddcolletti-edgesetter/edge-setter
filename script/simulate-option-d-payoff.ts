/**
 * Simulates Option D (resolve game_id on ingestion) against real production data,
 * using the ACTUAL scorer (situations-matching.ts) — not a re-derived model.
 *
 * For every same-team, same-league RSS raw_event vs situation pair within a 48h
 * window, this computes:
 *   - REAL score: exactly what the pipeline produces today (game_id unresolved for RSS)
 *   - SIMULATED-D score: same pair, but with game_overlap forced to its best-case
 *     contribution (1.0 * weight), as if game_id had been resolved on ingestion —
 *     everything else (player_overlap, team_overlap, injury_semantics, timing,
 *     market, roster) is left exactly as the real scorer produced it.
 *
 * This answers ONE question: does fixing game_id alone get enough pairs over 0.62
 * to justify building Option D? No live code is touched — read-only, prints only.
 *
 * NOTE: This mirrors the structure of script/diagnose-public-confirmation-matching.ts
 * but broadens the situation query (no LIMIT 5) to approximate the same-team-filtered
 * ~156-pair dataset referenced in prior sessions. If a committed
 * same-team-filtered script already exists in the repo, prefer running that one's
 * query logic — this is a best-effort reconstruction from the matcher + the base
 * diagnostic script only.
 *
 * Run on Render:
 *   PIPELINE_DATA_DIR=/var/data npx tsx script/simulate-option-d-payoff.ts
 * Or point at a file:
 *   npx tsx script/simulate-option-d-payoff.ts /var/data/pipeline.db
 *
 * Read-only. Never writes.
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { scoreCandidate } from "../server/pipeline/situations-matching";
import { rawEventToNormalizedEvent } from "../server/pipeline/situations-adapter";
import type { LiveSignal, RawEvent } from "../server/pipeline/types";
import type { Situation } from "../server/pipeline/situations-contract";

const OFFICIAL_RSS = ["rss_broncos_official", "rss_cowboys_official"];
const LEAGUES = ["NFL", "CFB"];
const WINDOW_HOURS = 48;
const THRESHOLD = 0.62;
const GAME_OVERLAP_WEIGHT = 0.18; // must match MATCH_WEIGHTS.game_overlap in situations-matching.ts

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
  return { ...row, players: safeJson(row.players_json) ?? [], teams: safeJson(row.teams_json) ?? [] };
}
function safeJson(v: unknown): any {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function main() {
  const dbPath = resolveDbPath();
  console.log(`\nDB: ${dbPath}`);
  if (!fs.existsSync(dbPath)) { console.log("!! DB file does not exist at that path."); return; }
  const db = new Database(dbPath, { readonly: true });

  const has = (t: string) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
  if (!has("situations") || !has("raw_events")) {
    console.log(`!! Missing tables. Wrong DB file?`);
    return;
  }

  const leaguesSql = LEAGUES.map(() => "?").join(",");
  const situations = db.prepare(
    `SELECT * FROM situations WHERE league IN (${leaguesSql}) AND situation_type='injury' ORDER BY created_at DESC`
  ).all(...LEAGUES).map(parseSituation);

  console.log(`NFL/CFB injury situations considered: ${situations.length}`);

  const rssSql = OFFICIAL_RSS.map(() => "?").join(",");
  let pairsSeen = 0;
  let realCleared = 0;
  let simCleared = 0;
  const simScores: number[] = [];
  const deltas: number[] = [];

  for (const sit of situations) {
    const sitTeams = new Set((sit.teams ?? []).map((t: string) => t.toLowerCase()));
    const rss = db.prepare(
      `SELECT * FROM raw_events
       WHERE source_id IN (${rssSql})
         AND created_at >= datetime(?, '-${WINDOW_HOURS} hours')
         AND created_at <= datetime(?, '+${WINDOW_HOURS} hours')
       ORDER BY created_at DESC`
    ).all(...OFFICIAL_RSS, sit.created_at, sit.created_at).map(parseRaw);

    for (const raw of rss) {
      const norm = rawEventToNormalizedEvent(raw, stubSignal(raw));
      if (norm.situation_type !== sit.situation_type) continue; // Gate 1 — out of scope for this sim, D doesn't touch it
      const normTeams = new Set((norm.teams ?? []).map((t: string) => t.toLowerCase()));
      const sameTeam = [...normTeams].some((t) => sitTeams.has(t));
      if (!sameTeam) continue; // this is the same-team filter

      pairsSeen++;
      const real = scoreCandidate(norm, sit);
      const realTotal = real.match_confidence;
      if (realTotal >= THRESHOLD) realCleared++;

      const gameFactor = real.reasoning_breakdown.find((f) => f.factor === "game_overlap");
      const currentGameContribution = gameFactor?.contribution ?? 0;
      const bestCaseGameContribution = round2(1.0 * GAME_OVERLAP_WEIGHT);
      const simTotal = round2(realTotal - currentGameContribution + bestCaseGameContribution);

      simScores.push(simTotal);
      deltas.push(round2(simTotal - realTotal));
      if (simTotal >= THRESHOLD) simCleared++;
    }
  }

  console.log(`\n──────── RESULTS (same-team, same-league, ±${WINDOW_HOURS}h, situation_type match required) ────────`);
  console.log(`Pairs evaluated: ${pairsSeen}`);
  console.log(`REAL scorer      — cleared ${THRESHOLD}: ${realCleared} / ${pairsSeen}`);
  console.log(`SIMULATED-D      — cleared ${THRESHOLD}: ${simCleared} / ${pairsSeen}`);
  if (simScores.length) {
    console.log(`Simulated-D score range: ${round2(Math.min(...simScores))} – ${round2(Math.max(...simScores))}`);
    console.log(`Average delta from resolving game_id: +${round2(deltas.reduce((a, b) => a + b, 0) / deltas.length)}`);
  }
  console.log(`\nVERDICT: ${simCleared > 0 ? `D alone clears ${simCleared} pair(s) — worth scoping further.` : `D alone clears ZERO pairs even in the best case — D is dead, same as C. Go straight to scoping Option B.`}`);

  db.close();
}

main();
