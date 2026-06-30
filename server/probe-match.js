'use strict';
// Standalone probe for listSituationsForMatching deserialization bug.
// Run on Render shell: node server/probe-match.js
// Does NOT require CANONICAL_SITUATIONS_ENABLED — queries the DB directly.

const Database = require('better-sqlite3');
const DB_PATH = (process.env.PIPELINE_DATA_DIR || process.env.DATA_DIR || '/var/data') + '/pipeline.db';

console.log('[MATCH_PROBE] opening', DB_PATH);
const db = new Database(DB_PATH, { readonly: true });

// Totals
const totalSituations = db.prepare('SELECT COUNT(*) AS cnt FROM situations').get().cnt;
const totalSnapshots = db.prepare('SELECT COUNT(*) AS cnt FROM situation_snapshots').get().cnt;
console.log(`[MATCH_PROBE] totals: situations=${totalSituations} snapshots=${totalSnapshots}`);

// Exercise the exact query listSituationsForMatching uses, across all active combos
const combos = [
  { league: 'NFL', situation_type: 'injury' },
  { league: 'NFL', situation_type: 'roster' },
  { league: 'NFL', situation_type: 'lineup' },
  { league: 'NBA', situation_type: 'injury' },
  { league: 'MLB', situation_type: 'injury' },
  { league: 'CFB', situation_type: 'injury' },
];

for (const { league, situation_type } of combos) {
  const rows = db.prepare(`
    SELECT s.*, MAX(ss.created_at) AS latest_snapshot_at
    FROM situations s
    LEFT JOIN situation_snapshots ss ON ss.situation_id = s.situation_id
    WHERE s.league = ? AND s.situation_type = ?
    GROUP BY s.situation_id
    ORDER BY COALESCE(MAX(ss.created_at), s.created_at) DESC, s.situation_id ASC
    LIMIT 3
  `).all(league, situation_type);

  if (rows.length === 0) {
    console.log(`[MATCH_PROBE] ${league}/${situation_type}: count=0 — no rows`);
    continue;
  }

  const r = rows[0];
  const keys = Object.keys(r);
  const hasSnapshotId = 'snapshot_id' in r && r.snapshot_id != null;

  console.log(`\n[MATCH_PROBE] ${league}/${situation_type}: count=${rows.length}`);
  console.log(`  raw_row_keys: ${JSON.stringify(keys)}`);
  console.log(`  snapshot_id on row: ${r.snapshot_id ?? 'MISSING/UNDEFINED'}`);
  console.log(`  latest_snapshot_at on row: ${r.latest_snapshot_at ?? 'NULL'}`);
  // This is the exact check in deserializeCanonicalSituationRecord: row.snapshot_id ? ... : null
  console.log(`  latest_snapshot would be: ${hasSnapshotId ? 'deserialized' : 'null'}`);
  // isUsableSituation first check: if (!record.latest_snapshot) return false
  console.log(`  isUsableSituation result: ${hasSnapshotId ? 'continues (check confidence)' : 'FALSE — null snapshot, filtered out'}`);
}

// Confirm a situation that HAS snapshots, to show what a well-formed row looks like
const withSnapshot = db.prepare(`
  SELECT s.situation_id, s.league, s.situation_type, MAX(ss.created_at) AS latest_snapshot_at, COUNT(ss.snapshot_id) AS snap_count
  FROM situations s
  JOIN situation_snapshots ss ON ss.situation_id = s.situation_id
  GROUP BY s.situation_id
  ORDER BY snap_count DESC
  LIMIT 1
`).get();

if (withSnapshot) {
  console.log(`\n[MATCH_PROBE] sample situation with snapshots: ${JSON.stringify(withSnapshot)}`);
} else {
  console.log('\n[MATCH_PROBE] no situations with snapshots found at all');
}

db.close();
console.log('\n[MATCH_PROBE] done');
