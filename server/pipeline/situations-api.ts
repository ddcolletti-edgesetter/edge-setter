import type {
  ComparableSituationCorpusRecord,
  SituationConfidenceFactorBreakdown,
  SituationConfidenceHistory,
  SituationEvent,
  SituationHistoricalCalibrationFields,
  SituationLifecycleState,
  SituationSnapshot,
  SituationStateHistory,
} from "./situations-contract";
import { deriveSituationHistoricalCalibration } from "./situations-calibration";
import {
  buildComparableSituationCorpus,
  buildComparableSituationCorpusRecord,
  matchComparableSituations,
} from "./situations-comparable-corpus";
import {
  type CanonicalSituationRecord,
  getSituationPublicConfirmation,
  listCanonicalSituations,
  listSituationConfidenceHistory,
  listSituationEvents,
  listSituationStateHistory,
} from "./situations-store";

const ACTIVE_LIFECYCLE_STATES = new Set<SituationLifecycleState>([
  "watching",
  "emerging",
  "developing",
  "escalating",
  "confirmed",
  "official",
  "cooling",
]);

export type CanonicalSituationOrderBy =
  | "operational_visibility_score"
  | "escalation_score"
  | "confidence"
  | "updated_at";

export interface CanonicalSituationApiQuery {
  readonly league?: string;
  readonly sport?: string;
  readonly situationType?: string;
  readonly lifecycleState?: string;
  readonly activeOnly?: boolean;
  readonly limit?: number;
  readonly orderBy?: CanonicalSituationOrderBy;
}

export interface CanonicalSituationApiResponse {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly sport: string;
  readonly league: string;
  readonly teams: readonly string[];
  readonly players: readonly string[];
  readonly situationType: string;
  readonly lifecycleState: SituationLifecycleState;
  readonly lifecycleExplanation: string;
  readonly confidence: number;
  readonly confidenceLabel: string;
  readonly confidenceFactors: CanonicalSituationConfidenceFactors;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly escalationScore: number;
  readonly timingPressure: SituationSnapshot["timing_pressure"];
  readonly operationalVisibilityScore: number;
  readonly lastUpdatedAt: string;
  readonly firstSeenAt: string;
  readonly publicConfirmation?: string;
  readonly detectionLeadMinutes?: number;
  readonly publicConfirmationSource?: string;
  readonly evidenceCount: number;
  readonly sourceCount: number;
  readonly latestEvidence: readonly CanonicalSituationEvidencePreview[];
  readonly stateHistoryPreview: readonly CanonicalSituationStateHistoryPreview[];
  readonly confidenceHistoryPreview: readonly CanonicalSituationConfidenceHistoryPreview[];
  readonly replayHash: string;
  readonly historicalPatternLabel?: SituationHistoricalCalibrationFields["historicalPatternLabel"];
  readonly historicalPatternConfidence?: SituationHistoricalCalibrationFields["historicalPatternConfidence"];
  readonly historicalPatternBasis?: SituationHistoricalCalibrationFields["historicalPatternBasis"];
  readonly comparableStoryType?: SituationHistoricalCalibrationFields["comparableStoryType"];
  readonly sourceTimingProfile?: SituationHistoricalCalibrationFields["sourceTimingProfile"];
  readonly sourceReliabilityBasis?: SituationHistoricalCalibrationFields["sourceReliabilityBasis"];
  readonly marketReactionWindow?: SituationHistoricalCalibrationFields["marketReactionWindow"];
  readonly confirmationSignals?: SituationHistoricalCalibrationFields["confirmationSignals"];
  readonly weakeningSignals?: SituationHistoricalCalibrationFields["weakeningSignals"];
  readonly calibrationSummary?: SituationHistoricalCalibrationFields["calibrationSummary"];
  readonly calibrationLimitations?: SituationHistoricalCalibrationFields["calibrationLimitations"];
}

export interface CanonicalSituationConfidenceFactors {
  readonly scores: SituationConfidenceFactorBreakdown;
  readonly whyConfidenceIncreased: readonly string[];
  readonly whyConfidenceDecreased: readonly string[];
  readonly evidenceThatMattersMost: readonly string[];
  readonly whatRemainsUncertain: readonly string[];
}

export interface CanonicalSituationEvidencePreview {
  readonly eventType: string;
  readonly sourceType: string | null;
  readonly timestamp: string;
  readonly confidenceDelta: number | null;
  readonly marketImpact: string | null;
  readonly validatorAgreement: string | null;
  readonly summary: string;
  readonly replayHash: string;
}

export interface CanonicalSituationStateHistoryPreview {
  readonly previousState: SituationLifecycleState | null;
  readonly newState: SituationLifecycleState;
  readonly reason: string;
  readonly timestamp: string;
  readonly replayHash: string;
}

export interface CanonicalSituationConfidenceHistoryPreview {
  readonly previousConfidence: number | null;
  readonly newConfidence: number;
  readonly delta: number | null;
  readonly reasons: readonly string[];
  readonly timestamp: string;
  readonly replayHash: string;
}

export function listCanonicalSituationApiResponses(query: CanonicalSituationApiQuery = {}): CanonicalSituationApiResponse[] {
  const records = listCanonicalSituations({
    league: normalizeUpper(query.league),
    sport: query.sport?.toLowerCase(),
    situation_type: query.situationType,
    state: query.lifecycleState,
    active_only: query.activeOnly,
    order_by: query.orderBy === "operational_visibility_score" ? "updated_at" : query.orderBy,
    limit: query.orderBy === "operational_visibility_score" ? 1000 : query.limit,
  });

  if (records.length === 0) return [];

  const comparableCorpus = buildComparableSituationCorpus();
  const mapped = records.map((record) => mapCanonicalSituationToApiResponse(record, comparableCorpus));
  const sorted = sortCanonicalSituationApiResponses(mapped, query.orderBy ?? "updated_at");
  return sorted.slice(0, sanitizeLimit(query.limit));
}

export function mapCanonicalSituationToApiResponse(
  record: CanonicalSituationRecord,
  comparableCorpus: readonly ComparableSituationCorpusRecord[] = buildComparableSituationCorpus(),
): CanonicalSituationApiResponse {
  const snapshot = record.latest_snapshot;
  const events = listSituationEvents(record.situation_id);
  const stateHistory = listSituationStateHistory(record.situation_id);
  const confidenceHistory = listSituationConfidenceHistory(record.situation_id);
  const rawConfidence = snapshot?.confidence.score ?? 0;
  const lifecycleState = snapshot?.lifecycle_state ?? "watching";
  const hasOfficialConfirmation = (snapshot?.confidence.factors?.official_confirmation ?? 0) > 0;
  const hasContradiction = (snapshot?.confidence.factors?.contradiction_penalty ?? 0) < 0;
  const confidence = lifecycleState === "official" ||
    (lifecycleState === "confirmed" && hasOfficialConfirmation && !hasContradiction)
    ? 100
    : rawConfidence;
  const escalationScore = snapshot?.escalation_score ?? 0;
  const latestEvidence = mapLatestEvidence(events, confidenceHistory);
  const sourceCount = new Set(events.map((event) => event.source_id).filter(Boolean)).size;
  const calibrationSourceCount = new Set(events
    .filter((event) => event.payload.normalized_event)
    .map((event) => event.source_id)
    .filter(Boolean)).size;
  const lastUpdatedAt = snapshot?.created_at ?? record.created_at;
  const publicConfirmation = getSituationPublicConfirmation(record.situation_id);
  const historicalCalibration = deriveSituationHistoricalCalibration({
    record,
    snapshot,
    events,
    confidenceHistory,
    sourceCount: calibrationSourceCount,
    comparableSummary: comparableSummaryFor(record, events, stateHistory, comparableCorpus),
  });
  const operationalVisibilityScore = computeOperationalVisibilityScore({
    confidence,
    escalationScore,
    lifecycleState,
    evidenceCount: events.length,
    sourceCount,
    timingPressure: snapshot?.timing_pressure ?? "inactive",
  });

  return {
    id: record.situation_id,
    title: buildSituationTitle(record),
    summary: snapshot?.summary ?? record.semantic_fingerprint,
    sport: record.sport,
    league: record.league,
    teams: [...record.teams],
    players: [...record.players],
    situationType: record.situation_type,
    lifecycleState,
    lifecycleExplanation: explainLifecycleState(lifecycleState),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    confidenceFactors: explainConfidenceFactors(snapshot?.confidence.factors ?? emptyFactors(), confidenceHistory),
    severity: severityLabel(escalationScore),
    escalationScore,
    timingPressure: snapshot?.timing_pressure ?? "inactive",
    operationalVisibilityScore,
    lastUpdatedAt,
    firstSeenAt: record.created_at,
    publicConfirmation: publicConfirmation?.confirmed_at,
    detectionLeadMinutes: publicConfirmation?.detection_lead_minutes,
    publicConfirmationSource: publicConfirmation?.source_name,
    evidenceCount: events.length,
    sourceCount,
    latestEvidence,
    stateHistoryPreview: [...stateHistory]
      .sort((left, right) => compareDesc(left.created_at, right.created_at, left.history_id, right.history_id))
      .slice(0, 5)
      .map(mapStateHistoryPreview),
    confidenceHistoryPreview: [...confidenceHistory]
      .sort((left, right) => compareDesc(left.created_at, right.created_at, left.history_id, right.history_id))
      .slice(0, 5)
      .map(mapConfidenceHistoryPreview),
    replayHash: snapshot?.replay_hash ?? record.canonical_hash,
    ...historicalCalibration,
  };
}

export function explainConfidenceFactors(
  factors: SituationConfidenceFactorBreakdown,
  history: readonly SituationConfidenceHistory[] = [],
): CanonicalSituationConfidenceFactors {
  const latest = [...history].sort((left, right) => compareDesc(left.created_at, right.created_at, left.history_id, right.history_id))[0];
  const delta = latest && latest.previous_confidence != null
    ? latest.new_confidence - latest.previous_confidence
    : null;
  const increased: string[] = [];
  const decreased: string[] = [];
  const matters: string[] = [];
  const uncertain: string[] = [];

  if (delta != null && delta > 0) increased.push(`Confidence increased by ${Math.round(delta)} points as newer evidence strengthened the read.`);
  if (factors.official_confirmation > 0) increased.push("Official confirmation is now part of the evidence set.");
  if (factors.independent_confirmations >= 10) increased.push("Independent confirmations support the same situation.");
  if (factors.market_alignment >= 8) increased.push("Market movement aligns with the reported development.");
  if (factors.validator_agreement >= 8) increased.push("Validator agreement supports the current read.");

  if (delta != null && delta < 0) decreased.push(`Confidence decreased by ${Math.abs(Math.round(delta))} points after the latest evidence update.`);
  if (factors.contradiction_penalty > 0) decreased.push("Contradictory evidence is applying an explicit penalty.");
  if (factors.freshness < 4) decreased.push("Freshness is weak, so the confidence score is restrained.");

  if (factors.source_reliability >= 14) matters.push("Reliable source quality is a meaningful contributor.");
  if (factors.independent_confirmations >= 10) matters.push("Cross-source confirmation is materially supporting confidence.");
  if (factors.market_alignment >= 8) matters.push("Aligned market movement is relevant evidence.");
  if (matters.length === 0) matters.push("The current read depends on a limited evidence set.");

  if (factors.independent_confirmations < 10) uncertain.push("Independent confirmation is still limited.");
  if (factors.validator_agreement < 8) uncertain.push("Validator agreement is not yet strong enough to close the loop.");
  if (factors.contradiction_penalty > 0) uncertain.push("Contradictory evidence still needs resolution.");
  if (uncertain.length === 0) uncertain.push("Remaining uncertainty is low relative to the current evidence.");

  return {
    scores: factors,
    whyConfidenceIncreased: increased.length ? increased : ["No material positive confidence movement is present in the latest history."],
    whyConfidenceDecreased: decreased.length ? decreased : ["No material negative confidence movement is present in the latest history."],
    evidenceThatMattersMost: matters,
    whatRemainsUncertain: uncertain,
  };
}

export function explainLifecycleState(state: SituationLifecycleState): string {
  const explanations: Record<SituationLifecycleState, string> = {
    watching: "Monitor only; evidence is not strong enough to elevate.",
    emerging: "Early evidence is forming and should be tracked for confirmation.",
    developing: "Multiple inputs are active, but the situation is still changing.",
    escalating: "Operational attention is warranted because evidence and timing pressure are rising.",
    confirmed: "The situation is supported strongly enough to treat as confirmed.",
    official: "An official source or resolution has closed the verification loop.",
    cooling: "The situation is losing immediacy but remains useful context.",
    resolved: "The situation reached an end state and should not drive new board urgency.",
    archived: "Historical record only; keep it available for replay and audit.",
    invalidated: "The situation was contradicted or failed validation and should not be surfaced as active.",
  };
  return explanations[state];
}

function mapLatestEvidence(
  events: readonly SituationEvent[],
  confidenceHistory: readonly SituationConfidenceHistory[],
): CanonicalSituationEvidencePreview[] {
  const confidenceByEvent = new Map(confidenceHistory.map((item) => [item.event_id, item]));
  return [...events]
    .sort((left, right) => compareDesc(left.recorded_at, right.recorded_at, left.event_id, right.event_id))
    .slice(0, 5)
    .map((event) => {
      const normalizedEvent = event.payload.normalized_event as Record<string, any> | undefined;
      const confidence = confidenceByEvent.get(event.event_id);
      const delta = confidence && confidence.previous_confidence != null
        ? confidence.new_confidence - confidence.previous_confidence
        : null;
      return {
        eventType: String(normalizedEvent?.event_type ?? event.kind),
        sourceType: normalizedEvent?.source_type ? String(normalizedEvent.source_type) : null,
        timestamp: event.recorded_at,
        confidenceDelta: delta,
        marketImpact: summarizeMarketImpact(normalizedEvent?.market_context),
        validatorAgreement: summarizeValidatorAgreement(normalizedEvent, confidence?.factor_breakdown.validator_agreement),
        summary: String(normalizedEvent?.summary ?? event.payload.summary ?? event.kind),
        replayHash: event.replay_hash,
      };
    });
}

function mapStateHistoryPreview(history: SituationStateHistory): CanonicalSituationStateHistoryPreview {
  return {
    previousState: history.previous_state,
    newState: history.new_state,
    reason: history.transition_reason,
    timestamp: history.created_at,
    replayHash: history.replay_hash,
  };
}

function mapConfidenceHistoryPreview(history: SituationConfidenceHistory): CanonicalSituationConfidenceHistoryPreview {
  return {
    previousConfidence: history.previous_confidence,
    newConfidence: history.new_confidence,
    delta: history.previous_confidence == null ? null : history.new_confidence - history.previous_confidence,
    reasons: [...history.reasoning],
    timestamp: history.created_at,
    replayHash: history.replay_hash,
  };
}

function comparableSummaryFor(
  record: CanonicalSituationRecord,
  events: readonly SituationEvent[],
  stateHistory: readonly SituationStateHistory[],
  comparableCorpus: readonly ComparableSituationCorpusRecord[],
) {
  const target = buildComparableSituationCorpusRecord({ record, events, stateHistory });
  return matchComparableSituations({ target, corpus: comparableCorpus });
}

function computeOperationalVisibilityScore(input: {
  readonly confidence: number;
  readonly escalationScore: number;
  readonly lifecycleState: SituationLifecycleState;
  readonly evidenceCount: number;
  readonly sourceCount: number;
  readonly timingPressure: SituationSnapshot["timing_pressure"];
}): number {
  const lifecycleWeight: Record<SituationLifecycleState, number> = {
    watching: 4,
    emerging: 10,
    developing: 16,
    escalating: 24,
    confirmed: 20,
    official: 16,
    cooling: 6,
    resolved: 0,
    archived: 0,
    invalidated: 0,
  };
  const timingWeight: Record<SituationSnapshot["timing_pressure"], number> = {
    inactive: 0,
    low: 3,
    medium: 7,
    high: 11,
    critical: 14,
  };
  const score =
    input.confidence * 0.34 +
    input.escalationScore * 0.34 +
    lifecycleWeight[input.lifecycleState] +
    timingWeight[input.timingPressure] +
    Math.min(8, input.evidenceCount * 1.5) +
    Math.min(6, input.sourceCount * 2);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function sortCanonicalSituationApiResponses(
  situations: readonly CanonicalSituationApiResponse[],
  orderBy: CanonicalSituationOrderBy,
): CanonicalSituationApiResponse[] {
  return [...situations].sort((left, right) => {
    const primary =
      orderBy === "operational_visibility_score"
        ? right.operationalVisibilityScore - left.operationalVisibilityScore
        : orderBy === "escalation_score"
          ? right.escalationScore - left.escalationScore
          : orderBy === "confidence"
            ? right.confidence - left.confidence
            : compareDesc(left.lastUpdatedAt, right.lastUpdatedAt, left.id, right.id);
    return primary ||
      compareDesc(left.lastUpdatedAt, right.lastUpdatedAt, left.id, right.id) ||
      left.id.localeCompare(right.id);
  });
}

function buildSituationTitle(record: CanonicalSituationRecord): string {
  const subject = record.players[0] ?? record.teams.join(" / ") ?? record.league;
  const type = record.situation_type.replace(/_/g, " ");
  return `${subject} ${type}`.trim();
}

function summarizeMarketImpact(marketContext: any): string | null {
  if (!marketContext || typeof marketContext !== "object") return null;
  const market = marketContext.market ? String(marketContext.market) : "market";
  const delta = Number(marketContext.delta);
  if (!Number.isFinite(delta) || delta === 0) return `${market} context attached without material movement`;
  const direction = marketContext.direction ? String(marketContext.direction) : delta > 0 ? "up" : "down";
  return `${market} moved ${Math.abs(delta)} ${direction}`;
}

function summarizeValidatorAgreement(normalizedEvent: Record<string, any> | undefined, score: number | undefined): string | null {
  if (normalizedEvent?.source_type === "validator") return "Validator evidence attached";
  if (typeof score === "number" && score >= 8) return "Validator agreement supports the read";
  if (typeof score === "number" && score > 0) return "Validator agreement is partial";
  return null;
}

function confidenceLabel(score: number): string {
  if (score >= 85) return "very high";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  if (score >= 30) return "low";
  return "watch";
}

function severityLabel(escalationScore: number): CanonicalSituationApiResponse["severity"] {
  if (escalationScore >= 85) return "critical";
  if (escalationScore >= 70) return "high";
  if (escalationScore >= 40) return "medium";
  return "low";
}

function emptyFactors(): SituationConfidenceFactorBreakdown {
  return {
    source_reliability: 0,
    independent_confirmations: 0,
    market_alignment: 0,
    validator_agreement: 0,
    official_confirmation: 0,
    freshness: 0,
    contradiction_penalty: 0,
  };
}

function compareDesc(leftTimestamp: string, rightTimestamp: string, leftId: string, rightId: string): number {
  return rightTimestamp.localeCompare(leftTimestamp) || leftId.localeCompare(rightId);
}

function normalizeUpper(value: string | undefined): string | undefined {
  return value ? value.toUpperCase() : undefined;
}

function sanitizeLimit(limit: number | undefined): number {
  if (limit == null) return 100;
  if (!Number.isFinite(limit)) return 100;
  return Math.max(0, Math.min(Math.floor(limit), 250));
}

export function isActiveLifecycleState(state: SituationLifecycleState | string | null | undefined): boolean {
  return ACTIVE_LIFECYCLE_STATES.has(state as SituationLifecycleState);
}
