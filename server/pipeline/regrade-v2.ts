/**
 * Settlement v2 regrade: re-run the v2 grader (grading-v2.ts) over outcomes
 * that are already settled, with a per-row audit trail and an exact reverse.
 *
 * WHY. Every outcome settled before v2 was graded by the old rules: a side
 * inferred by settlement, lines read from in-play prices, line moves graded as
 * spreads, CLV signed by move direction, no-result rows recorded as losses.
 * v2 fixes those going forward (#119). This applies the same rules backwards.
 *
 * WHAT IT CHANGES. On `outcomes` (pipeline.db) and the `settled_outcomes`
 * mirror (storage.db): market, line_at_signal, closing_line, actual_result,
 * hit, clv, settlement_state, no_grade_reason, grading_version. Nothing else.
 * excluded_stale is never touched. No row is deleted.
 *
 * AUDIT. Each --write run inserts one regrade_runs row and, for every outcome
 * it changes, one outcome_regrades row holding the full before and after
 * grade. The audit row and the outcome UPDATE commit in the same transaction,
 * so the audit can never claim a change that did not land, or miss one that did.
 *
 * REVERSE. `reverseRun(runId)` restores the before grade of every audit row in
 * that run, but only where the outcome still equals that row's after grade.
 * Anything changed since (settled again, or regraded by a later run) is a
 * conflict, counted and left alone. Reversing a run creates its own
 * regrade_runs row, mode 'reverse', and stamps the audit rows reversed.
 *
 * TWO DATABASES. The pipeline write and the mirror write are separate handles,
 * so an interrupted run can leave storage.db behind. That is NOT self-healing
 * by idempotency alone: the next run finds the pipeline row already regraded
 * ("unchanged") and would never revisit its mirror. So every run, dry or
 * write, also reconciles: for every signal with an audit row, the mirror must
 * equal the pipeline outcome. A dry run reports the drift; a write repairs it.
 *
 * CONCURRENCY. better-sqlite3 is synchronous, so a chunk holds the write lock
 * for its whole transaction. Chunks are capped at 500 rows and separated by a
 * real sleep (pauseMs), so the live app gets wall-clock time with the lock
 * free. The UPDATE is conditional on the row still holding its before grade,
 * so a settlement racing the regrade turns into a counted conflict rather than
 * a lost write.
 */
import { randomUUID } from "crypto";
import type { League, LiveSignal } from "./types";
import { getGame, getLiveSignal, getPipelineDb } from "./store";
import { gradeSignalV2, GRADING_VERSION } from "./grading-v2";
import { accuracyLedgerIsStale, forceAccuracyRecompute, loadGradingInputs, type AccuracyComputeResult } from "./settlement";
import { getSettledOutcomeGrade, updateSettledOutcomeGrade, type SettledOutcomeGrade } from "../storage";

export const MAX_CHUNK = 500;
export const DEFAULT_PAUSE_MS = 250;

/** The grade columns, as stored in outcomes (hit as 1 / 0 / NULL). */
export interface GradeFields {
  market: string;
  line_at_signal: number | null;
  closing_line: number | null;
  actual_result: number | null;
  hit: number | null;
  clv: number | null;
  settlement_state: string;
  no_grade_reason: string | null;
  grading_version: string | null;
}

const GRADE_COLUMNS: (keyof GradeFields)[] = [
  "market", "line_at_signal", "closing_line", "actual_result", "hit", "clv",
  "settlement_state", "no_grade_reason", "grading_version",
];

export function sameGrade(a: GradeFields, b: GradeFields): boolean {
  return GRADE_COLUMNS.every((c) => (a[c] ?? null) === (b[c] ?? null));
}

export interface RegradeChange {
  outcome_id: string;
  signal_id: string;
  game_id: string;
  league: string;
  signal_type: string;
  excluded_stale: number;
  before: GradeFields;
  after: GradeFields;
}

export interface RegradePlan {
  league: League | null;
  scanned: number;
  changes: RegradeChange[];
  unchanged: number;
  /** Outcomes the regrade cannot run on, by reason. Left untouched. */
  skipped: Record<string, number>;
  /** Rows a --max-rows cap left for a later run. */
  deferred: number;
  /** Per-league public-accuracy population (hit NOT NULL AND excluded_stale = 0), before and after. */
  accuracy: Record<string, { eligible_before: number; eligible_after: number; wins_before: number; wins_after: number }>;
  /** "signal_type: before → after" transition counts, for the operator. */
  transitions: Record<string, number>;
  /** Signals whose mirror row differs from the pipeline outcome (an earlier run was interrupted). */
  mirror_drift: number;
}

interface OutcomeRow extends GradeFields {
  id: string;
  signal_id: string;
  game_id: string;
  home_score: number | null;
  away_score: number | null;
  excluded_stale: number;
  league: string | null;
  signal_type: string | null;
}

function gradeOf(row: GradeFields): GradeFields {
  const g = {} as GradeFields;
  for (const c of GRADE_COLUMNS) (g as any)[c] = (row as any)[c] ?? null;
  g.settlement_state = row.settlement_state ?? "graded";
  return g;
}

function label(g: GradeFields): string {
  if (g.settlement_state === "no_grade") return `no_grade(${g.no_grade_reason ?? "?"})`;
  return g.hit === 1 ? "win" : g.hit === 0 ? "loss" : "no_result";
}

/** The v2 grade for one settled outcome, from the same inputs live settlement reads. */
export function regradeOutcome(signal: LiveSignal, row: OutcomeRow): GradeFields | null {
  const game = getGame(row.game_id);
  if (!game || row.home_score == null || row.away_score == null) return null;
  const r = gradeSignalV2(loadGradingInputs(signal, game, row.home_score, row.away_score));
  return {
    market: r.market,
    line_at_signal: r.lineAtSignal,
    closing_line: r.closingLine,
    actual_result: r.actualResult,
    hit: r.hit === null ? null : (r.hit ? 1 : 0),
    clv: r.clv,
    settlement_state: r.state,
    no_grade_reason: r.reason,
    grading_version: GRADING_VERSION,
  };
}

function countMirrorDrift(): { drift: string[] } {
  const db = getPipelineDb();
  const rows = db.prepare(`
    SELECT DISTINCT r.signal_id, o.market, o.line_at_signal, o.closing_line, o.actual_result, o.hit, o.clv,
           o.settlement_state, o.no_grade_reason, o.grading_version
    FROM outcome_regrades r
    JOIN outcomes o ON o.signal_id = r.signal_id
  `).all() as Array<GradeFields & { signal_id: string }>;
  const drift: string[] = [];
  for (const row of rows) {
    const mirror = getSettledOutcomeGrade(row.signal_id);
    // No mirror row is not drift: that signal never settled into storage.db.
    if (mirror && !sameGrade(gradeOf(mirror as GradeFields), gradeOf(row))) drift.push(row.signal_id);
  }
  return { drift };
}

/** Read-only. Computes every change a --write run would make. */
export function planRegrade(opts: { league?: League | null; maxRows?: number } = {}): RegradePlan {
  const db = getPipelineDb();
  const league = opts.league ?? null;
  const rows = db.prepare(`
    SELECT o.*, s.league AS league, s.signal_type AS signal_type
    FROM outcomes o
    LEFT JOIN live_signals s ON s.id = o.signal_id
    ${league ? "WHERE s.league = ?" : ""}
    ORDER BY o.created_at ASC, o.id ASC
  `).all(...(league ? [league] : [])) as OutcomeRow[];

  const plan: RegradePlan = {
    league, scanned: rows.length, changes: [], unchanged: 0, skipped: {}, deferred: 0,
    accuracy: {}, transitions: {}, mirror_drift: 0,
  };
  const skip = (why: string) => { plan.skipped[why] = (plan.skipped[why] ?? 0) + 1; };
  const acc = (lg: string) => (plan.accuracy[lg] ??= { eligible_before: 0, eligible_after: 0, wins_before: 0, wins_after: 0 });

  for (const row of rows) {
    const before = gradeOf(row);
    const lg = row.league ?? "unknown";
    let after = before;

    const signal = row.league ? getLiveSignal(row.signal_id) : null;
    if (!signal) skip("signal_missing");
    else {
      const regraded = regradeOutcome(signal, row);
      if (!regraded) skip("game_or_score_missing");
      else after = regraded;
    }

    if (row.excluded_stale === 0) {
      const a = acc(lg);
      if (before.hit !== null) { a.eligible_before++; if (before.hit === 1) a.wins_before++; }
      if (after.hit !== null) { a.eligible_after++; if (after.hit === 1) a.wins_after++; }
    }

    if (after === before) continue;
    if (sameGrade(before, after)) { plan.unchanged++; continue; }
    const key = `${row.signal_type ?? "?"}: ${label(before)} → ${label(after)}`;
    plan.transitions[key] = (plan.transitions[key] ?? 0) + 1;
    plan.changes.push({
      outcome_id: row.id, signal_id: row.signal_id, game_id: row.game_id,
      league: lg, signal_type: row.signal_type ?? "?", excluded_stale: row.excluded_stale,
      before, after,
    });
  }

  if (opts.maxRows != null && opts.maxRows >= 0 && plan.changes.length > opts.maxRows) {
    plan.deferred = plan.changes.length - opts.maxRows;
    plan.changes = plan.changes.slice(0, opts.maxRows);
  }
  plan.mirror_drift = countMirrorDrift().drift.length;
  return plan;
}

export interface RunResult {
  run_id: string;
  changed: number;
  conflicts: number;
  mirror_updated: number;
  mirror_missing: number;
  mirror_repaired: number;
  /** Longest single-chunk transaction on pipeline.db, ms. */
  worst_chunk_ms: number;
  /**
   * Evidence for the first MAX_CONFLICT_SAMPLES conflicts, read in the same
   * transaction as the UPDATE that missed: how many rows hold that id, and
   * every column whose current value is not `IS` the planned before. A
   * conflict count alone cannot say why (rg_20261128T063344_055dd89c: 200 of
   * 200, and nothing left to look at afterwards).
   */
  conflict_samples: ConflictSample[];
  /**
   * The accuracy recompute this run triggered, or null when nothing changed (or
   * recompute: false). stale_after is accuracyLedgerIsStale() read back AFTER
   * the recompute: false means no leftover accuracy row survived.
   */
  accuracy: (AccuracyComputeResult & { stale_after: boolean }) | null;
}

export const MAX_CONFLICT_SAMPLES = 20;

export interface ConflictSample {
  outcome_id: string;
  /** r.changes from the UPDATE: 0 = no row matched, 2+ = more than one did. */
  update_changes: number;
  id_rows: number;
  differing: { column: string; planned: unknown; current: unknown; current_type: string }[];
}

/** What the row holds now against what the plan expected. Read-only. */
export function explainConflict(db: ReturnType<typeof getPipelineDb>, c: RegradeChange, updateChanges: number): ConflictSample {
  const idRows = (db.prepare("SELECT COUNT(*) AS n FROM outcomes WHERE id = ?").get(c.outcome_id) as { n: number }).n;
  const differing: ConflictSample["differing"] = [];
  const planned = gradeArgs(c.before);
  GRADE_COLUMNS.forEach((col, i) => {
    const r = db.prepare(`SELECT (${col} IS ?) AS eq, ${col} AS v, typeof(${col}) AS t FROM outcomes WHERE id = ? LIMIT 1`)
      .get(planned[i], c.outcome_id) as { eq: number; v: unknown; t: string } | undefined;
    if (r && !r.eq) differing.push({ column: col, planned: planned[i], current: r.v, current_type: r.t });
  });
  return { outcome_id: c.outcome_id, update_changes: updateChanges, id_rows: idRows, differing };
}

function recomputeAccuracy(): AccuracyComputeResult & { stale_after: boolean } {
  return { ...forceAccuracyRecompute(), stale_after: accuracyLedgerIsStale() };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clampChunk(n: number | undefined): number {
  return Math.max(1, Math.min(MAX_CHUNK, Math.floor(n ?? MAX_CHUNK)));
}

function toMirror(g: GradeFields): SettledOutcomeGrade {
  return { ...g } as SettledOutcomeGrade;
}

/** Make every audited signal's mirror row equal its pipeline outcome. */
function reconcileMirror(): number {
  const db = getPipelineDb();
  let repaired = 0;
  for (const signalId of countMirrorDrift().drift) {
    const o = db.prepare(`
      SELECT market, line_at_signal, closing_line, actual_result, hit, clv,
             settlement_state, no_grade_reason, grading_version
      FROM outcomes WHERE signal_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(signalId) as GradeFields | undefined;
    if (o) repaired += updateSettledOutcomeGrade(signalId, toMirror(gradeOf(o)));
  }
  return repaired;
}

/**
 * The "row still holds its before grade" condition. Binds: id, then the nine
 * GRADE_COLUMNS of the before grade. Exported so explain-regrade-conflicts
 * tests the exact predicate the UPDATE uses, not a copy of it.
 */
export const STILL_BEFORE_WHERE = `
  id = ?
    AND market IS ? AND line_at_signal IS ? AND closing_line IS ? AND actual_result IS ?
    AND hit IS ? AND clv IS ? AND settlement_state IS ? AND no_grade_reason IS ? AND grading_version IS ?
`;

export const UPDATE_IF_UNCHANGED_SQL = `
  UPDATE outcomes
  SET market = ?, line_at_signal = ?, closing_line = ?, actual_result = ?, hit = ?, clv = ?,
      settlement_state = ?, no_grade_reason = ?, grading_version = ?
  WHERE ${STILL_BEFORE_WHERE}
`;

export { GRADE_COLUMNS };

export function gradeArgs(g: GradeFields): unknown[] {
  return GRADE_COLUMNS.map((c) => g[c] ?? null);
}

function startRun(mode: "write" | "reverse", o: { league?: string | null; note?: string | null; gitSha?: string | null; reverses?: string | null; candidates: number }): string {
  const runId = `rg_${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}_${randomUUID().slice(0, 8)}`;
  getPipelineDb().prepare(`
    INSERT INTO regrade_runs (run_id, mode, reverses_run_id, league, rule_version, git_sha, note, started_at, candidates)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(runId, mode, o.reverses ?? null, o.league ?? null, GRADING_VERSION, o.gitSha ?? null, o.note ?? null,
    new Date().toISOString(), o.candidates);
  return runId;
}

function finishRun(runId: string, r: Omit<RunResult, "run_id" | "worst_chunk_ms" | "accuracy" | "conflict_samples">, summary: unknown): void {
  getPipelineDb().prepare(`
    UPDATE regrade_runs
    SET finished_at = ?, changed = ?, conflicts = ?, mirror_updated = ?, mirror_missing = ?, mirror_repaired = ?, summary_json = ?
    WHERE run_id = ?
  `).run(new Date().toISOString(), r.changed, r.conflicts, r.mirror_updated, r.mirror_missing, r.mirror_repaired,
    JSON.stringify(summary), runId);
}

export interface ApplyOptions {
  chunk?: number;
  pauseMs?: number;
  note?: string | null;
  gitSha?: string | null;
  /** Called after each chunk with its lock-hold in ms (tests, and the script's lock-hold report). */
  onChunk?: (ms: number) => void;
  /** Recompute the accuracy tables when anything changed. Default true. */
  recompute?: boolean;
}

/** Apply a plan. Writes. */
export async function applyRegrade(plan: RegradePlan, opts: ApplyOptions = {}): Promise<RunResult> {
  const db = getPipelineDb();
  const chunk = clampChunk(opts.chunk);
  const pauseMs = Math.max(0, opts.pauseMs ?? DEFAULT_PAUSE_MS);
  const runId = startRun("write", { league: plan.league, note: opts.note, gitSha: opts.gitSha, candidates: plan.changes.length });
  const update = db.prepare(UPDATE_IF_UNCHANGED_SQL);
  const audit = db.prepare(`
    INSERT INTO outcome_regrades (
      id, run_id, outcome_id, signal_id, game_id, league, signal_type, excluded_stale,
      before_market, before_line_at_signal, before_closing_line, before_actual_result, before_hit, before_clv,
      before_settlement_state, before_no_grade_reason, before_grading_version,
      after_market, after_line_at_signal, after_closing_line, after_actual_result, after_hit, after_clv,
      after_settlement_state, after_no_grade_reason, after_grading_version,
      applied_at
    ) VALUES (?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?, ?)
  `);

  const res = { changed: 0, conflicts: 0, mirror_updated: 0, mirror_missing: 0, mirror_repaired: 0 };
  let worst = 0;
  const samples: ConflictSample[] = [];

  for (let i = 0; i < plan.changes.length; i += chunk) {
    const batch = plan.changes.slice(i, i + chunk);
    const landed: RegradeChange[] = [];
    const t0 = Date.now();
    db.transaction(() => {
      for (const c of batch) {
        // (stmt.run)(...) keeps better-sqlite3's receiver; a detached
        // `const run = stmt.run` throws "Illegal invocation".
        const r = update.run(...gradeArgs(c.after), c.outcome_id, ...gradeArgs(c.before));
        if (r.changes !== 1) {
          res.conflicts++;
          if (samples.length < MAX_CONFLICT_SAMPLES) samples.push(explainConflict(db, c, r.changes));
          continue;
        }
        audit.run(
          randomUUID(), runId, c.outcome_id, c.signal_id, c.game_id, c.league, c.signal_type, c.excluded_stale,
          ...gradeArgs(c.before), ...gradeArgs(c.after), new Date().toISOString(),
        );
        landed.push(c);
      }
    })();
    const held = Date.now() - t0;
    worst = Math.max(worst, held);
    opts.onChunk?.(held);
    res.changed += landed.length;

    for (const c of landed) {
      if (updateSettledOutcomeGrade(c.signal_id, toMirror(c.after)) === 1) res.mirror_updated++;
      else res.mirror_missing++;
    }
    if (i + chunk < plan.changes.length && pauseMs > 0) await sleep(pauseMs);
  }

  res.mirror_repaired = reconcileMirror();
  finishRun(runId, res, { transitions: plan.transitions, skipped: plan.skipped, accuracy: plan.accuracy, deferred: plan.deferred, conflict_samples: samples });
  const accuracy = (res.changed > 0 || res.mirror_repaired > 0) && opts.recompute !== false ? recomputeAccuracy() : null;
  return { run_id: runId, ...res, worst_chunk_ms: worst, accuracy, conflict_samples: samples };
}

interface AuditRow {
  id: string;
  outcome_id: string;
  signal_id: string;
  [k: string]: unknown;
}

function auditGrade(row: AuditRow, side: "before" | "after"): GradeFields {
  const g = {} as GradeFields;
  for (const c of GRADE_COLUMNS) (g as any)[c] = (row as any)[`${side}_${c}`] ?? null;
  return g;
}

export interface ReversePlan {
  run_id: string;
  restorable: number;
  conflicts: number;
  already_reversed: number;
}

function auditRowsFor(runId: string): AuditRow[] {
  return getPipelineDb().prepare("SELECT * FROM outcome_regrades WHERE run_id = ? ORDER BY applied_at ASC, id ASC").all(runId) as AuditRow[];
}

function currentGrade(outcomeId: string): GradeFields | null {
  const o = getPipelineDb().prepare(`
    SELECT market, line_at_signal, closing_line, actual_result, hit, clv,
           settlement_state, no_grade_reason, grading_version
    FROM outcomes WHERE id = ?
  `).get(outcomeId) as GradeFields | undefined;
  return o ? gradeOf(o) : null;
}

/** Read-only: what reversing a run would restore. */
export function planReverse(runId: string): ReversePlan {
  const run = getPipelineDb().prepare("SELECT run_id, mode FROM regrade_runs WHERE run_id = ?").get(runId) as { mode: string } | undefined;
  if (!run) throw new Error(`No regrade run ${runId}`);
  if (run.mode !== "write") throw new Error(`Run ${runId} is a ${run.mode} run; only a write run can be reversed`);
  const plan: ReversePlan = { run_id: runId, restorable: 0, conflicts: 0, already_reversed: 0 };
  for (const row of auditRowsFor(runId)) {
    if (row.reversed_at) { plan.already_reversed++; continue; }
    const cur = currentGrade(row.outcome_id);
    if (cur && sameGrade(cur, auditGrade(row, "after"))) plan.restorable++;
    else plan.conflicts++;
  }
  return plan;
}

/** Restore a write run's before grades where the outcome still holds its after grade. Writes. */
export async function reverseRun(runId: string, opts: ApplyOptions = {}): Promise<RunResult> {
  const pre = planReverse(runId);
  const db = getPipelineDb();
  const chunk = clampChunk(opts.chunk);
  const pauseMs = Math.max(0, opts.pauseMs ?? DEFAULT_PAUSE_MS);
  const reverseId = startRun("reverse", { reverses: runId, note: opts.note, gitSha: opts.gitSha, candidates: pre.restorable });
  const update = db.prepare(UPDATE_IF_UNCHANGED_SQL);
  const stamp = db.prepare("UPDATE outcome_regrades SET reversed_at = ?, reversed_by_run_id = ? WHERE id = ? AND reversed_at IS NULL");
  const rows = auditRowsFor(runId).filter((r) => !r.reversed_at);

  const res = { changed: 0, conflicts: 0, mirror_updated: 0, mirror_missing: 0, mirror_repaired: 0 };
  let worst = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    const landed: AuditRow[] = [];
    const t0 = Date.now();
    db.transaction(() => {
      for (const row of batch) {
        const r = update.run(...gradeArgs(auditGrade(row, "before")), row.outcome_id, ...gradeArgs(auditGrade(row, "after")));
        if (r.changes !== 1) { res.conflicts++; continue; }
        stamp.run(new Date().toISOString(), reverseId, row.id);
        landed.push(row);
      }
    })();
    const held = Date.now() - t0;
    worst = Math.max(worst, held);
    opts.onChunk?.(held);
    res.changed += landed.length;
    for (const row of landed) {
      if (updateSettledOutcomeGrade(row.signal_id, toMirror(auditGrade(row, "before"))) === 1) res.mirror_updated++;
      else res.mirror_missing++;
    }
    if (i + chunk < rows.length && pauseMs > 0) await sleep(pauseMs);
  }
  res.mirror_repaired = reconcileMirror();
  finishRun(reverseId, res, { reverses: runId });
  const accuracy = (res.changed > 0 || res.mirror_repaired > 0) && opts.recompute !== false ? recomputeAccuracy() : null;
  return { run_id: reverseId, ...res, worst_chunk_ms: worst, accuracy, conflict_samples: [] };
}

export function listRuns(limit = 20): Array<Record<string, unknown>> {
  return getPipelineDb().prepare(`
    SELECT run_id, mode, reverses_run_id, league, rule_version, started_at, finished_at,
           candidates, changed, conflicts, mirror_updated, mirror_missing, mirror_repaired
    FROM regrade_runs ORDER BY started_at DESC LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
}
