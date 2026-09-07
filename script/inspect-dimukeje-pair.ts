/**
 * Prints the REAL scorer's exact per-factor breakdown for ONE specific, manually
 * confirmed true-positive pair: situation sit_a3f464787c9a9c2aa6b54ea5 (Victor
 * Dimukeje, SF) against the RSS raw_event describing his move to Injured Reserve
 * ("49ers Sign DL Joyner to One-Year Deal, Place DL Dimukeje on Injured Reserve").
 *
 * This is not a general diagnostic — it's ground truth. We already know by manual
 * inspection that this pair SHOULD confirm. This prints exactly which factors the
 * real scorer credits and which it doesn't, so we can see the actual failure mode
 * on a real example instead of aggregate stats, and use this pair as a concrete
 * test case for validating the Option B 4-gate matcher design.
 *
 * Run on Render:
 *   PIPELINE_DATA_DIR=/var/data npx tsx script/inspect-dimukeje-pair.ts
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

const SITUATION_ID = "sit_a3f464787c9a9c2aa6b54ea5";
const HEADLINE_FRAGMENT = "Place DL Dimukeje on Injured Reserve"; // to locate the exact raw_event row

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

function main() {
  const dbPath = resolveDbPath();
  console.log(`DB: ${dbPath}`);
  if (!fs.existsSync(dbPath)) { console.log("!! DB file does not exist."); return; }
  const db = new Database(dbPath, { readonly: true });
  db.pragma("busy_timeout = 5000");

  const sitRow = db.prepare(`SELECT * FROM situations WHERE situation_id = ?`).get(SITUATION_ID);
  if (!sitRow) { console.log(`!! Situation ${SITUATION_ID} not found. Has it aged out of the DB since the last run?`); db.close(); return; }
  const sit = parseSituation(sitRow);
  console.log(`\nSituation: ${sit.situation_id}`);
  console.log(`  league=${sit.league} type=${sit.situation_type} players=${JSON.stringify(sit.players)} teams=${JSON.stringify(sit.teams)} created=${sit.created_at}`);

  const rawRow = db.prepare(
    `SELECT * FROM raw_events WHERE source_type='rss' AND payload LIKE ? ORDER BY created_at DESC LIMIT 1`
  ).get(`%${HEADLINE_FRAGMENT}%`);
  if (!rawRow) { console.log(`!! No raw_event found containing "${HEADLINE_FRAGMENT}". Has it aged out?`); db.close(); return; }
  const raw = parseRaw(rawRow);
  const payload = (raw.payload ?? {}) as Record<string, any>;
  console.log(`\nRSS event: ${(raw as any).id} [${(raw as any).source_id}] created=${(raw as any).created_at}`);
  console.log(`  headline: ${payload.headline}`);
  console.log(`  raw.team=${(raw as any).team} raw.player=${(raw as any).player}`);

  const norm = rawEventToNormalizedEvent(raw, stubSignal(raw));
  console.log(`\nNormalized incoming event:`);
  console.log(`  event_type=${norm.event_type} situation_type=${norm.situation_type} players=${JSON.stringify(norm.players)} teams=${JSON.stringify(norm.teams)} game_id=${norm.game_id}`);

  if (norm.situation_type !== sit.situation_type) {
    console.log(`\n!! situation_type MISMATCH (${norm.situation_type} vs ${sit.situation_type}) — would be filtered at Gate 1, never scored by matchSituation(). scoreCandidate() below bypasses that gate to show the score anyway.`);
  }

  const scored = scoreCandidate(norm, sit);
  console.log(`\n──────── PER-FACTOR BREAKDOWN (score × weight = contribution) ────────`);
  for (const f of scored.reasoning_breakdown) {
    console.log(`  ${f.factor.padEnd(18)} ${String(f.score).padStart(5)} × ${f.weight} = ${String(f.contribution).padStart(5)}   ${f.reason}`);
  }
  console.log(`\nTOTAL match_confidence = ${scored.match_confidence}  (threshold 0.62)`);
  console.log(`Would confirm today: ${scored.match_confidence >= 0.62 ? "YES" : "NO"}`);

  db.close();
}

main();
