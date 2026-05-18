import crypto from "crypto";

import {
  ReplayArchiveDiffMismatch,
  ReplayArchiveDiffResult,
  ReplayArchiveProvenanceEvolution,
  ReplayArchiveSettlementMutation,
  ReplayArchiveSignalDrift,
} from "./replay-archive-diff-contract";

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

function pushMismatch(
  mismatches: ReplayArchiveDiffMismatch[],
  category: ReplayArchiveDiffMismatch["category"],
  path: string,
  left: unknown,
  right: unknown,
  severity: ReplayArchiveDiffMismatch["severity"] = "warning",
): void {
  mismatches.push({
    category,
    path,
    left,
    right,
    severity,
  });
}

export function diffReplayArchives(
  leftArchive: any,
  rightArchive: any,
): ReplayArchiveDiffResult {
  const mismatches: ReplayArchiveDiffMismatch[] = [];

  const signalDrift: ReplayArchiveSignalDrift[] = [];
  const provenanceEvolution: ReplayArchiveProvenanceEvolution[] = [];
  const settlementMutations: ReplayArchiveSettlementMutation[] = [];

  if (leftArchive.manifest_hash !== rightArchive.manifest_hash) {
    pushMismatch(
      mismatches,
      "manifest_mismatch",
      "manifest_hash",
      leftArchive.manifest_hash,
      rightArchive.manifest_hash,
      "critical",
    );
  }

  if (leftArchive.bundle_hash !== rightArchive.bundle_hash) {
    pushMismatch(
      mismatches,
      "bundle_mismatch",
      "bundle_hash",
      leftArchive.bundle_hash,
      rightArchive.bundle_hash,
      "critical",
    );
  }

  const leftSnapshots = leftArchive.snapshots ?? [];
  const rightSnapshots = rightArchive.snapshots ?? [];

  if (hashValue(leftSnapshots) !== hashValue(rightSnapshots)) {
    pushMismatch(
      mismatches,
      "snapshot_mismatch",
      "snapshots",
      hashValue(leftSnapshots),
      hashValue(rightSnapshots),
      "critical",
    );
  }

  const leftSignals = new Map<string, any>();

  for (const signal of leftArchive.signals ?? []) {
    leftSignals.set(signal.signal_id, signal);
  }

  for (const signal of rightArchive.signals ?? []) {
    const existing = leftSignals.get(signal.signal_id);

    if (!existing) {
      continue;
    }

    const fields = Object.keys(signal);

    for (const field of fields) {
      if (
        stableStringify(existing[field]) !==
        stableStringify(signal[field])
      ) {
        signalDrift.push({
          signal_id: signal.signal_id,
          market: signal.market ?? "unknown",
          field,
          left: existing[field],
          right: signal[field],
        });

        pushMismatch(
          mismatches,
          "signal_drift",
          `signals.${signal.signal_id}.${field}`,
          existing[field],
          signal[field],
        );
      }
    }
  }

  const leftProvenance = new Map<string, any>();

  for (const source of leftArchive.provenance ?? []) {
    leftProvenance.set(source.source_id, source);
  }

  for (const source of rightArchive.provenance ?? []) {
    const existing = leftProvenance.get(source.source_id);

    if (!existing) {
      continue;
    }

    const fields = Object.keys(source);

    for (const field of fields) {
      if (
        stableStringify(existing[field]) !==
        stableStringify(source[field])
      ) {
        provenanceEvolution.push({
          source_id: source.source_id,
          field,
          left: existing[field],
          right: source[field],
        });

        pushMismatch(
          mismatches,
          "provenance_evolution",
          `provenance.${source.source_id}.${field}`,
          existing[field],
          source[field],
        );
      }
    }
  }

  const leftSettlements = new Map<string, any>();

  for (const outcome of leftArchive.settlements ?? []) {
    leftSettlements.set(outcome.outcome_id, outcome);
  }

  for (const outcome of rightArchive.settlements ?? []) {
    const existing = leftSettlements.get(outcome.outcome_id);

    if (!existing) {
      continue;
    }

    const fields = Object.keys(outcome);

    for (const field of fields) {
      if (
        stableStringify(existing[field]) !==
        stableStringify(outcome[field])
      ) {
        settlementMutations.push({
          outcome_id: outcome.outcome_id,
          field,
          left: existing[field],
          right: outcome[field],
        });

        pushMismatch(
          mismatches,
          "settlement_mutation",
          `settlements.${outcome.outcome_id}.${field}`,
          existing[field],
          outcome[field],
        );
      }
    }
  }

  const deterministicHash = hashValue({
    mismatches,
    signalDrift,
    provenanceEvolution,
    settlementMutations,
  });

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    left_archive_id: leftArchive.archive_id,
    right_archive_id: rightArchive.archive_id,
    deterministic_hash: deterministicHash,
    mismatches,
    signal_drift: signalDrift,
    provenance_evolution: provenanceEvolution,
    settlement_mutations: settlementMutations,
    equivalent: mismatches.length === 0,
  };
}