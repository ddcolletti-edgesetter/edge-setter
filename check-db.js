const Database = require('better-sqlite3');
const db = new Database('./pipeline.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));
const leagues = db.prepare("SELECT league, COUNT(*) as count FROM raw_events GROUP BY league").all();
console.log('raw_events by league:', JSON.stringify(leagues));
const sigs = db.prepare("SELECT league, COUNT(*) as count FROM live_signals GROUP BY league").all();
console.log('live_signals by league:', JSON.stringify(sigs));
