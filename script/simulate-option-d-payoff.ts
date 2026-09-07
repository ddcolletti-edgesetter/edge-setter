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
 * Same-team filter is now IDENTICAL to script/diagnose-same-team-confirmation-matching.ts:
 * situations are the recent NFL/CFB injuries (LIMIT 50); RSS candidates are pulled per
 * situation with source_type='rss' AND league = <situation league> in SQL, then filtered
 * to genuine same-team pairs using normalizeSituationToken/normalizeSituationTokens — the
 * SAME normalizer setOverlap() uses — so the filter can't disagree with how team_overlap
 * is scored. (Prior versions restricted RSS to two hardcoded official feeds and matched
 * teams with a naive .toLowerCase(); those numbers were a two-team best-effort slice, not
 * the real same-team dataset.)
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
import { normalizeSituationToken, normalizeSituationTokens } from "../server/pipeline/situations-hash";
import type { LiveSignal, RawEvent } from "../server/pipeline/types";
import type { Situation } from "../server/pipeline/situations-contract";

const LEAGUES = ["NFL", "CFB"];
const WINDOW_HOURS = 48;
const THRESHOLD = 0.62;
const SITUATION_LIMIT = 50; // scan this many recent injury situations looking for same-team RSS coverage
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

/** Team-token set exactly as setOverlap() would see it (situations-matching.ts). */
function teamTokens(teams: readonly string[]): Set<string> {
  return new Set(normalizeSituationTokens(teams));
}

function main() {
  const dbPath = resolveDbPath();
  console.log(`\nDB: ${dbPath}`);
  if (!fs.existsSync(dbPath)) { console.log("!! DB file does not exist at that path."); return; }
  const db = new Database(dbPath, { readonly: true });
  db.pragma("busy_timeout = 5000"); // fail fast instead of blocking forever on a live-write lock

  const has = (t: string) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
  if (!has("situations") || !has("raw_events")) {
    console.log(`!! Missing tables. Wrong DB file?`);
    return;
  }

  const leaguesSql = LEAGUES.map(() => "?").join(",");
  const situations = db.prepare(
    `SELECT * FROM situations WHERE league IN (${leaguesSql}) AND situation_type='injury' ORDER BY created_at DESC LIMIT ${SITUATION_LIMIT}`
  ).all(...LEAGUES).map(parseSituation);

  console.log(`NFL/CFB injury situations considered: ${situations.length} (LIMIT ${SITUATION_LIMIT})`);

  let pairsSeen = 0;
  let realCleared = 0;
  let simCleared = 0;
  const simScores: number[] = [];
  const deltas: number[] = [];

  let processed = 0;
  for (const sit of situations) {
    processed++;
    if (processed % 50 === 0 || processed === situations.length) {
      console.log(`  ...processed ${processed}/${situations.length} situations, ${pairsSeen} pairs found so far`);
    }

    const sitTokens = teamTokens(sit.teams ?? []);
    if (sitTokens.size === 0) continue; // no usable team on the situation — nothing could match on team

    // Same league, within window, from ANY RSS feed. Team match applied in JS below with
    // the SAME normalizer the matcher uses, so the filter agrees with team_overlap scoring.
    const rssCandidates = db.prepare(
      `SELECT * FROM raw_events
       WHERE source_type='rss'
         AND league = ?
         AND created_at >= datetime(?, '-${WINDOW_HOURS} hours')
         AND created_at <= datetime(?, '+${WINDOW_HOURS} hours')
       ORDER BY created_at DESC`
    ).all(sit.league, sit.created_at, sit.created_at).map(parseRaw);

    const sameTeam = rssCandidates.filter((raw) => {
      const t = normalizeSituationToken((raw as any).team ?? "");
      return t.length > 0 && sitTokens.has(t);
    });

    for (const raw of sameTeam) {
      const norm = rawEventToNormalizedEvent(raw, stubSignal(raw));
      if (norm.situation_type !== sit.situation_type) continue; // Gate 1 — out of scope for this sim, D doesn't touch it

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
