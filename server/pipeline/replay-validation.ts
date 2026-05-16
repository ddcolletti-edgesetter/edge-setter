import type { ReplayMarketState } from "../storage";
import { deriveReplayClvStates, getReplaySignals } from "./replay";
import { getOutcomes, getSnapshotHistory } from "./store";

export interface ReplayOutcomeValidation {
  signal_id: string;
  outcome_id: string | null;
  game_id: string | null;
  as_of: string | null;
  matched: boolean;
  replay_clv: number | null;
  outcome_clv: number | null;
  reason: string | null;
}

export function validateReplayAgainstOutcome(
  signalId: string,
): ReplayOutcomeValidation {
  const outcome = getOutcomes(signalId)[0];

  if (!outcome) {
    return {
      signal_id: signalId,
      outcome_id: null,
      game_id: null,
      as_of: null,
      matched: false,
      replay_clv: null,
      outcome_clv: null,
      reason: "No outcome found for signal",
    };
  }

  const asOf = outcome.recorded_at ?? outcome.created_at;
  const snapshotHistory = getSnapshotHistory(outcome.game_id, 200, asOf);
  const replay: ReplayMarketState = {
    game_id: outcome.game_id,
    as_of: asOf,
    latest_snapshot: snapshotHistory[snapshotHistory.length - 1] ?? null,
    snapshot_history: snapshotHistory,
    signals: getReplaySignals(outcome.game_id, asOf),
    clv_states: [],
  };
  const clvStates = deriveReplayClvStates(replay);
  const replayClv = clvStates.find(
    state => state.signal_id === signalId && state.market === outcome.market,
  )?.clv ?? null;
  const matched = replayClv === outcome.clv;

  return {
    signal_id: signalId,
    outcome_id: outcome.id,
    game_id: outcome.game_id,
    as_of: asOf,
    matched,
    replay_clv: replayClv,
    outcome_clv: outcome.clv,
    reason: matched ? null : "Replay CLV does not match stored outcome CLV",
  };
}
