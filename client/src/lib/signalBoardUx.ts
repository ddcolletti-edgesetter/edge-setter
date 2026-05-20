export type SignalLifecycle = "Early" | "Developing" | "Confirmed" | "Widely Known" | "Expiring" | "Stale";
export type BoardSortMode = "priority" | "newest" | "confidence" | "timing" | "movement";

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
  confirmationStrength?: string | null;
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

  if (sources > 1) reasons.push(`${sources} confirmations`);
  else if (sources === 1) reasons.push("1 confirmation");

  if (signal.confirmationStrength) reasons.push(signal.confirmationStrength);
  if (confidence >= 80) reasons.push("high confidence");
  if (signalHasMovement(signal)) reasons.push("market moved");
  if (lifecycle === "Early") reasons.push("early timing");
  if (lifecycle === "Confirmed") reasons.push("confirmed status");

  return reasons.slice(0, 3);
}

export function signalTrustLabel(signal: BoardSignalLike) {
  const reasons = signalTrustReasons(signal);
  if (reasons.length) return reasons.join(" / ");
  return "Verification context pending";
}
