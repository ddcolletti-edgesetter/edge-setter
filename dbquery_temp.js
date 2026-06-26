const Database = require('better-sqlite3');
const db = new Database('server/pipeline.db', { readonly: true });

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

console.log('\n=== TOTALS ===');
try {
  const totSit = db.prepare('SELECT COUNT(*) as n FROM situations').get();
  console.log('total_situations:', totSit.n);
} catch(e) { console.log('situations table missing:', e.message); }

try {
  const totEvt = db.prepare('SELECT COUNT(*) as n FROM raw_events').get();
  console.log('total_raw_events:', totEvt.n);
} catch(e) { console.log('raw_events table missing:', e.message); }

try {
  const totConf = db.prepare('SELECT COUNT(*) as n FROM situation_public_confirmations').get();
  console.log('total_confirmations:', totConf.n);
} catch(e) { console.log('situation_public_confirmations table missing:', e.message); }

console.log('\n=== SITUATIONS WITH >1 PROCESSED HIT ===');
try {
  const rows = db.prepare(`
    SELECT situation_id, COUNT(*) as hit_count
    FROM raw_events
    WHERE processed_at IS NOT NULL
    GROUP BY situation_id
    HAVING COUNT(*) > 1
    ORDER BY hit_count DESC
    LIMIT 20
  `).all();
  if (rows.length === 0) {
    console.log('(none — all situations seen exactly once or zero)');
  } else {
    rows.forEach(r => console.log(' ', r.situation_id, ':', r.hit_count));
  }
} catch(e) { console.log('query failed:', e.message); }

db.close();
