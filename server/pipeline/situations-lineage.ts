import type {
  NormalizedEvent,
  SituationEvent,
  SituationEvidenceLineage,
  SituationLineageStatus,
} from "./situations-contract";

export function buildSituationEvidenceLineage(event: NormalizedEvent): SituationEvidenceLineage {
  const payload = event.payload as Record<string, any>;
  const rawPayload = payload.raw_payload as Record<string, any> | undefined;
  const signalId = firstString(
    payload.signal_id,
    payload.signalId,
    payload.signal_lineage?.signalId,
    rawPayload?.signal_id,
    rawPayload?.signalId,
  );
  const rawEventId = firstString(event.raw_event_id, payload.raw_event_id, rawPayload?.raw_event_id);
  const normalizedEventId = firstString(event.normalized_event_id, payload.normalized_event_id);
  const sourceEventId = firstString(rawPayload?.source_event_id, rawPayload?.event_id, event.source_id);
  const lineageStatus = lineageStatusFor({
    signalId,
    rawEventId,
    normalizedEventId,
    sourceEventId,
  });

  return {
    ...(signalId ? { signalId } : {}),
    ...(rawEventId ? { rawEventId } : {}),
    ...(normalizedEventId ? { normalizedEventId } : {}),
    ...(sourceEventId ? { sourceEventId } : {}),
    lineageStatus,
    lineageBasis: lineageBasisFor(lineageStatus),
    lineageLimitations: lineageLimitationsFor(lineageStatus),
  };
}

export function lineageFromSituationEvent(event: SituationEvent): SituationEvidenceLineage {
  const explicit = event.payload.evidence_lineage;
  if (isLineage(explicit)) return explicit;

  const normalized = event.payload.normalized_event as NormalizedEvent | undefined;
  if (normalized && typeof normalized === "object") {
    return buildSituationEvidenceLineage(normalized);
  }

  const rawEventId = firstString(event.raw_event_id);
  const normalizedEventId = firstString(event.normalized_event_id);
  const sourceEventId = firstString(event.source_id);
  const lineageStatus = lineageStatusFor({
    rawEventId,
    normalizedEventId,
    sourceEventId,
  });

  return {
    ...(rawEventId ? { rawEventId } : {}),
    ...(normalizedEventId ? { normalizedEventId } : {}),
    ...(sourceEventId ? { sourceEventId } : {}),
    lineageStatus,
    lineageBasis: lineageBasisFor(lineageStatus),
    lineageLimitations: lineageLimitationsFor(lineageStatus),
  };
}

function lineageStatusFor(input: {
  readonly signalId?: string;
  readonly rawEventId?: string;
  readonly normalizedEventId?: string;
  readonly sourceEventId?: string;
}): SituationLineageStatus {
  if (input.signalId) return "signal_linked";
  if (input.rawEventId) return "raw_event_linked";
  if (input.normalizedEventId) return "normalized_event_linked";
  if (input.sourceEventId) return "source_only";
  return "missing_lineage";
}

function lineageBasisFor(status: SituationLineageStatus): string[] {
  switch (status) {
    case "signal_linked":
      return ["Canonical evidence includes a signal ID for direct signal/outcome lookup."];
    case "raw_event_linked":
      return ["Canonical evidence includes a raw event ID but no direct signal ID."];
    case "normalized_event_linked":
      return ["Canonical evidence includes a normalized event ID but no raw event or signal ID."];
    case "source_only":
      return ["Canonical evidence can be traced to a source ID only."];
    case "missing_lineage":
      return ["Canonical evidence has no usable signal, raw event, normalized event, or source lineage."];
  }
}

function lineageLimitationsFor(status: SituationLineageStatus): string[] {
  switch (status) {
    case "signal_linked":
      return [];
    case "raw_event_linked":
      return ["Source evidence present but signal outcome link is missing."];
    case "normalized_event_linked":
      return ["Normalized evidence present but direct signal outcome link is missing."];
    case "source_only":
      return ["Signal lineage unavailable; outcome linkage is replay-only unless another event carries a signal ID."];
    case "missing_lineage":
      return ["Signal lineage unavailable; outcome linkage unavailable for this evidence event."];
  }
}

function isLineage(value: unknown): value is SituationEvidenceLineage {
  return Boolean(value) &&
    typeof value === "object" &&
    typeof (value as SituationEvidenceLineage).lineageStatus === "string" &&
    Array.isArray((value as SituationEvidenceLineage).lineageBasis) &&
    Array.isArray((value as SituationEvidenceLineage).lineageLimitations);
}

function firstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}
