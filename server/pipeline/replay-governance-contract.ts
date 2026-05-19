import type {
  ReplayArbitrationEscalationCategory,
  ReplayArbitrationOutcome,
} from "./replay-arbitration-contract";
import type {
  ReplayConsensusVote,
} from "./replay-consensus-contract";

export type ReplayGovernanceAction =
  | "approve_branch"
  | "reject_branch"
  | "quarantine_branch"
  | "require_review"
  | "promote_branch"
  | "revoke_validator"
  | "reduce_validator_weight"
  | "elevate_recovery"
  | "override_arbitration";

export type ReplayGovernanceState =
  | "pending_review"
  | "approved"
  | "rejected"
  | "quarantined"
  | "escalated"
  | "stabilized";

export type ReplayGovernanceOverrideKind =
  | "none"
  | "recovery"
  | "arbitration";

export interface ReplayGovernancePolicy {
  readonly quorum_threshold: number;
  readonly promotion_confidence_threshold: number;
  readonly review_confidence_threshold: number;
  readonly quarantine_severity_threshold: number;
  readonly validator_revoke_threshold: number;
  readonly validator_reduce_weight_threshold: number;
}

export interface ReplayGovernanceInput {
  readonly run_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly policy?: Partial<ReplayGovernancePolicy>;
}

export interface ReplayGovernancePolicyEvaluation {
  readonly replay_hash: string;
  readonly consensus_vote: ReplayConsensusVote | null;
  readonly arbitration_outcome: ReplayArbitrationOutcome | null;
  readonly quorum_met: boolean;
  readonly quorum_ratio: number;
  readonly recovery_state: string | null;
  readonly promotion_ready: boolean;
  readonly severity_score: number;
  readonly confidence: number;
  readonly override_kind: ReplayGovernanceOverrideKind;
  readonly evaluation_reasons: readonly string[];
  readonly evaluation_hash: string;
}

export interface ReplayGovernanceDecision {
  readonly decision_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly action: ReplayGovernanceAction;
  readonly state: ReplayGovernanceState;
  readonly generated_at: string;
  readonly policy_hash: string;
  readonly evaluation_hash: string;
  readonly lineage_reference_hashes: readonly string[];
  readonly quorum_hash: string;
  readonly deterministic_hash: string;
}

export interface ReplayGovernanceValidatorProfile {
  readonly profile_id: string;
  readonly run_id: string;
  readonly validator_id: string;
  readonly validator_type: string;
  readonly replay_hashes: readonly string[];
  readonly vote_count: number;
  readonly divergence_count: number;
  readonly average_confidence: number;
  readonly average_weight: number;
  readonly trust_score: number;
  readonly recommended_action: ReplayGovernanceAction | null;
  readonly lineage_hashes: readonly string[];
  readonly profile_hash: string;
}

export interface ReplayGovernanceEscalationRecord {
  readonly escalation_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly categories: readonly ReplayArbitrationEscalationCategory[];
  readonly action: ReplayGovernanceAction;
  readonly state: ReplayGovernanceState;
  readonly severity_score: number;
  readonly generated_at: string;
  readonly escalation_hash: string;
}

export interface ReplayGovernanceLineageReference {
  readonly reference_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly lineage_hash: string;
  readonly graph_hash: string;
  readonly source_hash: string;
  readonly reference_kind: "consensus" | "arbitration" | "recovery" | "graph";
  readonly generated_at: string;
  readonly reference_hash: string;
}

export interface ReplayGovernanceQuorumRecord {
  readonly quorum_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly total_weight: number;
  readonly participating_weight: number;
  readonly approve_weight: number;
  readonly diverge_weight: number;
  readonly abstain_weight: number;
  readonly quorum_ratio: number;
  readonly approval_ratio: number;
  readonly quorum_met: boolean;
  readonly generated_at: string;
  readonly quorum_hash: string;
}

export interface ReplayGovernanceBranchStatus {
  readonly replay_hash: string;
  readonly current_state: ReplayGovernanceState;
  readonly latest_action: ReplayGovernanceAction;
  readonly decision_hash: string;
  readonly promotion_eligible: boolean;
  readonly status_hash: string;
}

export interface ReplayGovernanceSnapshot {
  readonly snapshot_id: string;
  readonly run_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly policy: ReplayGovernancePolicy;
  readonly policy_hash: string;
  readonly lineage_graph_hash: string;
  readonly decisions: readonly ReplayGovernanceDecision[];
  readonly validator_profiles: readonly ReplayGovernanceValidatorProfile[];
  readonly escalations: readonly ReplayGovernanceEscalationRecord[];
  readonly lineage_references: readonly ReplayGovernanceLineageReference[];
  readonly quorum_history: readonly ReplayGovernanceQuorumRecord[];
  readonly branch_statuses: readonly ReplayGovernanceBranchStatus[];
  readonly deterministic_hash: string;
}
