import type {
  ReplayAgentSnapshot,
} from "./replay-agent-contract";
import type {
  ReplayArbitrationResult,
} from "./replay-arbitration-contract";
import type {
  ReplayAutonomousOrchestrationRun,
  ReplayAutonomousReplayTarget,
} from "./replay-autonomous-orchestration-contract";
import type {
  ReplayConsensusInput,
  ReplayConsensusResult,
} from "./replay-consensus-contract";
import type {
  ReplayConsensusIntelligenceSnapshot,
} from "./replay-consensus-intelligence-contract";
import type {
  ReplayConsensusLineageSnapshot,
} from "./replay-consensus-lineage-contract";
import type {
  ReplayCoordinationMeshResult,
} from "./replay-coordination-mesh-contract";
import type {
  ReplayEvolutionSnapshot,
} from "./replay-evolution-contract";
import type {
  ReplayGovernanceSnapshot,
} from "./replay-governance-contract";
import type {
  ReplayMemorySnapshot,
} from "./replay-memory-contract";
import type {
  ReplayOrchestrationPersistenceSnapshot,
} from "./replay-orchestration-persistence-contract";
import type {
  ReplayRecoveryCoordinationResult,
} from "./replay-recovery-coordination-contract";
import type {
  ReplaySelfHealingSnapshot,
} from "./replay-self-healing-contract";
import type {
  LiveSignal,
  Outcome,
  RawEvent,
} from "./types";

export type ReplayLiveBridgeRecordKind =
  | "raw_event"
  | "live_signal"
  | "odds_snapshot"
  | "injury_report"
  | "source_intelligence_event"
  | "settled_outcome";

export interface ReplayLiveOddsSnapshot {
  readonly id: string;
  readonly game_id: string;
  readonly league: string;
  readonly sportsbook: string;
  readonly market_source: string;
  readonly spread_line: number | null;
  readonly spread_team: string | null;
  readonly total_line: number | null;
  readonly moneyline_home: number | null;
  readonly moneyline_away: number | null;
  readonly source_game_id: string | null;
  readonly snapshot_at: string;
}

export interface ReplayLiveInjuryReport {
  readonly report_id: string;
  readonly league: string;
  readonly team: string | null;
  readonly player: string;
  readonly designation: string;
  readonly body_part: string | null;
  readonly source_id: string;
  readonly confidence: number;
  readonly reported_at: string;
}

export interface ReplayLiveSourceIntelligenceEvent {
  readonly event_id: string;
  readonly source_id: string;
  readonly source_name: string;
  readonly source_type: string;
  readonly reliability_score: number;
  readonly topic: string;
  readonly league: string | null;
  readonly signal_id: string | null;
  readonly observed_at: string;
}

export interface ReplayLiveBridgeInput {
  readonly bridge_id?: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly raw_events: readonly RawEvent[];
  readonly live_signals: readonly LiveSignal[];
  readonly odds_snapshots: readonly ReplayLiveOddsSnapshot[];
  readonly injury_reports: readonly ReplayLiveInjuryReport[];
  readonly source_intelligence_events: readonly ReplayLiveSourceIntelligenceEvent[];
  readonly settled_outcomes: readonly Outcome[];
  readonly consensus_threshold?: number;
  readonly approval_threshold?: number;
}

export interface ReplayLiveCanonicalRecord {
  readonly record_id: string;
  readonly kind: ReplayLiveBridgeRecordKind;
  readonly source_id: string;
  readonly league: string | null;
  readonly game_id: string | null;
  readonly signal_id: string | null;
  readonly replay_hash: string;
  readonly occurred_at: string;
  readonly confidence: number;
  readonly anomaly_score: number;
  readonly drift_score: number;
  readonly payload_hash: string;
  readonly deterministic_hash: string;
}

export interface ReplayLiveBridgeAdapterOutput {
  readonly bridge_id: string;
  readonly generated_at: string;
  readonly canonical_records: readonly ReplayLiveCanonicalRecord[];
  readonly replay_targets: readonly ReplayAutonomousReplayTarget[];
  readonly consensus_inputs: readonly ReplayConsensusInput[];
  readonly adapter_hash: string;
}

export interface ReplayLiveIntelligenceBridgeSnapshot {
  readonly bridge_id: string;
  readonly run_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly adapter: ReplayLiveBridgeAdapterOutput;
  readonly orchestration_run: ReplayAutonomousOrchestrationRun;
  readonly consensus_results: readonly ReplayConsensusResult[];
  readonly arbitration_results: readonly ReplayArbitrationResult[];
  readonly recovery_results: readonly ReplayRecoveryCoordinationResult[];
  readonly orchestration_persistence: ReplayOrchestrationPersistenceSnapshot;
  readonly governance_snapshot: ReplayGovernanceSnapshot;
  readonly lineage_snapshot: ReplayConsensusLineageSnapshot;
  readonly agent_snapshot: ReplayAgentSnapshot;
  readonly coordination_mesh: ReplayCoordinationMeshResult;
  readonly memory_snapshot: ReplayMemorySnapshot;
  readonly self_healing_snapshot: ReplaySelfHealingSnapshot;
  readonly consensus_intelligence: ReplayConsensusIntelligenceSnapshot;
  readonly evolution_snapshot: ReplayEvolutionSnapshot;
  readonly deterministic_hash: string;
}
