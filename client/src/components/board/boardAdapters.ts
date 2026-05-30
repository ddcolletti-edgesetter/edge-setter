import type { BoardSituation } from "@/lib/boardSituations";
import type { BoardEscalation, SituationLane } from "@/lib/boardEscalation";
import type { BoardSortMode } from "@/lib/signalBoardUx";
import type { Sport } from "@/lib/leagueModifiers";
import type { CanonicalSituation } from "@/lib/situationsApi";
import { evidenceCountText, humanizeSignalType, marketFocusHeadline, publicConfidenceLabel, publicLifecycleLabel, publicStoryText, publicTimingLabel, publicUrgencyLabel, sourceCountText } from "@/lib/storyLanguage";
import { toTeamAbbr } from "@/components/v2/SportVisuals";
import type { LiveGamePillData, LiveGameStatus, BoardUrgency } from "./LiveGamePill";
import type { SituationEscalationState, SituationEvidenceStep, SituationLifecycleVisualState, SituationMetric, SituationRowData } from "./SituationRow";

export type SituationStoryCardData = {
  id: string;
  league?: string;
  headline: string;
  dek?: string;
  sectionTitle?: string;
  whatHappened: string;
  whyItMatters: string;
  edgeSetterKnows: string;
  watchNext: string;
  relatedItems?: string[];
  ctaLabel?: string;
  matchup?: string;
  primaryTeam?: string;
  secondaryTeam?: string;
  player?: string;
  storyType?: string;
  timestamp?: string;
  confidence?: string;
  sourceCount?: number;
  lifecycle?: string;
  verification?: string;
  evidence?: string;
  timing?: string;
  market?: string;
  row: SituationRowData;
};

export type AnyBoardSignal = {
  id?: string | number;
  headline?: string | null;
  detail?: string | null;
  why_it_matters?: string | null;
  action_takeaway?: string | null;
  player?: string | null;
  team?: string | null;
  opponent?: string | null;
  type?: string | null;
  confidence?: number | string | null;
  confidence_score?: number | string | null;
  verdict?: string | null;
  status_tag?: string | null;
  timestamp?: string | null;
  sources?: number | string | null;
  source_count?: number | string | null;
  sourceLabels?: string[] | null;
  sourceTypes?: string[] | null;
  confirmationStrength?: string | null;
  lineMovement?: { open?: string; current?: string; note?: string } | null;
  injuryDesignation?: string | null;
  conference?: string | null;
  _score?: { totalScore?: number | null; urgencyLabel?: string | null; urgencyReason?: string | null } | null;
};

export type AnyBoardGame = {
  id?: string | number;
  away?: string | null;
  home?: string | null;
  awayFull?: string | null;
  homeFull?: string | null;
  awayTeam?: string | null;
  homeTeam?: string | null;
  away_team?: string | null;
  home_team?: string | null;
  status?: string | null;
  statusDescription?: string | null;
  gameDate?: Date | string | null;
  game_time?: Date | string | null;
  time?: string | null;
  spread?: string | null;
  total?: string | null;
  signals?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  home_score?: number | null;
  away_score?: number | null;
  lineMovement?: unknown;
  network?: string | null;
  conference?: string | null;
};

export function toLiveGamePillData(game: AnyBoardGame, relatedCount = 0): LiveGamePillData {
  const status = game.statusDescription ?? game.status ?? "Scheduled";
  const awayName = game.awayTeam ?? game.away_team ?? game.away ?? game.awayFull ?? "TBD";
  const homeName = game.homeTeam ?? game.home_team ?? game.home ?? game.homeFull ?? "TBD";
  const isLive = isLiveStatus(status);

  return {
    id: String(game.id ?? `${awayName}-${homeName}`),
    away: {
      abbreviation: abbreviateTeam(awayName),
      score: game.awayScore ?? game.away_score ?? undefined,
    },
    home: {
      abbreviation: abbreviateTeam(homeName),
      score: game.homeScore ?? game.home_score ?? undefined,
    },
    status: normalizeGameStatus(status),
    clock: isLive ? status : undefined,
    period: game.time ?? formatGameTime(game.gameDate ?? game.game_time),
    market: [game.spread, game.total].filter(Boolean).join(" / ") || undefined,
    note: game.network ?? game.conference ?? undefined,
    urgency: urgencyForGameStatus(status, relatedCount),
    escalationCount: relatedCount || undefined,
    confirmedCount: game.signals ?? undefined,
  };
}

export function toSituationRowData(situation: BoardSituation): SituationRowData {
  const signal = situation.signal as AnyBoardSignal | undefined;
  const canonical = situation.canonicalSituation as CanonicalSituation | undefined;
  const confidenceDelta = canonical?.confidenceHistoryPreview?.[0]?.delta ?? null;
  const matchup = [situation.awayTeam, situation.homeTeam].filter(Boolean).join(" @ ")
    || [situation.team, situation.opponent].filter(Boolean).join(" vs ");

  return {
    id: situation.id,
    title: fanFirstTitle(situation, canonical),
    subtitle: situation.detail,
    league: situation.league,
    matchup: matchup || undefined,
    market: situation.movementLabel ? "Market reaction detected" : formatSignalType(situation.signalType),
    timestamp: situation.timeLabel ?? signal?.timestamp ?? undefined,
    sourceCount: situation.sourceCount,
    urgency: urgencyForEscalation(situation.escalation),
    urgencyScore: Math.round(situation.score),
    lane: situation.lane,
    escalationState: escalationStateForSituation(situation),
    statusLabel: situation.statusLabel ?? situation.escalation,
    metrics: [
      { label: "Confidence", value: `${Math.round(situation.confidence)}%`, tone: situation.confidence >= 80 ? "positive" : situation.confidence >= 60 ? "warning" : "default" },
    ].filter(Boolean) as SituationMetric[],
    tags: [situation.trustLabel, canonical?.confidenceLabel, signal?.injuryDesignation, signal?.conference].filter(Boolean) as string[],
    actionLabel: situation.kind === "signal" ? "Open story" : undefined,
    lifecycleLabel: situation.lifecycleStage,
    lifecycleState: lifecycleStateForLabel(situation.lifecycleStage),
    lifecycleVisualState: canonical ? lifecycleVisualState(canonical) : lifecycleVisualStateForLabel(situation.lifecycleStage),
    confidenceDelta,
    confidenceMovementLabel: canonical ? confidenceMovementSummary(canonical) : fallbackConfidenceStage(situation),
    evidenceCount: canonical?.evidenceCount,
    evidenceGrowthLabel: canonical ? evidenceGrowthLabel(canonical) : fanSafeContext(signal?.why_it_matters ?? signal?.detail),
    sourceProgressLabel: canonical ? sourceProgressLabel(canonical) : fallbackSourceProgress(situation),
    sourceConvergenceStage: canonical ? sourceConvergenceStage(canonical) : fallbackSourceStage(situation),
    sourceReliabilityLabel: canonical ? sourceReliabilityLabel(canonical) : situation.trustLabel,
    uncertaintyLabel: canonical?.confidenceFactors.whatRemainsUncertain[0],
    timingStageLabel: canonical ? timingStageLabel(canonical) : fallbackTimingStage(situation),
    evidenceChain: canonical ? evidenceChain(canonical) : fallbackEvidenceChain(situation),
    sportsIdentity: sportsIdentityForSituation(situation, canonical),
    confidenceNote: situation.confidenceNote,
    sourceSummary: situation.sourceSummary,
    timingAdvantage: situation.timingAdvantage,
    marketReaction: situation.marketReaction,
    replayChain: situation.replayChain,
  };
}

export function toSituationStoryCardData(row: SituationRowData): SituationStoryCardData {
  const identity = row.sportsIdentity;
  const matchup = row.matchup ?? matchupFromIdentity(identity);
  const storyType = storyTypeFromRow(row);
  const confidence = confidenceFromRow(row);
  const verification = publicStoryText(row.sourceProgressLabel ?? row.sourceSummary ?? row.statusLabel ?? row.escalationState, row.league);
  const headline = editorialHeadline(row, matchup);
  const whatHappened = storyWhatHappened(row);
  const whyItMatters = storyWhyItMatters(row);
  const edgeSetterKnows = cleanStoryLine(
    [
      row.sourceProgressLabel ?? sourceCountLabel(row.sourceCount),
      confidence ? publicConfidenceLabel(confidence) : undefined,
      row.timingStageLabel ?? row.timingAdvantage,
    ].filter(Boolean).join(" / ") || "EdgeSetter is monitoring source support, timing, confidence, and downstream sports impact.",
  );
  const watchNext = storyWatchNext(row);

  return {
    id: row.id,
    league: row.league,
    headline,
    dek: editorialDeck(row, headline),
    sectionTitle: "Top Developing Story",
    whatHappened,
    whyItMatters,
    edgeSetterKnows,
    watchNext,
    relatedItems: relatedWatchItems(row, { headline, whatHappened, whyItMatters, watchNext }),
    ctaLabel: "Open Story",
    matchup,
    primaryTeam: identity?.awayTeam ?? identity?.team,
    secondaryTeam: identity?.homeTeam ?? identity?.opponent,
    player: identity?.player,
    storyType,
    timestamp: row.timestamp,
    confidence: confidence ? publicConfidenceLabel(confidence) : undefined,
    sourceCount: row.sourceCount,
    lifecycle: publicLifecycleLabel(row.lifecycleLabel),
    verification,
    evidence: evidenceLabel(row),
    timing: publicTimingLabel(row.timingStageLabel ?? row.timingAdvantage, row.league),
    market: row.marketReaction ?? row.market,
    row,
  };
}

export function toSituationStoryCards(rows: SituationRowData[]) {
  return rows.map(toSituationStoryCardData);
}

export function toQuietLeagueLeadStory(league: "MLB" | "NBA"): SituationStoryCardData {
  const isMlb = league === "MLB";
  const headline = isMlb
    ? "Today's MLB watch: lineups, pitchers, weather, and late scratches"
    : "Tonight's NBA watch: starters, injuries, rotations, and late scratches";
  const dek = isMlb
    ? "EdgeSetter is tracking confirmed lineups, pitcher changes, bullpen usage, weather cells, injury updates, and market movement across today's slate."
    : "EdgeSetter is tracking starter confirmations, injury context, rotation changes, late scratches, and pre-tip market movement across tonight's slate.";
  const relatedItems = isMlb
    ? [
        "Lineup cards posting before first pitch",
        "Pitcher confirmations and bullpen availability",
        "Weather or park conditions affecting totals",
        "Late scratches, roster moves, and movement before public confirmation",
      ]
    : [
        "Starter confirmations before tip",
        "Injury context and warmup reports",
        "Rotation changes and late scratches",
        "Pre-tip movement before public confirmation",
      ];
  const row: SituationRowData = {
    id: `featured-empty-${league.toLowerCase()}`,
    title: headline,
    subtitle: dek,
    league,
    statusLabel: "Monitoring",
    lifecycleLabel: "Quiet slate",
    sourceProgressLabel: "Check pending",
    sportsIdentity: { sport: league.toLowerCase() as "mlb" | "nba" },
  };

  return {
    id: row.id,
    league,
    sectionTitle: `${league} Watch Board`,
    headline,
    dek,
    whatHappened: isMlb
      ? "Lineups, pitchers, weather, bullpen usage, injury updates, and market movement are being checked before first pitch."
      : "Starters, injuries, rotations, late scratches, warmups, and market movement are being checked before tip.",
    whyItMatters: "Quiet boards still carry useful sports context because the next confirmation can change lineup, role, fantasy, fan, or market reads.",
    edgeSetterKnows: "EdgeSetter is monitoring source support, timing, confidence, and downstream sports context.",
    watchNext: isMlb
      ? "Watch confirmed lineups, pitcher changes, weather cells, bullpen availability, late scratches, and roster moves."
      : "Watch starter confirmations, warmup reports, injury context, rotation changes, late scratches, and pre-tip movement.",
    relatedItems,
    ctaLabel: "Open Watch Board",
    storyType: "Slate watch",
    lifecycle: "Monitoring",
    verification: "Check pending",
    evidence: "No elevated story yet",
    timing: isMlb ? "Before first pitch" : "Before tip",
    row,
  };
}

export function featuredCopy(situation: BoardSituation | null, league: Sport) {
  if (!situation) {
    if (league === "MLB") {
      return {
        title: "Today's MLB watch: lineups, pitchers, weather, and late scratches",
        summary: "EdgeSetter is tracking confirmed lineups, pitcher changes, bullpen usage, weather cells, injury updates, and market movement across today's slate.",
        primaryRead: "Lineup cards, probable and confirmed pitchers, bullpen availability, weather shifts, late scratches, and roster moves stay on the board before first pitch.",
        secondaryRead: "The lead area stays useful even when no story has enough source agreement, timing pressure, or market reaction to elevate.",
        metrics: [],
      };
    }
    if (league === "NBA") {
      return {
        title: "Tonight's NBA watch: starters, injuries, rotations, and late scratches",
        summary: "EdgeSetter is tracking starter confirmations, injury context, rotation changes, late scratches, and pre-tip market movement across tonight's slate.",
        primaryRead: "Starter confirmations, warmup reports, injury updates, rotation changes, late scratches, and public context stay on the board before tip.",
        secondaryRead: "The lead area stays useful even when no story has enough source agreement, timing pressure, or market reaction to elevate.",
        metrics: [],
      };
    }
    return {
      title: league === "NFL" || league === "CFB" ? "Offseason coverage watch" : "Coverage watch",
      summary: leagueEmptyCopy[league],
      primaryRead: league === "NFL" || league === "CFB"
        ? "Coverage is limited to offseason developing stories, scheduled context, and verified source-backed updates."
        : "No developing story is above the monitoring threshold yet.",
      secondaryRead: "Stories only elevate when source agreement, market reaction, or live game state supports it.",
      metrics: [],
    };
  }

  const signal = situation.signal as AnyBoardSignal | undefined;
  const canonical = situation.canonicalSituation as CanonicalSituation | undefined;
  const editorialCopy = league === "MLB" || league === "NBA";
  const confidenceDelta = canonical?.confidenceHistoryPreview?.[0]?.delta;
  const confidenceDeltaMetric = typeof confidenceDelta === "number" && confidenceDelta !== 0
    ? { label: "Confidence move", value: `${confidenceDelta > 0 ? "+" : ""}${Math.round(confidenceDelta)}`, tone: confidenceDelta > 0 ? "positive" : "warning" }
    : null;
  return {
    title: fanFirstTitle(situation, canonical),
    summary: fanFirstSummary(situation, signal, canonical),
    primaryRead: fanFirstPrimaryRead(situation, signal, canonical),
    secondaryRead: fanSafeContext([situation.sourceSummary, canonical?.confidenceFactors.whatRemainsUncertain[0], situation.timingAdvantage].filter(Boolean).join(" / ") || signal?.action_takeaway || situation.trustLabel),
    metrics: [
      { label: "Story priority", value: editorialCopy ? publicUrgencyLabel(situation.score) : urgencyLabel(situation.score), tone: situation.score >= 82 ? "danger" : situation.score >= 65 ? "warning" : "default" },
      { label: "Confidence", value: editorialCopy ? publicConfidenceLabel(`${Math.round(situation.confidence)}%`) : `${Math.round(situation.confidence)}%`, tone: situation.confidence >= 80 ? "positive" : "default" },
      confidenceDeltaMetric,
      canonical ? { label: "Evidence", value: editorialCopy ? evidenceCountText(canonical.evidenceCount) : canonical.evidenceCount, tone: canonical.evidenceCount >= 3 ? "positive" : "default" } : null,
      { label: "Verification", value: editorialCopy ? publicLifecycleLabel(situation.lifecycleStage) : lifecycleDisplayLabel(situation.lifecycleStage), tone: situation.lifecycleStage === "Context Moving" ? "warning" : situation.lifecycleStage === "Resolved / Stale" ? "default" : "positive" },
      { label: "Timing", value: editorialCopy ? publicTimingLabel(situation.timingAdvantage, situation.league) : timingMetricLabel(situation.timingAdvantage), tone: situation.isActionable ? "positive" : "warning" },
    ].filter(Boolean) as SituationMetric[],
  };
}

export function situationMatchesPriority(situation: BoardSituation, urgencyFilter: string) {
  if (urgencyFilter === "critical") return situation.escalation === "Breaking" || situation.escalation === "Urgent";
  if (urgencyFilter === "high") return ["Breaking", "Urgent", "Elevated"].includes(situation.escalation);
  return true;
}

export function sortModeFromPriority(sortId: string): BoardSortMode {
  if (sortId === "freshness") return "newest";
  if (sortId === "confidence") return "confidence";
  if (sortId === "movement") return "movement";
  return "priority";
}

export function laneLabel(lane: SituationLane) {
  if (lane === "live") return "Live Game Watch";
  if (lane === "decision") return "Decision Windows";
  if (lane === "confirmed") return "Verified Stories";
  if (lane === "background") return "Background Watch";
  return "Escalating Stories";
}

function escalationStateForSituation(situation: BoardSituation): SituationEscalationState {
  const canonical = situation.canonicalSituation as CanonicalSituation | undefined;
  if (canonical?.lifecycleState === "official") return "official";
  if (canonical?.lifecycleState === "confirmed") return "verified";
  if (canonical?.lifecycleState === "cooling" || canonical?.lifecycleState === "resolved") return "monitoring";
  if (situation.escalation === "Breaking" || situation.escalation === "Urgent") return "escalated";
  if (situation.escalation === "Elevated") return "developing";
  if (situation.lifecycle === "Confirmed") return "verified";
  if (situation.escalation === "Watch") return "developing";
  return "monitoring";
}

function lifecycleStateForLabel(label?: string): "detected" | "developing" | "escalating" | "verified" | "market" | "consensus" | "stale" {
  if (label === "Detected") return "detected";
  if (label === "Escalating") return "escalating";
  if (label === "Verified") return "verified";
  if (label === "Context Moving") return "market";
  if (label === "Consensus Forming") return "consensus";
  if (label === "Resolved / Stale") return "stale";
  return "developing";
}

function lifecycleVisualState(canonical: CanonicalSituation): SituationLifecycleVisualState {
  if (canonical.lifecycleState === "emerging" || canonical.lifecycleState === "watching") return "emerging";
  if (canonical.lifecycleState === "developing") return "developing";
  if (canonical.lifecycleState === "escalating") {
    return canonical.latestEvidence.some((event) => event.marketImpact) ? "market-reacting" : "confirming";
  }
  if (canonical.lifecycleState === "confirmed" || canonical.lifecycleState === "official") return "consensus-forming";
  if (canonical.lifecycleState === "cooling") return "cooling";
  if (canonical.lifecycleState === "resolved" || canonical.lifecycleState === "invalidated") return "resolved";
  return "archived";
}

function lifecycleVisualStateForLabel(label?: string): SituationLifecycleVisualState {
  if (label === "Detected") return "emerging";
  if (label === "Escalating") return "confirming";
  if (label === "Verified" || label === "Consensus Forming") return "consensus-forming";
  if (label === "Context Moving") return "market-reacting";
  if (label === "Resolved / Stale") return "cooling";
  return "developing";
}

function sourceProgressLabel(canonical: CanonicalSituation) {
  const agreement = canonical.latestEvidence.find((event) => event.validatorAgreement)?.validatorAgreement;
  const sourceCount = `${canonical.sourceCount} ${canonical.sourceCount === 1 ? "report" : "reports"}`;
  const evidenceCount = `${canonical.evidenceCount} evidence ${canonical.evidenceCount === 1 ? "event" : "events"}`;
  if (agreement) return `${sourceCount} / ${agreement}`;
  return `${sourceCount} / ${evidenceCount}`;
}

function evidenceChain(canonical: CanonicalSituation): SituationEvidenceStep[] {
  const hasMarket = canonical.latestEvidence.some((event) => event.marketImpact);
  const hasOfficial = canonical.lifecycleState === "official" || canonical.lifecycleState === "confirmed";
  const uncertain = canonical.confidenceFactors.whatRemainsUncertain.length > 0;
  const sourceState = canonical.sourceCount >= 3 ? "complete" : canonical.sourceCount >= 2 ? "active" : "caution";
  const confidenceState = canonical.confidence >= 75 ? "complete" : canonical.confidence >= 55 ? "active" : "caution";
  const timingState = canonical.timingPressure === "critical" || canonical.timingPressure === "high"
    ? "active"
    : canonical.timingPressure === "inactive" ? "quiet" : "complete";

  return [
    { label: "Sources", value: sourceConvergenceStage(canonical), state: sourceState },
    { label: "Evidence", value: `${canonical.evidenceCount} event${canonical.evidenceCount === 1 ? "" : "s"}`, state: canonical.evidenceCount >= 3 ? "complete" : "active" },
    { label: "Confidence", value: confidenceMovementSummary(canonical), state: confidenceState },
    { label: "Timing", value: timingStageLabel(canonical), state: timingState },
    {
      label: hasOfficial ? "Official" : hasMarket ? "Market reaction" : "Watch next",
      value: hasOfficial ? "Confirmed update" : hasMarket ? "Market is reacting" : uncertain ? "Still open" : "Quiet",
      state: hasOfficial ? "complete" : hasMarket ? "active" : uncertain ? "caution" : "quiet",
    },
  ];
}

function fallbackEvidenceChain(situation: BoardSituation): SituationEvidenceStep[] {
  const sourceCount = Math.max(0, situation.sourceCount ?? 0);
  const hasMarket = Boolean(situation.movementLabel);
  return [
    { label: "Sources", value: fallbackSourceStage(situation), state: sourceCount > 1 ? "active" : "caution" },
    { label: "Evidence", value: sourceCount > 1 ? `${sourceCount} reports` : "1 report", state: sourceCount > 1 ? "active" : "caution" },
    { label: "Confidence", value: fallbackConfidenceStage(situation), state: situation.confidence >= 75 ? "complete" : situation.confidence >= 55 ? "active" : "caution" },
    { label: "Timing", value: fallbackTimingStage(situation), state: situation.isActionable ? "active" : "quiet" },
    { label: hasMarket ? "Market reaction" : "Watch next", value: hasMarket ? "Market is reacting" : "Quiet", state: hasMarket ? "active" : "quiet" },
  ];
}

function confidenceMovementSummary(canonical: CanonicalSituation) {
  const delta = canonical.confidenceHistoryPreview[0]?.delta;
  if (typeof delta === "number" && delta > 0) return `building +${Math.round(delta)}`;
  if (typeof delta === "number" && delta < 0) return `cooling ${Math.round(delta)}`;
  if (canonical.confidence >= 75) return "strong pattern match";
  if (canonical.confidence >= 55) return "forming";
  return "thin";
}

function evidenceGrowthLabel(canonical: CanonicalSituation) {
  const latest = canonical.confidenceHistoryPreview[0];
  if (latest?.reasons?.[0]) return fanSafeContext(latest.reasons[0]);
  if (canonical.latestEvidence[0]?.summary) return fanSafeContext(canonical.latestEvidence[0].summary);
  return `${canonical.evidenceCount} evidence events attached`;
}

function sourceConvergenceStage(canonical: CanonicalSituation) {
  const agreement = canonical.latestEvidence.find((event) => event.validatorAgreement)?.validatorAgreement;
  if (agreement) return agreement;
  if (canonical.sourceCount >= 3) return "source agreement";
  if (canonical.sourceCount >= 2) return "corroborated";
  return "single-source";
}

function sourceReliabilityLabel(canonical: CanonicalSituation) {
  const reliability = canonical.confidenceFactors.scores.source_reliability;
  if (reliability >= 18) return "reliable report support";
  if (reliability >= 12) return "moderate report support";
  return "limited report support";
}

function timingStageLabel(canonical: CanonicalSituation) {
  if (canonical.lifecycleState === "official") return "official confirmation";
  if (canonical.lifecycleState === "confirmed") return "public confirmation";
  if (canonical.lifecycleState === "cooling") return "fully priced";
  if (canonical.lifecycleState === "resolved" || canonical.lifecycleState === "archived" || canonical.lifecycleState === "invalidated") return "cooling story";
  if (canonical.latestEvidence.some((event) => event.marketImpact)) return "Market is reacting";
  if (canonical.timingPressure === "critical" || canonical.timingPressure === "high") return "early signal";
  if (canonical.timingPressure === "medium") return "developing window";
  if (canonical.timingPressure === "low") return "quiet board";
  return "cooling story";
}

function fallbackSourceProgress(situation: BoardSituation) {
  const count = Math.max(0, situation.sourceCount ?? 0);
  if (count >= 3) return `${count} reports attached`;
  if (count >= 2) return `${count} reports / corroborated`;
  return "1 report / Needs more confirmation";
}

function fallbackSourceStage(situation: BoardSituation) {
  const count = Math.max(0, situation.sourceCount ?? 0);
  if (count >= 3) return "reports attached";
  if (count >= 2) return "corroborated";
  return "single-source";
}

function fallbackConfidenceStage(situation: BoardSituation) {
  if (situation.confidence >= 80) return "strong pattern match";
  if (situation.confidence >= 60) return "building";
  return "forming";
}

function fallbackTimingStage(situation: BoardSituation) {
  if (situation.lifecycleStage === "Context Moving" || situation.movementLabel) return "Market is reacting";
  if (situation.lifecycleStage === "Consensus Forming") return "consensus forming";
  if (situation.lifecycleStage === "Verified") return "public confirmation";
  if (situation.lifecycleStage === "Resolved / Stale") return "cooling story";
  if (situation.isActionable && situation.escalation === "Watch") return "developing window";
  if (situation.isActionable) return "early development";
  return "quiet board";
}

function urgencyLabel(score: number) {
  if (score >= 95) return "High";
  if (score >= 78) return "Elevated";
  if (score >= 58) return "Watch";
  return "Monitor";
}

function lifecycleDisplayLabel(label?: string) {
  return publicLifecycleLabel(label);
}

function sportsIdentityForSituation(situation: BoardSituation, canonical?: CanonicalSituation): SituationRowData["sportsIdentity"] {
  const teams = canonical?.teams ?? [];
  const awayTeam = situation.awayTeam ?? teams[0] ?? situation.team;
  const homeTeam = situation.homeTeam ?? teams[1] ?? situation.opponent;
  const sport = situation.league === "MLB" ? "mlb"
    : situation.league === "NBA" ? "nba"
      : situation.league === "NFL" ? "nfl"
        : situation.league === "CFB" ? "cfb"
          : undefined;
  return {
    awayTeam,
    homeTeam,
    team: situation.team ?? teams[0],
    opponent: situation.opponent ?? teams[1],
    player: canonical?.players?.[0] ?? situation.player,
    sport,
  };
}

function matchupFromIdentity(identity?: SituationRowData["sportsIdentity"]) {
  const away = identity?.awayTeam ?? identity?.team;
  const home = identity?.homeTeam ?? identity?.opponent;
  if (away && home && away !== home) return `${away} @ ${home}`;
  return away ?? home;
}

function storyTypeFromRow(row: SituationRowData) {
  const text = `${row.title} ${row.subtitle ?? ""} ${row.market ?? ""} ${row.tags?.join(" ") ?? ""}`.toLowerCase();
  if (text.includes("injury") || text.includes("questionable") || text.includes("availability")) return "Availability watch";
  if (text.includes("lineup") || text.includes("scratch")) return "Lineup watch";
  if (text.includes("pitcher") || text.includes("starter")) return "Pitcher watch";
  if (text.includes("weather")) return "Weather watch";
  if (text.includes("market") || text.includes("movement")) return "Market reaction";
  if (row.matchup) return "Matchup watch";
  return publicLifecycleLabel(row.lifecycleLabel) ?? "Developing story";
}

function confidenceFromRow(row: SituationRowData) {
  const confidenceMetric = row.metrics?.find((metric) => metric.label.toLowerCase().includes("confidence"));
  if (confidenceMetric) return String(confidenceMetric.value);
  return row.confidenceNote?.match(/\d+%/)?.[0];
}

function evidenceLabel(row: SituationRowData) {
  if (row.evidenceCount != null) return evidenceCountText(row.evidenceCount);
  if (row.evidenceGrowthLabel) return publicStoryText(row.evidenceGrowthLabel, row.league);
  return row.sourceCount ? `${row.sourceCount} report${row.sourceCount === 1 ? "" : "s"}` : undefined;
}

function sourceCountLabel(sourceCount?: number) {
  return sourceCountText(sourceCount);
}

function cleanStoryLine(value?: string) {
  return tightenSentence(publicStoryText(fanSafeContext(value), undefined)?.trim() || "");
}

function editorialHeadline(row: SituationRowData, matchup?: string) {
  const raw = cleanRawReport(row.title);
  const context = `${row.title} ${row.subtitle ?? ""} ${row.market ?? ""}`.toLowerCase();
  const player = row.sportsIdentity?.player ?? playerFromRawTitle(row.title);
  const team = row.sportsIdentity?.team ?? row.sportsIdentity?.awayTeam ?? teamFromRawTitle(row.title);
  const opponent = row.sportsIdentity?.opponent ?? row.sportsIdentity?.homeTeam;
  const injury = injuryPart(context);

  if (injury && player) {
    const subject = team && team !== player ? `${team} availability` : "availability";
    return `${player} ${injury} injury puts ${subject} in focus`;
  }

  if (isMarketDominantTitle(row.title) || context.includes("market")) {
    if (row.league === "MLB") {
      const label = matchup ? matchup.replace(" @ ", "-").replace(" vs ", "-") : [team, opponent].filter(Boolean).join("-");
      return `${label || "MLB"} market move leads MLB watch`;
    }
    const label = matchup ? matchup.replace(" @ ", "-").replace(" vs ", "-") : [team, opponent].filter(Boolean).join("-");
    return `${label || "NBA"} market move leads pre-tip watch`;
  }

  if (context.includes("lineup") || context.includes("scratch") || context.includes("starter")) {
    return row.league === "MLB"
      ? `${team || matchup || "MLB"} lineup watch moves before first pitch`
      : `${team || matchup || "NBA"} starter watch moves before tip`;
  }

  if (row.league === "MLB" && context.includes("pitcher")) {
    return `${team || matchup || "MLB"} pitching update moves the slate`;
  }

  return conciseHeadline(raw, row.league);
}

function editorialDeck(row: SituationRowData, headline: string) {
  const summary = cleanStoryLine(row.subtitle ?? row.marketReaction ?? row.market);
  if (summary && summary.toLowerCase() !== headline.toLowerCase()) return summary;
  if (row.league === "MLB") return "EdgeSetter is tracking lineup, pitching, bullpen, weather, roster, and market context as the slate develops.";
  if (row.league === "NBA") return "EdgeSetter is tracking starter, injury, rotation, late-scratch, and pre-tip movement context as the board develops.";
  return summary;
}

function relatedWatchItems(row: SituationRowData, lines: { headline: string; whatHappened: string; whyItMatters: string; watchNext: string }) {
  const items = [
    conciseHeadline(lines.headline, row.league),
    lines.watchNext,
    row.sourceProgressLabel ? `Source check: ${cleanStoryLine(row.sourceProgressLabel)}` : undefined,
    row.timingStageLabel ? `Timing: ${cleanStoryLine(row.timingStageLabel)}` : undefined,
  ].filter(Boolean) as string[];
  return Array.from(new Set(items.map((item) => tightenSentence(item)))).slice(0, 4);
}

function storyWhatHappened(row: SituationRowData) {
  const headline = editorialHeadline(row, row.matchup ?? matchupFromIdentity(row.sportsIdentity));
  const summary = cleanStoryLine(row.subtitle ?? row.marketReaction ?? row.market);
  if (summary && summary.toLowerCase() !== headline.toLowerCase()) return factualEvent(summary, row);
  if (row.market?.toLowerCase().includes("market") || row.title.toLowerCase().includes("line move")) {
    return row.league === "NBA"
      ? "The pre-tip market moved before the full availability picture was clear."
      : "The market moved before the full lineup, pitching, injury, or weather picture was clear.";
  }
  return factualEvent(cleanRawReport(row.title), row);
}

function storyWhyItMatters(row: SituationRowData) {
  const text = `${row.title} ${row.subtitle ?? ""} ${row.market ?? ""}`.toLowerCase();
  if (text.includes("market") || text.includes("line move")) {
    return row.league === "NBA"
      ? "A pre-tip move can point to starter, rotation, late-scratch, injury, or availability context that has not fully surfaced."
      : "A move can point to lineup, pitcher, injury, weather, bullpen, or availability context that has not fully surfaced.";
  }
  if (text.includes("injury") || text.includes("out") || text.includes("questionable")) {
    return row.league === "NBA"
      ? "Availability changes can shift starters, rotations, usage, and pre-tip pricing."
      : "Availability changes can shift lineups, defensive alignment, bullpen planning, and pricing.";
  }
  if (text.includes("lineup") || text.includes("scratch")) return "Lineup changes can alter role, matchup, fantasy, fan, and market context quickly.";
  if (text.includes("pitcher") || text.includes("starter")) return "Pitching changes can reshape totals, bullpen usage, and game context before first pitch.";
  return "This story can affect lineup, role, game, fantasy, fan, or market context.";
}

function storyWatchNext(row: SituationRowData) {
  const text = `${row.title} ${row.subtitle ?? ""} ${row.market ?? ""}`.toLowerCase();
  if (row.uncertaintyLabel) return cleanStoryLine(row.uncertaintyLabel);
  if (text.includes("market") || text.includes("line move")) {
    return row.league === "NBA"
      ? "Watch for starters, warmup reports, late scratches, injury context, and whether the number keeps moving before tip."
      : "Watch for lineup, pitching, injury, weather, bullpen, or late-scratch context that explains the move.";
  }
  if (text.includes("injury") || text.includes("out") || text.includes("questionable")) return "Watch for the next official status update, warmup/report confirmation, and role impact.";
  if (text.includes("lineup") || text.includes("scratch")) return "Watch the next lineup card, late scratch note, and any follow-on market reaction.";
  if (text.includes("pitcher") || text.includes("starter")) return "Watch pitcher confirmation, bullpen availability, weather, and any totals movement.";
  return "Watch for the next official update, source agreement, and any game-context reaction.";
}

function cleanRawReport(value?: string | null) {
  return publicStoryText(value ?? "")
    .replace(/\([^)]{28,}\)/g, "")
    .replace(/\s+[—-]\s*(OUT|QUESTIONABLE|DOUBTFUL|PROBABLE|ACTIVE|INACTIVE)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function conciseHeadline(value: string, league?: string) {
  const clean = cleanRawReport(value)
    .replace(/\breports?\b\.?$/i, "")
    .replace(/\bper\s+[A-Z][A-Za-z\s.]+$/i, "")
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 11) return clean;
  return `${words.slice(0, 11).join(" ")}`;
}

function playerFromRawTitle(value?: string) {
  const match = value?.match(/^([^()—-]{3,60})\s*(?:\(|—|-)/);
  return match?.[1]?.trim();
}

function teamFromRawTitle(value?: string) {
  const match = value?.match(/\b([A-Z]{2,4})\b/);
  return match?.[1];
}

function injuryPart(text: string) {
  const injury = text.match(/\b(finger|pinky|thumb|hand|wrist|ankle|knee|hamstring|quad|calf|foot|toe|shoulder|back|neck|rib|hip|groin|illness|concussion)\b/i)?.[1];
  if (!injury) return null;
  if (injury.toLowerCase() === "pinky") return "finger";
  return injury.toLowerCase();
}

function factualEvent(value: string, row: SituationRowData) {
  const clean = tightenSentence(cleanRawReport(value));
  if (clean.length <= 150) return clean;
  if (row.sportsIdentity?.player) return `${row.sportsIdentity.player} update changed the availability read.`;
  if (row.matchup) return `${row.matchup} context changed on the board.`;
  return conciseHeadline(clean, row.league);
}

function tightenSentence(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

function fanFirstTitle(situation: BoardSituation, canonical?: CanonicalSituation) {
  const rawTitle = situation.title.trim();
  if (situation.kind === "game") return rawTitle;
  if (!isMarketDominantTitle(rawTitle)) return rawTitle;
  const identity = fanIdentityLabel(situation, canonical);
  const context = fanContextLabel(situation);
  if (situation.lifecycleStage === "Verified" || situation.lifecycleStage === "Consensus Forming") {
    return `${identity} ${context} moving toward confirmation`;
  }
  if (situation.lifecycleStage === "Context Moving") {
    return context === "market movement"
      ? marketFocusHeadline(identity, situation.league)
      : `${identity} ${context} is moving`;
  }
  return `${identity} ${context} under monitoring`;
}

function fanFirstSummary(situation: BoardSituation, signal?: AnyBoardSignal, canonical?: CanonicalSituation) {
  const base = signal?.why_it_matters ?? situation.detail ?? canonical?.summary;
  if (base && !isMarketDominantTitle(base)) return fanSafeContext(base);
  const identity = fanIdentityLabel(situation, canonical);
  const change = fanContextLabel(situation);
  return `${identity} ${change} is the lead sports context. Market reaction is treated as supporting evidence, not the whole story.`;
}

function fanFirstPrimaryRead(situation: BoardSituation, signal?: AnyBoardSignal, canonical?: CanonicalSituation) {
  const evidence = canonical?.confidenceFactors.evidenceThatMattersMost[0] ?? signal?.why_it_matters;
  if (evidence && !isMarketDominantTitle(evidence)) return fanSafeContext(evidence);
  const identity = fanIdentityLabel(situation, canonical);
  return `${identity} is being monitored for team, player, lineup, availability, fantasy, fan, and game-context impact before market context is considered.`;
}

function fanSafeContext(value?: string | null) {
  if (!value) return undefined;
  return value
    .replace(/Market inefficiency detected/gi, "Market is reacting")
    .replace(/line adjusting toward true probability/gi, "market is reacting to new context")
    .replace(/market is reacting/gi, "Market is reacting")
    .replace(/market movement/gi, "market reaction")
    .replace(/market signals/gi, "sports context")
    .replace(/market checks/gi, "context checks")
    .replace(/downstream market/gi, "downstream sports")
    .replace(/DraftKings/gi, "source")
    .replace(/FanDuel/gi, "source")
    .replace(new RegExp(["books", "reacting"].join(" "), "gi"), "market is reacting")
    .replace(new RegExp(["market", "reacting"].join(" "), "gi"), "Market is reacting")
    .replace(/sharp money/gi, "professional source activity")
    .replace(/Sharp money/gi, "Professional source activity");
}

function fanIdentityLabel(situation: BoardSituation, canonical?: CanonicalSituation) {
  const teams = canonical?.teams ?? [];
  const away = situation.awayTeam ?? teams[0];
  const home = situation.homeTeam ?? teams[1];
  if (away && home) return `${away}-${home}`;
  if (situation.player && situation.team) return `${situation.team} ${situation.player}`;
  if (situation.player) return situation.player;
  if (situation.team) return situation.team;
  if (teams.length) return teams.slice(0, 2).join("-");
  return `${situation.league} story`;
}

function fanContextLabel(situation: BoardSituation) {
  const text = `${situation.signalType ?? ""} ${situation.detail ?? ""} ${situation.title}`.toLowerCase();
  if (text.includes("injury") || text.includes("questionable") || text.includes("dnp") || text.includes("availability")) return "availability update";
  if (text.includes("lineup") || text.includes("starter") || text.includes("rotation")) return "lineup watch";
  if (text.includes("role") || text.includes("depth")) return "role change";
  if (text.includes("weather")) return "game-condition watch";
  if (text.includes("market") || text.includes("line move") || text.includes("sharp steam") || text.includes("->")) return "market movement";
  if (text.includes("market") || text.includes("line move") || text.includes("sharp steam") || text.includes("->") || text.includes("→")) return "watch window";
  return "story update";
}

function isMarketDominantTitle(value: string) {
  const text = value.toLowerCase();
  return text.includes("line move")
    || text.includes("sharp steam")
    || text.includes("sharp money")
    || text.includes("spread")
    || text.includes(["market", "reacting"].join(" "))
    || text.includes(["market", "inefficiency"].join(" "))
    || text.includes("line adjusting")
    || /\b[+-]?\d+(\.\d+)?\s*(->|→)\s*[+-]?\d/.test(text);
}

function timingMetricLabel(value?: string) {
  if (!value) return "Monitoring";
  if (value.includes(":")) return value.split(":")[0];
  if (value.includes(",")) return value.split(",")[0];
  return value;
}

function urgencyForEscalation(escalation: BoardEscalation): BoardUrgency {
  if (escalation === "Breaking") return "critical";
  if (escalation === "Urgent" || escalation === "Elevated") return "high";
  if (escalation === "Watch") return "medium";
  return "low";
}

function normalizeGameStatus(status: string): LiveGameStatus {
  const value = status.toLowerCase();
  if (value.includes("final")) return "final";
  if (value.includes("half")) return "halftime";
  if (value.includes("delay") || value.includes("postpon")) return "delayed";
  if (isLiveStatus(status)) return "live";
  return "scheduled";
}

function urgencyForGameStatus(status: string, relatedCount: number): BoardUrgency {
  const value = status.toLowerCase();
  if (value.includes("final")) return relatedCount >= 4 ? "medium" : "low";
  if (isLiveStatus(status)) return relatedCount > 0 ? "high" : "medium";
  if (relatedCount >= 4) return "high";
  if (relatedCount > 0) return "medium";
  return "low";
}

function isLiveStatus(status: string) {
  const value = status.toLowerCase();
  return value.includes("live") || value.includes("progress") || value.includes("quarter") || value.includes("inning");
}

function abbreviateTeam(name: string) {
  const trimmed = name.trim();
  if (trimmed.length <= 4 && !trimmed.includes(" ")) return trimmed.toUpperCase();
  return toTeamAbbr(trimmed);
}

function formatGameTime(value?: Date | string | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatSignalType(type?: string) {
  return humanizeSignalType(type);
}

const leagueEmptyCopy: Record<Sport, string> = {
  NBA: "Monitoring late scratches, starters, load management, warmups, and external movement before tip. Sparse means below threshold, not inactive.",
  MLB: "Monitoring lineup cards, pitchers, weather cells, bullpen context, late scratches, and live inning states.",
  NFL: "Offseason monitoring is limited to verified injury, practice, depth, weather, role, and context-movement updates. Quiet means no elevated development is verified.",
  CFB: "Offseason and conference monitoring are limited to verified local sources, travel/weather/coaching context, depth charts, and external movement.",
};

