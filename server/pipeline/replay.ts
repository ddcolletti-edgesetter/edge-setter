import type { ReplayMarketState, ReplayMarketStateInput } from "../storage";
import { getPipelineDb, getSignalHistory, getSnapshotHistory, type SignalHistoryRow } from "./store";

export function getReplaySignals(gameId: string, asOf: string): SignalHistoryRow[] {
  const db = getPipelineDb();
  const rows = db.prepare(`
    SELECT id
    FROM live_signals
    WHERE game_id = ?
      AND created_at <= ?
    ORDER BY created_at ASC, id ASC
  `).all(gameId, asOf) as { id: string }[];

  return rows.flatMap(row => getSignalHistory(row.id, asOf));
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
