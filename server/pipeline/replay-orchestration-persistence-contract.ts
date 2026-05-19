import type {
  ReplayArbitrationResult,
} from "./replay-arbitration-contract";
import type {
  ReplayAutonomousOrchestrationRun,
} from "./replay-autonomous-orchestration-contract";
import type {
  ReplayConsensusResult,
} from "./replay-consensus-contract";
import type {
  ReplayRecoveryCoordinationResult,
} from "./replay-recovery-coordination-contract";

export type ReplayOrchestrationPersistedKind =
  | "orchestration_run"
  | "consensus_result"
  | "arbitration_result"
  | "recovery_coordination"
  | "lineage_reference"
  | "branch_state"
  | "recovery_checkpoint";

export interface ReplayOrchestrationPersistenceInput {
  readonly persisted_at: string;
  readonly orchestration_run: ReplayAutonomousOrchestrationRun;
  readonly consensus_results: readonly ReplayConsensusResult[];
  readonly arbitration_results: readonly ReplayArbitrationResult[];
  readonly recovery_results: readonly ReplayRecoveryCoordinationResult[];
}

export interface ReplayOrchestrationPersistenceRecord {
  readonly record_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly persisted_kind: ReplayOrchestrationPersistedKind;
  readonly source_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly payload_hash: string;
  readonly persistence_hash: string;
}

export interface ReplayOrchestrationLineagePersistenceRecord {
  readonly lineage_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly lineage_hash: string;
  readonly recovery_lineage_hash: string;
  readonly persisted_at: string;
  readonly persistence_hash: string;
}

export interface ReplayOrchestrationBranchStateRecord {
  readonly branch_state_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly source_branch_hash: string;
  readonly recovered_branch_hash: string;
  readonly state: string;
  readonly promotion_ready: boolean;
  readonly persisted_at: string;
  readonly persistence_hash: string;
}

export interface ReplayOrchestrationRecoveryCheckpointRecord {
  readonly checkpoint_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly rollback_required: boolean;
  readonly checkpoint_hash: string;
  readonly persisted_at: string;
  readonly persistence_hash: string;
}

export interface ReplayOrchestrationExecutionHistoryRecord {
  readonly history_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly event_type: ReplayOrchestrationPersistedKind;
  readonly source_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly sequence: number;
  readonly history_hash: string;
}

export interface ReplayOrchestrationPersistenceSnapshot {
  readonly snapshot_id: string;
  readonly run_id: string;
  readonly run_hash: string;
  readonly persisted_at: string;
  readonly records: readonly ReplayOrchestrationPersistenceRecord[];
  readonly lineage: readonly ReplayOrchestrationLineagePersistenceRecord[];
  readonly branches: readonly ReplayOrchestrationBranchStateRecord[];
  readonly checkpoints: readonly ReplayOrchestrationRecoveryCheckpointRecord[];
  readonly history: readonly ReplayOrchestrationExecutionHistoryRecord[];
  readonly deterministic_hash: string;
}
