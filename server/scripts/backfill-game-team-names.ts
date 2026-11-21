/**
 * Edge Setter — fill games.home_team_name / away_team_name on CFB and NBA rows.
 *
 * See server/pipeline/team-name-backfill.ts for why rows are missing names and
 * how each one is resolved. This script loads the rows, fetches ESPN's CFB
 * scoreboards for the dates it needs, prints the plan, and with --apply writes
 * it.
 *
 * Safety:
 *   - Dry run by default. The database is opened read-only (better-sqlite3
 *     { readonly: true }) unless --apply is passed.
 *   - getPipelineDb() / store are NOT imported: store imports storage, which
 *     opens edge_setter.db read-write and runs its schema on import, and
 *     getPipelineDb() itself opens read-write and migrates.
 *   - The write only fills a missing side: SET x = COALESCE(NULLIF(x,''), ?).
 *     A name already there — including one the odds adapter writes between the
 *     plan and the apply — is never replaced. updated_at is left alone.
 *   - --apply writes a rollback file FIRST (row id, side, old value, new value
 *     for every side it is about to change, old values read inside the same
 *     transaction), then the updates; if the file cannot be written nothing is.
 *   - One transaction, busy_timeout 5000ms.
 *   - Replay hashes read the game id, live_signals and odds_snapshots only,
 *     never a games name column.
 *
 * The token-only CFB fallback is OFF unless --allow-fallback is passed. With it
 * off, the dry run still counts and lists every side it would have filled.
 *
 * Usage (on the box that holds pipeline.db):
 *   npx tsx server/scripts/backfill-game-team-names.ts                 # dry run
 *   npx tsx server/scripts/backfill-game-team-names.ts --apply         # write
 *   options: --db <path>  --league CFB|NBA  --offline (no ESPN fetches)
 *            --allow-fallback  --rollback-dir <dir> (default: the db's directory)  --json
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import {
  espnDatesFor,
  planTeamNames,
  type EspnEventLite,
  type GameNameRow,
  type NameLeague,
} from "../pipeline/team-name-backfill";

const ESPN_CFB_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
const FETCH_THROTTLE_MS = 300;

/* ─── Arguments ──────────────────────────────────────────── */

const args = process.argv.slice(2);
const WITH_VALUE = new Set(["--db", "--league", "--rollback-dir"]);
const FLAGS = new Set(["--apply", "--offline", "--json", "--allow-fallback"]);
for (let i = 0; i < args.length; i++) {
  if (WITH_VALUE.has(args[i])) { if (args[i + 1] === undefined) { console.error(`${args[i]} needs a value`); process.exit(2); } i++; continue; }
  if (!FLAGS.has(args[i])) { console.error(`unknown argument: ${args[i]}`); process.exit(2); }
}
const valueOf = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const apply = args.includes("--apply");
const offline = args.includes("--offline");
const asJson = args.includes("--json");
const allowFallback = args.includes("--allow-fallback");
const leagueArg = valueOf("--league")?.toUpperCase() ?? null;
if (leagueArg && leagueArg !== "CFB" && leagueArg !== "NBA") { console.error("--league must be CFB or NBA"); process.exit(2); }
const leagues: NameLeague[] = leagueArg ? [leagueArg as NameLeague] : ["CFB", "NBA"];
const dbPath = valueOf("--db")
  ?? [process.env.PIPELINE_DATA_DIR, process.env.DATA_DIR]
      .filter((dir): dir is string => Boolean(dir))
      .map((dir) => path.join(dir, "pipeline.db"))
      .find((file) => fs.existsSync(file));
if (!dbPath || !fs.existsSync(dbPath)) {
  console.error("pipeline.db not found. Pass --db <path>, or set PIPELINE_DATA_DIR.");
  process.exit(2);
}
const rollbackDir = valueOf("--rollback-dir") ?? path.dirname(path.resolve(dbPath));
if (apply && !fs.existsSync(rollbackDir)) { console.error(`--rollback-dir ${rollbackDir} does not exist`); process.exit(2); }

const db = new Database(dbPath, { readonly: !apply, fileMustExist: true });
db.pragma("busy_timeout = 5000");

/* ─── Load ───────────────────────────────────────────────── */

const placeholders = leagues.map(() => "?").join(",");
const NAMED = (col: string) => `(${col} IS NOT NULL AND TRIM(${col}) <> '')`;
const countFullyNamed = () => db.prepare(`
  SELECT league, COUNT(*) total, SUM(${NAMED("home_team_name")} AND ${NAMED("away_team_name")}) fully_named
  FROM games WHERE league IN (${placeholders}) GROUP BY league
`).all(...leagues) as { league: NameLeague; total: number; fully_named: number }[];
const totals = countFullyNamed();
const rows = db.prepare(`
  SELECT id, league, home_team, away_team, home_team_name, away_team_name, game_time, source_game_id
  FROM games
  WHERE league IN (${placeholders}) AND NOT (${NAMED("home_team_name")} AND ${NAMED("away_team_name")})
  ORDER BY league, game_time
`).all(...leagues) as GameNameRow[];

/* ─── ESPN (CFB only) ────────────────────────────────────── */

interface EspnScoreboard {
  events?: Array<{
    id: string;
    date: string;
    competitions?: Array<{
      competitors?: Array<{ homeAway: "home" | "away"; team: { id?: string; abbreviation?: string; displayName?: string } }>;
    }>;
  }>;
}

const eventsByDate = new Map<string, EspnEventLite[]>();
const fetchFailures: string[] = [];

async function fetchDate(date: string): Promise<void> {
  if (eventsByDate.has(date)) return;
  try {
    const res = await fetch(`${ESPN_CFB_SCOREBOARD}?dates=${date}&groups=80&limit=300`);
    if (!res.ok) { fetchFailures.push(`${date}: HTTP ${res.status}`); eventsByDate.set(date, []); return; }
    const body = (await res.json()) as EspnScoreboard;
    const events: EspnEventLite[] = [];
    for (const event of body.events ?? []) {
      const comps = event.competitions?.[0]?.competitors ?? [];
      const home = comps.find((c) => c.homeAway === "home")?.team;
      const away = comps.find((c) => c.homeAway === "away")?.team;
      if (home && away) events.push({ id: String(event.id), date: event.date, home, away });
    }
    eventsByDate.set(date, events);
  } catch (err) {
    fetchFailures.push(`${date}: ${(err as Error).message}`);
    eventsByDate.set(date, []);
  }
  await new Promise((r) => setTimeout(r, FETCH_THROTTLE_MS));
}

/* ─── Main ───────────────────────────────────────────────── */

interface RollbackEntry { id: string; side: "home" | "away"; old_value: string | null; new_value: string }

async function main() {
  const cfbRows = rows.filter((row) => row.league === "CFB");
  if (!offline && cfbRows.length) {
    const dates = [...new Set(cfbRows.flatMap((row) => espnDatesFor(row.game_time)))].sort();
    if (!asJson) console.error(`fetching ${dates.length} ESPN CFB scoreboard date(s)…`);
    for (const date of dates) await fetchDate(date);
  }
  const eventsFor = offline
    ? null
    : (row: GameNameRow) => espnDatesFor(row.game_time).flatMap((date) => eventsByDate.get(date) ?? []);

  const plan = planTeamNames(rows, eventsFor, { allowFallback });

  const report = leagues.map((league) => {
    const t = totals.find((x) => x.league === league) ?? { total: 0, fully_named: 0 };
    const missing = rows.filter((row) => row.league === league);
    const ups = plan.updates.filter((u) => u.league === league);
    const unres = plan.unresolved.filter((u) => u.league === league);
    const unresolvedRows = new Set(unres.map((u) => u.id));
    const updatedRows = new Set(ups.map((u) => u.id));
    const fb = plan.fallbackCandidates.filter((c) => missing.some((row) => row.id === c.id));
    const byMethod: Record<string, number> = {};
    for (const u of ups) for (const m of u.methods) byMethod[m] = (byMethod[m] ?? 0) + 1;
    const byReason: Record<string, number> = {};
    for (const u of unres) byReason[u.reason] = (byReason[u.reason] ?? 0) + 1;
    const tokens: Record<string, number> = {};
    for (const u of unres) tokens[u.token] = (tokens[u.token] ?? 0) + 1;
    return {
      counts: {
        league,
        rows_total: t.total,
        fully_named_before: t.fully_named,
        rows_missing_a_name: missing.length,
        rows_filled: ups.filter((u) => !unresolvedRows.has(u.id)).length,
        rows_partly_filled: ups.filter((u) => unresolvedRows.has(u.id)).length,
        rows_unresolved: missing.filter((row) => unresolvedRows.has(row.id) && !updatedRows.has(row.id)).length,
        sides_unresolved: unres.length,
        fully_named_after_plan: t.fully_named + ups.filter((u) => !unresolvedRows.has(u.id)).length,
        fallback_would_fill_sides: fb.length,
        fallback_would_fill_rows: new Set(fb.map((c) => c.id)).size,
      },
      filled_by_method: byMethod,
      unresolved_sides_by_reason: byReason,
      unresolved_tokens: Object.fromEntries(Object.entries(tokens).sort((a, b) => b[1] - a[1])),
    };
  });
  // NBA: every code the map does not hold, listed in full (no near-matching).
  const nbaUnknownCodes: Record<string, number> = {};
  for (const u of plan.unresolved) if (u.reason === "unknown_nba_code") nbaUnknownCodes[u.token] = (nbaUnknownCodes[u.token] ?? 0) + 1;

  let rollbackFile: string | null = null;
  let written = 0;
  if (apply) {
    const read = db.prepare(`SELECT home_team_name, away_team_name FROM games WHERE id = ?`);
    const update = db.prepare(`
      UPDATE games SET
        home_team_name = COALESCE(NULLIF(TRIM(home_team_name), ''), ?),
        away_team_name = COALESCE(NULLIF(TRIM(away_team_name), ''), ?)
      WHERE id = ?
    `);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    rollbackFile = path.join(rollbackDir, `team-name-backfill-rollback-${stamp}.json`);
    db.transaction(() => {
      const entries: RollbackEntry[] = [];
      for (const u of plan.updates) {
        const cur = read.get(u.id) as { home_team_name: string | null; away_team_name: string | null } | undefined;
        if (!cur) continue;
        if (u.home_team_name && !cur.home_team_name?.trim()) entries.push({ id: u.id, side: "home", old_value: cur.home_team_name, new_value: u.home_team_name });
        if (u.away_team_name && !cur.away_team_name?.trim()) entries.push({ id: u.id, side: "away", old_value: cur.away_team_name, new_value: u.away_team_name });
      }
      // Written before any UPDATE: a failure here throws and the transaction rolls back.
      fs.writeFileSync(rollbackFile!, JSON.stringify({ db: path.resolve(dbPath!), written_at: new Date().toISOString(), entries }, null, 2), { flag: "wx" });
      for (const u of plan.updates) written += update.run(u.home_team_name, u.away_team_name, u.id).changes;
    })();
    const after = countFullyNamed();
    for (const r of report) (r.counts as Record<string, unknown>).fully_named_after_measured = after.find((a) => a.league === r.counts.league)?.fully_named ?? 0;
  }

  if (asJson) {
    console.log(JSON.stringify({
      mode: apply ? "apply" : "dry-run", offline, allow_fallback: allowFallback,
      report, nba_unknown_codes: nbaUnknownCodes, espn_fetch_failures: fetchFailures,
      rollback_file: rollbackFile, rows_written: apply ? written : 0,
      updates: plan.updates, unresolved: plan.unresolved, fallback_candidates: plan.fallbackCandidates,
    }, null, 2));
  } else {
    console.log(`\nmode: ${apply ? "APPLY" : "dry run (nothing written; pass --apply to write)"}` +
      `${offline ? ", offline (no ESPN)" : ""}, token-only fallback ${allowFallback ? "ON" : "OFF"}`);
    for (const r of report) {
      console.log(`\n== ${r.counts.league}`);
      console.table([r.counts]);
      console.log("filled by method:", r.filled_by_method);
      console.log("unresolved sides by reason:", r.unresolved_sides_by_reason);
      console.log("unresolved tokens:", r.unresolved_tokens);
    }
    if (leagues.includes("NBA")) {
      console.log("\nNBA codes the map does not hold (exact match only):",
        Object.keys(nbaUnknownCodes).length ? nbaUnknownCodes : "none");
    }
    if (!allowFallback && plan.fallbackCandidates.length) {
      console.log(`\nsides the token-only fallback WOULD fill with --allow-fallback (${plan.fallbackCandidates.length}):`);
      console.table(plan.fallbackCandidates);
    }
    const sample = plan.unresolved.slice(0, 20);
    if (sample.length) { console.log("\nunresolved sample (first 20; --json lists all):"); console.table(sample); }
    if (fetchFailures.length) console.log(`\nESPN fetch failures (${fetchFailures.length}):`, fetchFailures.slice(0, 10));
    if (apply) console.log(`\napplied: ${written} row(s) updated in one transaction\nrollback file: ${rollbackFile}`);
  }
  db.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
