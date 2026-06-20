// ─────────────────────────────────────────────────────────────────────────────
// EdgeSetter — Canonical Situation Types
// Source of truth for situation shape used by ranker, comparator, and all
// display surfaces.
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationState =
  | "verified"
  | "escalating"
  | "developing"
  // Pipeline-internal states that must never reach the UI raw:
  | "monitoring"
  | "emerging"
  | "watch"
  | "background"
  | "being_verified";

export interface CanonicalSituationRecord {
  id: string;
  league: string;
  signalType: string;        // e.g. "injury_update", "weather_advisory"
  verificationState: VerificationState;
  confidenceScore: number;   // 0–100
  firstDetected: string;     // ISO timestamp
  latest_snapshot_at: string; // ISO timestamp
  /** ISO timestamp of the game this situation is most relevant to, if known */
  gameDate?: string;
  /** Public confirmation timestamp, if it exists */
  publicConfirmation?: string;
  title?: string;
  body?: string;
  detail?: string;
  teamToken?: string;
  playerName?: string;
  sourceCount?: number;
  sourcesAgree?: boolean;
  detectionLeadMinutes?: number;
}

// SituationRowData — the display-layer projection of a situation
export interface SituationRowData {
  id: string;
  league: string;
  signalType: string;
  verificationState: VerificationState;
  confidenceScore: number;
  firstDetected: string;
  latest_snapshot_at: string;
  gameDate?: string;
  publicConfirmation?: string;
  title?: string;
  body?: string;
  detail?: string;
  teamToken?: string;
  playerName?: string;
  sourceCount?: number;
  sourcesAgree?: boolean;
  detectionLeadMinutes?: number;
}
