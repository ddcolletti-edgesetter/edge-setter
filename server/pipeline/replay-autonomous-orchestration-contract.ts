export type ReplayAutonomousOrchestrationPhase =
  | "target_selection"
  | "reconstruction"
  | "convergence_analysis"
  | "recovery"
  | "consensus";

export type ReplayAutonomousAgentLifecycleState =
  | "queued"
  | "running"
  | "completed"
  | "recovered"
  | "blocked";

export type ReplayAutonomousRecoveryDirectiveKind =
  | "none"
  | "retry"
  | "reconstruct_from_lineage"
  | "quarantine"
  | "manual_review";

export interface ReplayAutonomousOrchestrationClock {
  readonly generated_at: string;
}

export interface ReplayAutonomousReplayTarget {
  readonly replay_hash: string;
  readonly priority: number;
  readonly anomaly_score: number;
  readonly drift_score: number;
  readonly confidence_score: number;
  readonly lineage_depth: number;
  readonly requested_phases?: readonly ReplayAutonomousOrchestrationPhase[];
  readonly target_metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ReplayAutonomousOrchestrationInput {
  readonly clock: ReplayAutonomousOrchestrationClock;
  readonly targets: readonly ReplayAutonomousReplayTarget[];
  readonly phases?: readonly ReplayAutonomousOrchestrationPhase[];
  readonly consensus_threshold: number;
  readonly max_recovery_attempts: number;
}

export interface ReplayAutonomousNormalizedTarget extends ReplayAutonomousReplayTarget {
  readonly target_hash: string;
}

export interface ReplayAutonomousRecoveryDirective {
  readonly directive_id: string;
  readonly replay_hash: string;
  readonly target_hash: string;
  readonly directive: ReplayAutonomousRecoveryDirectiveKind;
  readonly reason: string;
  readonly max_attempts: number;
  readonly deterministic_hash: string;
}

export interface ReplayAutonomousAgentState {
  readonly agent_id: string;
  readonly replay_hash: string;
  readonly target_hash: string;
  readonly phase: ReplayAutonomousOrchestrationPhase;
  readonly lifecycle_state: ReplayAutonomousAgentLifecycleState;
  readonly recovery_directive: ReplayAutonomousRecoveryDirectiveKind;
  readonly consensus_ready: boolean;
  readonly generated_at: string;
  readonly deterministic_hash: string;
}

export interface ReplayAutonomousPhaseState {
  readonly phase: ReplayAutonomousOrchestrationPhase;
  readonly lifecycle_state: ReplayAutonomousAgentLifecycleState;
  readonly target_count: number;
  readonly completed_count: number;
  readonly recovered_count: number;
  readonly blocked_count: number;
  readonly consensus_ready_count: number;
  readonly phase_hash: string;
}

export interface ReplayAutonomousConsensusState {
  readonly consensus_ready: boolean;
  readonly threshold: number;
  readonly ready_count: number;
  readonly agent_count: number;
  readonly readiness_ratio: number;
  readonly consensus_hash: string;
}

export interface ReplayAutonomousOrchestrationSummary {
  readonly run_id: string;
  readonly run_hash: string;
  readonly generated_at: string;
  readonly target_count: number;
  readonly phase_count: number;
  readonly agent_count: number;
  readonly completed_count: number;
  readonly recovered_count: number;
  readonly blocked_count: number;
  readonly recovery_directive_count: number;
  readonly consensus_ready_count: number;
  readonly consensus_ready: boolean;
  readonly target_hashes: readonly string[];
  readonly phase_hashes: readonly string[];
  readonly summary_hash: string;
}

export interface ReplayAutonomousOrchestrationRun {
  readonly run_id: string;
  readonly run_hash: string;
  readonly generated_at: string;
  readonly targets: readonly ReplayAutonomousNormalizedTarget[];
  readonly phases: readonly ReplayAutonomousPhaseState[];
  readonly agents: readonly ReplayAutonomousAgentState[];
  readonly recovery_directives: readonly ReplayAutonomousRecoveryDirective[];
  readonly consensus: ReplayAutonomousConsensusState;
  readonly summary: ReplayAutonomousOrchestrationSummary;
  readonly deterministic_hash: string;
}
