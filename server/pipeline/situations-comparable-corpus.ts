import { computeCanonicalHash } from "./canonical-hash";
import type {
  ComparableSituationCorpusRecord,
  ComparableSituationMatch,
  ComparableSituationMatchSummary,
  SituationCalibrationSampleBand,
  SituationConfidenceBand,
  SituationConfidenceHistory,
  SituationEvent,
  SituationLifecycleState,
  SituationMarketReactionBand,
  SituationClvSupportStatus,
  SituationEvidenceLineage,
  SituationOutcomeLinkStatus,
  SituationOutcomeStatus,
  SituationReplayVerificationStatus,
  SituationSettlementStatus,
  SituationSourceDepthBand,
  SituationStateHistory,
  SituationTimingProfileBand,
} from "./situations-contract";
import { lineageFromSituationEvent } from "./situations-lineage";
import {
  type CanonicalSituationRecord,
  listCanonicalSituations,
  listSituationEventsForIds,
  listSituationStateHistoryForIds,
} from "./situations-store";
import { chunkIds, getPipelineDb } from "./store";

interface OutcomeLinkage {
  readonly outcomeLinkStatus: SituationOutcomeLinkStatus;
  readonly calibrationSampleBand: SituationCalibrationSampleBand;
  readonly settlementStatus: SituationSettlementStatus;
  readonly clvSupportStatus: SituationClvSupportStatus;
  readonly outcomeCalibrationBasis: readonly string[];
  readonly outcomeCalibrationLimitations: readonly string[];
  readonly lineageRecords: readonly SituationEvidenceLineage[];
  readonly settledOutcomeAvailable: boolean;
  readonly clvLinked: boolean;
}

/**
 * Build the comparable corpus for the whole situations dataset.
 *
 * STATEMENT BUDGET: this used to run 2 statements per situation for the events
 * and state history (1,000 for the default 500-situation corpus), and then one
 * outcome lookup per signal id per situation — 4,800 on a prod-shaped fixture,
 * which with the unindexed `outcomes` table was 30.5s of a 31.6s cold
 * GET /api/v2/situations. It now runs 1 list + 1 events + 1 state-history
 * statement plus one chunked outcomes statement per 900 distinct signal ids:
 * 5-6 statements for the same corpus.
 *
 * The outcomes prefetch is sound because resolveOutcomeLinkage only counts the
 * rows (`.filter(...).length`) — it never reads their order or groups them by
 * signal — and signalIdsFor returns a deduped set, so one batched read of the
 * same ids yields the same multiset per situation. Corpus records therefore
 * hash identically, which is what keeps replay hashes stable.
 */
export function buildComparableSituationCorpus(limit = 500): ComparableSituationCorpusRecord[] {
  const records = listCanonicalSituations({ limit });
  if (records.length === 0) return [];
  const situationIds = records.map((record) => record.situation_id);
  const eventsBySituation = listSituationEventsForIds(situationIds);
  const stateHistoryBySituation = listSituationStateHistoryForIds(situationIds);

  const outcomesBySignal = prefetchOutcomesForEventGroups(
    records.map((record) => eventsBySituation.get(record.situation_id) ?? []),
  );

  return records
    .map((record) => buildComparableSituationCorpusRecord({
      record,
      events: eventsBySituation.get(record.situation_id) ?? [],
      stateHistory: stateHistoryBySituation.get(record.situation_id) ?? [],
      outcomesBySignal,
    }))
    .sort(compareCorpusRecords);
}

export function buildComparableSituationCorpusRecord(input: {
  readonly record: CanonicalSituationRecord;
  readonly events: readonly SituationEvent[];
  readonly stateHistory: readonly SituationStateHistory[];
  /**
   * Outcome rows for every signal id in the surrounding corpus, prefetched by
   * buildComparableSituationCorpus. Omitted by single-record callers, which
   * fall back to reading this record's own signal ids on demand.
   */
  readonly outcomesBySignal?: ReadonlyMap<string, readonly OutcomeRow[]>;
}): ComparableSituationCorpusRecord {
  const normalizedEvents = normalizedEvidence(input.events);
  const lifecyclePath = lifecyclePathFor(input.record.latest_snapshot?.lifecycle_state ?? "watching", input.stateHistory);
  const sourceDepth = sourceDepthBand(sourceIds(input.events).size);
  const marketBand = marketReactionBand(normalizedEvents);
  const timingBand = timingProfileBand(normalizedEvents);
  const replayStatus = replayVerificationStatus(input.record, input.events);
  const lifecycleState = input.record.latest_snapshot?.lifecycle_state ?? "watching";
  const outcomeLinkage = resolveOutcomeLinkage({
    events: input.events,
    lifecycleState,
    replayStatus,
    outcomesBySignal: input.outcomesBySignal,
  });
  const outcomeStatus = outcomeStatusFor(lifecycleState, replayStatus, outcomeLinkage);
  const seed = {
    situation_id: input.record.situation_id,
    sport: input.record.sport,
    league: input.record.league,
    situation_type: input.record.situation_type,
    lifecycle_path: lifecyclePath,
    confidence_band: confidenceBand(input.record.latest_snapshot?.confidence.score ?? 0),
    source_depth_band: sourceDepth,
    market_reaction_band: marketBand,
    timing_profile: timingBand,
    outcome_status: outcomeStatus,
    replay_verification_status: replayStatus,
    outcome_link_status: outcomeLinkage.outcomeLinkStatus,
    calibration_sample_band: outcomeLinkage.calibrationSampleBand,
    settlement_status: outcomeLinkage.settlementStatus,
    clv_support_status: outcomeLinkage.clvSupportStatus,
  };

  return {
    corpus_id: `csc_${computeCanonicalHash(seed).slice(0, 24)}`,
    situation_id: input.record.situation_id,
    sport: input.record.sport,
    league: input.record.league,
    situation_type: input.record.situation_type,
    teams: [...input.record.teams].sort(),
    players: [...input.record.players].sort(),
    lifecycle_path: lifecyclePath,
    lifecycle_state: input.record.latest_snapshot?.lifecycle_state ?? "watching",
    confidence_band: confidenceBand(input.record.latest_snapshot?.confidence.score ?? 0),
    source_depth_band: sourceDepth,
    market_reaction_band: marketBand,
    timing_profile: timingBand,
    outcome_status: outcomeStatus,
    replay_verification_status: replayStatus,
    outcomeLinkStatus: outcomeLinkage.outcomeLinkStatus,
    calibrationSampleBand: outcomeLinkage.calibrationSampleBand,
    settlementStatus: outcomeLinkage.settlementStatus,
    clvSupportStatus: outcomeLinkage.clvSupportStatus,
    outcomeCalibrationBasis: outcomeLinkage.outcomeCalibrationBasis,
    outcomeCalibrationLimitations: outcomeLinkage.outcomeCalibrationLimitations,
    calibration_limitations: corpusLimitations({
      sourceDepth,
      marketBand,
      timingBand,
      outcomeStatus,
      replayStatus,
      evidenceCount: normalizedEvents.length,
      outcomeLinkage,
    }),
    replay_hash: input.record.latest_snapshot?.replay_hash ?? input.record.canonical_hash ?? null,
    created_at: input.record.latest_snapshot?.created_at ?? input.record.created_at,
  };
}

export function matchComparableSituations(input: {
  readonly target: ComparableSituationCorpusRecord;
  readonly corpus: readonly ComparableSituationCorpusRecord[];
  readonly maxMatches?: number;
}): ComparableSituationMatchSummary {
  const matches = input.corpus
    .filter((record) => record.situation_id !== input.target.situation_id)
    .map((record) => scoreComparableSituation(input.target, record))
    .filter((match) => match.match_score >= 60)
    .sort(compareMatches)
    .slice(0, input.maxMatches ?? 5);

  const outcomeLinkedMatches = matches.filter((match) => match.outcomeLinkStatus === "outcome_linked" || match.outcomeLinkStatus === "clv_linked");
  const clvLinkedMatches = matches.filter((match) => match.outcomeLinkStatus === "clv_linked");
  const supportLevel = supportLevelFor(matches, outcomeLinkedMatches);
  const sampleStatus = sampleStatusFor(input.corpus, matches, outcomeLinkedMatches, clvLinkedMatches);
  const sampleBand = sampleBandFor(outcomeLinkedMatches.length, clvLinkedMatches.length);
  const outcomeLinkStatus = summaryOutcomeLinkStatus(input.target, matches, outcomeLinkedMatches, clvLinkedMatches);
  const clvSupportStatus = summaryClvSupportStatus(input.target, clvLinkedMatches);
  const basis = matchBasis(input.target, matches, outcomeLinkedMatches, clvLinkedMatches);
  const limitations = matchLimitations(input.target, input.corpus, matches, outcomeLinkedMatches, clvLinkedMatches, sampleStatus);
  const deterministicHash = computeCanonicalHash({
    target: input.target.corpus_id,
    matches: matches.map((match) => ({
      situation_id: match.situation_id,
      match_score: match.match_score,
      matched_dimensions: match.matched_dimensions,
      differing_dimensions: match.differing_dimensions,
      outcome_status: match.outcome_status,
      replay_verification_status: match.replay_verification_status,
      outcome_link_status: match.outcomeLinkStatus,
      calibration_sample_band: match.calibrationSampleBand,
      settlement_status: match.settlementStatus,
      clv_support_status: match.clvSupportStatus,
    })),
    sample_status: sampleStatus,
    calibration_sample_band: sampleBand,
    outcome_link_status: outcomeLinkStatus,
    clv_support_status: clvSupportStatus,
    support_level: supportLevel,
  });

  return {
    support_level: supportLevel,
    sample_status: sampleStatus,
    calibration_sample_band: sampleBand,
    outcome_link_status: outcomeLinkStatus,
    clv_support_status: clvSupportStatus,
    basis,
    limitations,
    matches,
    deterministic_hash: deterministicHash,
  };
}

export function confidenceBand(score: number): SituationConfidenceBand {
  if (score >= 85) return "very_high";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  if (score >= 30) return "low";
  return "watch";
}

export function sourceDepthBand(count: number): SituationSourceDepthBand {
  if (count <= 0) return "none";
  if (count === 1) return "single";
  if (count < 4) return "multiple";
  return "deep";
}

export function marketReactionBand(events: readonly Record<string, any>[]): SituationMarketReactionBand {
  const deltas = events
    .map((event) => Number(event.market_context?.delta))
    .filter(Number.isFinite)
    .map(Math.abs);
  if (deltas.length === 0) return "none";
  const max = Math.max(...deltas);
  if (max >= 2) return "material";
  if (max >= 1) return "moderate";
  return "attached";
}

export function timingProfileBand(events: readonly Record<string, any>[]): SituationTimingProfileBand {
  const latencies = events
    .map((event) => minutesBetween(String(event.occurred_at ?? ""), String(event.received_at ?? "")))
    .filter((value): value is number => value != null)
    .sort((left, right) => left - right);
  if (latencies.length === 0) return "unknown";
  const median = latencies[Math.floor(latencies.length / 2)];
  if (median <= 5) return "immediate";
  if (median <= 60) return "same_hour";
  return "delayed";
}

export function normalizedEvidence(events: readonly SituationEvent[]): Record<string, any>[] {
  return events
    .map((event) => event.payload.normalized_event)
    .filter((event): event is Record<string, any> => Boolean(event) && typeof event === "object");
}

export function sourceIds(events: readonly SituationEvent[]): Set<string> {
  return new Set(events
    .filter((event) => event.payload.normalized_event)
    .map((event) => event.source_id)
    .filter((sourceId): sourceId is string => Boolean(sourceId)));
}

function scoreComparableSituation(
  target: ComparableSituationCorpusRecord,
  candidate: ComparableSituationCorpusRecord,
): ComparableSituationMatch {
  const dimensions: Array<[string, boolean, number]> = [
    ["sport", candidate.sport === target.sport, 20],
    ["league", candidate.league === target.league, 20],
    ["situation type", candidate.situation_type === target.situation_type, 20],
    ["lifecycle path", overlaps(candidate.lifecycle_path, target.lifecycle_path), 10],
    ["confidence band", candidate.confidence_band === target.confidence_band, 10],
    ["source depth band", candidate.source_depth_band === target.source_depth_band, 8],
    ["market reaction band", candidate.market_reaction_band === target.market_reaction_band, 7],
    ["timing profile", candidate.timing_profile === target.timing_profile, 5],
  ];
  const matched = dimensions.filter(([, ok]) => ok);
  const differing = dimensions.filter(([, ok]) => !ok);

  return {
    situation_id: candidate.situation_id,
    match_score: dimensions.reduce((sum, [, ok, weight]) => sum + (ok ? weight : 0), 0),
    matched_dimensions: matched.map(([name]) => name),
    differing_dimensions: differing.map(([name]) => name),
    outcome_status: candidate.outcome_status,
    replay_verification_status: candidate.replay_verification_status,
    outcomeLinkStatus: candidate.outcomeLinkStatus,
    calibrationSampleBand: candidate.calibrationSampleBand,
    settlementStatus: candidate.settlementStatus,
    clvSupportStatus: candidate.clvSupportStatus,
    limitations: unique([
      ...candidate.calibration_limitations,
      ...(candidate.outcomeCalibrationLimitations ?? []),
    ]),
  };
}

function supportLevelFor(
  matches: readonly ComparableSituationMatch[],
  outcomeLinkedMatches: readonly ComparableSituationMatch[],
): ComparableSituationMatchSummary["support_level"] {
  if (matches.length === 0) return "none";
  if (outcomeLinkedMatches.length >= 3 && matches[0]?.match_score >= 85) return "strong";
  if (matches.length >= 2 && matches[0]?.match_score >= 75) return "moderate";
  return "limited";
}

function sampleStatusFor(
  corpus: readonly ComparableSituationCorpusRecord[],
  matches: readonly ComparableSituationMatch[],
  outcomeLinkedMatches: readonly ComparableSituationMatch[],
  clvLinkedMatches: readonly ComparableSituationMatch[],
): ComparableSituationMatchSummary["sample_status"] {
  if (corpus.length <= 1) return "missing_corpus";
  if (clvLinkedMatches.length >= 3) return "clv_sample_available";
  if (outcomeLinkedMatches.length >= 3) return "settled_sample_available";
  if (matches.length > 0) return matches.every((match) => match.outcomeLinkStatus === "replay_only")
    ? "replay_only"
    : "insufficient_settled_sample";
  return "insufficient_settled_sample";
}

function matchBasis(
  target: ComparableSituationCorpusRecord,
  matches: readonly ComparableSituationMatch[],
  outcomeLinkedMatches: readonly ComparableSituationMatch[],
  clvLinkedMatches: readonly ComparableSituationMatch[],
): string[] {
  if (matches.length === 0) return ["No comparable historical corpus records matched the safe calibration dimensions."];
  const basis = [
    `Comparable corpus matched on ${target.sport}, ${target.league}, and ${target.situation_type}.`,
    "Matching used lifecycle path, confidence band, source depth band, market reaction band, and timing profile.",
  ];
  if (matches.some((match) => match.matched_dimensions.includes("market reaction band"))) {
    basis.push("Comparable movement pattern is supported where market reaction bands align.");
  }
  if (matches.some((match) => match.replay_verification_status === "verified_replay_hash")) {
    basis.push("Replay verification status is available for comparable records.");
  }
  if (outcomeLinkedMatches.length > 0) basis.push("Outcome-linked comparison is available for some comparable records, but exposed support remains qualitative.");
  if (clvLinkedMatches.length > 0) basis.push("CLV-linked comparison is available for some comparable records, but no CLV edge claim is emitted.");
  if (target.outcomeLinkStatus === "pending_outcome") basis.push("Current situation outcome calibration is pending.");
  if (outcomeLinkedMatches.length === 0) basis.push("Comparable support is replay-only or pending outcome calibration.");
  return basis;
}

function matchLimitations(
  target: ComparableSituationCorpusRecord,
  corpus: readonly ComparableSituationCorpusRecord[],
  matches: readonly ComparableSituationMatch[],
  outcomeLinkedMatches: readonly ComparableSituationMatch[],
  clvLinkedMatches: readonly ComparableSituationMatch[],
  sampleStatus: ComparableSituationMatchSummary["sample_status"],
): string[] {
  const limitations = [
    "No exact win rate or prediction accuracy is claimed from comparable situation matching.",
    "Comparable matching uses safe categorical bands, not team-specific or player-specific outcome claims.",
  ];
  if (corpus.length <= 1) limitations.push("Missing corpus data: no prior comparable situation records are available.");
  if (matches.length === 0) limitations.push("Limited historical support: no comparable movement pattern matched the current bands.");
  if (outcomeLinkedMatches.length < 3) limitations.push("Insufficient settled sample for accuracy claims.");
  if (clvLinkedMatches.length === 0) limitations.push("Market movement present but CLV support unavailable.");
  else if (clvLinkedMatches.length < 3) limitations.push("CLV-linked comparison exists, but sample remains limited.");
  if (sampleStatus === "replay_only") limitations.push("Replay-only comparison: comparable records have not produced settled outcome calibration.");
  if (target.outcomeLinkStatus === "pending_outcome") limitations.push("Pending outcome calibration for the current situation.");
  return unique([...limitations, ...target.calibration_limitations, ...(target.outcomeCalibrationLimitations ?? [])]);
}

function corpusLimitations(input: {
  readonly sourceDepth: SituationSourceDepthBand;
  readonly marketBand: SituationMarketReactionBand;
  readonly timingBand: SituationTimingProfileBand;
  readonly outcomeStatus: SituationOutcomeStatus;
  readonly replayStatus: SituationReplayVerificationStatus;
  readonly evidenceCount: number;
  readonly outcomeLinkage: OutcomeLinkage;
}): string[] {
  const limitations: string[] = [];
  if (input.evidenceCount < 3) limitations.push("Limited sample: fewer than three evidence events are attached.");
  if (input.sourceDepth === "none" || input.sourceDepth === "single") limitations.push("Source timing support is constrained by limited source depth.");
  if (input.marketBand === "none") limitations.push("Market reaction is pending or not attached.");
  if (input.timingBand === "unknown") limitations.push("Source timing support is unavailable.");
  if (input.outcomeStatus === "pending") limitations.push("Pending outcome calibration.");
  if (input.outcomeStatus === "replay_only") limitations.push("Replay-only comparison.");
  if (input.replayStatus !== "verified_replay_hash") limitations.push("Replay verification is limited.");
  return unique([...limitations, ...input.outcomeLinkage.outcomeCalibrationLimitations]);
}

function lifecyclePathFor(
  fallback: SituationLifecycleState,
  stateHistory: readonly SituationStateHistory[],
): SituationLifecycleState[] {
  const path = [...stateHistory]
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.history_id.localeCompare(right.history_id))
    .map((history) => history.new_state);
  return uniqueStates(path.length ? path : [fallback]);
}

function outcomeStatusFor(
  state: SituationLifecycleState,
  replayStatus: SituationReplayVerificationStatus,
  outcomeLinkage: OutcomeLinkage,
): SituationOutcomeStatus {
  if (state === "invalidated") return "invalidated";
  if (outcomeLinkage.settledOutcomeAvailable) return "settled";
  if (replayStatus === "verified_replay_hash") return "pending";
  return "replay_only";
}

function resolveOutcomeLinkage(input: {
  readonly events: readonly SituationEvent[];
  readonly lifecycleState: SituationLifecycleState;
  readonly replayStatus: SituationReplayVerificationStatus;
  readonly outcomesBySignal?: ReadonlyMap<string, readonly OutcomeRow[]>;
}): OutcomeLinkage {
  const signalIds = signalIdsFor(input.events);
  const lineageRecords = lineageRecordsFor(input.events);
  const outcomes = signalIds.length
    ? (input.outcomesBySignal
      ? signalIds.flatMap((signalId) => input.outcomesBySignal!.get(signalId) ?? [])
      : outcomesForSignalIds(signalIds))
    : [];
  const settled = outcomes.filter((outcome) => outcome.hit !== null);
  const clvLinked = outcomes.filter((outcome) => outcome.clv !== null);
  const hasOutcomeRows = outcomes.length > 0;
  const settledOutcomeAvailable = settled.length > 0;
  const hasClv = clvLinked.length > 0;
  const outcomeLinkStatus: SituationOutcomeLinkStatus = hasClv
    ? "clv_linked"
    : settledOutcomeAvailable || hasOutcomeRows
      ? "outcome_linked"
      : input.lifecycleState === "invalidated"
        ? "insufficient_data"
        : input.replayStatus === "verified_replay_hash"
          ? "pending_outcome"
          : "replay_only";
  const settlementStatus: SituationSettlementStatus = input.lifecycleState === "invalidated"
    ? "invalidated"
    : settledOutcomeAvailable
      ? "settled"
      : hasOutcomeRows
        ? "unknown"
        : "unsettled";
  const clvSupportStatus: SituationClvSupportStatus = hasClv
    ? "available"
    : hasOutcomeRows
      ? "absent"
      : "unavailable";
  const basis: string[] = [];
  const limitations: string[] = [];

  if (signalIds.length > 0) basis.push("Canonical evidence includes signal IDs that can be checked against outcome rows.");
  else limitations.push("Signal lineage unavailable for direct outcome lookup.");
  for (const lineage of lineageRecords) {
    basis.push(...lineage.lineageBasis);
    limitations.push(...lineage.lineageLimitations);
  }
  if (settledOutcomeAvailable) basis.push("At least one comparable signal has a settled outcome row.");
  if (hasClv) basis.push("At least one comparable signal has stored CLV data.");
  if (!settledOutcomeAvailable) limitations.push("Insufficient settled sample for accuracy claims.");
  if (!hasClv) limitations.push("CLV support unavailable for this comparable record.");
  if (outcomeLinkStatus === "pending_outcome") limitations.push("Outcome calibration is pending.");
  if (outcomeLinkStatus === "replay_only") limitations.push("Replay-only comparison; no direct outcome row is linked.");

  return {
    outcomeLinkStatus,
    calibrationSampleBand: sampleBandFor(settled.length, clvLinked.length),
    settlementStatus,
    clvSupportStatus,
    outcomeCalibrationBasis: basis.length ? basis : ["Outcome linkage checked against existing signal/outcome persistence."],
    outcomeCalibrationLimitations: unique(limitations),
    lineageRecords,
    settledOutcomeAvailable,
    clvLinked: hasClv,
  };
}

function signalIdsFor(events: readonly SituationEvent[]): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    const lineage = lineageFromSituationEvent(event);
    if (lineage.signalId) ids.add(lineage.signalId);
    const normalized = event.payload.normalized_event as Record<string, any> | undefined;
    const payload = normalized?.payload as Record<string, any> | undefined;
    const signalId = payload?.signalId ??
      payload?.signal_id ??
      payload?.signal_lineage?.signalId ??
      payload?.raw_payload?.signalId ??
      payload?.raw_payload?.signal_id;
    if (typeof signalId === "string" && signalId.trim()) ids.add(signalId);
  }
  return Array.from(ids).sort();
}

function lineageRecordsFor(events: readonly SituationEvent[]): SituationEvidenceLineage[] {
  return events
    .filter((event) => event.payload.normalized_event || event.payload.evidence_lineage)
    .map(lineageFromSituationEvent);
}

export interface OutcomeRow {
  readonly hit: number | null;
  readonly clv: number | null;
}

/**
 * The per-signal outcome lookup behind a corpus record's settlement/CLV
 * linkage, kept for single-record callers that have no corpus-wide prefetch to
 * read from. The fan-out callers use outcomesForSignalIdsBatched below.
 *
 * Exported so the index guard in outcomes-signal-index.test.ts and the plan
 * guard in request-path-query-plans.test.ts both explain the exact string
 * production runs — a copy in a test could drift green while the real query
 * went back to a full scan.
 *
 * It must stay served by idx_outcomes_signal_created (store.ts): without the
 * index each call scans all 75k outcome rows. One of these per signal id,
 * ~1,200-1,500 per /api/v2/situations request, was 93-95% of a ~22s cold
 * response on prod (2026-10-04). #78 added the index; this PR removed the
 * fan-out that made the per-call cost matter, and the two compose.
 *
 * NOTE (reported, not fixed): unlike the accuracy and calibration paths this has
 * no `excluded_stale = 0` filter, so outcomes that settlement flagged as bad
 * matches still count toward comparable linkage. See the PR for the measured
 * effect; changing it is a separate decision.
 */
export const OUTCOMES_FOR_SIGNAL_SQL = `
    SELECT hit, clv
    FROM outcomes
    WHERE signal_id = ?
    ORDER BY created_at DESC
  `;

function outcomesForSignalIds(signalIds: readonly string[]): OutcomeRow[] {
  if (signalIds.length === 0) return [];
  const db = getPipelineDb();
  const stmt = db.prepare(OUTCOMES_FOR_SIGNAL_SQL);
  return signalIds.flatMap((signalId) => stmt.all(signalId) as OutcomeRow[]);
}

/**
 * Collect the signal ids referenced by several situations' event lists and
 * fetch all their outcome rows in one batched read.
 *
 * Shared by buildComparableSituationCorpus (the 500-situation corpus) and by
 * the /api/v2/situations response path, which builds a target corpus record per
 * delivered situation to score comparables against — that second fan-out was
 * another 800 per-id outcome lookups per request on top of the corpus's own.
 */
export function prefetchOutcomesForEventGroups(
  eventGroups: Iterable<readonly SituationEvent[]>,
): Map<string, OutcomeRow[]> {
  const signalIds = new Set<string>();
  for (const events of eventGroups) {
    for (const id of signalIdsFor(events)) signalIds.add(id);
  }
  return outcomesForSignalIdsBatched([...signalIds]);
}

/** The batched form, exported for the plan test. */
export function outcomesBySignalIdsSql(count: number): string {
  return `
    SELECT signal_id, hit, clv
    FROM outcomes
    WHERE signal_id IN (${new Array(count).fill("?").join(",")})
  `;
}

/**
 * Outcome rows for many signal ids, grouped by signal_id, in one statement per
 * 900 ids.
 *
 * No ORDER BY: the single-id form ordered by created_at DESC, but every
 * consumer of these rows counts them (`settled.length`, `clvLinked.length`,
 * `outcomes.length > 0`) and none reads the order, so sorting 75k rows into a
 * temp b-tree to then ignore the order would be pure cost. The multiset per
 * signal id is identical, which is what the corpus hash depends on.
 */
export function outcomesForSignalIdsBatched(
  signalIds: readonly string[],
): Map<string, OutcomeRow[]> {
  const bySignal = new Map<string, OutcomeRow[]>();
  if (signalIds.length === 0) return bySignal;
  const db = getPipelineDb();
  for (const chunk of chunkIds(signalIds)) {
    const rows = db.prepare(outcomesBySignalIdsSql(chunk.length)).all(...chunk) as
      Array<{ signal_id: string; hit: number | null; clv: number | null }>;
    for (const row of rows) {
      const bucket = bySignal.get(row.signal_id);
      if (bucket) bucket.push({ hit: row.hit, clv: row.clv });
      else bySignal.set(row.signal_id, [{ hit: row.hit, clv: row.clv }]);
    }
  }
  return bySignal;
}

function sampleBandFor(outcomeLinkedCount: number, clvLinkedCount: number): SituationCalibrationSampleBand {
  const count = Math.max(outcomeLinkedCount, clvLinkedCount);
  if (count <= 0) return "no_sample";
  if (count < 3) return "limited_sample";
  if (count < 10) return "directional_sample";
  return "stronger_sample";
}

function summaryOutcomeLinkStatus(
  target: ComparableSituationCorpusRecord,
  matches: readonly ComparableSituationMatch[],
  outcomeLinkedMatches: readonly ComparableSituationMatch[],
  clvLinkedMatches: readonly ComparableSituationMatch[],
): SituationOutcomeLinkStatus {
  if (clvLinkedMatches.length > 0) return "clv_linked";
  if (outcomeLinkedMatches.length > 0) return "outcome_linked";
  if (matches.length === 0) return "insufficient_data";
  if (target.outcomeLinkStatus === "pending_outcome") return "pending_outcome";
  return matches.every((match) => match.outcomeLinkStatus === "replay_only") ? "replay_only" : "insufficient_data";
}

function summaryClvSupportStatus(
  target: ComparableSituationCorpusRecord,
  clvLinkedMatches: readonly ComparableSituationMatch[],
): SituationClvSupportStatus {
  if (clvLinkedMatches.length > 0) return "available";
  return target.market_reaction_band === "none" ? "unavailable" : "absent";
}

function replayVerificationStatus(
  record: CanonicalSituationRecord,
  events: readonly SituationEvent[],
): SituationReplayVerificationStatus {
  if (record.latest_snapshot?.replay_hash && events.every((event) => event.replay_hash)) return "verified_replay_hash";
  if (record.canonical_hash) return "replay_only";
  return "missing_replay_hash";
}

function compareCorpusRecords(left: ComparableSituationCorpusRecord, right: ComparableSituationCorpusRecord): number {
  return left.created_at.localeCompare(right.created_at) || left.situation_id.localeCompare(right.situation_id);
}

function compareMatches(left: ComparableSituationMatch, right: ComparableSituationMatch): number {
  return right.match_score - left.match_score || left.situation_id.localeCompare(right.situation_id);
}

function overlaps(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function minutesBetween(leftIso: string, rightIso: string): number | null {
  const left = Date.parse(leftIso);
  const right = Date.parse(rightIso);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.max(0, Math.round(Math.abs(right - left) / 60000));
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueStates(values: readonly SituationLifecycleState[]): SituationLifecycleState[] {
  return Array.from(new Set(values));
}
