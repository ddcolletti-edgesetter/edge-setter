#!/usr/bin/env node
/**
 * Variant of backtest-evidence-dedup.cjs focused on the LIVE evidence gates,
 * to check whether #48's evidence_count de-inflation regresses the injury
 * escalations that #47 just unlocked. Read-only.
 *
 *   node script/backtest-evidence-gate2.cjs
 *   BAR=2 TYPE=injury node script/backtest-evidence-gate2.cjs
 *   node script/backtest-evidence-gate2.cjs /path/to/pipeline.db
 *
 * The live gates (situations-lifecycle.ts) that consume evidence_count:
 *   escalating: confidence >= 65 && (trigger market_reaction || evidence_count >= 2)
 *   developing: confidence >= 58 && evidence_count >= 2
 * So the number that matters is: injury situations at confidence >= 65 that pass
 * evidence_count >= 2 under the OLD count but FAIL it under the NEW distinct
 * count — those lose the evidence path to escalation (market_reaction can still
 * carry them, but that path is rare for injury and is flagged, not assumed).
 */
const path = require("path");
const fs = require("fs");

function resolveDbPath() {
  if (process.argv[2]) return process.argv[2];
  const candidates = [
    process.env.PIPELINE_DATA_DIR && path.join(process.env.PIPELINE_DATA_DIR, "pipeline.db"),
    path.join(process.cwd(), "pipeline.db"),
    path.join(process.cwd(), "data", "pipeline.db"),
    "/data/pipeline.db",
  ].filter(Boolean);
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return candidates[0] || "pipeline.db";
}

const dbPath = resolveDbPath();
const Database = require("better-sqlite3");
const db = new Database(dbPath, { readonly: true });
console.log("pipeline.db:", dbPath);

const BAR = Number(process.env.BAR || 2);            // the real evidence gate
const FOCUS = process.env.TYPE || "injury";
const ESC_CONF = 65;                                 // escalating confidence bar (post #46)
const DEV_CONF = 58;                                 // developing confidence bar
const EVIDENCE_KINDS = "('situation_created','situation_matched')";
console.log(`BAR=${BAR}  focus_type=${FOCUS}  esc_conf=${ESC_CONF}  dev_conf=${DEV_CONF}\n`);

const situations = db.prepare(`
  SELECT
    s.situation_id                 AS situation_id,
    s.situation_type               AS situation_type,
    latest.confidence_score        AS confidence,
    latest.lifecycle_state         AS lifecycle_state,
    latest.evidence_event_ids_json AS evidence_json
  FROM situations s
  JOIN situation_snapshots latest
    ON latest.snapshot_id = (
      SELECT ss.snapshot_id FROM situation_snapshots ss
      WHERE ss.situation_id = s.situation_id
      ORDER BY ss.created_at DESC, ss.snapshot_id ASC LIMIT 1
    )
`).all();

const distinctStmt = db.prepare(`
  SELECT COUNT(*) AS distinct_obs, COUNT(DISTINCT source_id) AS distinct_sources
  FROM (
    SELECT DISTINCT source_id, observed_at
    FROM situation_events
    WHERE situation_id = ? AND kind IN ${EVIDENCE_KINDS}
  )
`);

function blankBucket() {
  return {
    n: 0,
    oldPass: 0, newPass: 0,                 // ev >= BAR, all confidence
    escOldPass: 0, escNewPass: 0, escRegress: 0,   // conf >= ESC_CONF
    devOldPass: 0, devNewPass: 0, devRegress: 0,   // DEV_CONF <= conf < ESC_CONF
    regressNewEv1: 0, regressNewEv0: 0,     // where regressors land (among conf >= ESC_CONF)
    liveEscalating: 0, liveEscalatingAtRisk: 0,    // lifecycle_state == escalating & new_ev < BAR
  };
}

const byType = {};

for (const row of situations) {
  let oldEv = 0;
  try { oldEv = JSON.parse(row.evidence_json || "[]").length; } catch { oldEv = 0; }
  const newEv = distinctStmt.get(row.situation_id).distinct_obs;
  const conf = Number(row.confidence);
  const state = row.lifecycle_state;
  const t = row.situation_type || "unknown";
  const b = (byType[t] ||= blankBucket());

  b.n++;
  if (oldEv >= BAR) b.oldPass++;
  if (newEv >= BAR) b.newPass++;

  if (conf >= ESC_CONF) {
    if (oldEv >= BAR) b.escOldPass++;
    if (newEv >= BAR) b.escNewPass++;
    if (oldEv >= BAR && newEv < BAR) {
      b.escRegress++;
      if (newEv === 1) b.regressNewEv1++;
      else if (newEv === 0) b.regressNewEv0++;
    }
  } else if (conf >= DEV_CONF) {
    if (oldEv >= BAR) b.devOldPass++;
    if (newEv >= BAR) b.devNewPass++;
    if (oldEv >= BAR && newEv < BAR) b.devRegress++;
  }

  if (state === "escalating") {
    b.liveEscalating++;
    if (newEv < BAR) b.liveEscalatingAtRisk++;   // would lose evidence path (unless market_reaction)
  }
}

function report(t) {
  const b = byType[t];
  if (!b) { console.log(`(no situations of type "${t}")`); return; }
  console.log(`── ${t} ──`, {
    n: b.n,
    all_oldPass_ev_ge_BAR: b.oldPass,
    all_newPass_ev_ge_BAR: b.newPass,
    escalating_relevant_conf_ge_65: {
      oldPass: b.escOldPass,
      newPass: b.escNewPass,
      REGRESS_lose_evidence_path: b.escRegress,
      regress_lands_at_newEv1: b.regressNewEv1,
      regress_lands_at_newEv0: b.regressNewEv0,
    },
    developing_relevant_58_to_65: {
      oldPass: b.devOldPass, newPass: b.devNewPass, REGRESS: b.devRegress,
    },
    live_state: {
      currently_escalating: b.liveEscalating,
      at_risk_newEv_lt_BAR: b.liveEscalatingAtRisk,
    },
  });
}

console.log(`=== FOCUS: ${FOCUS} ===`);
report(FOCUS);

console.log("\n=== all types (context) ===");
for (const t of Object.keys(byType).sort()) report(t);

console.log(`\nDecisive number: ${FOCUS}.escalating_relevant.REGRESS_lose_evidence_path`);
console.log("= injury situations at conf>=65 that pass ev>=2 old but fail it new.");
console.log("live_state.at_risk = currently-escalating rows whose new count < BAR");
console.log("(some may be held by a market_reaction trigger; injury rarely is).");
