import crypto from "crypto";

export interface ReplayArchiveTimelineEvent {
  archive_id: string;
  created_at: string;
  event_type:
    | "archive_created"
    | "signal_drift_detected"
    | "provenance_changed"
    | "settlement_changed"
    | "tamper_detected"
    | "verification_completed";

  reference_id: string;
  details: Record<string, unknown>;
}

export interface ReplayArchiveTimeline {
  version: number;
  generated_at: string;
  lineage_id: string;
  deterministic_hash: string;
  events: ReplayArchiveTimelineEvent[];
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `"${key}":${stableStringify(val)}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function hashValue(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

export function buildReplayArchiveTimeline(
  lineageId: string,
  events: ReplayArchiveTimelineEvent[],
): ReplayArchiveTimeline {
  const sortedEvents = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    lineage_id: lineageId,
    deterministic_hash: hashValue(sortedEvents),
    events: sortedEvents,
  };
}