/**
 * Backtest for PR #49 (player_candidate fallback in rawEventToNormalizedEvent).
 * READ-ONLY. Verifies three claims against real prod data:
 *   1. ~39 rescue-eligible team-official injury events (empty regex player + a
 *      gazetteer player_candidate), concentrated in Ravens/Seahawks/Cowboys.
 *   2. Those rescued events actually clear the 0.62 match threshold against a
 *      real same-team injury situation.
 *   3. MONOTONIC / non-regression: no event's match_confidence ever DECREASES,
 *      so no existing confirmation can lose its player match.
 *
 * Reproduces the fix WITHOUT the fixed code: builds each event's normalized form
 * the deployed (regex-only) way, then overrides `players` with player_candidate
 * exactly as the fix does when regex is empty, and scores BOTH through the real
 * scoreCandidate(). Uses only functions that exist on deployed main.
 *
 *   npx tsx script/player-candidate-backtest.ts /var/data/pipeline.db
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { scoreCandidate } from "../server/pipeline/situations-matching";
import { rawEventToNormalizedEvent } from "../server/pipeline/situations-adapter";
import { normalizeSituationTokens } from "../server/pipeline/situations-hash";
import type { LiveSignal, RawEvent } from "../server/pipeline/types";
import type { Situation } from "../server/pipeline/situations-contract";

const THRESHOLD = 0.62;
const WINDOW_HOURS = 72;
const SITUATION_LIMIT = 800;

function resolveDbPath(): string {
  const arg = process.argv[2];
  if (arg) return arg;
  for (const dir of [process.env.PIPELINE_DATA_DIR, process.env.DATA_DIR, "/var/data", "."]) {
    if (dir === undefined || dir === null || dir.length === 0) continue;
    const p = path.join(dir, "pipeline.db");
    if (fs.existsSync(p)) return p;
  }
  return "pipeline.db";
}

function safeJson(v: unknown): any {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } }
  return v;
}
function parseRaw(row: any): RawEvent { return { ...row, payload: safeJson(row.payload) } as RawEvent; }
function parseSituation(row: any): Situation & { latest_snapshot_at?: string | null } {
  return { ...row, players: safeJson(row.players_json) ?? [], teams: safeJson(row.teams_json) ?? [] };
}
function stubSignal(raw: RawEvent): LiveSignal {
  const p = (raw.payload ?? {}) as Record<string, any>;
  return {
    id: `sig_${raw.id}`, headline: p.headline ?? "", body: p.notes ?? "", matchup: p.matchup ?? null,
    signal_type: p.signal_type ?? raw.event_type, verdict: p.verdict ?? "likely",
    trust_label: p.trust_label ?? null, score_band: p.score_band ?? null,
    confidence: Number(p.confidence ?? 0), source_count: Number(p.source_count ?? 1),
    sources: Array.isArray(p.sources) ? p.sources : [], line_movement: p.line_movement ?? null,
    injury_designation: p.designation ?? null, lineup_status: null,
  } as unknown as LiveSignal;
}
/** Replica of situations-adapter normalizePlayers (private there). */
function normP(values: unknown[]): string[] {
  return Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))).sort();
}
const tok = (t: string) => (normalizeSituationTokens([t])[0] ?? "");

function main() {
  const dbPath = resolveDbPath();
  console.log(`DB (read-only): ${dbPath}`);
  if (fs.existsSync(dbPath) === false) { console.log("ERROR: no db at that path"); return; }
  const db = new Database(dbPath, { readonly: true });
  const hasTable = (t: string) =>
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t) !== undefined;
  if (hasTable("raw_events") === false) { console.log("ERROR: no raw_events table — wrong DB?"); db.close(); return; }

  // ── Claim 1: rescue-eligible count per team-official feed (pure SQL) ──
  console.log("\n== Claim 1: rescue-eligible injury events per team-official feed ==");
  const elig = db.prepare(`
    SELECT source_id,
           COUNT(*) AS injury_events,
           SUM(CASE WHEN COALESCE(player,'')='' AND COALESCE(player_candidate,'')<>'' THEN 1 ELSE 0 END) AS rescue_eligible
    FROM raw_events
    WHERE source_id LIKE 'rss_%_official' AND event_type='injury_update'
    GROUP BY source_id ORDER BY rescue_eligible DESC`).all() as any[];
  let totalElig = 0;
  for (const r of elig) { totalElig += r.rescue_eligible; console.log(`  ${String(r.source_id).padEnd(24)} injury=${String(r.injury_events).padStart(4)}  rescue_eligible=${r.rescue_eligible}`); }
  console.log(`  TOTAL rescue-eligible: ${totalElig}`);

  // ── Claims 2 & 3: score OLD vs NEW for genuine same-team injury pairs ──
  if (hasTable("situations") === false) {
    console.log("\n(no situations table in this DB — Claims 2 & 3 need prod /var/data/pipeline.db)");
    db.close();
    console.log("\nDone.");
    return;
  }
  const sits = db.prepare(
    `SELECT * FROM situations WHERE situation_type='injury' ORDER BY created_at DESC LIMIT ${SITUATION_LIMIT}`,
  ).all() as any[];

  let pairsScored = 0, fallbackFired = 0, rescued = 0, regressions = 0, maxDrop = 0;
  const rescueExamples: string[] = [];
  const regressionExamples: string[] = [];

  for (const srow of sits) {
    const sit = parseSituation(srow);
    const sitTokens = new Set(normalizeSituationTokens(sit.teams));
    if (sitTokens.size === 0) continue;

    const rss = db.prepare(
      `SELECT * FROM raw_events
       WHERE source_id LIKE 'rss_%_official' AND event_type='injury_update' AND league = ?
         AND created_at >= datetime(?, '-${WINDOW_HOURS} hours')
         AND created_at <= datetime(?, '+${WINDOW_HOURS} hours')`,
    ).all(sit.league, sit.created_at, sit.created_at) as any[];

    for (const rrow of rss) {
      const raw = parseRaw(rrow);
      if (tok(String(raw.team ?? "")).length === 0 || sitTokens.has(tok(String(raw.team ?? ""))) === false) continue;

      const oldNorm = rawEventToNormalizedEvent(raw, stubSignal(raw));
      const cand = (raw as any).player_candidate;
      const fires = oldNorm.players.length === 0 && typeof cand === "string" && cand.trim().length > 0;
      const newNorm = fires ? { ...oldNorm, players: normP([cand]) } : oldNorm;

      const oldScore = scoreCandidate(oldNorm, sit).match_confidence;
      const newScore = scoreCandidate(newNorm, sit).match_confidence;
      pairsScored++;
      if (fires) fallbackFired++;

      if (newScore < oldScore) {
        regressions++;
        maxDrop = Math.max(maxDrop, oldScore - newScore);
        if (regressionExamples.length < 5) regressionExamples.push(`raw ${raw.id} sit ${sit.situation_id}: ${oldScore} -> ${newScore}`);
      }
      if (fires && oldScore < THRESHOLD && newScore >= THRESHOLD) {
        rescued++;
        if (rescueExamples.length < 12)
          rescueExamples.push(`  [${raw.source_id}] "${cand}" ${oldScore}->${newScore}  sit=${sit.situation_id.slice(0,14)} (${sit.league})`);
      }
    }
  }

  console.log("\n== Claims 2 & 3: OLD vs NEW scoring over genuine same-team injury pairs ==");
  console.log(`  situations scanned (injury)        : ${sits.length}`);
  console.log(`  same-team official injury pairs     : ${pairsScored}`);
  console.log(`  pairs where fallback fired          : ${fallbackFired}`);
  console.log(`  RESCUED (old <${THRESHOLD} <= new)          : ${rescued}`);
  console.log(`  REGRESSIONS (new < old)             : ${regressions}   maxDrop=${maxDrop.toFixed(4)}   <-- must be 0`);
  if (rescueExamples.length) { console.log("\n  rescued examples (candidate name, old->new match_confidence):"); rescueExamples.forEach((e) => console.log(e)); }
  if (regressionExamples.length) { console.log("\n  REGRESSION examples (SHOULD BE EMPTY):"); regressionExamples.forEach((e) => console.log("  " + e)); }

  db.close();
  console.log("\nDone.");
}

main();
