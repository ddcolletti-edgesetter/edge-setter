/**
 * Edge Setter — One-off backfill: roster-gazetteer player_candidate
 *
 * PR #45 (server/pipeline/roster-matcher.ts) writes raw_events.player_candidate
 * only on NEW RSS ingestion via sports-rss.ts. It never touches rows that were
 * ingested before the matcher shipped. This script reprocesses those historical
 * rows through the SAME matcher + write path, so the coverage the live path now
 * produces is applied retroactively.
 *
 * What it does (mirrors the live path in sports-rss.processFeed exactly):
 *   1. Selects raw_events WHERE source_type='rss' AND team IS NOT NULL
 *      AND (player IS NULL OR player='') AND player_candidate IS NULL.
 *   2. For each row, runs matchRosterPlayer(headline, roster, staff) against the
 *      row's stored payload.headline (== the original RSS item.title the live
 *      path matched) and the row team's CURRENT roster + staff.
 *   3. Calls setPlayerCandidate(id, name, confidence) for any match — the same
 *      call the live path makes at sports-rss.ts.
 *   4. Logs progress and a final count of rows rescued.
 *   5. --dry-run reports the same counts WITHOUT writing anything.
 *
 * It does NOT modify roster-matcher.ts or the live ingestion path. It is purely
 * reprocessing of historical rows through the existing, unchanged matcher.
 *
 * Usage:
 *   local  :  PIPELINE_DATA_DIR=.         npx tsx script/backfill-player-candidates.ts --dry-run
 *             PIPELINE_DATA_DIR=.         npx tsx script/backfill-player-candidates.ts
 *   Render :  PIPELINE_DATA_DIR=/var/data npx tsx script/backfill-player-candidates.ts --dry-run
 *             PIPELINE_DATA_DIR=/var/data npx tsx script/backfill-player-candidates.ts
 *
 * Always dry-run first: the dry run reads only and prints exactly what a real run
 * would write. Uses getPipelineDb() so it honours PIPELINE_DATA_DIR / DATA_DIR
 * the same way production does.
 */

import {
  getPipelineDb,
  getTeamRoster,
  getTeamStaff,
  setPlayerCandidate,
  getRosterSummary,
  type RosterPlayer,
  type RosterStaff,
} from "../server/pipeline/store";
import { matchRosterPlayer } from "../server/pipeline/roster-matcher";

interface BackfillRow {
  id: string;
  league: string;
  team: string;
  player: string | null;
  payload: string;
}

function safeJson(v: unknown): any {
  if (typeof v !== "string") return v ?? {};
  try { return JSON.parse(v); } catch { return {}; }
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = getPipelineDb();

  // The matcher can only produce a candidate if the gazetteer is populated. Warn
  // loudly rather than silently "rescuing" 0 rows against an empty roster table.
  const summary = getRosterSummary();
  console.log(`Gazetteer: ${summary.total} players across ${summary.teams} teams (oldest updated_at: ${summary.oldestUpdatedAt ?? "n/a"})`);
  if (summary.total === 0) {
    console.log("!! roster_players is empty — matcher cannot match anything.");
    console.log("   Seed it first (refreshAllRosters / inspect-roster-candidates --refresh), then re-run.");
    return;
  }

  console.log(`\nMode: ${dryRun ? "DRY RUN (no writes)" : "LIVE (will write player_candidate)"}`);

  // Exactly the target set from the task: RSS rows with a team, no regex player,
  // and no candidate yet. player='' is treated as unset, same as the live path's
  // `player ?? null`. player_candidate IS NULL excludes rows the matcher (live or
  // a previous backfill run) already scored, so re-runs are idempotent.
  const rows = db.prepare(
    `SELECT id, league, team, player, payload
       FROM raw_events
      WHERE source_type = 'rss'
        AND team IS NOT NULL
        AND (player IS NULL OR player = '')
        AND player_candidate IS NULL
      ORDER BY received_at ASC`,
  ).all() as BackfillRow[];

  console.log(`Candidate rows to reprocess: ${rows.length}\n`);
  if (rows.length === 0) { console.log("Nothing to backfill."); return; }

  // Roster + staff are team-scoped and looked up once per (league, team), exactly
  // like processFeed loads them once per feed. Cached so a team with hundreds of
  // rows hits SQLite once, not once per row.
  const rosterCache = new Map<string, RosterPlayer[]>();
  const staffCache = new Map<string, RosterStaff[]>();
  const getRoster = (league: string, team: string): RosterPlayer[] => {
    const key = `${league}|${team}`;
    let r = rosterCache.get(key);
    if (!r) { r = getTeamRoster(league, team); rosterCache.set(key, r); }
    return r;
  };
  const getStaff = (league: string, team: string): RosterStaff[] => {
    const key = `${league}|${team}`;
    let s = staffCache.get(key);
    if (!s) { s = getTeamStaff(league, team); staffCache.set(key, s); }
    return s;
  };

  let scanned = 0;
  let noRoster = 0;   // team has no gazetteer (e.g. CFB, deferred) — cannot match
  let noHeadline = 0; // row payload has no headline to match against
  let rescuedFull = 0;
  let rescuedLast = 0;
  const PROGRESS_EVERY = 200;

  for (const row of rows) {
    scanned++;

    const roster = getRoster(row.league, row.team);
    if (roster.length === 0) { noRoster++; }
    else {
      const headline: string = safeJson(row.payload)?.headline ?? "";
      if (!headline) { noHeadline++; }
      else {
        const staff = getStaff(row.league, row.team);
        // Identical call to the live path in sports-rss.processFeed.
        const match = matchRosterPlayer(headline, roster, staff);
        if (match) {
          if (match.confidence === "full_name") rescuedFull++; else rescuedLast++;
          console.log(
            `  ${dryRun ? "[dry] would set" : "[set]"} ` +
            `${row.league}/${String(row.team).padEnd(3)} ` +
            `${match.name.padEnd(24)} (${match.confidence})  ⇐ ${headline.slice(0, 80)}`,
          );
          if (!dryRun) setPlayerCandidate(row.id, match.name, match.confidence);
        }
      }
    }

    if (scanned % PROGRESS_EVERY === 0) {
      console.log(`  … ${scanned}/${rows.length} scanned, ${rescuedFull + rescuedLast} matched so far`);
    }
  }

  const rescued = rescuedFull + rescuedLast;
  console.log(`\n════════ Backfill ${dryRun ? "DRY RUN" : "complete"} ════════`);
  console.log(`  rows scanned            : ${scanned}`);
  console.log(`  skipped (no team roster): ${noRoster}`);
  console.log(`  skipped (no headline)   : ${noHeadline}`);
  console.log(`  matched                 : ${rescued}  (${rescuedFull} full_name, ${rescuedLast} last_name)`);
  console.log(`  rows ${dryRun ? "that WOULD be rescued" : "rescued (player_candidate written)"}: ${rescued}`);
  if (dryRun) console.log(`\n(dry run — no rows written. Re-run without --dry-run to apply.)`);
}

main();
