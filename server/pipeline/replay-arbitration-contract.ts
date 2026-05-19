import type {
  ReplayConsensusDivergenceCategory,
  ReplayConsensusLineageReference,
  ReplayConsensusResult,
  ReplayConsensusVote,
} from "./replay-consensus-contract";

export type ReplayArbitrationOutcome =
  | "accept_replay"
  | "reject_replay"
  | "quarantine_replay"
  | "require_manual_review"
  | "recovery_recommended";

export type ReplayArbitrationEscalationCategory =
  | "integrity_failure"
  | "timeline_divergence"
  | "provenance_divergence"
  | "settlement_mutation"
  | "snapshot_corruption"
  | "validator_deadlock";

export type ReplayArbitrationRecoveryRecommendation =
  | "none"
  | "replay_from_parent_lineage"
  | "rebuild_snapshot"
  | "reconcile_settlement"
  | "quarantine_and_revalidate"
  | "manual_validator_review";

export type ReplayArbitrationGovernanceMode =
  | "scaffold"
  | "autonomous_ready";

export interface ReplayArbitrationInput {
  readonly generated_at: string;
  readonly consensus: ReplayConsensusResult;
  readonly governance_mode?: ReplayArbitrationGovernanceMode;
}

export interface ReplayArbitrationConsensusReference {
  readonly replay_hash: string;
  readonly compared_replay_hash: string | null;
  readonly consensus_hash: string;
  readonly consensus_vote: ReplayConsensusVote;
  readonly consensus_confidence: number;
  readonly arbitration_recommendation: string;
  readonly reference_hash: string;
}

export interface ReplayArbitrationValidatorDispute {
  readonly dispute_id: string;
  readonly validator_ids: readonly string[];
  readonly vote: ReplayConsensusVote;
  readonly weight: number;
  readonly confidence: number;
  readonly categories: readonly ReplayConsensusDivergenceCategory[];
  readonly dispute_hash: string;
}

export interface ReplayArbitrationDisputeResolution {
  readonly deadlocked: boolean;
  readonly resolution_model: string;
  readonly approve_weight: number;
  readonly diverge_weight: number;
  readonly abstain_weight: number;
  readonly decisive_vote: ReplayConsensusVote;
  readonly resolution_hash: string;
}

export interface ReplayArbitrationSeverity {
  readonly score: number;
  readonly band: "none" | "low" | "medium" | "high" | "critical";
  readonly dominant_escalation: ReplayArbitrationEscalationCategory | null;
  readonly category_scores: Readonly<Record<ReplayArbitrationEscalationCategory, number>>;
  readonly severity_hash: string;
}

export interface ReplayArbitrationRecoveryDirective {
  readonly recommendation: ReplayArbitrationRecoveryRecommendation;
  readonly reason: string;
  readonly requires_lineage_replay: boolean;
  readonly autonomous_governance_ready: boolean;
  readonly recovery_hash: string;
}

export interface ReplayArbitrationAdjudication {
  readonly outcome: ReplayArbitrationOutcome;
  readonly confidence: number;
  readonly reason: string;
  readonly escalation_categories: readonly ReplayArbitrationEscalationCategory[];
  readonly adjudication_hash: string;
}

export interface ReplayArbitrationLineageReference {
  readonly replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly lineage_hash: string;
  readonly validator_id: string;
  readonly validator_hash: string;
  readonly generated_at: string;
  readonly lineage_reference_hash: string;
}

export interface ReplayArbitrationSummary {
  readonly replay_hash: string;
  readonly compared_replay_hash: string | null;
  readonly generated_at: string;
  readonly outcome: ReplayArbitrationOutcome;
  readonly severity_score: number;
  readonly confidence: number;
  readonly deadlocked: boolean;
  readonly escalation_categories: readonly ReplayArbitrationEscalationCategory[];
  readonly recovery_recommendation: ReplayArbitrationRecoveryRecommendation;
  readonly lineage_reference_hashes: readonly string[];
  readonly summary_hash: string;
}

export interface ReplayArbitrationResult {
  readonly generated_at: string;
  readonly governance_mode: ReplayArbitrationGovernanceMode;
  readonly consensus_reference: ReplayArbitrationConsensusReference;
  readonly disputes: readonly ReplayArbitrationValidatorDispute[];
  readonly dispute_resolution: ReplayArbitrationDisputeResolution;
  readonly severity: ReplayArbitrationSeverity;
  readonly recovery: ReplayArbitrationRecoveryDirective;
  readonly adjudication: ReplayArbitrationAdjudication;
  readonly lineage_references: readonly ReplayArbitrationLineageReference[];
  readonly summary: ReplayArbitrationSummary;
  readonly deterministic_hash: string;
}

export type ReplayArbitrationLineageSource =
  ReplayConsensusLineageReference & {
    readonly validator_id: string;
    readonly validator_hash: string;
  };
