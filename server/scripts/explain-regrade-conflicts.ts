/**
 * READ-ONLY. Explains why a regrade --write counted rows as conflicts.
 *
 * WHY THIS EXISTS. Run rg_20261128T063344_055dd89c (NFL, --max-rows 200)
 * reported changed 0, conflicts 200. applyRegrade counts a conflict when the
 * conditional UPDATE does not change exactly one row: the row no longer holds
 * the grade the plan read, or the id matched 0 or 2+ rows. That counter cannot
 * say which, so this script asks the database directly, for the same rows.
 *
 * WHAT IT DOES, for the first --max-rows planned changes (same order, same
 * scope as the regrade):
 *   1. Re-plans with planRegrade (read-only), timing how long that takes.
 *   2. For each row: how many outcomes rows have that id, whether the EXACT
 *      predicate the UPDATE uses (STILL_BEFORE_WHERE) matches, and, column by
 *      column, whether `col IS ?` holds, with SQLite's typeof()/quote() of the
 *      stored value next to the JS value that gets bound.
 *   3. Whether the row already holds its v2 AFTER grade (a write that landed
 *      without an audit row), and how many outcome_regrades rows the given run
 *      has.
 *   4. Waits as long as step 1 took, then re-checks the predicate. Rows that
 *      matched and then stopped matching were changed by another writer in
 *      that window; rows that never matched point at the read/bind round trip.
 *
 * It never writes. (Opening pipeline.db runs the same schema init every
 * process does; on prod those are all IF NOT EXISTS no-ops.)
 *
 *   node dist/explain-regrade-conflicts.cjs --league NFL --max-rows 200 \
 *        [--run rg_20261128T063344_055dd89c] [--recheck-ms N] [--samples N]
 */
import { getPipelineDb } from "../pipeline/store";
import { planRegrade, gradeArgs, GRADE_COLUMNS, STILL_BEFORE_WHERE, type RegradeChange } from "../pipeline/regrade-v2";
import type { League } from "../pipeline/types";

const LEAGUES = ["CFB", "NFL", "NBA", "MLB"];

export interface Args {
  league: League | null;
  maxRows: number;
  run: string | null;
  recheckMs: number | null;
  samples: number;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { league: null, maxRows: 200, run: null, recheckMs: null, samples: 5 };
  const num = (flag: string, v: string | undefined) => {
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
      case "--max-rows": a.maxRows = num(f, argv[++i]); break;
      case "--run": a.run = argv[++i] ?? null; break;
      case "--recheck-ms": a.recheckMs = num(f, argv[++i]); break;
      case "--samples": a.samples = num(f, argv[++i]); break;
      default: throw new Error(`Unknown flag ${f}`);
    }
  }
  return a;
}

export interface RowDiagnosis {
  outcome_id: string;
  signal_id: string;
  /** outcomes rows with this id. The UPDATE needs exactly 1. */
  id_rows: number;
  /** The UPDATE's own WHERE clause, as a SELECT COUNT(*). */
  predicate_matches: number;
  /** Columns where `col IS <planned before>` is false. */
  failing_columns: { column: string; stored_type: string; stored: string; bound_type: string; bound: string }[];
  /** The row already equals its planned v2 after grade. */
  holds_after: boolean;
}

export interface Diagnosis {
  planned: number;
  plan_ms: number;
  rows: RowDiagnosis[];
  /** Predicate matched on the first check and not on the re-check. */
  changed_during_recheck: string[];
  recheck_ms: number;
  audit_rows_for_run: number | null;
}

function jsType(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isInteger(v) ? "number(int)" : "number(float)";
  return typeof v;
}

function predicateMatches(c: RegradeChange): number {
  const db = getPipelineDb();
  const row = db.prepare(`SELECT COUNT(*) AS n FROM outcomes WHERE ${STILL_BEFORE_WHERE}`)
    .get(c.outcome_id, ...gradeArgs(c.before)) as { n: number };
  return row.n;
}

export function diagnoseRow(c: RegradeChange): RowDiagnosis {
  const db = getPipelineDb();
  const idRows = (db.prepare("SELECT COUNT(*) AS n FROM outcomes WHERE id = ?").get(c.outcome_id) as { n: number }).n;
  const before = gradeArgs(c.before);
  const after = gradeArgs(c.after);
  const failing: RowDiagnosis["failing_columns"] = [];
  let holdsAfter = idRows > 0;

  GRADE_COLUMNS.forEach((col, i) => {
    // One row per id expected; LIMIT 1 keeps a duplicate-id table from hiding
    // the per-column answer (id_rows reports the duplicate separately).
    const r = db.prepare(`
      SELECT (${col} IS ?) AS eq_before, (${col} IS ?) AS eq_after,
             typeof(${col}) AS t, quote(${col}) AS q
      FROM outcomes WHERE id = ? LIMIT 1
    `).get(before[i], after[i], c.outcome_id) as { eq_before: number; eq_after: number; t: string; q: string } | undefined;
    if (!r) return;
    if (!r.eq_after) holdsAfter = false;
    if (!r.eq_before) {
      failing.push({ column: col, stored_type: r.t, stored: r.q, bound_type: jsType(before[i]), bound: JSON.stringify(before[i]) });
    }
  });

  return {
    outcome_id: c.outcome_id, signal_id: c.signal_id, id_rows: idRows,
    predicate_matches: predicateMatches(c), failing_columns: failing, holds_after: holdsAfter,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function diagnose(args: Args): Promise<Diagnosis> {
  const t0 = Date.now();
  const plan = planRegrade({ league: args.league, maxRows: args.maxRows });
  const planMs = Date.now() - t0;
  const rows = plan.changes.map(diagnoseRow);

  // applyRegrade's first UPDATE runs right after the plan, so the window in
  // which another writer could have moved a row is about one plan long.
  const recheckMs = args.recheckMs ?? planMs;
  await sleep(recheckMs);
  const changedDuringRecheck = plan.changes
    .filter((c, i) => rows[i].predicate_matches === 1 && predicateMatches(c) !== 1)
    .map((c) => c.outcome_id);

  let audit: number | null = null;
  if (args.run) {
    audit = (getPipelineDb().prepare("SELECT COUNT(*) AS n FROM outcome_regrades WHERE run_id = ?")
      .get(args.run) as { n: number }).n;
  }
  return { planned: plan.changes.length, plan_ms: planMs, rows, changed_during_recheck: changedDuringRecheck, recheck_ms: recheckMs, audit_rows_for_run: audit };
}

export function formatDiagnosis(d: Diagnosis, samples: number): string {
  const out: string[] = [];
  const count = (f: (r: RowDiagnosis) => boolean) => d.rows.filter(f).length;
  out.push(`planned changes checked: ${d.planned}   (plan took ${d.plan_ms}ms)`);
  out.push(`id matches 0 rows: ${count((r) => r.id_rows === 0)}   1 row: ${count((r) => r.id_rows === 1)}   2+ rows: ${count((r) => r.id_rows > 1)}`);
  out.push(`UPDATE predicate matches now: ${count((r) => r.predicate_matches === 1)}   does not: ${count((r) => r.predicate_matches !== 1)}`);
  out.push(`already holding the v2 after grade (landed without audit): ${count((r) => r.holds_after)}`);
  if (d.audit_rows_for_run !== null) out.push(`outcome_regrades rows for that run: ${d.audit_rows_for_run}`);
  out.push(`matched, then stopped matching within ${d.recheck_ms}ms (another writer): ${d.changed_during_recheck.length}`);

  const byCol: Record<string, number> = {};
  const byShape: Record<string, number> = {};
  for (const r of d.rows) {
    for (const f of r.failing_columns) {
      byCol[f.column] = (byCol[f.column] ?? 0) + 1;
      const shape = `${f.column}: stored ${f.stored_type} vs bound ${f.bound_type}`;
      byShape[shape] = (byShape[shape] ?? 0) + 1;
    }
  }
  out.push("\nCOLUMNS FAILING `col IS <before>`");
  if (!Object.keys(byCol).length) out.push("  none");
  for (const [k, v] of Object.entries(byShape).sort((a, b) => b[1] - a[1])) out.push(`  ${k.padEnd(56)} ${v}`);

  const bad = d.rows.filter((r) => r.predicate_matches !== 1).slice(0, samples);
  if (bad.length) {
    out.push(`\nSAMPLES (first ${bad.length} non-matching)`);
    for (const r of bad) {
      out.push(`  ${r.outcome_id} (signal ${r.signal_id}) id_rows=${r.id_rows} holds_after=${r.holds_after}`);
      for (const f of r.failing_columns) out.push(`     ${f.column}: stored ${f.stored} (${f.stored_type})  bound ${f.bound} (${f.bound_type})`);
    }
  }
  return out.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  getPipelineDb().pragma("busy_timeout = 5000");
  const d = await diagnose(args);
  console.log(`\nSCOPE: ${args.league ?? "all leagues"}   --max-rows ${args.maxRows}\n`);
  console.log(formatDiagnosis(d, args.samples));
}

if (typeof require !== "undefined" && require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error(`ERROR: ${err?.message ?? err}`);
    process.exit(1);
  });
}
