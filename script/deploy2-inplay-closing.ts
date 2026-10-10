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
 * ONE THING TO KNOW. This runs against the live databases while the site is
 * serving traffic. That is safe here — SQLite is in WAL mode, the writes are
 * short 500-row batches, and the loop is given a turn between every batch — but
 * it is the reason to do a dry run first and one league at a time.
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   npx tsx script/deploy2-inplay-closing.ts [--league CFB|NFL|NBA|MLB]
 *                                            [--reverse] [--write]
 *                                            [--chunk N] [--samples N]
 */
import {
  runSweep,
  SWEEP_LEAGUES,
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
  samples: number;
}

function usage(message?: string): never {
  if (message) console.error(`\n  ERROR: ${message}`);
  console.error(`
  Usage:
    npx tsx script/deploy2-inplay-closing.ts [options]

  Options:
    --league <L>   One of ${SWEEP_LEAGUES.join(", ")}. Omit for all leagues.
    --reverse      Release rows this sweep flagged, instead of flagging rows.
    --write        Actually write. WITHOUT THIS NOTHING IS CHANGED.
    --chunk <N>    Rows per transaction (default 500).
    --samples <N>  Example rows to print (default 10).
    --help

  Run it with no options first: that is the dry run.
`);
  process.exit(message ? 2 : 0);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { league: null, direction: "forward", write: false, chunk: 500, samples: 10 };

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
        args.chunk = Math.round(n);
        break;
      }
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const scope = args.league ?? "ALL LEAGUES";
  const verb = args.direction === "forward" ? "EXCLUDE" : "PUT BACK";

  console.log(`
  ──────────────────────────────────────────────────────────────────────
   Deploy 2 — outcomes graded against an in-play line
   Scope:  ${scope}
   Action: ${verb} rows tagged "${INPLAY_CLOSING_REASON}"
   Mode:   ${args.write ? "** WRITING — this changes the database **" : "DRY RUN — nothing will be changed"}
  ──────────────────────────────────────────────────────────────────────`);

  const started = Date.now();
  const result = await runSweep({
    direction: args.direction,
    league: args.league,
    write: args.write,
    chunkSize: args.chunk,
    onChunk: (done, total) => {
      if (total > args.chunk) console.log(`    …${done} of ${total} rows`);
    },
  });

  printCounts("BEFORE", result.counts_before);

  console.log(
    `\n  ${result.wrote ? "CHANGED" : "WOULD CHANGE"}: ` +
    `${result.candidates.length} outcome row(s), of which ` +
    `${result.graded_candidates} carry a graded win/loss and so move the public numbers.`,
  );

  if (result.wrote) {
    printCounts("AFTER (measured)", result.counts_after, result.counts_before);
    console.log(`\n    rows actually written: pipeline.db=${result.pipeline_changed} storage.db=${result.storage_changed}`);
    if (result.storage_changed < result.pipeline_changed) {
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
  } else {
    printCounts("AFTER (predicted)", result.counts_projected, result.counts_before);
  }

  printSamples(result.candidates, args.samples);

  if (!args.write) {
    console.log(`
  Nothing was changed. To do it for real, add --write to the same command:

      npx tsx script/deploy2-inplay-closing.ts${args.league ? ` --league ${args.league}` : ""}${args.direction === "reverse" ? " --reverse" : ""} --write
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
