import {
  buildReplayIntelligenceAuditHash,
  type ReplayIntelligenceAuditRecord,
} from "./replay-intelligence-audit";

const replayIntelligenceAuditRows: ReplayIntelligenceAuditRecord[] = [];

export function insertReplayIntelligenceAuditRow(
  row: ReplayIntelligenceAuditRecord,
): ReplayIntelligenceAuditRecord {
  replayIntelligenceAuditRows.push(row);
  return row;
}

export function listReplayIntelligenceAuditRows():
  ReplayIntelligenceAuditRecord[] {
  return [...replayIntelligenceAuditRows];
}

export function listReplayIntelligenceAuditRowsByReplayId(
  replayId: string,
): ReplayIntelligenceAuditRecord[] {
  return replayIntelligenceAuditRows.filter(
    (row) => row.replay_id === replayId,
  );
}

export function getReplayIntelligenceAuditRowByHash(
  auditHash: string,
): ReplayIntelligenceAuditRecord | null {
  return replayIntelligenceAuditRows.find(
    (row) => buildReplayIntelligenceAuditHash(row) === auditHash,
  ) ?? null;
}

export function listReplayIntelligenceAuditRowsByAuditHash(
  auditHash: string,
): ReplayIntelligenceAuditRecord[] {
  const audit = getReplayIntelligenceAuditRowByHash(auditHash);
  return audit ? listReplayIntelligenceAuditRowsByReplayId(audit.replay_id) : [];
}

export function clearReplayIntelligenceAuditRows(): void {
  replayIntelligenceAuditRows.length = 0;
}
