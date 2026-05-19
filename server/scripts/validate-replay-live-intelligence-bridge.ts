import Database from "better-sqlite3";

import {
  buildReplayLiveIntelligenceBridgeSnapshot,
  computeReplayLiveIntelligenceBridgeHash,
  getReplayLiveIntelligenceBridgeSnapshot,
  serializeReplayLiveIntelligenceBridgeSnapshot,
} from "../pipeline/replay-live-intelligence-bridge";
import type {
  ReplayLiveBridgeInput,
} from "../pipeline/replay-live-intelligence-bridge-contract";
import type {
  LiveSignal,
  Outcome,
  RawEvent,
  ScoreBreakdown,
} from "../pipeline/types";

const GENERATED_AT = "2026-05-20T03:00:00.000Z";
const PERSISTED_AT = "2026-05-20T03:05:00.000Z";

const input: ReplayLiveBridgeInput = {
  generated_at: GENERATED_AT,
  persisted_at: PERSISTED_AT,
  raw_events: [
    rawEvent("raw-injury-1", "espn-nba", "api", "NBA", "game-nba-1", "BOS", "Jayson Tatum", "injury_update", {
      designation: "Questionable",
      body_part: "ankle",
      confidence: 76,
    }),
    rawEvent("raw-line-1", "the_odds_api", "api", "NBA", "game-nba-1", "BOS", null, "line_move", {
      open_line: -3.5,
      current_line: -5.5,
      sharp_percentage: 68,
      confidence: 82,
    }),
  ],
  live_signals: [
    liveSignal("signal-injury-1", "injury_update", "NBA", "game-nba-1", "BOS", "Jayson Tatum", 84, 86, ["raw-injury-1"]),
    liveSignal("signal-line-1", "line_move", "NBA", "game-nba-1", "BOS", null, 79, 82, ["raw-line-1"]),
  ],
  odds_snapshots: [
    {
      id: "odds-nba-1",
      game_id: "game-nba-1",
      league: "NBA",
      sportsbook: "DraftKings",
      market_source: "the_odds_api",
      spread_line: -5.5,
      spread_team: "BOS",
      total_line: 218.5,
      moneyline_home: -210,
      moneyline_away: 175,
      source_game_id: "odds-api-game-nba-1",
      snapshot_at: "2026-05-20T02:55:00.000Z",
    },
  ],
  injury_reports: [
    {
      report_id: "injury-report-1",
      league: "NBA",
      team: "BOS",
      player: "Jayson Tatum",
      designation: "Questionable",
      body_part: "ankle",
      source_id: "espn-nba",
      confidence: 74,
      reported_at: "2026-05-20T02:50:00.000Z",
    },
  ],
  source_intelligence_events: [
    {
      event_id: "source-intel-1",
      source_id: "espn-nba",
      source_name: "ESPN NBA Injuries",
      source_type: "api",
      reliability_score: 88,
      topic: "injury",
      league: "NBA",
      signal_id: "signal-injury-1",
      observed_at: "2026-05-20T02:52:00.000Z",
    },
    {
      event_id: "source-intel-2",
      source_id: "market-watch",
      source_name: "Market Watch",
      source_type: "model",
      reliability_score: 81,
      topic: "odds",
      league: "NBA",
      signal_id: "signal-line-1",
      observed_at: "2026-05-20T02:56:00.000Z",
    },
  ],
  settled_outcomes: [
    outcome("outcome-line-1", "signal-line-1", "game-nba-1", true, 1.5),
  ],
  consensus_threshold: 0.6,
  approval_threshold: 0.52,
};

const db = new Database(":memory:");

try {
  const bridge = buildReplayLiveIntelligenceBridgeSnapshot(db, input);
  const bridgeAgain = buildReplayLiveIntelligenceBridgeSnapshot(db, input);
  const restored = getReplayLiveIntelligenceBridgeSnapshot(db, bridge.bridge_id);

  assertEqual(bridge.deterministic_hash, bridgeAgain.deterministic_hash, "bridge hash must be deterministic");
  assertEqual(serializeReplayLiveIntelligenceBridgeSnapshot(bridge), serializeReplayLiveIntelligenceBridgeSnapshot(bridgeAgain), "bridge serialization must be replay-safe");
  assertEqual(computeReplayLiveIntelligenceBridgeHash({ bridge: bridge.bridge_id }).length, 64, "bridge hash helper mismatch");
  assertEqual(restored?.deterministic_hash, bridge.deterministic_hash, "persisted bridge snapshot mismatch");
  assertEqual(Object.isFrozen(bridge), true, "bridge snapshot must be immutable");
  assertEqual(Object.isFrozen(bridge.adapter.canonical_records), true, "canonical records must be immutable");

  assertEqual(bridge.adapter.canonical_records.length, 9, "live canonical record count mismatch");
  assertEqual(hasKind(bridge, "raw_event"), true, "raw events did not enter bridge");
  assertEqual(hasKind(bridge, "live_signal"), true, "live signals did not enter bridge");
  assertEqual(hasKind(bridge, "odds_snapshot"), true, "odds snapshots did not enter bridge");
  assertEqual(hasKind(bridge, "injury_report"), true, "injury reports did not enter bridge");
  assertEqual(hasKind(bridge, "source_intelligence_event"), true, "source intelligence events did not enter bridge");
  assertEqual(hasKind(bridge, "settled_outcome"), true, "settled outcomes did not enter bridge");

  assertEqual(bridge.consensus_results.length, bridge.adapter.consensus_inputs.length, "consensus routing mismatch");
  assertEqual(bridge.consensus_results.every((result) => result.validators.length >= 6), true, "consensus validators missing");
  assertEqual(bridge.consensus_results.some((result) => result.validators.some((validator) => validator.validator_type === "settled_outcome_validator")), true, "settlement validator missing");
  assertEqual(bridge.governance_snapshot.decisions.length > 0, true, "governance evaluation missing");
  assertEqual(bridge.recovery_results.length, bridge.consensus_results.length, "recovery propagation mismatch");
  assertEqual(bridge.consensus_intelligence.validator_profiles.length > 0, true, "validator intelligence scoring missing");
  assertEqual(bridge.agent_snapshot.trust_profiles.length > 0, true, "validator trust scoring missing");
  assertEqual(bridge.evolution_snapshot.strategy_evolution.length > 0, true, "evolution propagation missing");
  assertEqual(bridge.evolution_snapshot.mutation_lineage.length > 0, true, "evolution mutation propagation missing");
  assertEqual(bridge.memory_snapshot.replay_evolution.length > 0, true, "replay memory bridge propagation missing");
  assertEqual(bridge.self_healing_snapshot.decisions.length > 0, true, "self-healing bridge propagation missing");
  assertEqual(bridge.lineage_snapshot.replay_hashes.length > 0, true, "lineage graph bridge propagation missing");

  const sourceRecord = bridge.adapter.canonical_records.find((record) => record.kind === "source_intelligence_event");
  assertEqual(Boolean(sourceRecord?.replay_hash), true, "source intelligence replay hash missing");
  assertEqual(bridge.adapter.consensus_inputs.every((consensusInput) => consensusInput.replay_hash.length === 64), true, "live replay hashes must be deterministic hashes");

  console.log("Replay live intelligence bridge validation passed.");
  console.log(JSON.stringify({
    bridge_id: bridge.bridge_id,
    run_id: bridge.run_id,
    deterministic_hash: bridge.deterministic_hash,
    canonical_records: bridge.adapter.canonical_records.length,
    consensus_results: bridge.consensus_results.length,
    governance_decisions: bridge.governance_snapshot.decisions.length,
    recovery_results: bridge.recovery_results.length,
    validator_trust_profiles: bridge.agent_snapshot.trust_profiles.length,
    intelligence_profiles: bridge.consensus_intelligence.validator_profiles.length,
    evolution_records: bridge.evolution_snapshot.strategy_evolution.length,
    record_kinds: Array.from(new Set(bridge.adapter.canonical_records.map((record) => record.kind))).sort(),
    immutable_outputs: {
      snapshot: Object.isFrozen(bridge),
      canonical_records: Object.isFrozen(bridge.adapter.canonical_records),
    },
  }, null, 2));
} finally {
  db.close();
}

function rawEvent(
  id: string,
  sourceId: string,
  sourceType: RawEvent["source_type"],
  league: RawEvent["league"],
  gameId: string | null,
  team: string | null,
  player: string | null,
  eventType: RawEvent["event_type"],
  payload: Record<string, unknown>,
): RawEvent {
  return {
    id,
    source_id: sourceId,
    source_type: sourceType,
    league,
    game_id: gameId,
    team,
    player,
    event_type: eventType,
    payload,
    processed: true,
    processed_at: "2026-05-20T02:58:00.000Z",
    created_at: "2026-05-20T02:45:00.000Z",
    received_at: "2026-05-20T02:45:00.000Z",
  };
}

function liveSignal(
  id: string,
  signalType: LiveSignal["signal_type"],
  league: LiveSignal["league"],
  gameId: string,
  team: string,
  player: string | null,
  confidence: number,
  score: number,
  rawEventIds: readonly string[],
): LiveSignal {
  const lineMovement = signalType === "line_move"
    ? { open: -3.5, current: -5.5, delta: 2, direction: "down" as const }
    : null;
  return {
    id,
    league,
    game_id: gameId,
    signal_type: signalType,
    headline: signalType === "line_move" ? "Boston spread steams two points" : "Tatum ankle status updated",
    body: "Deterministic live bridge validation fixture.",
    action_note: "Route through replay intelligence.",
    why_it_matters: "Live sports data must be replay-verifiable.",
    team,
    player,
    matchup: "MIA @ BOS",
    sources: [{ name: signalType === "line_move" ? "Market Watch" : "ESPN NBA Injuries", type: "api" }],
    source_count: 1,
    verdict: "likely",
    confidence,
    confirmation_strength: "Corroborated",
    line_movement: lineMovement,
    injury_designation: signalType === "injury_update" ? "Questionable" : null,
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: signalType === "injury_update",
    score,
    score_band: score >= 85 ? "Elite" : "Strong",
    urgency_label: "URGENT",
    urgency_reason: "Validation fixture",
    trust_label: "Corroborated",
    score_explanation: "Deterministic fixture score",
    breakdown: breakdown(),
    raw_event_ids: [...rawEventIds],
    signal_time: "2026-05-20T02:57:00.000Z",
    created_at: "2026-05-20T02:58:00.000Z",
    updated_at: "2026-05-20T02:58:00.000Z",
    outcome_id: signalType === "line_move" ? "outcome-line-1" : null,
  };
}

function outcome(
  id: string,
  signalId: string,
  gameId: string,
  hit: boolean,
  clv: number,
): Outcome {
  return {
    id,
    signal_id: signalId,
    game_id: gameId,
    home_score: 112,
    away_score: 104,
    market: "spread",
    line_at_signal: -5.5,
    closing_line: -7,
    actual_result: 8,
    hit,
    clv,
    recorded_at: "2026-05-20T05:30:00.000Z",
    created_at: "2026-05-20T05:30:00.000Z",
  };
}

function breakdown(): ScoreBreakdown {
  return {
    confidenceScore: 18,
    sourceQualityScore: 24,
    marketImpactScore: 20,
    recencyBonus: 10,
    relevanceScore: 7,
    contextScore: 5,
    leagueModifierApplied: "NBA validation fixture",
    rawBeforeMods: 84,
  };
}

function hasKind(
  bridge: { readonly adapter: { readonly canonical_records: readonly { readonly kind: string }[] } },
  kind: string,
): boolean {
  return bridge.adapter.canonical_records.some((record) => record.kind === kind);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}
