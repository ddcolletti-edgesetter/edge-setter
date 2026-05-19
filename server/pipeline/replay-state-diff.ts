import crypto from "crypto";

export interface ReplayStateDiffRecord {
  field: string;
  previous_value: unknown;
  current_value: unknown;
  changed: boolean;
}

export interface ReplayStateDiffSummary {
  replay_id: string;
  generated_at: string;
  total_diffs: number;
  changed_fields: number;
  diffs: ReplayStateDiffRecord[];
  deterministic_hash: string;
}

export function buildReplayStateDiffSummary(
  replayId: string,
  diffs: ReplayStateDiffRecord[],
  generatedAt = new Date().toISOString(),
): ReplayStateDiffSummary {
  const changedFields = diffs.filter((diff) => diff.changed).length;

  const deterministicHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        replayId,
        diffs,
        changedFields,
      }),
    )
    .digest("hex");

  return {
    replay_id: replayId,
    generated_at: generatedAt,
    total_diffs: diffs.length,
    changed_fields: changedFields,
    diffs,
    deterministic_hash: deterministicHash,
  };
}
