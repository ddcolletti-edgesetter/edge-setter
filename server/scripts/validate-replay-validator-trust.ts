import Database from "better-sqlite3";

import {
  buildReplayLiveIntelligenceBridgeSnapshot,
} from "../pipeline/replay-live-intelligence-bridge";
import type {
  ReplayLiveBridgeInput,
} from "../pipeline/replay-live-intelligence-bridge-contract";
import {
  buildReplayValidatorTrustSnapshot,
  computeReplayValidatorTrustHash,
  getSourceReliabilityEvolution,
  getTrustLineageHistory,
  getValidatorOutcomeScores,
  getValidatorPerformanceHistory,
  serializeReplayValidatorTrustSnapshot,
} from "../pipeline/replay-validator-trust";
import type {
  ReplayValidatorTrustAction,
  ReplayValidatorTrustState,
} from "../pipeline/replay-validator-trust-contract";
import type {
  LiveSignal,
  Outcome,
  RawEvent,
  ScoreBreakdown,
} from "../pipeline/types";

const GENERATED_AT = "2026-05-20T04:00:00.000Z";
const PERSISTED_AT = "2026-05-20T04:05:00.000Z";

const liveSignals = [
  liveSignal("trust-signal-injury-win", "injury_update", "NBA", "trust-game-1", "BOS", "Jayson Tatum", 86, 88, ["trust-raw-injury-win"], "ESPN NBA Injuries", "trust-outcome-win"),
  liveSignal("trust-signal-line-loss", "line_move", "NBA", "trust-game-2", "LAL", null, 78, 72, ["trust-raw-line-loss"], "Market Watch", "trust-outcome-loss"),
  liveSignal("trust-signal-injury-loss", "injury_update", "NBA", "trust-game-3", "MIA", "Jimmy Butler", 69, 64, ["trust-raw-injury-loss"], "Unverified Beat", "trust-outcome-injury-loss"),
] as const;

const settledOutcomes = [
  outcome("trust-outcome-win", "trust-signal-injury-win", "trust-game-1", true, 2.25),
  outcome("trust-outcome-loss", "trust-signal-line-loss", "trust-game-2", false, -1.75),
  outcome("trust-outcome-injury-loss", "trust-signal-injury-loss", "trust-game-3", false, -2.5),
] as const;

const bridgeInput: ReplayLiveBridgeInput = {
  generated_at: GENERATED_AT,
  persisted_at: PERSISTED_AT,
  raw_events: [
    rawEvent("trust-raw-injury-win", "espn-nba", "api", "NBA", "trust-game-1", "BOS", "Jayson Tatum", "injury_update", { designation: "OUT", confidence: 88 }),
    rawEvent("trust-raw-line-loss", "the_odds_api", "api", "NBA", "trust-game-2", "LAL", null, "line_move", { open_line: 4.5, current_line: 2.5, confidence: 76 }),
    rawEvent("trust-raw-injury-loss", "unverified-beat", "scrape", "NBA", "trust-game-3", "MIA", "Jimmy Butler", "injury_update", { designation: "Questionable", confidence: 58 }),
  ],
  live_signals: liveSignals,
  odds_snapshots: [
    {
      id: "trust-odds-1",
      game_id: "trust-game-1",
      league: "NBA",
      sportsbook: "DraftKings",
      market_source: "the_odds_api",
      spread_line: -4.5,
      spread_team: "BOS",
      total_line: 217.5,
      moneyline_home: -180,
      moneyline_away: 155,
      source_game_id: "trust-game-1",
      snapshot_at: "2026-05-20T03:55:00.000Z",
    },
  ],
  injury_reports: [
    {
      report_id: "trust-injury-report-win",
      league: "NBA",
      team: "BOS",
      player: "Jayson Tatum",
      designation: "OUT",
      body_part: "ankle",
      source_id: "espn-nba",
      confidence: 90,
      reported_at: "2026-05-20T03:40:00.000Z",
    },
    {
      report_id: "trust-injury-report-loss",
      league: "NBA",
      team: "MIA",
      player: "Jimmy Butler",
      designation: "Available",
      body_part: "knee",
      source_id: "unverified-beat",
      confidence: 55,
      reported_at: "2026-05-20T03:42:00.000Z",
    },
  ],
  source_intelligence_events: [
    {
      event_id: "trust-source-espn",
      source_id: "espn-nba",
      source_name: "ESPN NBA Injuries",
      source_type: "api",
      reliability_score: 89,
      topic: "injury",
      league: "NBA",
      signal_id: "trust-signal-injury-win",
      observed_at: "2026-05-20T03:45:00.000Z",
    },
    {
      event_id: "trust-source-market",
      source_id: "market-watch",
      source_name: "Market Watch",
      source_type: "model",
      reliability_score: 78,
      topic: "odds",
      league: "NBA",
      signal_id: "trust-signal-line-loss",
      observed_at: "2026-05-20T03:46:00.000Z",
    },
    {
      event_id: "trust-source-unverified",
      source_id: "unverified-beat",
      source_name: "Unverified Beat",
      source_type: "scrape",
      reliability_score: 52,
      topic: "injury",
      league: "NBA",
      signal_id: "trust-signal-injury-loss",
      observed_at: "2026-05-20T03:47:00.000Z",
    },
  ],
  settled_outcomes: settledOutcomes,
  consensus_threshold: 0.6,
  approval_threshold: 0.52,
};

const db = new Database(":memory:");

try {
  const bridge = buildReplayLiveIntelligenceBridgeSnapshot(db, bridgeInput);
  const trust = buildReplayValidatorTrustSnapshot(db, {
    run_id: bridge.run_id,
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    bridge_snapshot: bridge,
    live_signals: liveSignals,
    settled_outcomes: settledOutcomes,
    injury_reports: bridgeInput.injury_reports,
    source_intelligence_events: bridgeInput.source_intelligence_events,
    decay_floor: 58,
    recovery_threshold: 74,
  });
  const trustAgain = buildReplayValidatorTrustSnapshot(db, {
    run_id: bridge.run_id,
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    bridge_snapshot: bridge,
    live_signals: liveSignals,
    settled_outcomes: settledOutcomes,
    injury_reports: bridgeInput.injury_reports,
    source_intelligence_events: bridgeInput.source_intelligence_events,
    decay_floor: 58,
    recovery_threshold: 74,
  });

  assertEqual(trust.deterministic_hash, trustAgain.deterministic_hash, "validator trust hash must be deterministic");
  assertEqual(serializeReplayValidatorTrustSnapshot(trust), serializeReplayValidatorTrustSnapshot(trustAgain), "validator trust serialization mismatch");
  assertEqual(computeReplayValidatorTrustHash({ trust: trust.snapshot_id }).length, 64, "validator trust hash helper mismatch");
  assertEqual(Object.isFrozen(trust), true, "validator trust snapshot must be immutable");
  assertEqual(Object.isFrozen(trust.outcome_scores), true, "outcome scores must be immutable");

  assertEqual(trust.outcome_scores.length > 0, true, "validator outcome scores missing");
  assertEqual(trust.performance_history.length > 0, true, "historical validator performance missing");
  assertEqual(trust.source_reliability.length >= 3, true, "source reliability evolution missing");
  assertEqual(trust.decay_recovery_history.some((record) => record.action === "apply_trust_decay"), true, "trust decay missing");
  assertEqual(trust.decay_recovery_history.some((record) => record.action === "recover_trust"), true, "trust recovery missing");
  assertEqual(trust.confidence_recalibration.every((record) => record.recalibrated_confidence >= 0 && record.recalibrated_confidence <= 100), true, "confidence recalibration out of range");
  assertEqual(trust.consensus_weight_adaptation.some((record) => record.adapted_weight !== record.previous_weight), true, "consensus weight adaptation missing");
  assertEqual(trust.validator_profiles.length, trust.performance_history.length, "validator intelligence persistence mismatch");
  assertEqual(trust.trust_lineage.some((reference) => reference.reference_kind === "outcome"), true, "outcome trust lineage missing");
  assertEqual(trust.trust_lineage.some((reference) => reference.reference_kind === "source_reliability"), true, "source reliability lineage missing");
  assertEqual(trust.outcome_scores.some((score) => score.clv !== null && score.clv > 0), true, "positive CLV scoring missing");
  assertEqual(trust.outcome_scores.some((score) => score.clv !== null && score.clv < 0), true, "negative CLV scoring missing");
  assertEqual(trust.outcome_scores.some((score) => score.injury_reliability_score < 60), true, "injury reliability penalty missing");
  assertEqual(trust.source_reliability.some((source) => source.reliability_delta < 0), true, "source reliability decay missing");
  assertEqual(trust.source_reliability.some((source) => source.reliability_delta > 0), true, "source reliability improvement missing");

  assertEqual(getValidatorOutcomeScores(db, bridge.run_id).length, trust.outcome_scores.length, "outcome score query mismatch");
  assertEqual(getValidatorPerformanceHistory(db, bridge.run_id).length, trust.performance_history.length, "performance query mismatch");
  assertEqual(getSourceReliabilityEvolution(db, bridge.run_id).length, trust.source_reliability.length, "source reliability query mismatch");
  assertEqual(getTrustLineageHistory(db, bridge.run_id).length, trust.trust_lineage.length, "trust lineage query mismatch");

  assertActionSupported("score_outcome_accuracy");
  assertActionSupported("track_historical_performance");
  assertActionSupported("evolve_source_reliability");
  assertActionSupported("apply_trust_decay");
  assertActionSupported("recover_trust");
  assertActionSupported("recalibrate_confidence");
  assertActionSupported("adapt_consensus_weight");
  assertActionSupported("persist_validator_intelligence");
  assertActionSupported("record_trust_lineage");
  assertActionSupported("freeze_trust_snapshot");
  assertStateSupported("trusted");
  assertStateSupported("recovering");
  assertStateSupported("decaying");
  assertStateSupported("degraded");
  assertStateSupported("probation");
  assertStateSupported("promoted");

  console.log("Replay validator trust validation passed.");
  console.log(JSON.stringify({
    snapshot_id: trust.snapshot_id,
    run_id: trust.run_id,
    deterministic_hash: trust.deterministic_hash,
    state: trust.state,
    outcome_scores: trust.outcome_scores.length,
    performance_records: trust.performance_history.length,
    source_reliability_records: trust.source_reliability.length,
    decay_recovery_records: trust.decay_recovery_history.length,
    confidence_recalibrations: trust.confidence_recalibration.length,
    weight_adaptations: trust.consensus_weight_adaptation.length,
    validator_profiles: trust.validator_profiles.length,
    trust_lineage: trust.trust_lineage.length,
    immutable_outputs: {
      snapshot: Object.isFrozen(trust),
      outcome_scores: Object.isFrozen(trust.outcome_scores),
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
  gameId: string,
  team: string,
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
    processed_at: "2026-05-20T03:58:00.000Z",
    created_at: "2026-05-20T03:40:00.000Z",
    received_at: "2026-05-20T03:40:00.000Z",
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
  sourceName: string,
  outcomeId: string,
): LiveSignal {
  return {
    id,
    league,
    game_id: gameId,
    signal_type: signalType,
    headline: `${sourceName} ${signalType}`,
    body: "Validator trust validation fixture.",
    action_note: "Use settled outcome to score validator trust.",
    why_it_matters: "Outcome-backed validator trust drives future replay weights.",
    team,
    player,
    matchup: "Fixture matchup",
    sources: [{ name: sourceName, type: sourceName === "Unverified Beat" ? "scrape" : "api" }],
    source_count: 1,
    verdict: sourceName === "Unverified Beat" ? "rumor" : "likely",
    confidence,
    confirmation_strength: sourceName === "Unverified Beat" ? "Developing" : "Corroborated",
    line_movement: signalType === "line_move" ? { open: 4.5, current: 2.5, delta: 2, direction: "down" } : null,
    injury_designation: signalType === "injury_update" ? (sourceName === "Unverified Beat" ? "Questionable" : "OUT") : null,
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
    signal_time: "2026-05-20T03:57:00.000Z",
    created_at: "2026-05-20T03:58:00.000Z",
    updated_at: "2026-05-20T03:58:00.000Z",
    outcome_id: outcomeId,
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
    home_score: hit ? 112 : 101,
    away_score: hit ? 104 : 108,
    market: "spread",
    line_at_signal: hit ? -4.5 : 2.5,
    closing_line: hit ? -6.75 : 4.25,
    actual_result: hit ? 8 : -7,
    hit,
    clv,
    recorded_at: "2026-05-20T06:30:00.000Z",
    created_at: "2026-05-20T06:30:00.000Z",
  };
}

function breakdown(): ScoreBreakdown {
  return {
    confidenceScore: 18,
    sourceQualityScore: 23,
    marketImpactScore: 19,
    recencyBonus: 10,
    relevanceScore: 7,
    contextScore: 5,
    leagueModifierApplied: "NBA trust fixture",
    rawBeforeMods: 82,
  };
}

function assertActionSupported(_action: ReplayValidatorTrustAction): void { return; }
function assertStateSupported(_state: ReplayValidatorTrustState): void { return; }

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}
