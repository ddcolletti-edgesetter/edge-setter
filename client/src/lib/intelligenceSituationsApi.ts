import { apiRequest } from "./queryClient";
import { fetchSignals, type LiveSignal } from "./signalsApi";
import { publicGamesForLeague } from "./publicDisplayHygiene";
import { deriveVerificationState, evidenceFromLiveSignal, type VerificationStateResult } from "@shared/verification-state";

export type EscalationState =
  | "Monitoring"
  | "Emerging"
  | "Escalating"
  | "Significant"
  | "Confirming"
  | "Official";

export type TimingWindow = "Early" | "Developing" | "Widely Known" | "Closing" | "Stale";

export type IntelligenceSituation = {
  id: string;
  /** True when this row is a grouped rollup ("11 line moves") rather than a single signal. Grouped rows must never display a single confidence number — max-of-group against the pipeline's 92 cap produces a constant, not information. */
  isSummary?: boolean;
  league: LiveSignal["league"];
  gameId: string | null;
  signalType: string;
  headline: string;
  currentRead: string;
  whyItMatters: string;
  actionWindow: string;
  subject: {
    team: string | null;
    player: string | null;
    matchup: string | null;
  };
  escalationState: EscalationState;
  /**
   * Pre-computed public verification word ("Verified" / "Escalating" /
   * "Developing") from the shared evidence engine. Computed once in the mapper
   * and reused by both escalationState derivation and downstream display, so
   * every consumer sees the same evidence-grounded word rather than re-deriving
   * it (or falling back to a raw confidence number).
   */
  verification: VerificationStateResult;
  confidence: {
    current: number;
    previous: number | null;
    delta: number | null;
    explanation: string;
  };
  timing: {
    firstSeen: string;
    updatedAt: string;
    freshnessLabel: string;
    window: TimingWindow;
  };
  sources: Array<{
    name: string;
    type: string;
    status: string;
  }>;
  sourceSummary: {
    count: number;
    convergence: string;
  };
  validators: {
    label: string;
    agreement: string;
  };
  timeline: Array<{
    at: string;
    label: string;
    detail: string;
    confidence: number;
    state: EscalationState;
  }>;
  implications: string[];
  marketReaction: {
    open: string | null;
    current: string | null;
    delta: string | null;
    note: string | null;
  } | null;
  priority: number;
  raw: LiveSignal;
};

export type LiveGameSituation = {
  id: string;
  league: "NBA" | "MLB" | "NFL" | "CFB";
  homeTeam: string;
  awayTeam: string;
  gameTime: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  activeSituations: number;
  topEscalation: EscalationState | null;
};

type GamesResponse = {
  games?: Array<{
    id: number | string;
    league?: string | null;
    sport?: string | null;
    home_team?: string | null;
    away_team?: string | null;
    game_time?: string | null;
    status?: string | null;
    home_score?: number | null;
    away_score?: number | null;
    source_game_id?: string | null;
  }>;
};

const escalationRank: Record<EscalationState, number> = {
  Monitoring: 1,
  Emerging: 2,
  Escalating: 3,
  Significant: 4,
  Confirming: 5,
  Official: 6,
};

export async function fetchIntelligenceSituations(league?: string): Promise<IntelligenceSituation[]> {
  const signals = await fetchSignals(league);
  return adaptSignalsToSituations(signals).sort((a, b) => b.priority - a.priority);
}

export async function fetchLiveGamesForSituations(
  league: "NBA" | "MLB" | "NFL" | "CFB",
  situations: IntelligenceSituation[],
): Promise<LiveGameSituation[]> {
  const res = await apiRequest("GET", `/api/v2/games?league=${league}`);
  const data = (await res.json()) as GamesResponse;
  const games = publicGamesForLeague(data.games ?? [], league);

  return games.slice(0, 12).map((game) => {
    const id = String(game.id ?? game.source_game_id ?? "");
    const gameSituations = situations.filter((situation) => {
      if (situation.gameId && situation.gameId === id) return true;
      const text = `${game.home_team ?? ""} ${game.away_team ?? ""}`.toLowerCase();
      return Boolean(situation.subject.team && text.includes(situation.subject.team.toLowerCase()));
    });
    const topEscalation = gameSituations
      .map((situation) => situation.escalationState)
      .sort((a, b) => escalationRank[b] - escalationRank[a])[0] ?? null;

    return {
      id,
      league,
      homeTeam: game.home_team ?? "TBD",
      awayTeam: game.away_team ?? "TBD",
      gameTime: game.game_time ?? null,
      status: normalizeGameStatus(game.status),
      homeScore: game.home_score ?? null,
      awayScore: game.away_score ?? null,
      activeSituations: gameSituations.length,
      topEscalation,
    };
  });
}

export function adaptSignalsToSituations(
  signals: LiveSignal[],
  previousConfidenceById: Record<string, number | undefined> = {},
): IntelligenceSituation[] {
  const canonical = new Map<string, LiveSignal>();

  for (const signal of signals) {
    const key = canonicalSignalKey(signal);
    const current = canonical.get(key);
    if (!current || signalCredibilityRank(signal) > signalCredibilityRank(current)) {
      canonical.set(key, signal);
    }
  }

  return Array.from(canonical.values()).map((signal) => adaptSignalToSituation(signal, previousConfidenceById[signal.id]));
}

export function adaptSignalToSituation(
  signal: LiveSignal,
  previousConfidence?: number,
): IntelligenceSituation {
  // Compute the shared verification word ONCE, then reuse it for the
  // escalation-state mapping below and expose it on the situation so display
  // sites read the same evidence-grounded word instead of re-deriving it.
  const verification = deriveVerificationState(evidenceFromLiveSignal(signal));
  const escalationState = deriveEscalationState(signal, verification);
  const ageMinutes = ageInMinutes(signal.signal_time ?? signal.created_at ?? signal.updated_at);
  const timingWindow = deriveTimingWindow(ageMinutes, signal.verdict);
  const sources = signal.sources.map((source) => ({
    name: source.name,
    type: source.type,
    status: "Attached",
  }));
  const currentConfidence = clamp(Math.round(signal.confidence));
  const previous = typeof previousConfidence === "number" ? clamp(Math.round(previousConfidence)) : null;
  const delta = previous === null ? null : currentConfidence - previous;
  const marketReaction = signal.line_movement
    ? {
        open: String(signal.line_movement.open),
        current: String(signal.line_movement.current),
        delta: `${signal.line_movement.delta > 0 ? "+" : ""}${signal.line_movement.delta}`,
        note: `Market moved ${signal.line_movement.direction}`,
      }
    : null;

  return {
    id: signal.id,
    league: signal.league,
    gameId: signal.game_id,
    signalType: signal.signal_type,
    headline: signal.headline,
    currentRead: signal.body || signal.action_note || signal.headline,
    whyItMatters: signal.why_it_matters || "This situation can affect pricing, availability, roles, or game context before broad confirmation.",
    actionWindow: signal.action_note || timingActionWindow(timingWindow),
    subject: {
      team: signal.team,
      player: signal.player,
      matchup: signal.matchup,
    },
    escalationState,
    verification,
    confidence: {
      current: currentConfidence,
      previous,
      delta,
      explanation: confidenceExplanation(signal, currentConfidence, delta, verification),
    },
    timing: {
      firstSeen: signal.signal_time ?? signal.created_at,
      updatedAt: signal.updated_at,
      freshnessLabel: freshnessLabel(ageMinutes),
      window: timingWindow,
    },
    sources,
    sourceSummary: {
      count: signal.source_count,
      convergence: sourceConvergence(signal),
    },
    validators: {
      label: signal.trust_label || signal.confirmation_strength || "Verification pending",
      agreement: validatorAgreement(signal),
    },
    timeline: buildTimeline(signal, escalationState, currentConfidence),
    implications: buildImplications(signal),
    marketReaction,
    priority: situationPriority(signal, escalationState, timingWindow),
    raw: signal,
  };
}

/**
 * Escalation state for the live_signals lineage.
 *
 * The old numeric ladder (confidence >= 85 / >= 75 / >= 60) has been retired:
 * the verification decision now comes from the shared evidence engine
 * (deriveVerificationState via evidenceFromLiveSignal), so state is driven by
 * evidence — verdict, corroboration, official confirmation, market reaction —
 * never by a raw confidence number. The three-word result is mapped back onto
 * the existing six-value EscalationState enum so downstream ranking, timeline,
 * and priority consumers are unchanged.
 *
 * The verification result is computed once by the caller (adaptSignalToSituation)
 * and passed in, so a single situation never derives the shared word twice.
 */
function deriveEscalationState(signal: LiveSignal, verification: VerificationStateResult): EscalationState {
  const ageMinutes = ageInMinutes(signal.signal_time ?? signal.created_at ?? signal.updated_at);
  const official = /official/i.test(`${signal.verdict} ${signal.confirmation_strength}`);
  const { state } = verification;

  // Stale situations that never reached Verified fall back to Monitoring.
  if (state !== "Verified" && !official && ageMinutes !== null && ageMinutes > 1440) return "Monitoring";

  switch (state) {
    case "Verified":
      return official ? "Official" : "Confirming";
    case "Escalating":
      return signal.line_movement || signal.source_count >= 2 ? "Escalating" : "Emerging";
    default: // "Developing"
      return signal.source_count >= 2 ? "Emerging" : "Monitoring";
  }
}

function deriveTimingWindow(ageMinutes: number | null, _verdict: string): TimingWindow {
  if (ageMinutes === null) return "Developing";
  if (ageMinutes <= 45) return "Early";
  if (ageMinutes <= 180) return "Developing";
  if (ageMinutes <= 720) return "Widely Known";
  if (ageMinutes <= 1440) return "Closing";
  return "Stale";
}

function buildTimeline(signal: LiveSignal, state: EscalationState, confidence: number) {
  const timeline = [
    {
      at: signal.created_at,
      label: "Situation detected",
      detail: signal.headline,
      confidence: Math.max(20, confidence - 10),
      state: "Monitoring" as EscalationState,
    },
  ];

  if (signal.source_count > 0) {
    timeline.push({
      at: signal.signal_time ?? signal.created_at,
      label: "Source chain attached",
      detail: `${signal.source_count} source ${signal.source_count === 1 ? "check" : "checks"} connected to this situation.`,
      confidence: Math.max(30, confidence - 5),
      state: signal.source_count > 1 ? "Emerging" : "Monitoring",
    });
  }

  if (signal.line_movement) {
    timeline.push({
      at: signal.updated_at,
      label: "Market reaction detected",
      detail: `Line moved ${signal.line_movement.delta > 0 ? "+" : ""}${signal.line_movement.delta}.`,
      confidence,
      state: "Escalating",
    });
  }

  timeline.push({
    at: signal.updated_at,
    label: `${state} read`,
    detail: signal.score_explanation || signal.urgency_reason || signal.action_note || "Current verification state updated.",
    confidence,
    state,
  });

  return timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function sourceConvergence(signal: LiveSignal) {
  const confirmation = signal.confirmation_strength.toLowerCase();
  if (confirmation.includes("official")) return "Official source";
  if (confirmation.includes("consensus") || confirmation.includes("confirmed")) return "Confirmed source chain";
  if (confirmation.includes("corroborated") || signal.source_count >= 2) return "Corroborated";
  if (signal.source_count === 1) return "Single source";
  return "Awaiting confirmed source";
}

function validatorAgreement(signal: LiveSignal) {
  const label = signal.confirmation_strength || signal.trust_label;
  if (!label) return "Validator agreement pending";
  if (signal.breakdown?.sourceQualityScore >= 70) return `${label} with strong source quality`;
  return label;
}

function confidenceExplanation(
  signal: LiveSignal,
  confidence: number,
  delta: number | null,
  verification: VerificationStateResult,
) {
  const movement = delta === null ? "Initial live read" : delta > 0 ? `Up ${delta} points` : delta < 0 ? `Down ${Math.abs(delta)} points` : "Holding steady";
  const drivers = [
    signal.source_count ? `${signal.source_count} source checks` : null,
    signal.confirmation_strength ? signal.confirmation_strength : null,
    signal.line_movement ? "context shift" : null,
    signal.urgency_reason || null,
  ].filter(Boolean);
  // Behind the homepage flag, lead with the shared verification word instead of
  // leaking the raw confidence percentage. Read at call time (not module scope)
  // so vi.stubEnv toggles are observed per call. Flag off = legacy string.
  const verificationStateEnabled = import.meta.env.VITE_VERIFICATION_STATE_HOMEPAGE === "true";
  const readout = verificationStateEnabled ? `${movement} — ${verification.state}` : `${movement} at ${confidence}%`;
  return `${readout}. ${drivers.join(" / ") || "Verification context is still building."}`;
}

function buildImplications(signal: LiveSignal) {
  const implications = [
    signal.betting_relevance ? "Pricing or line context may change." : null,
    signal.fantasy_relevance ? "Role, usage, or availability context may change." : null,
    signal.injury_designation ? `Injury designation: ${signal.injury_designation}.` : null,
    signal.lineup_status ? `Lineup status: ${signal.lineup_status}.` : null,
    signal.weather_note ? signal.weather_note : null,
  ].filter(Boolean) as string[];

  return implications.length ? implications : ["Monitor for source confirmation and timing window changes."];
}

function situationPriority(signal: LiveSignal, state: EscalationState, timing: TimingWindow) {
  const timingBoost: Record<TimingWindow, number> = {
    Early: 22,
    Developing: 16,
    "Widely Known": 5,
    Closing: -4,
    Stale: -18,
  };

  return signal.score + escalationRank[state] * 8 + timingBoost[timing] + Math.min(signal.source_count * 2, 10);
}

function timingActionWindow(window: TimingWindow) {
  if (window === "Early") return "Early signal; confirmation is still spreading.";
  if (window === "Developing") return "Developing edge; watch for source confirmation or context movement.";
  if (window === "Widely Known") return "Widely known; use as context unless a new update changes the read.";
  if (window === "Closing") return "Fully priced or fading; wait for a fresh update.";
  return "Stale signal; no remaining edge unless new information arrives.";
}

function canonicalSignalKey(signal: LiveSignal) {
  const subject = [
    signal.league,
    signal.game_id,
    signal.team,
    signal.player,
    signal.matchup,
    signal.signal_type,
    normalizeKeyText(signal.headline).slice(0, 64),
  ].filter(Boolean).join(":");
  return subject || signal.id;
}

function normalizeKeyText(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(the|a|an|to|from|for|with|and)\b/g, "").trim();
}

function signalCredibilityRank(signal: LiveSignal) {
  const official = /official/i.test(`${signal.verdict} ${signal.confirmation_strength}`) ? 1000 : 0;
  const market = signal.line_movement ? 120 : 0;
  const source = Math.min(signal.source_count, 12) * 12;
  const freshness = Math.max(0, 120 - (ageInMinutes(signal.signal_time ?? signal.created_at ?? signal.updated_at) ?? 120));
  return official + signal.score + signal.confidence + market + source + freshness;
}

function normalizeGameStatus(status?: string | null) {
  if (!status) return "Scheduled";
  const value = status.toLowerCase();
  if (value === "live") return "In Progress";
  if (value === "final") return "Final";
  return status;
}

function ageInMinutes(iso?: string | null) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60000));
}

function freshnessLabel(ageMinutes: number | null) {
  if (ageMinutes === null) return "Timing unavailable";
  if (ageMinutes < 1) return "just now";
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  if (ageMinutes < 1440) return `${Math.round(ageMinutes / 60)}h ago`;
  return `${Math.round(ageMinutes / 1440)}d ago`;
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}
