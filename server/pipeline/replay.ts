import type { ReplayMarketState, ReplayMarketStateInput } from "../storage";
import { getSnapshotHistory } from "./store";

export async function buildReplayMarketState(
  input: ReplayMarketStateInput,
): Promise<ReplayMarketState> {
  const snapshotHistory = getSnapshotHistory(input.game_id, 200, input.as_of);
  const latestSnapshot = snapshotHistory[snapshotHistory.length - 1] ?? null;

  return {
    game_id: input.game_id,
    as_of: input.as_of,
    latest_snapshot: latestSnapshot,
    snapshot_history: snapshotHistory,
    signals: [],
    clv_states: [],
  };
}
