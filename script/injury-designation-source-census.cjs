#!/usr/bin/env node
/**
 * READ-ONLY census for the injury designation part 2 PR.
 *
 * The PR rewrites no rows. This counts, for each change, how many CURRENT
 * live_signals rows would be labelled differently if their latest event were
 * processed by the new code — i.e. what changes as rows are next touched.
 *
 *   node script/injury-designation-source-census.cjs /path/to/pipeline.db
 *
 * Opens the database with { readonly: true, fileMustExist: true }. Imports no
 * app module (importing store.ts opens the DB read-write).
 *
 * The allowlist and field logic below mirror shared/injury-designation-source.ts
 * and processor.ts payloadInjuryDesignationWithField; keep them in step.
 */
const Database = require("better-sqlite3");

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("usage: node script/injury-designation-source-census.cjs <pipeline.db>");
  process.exit(2);
}
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const OFFICIAL = new Set(["espn/NFL", "espn/NBA", "balldontlie/NBA", "mlb_statsapi/MLB"]);

function designationOf(payload) {
  for (const field of ["designation", "status"]) {
    const v = payload?.[field];
    if (typeof v === "string" && v.trim()) return { value: v.trim(), field };
  }
  return null;
}
function isOfficial(raw, read) {
  return !!read && raw.source_type === "api" && OFFICIAL.has(`${raw.source_id}/${raw.league}`);
}

const hasSourceCol = db
  .prepare("SELECT 1 FROM pragma_table_info('live_signals') WHERE name = 'injury_designation_source'")
  .get();
const rows = db.prepare(`
  SELECT id, league, signal_type, injury_designation, verdict, why_it_matters, raw_event_ids
       ${hasSourceCol ? ", injury_designation_source" : ""}
  FROM live_signals
  WHERE signal_type = 'injury_update' AND COALESCE(is_archived, 0) = 0
`).all();
const getRaw = db.prepare("SELECT id, source_id, source_type, league, payload FROM raw_events WHERE id = ?");

const c = {
  injury_rows: rows.length,
  source_column_present: !!hasSourceCol,
  rows_with_source_already: 0,
  missing_raw_events: 0,
  // 1. source column
  c1_rows_with_designation: 0,
  c1_would_get_official_source: 0,
  c1_would_get_non_official_source: 0,
  // 2. gate
  c2_questionable_total: 0,
  c2_questionable_official_latest: 0, // would show QUESTIONABLE once the row carries its source
  c2_questionable_default_or_unofficial: 0, // stays withheld
  // 3. Day-to-day
  c3_nba_questionable_from_day_to_day: 0,
  // 4. merge
  c4_null_designation_after_designated_event: 0, // a NULL event erased an earlier designation
  c4_default_overwrote_feed_designation: 0, // pre-#113: text default "Questionable" replaced a feed value
  // 5/6. verdict
  c5_confirmed_total: 0,
  c5_confirmed_would_become_likely: 0,
  c5_by_reason: {},
};
const byLeague = {};
const bump = (k, league) => {
  byLeague[league] ??= {};
  byLeague[league][k] = (byLeague[league][k] ?? 0) + 1;
};

for (const row of rows) {
  if (row.injury_designation_source) c.rows_with_source_already++;
  let ids = [];
  try { ids = JSON.parse(row.raw_event_ids ?? "[]"); } catch { /* ignore */ }
  const events = [];
  for (const id of ids) {
    const r = getRaw.get(id);
    if (!r) { c.missing_raw_events++; continue; }
    let payload = {};
    try { payload = JSON.parse(r.payload ?? "{}"); } catch { /* ignore */ }
    events.push({ ...r, payload, read: designationOf(payload) });
  }
  const latest = events[events.length - 1];
  const latestDesignated = [...events].reverse().find((e) => e.read);

  if (row.injury_designation != null) {
    c.c1_rows_with_designation++;
    if (latestDesignated && isOfficial(latestDesignated, latestDesignated.read)) c.c1_would_get_official_source++;
    else c.c1_would_get_non_official_source++;
  }

  if (row.injury_designation === "Questionable") {
    c.c2_questionable_total++;
    bump("questionable", row.league);
    const officialLatest = latest && latest.read && isOfficial(latest, latest.read);
    // Day-to-day comes back as "Day-to-day" (change 3), not QUESTIONABLE.
    const dayToDay = row.league === "NBA" && officialLatest && /day-to-day/i.test(String(latest.payload.status ?? ""));
    if (dayToDay) c.c3_nba_questionable_from_day_to_day++;
    else if (officialLatest) { c.c2_questionable_official_latest++; bump("questionable_official", row.league); }
    else c.c2_questionable_default_or_unofficial++;
  }

  if (latest && !latest.read && events.slice(0, -1).some((e) => e.read)) {
    if (row.injury_designation == null) c.c4_null_designation_after_designated_event++;
    else if (row.injury_designation === "Questionable") c.c4_default_overwrote_feed_designation++;
  }

  if (row.verdict === "confirmed") {
    c.c5_confirmed_total++;
    const d = latest?.read?.value;
    const isOut = d === "OUT" || d === "IL-60";
    const official = latest && isOfficial(latest, latest.read);
    if (!(isOut && official)) {
      c.c5_confirmed_would_become_likely++;
      const reason = d === "DNP" ? "DNP"
        : !latest ? "no_raw_event"
        : `${latest.source_type}:${latest.source_id}:${latest.league}:${d ?? "null"}`;
      c.c5_by_reason[reason] = (c.c5_by_reason[reason] ?? 0) + 1;
    }
  }
}

console.log(JSON.stringify({ db: dbPath, ...c, by_league: byLeague }, null, 2));
db.close();
