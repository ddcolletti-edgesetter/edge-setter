'use strict';
const Database = require('better-sqlite3');
const DB_PATH = (process.env.PIPELINE_DATA_DIR || process.env.DATA_DIR || '/var/data') + '/pipeline.db';
console.log('[MATCH_PROBE] opening ' + DB_PATH);
const db = new Database(DB_PATH, { readonly: true });

const total = db.prepare('SELECT COUNT(*) AS cnt FROM situations').get().cnt;
const snaps = db.prepare('SELECT COUNT(*) AS cnt FROM situation_snapshots').get().cnt;
console.log('[MATCH_PROBE] situations=' + total + ' snapshots=' + snaps);

const combos = [
  ['NFL','injury'], ['NFL','roster'], ['NFL','lineup'],
  ['NBA','injury'], ['MLB','injury'], ['CFB','injury'],
];

for (const [league, type] of combos) {
  const rows = db.prepare(
    'SELECT s.*, MAX(ss.created_at) AS latest_snapshot_at ' +
    'FROM situations s ' +
    'LEFT JOIN situation_snapshots ss ON ss.situation_id = s.situation_id ' +
    'WHERE s.league = ? AND s.situation_type = ? ' +
    'GROUP BY s.situation_id ' +
    'ORDER BY COALESCE(MAX(ss.created_at), s.created_at) DESC, s.situation_id ASC ' +
    'LIMIT 3'
  ).all(league, type);

  if (!rows.length) { console.log('[MATCH_PROBE] ' + league + '/' + type + ': count=0'); continue; }
  const r = rows[0];
  const hasSnapshotId = r.snapshot_id != null;
  console.log('[MATCH_PROBE] ' + league + '/' + type + ': count=' + rows.length);
  console.log('  keys: ' + JSON.stringify(Object.keys(r)));
  console.log('  snapshot_id: ' + (r.snapshot_id !== undefined ? String(r.snapshot_id) : 'MISSING'));
  console.log('  latest_snapshot_at: ' + (r.latest_snapshot_at || 'NULL'));
  console.log('  latest_snapshot would be: ' + (hasSnapshotId ? 'deserialized' : 'null'));
  console.log('  isUsableSituation: ' + (hasSnapshotId ? 'continues to confidence check' : 'FALSE — no snapshot, filtered out'));
}

const sample = db.prepare(
  'SELECT s.situation_id, s.league, s.situation_type, COUNT(ss.snapshot_id) AS snap_count ' +
  'FROM situations s JOIN situation_snapshots ss ON ss.situation_id = s.situation_id ' +
  'GROUP BY s.situation_id ORDER BY snap_count DESC LIMIT 1'
).get();
console.log('[MATCH_PROBE] situation_with_most_snapshots: ' + JSON.stringify(sample || null));
db.close();
