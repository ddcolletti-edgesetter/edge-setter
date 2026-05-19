import type {
  ReplayLiveRuntimeSnapshot,
  ReplayLiveRuntimeState,
} from "./replay-live-runtime-contract";
import type {
  ReplayValidatorTrustState,
} from "./replay-validator-trust-contract";

export type ReplayObservabilityView =
  | "runtime_telemetry_aggregation"
  | "consensus_drift_visualization"
  | "validator_trust_evolution"
  | "replay_lineage_graph"
  | "runtime_propagation_visualization"
  | "governance_state_visualization"
  | "recovery_event_visualization"
  | "replay_execution_timeline";

export type ReplayObservabilityQuery =
  | "get_runtime_telemetry_aggregation"
  | "get_consensus_drift_visualization"
  | "get_validator_trust_evolution"
  | "get_replay_lineage_graph"
  | "get_runtime_propagation_visualization"
  | "get_governance_state_visualization"
  | "get_recovery_event_visualization"
  | "get_replay_execution_timeline";

export interface ReplayObservabilityInput {
  readonly generated_at: string;
  readonly runtime_snapshot: ReplayLiveRuntimeSnapshot;
}

export interface ReplayTelemetryAggregationApi {
  readonly api_id: string;
  readonly runtime_id: string;
  readonly cycle_count: number;
  readonly total_canonical_records: number;
  readonly total_consensus_results: number;
  readonly total_recovery_results: number;
  readonly average_trust_score: number;
  readonly average_drift_score: number;
  readonly aggregation_hash: string;
}

export interface ReplayConsensusDriftVisualizationApi {
  readonly point_id: string;
  readonly cycle_id: string;
  readonly previous_cycle_id: string | null;
  readonly x_sequence: number;
  readonly drift_score: number;
  readonly approval_ratio_delta: number;
  readonly trust_score_delta: number;
  readonly drift_detected: boolean;
  readonly severity_band: "low" | "medium" | "high";
  readonly point_hash: string;
}

export interface ReplayValidatorTrustEvolutionApi {
  readonly series_id: string;
  readonly validator_id: string;
  readonly validator_type: string;
  readonly points: readonly {
    readonly cycle_id: string;
    readonly trust_score: number;
    readonly adapted_weight: number;
    readonly trust_state: ReplayValidatorTrustState;
  }[];
  readonly latest_trust_score: number;
  readonly trust_delta: number;
  readonly series_hash: string;
}

export interface ReplayLineageGraphNodeApi {
  readonly node_id: string;
  readonly node_kind: "runtime" | "cycle" | "bridge" | "trust" | "consensus" | "governance" | "recovery" | "propagation";
  readonly label: string;
  readonly cycle_id: string | null;
  readonly source_hash: string;
  readonly node_hash: string;
}

export interface ReplayLineageGraphEdgeApi {
  readonly edge_id: string;
  readonly from_node_id: string;
  readonly to_node_id: string;
  readonly relationship: "executes" | "produces" | "coordinates" | "governs" | "recovers" | "propagates";
  readonly edge_hash: string;
}

export interface ReplayLineageGraphApi {
  readonly graph_id: string;
  readonly nodes: readonly ReplayLineageGraphNodeApi[];
  readonly edges: readonly ReplayLineageGraphEdgeApi[];
  readonly graph_hash: string;
}

export interface ReplayRuntimePropagationVisualizationApi {
  readonly propagation_id: string;
  readonly cycle_id: string;
  readonly bridge_hash: string;
  readonly trust_hash: string;
  readonly intelligence_hash: string;
  readonly evolution_hash: string;
  readonly propagated_validator_count: number;
  readonly propagation_hash: string;
}

export interface ReplayGovernanceStateVisualizationApi {
  readonly state_id: string;
  readonly cycle_id: string;
  readonly governance_action: string;
  readonly decision_count: number;
  readonly replay_hashes: readonly string[];
  readonly state_hash: string;
}

export interface ReplayRecoveryEventVisualizationApi {
  readonly recovery_event_id: string;
  readonly cycle_id: string;
  readonly replay_hash: string;
  readonly recovery_required: boolean;
  readonly recovery_action_count: number;
  readonly trust_state: ReplayValidatorTrustState;
  readonly event_hash: string;
}

export interface ReplayExecutionTimelineApi {
  readonly timeline_event_id: string;
  readonly cycle_id: string;
  readonly sequence: number;
  readonly state: ReplayLiveRuntimeState;
  readonly event_type: string;
  readonly payload_hash: string;
  readonly timeline_hash: string;
}

export interface ReplayObservabilitySnapshot {
  readonly observability_id: string;
  readonly runtime_id: string;
  readonly generated_at: string;
  readonly runtime_hash: string;
  readonly telemetry_aggregation: ReplayTelemetryAggregationApi;
  readonly consensus_drift_visualization: readonly ReplayConsensusDriftVisualizationApi[];
  readonly validator_trust_evolution: readonly ReplayValidatorTrustEvolutionApi[];
  readonly replay_lineage_graph: ReplayLineageGraphApi;
  readonly runtime_propagation_visualization: readonly ReplayRuntimePropagationVisualizationApi[];
  readonly governance_state_visualization: readonly ReplayGovernanceStateVisualizationApi[];
  readonly recovery_event_visualization: readonly ReplayRecoveryEventVisualizationApi[];
  readonly replay_execution_timeline: readonly ReplayExecutionTimelineApi[];
  readonly supported_views: readonly ReplayObservabilityView[];
  readonly supported_queries: readonly ReplayObservabilityQuery[];
  readonly deterministic_hash: string;
}
