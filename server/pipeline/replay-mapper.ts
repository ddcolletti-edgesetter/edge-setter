import type { ReplayMarketState } from "../storage";
import type {
  ReplayApiResponse,
  ReplayClvContract,
  ReplaySignalContract,
  ReplaySnapshotContract,
  ReplayTimelineEvent,
} from "./replay-contract";

export function mapReplayToApiResponse(
  replay: ReplayMarketState,
): ReplayApiResponse {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    game_id: replay.game_id,
    as_of: replay.as_of,
    snapshots: mapSnapshots(replay),
    signals: mapSignals(replay),
    timeline: buildTimeline(replay),
    clv_states: mapClvStates(replay),
  };
}

function mapSnapshots(
  replay: ReplayMarketState,
): ReplaySnapshotContract[] {
  return replay.snapshot_history.map(snapshot => ({
    id: snapshot.id,
    snapshot_at: snapshot.snapshot_at,
    spread_line: snapshot.spread_line,
    total_line: snapshot.total_line,
    moneyline_home: snapshot.moneyline_home,
    moneyline_away: snapshot.moneyline_away,
  }));
}

function mapSignals(
  replay: ReplayMarketState,
): ReplaySignalContract[] {
  return replay.signals.map(({ signal }) => ({
    signal_id: signal.id,
    created_at: signal.created_at,
    signal_type: signal.signal_type ?? null,
    market: null,
    confidence: signal.confidence ?? null,
    line_at_signal: signal.line_movement?.open ?? null,
  }));
}

function buildTimeline(
  replay: ReplayMarketState,
): ReplayTimelineEvent[] {
  const snapshotEvents: ReplayTimelineEvent[] =
    replay.snapshot_history.map(snapshot => ({
      ts: snapshot.snapshot_at,
      type: "snapshot",
      entity_id: snapshot.id,
      payload: {
        spread_line: snapshot.spread_line,
        total_line: snapshot.total_line,
      },
    }));

  const signalEvents: ReplayTimelineEvent[] =
    replay.signals.map(({ signal }) => ({
      ts: signal.created_at,
      type: "signal_created",
      entity_id: signal.id,
      payload: {
        market: null,
        signal_type: signal.signal_type,
      },
    }));

  return [...snapshotEvents, ...signalEvents]
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

function mapClvStates(
  replay: ReplayMarketState,
): ReplayClvContract[] {
  return replay.clv_states.map(state => ({
    signal_id: state.signal_id,
    market: state.market,
    line_at_signal: state.line_at_signal,
    closing_line: state.closing_line,
    clv: state.clv,
  }));
}