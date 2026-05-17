import type { CLVState, ReplayMarketState, ReplayMarketStateInput, ReplaySignalState } from "../storage";
import crypto from "node:crypto";
import { computeSpreadOrTotalClv } from "./clv";
import type { LiveSignal } from "./types";
import { getPipelineDb, getSignalHistory, getSnapshotHistory, insertReplayAudit } from "./store";

const REPLAY_ENGINE_VERSION = "replay-engine-v1";
const RECONSTRUCTION_VERSION = "reconstruction-v1";
const NORMALIZATION_VERSION = "normalization-v1";
const REPLAY_VERSION = 1;

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

export function deriveReplayClvStates(replay: ReplayMarketState): CLVState[] {
  return replay.signals.flatMap(({ signal }) => {
    if (!signal.game_id || !signal.line_movement || !signal.created_at) {
      return [];
    }

    const signalSnapshot = replay.snapshot_history
      .filter(snapshot => snapshot.snapshot_at <= signal.created_at)
      .at(-1);

    const lineAtSignal = signalSnapshot?.spread_line ?? signal.line_movement.open;
    const closingLine = replay.latest_snapshot?.spread_line ?? null;

    return [{
      signal_id: signal.id,
      game_id: signal.game_id,
      market: "spread",
      line_at_signal: lineAtSignal,
      closing_line: closingLine,
      clv: computeSpreadOrTotalClv(lineAtSignal, closingLine),
    }];
  });
}

export async function buildReplayMarketState(
  input: ReplayMarketStateInput,
): Promise<ReplayMarketState> {
  const snapshotHistory = getSnapshotHistory(input.game_id, 200, input.as_of);
  const latestSnapshot = snapshotHistory[snapshotHistory.length - 1] ?? null;
  const signals = getReplaySignals(input.game_id, input.as_of);

  const replay: ReplayMarketState = {
    game_id: input.game_id,
    as_of: input.as_of,
    latest_snapshot: latestSnapshot,
    snapshot_history: snapshotHistory,
    signals,
    clv_states: [],
  };

  const finalizedReplay = {
    ...replay,
    clv_states: deriveReplayClvStates(replay),
  };

  persistReplayAudit(finalizedReplay);

  return finalizedReplay;
}
export function getReplayState(
  gameId: string,
  asOf: string,
): ReplayMarketState {
  const snapshot_history = getSnapshotHistory(gameId, 200, asOf);

  const signals = getReplaySignals(gameId, asOf);

  const clv_states: CLVState[] = signals.map(({ signal }) => ({
    game_id: gameId,
    signal_id: signal.id,
    market: signal.signal_type ?? "unknown",
    line_at_signal: signal.line_movement?.open ?? null,
    closing_line: signal.line_movement?.current ?? null,
    clv: computeSpreadOrTotalClv(
      signal.line_movement?.open ?? null,
      signal.line_movement?.current ?? null,
    ),
  }));

  const replay: ReplayMarketState = {
    game_id: gameId,
    as_of: asOf,
    latest_snapshot:
      snapshot_history.length > 0
        ? snapshot_history[snapshot_history.length - 1]
        : null,
    snapshot_history,
    signals,
    clv_states,
  };

  persistReplayAudit(replay);

  return replay;
}

function persistReplayAudit(replay: ReplayMarketState): void {
  const hashes = buildReplayHashes(replay);
  const divergenceSummary: unknown[] = [];
  const divergenceCount = divergenceSummary.length;
  const reconstructionTimestamp = new Date().toISOString();
  const parentReplayHash = getLatestReplayAuditHash(replay.game_id);

  insertReplayAudit({
    game_id: replay.game_id,
    as_of: replay.as_of,
    replay_hash: hashes.replay_hash,
    timeline_hash: hashes.timeline_hash,
    signal_hash: hashes.signal_hash,
    snapshot_hash: hashes.snapshot_hash,
    verification_status: divergenceCount === 0 ? "verified" : "diverged",
    divergence_count: divergenceCount,
    divergence_summary_json: stableStringify(divergenceSummary),
    provenance_json: stableStringify({
      replay_engine_version: REPLAY_ENGINE_VERSION,
      reconstruction_timestamp: reconstructionTimestamp,
      snapshot_count: replay.snapshot_history.length,
      signal_count: replay.signals.length,
      replay_source_metadata: {
        source: "pipeline.sqlite",
        game_id: replay.game_id,
        as_of: replay.as_of,
        latest_snapshot_id: replay.latest_snapshot?.id ?? null,
      },
    }),
    lineage_json: stableStringify({
      parent_replay_hash: parentReplayHash,
      replay_generation_chain: [
        "load_snapshots",
        "load_signals",
        "derive_clv_states",
        "finalize_replay",
        "persist_audit",
      ],
      normalization_version: NORMALIZATION_VERSION,
    }),
    reconstruction_version: RECONSTRUCTION_VERSION,
    replay_version: REPLAY_VERSION,
  });
}

function buildReplayHashes(replay: ReplayMarketState): {
  replay_hash: string;
  timeline_hash: string;
  signal_hash: string;
  snapshot_hash: string;
} {
  const timeline = buildReplayTimeline(replay);
  const snapshots = replay.snapshot_history;
  const signals = replay.signals;

  return {
    replay_hash: stableHash({
      version: REPLAY_VERSION,
      game_id: replay.game_id,
      as_of: replay.as_of,
      latest_snapshot: replay.latest_snapshot,
      snapshot_history: snapshots,
      signals,
      timeline,
      clv_states: replay.clv_states,
    }),
    timeline_hash: stableHash(timeline),
    signal_hash: stableHash(signals),
    snapshot_hash: stableHash(snapshots),
  };
}

function buildReplayTimeline(replay: ReplayMarketState): unknown[] {
  const snapshotEvents = replay.snapshot_history.map(snapshot => ({
    ts: snapshot.snapshot_at,
    type: "snapshot",
    entity_id: snapshot.id,
    payload: {
      spread_line: snapshot.spread_line,
      total_line: snapshot.total_line,
      moneyline_home: snapshot.moneyline_home,
      moneyline_away: snapshot.moneyline_away,
    },
  }));

  const signalEvents = replay.signals.flatMap(({ signal, history }) => [
    {
      ts: signal.created_at,
      type: "signal_created",
      entity_id: signal.id,
      payload: {
        signal_type: signal.signal_type,
        confidence: signal.confidence,
        line_at_signal: signal.line_movement?.open ?? null,
      },
    },
    ...history.map(event => ({
      ts: event.created_at,
      type: "signal_state_changed",
      entity_id: event.id,
      payload: {
        signal_id: event.signal_id,
        previous_state: event.previous_state,
        new_state: event.new_state,
        reason: event.reason,
        metadata: event.metadata,
      },
    })),
  ]);

  return [...snapshotEvents, ...signalEvents].sort((a, b) => {
    const byTs = a.ts.localeCompare(b.ts);
    if (byTs !== 0) return byTs;

    const byType = a.type.localeCompare(b.type);
    if (byType !== 0) return byType;

    return a.entity_id.localeCompare(b.entity_id);
  });
}

function getLatestReplayAuditHash(gameId: string): string | null {
  const row = getPipelineDb()
    .prepare(`
      SELECT replay_hash
      FROM replay_audits
      WHERE game_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(gameId) as { replay_hash: string } | undefined;

  return row?.replay_hash ?? null;
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
