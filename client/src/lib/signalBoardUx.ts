export type SignalLifecycle = "Early" | "Developing" | "Confirmed" | "Widely Known" | "Expiring" | "Stale";
export type OperationalLifecycle =
  | "Detected"
  | "Developing"
  | "Escalating"
  | "Verified"
  | "Context Moving"
  | "Consensus Forming"
  | "Resolved / Stale";
export type BoardSortMode = "priority" | "newest" | "confidence" | "timing" | "movement";

export function boardSortFeedback(mode: BoardSortMode) {
  if (mode === "confidence") return "Showing stories with the strongest agent-calibrated confidence first.";
  if (mode === "newest") return "Showing newest verified developments first.";
  if (mode === "timing") return "Showing stories with the clearest timing window first.";
  if (mode === "movement") return "Showing stories with market reaction or urgent context changes first.";
  return "Showing strongest developing stories first.";
}

export function boardFilterFeedback({
  filter,
  liveOnly,
  actionableOnly,
}: {
  filter?: string | null;
  liveOnly?: boolean;
  actionableOnly?: boolean;
}) {
  const parts: string[] = [];
  if (filter && filter.toLowerCase() !== "today" && filter.toLowerCase() !== "signal stream") {
    parts.push(`Filtered to ${filter}.`);
  }
  if (liveOnly) parts.push("Limited to early or developing stories.");
  if (actionableOnly) parts.push("Displaying stories with a defined timing window.");
  return parts.join(" ");
}

export type BoardSignalLike = {
  confidence?: number | string | null;
  confidence_score?: number | string | null;
  verdict?: string | null;
  status_tag?: string | null;
  timestamp?: string | null;
  isoTimestamp?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  lineMovement?: unknown;
  action_takeaway?: string | null;
  actionTakeaway?: string | null;
  sources?: number | string | null;
  source_count?: number | string | null;
  sourceLabels?: string[] | null;
  sourceTypes?: string[] | null;
  confirmationStrength?: string | null;
  type?: string | null;
  _score?: { totalScore?: number | null; urgencyLabel?: string | null } | null;
};

export function signalConfidence(signal: BoardSignalLike) {
  const raw = signal.confidence ?? signal.confidence_score;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

export function signalAgeMinutes(signal: BoardSignalLike) {
  const absolute = signal.isoTimestamp ?? signal.updated_at ?? signal.created_at;
  if (absolute) {
    const time = new Date(absolute).getTime();
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

export function signalLifecycle(signal: BoardSignalLike): SignalLifecycle {
  const verdict = (signal.verdict ?? signal.status_tag ?? "").toLowerCase();
  const age = signalAgeMinutes(signal);
  if (verdict.includes("confirmed") || verdict.includes("verified")) return "Confirmed";
  if (age === null) return "Developing";
  if (age <= 45) return "Early";
  if (age <= 180) return "Developing";
  if (age <= 720) return "Widely Known";
  if (age <= 1440) return "Expiring";
  return "Stale";
}

export function signalHasMovement(signal: BoardSignalLike) {
  return Boolean(signal.lineMovement) || (signal._score?.urgencyLabel ?? "").toLowerCase() === "urgent";
}

export function signalIsActionable(signal: BoardSignalLike) {
  const state = signalLifecycle(signal);
  return Boolean(signal.action_takeaway ?? signal.actionTakeaway) && state !== "Stale";
}

export function signalPriorityScore(signal: BoardSignalLike) {
  const confidence = signalConfidence(signal);
  const state = signalLifecycle(signal);
  const stateBoost: Record<SignalLifecycle, number> = {
    Early: 24,
    Developing: 16,
    Confirmed: 18,
    "Widely Known": 4,
    Expiring: -8,
    Stale: -20,
  };
  const sourceCount = typeof signal.sources === "number" ? signal.sources : typeof signal.source_count === "number" ? signal.source_count : signal.sourceLabels?.length ?? 0;
  const movementBoost = signalHasMovement(signal) ? 10 : 0;
  return (signal._score?.totalScore ?? confidence) + stateBoost[state] + movementBoost + Math.min(sourceCount * 2, 10);
}

export function compareSignals(a: BoardSignalLike, b: BoardSignalLike, mode: BoardSortMode) {
  if (mode === "confidence") return signalConfidence(b) - signalConfidence(a);
  if (mode === "newest") return (signalAgeMinutes(a) ?? 999999) - (signalAgeMinutes(b) ?? 999999);
  if (mode === "timing") return lifecycleRank(a) - lifecycleRank(b);
  if (mode === "movement") return Number(signalHasMovement(b)) - Number(signalHasMovement(a)) || signalPriorityScore(b) - signalPriorityScore(a);
  return signalPriorityScore(b) - signalPriorityScore(a);
}

function lifecycleRank(signal: BoardSignalLike) {
  const ranks: Record<SignalLifecycle, number> = { Early: 0, Developing: 1, Confirmed: 2, "Widely Known": 3, Expiring: 4, Stale: 5 };
  return ranks[signalLifecycle(signal)];
}

export function lifecycleTone(state: SignalLifecycle) {
  if (state === "Early" || state === "Confirmed") return "#00E676";
  if (state === "Developing") return "#00B7FF";
  if (state === "Widely Known") return "#F5B841";
  if (state === "Expiring") return "#FF8A00";
  return "#94A3B8";
}

export function signalSourceCount(signal: BoardSignalLike) {
  if (typeof signal.sources === "number") return signal.sources;
  if (typeof signal.sources === "string") {
    const parsed = Number.parseInt(signal.sources, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof signal.source_count === "number") return signal.source_count;
  if (typeof signal.source_count === "string") {
    const parsed = Number.parseInt(signal.source_count, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return signal.sourceLabels?.length ?? 0;
}

export function signalTrustReasons(signal: BoardSignalLike) {
  const reasons: string[] = [];
  const sources = signalSourceCount(signal);
  const confidence = signalConfidence(signal);
  const lifecycle = signalLifecycle(signal);

  if (sources > 1) reasons.push(`${sources} source checks`);
  else if (sources === 1) reasons.push("1 source check");

  if (signal.confirmationStrength) reasons.push(signal.confirmationStrength);
  if (confidence >= 80) reasons.push("agent confidence high");
  if (signalHasMovement(signal)) reasons.push("context shifted");
  if (lifecycle === "Early") reasons.push("early timing");
  if (lifecycle === "Confirmed") reasons.push("confirmed status");

  return reasons.slice(0, 3);
}

export function signalTrustLabel(signal: BoardSignalLike) {
  const reasons = signalTrustReasons(signal);
  if (reasons.length) return reasons.join(" / ");
  return "Verification state pending";
}

export function signalOperationalLifecycle(signal: BoardSignalLike): OperationalLifecycle {
  const lifecycle = signalLifecycle(signal);
  const verdict = (signal.verdict ?? signal.status_tag ?? "").toLowerCase();
  const confirmation = (signal.confirmationStrength ?? "").toLowerCase();
  const hasMovement = signalHasMovement(signal);

  if (lifecycle === "Stale" || lifecycle === "Expiring") return "Resolved / Stale";
  if (hasMovement && !verdict.includes("confirmed") && !verdict.includes("verified")) return "Context Moving";
  if (verdict.includes("confirmed") || verdict.includes("verified") || confirmation.includes("official")) return "Verified";
  if (confirmation.includes("consensus") || signalSourceCount(signal) >= 3) return "Consensus Forming";
  if (hasMovement || signalConfidence(signal) >= 82) return "Escalating";
  if (lifecycle === "Early") return "Detected";
  return "Developing";
}

export function signalConfidenceNarrative(signal: BoardSignalLike) {
  const confidence = signalConfidence(signal);
  const sourceCount = signalSourceCount(signal);
  const lifecycle = signalLifecycle(signal);
  const drivers = [
    sourceCount > 1 ? `${sourceCount} reports aligned` : sourceCount === 1 ? "single-report read" : null,
    officialSourcePresent(signal) ? "official report attached" : null,
    signalHasMovement(signal) ? "market reaction" : null,
    lifecycle === "Early" ? "early development" : lifecycle === "Confirmed" ? "public confirmation" : null,
  ].filter(Boolean);

  if (confidence >= 85) return `Strong evidence support: ${drivers.join(" / ") || "verification is mature"}`;
  if (confidence >= 70) return `Evidence support building: ${drivers.join(" / ") || "waiting on next validator"}`;
  if (confidence >= 55) return `Early evidence support: ${drivers.join(" / ") || "verification still thin"}`;
  return `Thin evidence watch: ${drivers.join(" / ") || "needs stronger confirmation"}`;
}

export function signalSourceSummary(signal: BoardSignalLike) {
  const labels = signal.sourceLabels ?? [];
  const sourceCount = signalSourceCount(signal);
  const confirmation = (signal.confirmationStrength ?? "").toLowerCase();
  const hasOfficial = officialSourcePresent(signal);
  const hasMarket = marketSourcePresent(signal) || signalHasMovement(signal);
  const localBeat = labels.find((label) => /beat|athletic|post|sentinel|247|on3|warriors/i.test(label));

  if (confirmation.includes("consensus")) return hasOfficial ? "Official + source agreement" : "Source agreement forming";
  if (hasOfficial && localBeat) return "Official report + local beat";
  if (hasOfficial) return "Official report attached";
  if (hasMarket && sourceCount > 1) return "Market reaction + reporting";
  if (localBeat) return `Local beat: ${localBeat}`;
  if (sourceCount > 1) return `${sourceCount} independent source checks`;
  if (sourceCount === 1 || labels.length === 1) return `Single source: ${labels[0] ?? "attached"}`;
  return "Source agreement pending";
}

export function signalTimingAdvantage(signal: BoardSignalLike) {
  const lifecycle = signalLifecycle(signal);
  const hasMovement = signalHasMovement(signal);
  const verdict = (signal.verdict ?? signal.status_tag ?? "").toLowerCase();

  if (lifecycle === "Early" && !hasMovement) return "early development; context quiet";
  if (lifecycle === "Early" && hasMovement) return "sports context moving";
  if (lifecycle === "Developing" && !hasMovement) return "developing window; verification still forming";
  if (lifecycle === "Developing" && hasMovement) return "partially priced; status still forming";
  if (verdict.includes("confirmed") || lifecycle === "Confirmed") return hasMovement ? "public confirmation; context shifted" : "public confirmation";
  if (lifecycle === "Widely Known") return "widely known; fully priced";
  if (lifecycle === "Stale" || lifecycle === "Expiring") return "stale signal; no remaining edge";
  return "monitoring only";
}

export function signalMarketReaction(signal: BoardSignalLike) {
  if (!signalHasMovement(signal)) return "market reaction quiet";
  const movement = signal.lineMovement as { open?: string; current?: string; note?: string } | null | undefined;
  const fromTo = movement?.open && movement.current ? `${movement.open} -> ${movement.current}` : "Context shifted";
  const verdict = (signal.verdict ?? signal.status_tag ?? "").toLowerCase();
  const type = (signal.type ?? "").toLowerCase();
  if (type.includes("line")) return `${fromTo}; market reaction as supporting context`;
  if (!verdict.includes("confirmed") && !verdict.includes("verified")) return `${fromTo}; market reaction before official confirmation`;
  return `${fromTo}; market reaction supporting confirmed context`;
}

export function signalReplayChain(signal: BoardSignalLike): string[] {
  const chain = ["Story detected"];
  const sourceCount = signalSourceCount(signal);
  if (sourceCount > 0) chain.push(sourceCount > 1 ? "Reports aligned" : "Source attached");
  if (signalHasMovement(signal)) chain.push("Market reacted");
  const lifecycle = signalLifecycle(signal);
  const confirmation = (signal.confirmationStrength ?? "").toLowerCase();
  if (lifecycle === "Confirmed" || confirmation.includes("consensus")) chain.push("Verified");
  if (lifecycle === "Widely Known") chain.push("Public story");
  if (lifecycle === "Expiring" || lifecycle === "Stale") chain.push("Cooling");
  return chain.slice(0, 4);
}

function officialSourcePresent(signal: BoardSignalLike) {
  const text = [...(signal.sourceLabels ?? []), ...(signal.sourceTypes ?? [])].join(" ").toLowerCase();
  return text.includes("official") || text.includes("injury report") || text.includes("depth chart") || text.includes("transaction wire");
}

function marketSourcePresent(signal: BoardSignalLike) {
  const text = [...(signal.sourceLabels ?? []), ...(signal.sourceTypes ?? [])].join(" ").toLowerCase();
  return /pinnacle|circa|draftkings|sportsbook|action network|line tracking|sharp/.test(text);
}
