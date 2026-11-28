#!/usr/bin/env node
/**
 * READ-ONLY census: how many stored MLB rows carry the DFA-as-injury mislabel.
 *
 * Before this PR, ingestMLBTransactions sent a designated-for-assignment
 * transaction (typeCode "DES") down the IL-placement branch, so it was stored
 * as event_type "injury_update", payload.designation "IL-10" (or IL-15/IL-60 if
 * the description happened to mention a day count) and transaction_type
 * "IL-10 placement". The PR fixes new rows only. It rewrites nothing, and this
 * script rewrites nothing either.
 *
 * The raw payload does not keep typeCode, so a DES row is recognised by its
 * notes (the StatsAPI description): "... designated <player> for assignment".
 *
 *   node script/mlb-dfa-mislabel-census.cjs /path/to/pipeline.db
 *
 * Opens the database with { readonly: true, fileMustExist: true }. Imports no
 * app module (importing store.ts opens the DB read-write).
 */
const Database = require("better-sqlite3");

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("usage: node script/mlb-dfa-mislabel-census.cjs <pipeline.db>");
  process.exit(2);
}
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const hasTable = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);

const DFA_RE = /designated\b.*\bfor assignment/i;

// 1. raw_events. source_id = 'mlb_statsapi' uses idx_raw_events_source_received.
const raws = db.prepare(`
  SELECT id, event_type, processed, received_at,
         json_extract(payload, '$.notes')            AS notes,
         json_extract(payload, '$.designation')      AS designation,
         json_extract(payload, '$.transaction_type') AS transaction_type
    FROM raw_events
   WHERE source_id = 'mlb_statsapi'
     AND event_type IN ('injury_update', 'transaction')
`).all();

const dfaRaws = raws.filter((r) => typeof r.notes === "string" && DFA_RE.test(r.notes));
const mislabelled = dfaRaws.filter((r) => r.event_type === "injury_update" || r.designation != null);
const mislabelledIds = new Set(mislabelled.map((r) => r.id));

const tally = (rows, key) => rows.reduce((acc, r) => {
  const k = String(key(r));
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
const span = (rows) => rows.length
  ? { first: rows.reduce((a, r) => (r.received_at < a ? r.received_at : a), rows[0].received_at),
      last: rows.reduce((a, r) => (r.received_at > a ? r.received_at : a), rows[0].received_at) }
  : null;

// 2. live_signals. (league, signal_type, ...) uses idx on league/signal_type/player/designation.
const signals = db.prepare(`
  SELECT id, signal_type, injury_designation, raw_event_ids, COALESCE(is_archived, 0) AS is_archived,
         outcome_id
    FROM live_signals
   WHERE league = 'MLB' AND signal_type = 'injury_update'
`).all();

const parseIds = (s) => { try { const v = JSON.parse(s ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const sig = {
  injury_signals_touched_by_dfa_event: 0,  // any DFA raw event merged into the row
  latest_event_is_dfa: 0,                  // the row's current label came from a DFA event
  latest_event_is_dfa_active: 0,           // ...and is not archived (can still render)
  latest_event_is_dfa_graded: 0,           // ...and has an outcome attached
  latest_event_is_dfa_by_designation: {},
};
const dfaSignalIds = [];
for (const s of signals) {
  const ids = parseIds(s.raw_event_ids);
  if (!ids.some((id) => mislabelledIds.has(id))) continue;
  sig.injury_signals_touched_by_dfa_event++;
  if (mislabelledIds.has(ids[ids.length - 1])) {
    sig.latest_event_is_dfa++;
    dfaSignalIds.push(s.id);
    if (!s.is_archived) sig.latest_event_is_dfa_active++;
    if (s.outcome_id) sig.latest_event_is_dfa_graded++;
    const d = String(s.injury_designation);
    sig.latest_event_is_dfa_by_designation[d] = (sig.latest_event_is_dfa_by_designation[d] ?? 0) + 1;
  }
}

// 3. Public confirmations whose raw event is a mislabelled DFA (small table, scanned).
let publicConfirmations = null;
if (hasTable("situation_public_confirmations")) {
  const pc = db.prepare("SELECT raw_event_id FROM situation_public_confirmations WHERE raw_event_id IS NOT NULL").all();
  publicConfirmations = pc.filter((r) => mislabelledIds.has(r.raw_event_id)).length;
}

console.log(JSON.stringify({
  db: dbPath,
  raw_events: {
    mlb_statsapi_injury_or_transaction: raws.length,
    dfa_by_notes: dfaRaws.length,
    dfa_mislabelled_as_injury: mislabelled.length,
    dfa_already_transaction_no_designation: dfaRaws.length - mislabelled.length,
    mislabelled_by_designation: tally(mislabelled, (r) => r.designation),
    mislabelled_by_transaction_type: tally(mislabelled, (r) => r.transaction_type),
    mislabelled_processed: tally(mislabelled, (r) => (r.processed ? "processed" : "unprocessed")),
    mislabelled_received_span: span(mislabelled),
  },
  live_signals: { mlb_injury_update_rows: signals.length, ...sig },
  public_confirmations_from_mislabelled_raw_event: publicConfirmations,
  sample_mislabelled: mislabelled.slice(0, 5).map((r) => ({ id: r.id, designation: r.designation, notes: r.notes })),
}, null, 2));
