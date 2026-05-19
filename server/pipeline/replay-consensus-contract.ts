export type ReplayConsensusVote = "approve" | "diverge" | "abstain";

export type ReplayConsensusDivergenceCategory =
  | "none"
  | "timeline"
  | "snapshot"
  | "settlement"
  | "signal"
  | "provenance"
  | "integrity";

export type ReplayConsensusArbitrationRecommendation =
  | "accept_replay"
  | "reject_replay"
  | "reconstruct_replay"
  | "manual_review"
  | "insufficient_quorum";

export interface ReplayConsensusLineageReference {
  readonly replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly lineage_hash: string;
  readonly generated_at: string;
}

export interface ReplayConsensusValidatorDefinition {
  readonly validator_id: string;
  readonly validator_type: string;
  readonly weight: number;
  readonly base_confidence: number;
  readonly lineage_reference: ReplayConsensusLineageReference;
  readonly vote: ReplayConsensusVote;
  readonly divergence_categories: readonly ReplayConsensusDivergenceCategory[];
  readonly notes?: readonly string[];
}

export interface ReplayConsensusInput {
  readonly generated_at: string;
  readonly replay_hash: string;
  readonly compared_replay_hash: string | null;
  readonly quorum_threshold: number;
  readonly approval_threshold: number;
  readonly validators: readonly ReplayConsensusValidatorDefinition[];
}

export interface ReplayConsensusValidatorResult {
  readonly validator_id: string;
  readonly validator_type: string;
  readonly vote: ReplayConsensusVote;
  readonly weight: number;
  readonly base_confidence: number;
  readonly propagated_confidence: number;
  readonly weighted_confidence: number;
  readonly divergence_categories: readonly ReplayConsensusDivergenceCategory[];
  readonly lineage_reference: ReplayConsensusLineageReference;
  readonly generated_at: string;
  readonly validator_hash: string;
}

export interface ReplayConsensusVoteAggregation {
  readonly total_weight: number;
  readonly participating_weight: number;
  readonly approve_weight: number;
  readonly diverge_weight: number;
  readonly abstain_weight: number;
  readonly quorum_ratio: number;
  readonly approval_ratio: number;
  readonly divergence_ratio: number;
  readonly quorum_met: boolean;
  readonly aggregation_hash: string;
}

export interface ReplayConsensusDivergenceSummary {
  readonly divergence_detected: boolean;
  readonly categories: readonly ReplayConsensusDivergenceCategory[];
  readonly category_weights: Readonly<Record<ReplayConsensusDivergenceCategory, number>>;
  readonly dominant_category: ReplayConsensusDivergenceCategory;
  readonly divergence_hash: string;
}

export interface ReplayConsensusArbitration {
  readonly recommendation: ReplayConsensusArbitrationRecommendation;
  readonly reason: string;
  readonly confidence: number;
  readonly arbitration_hash: string;
}

export interface ReplayConsensusSummary {
  readonly replay_hash: string;
  readonly compared_replay_hash: string | null;
  readonly generated_at: string;
  readonly validator_count: number;
  readonly quorum_met: boolean;
  readonly consensus_vote: ReplayConsensusVote;
  readonly consensus_confidence: number;
  readonly divergence_detected: boolean;
  readonly arbitration_recommendation: ReplayConsensusArbitrationRecommendation;
  readonly validator_hashes: readonly string[];
  readonly summary_hash: string;
}

export interface ReplayConsensusResult {
  readonly replay_hash: string;
  readonly compared_replay_hash: string | null;
  readonly generated_at: string;
  readonly validators: readonly ReplayConsensusValidatorResult[];
  readonly vote_aggregation: ReplayConsensusVoteAggregation;
  readonly divergence: ReplayConsensusDivergenceSummary;
  readonly arbitration: ReplayConsensusArbitration;
  readonly summary: ReplayConsensusSummary;
  readonly consensus_hash: string;
}
