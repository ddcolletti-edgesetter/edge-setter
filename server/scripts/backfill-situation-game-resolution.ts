/**
 * Edge Setter — situation → game_id resolution backfill
 *
 * The `situations` table is strictly append-only (BEFORE UPDATE / BEFORE DELETE
 * triggers both RAISE(ABORT)), so a situation created with a NULL game_id can
 * never have that column filled in place. This backfill resolves the game_id
 * out-of-band and records it in the mutable `situation_game_resolution` side
 * table; readers LEFT JOIN it and COALESCE. `situations` itself is never touched.
 *
 * For every NFL/NBA/CFB situation where game_id IS NULL, we call the existing
 * findGameByTeams(league, home, away, date) — the same matcher the *-historical
 * backfill adapters use, confirmed safe for retroactive use. situations.teams is
 * stored sorted+uppercased (alphabetical, NOT home/away order) and there is no
 * game-date column, so we:
 *   - use created_at's date (YYYY-MM-DD) as the game date, and
 *   - try both team orderings, since we cannot know home vs away.
 *
 * Unresolved cases are logged, not fixed. A situation that has two teams but no
 * game match is tagged a "Fault D candidate": the known vocabulary mismatch
 * between the odds-adapter shortCode() and ESPN team abbreviations
 * (diagnostics/entity-fragmentation.sql). Those are NOT backfill bugs and are
 * explicitly out of scope for this PR — we only log and count them.
 *
 * Usage:
 *   npx tsx server/scripts/backfill-situation-game-resolution.ts            # dry-run (report only)
 *   npx tsx server/scripts/backfill-situation-game-resolution.ts --write    # insert resolutions
 */

import { findGameByTeams, getPipelineDb } from "../pipeline/store";
import { ensureSituationGameResolutionSchema } from "../pipeline/situations-store";

const TARGET_LEAGUES = ["NFL", "NBA", "CFB"] as const;

interface SituationRow {
  situation_id: string;
  league: string;
  teams_json: string;
  created_at: string;
}

type UnresolvedReason = "fault_d_candidate" | "insufficient_teams";

interface Resolved {
  situation_id: string;
  resolved_game_id: string;
}

interface Unresolved {
  situation_id: string;
  league: string;
  teams: string[];
  game_date: string;
  reason: UnresolvedReason;
}

function parseTeams(teamsJson: string): string[] {
  try {
    const parsed = JSON.parse(teamsJson);
    return Array.isArray(parsed) ? parsed.map((t) => String(t)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Ordered pairs of distinct teams — teams are stored alphabetically, so we try both directions. */
function orderedPairs(teams: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = 0; j < teams.length; j++) {
      if (i !== j) pairs.push([teams[i], teams[j]]);
    }
  }
  return pairs;
}

const write = process.argv.includes("--write");
const db = getPipelineDb();
ensureSituationGameResolutionSchema(db);

const placeholders = TARGET_LEAGUES.map(() => "?").join(", ");
const situations = db.prepare(`
  SELECT situation_id, league, teams_json, created_at
  FROM situations
  WHERE game_id IS NULL
    AND league IN (${placeholders})
  ORDER BY created_at ASC, situation_id ASC
`).all(...TARGET_LEAGUES) as SituationRow[];

const resolved: Resolved[] = [];
const unresolved: Unresolved[] = [];

for (const situation of situations) {
  const teams = parseTeams(situation.teams_json);
  const gameDate = situation.created_at.substring(0, 10);

  if (teams.length < 2) {
    unresolved.push({
      situation_id: situation.situation_id,
      league: situation.league,
      teams,
      game_date: gameDate,
      reason: "insufficient_teams",
    });
    continue;
  }

  let match: string | null = null;
  for (const [home, away] of orderedPairs(teams)) {
    const game = findGameByTeams(situation.league, home, away, gameDate);
    if (game) {
      match = game.id;
      break;
    }
  }

  if (match) {
    resolved.push({ situation_id: situation.situation_id, resolved_game_id: match });
  } else {
    // Had two teams to match on but no game found → vocabulary mismatch, not a backfill bug.
    unresolved.push({
      situation_id: situation.situation_id,
      league: situation.league,
      teams,
      game_date: gameDate,
      reason: "fault_d_candidate",
    });
  }
}

// Log every unresolved case separately (Fault D candidates are explicitly tagged).
for (const row of unresolved) {
  console.log(JSON.stringify({ unresolved: row }));
}

let inserted = 0;
if (write && resolved.length > 0) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO situation_game_resolution (situation_id, resolved_game_id)
    VALUES (?, ?)
  `);
  const runAll = db.transaction((rows: Resolved[]) => {
    for (const row of rows) {
      const result = insert.run(row.situation_id, row.resolved_game_id);
      inserted += result.changes;
    }
  });
  runAll(resolved);
}

const faultDCandidates = unresolved.filter((u) => u.reason === "fault_d_candidate").length;
const insufficientTeams = unresolved.filter((u) => u.reason === "insufficient_teams").length;

console.log(JSON.stringify({
  mode: write ? "write" : "dry-run",
  target_leagues: TARGET_LEAGUES,
  total_processed: situations.length,
  resolved: resolved.length,
  unresolved: unresolved.length,
  fault_d_candidates: faultDCandidates,
  insufficient_teams: insufficientTeams,
  inserted,
}, null, 2));
