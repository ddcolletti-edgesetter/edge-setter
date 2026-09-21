/**
 * SCRATCH DEBUG. READ-ONLY. Pairing-safety backtest for the per-type match-weight
 * reallocation (situations-matching.ts: matchWeightsForType). Proves, SEPARATELY
 * per type, that dropping game_overlap+market_correlation and rescaling the kept
 * five by 1/0.74 does NOT manufacture false merges.
 *
 * The injury result (falseCross=0/471 at full prod scale, scope-weight-budget.debug.ts
 * Part 3) is NOT assumed to transfer. Reallocation lifts false pairs (same team,
 * different player) as well as real ones, so each type is measured on its own.
 *
 * METHODOLOGY (mirrors scope-weight-budget Part 3, real-match vs false-pair vs
 * threshold-crossing), adapted per target type:
 *   - target types: roster, operator_note  (+ injury as a self-check that this
 *     harness reproduces the known 0/471 falseCross under the shipped code).
 *   - candidate raw_events per type follow situationTypeFromRaw INVERTED:
 *       injury        <- event_type = 'injury_update'   (rss_%_official, Part 3 parity)
 *       roster        <- event_type = 'transaction'     (all sources)
 *       operator_note <- event_type NOT IN (known set)  (all sources)
 *   - same league, +/-72h window, same normalized team token (matcher gating).
 *   - score EVERY same-team candidate pair with the SHIPPED scoreCandidate (so the
 *     reallocation is exactly the production one). Bucket by:
 *         realMatch = player_overlap score > 0   (real) vs = 0 (false pair)
 *         crosses   = match_confidence >= 0.62
 *   - A/B: also recompute the BASE (pre-reallocation) composite from the same
 *     per-factor scores x the base weights, to isolate NEW crossings that
 *     reallocation itself introduces (base < 0.62 AND realloc >= 0.62).
 *
 * SAFETY VERDICT per type: falseCross MUST be 0. newFalseCross (reallocation-
 * attributable false merges) MUST be 0. Anything else blocks that type.
 *
 *   npx tsx script/reallocation-pairing-safety.debug.ts /var/data/pipeline.db
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { scoreCandidate } from "../server/pipeline/situations-matching";
import { rawEventToNormalizedEvent } from "../server/pipeline/situations-adapter";
import { normalizeSituationTokens } from "../server/pipeline/situations-hash";
import type { LiveSignal, RawEvent } from "../server/pipeline/types";
import type { Situation, SituationType } from "../server/pipeline/situations-contract";

const THRESHOLD = 0.62;
const WINDOW_HOURS = 72;
const SITUATION_LIMIT = 5000; // cover the full population of each target type

// Base weights (pre-reallocation) for the A/B — MUST match MATCH_WEIGHTS in
// situations-matching.ts. Used only to reconstruct the base composite from the
// per-factor scores the shipped scoreCandidate already returns.
const BASE_WEIGHTS: Record<string, number> = {
  player_overlap: 0.22, team_overlap: 0.18, game_overlap: 0.18,
  injury_semantics: 0.18, timing_proximity: 0.1, market_correlation: 0.08, roster_context: 0.06,
};

// event_type sets, inverting situationTypeFromRaw (situations-adapter.ts).
const KNOWN_EVENT_TYPES = [
  "injury_update", "lineup_confirm", "lineup_change", "line_move",
  "odds_open", "weather_update", "transaction", "scheme_note",
];
interface TargetSpec {
  readonly type: SituationType;
  readonly eventClause: string;      // SQL predicate selecting candidate raw_events
  readonly sourceClause: string;     // extra source predicate (Part 3 parity for injury)
  readonly note: string;
}
// NOTE: this scores with the SHIPPED scoreCandidate, so a type only sees reallocated
// weights while it is in REALLOC_TYPES (situations-matching.ts). roster/operator_note
// were tested WITH reallocation on and REJECTED (falseCross 11452/196716 and 420/12443,
// all reallocation-caused), then removed from REALLOC_TYPES — so a re-run now scores
// them on BASE weights (newFalseCross=0). To re-test a rejected type, put it back in
// REALLOC_TYPES first, then run this; newFalseCross MUST be 0 to re-admit it.
const TARGETS: TargetSpec[] = [
  { type: "injury", eventClause: "event_type = 'injury_update'",
    sourceClause: "AND source_id LIKE 'rss_%_official'",
    note: "SHIPPED reallocated type — self-check vs known result (0/2621)" },
  { type: "roster", eventClause: "event_type = 'transaction'",
    sourceClause: "", note: "REJECTED (falseCross 11452/196716); not reallocated" },
  { type: "operator_note",
    eventClause: `event_type NOT IN (${KNOWN_EVENT_TYPES.map((t) => `'${t}'`).join(", ")})`,
    sourceClause: "", note: "REJECTED (falseCross 420/12443); not reallocated" },
];

const f3 = (n: number) => n.toFixed(3);
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

function runTarget(db: Database.Database, spec: TargetSpec) {
  console.log(`\n==================== TARGET: ${spec.type}  (${spec.note}) ====================`);
  const sits = db.prepare(
    `SELECT situation_id, league, situation_type, game_id, teams_json, players_json,
            semantic_fingerprint, created_at
     FROM situations WHERE situation_type=? ORDER BY created_at DESC LIMIT ${SITUATION_LIMIT}`,
  ).all(spec.type) as any[];
  console.log(`  loaded ${sits.length} ${spec.type} situations; candidate filter: ${spec.eventClause} ${spec.sourceClause}`);

  const candStmt = db.prepare(
    `SELECT id, source_id, source_type, league, game_id, team, player, event_type,
            payload, created_at, received_at, player_candidate
     FROM raw_events
     WHERE ${spec.eventClause} ${spec.sourceClause} AND league = ?
       AND created_at >= datetime(?, '-${WINDOW_HOURS} hours')
       AND created_at <= datetime(?, '+${WINDOW_HOURS} hours')`,
  );

  let pairs = 0, fired = 0, scanned = 0;
  let realCross = 0, realNoCross = 0, falseCross = 0, falseNoCross = 0;
  let newFalseCross = 0;                 // base<0.62 AND realloc>=0.62 on a false pair
  let firedFalseCross = 0;               // falseCross restricted to gazetteer-fired pairs (Part 3 parity)
  let maxRealloc = 0, maxFalseRealloc = 0;

  for (const srow of sits) {
    scanned++;
    if (scanned % 500 === 0) console.log(`  scanned ${scanned}/${sits.length}, pairs=${pairs}, falseCross=${falseCross}`);
    const sit = parseSituation(srow);
    const sitTokens = new Set(normalizeSituationTokens(sit.teams));
    if (sitTokens.size === 0) continue; // no team to gate on (matcher can't merge on team here)
    const cands = candStmt.all(sit.league, sit.created_at, sit.created_at) as any[];

    for (const rrow of cands) {
      const raw = parseRaw(rrow);
      const teamTok = tok(String(raw.team ?? ""));
      if (teamTok.length === 0 || !sitTokens.has(teamTok)) continue; // same-team gate
      const newNorm = rawEventToNormalizedEvent(raw, stubSignal(raw));
      // Only score pairs the matcher would actually consider for THIS type.
      if (newNorm.situation_type !== spec.type) continue;
      pairs++;

      const oldNorm = { ...newNorm, players: regexOnlyPlayers(raw) };
      const isFired = oldNorm.players.length === 0 && newNorm.players.length > 0;
      if (isFired) fired++;

      const scored = scoreCandidate(newNorm, sit);
      const by = new Map(scored.reasoning_breakdown.map((x) => [x.factor, x]));
      const realloc = scored.match_confidence; // shipped code = reallocated for these types
      const base = scored.reasoning_breakdown.reduce(
        (s, fct) => s + fct.score * (BASE_WEIGHTS[fct.factor] ?? 0), 0);
      const crosses = realloc >= THRESHOLD;
      const baseCrosses = base >= THRESHOLD;
      const realMatch = (by.get("player_overlap")?.score ?? 0) > 0;

      if (realMatch) {
        maxRealloc = Math.max(maxRealloc, realloc);
        crosses ? realCross++ : realNoCross++;
      } else {
        maxFalseRealloc = Math.max(maxFalseRealloc, realloc);
        crosses ? falseCross++ : falseNoCross++;
        if (crosses && !baseCrosses) newFalseCross++;
        if (crosses && isFired) firedFalseCross++;
      }
    }
  }

  const realTotal = realCross + realNoCross;
  const falseTotal = falseCross + falseNoCross;
  console.log(`\n  RESULT [${spec.type}]`);
  console.log(`    situations scanned : ${scanned}`);
  console.log(`    same-team pairs    : ${pairs}   (gazetteer-fired subset: ${fired})`);
  console.log(`    REAL matches (player_overlap>0) : ${realTotal}`);
  console.log(`      cross ${THRESHOLD} (GOOD merges)          : ${realCross}/${realTotal}   maxRealloc=${f3(maxRealloc)}`);
  console.log(`    FALSE pairs (same team, diff player): ${falseTotal}`);
  console.log(`      cross ${THRESHOLD} (FALSE MERGES)          : ${falseCross}/${falseTotal}   maxRealloc=${f3(maxFalseRealloc)}`);
  console.log(`      of which NEW from reallocation (base<${THRESHOLD}): ${newFalseCross}`);
  console.log(`      of which gazetteer-fired (Part 3 parity)   : ${firedFalseCross}`);
  const safe = falseCross === 0;
  console.log(`\n    VERDICT: ${safe ? "SAFE — falseCross=0" : `*** UNSAFE — falseCross=${falseCross} (${newFalseCross} caused by reallocation) ***`}`);
  return { type: spec.type, pairs, fired, realTotal, realCross, falseTotal, falseCross, newFalseCross, safe };
}

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

  const summary = TARGETS.map((spec) => runTarget(db, spec));
  console.log(`\n==================== SUMMARY ====================`);
  for (const s of summary) {
    console.log(`  ${String(s.type).padEnd(14)} pairs=${String(s.pairs).padStart(5)} real=${String(s.realTotal).padStart(4)} false=${String(s.falseTotal ?? "?").toString().padStart(4)} falseCross=${s.falseCross} newFalseCross=${s.newFalseCross}  -> ${s.safe ? "SAFE" : "UNSAFE"}`);
  }
  db.close();
  console.log("\nDone.");
}

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
