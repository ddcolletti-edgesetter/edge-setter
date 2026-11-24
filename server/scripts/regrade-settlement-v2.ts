/**
 * Edge Setter — settlement v2 regrade, operator script.
 *
 * WHAT and WHY are in server/pipeline/regrade-v2.ts; read that header first.
 * This file is only the command line. It writes nothing unless --write is given.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HOW TO RUN IT — click by click
 *
 * In Render's dashboard: open the `edge-setter` service, click **Shell** in
 * the left-hand menu, click into the black box. The script is built into the
 * deploy, so there is nothing to paste but the command.
 *
 *  1. DRY RUN, all leagues. Changes nothing:
 *
 *         node dist/regrade-settlement-v2.cjs
 *
 *     It prints:
 *       - how many settled outcomes it looked at, and how many it would change;
 *       - TRANSITIONS: e.g. "injury_update: win → no_grade(no_side_claimed)  412";
 *       - ACCURACY: per league, how many results the public numbers are built
 *         from (eligible) and how many are wins, BEFORE and AFTER;
 *       - SKIPPED: outcomes it cannot regrade (missing signal or game), left alone;
 *       - up to 10 SAMPLE rows with their before and after grade.
 *
 *  2. One league, still a dry run:
 *
 *         node dist/regrade-settlement-v2.cjs --league NFL
 *
 *  3. For real, one league, and capped so the first write is small:
 *
 *         node dist/regrade-settlement-v2.cjs --league NFL --max-rows 200 --write
 *
 *     This prints a RUN ID (rg_...). Write it down: it is how you undo the run.
 *     Run it between 07:00 and 11:59 UTC, when ingestion is quiet. Outside that
 *     window a --write refuses unless you add --force.
 *
 *  4. Repeat without --max-rows, then for the other leagues, or drop --league.
 *     A re-run after a completed run changes nothing.
 *
 *  5. Wait one minute and check https://edgesetter.net. The server caches the
 *     leaderboard for 60 seconds, and this script is a separate process that
 *     cannot clear that cache. Waiting is the whole fix.
 *
 * TO UNDO A RUN:
 *
 *         node dist/regrade-settlement-v2.cjs --list
 *         node dist/regrade-settlement-v2.cjs --reverse rg_...            (dry run)
 *         node dist/regrade-settlement-v2.cjs --reverse rg_... --write
 *
 *     Each changed row's exact before grade is stored in outcome_regrades, and
 *     the reverse restores it, except where the row has changed since. Those
 *     are counted as conflicts and left alone.
 *
 * IF IT IS INTERRUPTED (Ctrl+C, a deploy): work is committed in batches of at
 * most 500, each batch together with its audit rows, so nothing is half
 * applied in pipeline.db. storage.db can lag; the next run prints
 * "mirror_drift: N" and a --write run repairs it.
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   node dist/regrade-settlement-v2.cjs [--league CFB|NFL|NBA|MLB] [--write] [--force]
 *        [--max-rows N] [--chunk N] [--pause-ms N] [--samples N] [--note TEXT]
 *        [--reverse RUN_ID] [--list]
 */
import { getPipelineDb } from "../pipeline/store";
import {
  applyRegrade, DEFAULT_PAUSE_MS, listRuns, MAX_CHUNK, planRegrade, planReverse, reverseRun,
  type RegradePlan,
} from "../pipeline/regrade-v2";
import { setStorageBusyTimeoutMs } from "../storage";
import type { League } from "../pipeline/types";

const LEAGUES = ["CFB", "NFL", "NBA", "MLB"];
const BUSY_TIMEOUT_MS = 5000;

interface Args {
  league: League | null;
  write: boolean;
  force: boolean;
  list: boolean;
  reverse: string | null;
  maxRows: number | null;
  chunk: number;
  pauseMs: number;
  samples: number;
  note: string | null;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = {
    league: null, write: false, force: false, list: false, reverse: null,
    maxRows: null, chunk: MAX_CHUNK, pauseMs: DEFAULT_PAUSE_MS, samples: 10, note: null,
  };
  const num = (flag: string, v: string | undefined): number => {
    const n = Number(v);
    if (v === undefined || !Number.isFinite(n) || n < 0) throw new Error(`${flag} needs a non-negative number`);
    return Math.floor(n);
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    switch (f) {
      case "--league": {
        const v = (argv[++i] ?? "").toUpperCase();
        if (!LEAGUES.includes(v)) throw new Error(`--league must be one of ${LEAGUES.join(", ")}`);
        a.league = v as League; break;
      }
      case "--write": a.write = true; break;
      case "--force": a.force = true; break;
      case "--list": a.list = true; break;
      case "--reverse": {
        const v = argv[++i];
        if (!v || !v.startsWith("rg_")) throw new Error("--reverse needs a run id (rg_...); see --list");
        a.reverse = v; break;
      }
      case "--max-rows": a.maxRows = num(f, argv[++i]); break;
      case "--chunk": a.chunk = num(f, argv[++i]); break;
      case "--pause-ms": a.pauseMs = num(f, argv[++i]); break;
      case "--samples": a.samples = num(f, argv[++i]); break;
      case "--note": a.note = argv[++i] ?? null; break;
      // A silent typo on a script that writes to prod is worse than an error.
      default: throw new Error(`Unknown flag ${f}`);
    }
  }
  return a;
}

/** Ingestion's quiet window: 07:00–11:59 UTC (ingestion.ts isActiveHours). */
export function inQuietWindow(d = new Date()): boolean {
  const h = d.getUTCHours();
  return h >= 7 && h < 12;
}

function printPlan(plan: RegradePlan, samples: number): void {
  console.log(`\nSCOPE: ${plan.league ?? "all leagues"}`);
  console.log(`scanned: ${plan.scanned}   would change: ${plan.changes.length}   unchanged: ${plan.unchanged}   deferred by --max-rows: ${plan.deferred}`);
  console.log(`mirror_drift: ${plan.mirror_drift}${plan.mirror_drift ? "   (an earlier run was interrupted; --write repairs it)" : ""}`);
  console.log("\nTRANSITIONS");
  for (const [k, v] of Object.entries(plan.transitions).sort((x, y) => y[1] - x[1])) console.log(`  ${k.padEnd(64)} ${v}`);
  console.log("\nACCURACY (public population: graded, not stale-excluded)");
  for (const [lg, a] of Object.entries(plan.accuracy)) {
    console.log(`  ${lg.padEnd(8)} eligible ${a.eligible_before} → ${a.eligible_after}   wins ${a.wins_before} → ${a.wins_after}`);
  }
  if (Object.keys(plan.skipped).length) {
    console.log("\nSKIPPED (left untouched)");
    for (const [k, v] of Object.entries(plan.skipped)) console.log(`  ${k.padEnd(24)} ${v}`);
  }
  if (samples > 0 && plan.changes.length) {
    console.log(`\nSAMPLES (first ${Math.min(samples, plan.changes.length)})`);
    for (const c of plan.changes.slice(0, samples)) {
      const g = (x: typeof c.before) =>
        `${x.settlement_state}${x.no_grade_reason ? `/${x.no_grade_reason}` : ""} hit=${x.hit} clv=${x.clv} ${x.market} ${x.line_at_signal}→${x.closing_line} v=${x.grading_version}`;
      console.log(`  ${c.league} ${c.signal_type} ${c.signal_id}\n     before: ${g(c.before)}\n     after:  ${g(c.after)}`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  getPipelineDb().pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  setStorageBusyTimeoutMs(BUSY_TIMEOUT_MS);

  if (args.list) {
    console.table(listRuns(20));
    return;
  }

  if (args.chunk > MAX_CHUNK) console.log(`NOTE: --chunk ${args.chunk} clamped to ${MAX_CHUNK}.`);
  if (!inQuietWindow()) {
    const msg = "Outside the 07:00–11:59 UTC quiet window: ingestion and settlement are running.";
    if (args.write && !args.force) throw new Error(`${msg} Refusing to --write without --force.`);
    console.log(`WARNING: ${msg}`);
  }

  const gitSha = process.env.RENDER_GIT_COMMIT ?? null;
  const report = (r: Awaited<ReturnType<typeof applyRegrade>>) => {
    console.log(`\nRUN ID: ${r.run_id}`);
    console.log(`changed: ${r.changed}   conflicts: ${r.conflicts}   mirror_updated: ${r.mirror_updated}   mirror_missing: ${r.mirror_missing}   mirror_repaired: ${r.mirror_repaired}`);
    console.log(`worst chunk lock-hold: ${r.worst_chunk_ms}ms${r.worst_chunk_ms > BUSY_TIMEOUT_MS / 2 ? "   (over half of busy_timeout: lower --chunk, raise --pause-ms)" : ""}`);
  };

  if (args.reverse) {
    const plan = planReverse(args.reverse);
    console.log(`\nREVERSE ${plan.run_id}: restorable ${plan.restorable}   conflicts ${plan.conflicts}   already reversed ${plan.already_reversed}`);
    if (!args.write) { console.log("\nDry run. Add --write to restore."); return; }
    report(await reverseRun(args.reverse, { chunk: args.chunk, pauseMs: args.pauseMs, note: args.note, gitSha }));
    return;
  }

  const plan = planRegrade({ league: args.league, maxRows: args.maxRows ?? undefined });
  printPlan(plan, args.samples);
  if (!args.write) { console.log("\nDry run. Nothing was written. Add --write to apply."); return; }
  report(await applyRegrade(plan, { chunk: args.chunk, pauseMs: args.pauseMs, note: args.note, gitSha }));
}

// Run only as the bundled CJS script (dist/regrade-settlement-v2.cjs), not
// when a test imports parseArgs / inQuietWindow under ESM, where `require` is
// undefined.
if (typeof require !== "undefined" && require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error(`ERROR: ${err?.message ?? err}`);
    process.exit(1);
  });
}
