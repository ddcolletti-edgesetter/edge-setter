import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "./queryClient";
import type { Sport } from "./leagueModifiers";

const REFRESH_MS = 60_000;

export type CanonicalSituationLifecycleState =
  | "watching"
  | "emerging"
  | "developing"
  | "escalating"
  | "confirmed"
  | "official"
  | "cooling"
  | "resolved"
  | "archived"
  | "invalidated";

export type CanonicalSituationOrderBy =
  | "operational_visibility_score"
  | "escalation_score"
  | "confidence"
  | "updated_at";

export interface CanonicalSituationConfidenceFactors {
  scores: {
    source_reliability: number;
    independent_confirmations: number;
    market_alignment: number;
    validator_agreement: number;
    official_confirmation: number;
    freshness: number;
    contradiction_penalty: number;
  };
  whyConfidenceIncreased: string[];
  whyConfidenceDecreased: string[];
  evidenceThatMattersMost: string[];
  whatRemainsUncertain: string[];
}

export interface CanonicalSituationEvidencePreview {
  eventType: string;
  sourceType: string | null;
  timestamp: string;
  confidenceDelta: number | null;
  marketImpact: string | null;
  validatorAgreement: string | null;
  summary: string;
  replayHash: string;
}

export interface CanonicalSituationStateHistoryPreview {
  previousState: CanonicalSituationLifecycleState | null;
  newState: CanonicalSituationLifecycleState;
  reason: string;
  timestamp: string;
  replayHash: string;
}

export interface CanonicalSituationConfidenceHistoryPreview {
  previousConfidence: number | null;
  newConfidence: number;
  delta: number | null;
  reasons: string[];
  timestamp: string;
  replayHash: string;
}

export interface CanonicalSituation {
  id: string;
  title: string;
  summary: string;
  sport: string;
  league: Sport;
  teams: string[];
  players: string[];
  situationType: string;
  lifecycleState: CanonicalSituationLifecycleState;
  lifecycleExplanation: string;
  confidence: number;
  confidenceLabel: string;
  confidenceFactors: CanonicalSituationConfidenceFactors;
  severity: "low" | "medium" | "high" | "critical";
  escalationScore: number;
  timingPressure: "inactive" | "low" | "medium" | "high" | "critical";
  operationalVisibilityScore: number;
  lastUpdatedAt: string;
  firstSeenAt: string;
  publicConfirmation?: string;
  detectionLeadMinutes?: number;
  publicConfirmationSource?: string;
  evidenceCount: number;
  sourceCount: number;
  latestEvidence: CanonicalSituationEvidencePreview[];
  stateHistoryPreview: CanonicalSituationStateHistoryPreview[];
  confidenceHistoryPreview: CanonicalSituationConfidenceHistoryPreview[];
  replayHash: string;
  historicalPatternLabel?: string;
  historicalPatternConfidence?: string;
  historicalPatternBasis?: string[];
  comparableStoryType?: string;
  sourceTimingProfile?: string;
  sourceReliabilityBasis?: string;
  marketReactionWindow?: string;
  confirmationSignals?: string[];
  weakeningSignals?: string[];
  calibrationSummary?: string;
  calibrationLimitations?: string[];
}

export interface FetchCanonicalSituationsOptions {
  league?: Sport;
  sport?: string;
  situationType?: string;
  lifecycleState?: CanonicalSituationLifecycleState;
  activeOnly?: boolean;
  limit?: number;
  orderBy?: CanonicalSituationOrderBy;
  poll?: boolean;
}

interface CanonicalSituationsResponse {
  count: number;
  situations: CanonicalSituation[];
}

export async function fetchCanonicalSituations(options: FetchCanonicalSituationsOptions = {}): Promise<CanonicalSituation[]> {
  const params = new URLSearchParams();
  if (options.league) params.set("league", options.league);
  if (options.sport) params.set("sport", options.sport);
  if (options.situationType) params.set("situationType", options.situationType);
  if (options.lifecycleState) params.set("lifecycle_state", options.lifecycleState);
  if (options.activeOnly) params.set("activeOnly", "true");
  params.set("limit", String(options.limit ?? 100));
  params.set("orderBy", options.orderBy ?? "operational_visibility_score");

  const res = await apiRequest("GET", `/api/v2/situations?${params.toString()}`);
  const data = (await res.json()) as CanonicalSituationsResponse;
  return rankCanonicalSituations(data.situations ?? [], options.orderBy ?? "operational_visibility_score");
}

export function useCanonicalSituations(options: FetchCanonicalSituationsOptions = {}) {
  const stableOptions = useMemo(() => options, [
    options.league,
    options.sport,
    options.situationType,
    options.lifecycleState,
    options.activeOnly,
    options.limit,
    options.orderBy,
    options.poll,
  ]);
  const [situations, setSituations] = useState<CanonicalSituation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchCanonicalSituations(stableOptions);
      setSituations(next);
      setIsLive(next.length > 0);
      setError(null);
    } catch {
      setSituations([]);
      setIsLive(false);
      setError("Canonical situations unavailable; using existing signal feed.");
    } finally {
      setLoading(false);
    }
  }, [stableOptions]);

  useEffect(() => {
    refresh();
    if (stableOptions.poll !== false) timerRef.current = setInterval(refresh, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  return { situations, loading, isLive, error, refresh };
}

export function filterCanonicalSituations(
  situations: readonly CanonicalSituation[],
  filters: {
    league?: Sport;
    situationType?: string | null;
    lifecycleState?: CanonicalSituationLifecycleState | null;
    activeOnly?: boolean;
  },
): CanonicalSituation[] {
  return situations.filter((situation) =>
    (!filters.league || situation.league === filters.league) &&
    (!filters.situationType || normalizeSituationType(situation.situationType) === normalizeSituationType(filters.situationType)) &&
    (!filters.lifecycleState || situation.lifecycleState === filters.lifecycleState) &&
    (!filters.activeOnly || isActiveCanonicalSituation(situation)),
  );
}

export function rankCanonicalSituations(
  situations: readonly CanonicalSituation[],
  orderBy: CanonicalSituationOrderBy = "operational_visibility_score",
): CanonicalSituation[] {
  return [...situations].sort((left, right) => {
    const primary =
      orderBy === "confidence"
        ? right.confidence - left.confidence
        : orderBy === "escalation_score"
          ? right.escalationScore - left.escalationScore
          : orderBy === "updated_at"
            ? right.lastUpdatedAt.localeCompare(left.lastUpdatedAt)
            : right.operationalVisibilityScore - left.operationalVisibilityScore;
    return primary ||
      right.lastUpdatedAt.localeCompare(left.lastUpdatedAt) ||
      left.id.localeCompare(right.id);
  });
}

export function isActiveCanonicalSituation(situation: CanonicalSituation) {
  return !["resolved", "archived", "invalidated"].includes(situation.lifecycleState);
}

export function isCoolingCanonicalSituation(situation: CanonicalSituation) {
  return ["cooling", "resolved", "archived", "invalidated"].includes(situation.lifecycleState);
}

export function canonicalLifecycleLabel(state: CanonicalSituationLifecycleState) {
  const labels: Record<CanonicalSituationLifecycleState, string> = {
    watching: "Watching",
    emerging: "Emerging",
    developing: "Developing",
    escalating: "Escalating",
    confirmed: "Confirmed",
    official: "Official",
    cooling: "Cooling",
    resolved: "Resolved",
    archived: "Archived",
    invalidated: "Invalidated",
  };
  return labels[state];
}

export function canonicalOperationalState(state: CanonicalSituationLifecycleState) {
  if (state === "watching" || state === "emerging") return "monitoring";
  if (state === "developing") return "developing";
  if (state === "escalating") return "escalated";
  if (state === "confirmed") return "verified";
  if (state === "official") return "official";
  return "cooling";
}

export function canonicalConfidenceSummary(situation: CanonicalSituation) {
  const support = situation.confidenceFactors.evidenceThatMattersMost[0];
  const uncertainty = situation.confidenceFactors.whatRemainsUncertain[0];
  return [support, uncertainty].filter(Boolean).join(" / ") || situation.lifecycleExplanation;
}

export function canonicalEvidenceSummary(situation: CanonicalSituation) {
  const latest = situation.latestEvidence.find((event) => event.summary) ?? situation.latestEvidence[0];
  if (!latest) return `${situation.evidenceCount} evidence events tracked`;
  return latest.summary;
}

export function canonicalUncertaintySummary(situation: CanonicalSituation) {
  return situation.confidenceFactors.whatRemainsUncertain[0] ?? "No major uncertainty called out.";
}

export function normalizeSituationType(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/_/g, " ").trim();
}
