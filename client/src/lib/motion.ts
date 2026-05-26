export const motionClasses = {
  liveDot: "es-live-dot",
  livePulse: "es-live-dot es-live-pulse",
  subtleLiveDot: "es-live-dot es-live-dot-subtle",
  escalationGlow: "es-state-escalated",
  confidenceIncrease: "es-confidence-up",
  confidenceDecrease: "es-confidence-down",
  newUpdateFlash: "es-update-flash",
  sourceConfirmationPing: "es-source-confirm",
  tickerEntry: "es-ticker-enter",
  skeletonShimmer: "es-skeleton",
  reducedMotionSafe: "es-motion-safe",
  stateMonitoring: "es-state-monitoring",
  stateDeveloping: "es-state-developing",
  stateVerified: "es-state-verified",
  stateOfficial: "es-state-official",
  ambientSport: "es-ambient-sport",
} as const;

export type MotionState =
  | "LIVE"
  | "MONITORING"
  | "DEVELOPING"
  | "ESCALATED"
  | "VERIFIED"
  | "OFFICIAL"
  | "WATCH"
  | "CONFIRMED"
  | "RESOLVED";

export function liveIndicatorClass(active: boolean) {
  return active ? motionClasses.livePulse : motionClasses.subtleLiveDot;
}

export function statusMotionClass(state?: string | null) {
  const normalized = (state ?? "").toUpperCase() as MotionState;
  if (normalized === "LIVE") return motionClasses.livePulse;
  if (normalized === "ESCALATED") return motionClasses.escalationGlow;
  if (normalized === "DEVELOPING") return motionClasses.stateDeveloping;
  if (normalized === "OFFICIAL") return motionClasses.stateOfficial;
  if (normalized === "VERIFIED" || normalized === "CONFIRMED") return motionClasses.stateVerified;
  return motionClasses.stateMonitoring;
}

export function confidenceMotionClass(previous?: number | null, next?: number | null) {
  if (previous == null || next == null || previous === next) return "";
  return next > previous ? motionClasses.confidenceIncrease : motionClasses.confidenceDecrease;
}
