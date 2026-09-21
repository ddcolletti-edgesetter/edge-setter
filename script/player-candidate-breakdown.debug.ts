/**
 * SCRATCH DEBUG. READ-ONLY. Explains why fallbackFired=473 but RESCUED=0.
 *
 * Reuses the EXACT pairing/window/threshold logic of player-candidate-backtest.ts.
 * For every pair where the fallback fired (regex-only players empty, branch adapter
 * added a player), it captures the full scoreCandidate breakdown for BOTH arms:
 *   OLD = regex-only baseline (players forced empty of the candidate)
 *   NEW = this branch's rawEventToNormalizedEvent (fallback applied)
 *
 * Prints the per-factor score/weight/contribution side by side for a sample of ~15
 * fired pairs, plus aggregates over ALL fired pairs (how close to 0.62, whether
 * player_overlap actually became non-zero, which factors sit at zero).
 *
 *   npx tsx script/player-candidate-breakdown.debug.ts /var/data/pipeline.db
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { scoreCandidate } from "../server/pipeline/situations-matching";
import type { SituationMatchResult } from "../server/pipeline/situations-matching";
import { rawEventToNormalizedEvent } from "../server/pipeline/situations-adapter";
import { normalizeSituationTokens } from "../server/pipeline/situations-hash";
import type { LiveSignal, RawEvent } from "../server/pipeline/types";
import type { Situation } from "../server/pipeline/situations-contract";

const THRESHOLD = 0.62;
const WINDOW_HOURS = 72;
const SITUATION_LIMIT = 800;
const SAMPLE = 15;

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
function normP(values: unknown[]): string[] {
  return Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))).sort();
}
function regexOnlyPlayers(raw: RawEvent): string[] {
  const payload = (raw.payload ?? {}) as Record<string, any>;
  return normP([raw.player, payload.player, payload.player_name]);
}
const tok = (t: string) => (normalizeSituationTokens([t])[0] ?? "");
const f3 = (n: number) => n.toFixed(3);

interface Fired {
  raw: RawEvent;
  sit: Situation & { latest_snapshot_at?: string | null };
  cand: string;
  newPlayers: string[];
  newTeams: string[];
  hasGameId: boolean;
  hasMarket: boolean;
  oldRes: SituationMatchResult;
  newRes: SituationMatchResult;
}

function printBreakdown(fp: Fired, idx: number): void {
  const { raw, sit, cand, oldRes, newRes } = fp;
  console.log(`\n[${idx}] raw=${raw.id} ${raw.source_id}  cand="${cand}"`);
  console.log(`     sit=${sit.situation_id}  sit.players=${JSON.stringify(sit.players)}  sit.teams=${JSON.stringify(sit.teams)}`);
  console.log(`     incoming(new): players=${JSON.stringify(fp.newPlayers)}  teams=${JSON.stringify(fp.newTeams)}  game_id=${fp.hasGameId}  market=${fp.hasMarket}`);
  console.log(`     factor              wt     old.sc  old.contrib   new.sc  new.contrib`);
  const oldByName = new Map(oldRes.reasoning_breakdown.map((x) => [x.factor, x]));
  for (const nf of newRes.reasoning_breakdown) {
    const of = oldByName.get(nf.factor)!;
    const mark = nf.contribution !== of.contribution ? "  <-- CHANGED" : (nf.score === 0 ? "  (zero)" : "");
    console.log(
      `     ${nf.factor.padEnd(18)} ${f3(nf.weight)}   ${f3(of.score)}   ${f3(of.contribution)}       ${f3(nf.score)}   ${f3(nf.contribution)}${mark}`,
    );
  }
  console.log(`     TOTAL match_confidence:   old=${f3(oldRes.match_confidence)}   new=${f3(newRes.match_confidence)}   (threshold ${THRESHOLD}, gap ${f3(THRESHOLD - newRes.match_confidence)})`);
}

function main() {
  const dbPath = resolveDbPath();
  console.log(`DB (read-only): ${dbPath}`);
  if (fs.existsSync(dbPath) === false) { console.log("ERROR: no db at that path"); return; }
  const db = new Database(dbPath, { readonly: true });
  const hasTable = (t: string) =>
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t) !== undefined;
  if (hasTable("raw_events") === false || hasTable("situations") === false) {
    console.log("ERROR: need raw_events AND situations (prod /var/data/pipeline.db)."); db.close(); return;
  }

  const sits = db.prepare(
    `SELECT * FROM situations WHERE situation_type='injury' ORDER BY created_at DESC LIMIT ${SITUATION_LIMIT}`,
  ).all() as any[];

  const fired: Fired[] = [];
  let pairsScored = 0, fallbackFired = 0, rescued = 0, regressions = 0;

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

      const newNorm = rawEventToNormalizedEvent(raw, stubSignal(raw));
      const cand = String((raw as any).player_candidate ?? "");
      const oldNorm = { ...newNorm, players: regexOnlyPlayers(raw) };
      const fires = oldNorm.players.length === 0 && newNorm.players.length > 0;

      const oldRes = scoreCandidate(oldNorm, sit);
      const newRes = scoreCandidate(newNorm, sit);
      pairsScored++;
      if (!fires) continue;
      fallbackFired++;
      if (newRes.match_confidence < oldRes.match_confidence) regressions++;
      if (oldRes.match_confidence < THRESHOLD && newRes.match_confidence >= THRESHOLD) rescued++;
      fired.push({
        raw, sit, cand, oldRes, newRes,
        newPlayers: newNorm.players, newTeams: newNorm.teams,
        hasGameId: Boolean(newNorm.game_id), hasMarket: Boolean(newNorm.market_context),
      });
    }
  }

  console.log(`\npairsScored=${pairsScored}  fallbackFired=${fallbackFired}  RESCUED=${rescued}  REGRESSIONS=${regressions}`);

  // ── Sample of ~15 fired pairs: full breakdown ──
  console.log(`\n==================== SAMPLE OF ${Math.min(SAMPLE, fired.length)} FIRED PAIRS (full breakdown) ====================`);
  // Spread the sample across the fired set so it isn't all one team/situation.
  const step = Math.max(1, Math.floor(fired.length / SAMPLE));
  let shown = 0;
  for (let i = 0; i < fired.length && shown < SAMPLE; i += step) { printBreakdown(fired[i], shown + 1); shown++; }

  // ── Aggregates over ALL fired pairs ──
  if (fired.length) {
    const newScores = fired.map((f) => f.newRes.match_confidence);
    const gaps = newScores.map((s) => THRESHOLD - s);
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const max = Math.max(...newScores);
    const min = Math.min(...newScores);
    const withinBucket = (lo: number, hi: number) => newScores.filter((s) => s >= lo && s < hi).length;

    const poNonZero = fired.filter((f) => (f.newRes.reasoning_breakdown.find((x) => x.factor === "player_overlap")?.score ?? 0) > 0).length;
    const poChanged = fired.filter((f) => {
      const o = f.oldRes.reasoning_breakdown.find((x) => x.factor === "player_overlap")?.contribution ?? 0;
      const n = f.newRes.reasoning_breakdown.find((x) => x.factor === "player_overlap")?.contribution ?? 0;
      return n !== o;
    }).length;

    // Average contribution per factor across fired pairs (NEW arm) + how often each is exactly 0.
    const factorNames = fired[0].newRes.reasoning_breakdown.map((x) => x.factor);
    console.log(`\n==================== AGGREGATES over all ${fired.length} fired pairs (NEW arm) ====================`);
    console.log(`  new match_confidence:  min=${f3(min)}  mean=${f3(mean(newScores))}  max=${f3(max)}   (threshold ${THRESHOLD})`);
    console.log(`  gap to threshold:      min=${f3(Math.min(...gaps))}  mean=${f3(mean(gaps))}  max=${f3(Math.max(...gaps))}`);
    console.log(`  score buckets:  <0.30:${withinBucket(0,0.3)}  0.30-0.45:${withinBucket(0.3,0.45)}  0.45-0.55:${withinBucket(0.45,0.55)}  0.55-0.62:${withinBucket(0.55,0.62)}  >=0.62:${newScores.filter(s=>s>=0.62).length}`);
    console.log(`  player_overlap non-zero after fallback: ${poNonZero}/${fired.length}   (contribution changed old->new: ${poChanged}/${fired.length})`);
    console.log(`\n  per-factor NEW arm — mean score, mean contribution, count exactly zero:`);
    console.log(`    factor              mean.score  mean.contrib  #zero`);
    for (const fn of factorNames) {
      const scores = fired.map((f) => f.newRes.reasoning_breakdown.find((x) => x.factor === fn)?.score ?? 0);
      const contribs = fired.map((f) => f.newRes.reasoning_breakdown.find((x) => x.factor === fn)?.contribution ?? 0);
      const zeros = scores.filter((s) => s === 0).length;
      console.log(`    ${fn.padEnd(18)} ${f3(mean(scores))}       ${f3(mean(contribs))}       ${zeros}`);
    }
  }

  db.close();
  console.log("\nDone.");
}

main();
