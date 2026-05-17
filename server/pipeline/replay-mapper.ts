import crypto from "node:crypto";
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
  const snapshots = mapSnapshots(replay);
  const signals = mapSignals(replay);
  const timeline = normalizeTimeline(buildTimeline(replay));
  const clv_states = mapClvStates(replay);

  const timeline_hash = stableHash(timeline);
  const integrity_hash = stableHash({
    version: 1,
    game_id: replay.game_id,
    as_of: replay.as_of,
    snapshots,
    signals,
    timeline,
    clv_states,
  });

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    game_id: replay.game_id,
    as_of: replay.as_of,
    integrity_hash,
    timeline_hash,
    snapshots,
    signals,
    timeline,
    clv_states,
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

  return [...snapshotEvents, ...signalEvents];
}

function normalizeTimeline(
  events: ReplayTimelineEvent[],
): ReplayTimelineEvent[] {
  return [...events].sort((a, b) => {
    const byTs = a.ts.localeCompare(b.ts);
    if (byTs !== 0) return byTs;

    const byType = a.type.localeCompare(b.type);
    if (byType !== 0) return byType;

    return a.entity_id.localeCompare(b.entity_id);
  });
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

function stableHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}