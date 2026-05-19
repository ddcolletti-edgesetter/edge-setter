import type {
  ReplayArbitrationResult,
} from "./replay-arbitration-contract";

export type ReplayRecoveryAction =
  | "rollback_checkpoint"
  | "rebuild_snapshot"
  | "reconstruct_timeline"
  | "quarantine_branch"
  | "retry_replay"
  | "manual_reconciliation"
  | "promote_recovered_branch";

export type ReplayRecoveryState =
  | "pending"
  | "recovering"
  | "stabilized"
  | "quarantined"
  | "failed"
  | "reconciled";

export type ReplayRecoveryPhase =
  | "arbitration_intake"
  | "checkpoint_coordination"
  | "branch_restoration"
  | "retry_orchestration"
  | "quarantine_evaluation"
  | "recovery_adjudication";

export type ReplayRecoveryCoordinationMode =
  | "scaffold"
  | "autonomous_self_healing_ready";

export interface ReplayRecoveryCoordinationInput {
  readonly generated_at: string;
  readonly arbitration: ReplayArbitrationResult;
  readonly max_retry_attempts?: number;
  readonly coordination_mode?: ReplayRecoveryCoordinationMode;
}

export interface ReplayRecoveryArbitrationReference {
  readonly replay_hash: string;
  readonly compared_replay_hash: string | null;
  readonly arbitration_hash: string;
  readonly arbitration_outcome: string;
  readonly arbitration_confidence: number;
  readonly recovery_recommendation: string;
  readonly reference_hash: string;
}

export interface ReplayRecoveryPhasePlan {
  readonly phase: ReplayRecoveryPhase;
  readonly state: ReplayRecoveryState;
  readonly action_count: number;
  readonly confidence: number;
  readonly phase_hash: string;
}

export interface ReplayRecoveryActionPlan {
  readonly action_id: string;
  readonly action: ReplayRecoveryAction;
  readonly phase: ReplayRecoveryPhase;
  readonly state: ReplayRecoveryState;
  readonly reason: string;
  readonly deterministic_order: number;
  readonly action_hash: string;
}

export interface ReplayRecoveryCheckpointPlan {
  readonly checkpoint_id: string;
  readonly source_replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly rollback_required: boolean;
  readonly rollback_action_id: string | null;
  readonly checkpoint_hash: string;
}

export interface ReplayRecoveryBranchRestorationPlan {
  readonly source_branch_hash: string;
  readonly recovered_branch_hash: string;
  readonly restoration_action: ReplayRecoveryAction;
  readonly promotion_ready: boolean;
  readonly lineage_continuity_hashes: readonly string[];
  readonly branch_plan_hash: string;
}

export interface ReplayRecoveryRetryPlan {
  readonly retry_required: boolean;
  readonly max_attempts: number;
  readonly scheduled_attempts: number;
  readonly retry_action_id: string | null;
  readonly retry_hash: string;
}

export interface ReplayRecoveryQuarantineEvaluation {
  readonly quarantine_required: boolean;
  readonly release_eligible: boolean;
  readonly release_reason: string;
  readonly quarantine_action_id: string | null;
  readonly evaluation_hash: string;
}

export interface ReplayRecoveryLineageReference {
  readonly replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly lineage_hash: string;
  readonly source_lineage_reference_hash: string;
  readonly recovery_lineage_hash: string;
}

export interface ReplayRecoveryConfidenceScore {
  readonly score: number;
  readonly band: "low" | "medium" | "high" | "stabilized";
  readonly confidence_hash: string;
}

export interface ReplayRecoverySummary {
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly state: ReplayRecoveryState;
  readonly confidence: number;
  readonly action_count: number;
  readonly rollback_required: boolean;
  readonly retry_required: boolean;
  readonly quarantine_required: boolean;
  readonly promotion_ready: boolean;
  readonly lineage_continuity_count: number;
  readonly summary_hash: string;
}

export interface ReplayRecoveryCoordinationResult {
  readonly generated_at: string;
  readonly coordination_mode: ReplayRecoveryCoordinationMode;
  readonly arbitration_reference: ReplayRecoveryArbitrationReference;
  readonly phases: readonly ReplayRecoveryPhasePlan[];
  readonly actions: readonly ReplayRecoveryActionPlan[];
  readonly checkpoint: ReplayRecoveryCheckpointPlan;
  readonly branch_restoration: ReplayRecoveryBranchRestorationPlan;
  readonly retry: ReplayRecoveryRetryPlan;
  readonly quarantine: ReplayRecoveryQuarantineEvaluation;
  readonly lineage: readonly ReplayRecoveryLineageReference[];
  readonly confidence: ReplayRecoveryConfidenceScore;
  readonly summary: ReplayRecoverySummary;
  readonly deterministic_hash: string;
}
