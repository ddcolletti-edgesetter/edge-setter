import { exportReplayParityReport } from "../pipeline/replay-validation";
import { getPipelineDb } from "../pipeline/store";

interface OutcomeDiagnosticRow {
  id: string;
  signal_id: string;
  game_id: string;
  market: string;
  line_at_signal: number | null;
  closing_line: number | null;
  clv: number | null;
  recorded_at: string | null;
  created_at: string;
}

interface SnapshotDiagnosticRow {
  id: string;
  game_id: string;
  snapshot_at: string;
  spread_line: number | null;
  total_line: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
}

function formatSnapshot(row: SnapshotDiagnosticRow | null) {
  if (!row) return null;

  return {
    id: row.id,
    game_id: row.game_id,
    snapshot_at: row.snapshot_at,
    spread_line: row.spread_line,
    total_line: row.total_line,
    home_moneyline: row.moneyline_home,
    away_moneyline: row.moneyline_away,
  };
}

const db = getPipelineDb();
const report = exportReplayParityReport();
const diagnostics = report.by_game.flatMap(game =>
  game.validations
    .map(v => {
      const outcome = db.prepare(`
        SELECT id, signal_id, game_id, market, line_at_signal, closing_line, clv, recorded_at, created_at
        FROM outcomes
        WHERE id = ?
      `).get(v.outcome_id) as OutcomeDiagnosticRow | undefined;

      const signal = db.prepare(`
        SELECT *
        FROM live_signals
        WHERE id = ?
      `).get(v.signal_id) as Record<string, unknown> | undefined;

      const signalCreatedAt = typeof signal?.created_at === "string"
        ? signal.created_at
        : null;
      const gameId = outcome?.game_id ?? v.game_id;
      const snapshotHistory = gameId && signalCreatedAt
        ? db.prepare(`
          SELECT id, game_id, snapshot_at, spread_line, total_line, moneyline_home, moneyline_away
          FROM odds_snapshots
          WHERE game_id = ?
            AND snapshot_at <= ?
          ORDER BY snapshot_at ASC
        `).all(gameId, signalCreatedAt) as SnapshotDiagnosticRow[]
        : [];
      const latestSnapshot = gameId && v.as_of
        ? db.prepare(`
          SELECT id, game_id, snapshot_at, spread_line, total_line, moneyline_home, moneyline_away
          FROM odds_snapshots
          WHERE game_id = ?
            AND snapshot_at <= ?
          ORDER BY snapshot_at DESC
          LIMIT 1
        `).get(gameId, v.as_of) as SnapshotDiagnosticRow | undefined
        : undefined;
      const closingSnapshot = gameId
        ? db.prepare(`
          SELECT id, game_id, snapshot_at, spread_line, total_line, moneyline_home, moneyline_away
          FROM odds_snapshots
          WHERE game_id = ?
          ORDER BY snapshot_at DESC
          LIMIT 1
        `).get(gameId) as SnapshotDiagnosticRow | undefined
        : undefined;
      const signalSnapshot = snapshotHistory.at(-1);
      const parsedLineMovement = typeof signal?.line_movement === "string" && signal.line_movement
        ? JSON.parse(signal.line_movement)
        : null;
      const replayLineAtSignal = signalSnapshot?.spread_line ?? parsedLineMovement?.open ?? null;
      const replayClosingLine = closingSnapshot?.spread_line ?? null;

      return {
        outcome_row: outcome ?? null,
        signal_row: signal
          ? {
              id: signal.id,
              game_id: signal.game_id,
              market: signal.market ?? null,
              signal_type: signal.signal_type ?? null,
              type: signal.type ?? null,
              created_at: signal.created_at,
              line_movement: parsedLineMovement,
            }
          : null,
        replay_snapshot_history_around_signal: snapshotHistory
          .slice(-5)
          .map(formatSnapshot),
        replay_latest_snapshot_at_as_of: formatSnapshot(latestSnapshot ?? null),
        replay_closing_snapshot: formatSnapshot(closingSnapshot ?? null),
        calculated_comparison: {
          stored_outcome: {
            line_at_signal: outcome?.line_at_signal ?? null,
            closing_line: outcome?.closing_line ?? null,
            clv: outcome?.clv ?? null,
          },
          replay: {
            line_at_signal: replayLineAtSignal,
            closing_line: replayClosingLine,
            clv: v.replay_clv,
          },
        },
        reason: v.reason,
        as_of: v.as_of,
      };
    })
);
const mismatches = diagnostics.filter(diagnostic => diagnostic.reason !== null);
const stale_outcomes = diagnostics
  .filter(diagnostic => {
    const stored = diagnostic.calculated_comparison.stored_outcome;
    const replay = diagnostic.calculated_comparison.replay;

    return stored.line_at_signal !== replay.line_at_signal
      || stored.closing_line !== replay.closing_line
      || stored.clv !== replay.clv;
  })
  .map(diagnostic => ({
    outcome_id: diagnostic.outcome_row?.id ?? null,
    signal_id: diagnostic.outcome_row?.signal_id ?? null,
    game_id: diagnostic.outcome_row?.game_id ?? null,
    stored_outcome: diagnostic.calculated_comparison.stored_outcome,
    canonical_replay: diagnostic.calculated_comparison.replay,
  }));

console.log(JSON.stringify({
  generated_at: report.generated_at,
  total: report.total,
  matched: report.matched,
  mismatched: report.mismatched,
  stale_outcomes,
  mismatches,
}, null, 2));
