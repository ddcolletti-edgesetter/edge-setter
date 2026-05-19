import type {
  ReplayLiveRuntimeSnapshot,
} from "./replay-live-runtime-contract";
import type {
  ReplayObservabilitySnapshot,
} from "./replay-observability-contract";

export type ReplayProductionOrchestrationState =
  | "scheduling"
  | "leased"
  | "executing"
  | "checkpointed"
  | "failing_over"
  | "recovering"
  | "survivable"
  | "degraded";

export type ReplayProductionOrchestrationAction =
  | "schedule_production_replay"
  | "persist_runtime_coordination"
  | "handle_orchestration_failover"
  | "checkpoint_replay_execution"
  | "continue_recovery_replay"
  | "coordinate_distributed_lease"
  | "emit_survivability_telemetry"
  | "monitor_orchestration_health"
  | "execute_watchdog"
  | "freeze_production_snapshot";

export type ReplayProductionOrchestrationQuery =
  | "get_production_scheduler_history"
  | "get_distributed_coordination_persistence"
  | "get_orchestration_failover_history"
  | "get_execution_checkpoints"
  | "get_recovery_continuations"
  | "get_distributed_leases"
  | "get_survivability_telemetry"
  | "get_orchestration_health"
  | "get_execution_watchdogs";

export interface ReplayProductionRuntimeNode {
  readonly node_id: string;
  readonly region: string;
  readonly priority: number;
  readonly healthy: boolean;
  readonly last_seen_at: string;
}

export interface ReplayProductionOrchestrationInput {
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly runtime_snapshot: ReplayLiveRuntimeSnapshot;
  readonly observability_snapshot: ReplayObservabilitySnapshot;
  readonly runtime_nodes: readonly ReplayProductionRuntimeNode[];
  readonly failed_node_ids?: readonly string[];
  readonly lease_ttl_ms?: number;
  readonly watchdog_timeout_ms?: number;
}

export interface ReplayProductionSchedulerRecord {
  readonly schedule_id: string;
  readonly runtime_id: string;
  readonly cycle_id: string;
  readonly scheduled_for: string;
  readonly assigned_node_id: string;
  readonly state: ReplayProductionOrchestrationState;
  readonly action: ReplayProductionOrchestrationAction;
  readonly schedule_hash: string;
}

export interface ReplayDistributedRuntimeCoordinationRecord {
  readonly coordination_id: string;
  readonly runtime_id: string;
  readonly cycle_id: string;
  readonly node_id: string;
  readonly lease_id: string;
  readonly checkpoint_id: string;
  readonly runtime_hash: string;
  readonly persisted_at: string;
  readonly coordination_hash: string;
}

export interface ReplayOrchestrationFailoverRecord {
  readonly failover_id: string;
  readonly cycle_id: string;
  readonly failed_node_id: string;
  readonly promoted_node_id: string;
  readonly reason: string;
  readonly failover_required: boolean;
  readonly failover_hash: string;
}

export interface ReplayExecutionCheckpointRecord {
  readonly checkpoint_id: string;
  readonly runtime_id: string;
  readonly cycle_id: string;
  readonly checkpoint_ordinal: number;
  readonly runtime_state_hash: string;
  readonly observability_hash: string;
  readonly restorable: boolean;
  readonly checkpoint_hash: string;
}

export interface ReplayRecoveryContinuationRecord {
  readonly continuation_id: string;
  readonly cycle_id: string;
  readonly checkpoint_id: string;
  readonly recovery_required: boolean;
  readonly continuation_action: ReplayProductionOrchestrationAction;
  readonly continuation_hash: string;
}

export interface ReplayDistributedLeaseRecord {
  readonly lease_id: string;
  readonly runtime_id: string;
  readonly cycle_id: string;
  readonly node_id: string;
  readonly acquired_at: string;
  readonly expires_at: string;
  readonly active: boolean;
  readonly fenced_token: string;
  readonly lease_hash: string;
}

export interface ReplayRuntimeSurvivabilityTelemetry {
  readonly telemetry_id: string;
  readonly runtime_id: string;
  readonly cycle_id: string;
  readonly lease_active: boolean;
  readonly checkpoint_restorable: boolean;
  readonly recovery_ready: boolean;
  readonly drift_detected: boolean;
  readonly survivability_score: number;
  readonly telemetry_hash: string;
}

export interface ReplayOrchestrationHealthRecord {
  readonly health_id: string;
  readonly runtime_id: string;
  readonly node_id: string;
  readonly healthy: boolean;
  readonly active_lease_count: number;
  readonly failover_count: number;
  readonly health_score: number;
  readonly health_hash: string;
}

export interface ReplayExecutionWatchdogRecord {
  readonly watchdog_id: string;
  readonly cycle_id: string;
  readonly scheduler_drift_ms: number;
  readonly timeout_ms: number;
  readonly timed_out: boolean;
  readonly action: ReplayProductionOrchestrationAction;
  readonly watchdog_hash: string;
}

export interface ReplayProductionOrchestrationSnapshot {
  readonly production_id: string;
  readonly runtime_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayProductionOrchestrationState;
  readonly scheduler_history: readonly ReplayProductionSchedulerRecord[];
  readonly coordination_persistence: readonly ReplayDistributedRuntimeCoordinationRecord[];
  readonly failover_history: readonly ReplayOrchestrationFailoverRecord[];
  readonly execution_checkpoints: readonly ReplayExecutionCheckpointRecord[];
  readonly recovery_continuations: readonly ReplayRecoveryContinuationRecord[];
  readonly distributed_leases: readonly ReplayDistributedLeaseRecord[];
  readonly survivability_telemetry: readonly ReplayRuntimeSurvivabilityTelemetry[];
  readonly orchestration_health: readonly ReplayOrchestrationHealthRecord[];
  readonly execution_watchdogs: readonly ReplayExecutionWatchdogRecord[];
  readonly supported_actions: readonly ReplayProductionOrchestrationAction[];
  readonly supported_queries: readonly ReplayProductionOrchestrationQuery[];
  readonly deterministic_hash: string;
}
