/**
 * Edge Setter — operator script: re-baseline openers that were never observed.
 *
 * WHY this exists and WHAT it decides is in
 * server/pipeline/odds-open-rebaseline.ts — read that header first. This file
 * is only the command line: it parses flags, prints a plan, and writes nothing
 * unless told to.
 *
 * READ THIS PART EVEN IF YOU READ NOTHING ELSE. The odds adapter will NOT fix
 * these games by itself. It only looks at the stretch between a game's newest
 * stored line and the one in its hand, because looking at the whole history
 * every cycle costs 802ms per CFB slate to answer a question that cannot have
 * changed. The games this repairs crossed their hole weeks ago and have been
 * ingested hourly ever since, so to the adapter they look perfectly healthy.
 * Deploying the change without running this script leaves every one of them
 * carrying its August opener until it kicks off.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HOW TO RUN IT — click by click, no coding needed
 *
 * You will do this in Render's web dashboard. Nothing here needs a terminal on
 * your own computer, and nothing here is permanent until step 6.
 *
 *  1. Open https://dashboard.render.com and sign in.
 *  2. Click the `edge-setter` service in the list.
 *  3. In the left-hand menu of that service, click **Shell**. A black box
 *     appears with a blinking cursor. That is a prompt on the live machine.
 *  4. Click inside the black box, then type this ONE line and press Enter:
 *
 *         npx tsx script/rebaseline-stale-openers.ts
 *
 *     Nothing is changed by this. It is the DRY RUN. It prints:
 *       - a census of every future NFL and CFB game with an opener, bucketed
 *         by what it decided and why;
 *       - one line per game it WOULD change: the game id, the opener it has
 *         now, the opener it would get, and how long the hole was;
 *       - the same for the games it is leaving alone, so you can see the
 *         ones it declined and why.
 *
 *  5. Read the `rebaseline` count. That is how many games would change. If it
 *     is 0, there is nothing to do and nothing has happened. If the per-game
 *     lines look wrong to you, stop here and nothing has happened.
 *
 *  6. When the numbers look right, run it for real by adding `--apply`:
 *
 *         npx tsx script/rebaseline-stale-openers.ts --apply
 *
 *     This one DOES change the database. It prints the same lines plus a
 *     `written` count. Every write is also logged by the server's own
 *     `[odds-open]` prefix, so Render's log search finds them later.
 *
 *     To go one league at a time, add `--league NFL` or `--league CFB`.
 *
 *  7. There is nothing to wait for afterwards. These columns are read per
 *     request; the 60-second leaderboard cache does not hold them.
 *
 * WHAT IT WILL NOT DO, whatever you type:
 *   - it will not touch a game that has kicked off (rebaselineGameOpen checks
 *     game_time itself, so the #87 kickoff guard wins);
 *   - it will not touch a finished game;
 *   - it will not touch any column but open_spread and open_total;
 *   - it will not touch a stored signal, so no replay hash moves;
 *   - it will not invent a number: every new opener is a line that is sitting
 *     in odds_snapshots because we observed it.
 *
 * IF YOU CHANGE YOUR MIND. There is no --reverse, because the value being
 * replaced is kept: each `[odds-open]` log line carries `from_spread` and
 * `from_total`, and the dry run printed them too. Put one back by hand if you
 * ever need to.
 *
 * RE-RUNNING IS SAFE. A game whose opener already matches its post-gap line is
 * reported as `skip_already_correct` and not written, so a second --apply run
 * reports `written: 0`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   npx tsx script/rebaseline-stale-openers.ts [--league NFL|CFB|NBA|MLB]
 *                                              [--days N] [--apply]
 *                                              [--limit N] [--all]
 *
 * PACING. This is not the Deploy 2 sweep. The candidate set is tens of rows,
 * not tens of thousands, and each write is a single UPDATE on a primary key —
 * so there is no chunking to tune. What it does share is an explicit
 * busy_timeout, because nothing else in this repo sets one and the default
 * leaves a blocked write to die at better-sqlite3's 5,000ms, which is also
 * Render's health-check budget.
 */

import {
  planOpenerRepair,
  rebaselineGameOpen,
  oddsOpenRebaselineDays,
  REPAIR_LEAGUES,
  REPAIR_DEFAULT_LEAGUES,
  type RepairLeague,
  type RepairCandidate,
  type RepairVerdict,
} from "../server/pipeline/odds-open-rebaseline";
import { getPipelineDb } from "../server/pipeline/store";

interface Args {
  leagues: readonly RepairLeague[];
  days: number;
  apply: boolean;
  limit: number | null;
  /** Print every skipped game, not just a count per bucket. */
  all: boolean;
}

function usage(message?: string): never {
  if (message) console.error(`\n  ERROR: ${message}`);
  console.error(`
  Usage:
    npx tsx script/rebaseline-stale-openers.ts [options]

  Options:
    --league <L>  One of ${REPAIR_LEAGUES.join(", ")}. Repeatable.
                  Default: ${REPAIR_DEFAULT_LEAGUES.join(", ")}.
    --days <N>    Gap length that disqualifies an opener, in days.
                  Default: ODDS_OPEN_REBASELINE_DAYS, or 3.
    --apply       Actually write. WITHOUT THIS NOTHING IS CHANGED.
    --limit <N>   Write at most N games. Use it for the first real run.
    --all         List every skipped game, not just the bucket counts.
    --help

  Run it with no options first: that is the dry run.
`);
  process.exit(message ? 2 : 0);
}

function parseArgs(argv: string[]): Args {
  const leagues: RepairLeague[] = [];
  const args: Args = { leagues: REPAIR_DEFAULT_LEAGUES, days: oddsOpenRebaselineDays(), apply: false, limit: null, all: false };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) usage(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case "--league": {
        const v = next().toUpperCase() as RepairLeague;
        if (!(REPAIR_LEAGUES as readonly string[]).includes(v)) {
          usage(`unknown league "${v}" — expected one of ${REPAIR_LEAGUES.join(", ")}`);
        }
        if (!leagues.includes(v)) leagues.push(v);
        break;
      }
      case "--days": {
        const n = Number(next());
        if (!Number.isFinite(n) || n <= 0) usage("--days must be a positive number");
        args.days = n;
        break;
      }
      case "--limit": {
        const n = Number(next());
        if (!Number.isFinite(n) || n < 1) usage("--limit must be a positive number");
        args.limit = Math.round(n);
        break;
      }
      case "--apply": args.apply = true; break;
      case "--all":   args.all = true; break;
      case "--help": case "-h": usage(); break;
      // A silent typo on a script that writes to prod is worse than a refusal.
      default: usage(`unrecognised option "${a}"`);
    }
  }

  if (leagues.length > 0) args.leagues = leagues;
  return args;
}

const num = (v: number | null): string => (v === null ? "—" : String(v));

function describe(c: RepairCandidate): string {
  const when = c.game_time.slice(0, 16).replace("T", " ");
  const gap = c.gap_days === null ? "no gap" : `${c.gap_days}d gap`;
  const window = c.gap_from
    ? `${c.gap_from.slice(0, 10)} → ${c.gap_to ? c.gap_to.slice(0, 10) : "now"}`
    : "—";
  return (
    `  ${c.game_id.padEnd(28)} ${when}  ` +
    `open ${num(c.open_spread).padStart(6)}/${num(c.open_total).padStart(5)}` +
    ` → ${num(c.new_open_spread).padStart(6)}/${num(c.new_open_total).padStart(5)}` +
    `  cur ${num(c.spread_line).padStart(6)}` +
    `  ${gap} (${window})  ${c.status}`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // The same handle the server resolves — PIPELINE_DATA_DIR, then DATA_DIR,
  // then /tmp. Going through the store rather than opening a path by hand is
  // what keeps this script off the /tmp fallback the Sept 2026 incident found.
  const db = getPipelineDb();
  db.pragma("busy_timeout = 5000");

  const nowIso = new Date().toISOString();

  console.log(`\n=== Opener re-baseline ${args.apply ? "— APPLY" : "— DRY RUN (nothing is written)"} ===`);
  console.log(`  leagues   : ${args.leagues.join(", ")}`);
  console.log(`  threshold : ${args.days} day(s)`);
  console.log(`  as of     : ${nowIso}`);
  if (args.limit !== null) console.log(`  limit     : ${args.limit} game(s)`);

  const plan = planOpenerRepair({ leagues: args.leagues, nowIso, thresholdDays: args.days, db });

  const buckets = new Map<RepairVerdict, RepairCandidate[]>();
  for (const c of plan) {
    const list = buckets.get(c.verdict) ?? [];
    list.push(c);
    buckets.set(c.verdict, list);
  }

  console.log(`\n  ${plan.length} future game(s) with an opener in scope:`);
  for (const verdict of [
    "rebaseline", "skip_observed", "skip_league_silent",
    "skip_no_post_gap_line", "skip_already_correct",
  ] as RepairVerdict[]) {
    console.log(`    ${verdict.padEnd(24)} ${String(buckets.get(verdict)?.length ?? 0).padStart(5)}`);
  }

  const todo = buckets.get("rebaseline") ?? [];
  if (todo.length > 0) {
    console.log(`\n  WOULD RE-BASELINE (${todo.length}):`);
    for (const c of todo) console.log(describe(c));
  }

  if (args.all) {
    for (const verdict of ["skip_league_silent", "skip_no_post_gap_line", "skip_already_correct", "skip_observed"] as RepairVerdict[]) {
      const list = buckets.get(verdict) ?? [];
      if (list.length === 0) continue;
      console.log(`\n  ${verdict} (${list.length}):`);
      for (const c of list) console.log(describe(c));
    }
  }

  if (!args.apply) {
    console.log(`\n  DRY RUN — nothing written. Add --apply to write.\n`);
    return;
  }

  let written = 0;
  const refused: string[] = [];
  for (const c of todo) {
    if (args.limit !== null && written >= args.limit) break;
    const result = rebaselineGameOpen(
      c.game_id,
      c.new_open_spread,
      c.new_open_total,
      `one-time repair: ${c.gap_days}d observation gap (threshold ${args.days}d), league still ingesting`,
      { db },
    );
    if (result.written) written++;
    else refused.push(`${c.game_id} (${result.reason})`);
  }

  console.log(`\n  written  : ${written}`);
  if (refused.length > 0) {
    // Not an error. A game that kicked off between the plan and the write is
    // refused by rebaselineGameOpen on purpose, and saying so beats silence.
    console.log(`  refused  : ${refused.length}`);
    for (const r of refused) console.log(`    ${r}`);
  }
  if (args.limit !== null && todo.length > written + refused.length) {
    console.log(`  remaining: ${todo.length - written - refused.length} (raise or drop --limit)`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
