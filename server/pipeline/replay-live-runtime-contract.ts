import type {
  ReplayLiveBridgeInput,
  ReplayLiveIntelligenceBridgeSnapshot,
} from "./replay-live-intelligence-bridge-contract";
import type {
  ReplayValidatorTrustSnapshot,
  ReplayValidatorTrustState,
} from "./replay-validator-trust-contract";

export type ReplayLiveRuntimeState =
  | "scheduled"
  | "executing"
  | "coordinating"
  | "propagating"
  | "recovering"
  | "stabilized"
  | "drifting";

export type ReplayLiveRuntimeAction =
  | "schedule_live_cycle"
  | "execute_live_replay"
  | "run_validator_loop"
  | "coordinate_runtime_consensus"
  | "emit_runtime_telemetry"
  | "monitor_live_recovery"
  | "stream_execution_state"
  | "propagate_runtime_intelligence"
  | "monitor_consensus_drift"
  | "freeze_runtime_snapshot";

export type ReplayLiveRuntimeQuery =
  | "get_runtime_cycles"
  | "get_scheduler_history"
  | "get_validator_execution_loops"
  | "get_runtime_consensus_coordination"
  | "get_runtime_telemetry"
  | "get_live_recovery_monitoring"
  | "get_execution_state_stream"
  | "get_runtime_intelligence_propagation"
  | "get_consensus_drift_history";

export interface ReplayLiveRuntimeCycleInput {
  readonly cycle_id?: string;
  readonly bridge_input: ReplayLiveBridgeInput;
}

export interface ReplayLiveRuntimeInput {
  readonly runtime_id?: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly scheduler_interval_ms: number;
  readonly cycles: readonly ReplayLiveRuntimeCycleInput[];
  readonly drift_threshold?: number;
}

export interface ReplayLiveRuntimeCycle {
  readonly cycle_id: string;
  readonly cycle_ordinal: number;
  readonly bridge_hash: string;
  readonly trust_hash: string;
  readonly canonical_record_count: number;
  readonly consensus_count: number;
  readonly governance_decision_count: number;
  readonly validator_profile_count: number;
  readonly state: ReplayLiveRuntimeState;
  readonly cycle_hash: string;
}

export interface ReplayLiveSchedulerTick {
  readonly tick_id: string;
  readonly cycle_id: string;
  readonly scheduled_for: string;
  readonly executed_at: string;
  readonly interval_ms: number;
  readonly drift_ms: number;
  readonly action: ReplayLiveRuntimeAction;
  readonly tick_hash: string;
}

export interface ReplayLiveValidatorExecutionLoop {
  readonly loop_id: string;
  readonly cycle_id: string;
  readonly validator_id: string;
  readonly validator_type: string;
  readonly trust_state: ReplayValidatorTrustState;
  readonly trust_score: number;
  readonly adapted_weight: number;
  readonly loop_action: ReplayLiveRuntimeAction;
  readonly loop_hash: string;
}

export interface ReplayRuntimeConsensusCoordination {
  readonly coordination_id: string;
  readonly cycle_id: string;
  readonly replay_hash: string;
  readonly quorum_met: boolean;
  readonly approval_ratio: number;
  readonly divergence_ratio: number;
  readonly governance_action: string | null;
  readonly coordination_hash: string;
}

export interface ReplayRuntimeTelemetryRecord {
  readonly telemetry_id: string;
  readonly cycle_id: string;
  readonly canonical_records: number;
  readonly consensus_results: number;
  readonly recovery_results: number;
  readonly trust_profiles: number;
  readonly average_trust_score: number;
  readonly drift_score: number;
  readonly telemetry_hash: string;
}

export interface ReplayLiveRecoveryMonitoringRecord {
  readonly recovery_id: string;
  readonly cycle_id: string;
  readonly replay_hash: string;
  readonly recovery_action_count: number;
  readonly recovery_required: boolean;
  readonly trust_state: ReplayValidatorTrustState;
  readonly recovery_hash: string;
}

export interface ReplayExecutionStateStreamEvent {
  readonly event_id: string;
  readonly cycle_id: string;
  readonly sequence: number;
  readonly state: ReplayLiveRuntimeState;
  readonly event_type: ReplayLiveRuntimeAction;
  readonly payload_hash: string;
  readonly event_hash: string;
}

export interface ReplayRuntimeIntelligencePropagation {
  readonly propagation_id: string;
  readonly cycle_id: string;
  readonly bridge_hash: string;
  readonly trust_hash: string;
  readonly consensus_intelligence_hash: string;
  readonly evolution_hash: string;
  readonly propagated_validator_count: number;
  readonly propagation_hash: string;
}

export interface ReplayConsensusDriftRecord {
  readonly drift_id: string;
  readonly cycle_id: string;
  readonly previous_cycle_id: string | null;
  readonly approval_ratio_delta: number;
  readonly trust_score_delta: number;
  readonly drift_score: number;
  readonly drift_detected: boolean;
  readonly drift_hash: string;
}

export interface ReplayLiveRuntimeExecutedCycle {
  readonly bridge_snapshot: ReplayLiveIntelligenceBridgeSnapshot;
  readonly trust_snapshot: ReplayValidatorTrustSnapshot;
}

export interface ReplayLiveRuntimeSnapshot {
  readonly runtime_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayLiveRuntimeState;
  readonly executed_cycles: readonly ReplayLiveRuntimeExecutedCycle[];
  readonly cycles: readonly ReplayLiveRuntimeCycle[];
  readonly scheduler_history: readonly ReplayLiveSchedulerTick[];
  readonly validator_execution_loops: readonly ReplayLiveValidatorExecutionLoop[];
  readonly consensus_coordination: readonly ReplayRuntimeConsensusCoordination[];
  readonly telemetry: readonly ReplayRuntimeTelemetryRecord[];
  readonly recovery_monitoring: readonly ReplayLiveRecoveryMonitoringRecord[];
  readonly state_stream: readonly ReplayExecutionStateStreamEvent[];
  readonly intelligence_propagation: readonly ReplayRuntimeIntelligencePropagation[];
  readonly consensus_drift: readonly ReplayConsensusDriftRecord[];
  readonly supported_actions: readonly ReplayLiveRuntimeAction[];
  readonly supported_queries: readonly ReplayLiveRuntimeQuery[];
  readonly deterministic_hash: string;
}
