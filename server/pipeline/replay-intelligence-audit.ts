import crypto from "crypto";

export interface ReplayIntelligenceAuditRecord {
  replay_id: string;
  generated_at: string;
  analytics_hash: string;
  convergence_hash: string;
  route_group_count: number;
  validation_status: "passed" | "warning" | "failed";
}

export interface ReplayIntelligenceAuditSummary {
  replay_id: string;
  generated_at: string;
  total_records: number;
  passed_count: number;
  warning_count: number;
  failed_count: number;
  deterministic_hash: string;
}

export function buildReplayIntelligenceAuditSummary(
  replayId: string,
  records: ReplayIntelligenceAuditRecord[],
  generatedAt = new Date().toISOString(),
): ReplayIntelligenceAuditSummary {
  const passedCount = records.filter(
    (record) => record.validation_status === "passed",
  ).length;

  const warningCount = records.filter(
    (record) => record.validation_status === "warning",
  ).length;

  const failedCount = records.filter(
    (record) => record.validation_status === "failed",
  ).length;

  const deterministicHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        replayId,
        generatedAt,
        records,
        passedCount,
        warningCount,
        failedCount,
      }),
    )
    .digest("hex");

  return {
    replay_id: replayId,
    generated_at: generatedAt,
    total_records: records.length,
    passed_count: passedCount,
    warning_count: warningCount,
    failed_count: failedCount,
    deterministic_hash: deterministicHash,
  };
}

export function buildReplayIntelligenceAuditHash(
  record: ReplayIntelligenceAuditRecord,
): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(record))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
