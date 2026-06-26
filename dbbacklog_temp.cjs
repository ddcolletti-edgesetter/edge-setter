// raw_events has created_at and received_at, not ingested_at — try both
const Database = require('better-sqlite3');
const db = new Database('server/pipeline.db', { readonly: true });

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
console.log('Tables:', tables.join(', '));

if (tables.includes('raw_events')) {
  const cols = db.prepare("PRAGMA table_info(raw_events)").all().map(r => r.name);
  console.log('raw_events columns:', cols.join(', '));
}
db.close();
