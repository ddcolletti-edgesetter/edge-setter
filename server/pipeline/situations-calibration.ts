import type {
  ComparableSituationMatchSummary,
  SituationConfidenceHistory,
  SituationEvent,
  SituationHistoricalCalibrationFields,
  SituationSnapshot,
  SituationType,
} from "./situations-contract";
import type { CanonicalSituationRecord } from "./situations-store";

export function deriveSituationHistoricalCalibration(input: {
  readonly record: CanonicalSituationRecord;
  readonly snapshot: SituationSnapshot | null;
  readonly events: readonly SituationEvent[];
  readonly confidenceHistory: readonly SituationConfidenceHistory[];
  readonly sourceCount: number;
  readonly comparableSummary?: ComparableSituationMatchSummary;
}): SituationHistoricalCalibrationFields {
  const factors = input.snapshot?.confidence.factors;
  const normalizedEvents = input.events
    .map((event) => event.payload.normalized_event)
    .filter((event): event is Record<string, any> => Boolean(event) && typeof event === "object");
  const marketContexts = normalizedEvents
    .map((event) => event.market_context)
    .filter((context): context is Record<string, any> => Boolean(context) && typeof context === "object");
  const evidenceCount = normalizedEvents.length;
  const maxMarketDelta = maxAbs(marketContexts.map((context) => Number(context.delta)));
  const officialSupport = (factors?.official_confirmation ?? 0) > 0;
  const contradictionPresent = (factors?.contradiction_penalty ?? 0) > 0;
  const latestDelta = latestConfidenceDelta(input.confidenceHistory);
  const confidenceTier = patternConfidence({
    sourceCount: input.sourceCount,
    evidenceCount,
    officialSupport,
    marketAligned: (factors?.market_alignment ?? 0) >= 8 || maxMarketDelta >= 1,
    contradictionPresent,
    comparableSupport: input.comparableSummary?.support_level,
  });

  return {
    historicalPatternLabel: patternLabel(confidenceTier, input.record.situation_type, maxMarketDelta, input.comparableSummary),
    historicalPatternConfidence: confidenceTier,
    historicalPatternBasis: patternBasis({
      factors,
      sourceCount: input.sourceCount,
      evidenceCount,
      marketContexts,
      lifecycleState: input.snapshot?.lifecycle_state ?? null,
      comparableSummary: input.comparableSummary,
    }),
    comparableStoryType: comparableStoryType(input.record.situation_type, input.record.league, marketContexts.length > 0),
    sourceTimingProfile: sourceTimingProfile(normalizedEvents),
    sourceReliabilityBasis: sourceReliabilityBasis(factors?.source_reliability ?? 0, input.sourceCount),
    marketReactionWindow: marketReactionWindow(normalizedEvents, marketContexts),
    confirmationSignals: confirmationSignals({
      factors,
      sourceCount: input.sourceCount,
      maxMarketDelta,
      lifecycleState: input.snapshot?.lifecycle_state ?? null,
      latestDelta,
    }),
    weakeningSignals: weakeningSignals({
      factors,
      sourceCount: input.sourceCount,
      evidenceCount,
      latestDelta,
      contradictionPresent,
      hasMarketContext: marketContexts.length > 0,
    }),
    calibrationSummary: calibrationSummary(confidenceTier, input.record.situation_type, input.snapshot?.lifecycle_state ?? null, input.comparableSummary),
    calibrationLimitations: calibrationLimitations({
      evidenceCount,
      sourceCount: input.sourceCount,
      hasMarketContext: marketContexts.length > 0,
      officialSupport,
      contradictionPresent,
      comparableSummary: input.comparableSummary,
    }),
  };
}

function patternConfidence(input: {
  readonly sourceCount: number;
  readonly evidenceCount: number;
  readonly officialSupport: boolean;
  readonly marketAligned: boolean;
  readonly contradictionPresent: boolean;
  readonly comparableSupport?: ComparableSituationMatchSummary["support_level"];
}): SituationHistoricalCalibrationFields["historicalPatternConfidence"] {
  if (input.contradictionPresent || input.evidenceCount <= 1) return "limited";
  if (input.comparableSupport === "strong" && input.officialSupport && input.marketAligned) return "strong";
  if (input.comparableSupport === "moderate" || input.comparableSupport === "strong") return "moderate";
  if (input.officialSupport && input.sourceCount >= 2 && input.marketAligned) return "strong";
  if (input.sourceCount >= 2 || input.marketAligned || input.officialSupport) return "moderate";
  return "limited";
}

function patternLabel(
  confidence: SituationHistoricalCalibrationFields["historicalPatternConfidence"],
  situationType: SituationType,
  maxMarketDelta: number,
  comparableSummary: ComparableSituationMatchSummary | undefined,
): string {
  const subject = situationType.replace(/_/g, " ");
  if (comparableSummary?.support_level === "moderate" || comparableSummary?.support_level === "strong") {
    return `${subject} comparable corpus pattern support`;
  }
  if (confidence === "strong") return `${subject} pattern support with comparable movement`;
  if (confidence === "moderate" && maxMarketDelta > 0) return `${subject} pattern support with early market reaction`;
  if (confidence === "moderate") return `${subject} pattern support developing`;
  return `${subject} limited sample pattern`;
}

function patternBasis(input: {
  readonly factors: SituationSnapshot["confidence"]["factors"] | undefined;
  readonly sourceCount: number;
  readonly evidenceCount: number;
  readonly marketContexts: readonly Record<string, any>[];
  readonly lifecycleState: SituationSnapshot["lifecycle_state"] | null;
  readonly comparableSummary?: ComparableSituationMatchSummary;
}): string[] {
  const basis: string[] = [];
  if (input.sourceCount >= 2) basis.push("Multiple source IDs are attached to the situation.");
  else basis.push("Pattern support is limited by a small source set.");
  if ((input.factors?.independent_confirmations ?? 0) >= 10) basis.push("Independent confirmation contributes to the current confidence score.");
  if ((input.factors?.market_alignment ?? 0) >= 8 || input.marketContexts.length > 0) basis.push("Comparable movement is present where market context is attached.");
  if ((input.factors?.official_confirmation ?? 0) > 0) basis.push("Official or validator-quality confirmation is part of the evidence mix.");
  if (input.lifecycleState) basis.push(`Lifecycle state is ${input.lifecycleState}, so calibration remains tied to current verification status.`);
  if (input.evidenceCount <= 1) basis.push("Limited sample: only one evidence event is available.");
  if (input.comparableSummary) basis.push(...input.comparableSummary.basis);
  return unique(basis);
}

function comparableStoryType(situationType: SituationType, league: string, hasMarketContext: boolean): string {
  const market = hasMarketContext ? " with market reaction" : " without confirmed market reaction";
  return `${league} ${situationType.replace(/_/g, " ")} story${market}`;
}

function sourceTimingProfile(events: readonly Record<string, any>[]): string {
  const latencies = events
    .map((event) => minutesBetween(String(event.occurred_at ?? ""), String(event.received_at ?? "")))
    .filter((value): value is number => value != null);
  if (latencies.length === 0) return "Source timing compared where available; event timing is not complete enough for a timing read.";
  const median = latencies.slice().sort((a, b) => a - b)[Math.floor(latencies.length / 2)];
  if (median <= 5) return `Source timing compared where available: median receipt lag is ${median} minutes.`;
  if (median <= 60) return `Source timing compared where available: median receipt lag is ${median} minutes, so timing support is usable but not immediate.`;
  return `Source timing compared where available: median receipt lag is ${median} minutes, so timing support is limited.`;
}

function sourceReliabilityBasis(sourceReliability: number, sourceCount: number): string {
  if (sourceCount === 0) return "Source reliability basis is pending because no source IDs are attached.";
  if (sourceReliability >= 14) return "Source reliability basis comes from the existing source reliability factor and cross-source support.";
  if (sourceReliability > 0) return "Source reliability basis is present but limited by current source depth.";
  return "Source reliability basis is pending because reliability factors are not populated yet.";
}

function marketReactionWindow(
  events: readonly Record<string, any>[],
  marketContexts: readonly Record<string, any>[],
): string {
  if (marketContexts.length === 0) return "No market reaction window attached yet.";
  const firstEvidenceAt = earliest(events.map((event) => String(event.received_at ?? "")));
  const firstMarketAt = earliest(events.filter((event) => event.market_context).map((event) => String(event.received_at ?? "")));
  const delta = firstEvidenceAt && firstMarketAt ? minutesBetween(firstEvidenceAt, firstMarketAt) : null;
  if (delta == null) return "Comparable movement is attached, but timing is incomplete.";
  if (delta === 0) return "Comparable movement is attached in the same evidence window.";
  return `Comparable movement appeared ${delta} minutes after first attached evidence.`;
}

function confirmationSignals(input: {
  readonly factors: SituationSnapshot["confidence"]["factors"] | undefined;
  readonly sourceCount: number;
  readonly maxMarketDelta: number;
  readonly lifecycleState: SituationSnapshot["lifecycle_state"] | null;
  readonly latestDelta: number | null;
}): string[] {
  const signals: string[] = [];
  if (input.sourceCount >= 2) signals.push("cross-source support");
  if ((input.factors?.official_confirmation ?? 0) > 0) signals.push("official confirmation attached");
  if ((input.factors?.validator_agreement ?? 0) >= 8) signals.push("validator agreement support");
  if ((input.factors?.market_alignment ?? 0) >= 8 || input.maxMarketDelta >= 1) signals.push("comparable movement present");
  if (input.latestDelta != null && input.latestDelta > 0) signals.push("confidence increased on latest evidence");
  if (input.lifecycleState === "confirmed" || input.lifecycleState === "official") signals.push(`${input.lifecycleState} lifecycle state`);
  return signals.length ? signals : ["confirmation pending"];
}

function weakeningSignals(input: {
  readonly factors: SituationSnapshot["confidence"]["factors"] | undefined;
  readonly sourceCount: number;
  readonly evidenceCount: number;
  readonly latestDelta: number | null;
  readonly contradictionPresent: boolean;
  readonly hasMarketContext: boolean;
}): string[] {
  const signals: string[] = [];
  if (input.sourceCount < 2) signals.push("limited source depth");
  if (input.evidenceCount <= 1) signals.push("limited sample");
  if ((input.factors?.freshness ?? 0) < 4) signals.push("freshness is weak");
  if (!input.hasMarketContext) signals.push("pending market reaction");
  if (input.latestDelta != null && input.latestDelta < 0) signals.push("confidence weakened on latest evidence");
  if (input.contradictionPresent) signals.push("contradictory evidence present");
  return signals.length ? signals : ["no material weakening signal from current factors"];
}

function calibrationSummary(
  confidence: SituationHistoricalCalibrationFields["historicalPatternConfidence"],
  situationType: SituationType,
  lifecycleState: SituationSnapshot["lifecycle_state"] | null,
  comparableSummary: ComparableSituationMatchSummary | undefined,
): string {
  const subject = situationType.replace(/_/g, " ");
  if (comparableSummary?.outcome_link_status === "clv_linked") {
    return `Historical calibration shows ${confidence} comparable replay pattern support for this ${subject} read; CLV-linked comparisons exist, but no CLV edge claim is emitted.`;
  }
  if (comparableSummary?.outcome_link_status === "outcome_linked") {
    return `Historical calibration shows ${confidence} comparable replay pattern support for this ${subject} read; outcome-linked comparison is available, but sample support remains qualitative.`;
  }
  if (comparableSummary?.outcome_link_status === "pending_outcome") {
    return `Historical calibration shows ${confidence} comparable replay pattern support for this ${subject} read; outcome calibration is still pending.`;
  }
  if (comparableSummary?.sample_status === "settled_sample_available") {
    return `Historical calibration shows ${confidence} comparable corpus support for this ${subject} read; settled samples are available but no exact accuracy rate is claimed here.`;
  }
  if (comparableSummary?.matches.length) {
    return `Historical calibration shows ${confidence} replay-derived comparable support for this ${subject} read; treat it as pattern context, not a settled accuracy claim.`;
  }
  if (confidence === "strong") return `Historical calibration shows strong pattern support for this ${subject} read, with outcome still tied to current lifecycle status.`;
  if (confidence === "moderate") return `Historical calibration shows moderate pattern support for this ${subject} read; treat it as comparable movement, not a settled accuracy claim.`;
  if (lifecycleState === "resolved" || lifecycleState === "archived") return `Historical calibration is limited for this ${subject} read and should be used as replay context.`;
  return `Historical calibration is limited for this ${subject} read; outcome and comparable movement support are still pending.`;
}

function calibrationLimitations(input: {
  readonly evidenceCount: number;
  readonly sourceCount: number;
  readonly hasMarketContext: boolean;
  readonly officialSupport: boolean;
  readonly contradictionPresent: boolean;
  readonly comparableSummary?: ComparableSituationMatchSummary;
}): string[] {
  const limitations: string[] = ["No exact win rate or prediction accuracy is claimed from these fields."];
  if (input.evidenceCount < 3) limitations.push("Limited sample: fewer than three evidence events are attached.");
  if (input.sourceCount < 2) limitations.push("Source timing and reliability are constrained by limited source depth.");
  if (!input.hasMarketContext) limitations.push("Market reaction is pending or not attached.");
  if (!input.officialSupport) limitations.push("Pending outcome: official confirmation is not attached yet.");
  if (input.contradictionPresent) limitations.push("Contradictory evidence limits calibration confidence.");
  if (input.comparableSummary) limitations.push(...input.comparableSummary.limitations);
  return unique(limitations);
}

function latestConfidenceDelta(history: readonly SituationConfidenceHistory[]): number | null {
  const latest = [...history].sort((left, right) => right.created_at.localeCompare(left.created_at) || left.history_id.localeCompare(right.history_id))[0];
  if (!latest || latest.previous_confidence == null) return null;
  return latest.new_confidence - latest.previous_confidence;
}

function minutesBetween(leftIso: string, rightIso: string): number | null {
  const left = Date.parse(leftIso);
  const right = Date.parse(rightIso);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.max(0, Math.round(Math.abs(right - left) / 60000));
}

function earliest(values: readonly string[]): string | null {
  return values.filter((value) => Number.isFinite(Date.parse(value))).sort()[0] ?? null;
}

function maxAbs(values: readonly number[]): number {
  return values.reduce((max, value) => Number.isFinite(value) ? Math.max(max, Math.abs(value)) : max, 0);
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
