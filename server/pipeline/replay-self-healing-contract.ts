import type {
  ReplayCoordinationMeshResult,
} from "./replay-coordination-mesh-contract";
import type {
  ReplayConsensusLineageSnapshot,
} from "./replay-consensus-lineage-contract";
import type {
  ReplayGovernanceAction,
  ReplayGovernanceSnapshot,
} from "./replay-governance-contract";
import type {
  ReplayMemorySnapshot,
} from "./replay-memory-contract";
import type {
  ReplayOrchestrationPersistenceSnapshot,
} from "./replay-orchestration-persistence-contract";

export type ReplaySelfHealingState =
  | "monitoring"
  | "stabilizing"
  | "healing"
  | "degraded"
  | "partitioned"
  | "recovered"
  | "reconciled";

export type ReplaySelfHealingAction =
  | "stabilize_branch"
  | "reroute_recovery"
  | "reconcile_divergence"
  | "promote_checkpoint"
  | "rebuild_partition"
  | "quarantine_instability"
  | "rebalance_mesh"
  | "freeze_healing_epoch";

export type ReplaySelfHealingQuery =
  | "get_healing_history"
  | "get_stabilization_history"
  | "get_survivability_trends"
  | "get_replay_degradation_history"
  | "get_adaptive_recovery_history"
  | "get_healing_lineage"
  | "get_partition_stabilization_history";

export interface ReplaySelfHealingInput {
  readonly run_id: string;
  readonly generated_at: string;
  readonly memory_snapshot: ReplayMemorySnapshot;
  readonly coordination_mesh: ReplayCoordinationMeshResult;
  readonly governance_snapshot: ReplayGovernanceSnapshot;
  readonly orchestration_persistence: ReplayOrchestrationPersistenceSnapshot;
  readonly lineage_snapshot: ReplayConsensusLineageSnapshot;
  readonly survivability_threshold?: number;
}

export interface ReplayPredictiveRepairPlan {
  readonly plan_id: string;
  readonly replay_hash: string;
  readonly predicted_divergence_score: number;
  readonly recommended_action: ReplaySelfHealingAction;
  readonly repair_reason: string;
  readonly memory_reference_hashes: readonly string[];
  readonly plan_hash: string;
}

export interface ReplayHealingDecision {
  readonly decision_id: string;
  readonly replay_hash: string;
  readonly state: ReplaySelfHealingState;
  readonly action: ReplaySelfHealingAction;
  readonly governance_action: ReplayGovernanceAction | null;
  readonly survivability_score: number;
  readonly repair_plan_hash: string;
  readonly deterministic_hash: string;
}

export interface ReplayAdaptiveRecoveryRoute {
  readonly route_id: string;
  readonly replay_hash: string;
  readonly from_route_hash: string | null;
  readonly adaptive_path: readonly string[];
  readonly action: ReplaySelfHealingAction;
  readonly route_hash: string;
}

export interface ReplayStabilizationRecord {
  readonly stabilization_id: string;
  readonly replay_hash: string;
  readonly before_state: ReplaySelfHealingState;
  readonly after_state: ReplaySelfHealingState;
  readonly action: ReplaySelfHealingAction;
  readonly checkpoint_promoted: boolean;
  readonly stabilization_hash: string;
}

export interface ReplaySurvivabilityTrend {
  readonly trend_id: string;
  readonly replay_hash: string;
  readonly survivability_score: number;
  readonly degradation_score: number;
  readonly recovery_effectiveness_score: number;
  readonly trend: "improving" | "stable" | "declining";
  readonly trend_hash: string;
}

export interface ReplayDegradationRecord {
  readonly degradation_id: string;
  readonly replay_hash: string;
  readonly degradation_score: number;
  readonly degradation_reason: string;
  readonly detected: boolean;
  readonly degradation_hash: string;
}

export interface ReplayPartitionStabilizationRecord {
  readonly partition_stabilization_id: string;
  readonly replay_hash: string;
  readonly partition_count: number;
  readonly stabilization_action: ReplaySelfHealingAction;
  readonly stabilized: boolean;
  readonly partition_hash: string;
}

export interface ReplayHealingCheckpointPromotion {
  readonly promotion_id: string;
  readonly replay_hash: string;
  readonly checkpoint_id: string;
  readonly promoted: boolean;
  readonly promotion_reason: string;
  readonly promotion_hash: string;
}

export interface ReplayHealingLineageReference {
  readonly reference_id: string;
  readonly replay_hash: string;
  readonly source_hash: string;
  readonly reference_kind: "memory" | "coordination_mesh" | "governance" | "orchestration_persistence" | "lineage_graph";
  readonly reference_hash: string;
}

export interface ReplayHealingEpoch {
  readonly epoch_id: string;
  readonly replay_hashes: readonly string[];
  readonly healing_decision_hashes: readonly string[];
  readonly frozen: boolean;
  readonly frozen_at: string;
  readonly epoch_hash: string;
}

export interface ReplaySelfHealingSnapshotReference {
  readonly memory_snapshot_hash: string;
  readonly coordination_mesh_hash: string;
  readonly governance_snapshot_hash: string;
  readonly orchestration_persistence_hash: string;
  readonly lineage_graph_hash: string;
  readonly reference_hash: string;
}

export interface ReplaySelfHealingSnapshot {
  readonly healing_id: string;
  readonly run_id: string;
  readonly generated_at: string;
  readonly state: ReplaySelfHealingState;
  readonly repair_plans: readonly ReplayPredictiveRepairPlan[];
  readonly decisions: readonly ReplayHealingDecision[];
  readonly stabilization_history: readonly ReplayStabilizationRecord[];
  readonly survivability_trends: readonly ReplaySurvivabilityTrend[];
  readonly degradation_history: readonly ReplayDegradationRecord[];
  readonly adaptive_recovery: readonly ReplayAdaptiveRecoveryRoute[];
  readonly partition_stabilization: readonly ReplayPartitionStabilizationRecord[];
  readonly checkpoint_promotions: readonly ReplayHealingCheckpointPromotion[];
  readonly lineage: readonly ReplayHealingLineageReference[];
  readonly epochs: readonly ReplayHealingEpoch[];
  readonly snapshots: ReplaySelfHealingSnapshotReference;
  readonly supported_actions: readonly ReplaySelfHealingAction[];
  readonly supported_queries: readonly ReplaySelfHealingQuery[];
  readonly deterministic_hash: string;
}
