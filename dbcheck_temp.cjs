const Database = require('better-sqlite3');
const fs = require('fs');

const paths = ['pipeline.db', 'server/pipeline.db'];
paths.forEach(path => {
  try {
    const size = fs.statSync(path).size;
    const db = new Database(path, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    console.log(`\n${path} (${size} bytes) — tables: ${tables.map(t => t.name).join(', ') || '(none)'}`);
    if (tables.some(t => t.name === 'situations')) {
      const n = db.prepare('SELECT COUNT(*) as n FROM situations').get().n;
      console.log('  situations:', n);
    }
    if (tables.some(t => t.name === 'raw_events')) {
      const n = db.prepare('SELECT COUNT(*) as n FROM raw_events').get().n;
      console.log('  raw_events:', n);
    }
    if (tables.some(t => t.name === 'situation_public_confirmations')) {
      const n = db.prepare('SELECT COUNT(*) as n FROM situation_public_confirmations').get().n;
      console.log('  confirmations:', n);
    }
    db.close();
  } catch(e) {
    console.log(`${path} ERROR: ${e.message}`);
  }
});
