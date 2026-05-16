import type { ReplayMarketState, ReplayMarketStateInput, ReplaySignalState } from "../storage";
import type { LiveSignal } from "./types";
import { getPipelineDb, getSignalHistory, getSnapshotHistory, type SignalHistoryRow } from "./store";

export function getReplaySignals(gameId: string, asOf: string): ReplaySignalState[] {
  const db = getPipelineDb();
  const rows = db.prepare(`
    SELECT *
    FROM live_signals
    WHERE game_id = ?
      AND created_at <= ?
    ORDER BY created_at ASC, id ASC
  `).all(gameId, asOf);

  return rows.map(row => {
    const signal = deserializeReplaySignal(row);
    return {
      signal,
      history: getSignalHistory(signal.id, asOf),
    };
  });
}

function deserializeReplaySignal(row: any): LiveSignal {
  return {
    ...row,
    sources: JSON.parse(row.sources ?? "[]"),
    line_movement: row.line_movement ? JSON.parse(row.line_movement) : null,
    breakdown: JSON.parse(row.breakdown ?? "{}"),
    raw_event_ids: JSON.parse(row.raw_event_ids ?? "[]"),
    betting_relevance: row.betting_relevance === 1,
    fantasy_relevance: row.fantasy_relevance === 1,
  };
}

export async function buildReplayMarketState(
  input: ReplayMarketStateInput,
): Promise<ReplayMarketState> {
  const snapshotHistory = getSnapshotHistory(input.game_id, 200, input.as_of);
  const latestSnapshot = snapshotHistory[snapshotHistory.length - 1] ?? null;
  const signals = getReplaySignals(input.game_id, input.as_of);

  return {
    game_id: input.game_id,
    as_of: input.as_of,
    latest_snapshot: latestSnapshot,
    snapshot_history: snapshotHistory,
    signals,
    clv_states: [],
  };
}
