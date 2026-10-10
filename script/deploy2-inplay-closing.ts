/**
 * Edge Setter — Deploy 2 operator script: exclude outcomes graded against an
 * in-play line, and put them back if we change our mind.
 *
 * WHY this exists and WHAT it does is in
 * server/pipeline/inplay-closing-exclusion.ts — read that header first. This
 * file is only the command line: it parses flags, prints a plan, and writes
 * nothing unless told to.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HOW TO RUN IT — click by click, no coding needed
 *
 * You will do this in Render's web dashboard. Nothing here needs a terminal on
 * your own computer, and nothing here is permanent until step 7.
 *
 *  1. Open https://dashboard.render.com and sign in.
 *  2. Click the `edge-setter` service in the list.
 *  3. In the left-hand menu of that service, click **Shell**. A black box
 *     appears with a blinking cursor. That is a prompt on the live machine.
 *  4. Click inside the black box, then type this line and press Enter:
 *
 *         npx tsx script/deploy2-inplay-closing.ts
 *
 *     Nothing is changed by this. It is the DRY RUN — it only looks and
 *     reports. It takes a few seconds and then prints:
 *       - a BEFORE block of counts,
 *       - how many rows it WOULD flag,
 *       - an AFTER block showing what those counts would become,
 *       - up to 10 example rows so you can eyeball them.
 *
 *  5. Read the line that says `accuracy_eligible`. That is how many settled
 *     results the public accuracy numbers are computed from. The BEFORE and
 *     AFTER values tell you exactly how much the published numbers will move.
 *     If that drop looks wrong to you, stop here and nothing has happened.
 *
 *  6. Do one league first, so the first real write is small. Type:
 *
 *         npx tsx script/deploy2-inplay-closing.ts --league CFB
 *
 *     and read the same blocks again, for CFB only.
 *
 *  7. When the numbers look right, run it for real by adding `--write`:
 *
 *         npx tsx script/deploy2-inplay-closing.ts --league CFB --write
 *
 *     This one DOES change the database. It prints the same blocks, with AFTER
 *     now being measured rather than predicted, plus `pipeline_changed` and
 *     `storage_changed` — the number of rows actually touched in each of the
 *     two databases.
 *
 *  8. Repeat step 7 for `--league NFL`, `--league NBA`, `--league MLB`. Or drop
 *     `--league` entirely to do everything that is left in one pass.
 *
 *  9. Wait one minute, then load https://edgesetter.net/sources and check the
 *     numbers moved. The one-minute wait is not superstition: the leaderboard
 *     is cached for 60 seconds inside the running server, and a script started
 *     from the Shell is a SEPARATE process that cannot reach into that cache.
 *     Waiting is the whole fix. (Restarting the service also works and is not
 *     necessary.)
 *
 * IF YOU CHANGE YOUR MIND. Every row this script flags is tagged
 * `inplay_closing`, and `--reverse` releases exactly those and nothing else:
 *
 *         npx tsx script/deploy2-inplay-closing.ts --reverse
 *         npx tsx script/deploy2-inplay-closing.ts --reverse --write
 *
 *     Rows excluded for OTHER reasons — in particular the null-game stale
 *     matches from the earlier settlement cleanup — stay excluded. The reverse
 *     cannot touch them, by construction, and there is a test that proves it.
 *     No row is ever deleted by either direction.
 *
 * IF SOMETHING LOOKS WRONG MID-RUN. Press Ctrl+C. The work is committed in
 * batches of 500 rows, so you keep whatever finished and lose nothing else;
 * re-running continues from where it stopped, and re-running after a COMPLETED
 * run does nothing at all.
 *
 *     If a run was interrupted, the NEXT run prints a line beginning "NOTE: N
 *     row(s) are out of step between the two databases". That is expected after
 *     a Ctrl+C, and running the same command again with --write fixes it — even
 *     when it reports 0 rows to change.
 *
 * ONE THING TO KNOW. This runs against the live databases while the site is
 * serving traffic. That is safe here — SQLite is in WAL mode, the writes are
 * short 500-row batches, and the loop is given a turn between every batch — but
 * it is the reason to do a dry run first and one league at a time.
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   npx tsx script/deploy2-inplay-closing.ts [--league CFB|NFL|NBA|MLB]
 *                                            [--reverse] [--write] [--force]
 *                                            [--chunk N] [--pause-ms N]
 *                                            [--max-rows N] [--samples N]
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PACING, AND WHY THE DEFAULTS ARE WHAT THEY ARE
 *
 * The one way this job can hurt the live service is by holding a database
 * write lock while the app wants it. Nothing in this repo sets busy_timeout, so
 * a blocked main-thread write waits out better-sqlite3's 5,000ms default and
 * then throws SQLITE_BUSY — and 5s is also Render's health-check budget. Three
 * defaults bound that, and each is tunable DOWNWARD only where it matters:
 *
 *   --chunk      500 rows, and 500 is also the MAXIMUM. A bigger batch holds
 *                the lock proportionally longer and buys nothing: the job is
 *                minutes either way. A larger value is clamped, with a notice.
 *   --pause-ms   250ms of real sleep between chunks. Not a setImmediate — the
 *                app is a different process, so what it needs is wall-clock
 *                time during which the lock is actually free. SQLite's busy
 *                handler is a retry loop, not a fair queue, so without a pause
 *                the app has to win a race on every retry.
 *   --max-rows   no cap by default. Set it for the first real run so the first
 *                write is small and bounded; the dry run prints the cap and how
 *                many rows are left over.
 *
 * This script sets busy_timeout = 5000 EXPLICITLY on both handles at startup
 * (applySweepBusyTimeout). That is the same number better-sqlite3 would have
 * used anyway, so it changes no behaviour — the point is that the value is
 * stated and pinned in our code instead of inherited from a dependency default,
 * and that PRAGMA busy_timeout is visible to anyone inspecting the session.
 *
 * Every run prints its measured lock-hold per chunk and the worst chunk at the
 * end. If the worst chunk ever approaches 5,000ms, the app was at risk — lower
 * --chunk, raise --pause-ms, and say so.
 *
 * QUIET HOURS. The ingestion scheduler's active window is 12:00-06:59 UTC, so
 * the standard cycle (which owns odds and settlement) and the fast cycle both
 * skip between 07:00 and 11:59 UTC. That is when to run this. Outside that
 * window the script warns, and a --write run refuses unless you add --force.
 * Note the window is not write-free even so: site-watch writes storage.db every
 * 5 minutes, distribution-draft every 30, and a deploy restarts the full boot
 * cycle regardless of the hour.
 * ────────────────────────────────────────────────────────────────────────────
 */
import {
  runSweep,
  applySweepBusyTimeout,
  SWEEP_LEAGUES,
  SWEEP_CHUNK_MAX,
  SWEEP_PAUSE_MS_DEFAULT,
  SWEEP_PAUSE_MS_MAX,
  SWEEP_BUSY_TIMEOUT_MS,
  INPLAY_CLOSING_REASON,
  type SweepCounts,
  type SweepDirection,
  type SweepLeague,
  type CandidateRow,
} from "../server/pipeline/inplay-closing-exclusion";

interface Args {
  league: SweepLeague | null;
  direction: SweepDirection;
  write: boolean;
  chunk: number;
  /** What was typed, before clamping — so main() can report the clamp. */
  chunkRequested: number;
  pauseMs: number;
  maxRows: number | null;
  samples: number;
  /** Run outside the quiet window anyway. */
  force: boolean;
}

/** Hours (UTC, inclusive) in which the ingestion scheduler runs nothing. */
const QUIET_START_UTC = 7;
const QUIET_END_UTC = 11;

function inQuietWindow(now: Date = new Date()): boolean {
  const h = now.getUTCHours();
  return h >= QUIET_START_UTC && h <= QUIET_END_UTC;
}

function usage(message?: string): never {
  if (message) console.error(`\n  ERROR: ${message}`);
  console.error(`
  Usage:
    npx tsx script/deploy2-inplay-closing.ts [options]

  Options:
    --league <L>    One of ${SWEEP_LEAGUES.join(", ")}. Omit for all leagues.
    --reverse       Release rows this sweep flagged, instead of flagging rows.
    --write         Actually write. WITHOUT THIS NOTHING IS CHANGED.
    --chunk <N>     Rows per transaction (default ${SWEEP_CHUNK_MAX}, max ${SWEEP_CHUNK_MAX}).
    --pause-ms <N>  Sleep between chunks (default ${SWEEP_PAUSE_MS_DEFAULT}, max ${SWEEP_PAUSE_MS_MAX}).
    --max-rows <N>  Stop after N rows. Use this for the first real run.
    --samples <N>   Example rows to print (default 10).
    --force         Run outside the ${QUIET_START_UTC}:00-${QUIET_END_UTC}:59 UTC quiet window anyway.
    --help

  Run it with no options first: that is the dry run.
`);
  process.exit(message ? 2 : 0);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    league: null, direction: "forward", write: false,
    chunk: SWEEP_CHUNK_MAX, chunkRequested: SWEEP_CHUNK_MAX,
    pauseMs: SWEEP_PAUSE_MS_DEFAULT, maxRows: null,
    samples: 10, force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) usage(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case "--league": {
        const v = next().toUpperCase() as SweepLeague;
        if (!(SWEEP_LEAGUES as readonly string[]).includes(v)) {
          usage(`unknown league "${v}" — expected one of ${SWEEP_LEAGUES.join(", ")}`);
        }
        args.league = v;
        break;
      }
      case "--reverse": args.direction = "reverse"; break;
      case "--write":   args.write = true; break;
      case "--chunk": {
        const n = Number(next());
        if (!Number.isFinite(n) || n < 1) usage("--chunk must be a positive number");
        args.chunkRequested = Math.round(n);
        // Clamped rather than refused: a value above the max is a typo, and the
        // safe response to a typo on a job that writes to prod is to do the
        // small thing and say so. main() prints the clamp when it bites.
        args.chunk = Math.min(SWEEP_CHUNK_MAX, Math.round(n));
        break;
      }
      case "--pause-ms": {
        const n = Number(next());
        if (!Number.isFinite(n) || n < 0) usage("--pause-ms must be 0 or more");
        if (n > SWEEP_PAUSE_MS_MAX) usage(`--pause-ms must be at most ${SWEEP_PAUSE_MS_MAX}`);
        args.pauseMs = Math.round(n);
        break;
      }
      case "--max-rows": {
        const n = Number(next());
        if (!Number.isFinite(n) || n < 1) usage("--max-rows must be a positive number");
        args.maxRows = Math.round(n);
        break;
      }
      case "--force": args.force = true; break;
      case "--samples": {
        const n = Number(next());
        if (!Number.isFinite(n) || n < 0) usage("--samples must be 0 or more");
        args.samples = Math.round(n);
        break;
      }
      case "--help": case "-h": usage(); break;
      // A silent typo on a script that writes to prod is worse than a refusal.
      default: usage(`unrecognised option "${a}"`);
    }
  }
  return args;
}

const COUNT_LABELS: Array<[keyof SweepCounts, string]> = [
  ["accuracy_eligible",       "settled results the public accuracy numbers use"],
  ["pipeline_excluded_total", "pipeline.db  outcomes excluded (any reason)"],
  ["pipeline_inplay_closing", `pipeline.db  outcomes excluded as ${INPLAY_CLOSING_REASON}`],
  ["storage_excluded_total",  "storage.db   settled_outcomes excluded (any reason)"],
  ["storage_inplay_closing",  `storage.db   settled_outcomes excluded as ${INPLAY_CLOSING_REASON}`],
];

function printCounts(title: string, counts: SweepCounts, compareTo?: SweepCounts): void {
  console.log(`\n  ${title}`);
  for (const [key, label] of COUNT_LABELS) {
    const value = counts[key];
    let delta = "";
    if (compareTo) {
      const d = value - compareTo[key];
      delta = d === 0 ? "            " : `  (${d > 0 ? "+" : ""}${d})`.padEnd(12);
    }
    console.log(`    ${String(value).padStart(8)}${delta}  ${label}`);
  }
}

function printSamples(rows: CandidateRow[], limit: number): void {
  if (limit === 0) return;
  if (rows.length === 0) {
    console.log("\n  No example rows — nothing matched.");
    return;
  }
  const shown = rows.slice(0, limit);
  console.log(`\n  EXAMPLE ROWS (${shown.length} of ${rows.length})`);
  for (const r of shown) {
    const graded = r.hit === null ? "ungraded" : r.hit ? "counted as a WIN" : "counted as a LOSS";
    console.log(
      `    ${r.league.padEnd(4)} ${r.signal_type.padEnd(15)} game=${r.game_id}`,
    );
    console.log(
      `         kickoff ${r.game_time ?? "?"}  newest odds ${r.newest_snapshot_at ?? "?"}`,
    );
    console.log(
      `         closing_line=${r.closing_line ?? "—"} clv=${r.clv ?? "—"} → ${graded}`,
    );
  }
}

/**
 * The measured cost of this run to anyone else wanting the write lock.
 *
 * 5,000ms is where a blocked app write gives up with SQLITE_BUSY, and it is
 * also Render's health-check budget, so it is the number every figure here is
 * compared against. Half of it is where the margin stops being comfortable.
 */
function printLockHold(result: Awaited<ReturnType<typeof runSweep>>): void {
  const lh = result.lock_hold;
  if (lh.chunks === 0) return;

  console.log([
    "",
    `  LOCK HOLD over ${lh.chunks} chunk(s) of ${result.chunk_size} row(s), ${result.pause_ms}ms apart`,
    `    pipeline.db   max ${lh.pipeline_ms_max}ms   total ${lh.pipeline_ms_total}ms`,
    `    storage.db    max ${lh.storage_ms_max}ms   total ${lh.storage_ms_total}ms`,
    `    worst single chunk (both DBs): ${lh.worst_chunk_ms}ms`,
  ].join("\n"));

  if (lh.worst_chunk_ms >= SWEEP_BUSY_TIMEOUT_MS) {
    console.log([
      "",
      `    *** The worst chunk met or exceeded busy_timeout (${SWEEP_BUSY_TIMEOUT_MS}ms). An app`,
      "    write blocked behind it would have thrown SQLITE_BUSY. Lower --chunk,",
      "    raise --pause-ms, and report this before continuing. ***",
    ].join("\n"));
  } else if (lh.worst_chunk_ms > SWEEP_BUSY_TIMEOUT_MS / 2) {
    console.log([
      "",
      `    Warning: only ${SWEEP_BUSY_TIMEOUT_MS - lh.worst_chunk_ms}ms of headroom under the`,
      `    ${SWEEP_BUSY_TIMEOUT_MS}ms busy_timeout. Consider a smaller --chunk or a longer`,
      "    --pause-ms for the next pass.",
    ].join("\n"));
  }
}

/** Echo back exactly the flags the operator typed, so the suggested --write
 *  command is the same run they just previewed and not a different one. */
function suggestedFlags(args: Args): string {
  const parts: string[] = [];
  if (args.league) parts.push(`--league ${args.league}`);
  if (args.direction === "reverse") parts.push("--reverse");
  if (args.maxRows != null) parts.push(`--max-rows ${args.maxRows}`);
  if (args.chunk !== SWEEP_CHUNK_MAX) parts.push(`--chunk ${args.chunk}`);
  if (args.pauseMs !== SWEEP_PAUSE_MS_DEFAULT) parts.push(`--pause-ms ${args.pauseMs}`);
  if (args.force) parts.push("--force");
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const scope = args.league ?? "ALL LEAGUES";
  const verb = args.direction === "forward" ? "EXCLUDE" : "PUT BACK";

  const nowUtcHour = new Date().getUTCHours();
  const quiet = inQuietWindow();

  console.log(`
  ──────────────────────────────────────────────────────────────────────
   Deploy 2 — outcomes graded against an in-play line
   Scope:  ${scope}
   Action: ${verb} rows tagged "${INPLAY_CLOSING_REASON}"
   Mode:   ${args.write ? "** WRITING — this changes the database **" : "DRY RUN — nothing will be changed"}
   Pacing: chunk ${args.chunk} rows, pause ${args.pauseMs}ms, busy_timeout ${SWEEP_BUSY_TIMEOUT_MS}ms${args.maxRows != null ? `, max ${args.maxRows} rows` : ""}
   Clock:  ${String(nowUtcHour).padStart(2, "0")}:xx UTC — ${quiet ? "inside" : "OUTSIDE"} the ${QUIET_START_UTC}:00-${QUIET_END_UTC}:59 quiet window
  ──────────────────────────────────────────────────────────────────────`);

  if (args.chunkRequested > args.chunk) {
    console.log([
      "",
      `  NOTE: --chunk ${args.chunkRequested} was clamped to ${SWEEP_CHUNK_MAX}.`,
      "  A bigger batch only holds the write lock longer; it does not finish sooner.",
    ].join("\n"));
  }

  if (!quiet) {
    // The ingestion scheduler runs the standard cycle (odds + settlement) and
    // the fast cycle outside 07:00-11:59 UTC. Writing here means competing with
    // them for the same lock, which is the one risk this job has.
    const window = `${QUIET_START_UTC}:00-${QUIET_END_UTC}:59 UTC`;
    console.log([
      "",
      `  WARNING: it is ${String(nowUtcHour).padStart(2, "0")}:xx UTC, outside the ${window} quiet window.`,
      "  The ingestion cycle is active now, so this run competes with it for the",
      "  write lock. Prefer waiting for the quiet window.",
    ].join("\n"));

    if (args.write && !args.force) {
      // A warning printed before a non-interactive write is theatre — the write
      // happens anyway. So outside the window a write needs an explicit --force.
      console.error([
        "",
        "  REFUSING to --write outside the quiet window.",
        `  Either wait for ${window}, or add --force if you have a reason to go`,
        "  now. Nothing was changed.",
        "",
      ].join("\n"));
      process.exit(2);
    }
    if (args.write && args.force) {
      console.log("  --force given: proceeding outside the quiet window.");
    }
  }

  // Explicit, pinned, and visible in the session — see the header note. Must
  // happen before any sweep statement runs.
  applySweepBusyTimeout(SWEEP_BUSY_TIMEOUT_MS);

  const started = Date.now();
  const result = await runSweep({
    direction: args.direction,
    league: args.league,
    write: args.write,
    chunkSize: args.chunk,
    pauseMs: args.pauseMs,
    maxRows: args.maxRows,
    onChunk: ({ done, total, pipelineMs, storageMs }) => {
      console.log(
        `    …${done} of ${total} rows` +
        `   lock-hold pipeline ${pipelineMs}ms storage ${storageMs}ms`,
      );
    },
  });

  printCounts("BEFORE", result.counts_before);

  console.log(
    `\n  ${result.wrote ? "CHANGED" : "WOULD CHANGE"}: ` +
    `${result.candidates.length} outcome row(s), of which ` +
    `${result.graded_candidates} carry a graded win/loss and so move the public numbers.`,
  );

  if (result.max_rows != null) {
    const left = result.candidates_in_scope - result.candidates.length;
    console.log([
      "",
      `  CAP: --max-rows ${result.max_rows} is in force.`,
      `  ${result.candidates_in_scope} row(s) match in this scope; this run takes ${result.candidates.length}` +
        (left > 0 ? `, leaving ${left}.` : " — the cap did not bite, this is all of them."),
      ...(left > 0
        ? [`  Re-run the same command to take the next ${Math.min(result.max_rows, left)}.`]
        : []),
    ].join("\n"));
  } else if (result.candidates_in_scope !== result.candidates.length) {
    // Defensive: these can only diverge via max_rows. If they ever differ with
    // no cap set, the plan is lying and the operator should not act on it.
    console.log([
      "",
      `  WARNING: ${result.candidates_in_scope} rows in scope but ${result.candidates.length}`,
      "  selected with no cap set. Do not --write; report this.",
    ].join("\n"));
  }

  if (result.mirror_drift > 0) {
    const fix = result.wrote
      ? "This run repaired them."
      : "A --write run repairs them, even if it reports 0 rows to change.";
    console.log(
      `\n  NOTE: ${result.mirror_drift} row(s) are out of step between the two ` +
      `databases\n  for this tag — the fingerprint of an earlier run that was ` +
      `interrupted.\n  ${fix}`,
    );
  }

  if (result.wrote) {
    printCounts("AFTER (measured)", result.counts_after, result.counts_before);
    console.log(`\n    rows actually written: pipeline.db=${result.pipeline_changed} storage.db=${result.storage_changed}`);
    if (result.mirror_repaired > 0) {
      console.log(`    of which ${result.mirror_repaired} storage.db row(s) were repairs, not new work.`);
    }
    if (result.storage_changed < result.pipeline_changed && result.mirror_repaired === 0) {
      console.log(
        `    (storage.db is lower because it only holds rows for signals that\n` +
        `     actually settled — that difference is expected, not an error.)`,
      );
    }
    console.log(
      result.accuracy_refreshed
        ? `    accuracy table recomputed. The /sources leaderboard inside the\n` +
          `    running server is cached for up to 60s — wait a minute, then reload.`
        : `    nothing matched, so no accuracy recompute was needed.`,
    );

    printLockHold(result);
  } else {
    printCounts("AFTER (predicted)", result.counts_projected, result.counts_before);
  }

  printSamples(result.candidates, args.samples);

  if (!args.write) {
    console.log(`
  Nothing was changed. To do it for real, add --write to the same command:

      npx tsx script/deploy2-inplay-closing.ts${suggestedFlags(args)} --write
`);
  }
  console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\n  FAILED:", err?.stack ?? err);
    console.error("\n  Nothing further was written. Re-running is safe.\n");
    process.exit(1);
  },
);
