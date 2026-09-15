#!/usr/bin/env node
/**
 * Prod backtest for the evidence_count de-inflation (#2) + confirmed-gate
 * distinct-source swap (#1). Read-only. Run on Render against the live
 * pipeline.db, same loop as check19.cjs:
 *
 *   node script/backtest-evidence-dedup.cjs
 *   node script/backtest-evidence-dedup.cjs /path/to/pipeline.db   # explicit
 *
 * It mirrors the SHIPPED keys exactly:
 *   - old evidence_count      = length of a snapshot's evidence_event_ids
 *                               (one per evolve — what the gate used before)
 *   - new evidence_count      = DISTINCT (source_id, observed_at) among
 *                               evidentiary events (situation_created /
 *                               situation_matched)  [server: summarizeSituationEvidence]
 *   - distinct_source_count   = DISTINCT source_id among those events
 *   - confirmed gate          old: confidence >= 88 && old_ev >= 3
 *                             new: confidence >= 88 && distinct_sources >= 3
 * The 88 confidence bar is unchanged in both.
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

const CONFIRM_CONF = 88;
const CONFIRM_BAR = 3;
const EVIDENCE_KINDS = "('situation_created','situation_matched')";

// Latest snapshot per situation: confidence, lifecycle_state, old evidence_count.
const situations = db.prepare(`
  SELECT
    s.situation_id                       AS situation_id,
    s.situation_type                     AS situation_type,
    latest.confidence_score              AS confidence,
    latest.lifecycle_state               AS lifecycle_state,
    latest.evidence_event_ids_json       AS evidence_json
  FROM situations s
  JOIN situation_snapshots latest
    ON latest.snapshot_id = (
      SELECT ss.snapshot_id FROM situation_snapshots ss
      WHERE ss.situation_id = s.situation_id
      ORDER BY ss.created_at DESC, ss.snapshot_id ASC LIMIT 1
    )
`).all();

// Distinct observations + distinct sources per situation (the new keys).
const distinctStmt = db.prepare(`
  SELECT
    COUNT(*) AS distinct_obs,
    COUNT(DISTINCT source_id) AS distinct_sources
  FROM (
    SELECT DISTINCT source_id, observed_at
    FROM situation_events
    WHERE situation_id = ? AND kind IN ${EVIDENCE_KINDS}
  )
`);

const byType = {};
const totals = { n: 0, confAt88: 0, oldConfirmEligible: 0, newConfirmEligible: 0 };

for (const row of situations) {
  let oldEv = 0;
  try { oldEv = JSON.parse(row.evidence_json || "[]").length; } catch { oldEv = 0; }
  const d = distinctStmt.get(row.situation_id);
  const newEv = d.distinct_obs;
  const sources = d.distinct_sources;

  const t = row.situation_type || "unknown";
  const b = (byType[t] ||= {
    n: 0, sumOldEv: 0, sumNewEv: 0, sumSrc: 0,
    oldGate3: 0, newGate3: 0, oldGate3_srcUnder3: 0,
    confAt88: 0, oldConfirm: 0, newConfirm: 0,
  });
  b.n++; b.sumOldEv += oldEv; b.sumNewEv += newEv; b.sumSrc += sources;
  if (oldEv >= CONFIRM_BAR) b.oldGate3++;
  if (newEv >= CONFIRM_BAR) b.newGate3++;
  if (oldEv >= CONFIRM_BAR && sources < CONFIRM_BAR) b.oldGate3_srcUnder3++;

  const conf = Number(row.confidence);
  totals.n++;
  if (conf >= CONFIRM_CONF) {
    b.confAt88++; totals.confAt88++;
    if (oldEv >= CONFIRM_BAR) { b.oldConfirm++; totals.oldConfirmEligible++; }
    if (sources >= CONFIRM_BAR) { b.newConfirm++; totals.newConfirmEligible++; }
  }
}

const r1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "n/a");
const r2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");

console.log("\n=== #2 evidence_count de-inflation (per situation_type) ===");
for (const t of Object.keys(byType).sort()) {
  const b = byType[t];
  const oldAvg = b.sumOldEv / b.n, newAvg = b.sumNewEv / b.n;
  console.log(t, {
    n: b.n,
    old_evidence_count_avg: r1(oldAvg),
    new_evidence_count_avg: r1(newAvg),
    inflation_x: r2(newAvg ? oldAvg / newAvg : 0),
    distinct_sources_avg: r2(b.sumSrc / b.n),
    old_gate3_pass: b.oldGate3,
    new_gate3_pass: b.newGate3,
    old_gate3_but_under3_sources: b.oldGate3_srcUnder3,
  });
}

console.log("\n=== #1 confirmed-gate impact (confidence bar 88 unchanged) ===");
for (const t of Object.keys(byType).sort()) {
  const b = byType[t];
  console.log(t, {
    at_conf_88plus: b.confAt88,
    confirm_old_gate_ev3: b.oldConfirm,
    confirm_new_gate_sources3: b.newConfirm,
  });
}
console.log("\nTOTALS", totals);
console.log("\nExpectation: new_confirm ~ 0 (prod distinct_sources ~1) — 'confirmed'");
console.log("is honestly unreachable via evidence; the official path is finality (#3).");
