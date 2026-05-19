import crypto from "crypto";

export interface ReplayReconstructionHistoryRecord {
  reconstruction_id: string;
  replay_id: string;
  generated_at: string;
  convergence_score: number;
  instability_score: number;
  reconstruction_hash: string;
}

export interface ReplayReconstructionHistorySummary {
  replay_id: string;
  total_reconstructions: number;
  latest_reconstruction_id?: string;
  average_convergence_score: number;
  deterministic_hash: string;
}

export function buildReplayReconstructionHistorySummary(
  replayId: string,
  records: ReplayReconstructionHistoryRecord[],
): ReplayReconstructionHistorySummary {
  const averageConvergenceScore =
    records.length === 0
      ? 0
      : records.reduce((sum, record) => {
          return sum + record.convergence_score;
        }, 0) / records.length;

  const latestRecord =
    records.length === 0
      ? undefined
      : [...records].sort((a, b) =>
          b.generated_at.localeCompare(a.generated_at),
        )[0];

  const deterministicHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        replayId,
        records,
        averageConvergenceScore,
        latestRecord,
      }),
    )
    .digest("hex");

  return {
    replay_id: replayId,
    total_reconstructions: records.length,
    latest_reconstruction_id: latestRecord?.reconstruction_id,
    average_convergence_score: averageConvergenceScore,
    deterministic_hash: deterministicHash,
  };
}