/**
 * SCRATCH DEBUG. READ-ONLY. Scoping for the game_overlap+market_correlation
 * weight-budget question (do NOT change scoring). Two sections:
 *
 * PART 2 — Structural earnability of game_overlap / market_correlation across the
 *   WHOLE product, not just injuries:
 *     2a. situations by situation_type: fraction with a real game_id (direct, and
 *         after LEFT JOIN situation_game_resolution).
 *     2b. raw_events (the INCOMING side that actually feeds the two factors) mapped
 *         to situation_type: fraction with game_id, and fraction whose payload
 *         carries line_movement/market (the only source of incoming.market_context).
 *
 * PART 3 — Reallocation sanity over the SAME 473 fired injury pairs:
 *   drop game_overlap(0.18)+market_correlation(0.08)=0.26, rescale the other 5
 *   factors by 1/0.74. Since both dropped factors are 0 on every fired pair,
 *   realloc_score = earned5 / 0.74. Count threshold crossings, SPLIT by whether the
 *   fallback produced a real player match (player_overlap>0) vs a same-team/
 *   different-player false pair — because rescaling lifts the false pairs too.
 *
 *   npx tsx script/scope-weight-budget.debug.ts /var/data/pipeline.db
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
// Reallocation factor set: the 5 factors that survive dropping game_overlap+market_correlation.
const KEPT = ["player_overlap", "team_overlap", "injury_semantics", "timing_proximity", "roster_context"] as const;
const KEPT_WEIGHT_SUM = 0.22 + 0.18 + 0.18 + 0.1 + 0.06; // 0.74
const f3 = (n: number) => n.toFixed(3);
const pct = (n: number, d: number) => (d === 0 ? "  n/a" : `${((100 * n) / d).toFixed(1)}%`);

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
// Mirror situationTypeFromRaw for the raw_events breakdown.
const TYPE_CASE = `CASE event_type
  WHEN 'injury_update' THEN 'injury'
  WHEN 'lineup_confirm' THEN 'lineup' WHEN 'lineup_change' THEN 'lineup'
  WHEN 'line_move' THEN 'market' WHEN 'odds_open' THEN 'market'
  WHEN 'weather_update' THEN 'weather'
  WHEN 'transaction' THEN 'roster'
  WHEN 'scheme_note' THEN 'scheme'
  ELSE 'operator_note' END`;

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
  const hasResolution = hasTable("situation_game_resolution");

  // ─────────────────────── PART 2a: situations by type ───────────────────────
  console.log("\n==================== PART 2a: situations game_id coverage by type ====================");
  console.log(`  (resolution side-table present: ${hasResolution})`);
  const join = hasResolution
    ? "LEFT JOIN situation_game_resolution r ON r.situation_id = s.situation_id"
    : "";
  const resolvedExpr = hasResolution ? "r.resolved_game_id" : "NULL";
  const sitRows = db.prepare(`
    SELECT s.situation_type AS t,
           COUNT(*) AS total,
           SUM(CASE WHEN COALESCE(s.game_id,'')<>'' THEN 1 ELSE 0 END) AS direct_game,
           SUM(CASE WHEN COALESCE(s.game_id,'')<>'' OR COALESCE(${resolvedExpr},'')<>'' THEN 1 ELSE 0 END) AS any_game
    FROM situations s ${join}
    GROUP BY s.situation_type ORDER BY total DESC`).all() as any[];
  console.log(`  situation_type       total   direct_game (pct)     any_game incl. resolved (pct)`);
  for (const r of sitRows) {
    console.log(`  ${String(r.t).padEnd(18)} ${String(r.total).padStart(6)}   ${String(r.direct_game).padStart(6)} (${pct(r.direct_game, r.total).padStart(6)})       ${String(r.any_game).padStart(6)} (${pct(r.any_game, r.total)})`);
  }

  // ─────────────────────── PART 2b: raw_events (incoming) by mapped type ───────
  console.log("\n==================== PART 2b: raw_events (incoming) game_id + market payload, by mapped situation_type ====================");
  console.log("  market_context is derived ONLY from payload line_movement/market — so this is the true earnability of market_correlation.");
  const rawRows = db.prepare(`
    SELECT ${TYPE_CASE} AS t,
           COUNT(*) AS total,
           SUM(CASE WHEN COALESCE(game_id,'')<>'' THEN 1 ELSE 0 END) AS has_game,
           SUM(CASE WHEN payload LIKE '%"line_movement"%' OR payload LIKE '%"market"%' THEN 1 ELSE 0 END) AS has_market
    FROM raw_events
    GROUP BY t ORDER BY total DESC`).all() as any[];
  console.log(`  situation_type       total    has_game (pct)      has_market_payload (pct)`);
  for (const r of rawRows) {
    console.log(`  ${String(r.t).padEnd(18)} ${String(r.total).padStart(6)}   ${String(r.has_game).padStart(6)} (${pct(r.has_game, r.total).padStart(6)})     ${String(r.has_market).padStart(6)} (${pct(r.has_market, r.total)})`);
  }

  // ─────────────────────── PART 3: reallocation over the 473 fired pairs ───────
  console.log("\n==================== PART 3: reallocation sanity over fired injury pairs ====================");
  console.log(`  proposal: drop game_overlap(0.18)+market_correlation(0.08); rescale kept 5 by 1/${KEPT_WEIGHT_SUM.toFixed(2)} = ${(1 / KEPT_WEIGHT_SUM).toFixed(4)}`);
  console.log(`  equivalent current-scale threshold to cross ${THRESHOLD}: ${THRESHOLD} * ${KEPT_WEIGHT_SUM.toFixed(2)} = ${(THRESHOLD * KEPT_WEIGHT_SUM).toFixed(4)}`);

  // NOTE: explicit column lists (not SELECT *) to keep per-row memory small — at
  // prod volume the situations/raw_events tables are bloated and SELECT * over an
  // 800x nested scan is a likely OOM trigger (see prod OOM incident).
  const sits = db.prepare(
    `SELECT situation_id, league, situation_type, game_id, teams_json, players_json,
            semantic_fingerprint, created_at
     FROM situations WHERE situation_type='injury' ORDER BY created_at DESC LIMIT ${SITUATION_LIMIT}`,
  ).all() as any[];
  console.log(`  Part 3: loaded ${sits.length} injury situations; scanning for fired pairs...`);

  const rssStmt = db.prepare(
    `SELECT id, source_id, source_type, league, game_id, team, player, event_type,
            payload, created_at, received_at, player_candidate
     FROM raw_events
     WHERE source_id LIKE 'rss_%_official' AND event_type='injury_update' AND league = ?
       AND created_at >= datetime(?, '-${WINDOW_HOURS} hours')
       AND created_at <= datetime(?, '+${WINDOW_HOURS} hours')`,
  );

  let fired = 0;
  let scanned = 0;
  // buckets: [realMatch][crosses]
  let realCross = 0, realNoCross = 0, falseCross = 0, falseNoCross = 0;
  let droppedNonZero = 0; // sanity: pairs where game/market weren't 0 (should be 0)
  let maxReallocReal = 0, maxReallocFalse = 0;

  for (const srow of sits) {
    scanned++;
    if (scanned % 200 === 0) console.log(`  Part 3: scanned ${scanned}/${sits.length} situations, fired so far=${fired}`);
    const sit = parseSituation(srow);
    const sitTokens = new Set(normalizeSituationTokens(sit.teams));
    if (sitTokens.size === 0) continue;
    const rss = rssStmt.all(sit.league, sit.created_at, sit.created_at) as any[];

    for (const rrow of rss) {
      const raw = parseRaw(rrow);
      if (tok(String(raw.team ?? "")).length === 0 || !sitTokens.has(tok(String(raw.team ?? "")))) continue;
      const newNorm = rawEventToNormalizedEvent(raw, stubSignal(raw));
      const oldNorm = { ...newNorm, players: regexOnlyPlayers(raw) };
      const fires = oldNorm.players.length === 0 && newNorm.players.length > 0;
      if (!fires) continue;
      fired++;

      const res = scoreCandidate(newNorm, sit);
      const byName = new Map(res.reasoning_breakdown.map((x) => [x.factor, x]));
      const dropped = (byName.get("game_overlap")?.contribution ?? 0) + (byName.get("market_correlation")?.contribution ?? 0);
      if (dropped !== 0) droppedNonZero++;
      const earned5 = KEPT.reduce((s, k) => s + (byName.get(k)?.contribution ?? 0), 0);
      const realloc = earned5 / KEPT_WEIGHT_SUM;
      const crosses = realloc >= THRESHOLD;
      const realMatch = (byName.get("player_overlap")?.score ?? 0) > 0;

      if (realMatch) { maxReallocReal = Math.max(maxReallocReal, realloc); crosses ? realCross++ : realNoCross++; }
      else { maxReallocFalse = Math.max(maxReallocFalse, realloc); crosses ? falseCross++ : falseNoCross++; }
    }
  }

  console.log(`  Part 3: scan complete. situations=${scanned}, fired=${fired}`);
  const realTotal = realCross + realNoCross;
  const falseTotal = falseCross + falseNoCross;
  console.log(`\n  fired pairs: ${fired}   (dropped-factor-nonzero pairs, should be 0: ${droppedNonZero})`);
  console.log(`\n  REAL player match (player_overlap>0): ${realTotal}`);
  console.log(`    would cross ${THRESHOLD} after reallocation (GOOD rescues): ${realCross}/${realTotal}   maxRealloc=${f3(maxReallocReal)}`);
  console.log(`  FALSE pair (same-team, different player, player_overlap=0): ${falseTotal}`);
  console.log(`    would cross ${THRESHOLD} after reallocation (FALSE MERGES): ${falseCross}/${falseTotal}   maxRealloc=${f3(maxReallocFalse)}`);
  console.log(`\n  NET: reallocation alone would rescue ${realCross} correct + manufacture ${falseCross} false merges.`);
  console.log(`  (If falseCross>0, weight reallocation MUST be paired with tighter pairing before it is safe.)`);

  db.close();
  console.log("\nDone.");
}

// Make any silent death loud: a swallowed throw, an unhandled rejection, or a
// closed stdout pipe must surface instead of exiting 0 with truncated output.
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
