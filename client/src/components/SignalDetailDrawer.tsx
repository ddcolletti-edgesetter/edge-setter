import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Bell, Bookmark, CheckCircle2, Clock3, History, LineChart, ShieldCheck, TrendingUp, X } from "lucide-react";

import { AgentCalibrationBadge, ChainReactionPreview, HistoricalPatternMatch, WhatToWatchNext } from "@/components/AgentCalibration";
import { SportsStoryVisual } from "@/components/SportsMedia";
import { storyImpactSections } from "@/components/StoryImpactBlocks";
import { resolveSportsImageAsset } from "@/lib/sportsImageAssets";
import { humanizeSignalType, publicConfidenceLabel, publicStoryText, publicTimingLabel, shouldCapSingleSourceStrength, sourceCountText, type EvidenceStrengthContext } from "@/lib/storyLanguage";
import { deriveSignalVerificationState, honestConfirmationStrength, readSignalSourceCount } from "@/lib/signalVerification";

type LineMovementLike = {
  open?: string | null;
  current?: string | null;
  direction?: string | null;
  note?: string | null;
};

type SourceLike = string | {
  name?: string | null;
  type?: string | null;
  status?: string | null;
};

type AccuracyContextLike = {
  recentHitRate?: number | string | null;
  confidenceAlignment?: string | null;
  categoryPerformance?: string | null;
  trendDirection?: string | null;
  comparableOutcomes?: string | null;
};

type CalibrationRow = {
  label: string;
  value: string;
  detail: string;
};

export type SignalDetailLike = {
  id?: number | string;
  headline?: string | null;
  title?: string | null;
  detail?: string | null;
  summary?: string | null;
  player?: string | null;
  player_name?: string | null;
  team?: string | null;
  type?: string | null;
  signal_type?: string | null;
  confidence?: number | null;
  confidence_score?: number | string | null;
  verdict?: string | null;
  status_tag?: string | null;
  action_takeaway?: string | null;
  timestamp?: string | null;
  isoTimestamp?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  sources?: number | string | SourceLike[] | null;
  source_count?: number | string | null;
  sourceTypes?: string[] | null;
  sourceLabels?: string[] | null;
  confirmationStrength?: string | null;
  why_it_matters?: string | null;
  whyItMatters?: string | null;
  lineMovement?: LineMovementLike | null;
  line_movement?: LineMovementLike | null;
  bettingRelevance?: boolean | null;
  fantasyRelevance?: boolean | null;
  lineupStatus?: string | null;
  rotationNote?: string | null;
  matchupEdge?: string | null;
  accuracyContext?: AccuracyContextLike | null;
  historicalPatternLabel?: string | null;
  historicalPatternConfidence?: string | null;
  historicalPatternBasis?: string[] | null;
  comparableStoryType?: string | null;
  sourceTimingProfile?: string | null;
  sourceReliabilityBasis?: string | null;
  marketReactionWindow?: string | null;
  confirmationSignals?: string[] | null;
  weakeningSignals?: string[] | null;
  calibrationSummary?: string | null;
  calibrationLimitations?: string[] | null;
  detectionLeadTime?: string | null;
  detectionLeadKind?: "confirmation" | "pickup" | null;
};

type SignalDetailDrawerProps = {
  open: boolean;
  signal: SignalDetailLike | null;
  sport?: string;
  onClose: () => void;
};

type Tone = "green" | "gold" | "blue" | "red" | "gray";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function readConfidence(signal: SignalDetailLike) {
  const verdict = (signal.verdict ?? signal.status_tag ?? "").toLowerCase();
  if (verdict.includes("verified") || verdict.includes("confirmed")) return 100;
  if (typeof signal.confidence === "number") return clamp(signal.confidence);
  if (typeof signal.confidence_score === "number") return clamp(signal.confidence_score);
  if (typeof signal.confidence_score === "string") {
    const parsed = Number.parseFloat(signal.confidence_score);
    if (!Number.isNaN(parsed)) return clamp(parsed);
  }
  return 0;
}

function readSourceCount(signal: SignalDetailLike) {
  // Delegate to the shared counter so the drawer's confidence/timing model and
  // the canonical verification word evaluate the exact same source depth.
  return readSignalSourceCount(signal);
}

function confidenceLabel(value: number, context?: EvidenceStrengthContext) {
  if (!value) return "Unavailable";
  if (value >= 100) return "VERIFIED";
  return publicConfidenceLabel(value, context);
}

function confidenceBand(value: number, editorial = false) {
  if (!value) return "Not scored";
  if (editorial) return publicConfidenceLabel(`${value}%`);
  if (value >= 85) return "Strong confidence support";
  if (value >= 72) return "Elevated confidence support";
  if (value >= 58) return "Confidence still forming";
  return "Verification watch";
}

/**
 * Evidence-strength copy for the drawer's StatCard. The confidence tier can read
 * "Strong ..." off a high (often single-prior) confidence number; a single,
 * not-yet-verified source must not present as strong evidence in the same view
 * that shows "1 source check". Cap the "strong" wording in that case only —
 * verified stories and 2+ source stories are unaffected.
 */
function evidenceStrengthDisplay(confidence: number, sources: number, verified: boolean, editorial = false) {
  const context: EvidenceStrengthContext = { sourceCount: sources, verified };
  // `value` is capped by the shared publicConfidenceLabel path via `context`, so
  // the single-source rule lives in exactly one place (shared with the board
  // cards). Only the drawer-specific `detail` band is reconciled here.
  const value = confidenceLabel(confidence, context);
  const detail = confidenceBand(confidence, editorial);
  if (shouldCapSingleSourceStrength(context)) {
    return {
      value,
      detail: /strong/i.test(detail) ? "Single-source evidence; still forming" : detail,
    };
  }
  return { value, detail };
}

function signalTimestamp(signal: SignalDetailLike) {
  return signal.isoTimestamp ?? signal.updated_at ?? signal.created_at ?? signal.timestamp ?? null;
}

function signalTitle(signal: SignalDetailLike) {
  return signal.headline ?? signal.title ?? "Developing story";
}

function signalStorageId(signal: SignalDetailLike) {
  return String(signal.id ?? signalTitle(signal));
}

function signalType(signal: SignalDetailLike, editorial = false) {
  return editorial ? humanizeSignalType(signal.type ?? signal.signal_type) : signal.type ?? signal.signal_type ?? null;
}

function parseAgeMinutes(signal: SignalDetailLike) {
  const absoluteTimestamp = signal.isoTimestamp ?? signal.updated_at ?? signal.created_at;
  if (absoluteTimestamp) {
    const time = new Date(absoluteTimestamp).getTime();
    if (!Number.isNaN(time)) return Math.max(0, Math.round((Date.now() - time) / 60000));
  }

  const value = signal.timestamp?.toLowerCase().trim();
  if (!value) return null;
  const match = value.match(/(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days)/);
  if (!match) return null;
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  if (unit.startsWith("m")) return amount;
  if (unit.startsWith("h")) return amount * 60;
  if (unit.startsWith("d")) return amount * 1440;
  return null;
}

function timingProfile(ageMinutes: number | null) {
  if (ageMinutes === null) {
    return { label: "Timing unavailable", tone: "gray" as Tone, adoption: 0, description: "No first-seen time is attached to this story yet." };
  }
  if (ageMinutes <= 45) {
    return { label: "Early", tone: "green" as Tone, adoption: clamp(18 + ageMinutes * 0.7), description: "Story is still ahead of broad public pickup." };
  }
  if (ageMinutes <= 180) {
    return { label: "Developing", tone: "blue" as Tone, adoption: clamp(42 + ageMinutes * 0.18), description: "Market reaction has started, but verification can still change the read." };
  }
  if (ageMinutes <= 720) {
    return { label: "Widely Known", tone: "gold" as Tone, adoption: clamp(68 + ageMinutes * 0.03), description: "Most of the story may already be reflected publicly." };
  }
  return { label: "Closing", tone: "red" as Tone, adoption: 92, description: "Treat as background context unless a new confirmation changes the story." };
}

function edgeStrength(confidence: number) {
  if (confidence >= 85) return { label: "Strong story read", tone: "green" as Tone };
  if (confidence >= 72) return { label: "Active story read", tone: "blue" as Tone };
  if (confidence >= 58) return { label: "Developing read", tone: "gold" as Tone };
  return { label: "Verification watch", tone: "gray" as Tone };
}

function freshnessLabel(ageMinutes: number | null, fallback?: string | null) {
  if (ageMinutes === null) return fallback ?? "Unavailable";
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  if (ageMinutes < 1440) return `${Math.round(ageMinutes / 60)}h ago`;
  return `${Math.round(ageMinutes / 1440)}d ago`;
}

function timingDetectionLabel(ageMinutes: number | null, fallback?: string | null) {
  if (ageMinutes === null && !fallback) return "Detection time unavailable";
  return `${freshnessLabel(ageMinutes, fallback)} since first detection`;
}

function whyItMatters(signal: SignalDetailLike) {
  return (
    signal.why_it_matters ??
    signal.whyItMatters ??
    signal.summary ??
    signal.matchupEdge ??
    signal.rotationNote ??
    signal.lineupStatus ??
    "This developing story can affect team context, player role, game planning, fan expectations, or timing before the full public picture adjusts."
  );
}

function actionWindow(signal: SignalDetailLike, timing: ReturnType<typeof timingProfile>) {
  if (signal.action_takeaway) return signal.action_takeaway;
  if (timing.label === "Early") return "Early development; confirmation is still spreading.";
  if (timing.label === "Developing") return "Developing story; compare current market reaction to the latest verification state.";
  if (timing.label === "Widely Known") return "Widely known; timing advantage may already be fully priced.";
  if (timing.label === "Closing") return "Cooling story unless a new source or market reset changes the read.";
  return "Monitoring until the story gains stronger confirmation.";
}

function storyContext(signal: SignalDetailLike, sport?: string, editorial = false) {
  const parts = [sport, signal.team, signal.player ?? signal.player_name, signalType(signal, editorial)].filter(Boolean);
  return (editorial ? parts.map((item) => publicStoryText(item)).join(" / ") : parts.join(" / ")) || "Sports context pending";
}

function verificationState(signal: SignalDetailLike, confidence: number, sources: number, editorial = false) {
  const status = (signal.verdict ?? signal.status_tag ?? "").toLowerCase();
  if (!editorial) {
    if (status.includes("confirmed") || status.includes("verified")) return "Verified by agent consensus";
    if (sources >= 3 && confidence >= 72) return "Source-confirmed posture forming";
    if (sources >= 2) return "Corroborated, still developing";
    if (sources === 1) return "Single-source verification watch";
    return "Verification state pending";
  }
  if (status.includes("confirmed") || status.includes("verified")) return "Verified by sources";
  if (sources >= 3 && confidence >= 72) return "Reports aligned";
  if (sources >= 2) return "Corroborated, still developing";
  if (sources === 1) return "Needs more confirmation";
  return "Confirmation pending";
}

function whatChanged(signal: SignalDetailLike, timing: ReturnType<typeof timingProfile>, editorial = false) {
  const movement = signal.lineMovement ?? signal.line_movement;
  const parts = [
    signal.detail ?? signal.summary ?? signalTitle(signal),
    `Watch timing: ${editorial ? publicTimingLabel(timing.label).toLowerCase() : timing.label.toLowerCase()}`,
    movement?.note ?? movement?.direction ?? (movement?.open && movement.current ? `Market reaction moved from ${movement.open} to ${movement.current}` : null),
  ].filter(Boolean);
  const text = parts.join(" ");
  return editorial ? publicStoryText(text) : text;
}

function impactRows(signal: SignalDetailLike) {
  return [
    {
      label: "Team/game impact",
      value: signal.matchupEdge ?? signal.lineupStatus ?? signal.rotationNote ?? "Watch team availability, matchup context, and how public expectations shift.",
    },
  ];
}

function downstreamImpactInput(signal: SignalDetailLike, movement: LineMovementLike | null | undefined) {
  const movementDetail = movement?.open && movement.current ? `Market reaction: ${movement.open} to ${movement.current}` : movement?.note ?? movement?.direction;
  return {
    text: [signalTitle(signal), signal.detail, signal.summary, signal.why_it_matters, signal.whyItMatters, signal.lineupStatus, signal.rotationNote, signal.matchupEdge, signal.type, signal.signal_type].filter(Boolean).join(" "),
    market: movementDetail,
    fantasyRelevance: signal.fantasyRelevance,
    bettingRelevance: signal.bettingRelevance,
    dfsRelevance: /\bdfs\b/i.test([signal.detail, signal.summary, signal.action_takeaway].filter(Boolean).join(" ")),
    fantasyDetail: signal.fantasyRelevance === false ? "No direct fantasy impact flagged." : signal.rotationNote ?? signal.lineupStatus,
    bettingDetail: signal.bettingRelevance === false ? "No direct betting impact flagged." : movementDetail,
  };
}

function confirmWeakenRows(signal: SignalDetailLike, timing: ReturnType<typeof timingProfile>) {
  const sourceCount = readSourceCount(signal);
  return [
    {
      label: "What would confirm this",
      // Only surface the raw strength label when the count actually backs it;
      // a single source must not be described as already corroborated.
      value: (sourceCount >= 2 && signal.confirmationStrength)
        ? signal.confirmationStrength
        : (sourceCount > 1 ? "Another aligned source or official report would strengthen the story." : "A second independent source or official report would strengthen the story."),
    },
    {
      label: "What would weaken this",
      value: "Contradicting team reports, no follow-through in role/lineup context, or market reaction reversing would weaken the read.",
    },
    {
      label: "Next likely chain reaction",
      value: timing.label === "Early" || timing.label === "Developing"
        ? "Expect source updates, market reaction, fantasy projection movement, and team/fan discussion to converge next."
        : "Expect the story to cool unless new evidence restarts the verification trail.",
    },
  ];
}

function confidenceDrivers(signal: SignalDetailLike, ageMinutes: number | null, editorial = false) {
  const confidence = readConfidence(signal);
  const sources = readSourceCount(signal);
  const movement = signal.lineMovement ?? signal.line_movement;
  const hasMovement = Boolean(movement?.open || movement?.current || movement?.note);
  const timingScore = ageMinutes === null ? 45 : clamp(100 - ageMinutes / 8);
  const sourceScore = clamp(sources * 18 + (signal.confirmationStrength ? 14 : 0));
  const sourceQuality = clamp((signal.sourceTypes?.length ?? 0) * 18 + (sources ? 42 : 24));

  return [
    { label: "Source support", value: sources ? sourceScore : Math.max(28, confidence - 35), detail: editorial ? (sources ? sourceCountText(sources) : "Source support pending") : (sources ? `${sources} source checks attached` : "No source checks attached") },
    { label: editorial ? "Source check" : "Source quality", value: sourceQuality, detail: editorial ? publicStoryText(honestConfirmationStrength(signal.confirmationStrength, sources) || "Source check pending") : honestConfirmationStrength(signal.confirmationStrength, sources) || "Source quality not yet scored" },
    { label: "Market reaction", value: hasMovement ? 78 : 36, detail: hasMovement ? "Market movement attached" : "No movement attached yet" },
    { label: "Timing freshness", value: timingScore, detail: freshnessLabel(ageMinutes, signalTimestamp(signal)) },
    {
      label: "Historical calibration",
      value: signal.historicalPatternConfidence ? calibrationDriverValue(signal.historicalPatternConfidence) : confidence ? clamp(confidence - 12) : 42,
      detail: cleanCalibrationText(signal.historicalPatternLabel, confidence ? "Pattern support is being compared qualitatively." : "Settled sample unavailable"),
    },
  ];
}

function sourceRows(signal: SignalDetailLike, editorial = false) {
  if (Array.isArray(signal.sources) && signal.sources.length) {
    return signal.sources.map((source, index) => {
      if (typeof source === "string") return { label: source, type: "Tracked source", status: "Attached" };
      return {
        label: source.name ?? `Source ${index + 1}`,
        type: editorial ? publicStoryText(source.type ?? "Tracked source") : source.type ?? "Tracked source",
        status: editorial ? publicStoryText(source.status ?? "Attached") : source.status ?? "Attached",
      };
    });
  }
  const labels = signal.sourceLabels?.length ? signal.sourceLabels : [];
  const types = signal.sourceTypes?.length ? signal.sourceTypes : [];
  if (labels.length) return labels.map((label, index) => ({ label, type: editorial ? publicStoryText(types[index] ?? "Tracked source") : types[index] ?? "Tracked source", status: "Attached" }));
  if (types.length) return types.map((type, index) => ({ label: `Source ${index + 1}`, type: editorial ? publicStoryText(type) : type, status: "Attached" }));
  return [{ label: "Source trail", type: editorial ? "Source check pending" : "No source checks attached", status: "Pending" }];
}

function trustSummary(signal: SignalDetailLike, confidence: number, sources: number, timing: ReturnType<typeof timingProfile>) {
  const reasons: string[] = [];
  if (sources > 1) reasons.push(`${sources} source checks are attached`);
  else if (sources === 1) reasons.push("one source check is attached");
  else reasons.push("no source checks are attached to this story view");

  if (confidence >= 80) reasons.push("confidence is elevated");
  else if (confidence > 0) reasons.push("confidence is measured, not final");
  else reasons.push("confidence scoring is not available");

  if (timing.label === "Early" || timing.label === "Developing") reasons.push(`${timing.label.toLowerCase()} timing keeps the story live`);
  const movement = signal.lineMovement ?? signal.line_movement;
  if (movement?.open || movement?.current || movement?.note) reasons.push("market reaction is attached");

  return reasons;
}

function calibrationModel(signal: SignalDetailLike, editorial = false): {
  label: string;
  support: string;
  summary: string;
  rows: CalibrationRow[];
  basis: string[];
  confirmationSignals: string[];
  weakeningSignals: string[];
  limitations: string[];
  comparableHistory: string;
} {
  const label = cleanCalibrationText(signal.historicalPatternLabel, "Calibration pending");
  const support = calibrationSupportLabel(signal.historicalPatternConfidence);
  const summary = cleanCalibrationText(
    signal.calibrationSummary,
    "Historical calibration is pending; replay and outcome linkage will appear when comparable evidence is attached.",
  );
  const hasMarket = Boolean(signal.marketReactionWindow || signal.lineMovement?.note || signal.line_movement?.note);
  const rows = [
    {
      label: "Historical pattern",
      value: label,
      detail: support,
    },
    {
      label: "Comparable story type",
      value: cleanCalibrationText(signal.comparableStoryType, signalType(signal) ?? "Comparable story pending"),
      detail: "Matched on safe story dimensions only.",
    },
    {
      label: "Source timing",
      value: cleanCalibrationText(editorial ? publicStoryText(signal.sourceTimingProfile) : signal.sourceTimingProfile, editorial ? "Timing check pending" : "Source timing compared where available"),
      detail: "No timing advantage is claimed without support.",
    },
    {
      label: editorial ? "Source check" : "Source reliability basis",
      value: cleanCalibrationText(editorial ? publicStoryText(signal.sourceReliabilityBasis) : signal.sourceReliabilityBasis, editorial ? "Source check pending" : "Source reliability basis pending"),
      detail: "Uses attached source context where available.",
    },
    {
      label: "Market reaction window",
      value: cleanCalibrationText(signal.marketReactionWindow, hasMarket ? "Comparable movement pattern" : "Market movement support unavailable"),
      detail: "Market context is supporting evidence, not a performance claim.",
    },
  ];
  const basis = cleanCalibrationList(signal.historicalPatternBasis, ["Replay-only comparison until comparable outcome linkage is available."]);
  const confirmationSignals = cleanCalibrationList(signal.confirmationSignals, ["Confirmation signals pending."]);
  const weakeningSignals = cleanCalibrationList(signal.weakeningSignals, ["Weakening signals pending."]);
  const limitations = cleanCalibrationList(signal.calibrationLimitations, ["Outcome linkage unavailable for this story view."]);
  const comparableHistory = cleanCalibrationText(
    signal.accuracyContext?.comparableOutcomes,
    limitations[0] ?? "Comparable outcomes are unavailable until enough settled historical samples are attached.",
  );

  return { label, support, summary, rows, basis, confirmationSignals, weakeningSignals, limitations, comparableHistory };
}

function calibrationDriverValue(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("stronger") || normalized.includes("strong")) return 78;
  if (normalized.includes("directional") || normalized.includes("moderate")) return 66;
  if (normalized.includes("limited")) return 52;
  if (normalized.includes("no_sample") || normalized.includes("insufficient")) return 34;
  return 46;
}

function calibrationSupportLabel(value?: string | null) {
  const normalized = value?.replace(/_/g, " ").trim();
  if (!normalized) return "Support level pending";
  if (/strong/i.test(normalized)) return "Stronger qualitative support";
  if (/directional|moderate/i.test(normalized)) return "Directional qualitative support";
  if (/limited/i.test(normalized)) return "Limited historical support";
  if (/no sample|insufficient/i.test(normalized)) return "Insufficient settled sample";
  return cleanCalibrationText(normalized, "Support level pending");
}

function cleanCalibrationList(values: string[] | null | undefined, fallback: string[]) {
  const cleaned = (values ?? [])
    .map((value) => cleanCalibrationText(value, ""))
    .filter(Boolean);
  return Array.from(new Set(cleaned.length ? cleaned : fallback));
}

function cleanCalibrationText(value: string | number | null | undefined, fallback: string) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const unsupportedClaim = /\b\d+(\.\d+)?%|\bwin rates?\b|\bprediction accuracy\b|\baccurate\b|\bsample counts?\b|\bpositive clv\b|\bguaranteed edge\b|\bagents predict\b/i;
  if (unsupportedClaim.test(text)) return fallback;
  return text;
}

function adoptionBand(value: number) {
  if (value < 40) return "Low public pickup";
  if (value < 70) return "Moderate public pickup";
  if (value < 90) return "Broad public pickup";
  return "Saturated public pickup";
}

function StatCard({ label, value, detail, tone = "gray" }: { label: string; value: string; detail: string; tone?: Tone }) {
  return (
    <div className={`signal-detail-stat is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="signal-detail-section">
      <h3>
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function DriverRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  const meterValue = Math.round(clamp(value));

  return (
    <div className="signal-driver-row">
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <div className="signal-driver-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={meterValue}>
        <i style={{ width: `${meterValue}%` }} />
      </div>
    </div>
  );
}

export function SignalDetailDrawer({ open, signal, sport, onClose }: SignalDetailDrawerProps) {
  const [watching, setWatching] = useState(false);
  const [following, setFollowing] = useState(false);
  const [alertLevel, setAlertLevel] = useState<"major" | "all">("major");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const editorialCopy = sport === "MLB" || sport === "NBA";

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previousActiveElement?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !signal) return;
    const id = signalStorageId(signal);
    try {
      const followed = JSON.parse(window.localStorage.getItem("edgesetter.followedSignals") ?? "[]") as string[];
      const watched = JSON.parse(window.localStorage.getItem("edgesetter.watchlistSignals") ?? "[]") as string[];
      const recent = JSON.parse(window.localStorage.getItem("edgesetter.recentSignals") ?? "[]") as Array<{ id: string; title: string; sport?: string; viewedAt: string }>;
      setFollowing(followed.includes(id));
      setWatching(watched.includes(id));
      window.localStorage.setItem(
        "edgesetter.recentSignals",
        JSON.stringify([{ id, title: signalTitle(signal), sport, viewedAt: new Date().toISOString() }, ...recent.filter(item => item.id !== id)].slice(0, 8))
      );
    } catch {
      setFollowing(false);
      setWatching(false);
    }
  }, [open, signal, sport]);

  const toggleStoredSignal = (key: string, active: boolean, setter: (value: boolean) => void) => {
    if (!signal) return;
    const id = signalStorageId(signal);
    try {
      const current = JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[];
      const next = active ? current.filter(item => item !== id) : [id, ...current.filter(item => item !== id)].slice(0, 30);
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Local persistence is a convenience; the visible state should still update.
    }
    setter(!active);
  };

  const model = useMemo(() => {
    if (!signal) return null;
    const confidence = readConfidence(signal);
    const ageMinutes = parseAgeMinutes(signal);
    const timing = timingProfile(ageMinutes);
    const edge = edgeStrength(confidence);
    const sources = readSourceCount(signal);
    return {
      confidence,
      ageMinutes,
      timing,
      edge,
      sources,
      drivers: confidenceDrivers(signal, ageMinutes, editorialCopy),
      rows: sourceRows(signal, editorialCopy),
      trust: trustSummary(signal, confidence, sources, timing),
      calibration: calibrationModel(signal, editorialCopy),
    };
  }, [editorialCopy, signal]);

  if (!open || !signal || !model) return null;

  const movement = signal.lineMovement ?? signal.line_movement;
  const hasLineMovement = Boolean(movement?.open || movement?.current);
  const hasMovementContext = Boolean(hasLineMovement || movement?.note || movement?.direction);
  const adoptionValue = Math.round(model.timing.adoption);
  const metaParts = [signalType(signal, editorialCopy), signal.team, signal.player ?? signal.player_name, freshnessLabel(model.ageMinutes, signalTimestamp(signal))].filter(Boolean);
  const meta = editorialCopy ? metaParts.map((item) => publicStoryText(item)).join(" / ") : metaParts.join(" / ");
  const storyContextLabel = storyContext(signal, sport, editorialCopy);
  const storyVerificationState = verificationState(signal, model.confidence, model.sources, editorialCopy);
  // Evidence-grounded verification word (Verified / Escalating / Developing) from the
  // shared engine, via the single client seam the board story card also uses — so the
  // card and this drawer can never disagree for the same underlying signal.
  const verificationWord = deriveSignalVerificationState(signal);
  const evidenceStrength = evidenceStrengthDisplay(model.confidence, model.sources, verificationWord.state === "Verified", editorialCopy);
  const storyImpactRows = impactRows(signal);
  const downstreamImpacts = storyImpactSections(downstreamImpactInput(signal, movement));
  const nextRows = confirmWeakenRows(signal, model.timing);
  const calibrationInput = {
    confidence: model.confidence,
    sourceCount: model.sources,
    timingLabel: editorialCopy ? publicTimingLabel(signal.sourceTimingProfile ?? model.timing.label, sport) : signal.sourceTimingProfile ?? model.timing.label,
    storyType: editorialCopy ? publicStoryText(signal.comparableStoryType ?? signal.historicalPatternLabel ?? signalType(signal, editorialCopy) ?? signal.title ?? signal.headline, sport) : signal.comparableStoryType ?? signal.historicalPatternLabel ?? signalType(signal) ?? signal.title ?? signal.headline,
    marketReaction: editorialCopy ? publicStoryText(signal.marketReactionWindow ?? (movement?.open && movement.current ? `${movement.open} to ${movement.current}` : movement?.note ?? movement?.direction ?? null), sport) : signal.marketReactionWindow ?? (movement?.open && movement.current ? `${movement.open} to ${movement.current}` : movement?.note ?? movement?.direction ?? null),
    sourceSummary: editorialCopy ? publicStoryText(signal.sourceReliabilityBasis ?? signal.confirmationStrength) : signal.sourceReliabilityBasis ?? signal.confirmationStrength,
  };
  const drawerImageAsset = resolveSportsImageAsset({
    league: sport,
    team: signal.team,
    player: signal.player ?? signal.player_name,
    storyType: signalType(signal, editorialCopy) ?? signal.historicalPatternLabel ?? "Story brief",
    slot: "drawer",
  });

  return (
    <div className="signal-detail-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="signal-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Developing story intelligence detail"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="signal-detail-header">
          <div>
            <div className="signal-detail-kicker">{sport ? `EdgeSetter / ${sport} story desk` : "EdgeSetter story desk"}</div>
            <h2 className="signal-detail-title">{editorialCopy ? publicStoryText(signalTitle(signal), sport) : signalTitle(signal)}</h2>
            <div className="signal-detail-meta">{meta}</div>
          </div>
          <button ref={closeButtonRef} className="signal-detail-close ux-button-interactive" type="button" onClick={onClose} aria-label="Close developing story detail">
            <X size={18} />
          </button>
        </header>

        <div className="signal-detail-sections">
          {/* North Star: timing advantage callout — THIS DISPLAY MUST NEVER BE REMOVED.
              Verified story + measurable lead time → the proof of EdgeSetter's edge. */}
          {signal.detectionLeadTime && (
            <div
              data-testid="timing-advantage-callout"
              style={{
                padding: "10px 14px",
                marginBottom: 4,
                borderRadius: 6,
                border: "1px solid rgba(45,212,191,0.4)",
                background: "rgba(45,212,191,0.10)",
                color: "#2DD4BF",
                fontWeight: 800,
                fontSize: 14,
                lineHeight: 1.35,
                letterSpacing: "0.02em",
                textAlign: "center",
              }}
            >
              {signal.detectionLeadKind === "pickup"
                ? <>⚡ Detected {signal.detectionLeadTime} before national pickup</>
                : <>⚡ EdgeSetter flagged {signal.detectionLeadTime} before public confirmation</>}
            </div>
          )}
          <SportsStoryVisual
            className="signal-detail-media-slot"
            league={sport}
            primaryTeam={signal.team ?? undefined}
            player={signal.player ?? signal.player_name ?? undefined}
            title={signalTitle(signal)}
            storyType={signalType(signal, editorialCopy) ?? "Developing story"}
            detail={storyVerificationState}
            size="compact"
            imageAsset={drawerImageAsset}
          />

          <Section title="Developing story" icon={<CheckCircle2 size={14} />}>
            <div className="signal-source-summary">
              <strong>{storyContextLabel}</strong>
              <span>{storyVerificationState}</span>
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
              <AgentCalibrationBadge input={calibrationInput} copyVariant={editorialCopy ? "editorial" : "legacy"} />
            </div>
            <p>{editorialCopy ? publicStoryText(signal.detail ?? signal.summary ?? signalTitle(signal), sport) : signal.detail ?? signal.summary ?? signalTitle(signal)}</p>
          </Section>

          <Section title="What changed" icon={<Clock3 size={14} />}>
            <p>{whatChanged(signal, model.timing, editorialCopy)}</p>
          </Section>

          <Section title="Why it matters" icon={<TrendingUp size={14} />}>
            <p>{whyItMatters(signal)}</p>
            <div className="signal-accuracy-grid">
              {storyImpactRows.map((row) => (
                <div className="signal-accuracy-card" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </Section>

          <Section title="What to watch next" icon={<Clock3 size={14} />}>
            <div className={`signal-action-window is-${model.timing.tone}`}>
              <strong>{model.timing.label === "Closing" ? "Cooling story" : model.timing.label === "Widely Known" ? "Diminishing timing advantage" : "Window open"}</strong>
              <p>{actionWindow(signal, model.timing)}</p>
            </div>
            <WhatToWatchNext confirm={nextRows[0].value} weaken={nextRows[1].value} next={nextRows[2].value} />
          </Section>

          <Section title="Source trail / timing / evidence" icon={<ShieldCheck size={14} />}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: 16, paddingTop: 4 }}>
              <div
                data-testid="verification-state-word"
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 30,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color:
                    verificationWord.state === "Verified"
                      ? "#18D47B"
                      : verificationWord.state === "Escalating"
                        ? "#F5B841"
                        : "rgba(248,250,252,0.62)",
                }}
              >
                {verificationWord.state}
              </div>
              <div style={{ maxWidth: 280, textAlign: "center", fontSize: 12, lineHeight: 1.4, color: "rgba(248,250,252,0.6)" }}>
                {verificationWord.basis}
              </div>
            </div>
{signal.detectionLeadTime && (
  <div style={{ textAlign: "center", color: "#2DD4BF", fontWeight: 700, fontSize: 13, marginBottom: 12, letterSpacing: "0.03em" }}>
    {signal.detectionLeadKind === "pickup"
      ? <>⚡ Detected {signal.detectionLeadTime} before national pickup</>
      : <>⚡ EdgeSetter flagged this {signal.detectionLeadTime} before public confirmation</>}
  </div>
)}
            <div className="signal-detail-stat-grid">
              <StatCard label="Evidence strength" value={evidenceStrength.value} detail={evidenceStrength.detail} tone={model.confidence ? (model.confidence >= 80 ? "green" : "blue") : "gray"} />
              <StatCard label="Verification state" value={verificationWord.state} detail={verificationWord.basis} tone={model.edge.tone} />
              <StatCard label="Watch timing" value={model.timing.label} detail={model.timing.description} tone={model.timing.tone} />
              <StatCard label="Replay freshness" value={freshnessLabel(model.ageMinutes, signalTimestamp(signal))} detail="Detection age" tone={model.ageMinutes !== null && model.ageMinutes <= 45 ? "green" : "gray"} />
            </div>
            <div className="signal-source-summary">
              <strong>{editorialCopy ? (model.sources ? sourceCountText(model.sources) : "Source check pending") : model.sources ? `${model.sources} source checks attached` : "No source checks attached"}</strong>
              <span>{editorialCopy ? publicStoryText(honestConfirmationStrength(signal.confirmationStrength, model.sources) || "Source support is not available for this story view.") : honestConfirmationStrength(signal.confirmationStrength, model.sources) || "Source support is not available for this story view."}</span>
            </div>
            <div className="signal-trust-stack">
              {model.trust.map((reason) => (
                <div className="signal-trust-row" key={reason}>
                  <CheckCircle2 size={13} />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
            <div className="signal-source-stack">
              {model.rows.map((row) => (
                <div
                  className={`source-row-item ${row.status.toLowerCase() === "attached" ? "signal-source-row es-source-confirm" : "signal-source-row"}`}
                  data-tier={row.type}
                  key={`${row.label}-${row.type}`}
                >
                  <span>{row.label}</span>
                  <small>{row.type}</small>
                  <b>{row.status}</b>
                </div>
              ))}
            </div>
          </Section>

          {downstreamImpacts.map((impact) => (
            <Section key={impact.label} title={impact.label} icon={<TrendingUp size={14} />}>
              {impact.label === "Betting/market impact" && hasMovementContext ? (
                <div className="signal-movement-card">
                  {hasLineMovement && (
                    <>
                      <div className="signal-movement-row">
                        <span>Opening</span>
                        <strong>{movement?.open ?? "Unavailable"}</strong>
                      </div>
                      <div className="signal-movement-track" role="img" aria-label="Market reaction from opening line to current line">
                        <i />
                      </div>
                      <div className="signal-movement-row">
                        <span>Current</span>
                        <strong>{movement?.current ?? "Unavailable"}</strong>
                      </div>
                    </>
                  )}
                  <div className="signal-movement-note">
                    <TrendingUp size={14} />
                    {impact.value}
                  </div>
                </div>
              ) : (
                <p>{impact.value}</p>
              )}
            </Section>
          ))}

          <Section title={editorialCopy ? "Source trail" : "EdgeSetter evidence layer"} icon={<LineChart size={14} />}>
            <div className="mb-2 grid min-w-0 gap-1.5 sm:grid-cols-2">
              <HistoricalPatternMatch input={calibrationInput} />
              <ChainReactionPreview input={calibrationInput} />
            </div>
            <div className="signal-driver-stack">
              {model.drivers.map((driver) => (
                <DriverRow key={driver.label} {...driver} />
              ))}
            </div>
          </Section>

          <Section title="Replay trail" icon={<Clock3 size={14} />}>
            <div className="signal-timing-card">
              <div>
                <strong>{model.timing.label}</strong>
                <span>{timingDetectionLabel(model.ageMinutes, signalTimestamp(signal))}</span>
              </div>
              <div className="signal-adoption-meter" role="meter" aria-label="Estimated market adoption" aria-valuemin={0} aria-valuemax={100} aria-valuenow={adoptionValue}>
                <i style={{ width: `${adoptionValue}%` }} />
              </div>
              <small>{adoptionBand(adoptionValue)}</small>
            </div>
          </Section>

          <Section title="Historical calibration" icon={<History size={14} />}>
            <div className="signal-source-summary">
              <strong>{model.calibration.label}</strong>
              <span>{model.calibration.summary}</span>
            </div>
            <div className="signal-accuracy-grid">
              {model.calibration.rows.map((row) => (
                <div className="signal-accuracy-card" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                  <small>{row.detail}</small>
                </div>
              ))}
            </div>
            <div className="signal-trust-stack">
              {model.calibration.basis.map((item) => (
                <div className="signal-trust-row" key={item}>
                  <CheckCircle2 size={13} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="signal-accuracy-grid">
              <div className="signal-accuracy-card">
                <span>Confirmation signals</span>
                <strong>{model.calibration.confirmationSignals[0]}</strong>
                <small>{model.calibration.confirmationSignals.slice(1).join(" / ") || "Additional confirmation not attached."}</small>
              </div>
              <div className="signal-accuracy-card">
                <span>Weakening signals</span>
                <strong>{model.calibration.weakeningSignals[0]}</strong>
                <small>{model.calibration.weakeningSignals.slice(1).join(" / ") || "Additional weakening signal not attached."}</small>
              </div>
            </div>
            <div className="signal-empty-inline">{model.calibration.limitations.join(" ")}</div>
          </Section>

          <Section title="Comparable story history" icon={<LineChart size={14} />}>
            <p>{model.calibration.comparableHistory}</p>
          </Section>

          <Section title="Follow-up watch" icon={<Bell size={14} />}>
            <div className="signal-alert-preview">
              <div>
                <strong>{following ? "Following updates on this story" : "Follow this story for update tracking"}</strong>
                <span>{following ? "This story is marked for your next coverage review." : "Keep this story in your local follow-up queue."}</span>
              </div>
              <div className="signal-alert-options" role="group" aria-label="Alert preference preview">
                <button type="button" className={alertLevel === "major" ? "is-active" : ""} onClick={() => setAlertLevel("major")}>Major changes</button>
                <button type="button" className={alertLevel === "all" ? "is-active" : ""} onClick={() => setAlertLevel("all")}>All updates</button>
              </div>
            </div>
          </Section>
        </div>

        <footer className="signal-detail-footer">
          <div>
            <strong>{model.edge.label}</strong>
            <span>{actionWindow(signal, model.timing)}</span>
          </div>
          <div className="signal-detail-footer-actions">
            <button className="ux-button-interactive" type="button" aria-pressed={following} onClick={() => toggleStoredSignal("edgesetter.followedSignals", following, setFollowing)}>
              <Bell size={15} />
              {following ? "Following" : "Follow story"}
            </button>
            <button className="ux-button-interactive" type="button" aria-pressed={watching} onClick={() => toggleStoredSignal("edgesetter.watchlistSignals", watching, setWatching)}>
              <Bookmark size={15} />
              {watching ? "Saved" : "Save story"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
