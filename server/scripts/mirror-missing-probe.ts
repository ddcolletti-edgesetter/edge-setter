/**
 * READ-ONLY. Shows what is actually in both databases for the signals a
 * regrade run counted as mirror_missing.
 *
 * WHY THIS EXISTS. Run rg_20261128T101432_8a95781f (full --write) reported
 * changed 93134, mirror_updated 89948, mirror_missing 3186, mirror_repaired 0.
 * mirror_missing counts audited outcomes whose storage.db settled_outcomes
 * UPDATE changed 0 rows. signal_id is UNIQUE there, so each one is a signal with
 * a pipeline.db outcome and NO mirror row. reconcileMirror never touches them:
 * countMirrorDrift skips a signal with no mirror row ("it never settled into
 * storage.db"). That explanation was written into the code, never checked, and
 * the per-source leaderboard (source_scores) reads only settled_outcomes, so
 * these outcomes count toward no source's accuracy.
 *
 * WHAT IT PRINTS, so the cause can be read off the rows:
 *   1. storage.db settled_outcomes: total, created_at/recorded_at range, rows
 *      per month (was the mirror reseeded, or does it start late?).
 *   2. The run's regrade_runs row, then its audit rows split into still-missing
 *      vs mirrored, by outcome created_at day, league, signal_type, after grade
 *      and excluded_stale (a cluster on 2026-09-16..18 = the /tmp fallback; all
 *      older than the mirror's first row = predates it; thin spread = a
 *      settlement that died between the two writes).
 *   3. Missing signals with 2+ pipeline outcomes; missing rows whose game_id
 *      has other mirror rows; and those with a mirror row for the same game AND
 *      signal_type under a DIFFERENT signal_id (an id mismatch, not absence).
 *   4. Samples (oldest / middle / newest) with the pipeline live_signals row,
 *      every pipeline outcome for the signal, the storage.db lookup by
 *      signal_id, and storage.db rows for the same game + type.
 *
 * It opens both files itself with readonly: true and fileMustExist: true. It
 * does NOT import pipeline/store or storage: those open both databases
 * read-write and run schema init.
 *
 *   node dist/mirror-missing-probe.cjs rg_20261128T101432_8a95781f [--samples N]
 *
 * Paths: $PIPELINE_DATA_DIR (else $DATA_DIR, else /var/data)/pipeline.db and
 * $DATA_DIR (else /var/data)/edge_setter.db, the same env vars the app uses.
 * Both resolved paths are printed first.
 */
import Database from "better-sqlite3";
import path from "path";

type DB = Database.Database;

export interface Args { runId: string; samples: number }

export function parseArgs(argv: string[]): Args {
  let runId: string | null = null;
  let samples = 4;
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === "--samples") {
      const v = argv[++i];
      const n = Number(v);
      if (v === undefined || !Number.isInteger(n) || n < 1 || n > 50) throw new Error("--samples needs an integer 1-50");
      samples = n;
    } else if (f.startsWith("--")) {
      throw new Error(`Unknown flag ${f}`);
    } else if (runId) {
      throw new Error(`Unexpected extra argument ${f}`);
    } else if (!/^rg_[0-9A-Za-z_]+$/.test(f)) {
      throw new Error(`${f} does not look like a regrade run id (rg_...)`);
    } else {
      runId = f;
    }
  }
  if (!runId) throw new Error("usage: node dist/mirror-missing-probe.cjs <run_id> [--samples N]");
  return { runId, samples };
}

interface AuditRow {
  outcome_id: string;
  signal_id: string;
  game_id: string | null;
  league: string | null;
  signal_type: string | null;
  excluded_stale: number | null;
  after_settlement_state: string | null;
  after_hit: number | null;
  o_created: string | null;
}

interface MirrorLite { signal_id: string; signal_type: string; created_at: string | null; settlement_state: string | null; hit: number | null }

export interface Breakdown { key: string; missing: number; audited: number }

export interface ProbeReport {
  run: Record<string, unknown>;
  mirror: { total: number; min_created: string | null; max_created: string | null; min_recorded: string | null; max_recorded: string | null; by_month: { month: string | null; n: number }[]; by_recorded_month: { month: string | null; n: number }[] };
  audit_rows: number;
  audit_signals: number;
  missing_rows: number;
  missing_signals: number;
  by: Record<"created_day" | "league" | "signal_type" | "after_grade" | "excluded_stale", Breakdown[]>;
  missing_signals_multi_outcome: number;
  missing_rows_game_known: number;
  missing_rows_same_game_type: number;
  samples: {
    signal_id: string;
    live_signal: unknown;
    pipeline_outcomes: unknown[];
    mirror_by_signal_id: unknown;
    mirror_same_game_type: MirrorLite[];
  }[];
}

function breakdown(audit: AuditRow[], missing: AuditRow[], key: (r: AuditRow) => unknown): Breakdown[] {
  const k = (r: AuditRow) => { const v = key(r); return v === null || v === undefined || v === "" ? "NULL" : String(v); };
  const all = new Map<string, number>();
  const miss = new Map<string, number>();
  for (const r of audit) all.set(k(r), (all.get(k(r)) ?? 0) + 1);
  for (const r of missing) miss.set(k(r), (miss.get(k(r)) ?? 0) + 1);
  return [...all.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, audited]) => ({ key, missing: miss.get(key) ?? 0, audited }));
}

/** Pure reads on two handles. Throws if the run does not exist. */
export function probeMirrorMissing(pipe: DB, stor: DB, runId: string, sampleEach = 4): ProbeReport {
  const run = pipe.prepare(`
    SELECT run_id, mode, league, started_at, finished_at, candidates, changed, conflicts,
           mirror_updated, mirror_missing, mirror_repaired
    FROM regrade_runs WHERE run_id = ?`).get(runId) as Record<string, unknown> | undefined;
  if (!run) throw new Error(`No regrade_runs row for ${runId}`);

  const m = stor.prepare(`
    SELECT COUNT(*) AS total, MIN(created_at) AS min_created, MAX(created_at) AS max_created,
           MIN(recorded_at) AS min_recorded, MAX(recorded_at) AS max_recorded
    FROM settled_outcomes`).get() as ProbeReport["mirror"];
  // created_at is when the mirror row was INSERTED (insertSettledOutcome stamps
  // now); recorded_at is when the signal settled. Both, so a late bulk insert
  // and a gap in settlement time are told apart.
  const byMonth = stor.prepare(`SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS n FROM settled_outcomes GROUP BY month ORDER BY month`).all() as ProbeReport["mirror"]["by_month"];
  const byRecordedMonth = stor.prepare(`SELECT substr(recorded_at, 1, 7) AS month, COUNT(*) AS n FROM settled_outcomes GROUP BY month ORDER BY month`).all() as ProbeReport["mirror"]["by_month"];

  // One pass over the mirror instead of a per-row lookup: settled_outcomes has
  // no game_id index, and a scan per missing row is thousands of full scans.
  const mirrored = new Set<string>();
  const byGame = new Map<string, MirrorLite[]>();
  for (const r of stor.prepare(`SELECT signal_id, game_id, signal_type, created_at, settlement_state, hit FROM settled_outcomes`).iterate() as Iterable<MirrorLite & { game_id: string | null }>) {
    mirrored.add(r.signal_id);
    if (r.game_id == null) continue;
    let list = byGame.get(r.game_id);
    if (!list) byGame.set(r.game_id, (list = []));
    list.push({ signal_id: r.signal_id, signal_type: r.signal_type, created_at: r.created_at, settlement_state: r.settlement_state, hit: r.hit });
  }

  const audit = pipe.prepare(`
    SELECT r.outcome_id, r.signal_id, r.game_id, r.league, r.signal_type, r.excluded_stale,
           r.after_settlement_state, r.after_hit, o.created_at AS o_created
    FROM outcome_regrades r LEFT JOIN outcomes o ON o.id = r.outcome_id
    WHERE r.run_id = ?`).all(runId) as AuditRow[];
  const missing = audit.filter((a) => !mirrored.has(a.signal_id));
  const missSignals = new Set(missing.map((a) => a.signal_id));

  const outcomeCount = pipe.prepare(`SELECT COUNT(*) AS n FROM outcomes WHERE signal_id = ?`);
  let multi = 0;
  for (const s of missSignals) if ((outcomeCount.get(s) as { n: number }).n > 1) multi++;

  const sameGameType = (r: AuditRow) =>
    (r.game_id ? byGame.get(r.game_id) ?? [] : []).filter((x) => x.signal_type === r.signal_type && x.signal_id !== r.signal_id);
  let gameKnown = 0;
  let gameTypeKnown = 0;
  for (const r of missing) {
    if (r.game_id && byGame.has(r.game_id)) gameKnown++;
    if (sameGameType(r).length) gameTypeKnown++;
  }

  const sorted = [...missing].sort((a, b) => String(a.o_created).localeCompare(String(b.o_created)) || a.signal_id.localeCompare(b.signal_id));
  const mid = Math.max(0, Math.floor(sorted.length / 2) - Math.floor(sampleEach / 2));
  const pickIdx = new Set<number>();
  for (let i = 0; i < sampleEach; i++) {
    for (const j of [i, mid + i, sorted.length - sampleEach + i]) if (j >= 0 && j < sorted.length) pickIdx.add(j);
  }
  const liveSignal = pipe.prepare(`SELECT id, league, signal_type, team, created_at FROM live_signals WHERE id = ?`);
  const pOutcomes = pipe.prepare(`
    SELECT id, signal_id, game_id, market, hit, clv, settlement_state, no_grade_reason, grading_version, recorded_at, created_at
    FROM outcomes WHERE signal_id = ? ORDER BY created_at`);
  const mirrorRow = stor.prepare(`SELECT * FROM settled_outcomes WHERE signal_id = ?`);
  const samples = [...pickIdx].sort((a, b) => a - b).map((i) => sorted[i]).map((r) => ({
    signal_id: r.signal_id,
    live_signal: liveSignal.get(r.signal_id) ?? null,
    pipeline_outcomes: pOutcomes.all(r.signal_id),
    mirror_by_signal_id: mirrorRow.get(r.signal_id) ?? null,
    mirror_same_game_type: sameGameType(r).slice(0, 3),
  }));

  return {
    run,
    mirror: { ...m, by_month: byMonth, by_recorded_month: byRecordedMonth },
    audit_rows: audit.length,
    audit_signals: new Set(audit.map((a) => a.signal_id)).size,
    missing_rows: missing.length,
    missing_signals: missSignals.size,
    by: {
      created_day: breakdown(audit, missing, (r) => r.o_created?.slice(0, 10)),
      league: breakdown(audit, missing, (r) => r.league),
      signal_type: breakdown(audit, missing, (r) => r.signal_type),
      after_grade: breakdown(audit, missing, (r) => `${r.after_settlement_state}/${r.after_hit}`),
      excluded_stale: breakdown(audit, missing, (r) => r.excluded_stale),
    },
    missing_signals_multi_outcome: multi,
    missing_rows_game_known: gameKnown,
    missing_rows_same_game_type: gameTypeKnown,
    samples,
  };
}

export function formatReport(r: ProbeReport): string {
  const out: string[] = [];
  const j = (v: unknown) => JSON.stringify(v);
  out.push("== regrade run ==", j(r.run), "");
  out.push("== storage.db settled_outcomes overall ==");
  out.push(`rows: ${r.mirror.total}`);
  out.push(`created_at:  ${r.mirror.min_created} .. ${r.mirror.max_created}`);
  out.push(`recorded_at: ${r.mirror.min_recorded} .. ${r.mirror.max_recorded}`);
  out.push("rows by created_at month (when the mirror row was inserted):");
  for (const b of r.mirror.by_month) out.push(`  ${b.month ?? "NULL"}  ${b.n}`);
  out.push("rows by recorded_at month (when the signal settled):");
  for (const b of r.mirror.by_recorded_month) out.push(`  ${b.month ?? "NULL"}  ${b.n}`);
  out.push("");
  out.push(`== this run's audit rows ==`);
  out.push(`audit rows: ${r.audit_rows}   distinct signals: ${r.audit_signals}`);
  out.push(`with NO storage.db mirror row now: ${r.missing_rows} rows, ${r.missing_signals} distinct signals   (run recorded mirror_missing: ${r.run.mirror_missing})`);
  out.push("  (rows vs run's count can differ if a mirror row was inserted since the run)");
  const labels: Record<keyof ProbeReport["by"], string> = {
    created_day: "pipeline outcome created_at day",
    league: "league",
    signal_type: "signal_type",
    after_grade: "after settlement_state/hit",
    excluded_stale: "excluded_stale",
  };
  for (const key of Object.keys(labels) as (keyof ProbeReport["by"])[]) {
    out.push("", `-- by ${labels[key]}: missing / audited --`);
    for (const b of r.by[key]) out.push(`  ${b.key.padEnd(32)} ${String(b.missing).padStart(7)} / ${b.audited}`);
  }
  out.push("");
  out.push(`missing signals with 2+ pipeline outcomes: ${r.missing_signals_multi_outcome} / ${r.missing_signals}`);
  out.push(`missing rows whose game_id HAS other mirror rows: ${r.missing_rows_game_known} / ${r.missing_rows}`);
  out.push(`missing rows with a mirror row for same game_id AND signal_type under a different signal_id: ${r.missing_rows_same_game_type} / ${r.missing_rows}`);
  out.push("", "== samples (oldest / middle / newest missing, by pipeline outcome created_at) ==");
  for (const s of r.samples) {
    out.push("", `signal ${s.signal_id}`);
    out.push(`  pipeline live_signals:           ${j(s.live_signal)}`);
    for (const o of s.pipeline_outcomes) out.push(`  pipeline outcome:                ${j(o)}`);
    out.push(`  storage.db row for signal_id:    ${j(s.mirror_by_signal_id)}`);
    out.push(`  storage.db same game+type rows:  ${j(s.mirror_same_game_type)}`);
  }
  return out.join("\n");
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): { pipeline: string; storage: string } {
  return {
    pipeline: path.join(env.PIPELINE_DATA_DIR || env.DATA_DIR || "/var/data", "pipeline.db"),
    storage: path.join(env.DATA_DIR || "/var/data", "edge_setter.db"),
  };
}

function main(): void {
  let args: Args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error((e as Error).message); process.exit(2); }
  const p = resolvePaths();
  console.log(`pipeline.db: ${p.pipeline}\nstorage.db:  ${p.storage}\nREAD-ONLY: both opened with readonly: true\n`);
  const pipe = new Database(p.pipeline, { readonly: true, fileMustExist: true });
  const stor = new Database(p.storage, { readonly: true, fileMustExist: true });
  pipe.pragma("busy_timeout = 5000");
  stor.pragma("busy_timeout = 5000");
  try {
    const t0 = Date.now();
    console.log(formatReport(probeMirrorMissing(pipe, stor, args.runId, args.samples)));
    console.log(`\nprobe took ${Date.now() - t0}ms`);
  } finally {
    pipe.close();
    stor.close();
  }
}

// Bundled to dist/mirror-missing-probe.cjs; only run main when executed, not when a test imports it.
if (typeof require !== "undefined" && require.main === module) {
  try { main(); } catch (err) { console.error(`ERROR: ${(err as Error)?.message ?? err}`); process.exit(1); }
}
