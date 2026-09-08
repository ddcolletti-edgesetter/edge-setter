/**
 * Inspection harness for the roster-gazetteer matcher (player_candidate).
 *
 * Runs the REAL pipeline path end-to-end against a local pipeline.db:
 *   1. Seeds/refreshes roster_players from the ESPN roster API (unless already
 *      populated; force with --refresh).
 *   2. Runs ingestSportsRSSFeeds() — the same processFeed → matchRosterPlayer →
 *      setPlayerCandidate path production uses — against live team RSS feeds.
 *   3. Prints every row that got a player_candidate, grouped by confidence, next
 *      to the headline and the regex `player` value, so common-surname / ex-player
 *      / staff false positives can be eyeballed.
 *
 * Usage (local, writes to ./pipeline.db):
 *   PIPELINE_DATA_DIR=. npx tsx script/inspect-roster-candidates.ts [--refresh] [--recompute]
 *
 *   --refresh    force a fresh ESPN roster/staff pull before matching
 *   --recompute  re-run the matcher over EXISTING stored rows (deterministic —
 *                same headlines) instead of ingesting live feeds. Use this to
 *                A/B a matcher change without live-feed drift.
 *
 * Live network: hits ESPN + the team RSS feeds. Writes only to the local DB.
 */

import { getPipelineDb, getRosterSummary, getTeamRoster, getTeamStaff, setPlayerCandidate } from "../server/pipeline/store";
import { refreshAllRosters } from "../server/pipeline/adapters/espn-rosters";
import { ingestSportsRSSFeeds } from "../server/pipeline/adapters/sports-rss";
import { matchRosterPlayer } from "../server/pipeline/roster-matcher";

async function main() {
  const force = process.argv.includes("--refresh");
  const recompute = process.argv.includes("--recompute");
  const db = getPipelineDb();

  let summary = getRosterSummary();
  if (force || summary.total === 0) {
    console.log("Seeding roster_players + roster_staff from ESPN…");
    await refreshAllRosters();
    summary = getRosterSummary();
  }
  console.log(`Gazetteer: ${summary.total} players across ${summary.teams} teams (oldest updated_at: ${summary.oldestUpdatedAt})`);
  if (summary.total === 0) { console.log("!! roster empty — cannot match. Aborting."); return; }

  if (recompute) {
    // Re-score every stored RSS row against the CURRENT roster+staff. Deterministic
    // (same headlines), so a matcher/exclusion change can be compared apples-to-apples.
    const rows = db.prepare(
      `SELECT id, team, payload FROM raw_events WHERE source_type='rss' AND team IS NOT NULL AND team!=''`,
    ).all() as any[];
    const rosterCache = new Map<string, ReturnType<typeof getTeamRoster>>();
    const staffCache = new Map<string, ReturnType<typeof getTeamStaff>>();
    let rescored = 0;
    for (const r of rows) {
      const roster = rosterCache.get(r.team) ?? (rosterCache.set(r.team, getTeamRoster("NFL", r.team)), rosterCache.get(r.team)!);
      const stf = staffCache.get(r.team) ?? (staffCache.set(r.team, getTeamStaff("NFL", r.team)), staffCache.get(r.team)!);
      if (!roster.length) continue;
      const headline = safeJson(r.payload)?.headline ?? "";
      const m = matchRosterPlayer(headline, roster, stf);
      setPlayerCandidate(r.id, m?.name ?? null, m?.confidence ?? null);
      rescored++;
    }
    console.log(`\nRecomputed player_candidate over ${rescored} existing rows (staff exclusion applied).`);
  } else {
    console.log("\nRunning ingestSportsRSSFeeds() (live team feeds → real matcher path)…");
    const res = await ingestSportsRSSFeeds();
    console.log(`  ${res.created} created / ${res.skipped} skipped`);
  }

  const rows = db.prepare(
    `SELECT source_id, team, player, player_candidate, player_candidate_confidence, payload
       FROM raw_events
      WHERE source_type='rss' AND player_candidate IS NOT NULL
      ORDER BY player_candidate_confidence, source_id`,
  ).all() as any[];

  const full = rows.filter(r => r.player_candidate_confidence === "full_name");
  const last = rows.filter(r => r.player_candidate_confidence === "last_name");

  console.log(`\n════════ ${rows.length} player_candidate matches (${full.length} full_name, ${last.length} last_name) ════════`);

  const print = (label: string, list: any[]) => {
    console.log(`\n──── ${label} (${list.length}) ────`);
    for (const r of list) {
      const headline = (safeJson(r.payload)?.headline ?? "").slice(0, 90);
      const regex = r.player ? `regex=${r.player}` : "regex=∅";
      const agree = r.player && norm(r.player) === norm(r.player_candidate) ? " ✓" : "";
      console.log(`  [${String(r.team).padEnd(3)}] ${String(r.player_candidate).padEnd(24)} ${regex.padEnd(28)}${agree}`);
      console.log(`        ⇐ ${headline}`);
    }
  };
  print("FULL NAME (high confidence)", full);
  print("LAST NAME (low confidence — scrutinise for common surnames / ex-players)", last);

  console.log(`\nInspect each row above: does the candidate name actually refer to a current ${"NFL"} player on [team]?`);
}

function norm(s: string): string { return (s ?? "").toLowerCase().replace(/[^a-z]/g, ""); }
function safeJson(v: unknown): any { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return {}; } }

main().catch(e => { console.error(e); process.exit(1); });
