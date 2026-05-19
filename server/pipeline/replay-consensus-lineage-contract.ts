export type ReplayConsensusLineageNodeKind =
  | "orchestration_run"
  | "replay_branch"
  | "validator"
  | "consensus_decision"
  | "arbitration_outcome"
  | "recovery_coordination"
  | "checkpoint"
  | "divergence"
  | "execution_history";

export type ReplayConsensusLineageEdgeKind =
  | "orchestrates"
  | "participates_in"
  | "decides"
  | "arbitrates"
  | "recovers"
  | "evolves_to"
  | "inherits_recovery"
  | "anchors_checkpoint"
  | "descends_from"
  | "records_history"
  | "propagates_influence"
  | "tracks_divergence";

export interface ReplayConsensusLineageNode {
  readonly node_id: string;
  readonly kind: ReplayConsensusLineageNodeKind;
  readonly replay_hash: string;
  readonly source_hash: string;
  readonly label: string;
  readonly generated_at: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  readonly node_hash: string;
}

export interface ReplayConsensusLineageEdge {
  readonly edge_id: string;
  readonly kind: ReplayConsensusLineageEdgeKind;
  readonly from_node_id: string;
  readonly to_node_id: string;
  readonly replay_hash: string;
  readonly source_hash: string;
  readonly edge_hash: string;
}

export interface ReplayConsensusLineageSnapshot {
  readonly run_id: string;
  readonly generated_at: string;
  readonly node_count: number;
  readonly edge_count: number;
  readonly replay_hashes: readonly string[];
  readonly nodes: readonly ReplayConsensusLineageNode[];
  readonly edges: readonly ReplayConsensusLineageEdge[];
  readonly graph_hash: string;
  readonly deterministic_hash: string;
}

export interface ReplayConsensusLineageTraversal {
  readonly root: string;
  readonly query: string;
  readonly nodes: readonly ReplayConsensusLineageNode[];
  readonly edges: readonly ReplayConsensusLineageEdge[];
  readonly traversal_hash: string;
}
