/**
 * Edge Setter — Shared Verification-State engine
 *
 * Single source of truth for the public verification state word we show in
 * place of a raw confidence percentage. The North Star posture is to surface
 * one of three evidence-grounded words — "Verified" / "Escalating" /
 * "Developing" — never a bare number.
 *
 * Two confidence lineages feed this engine, each computing different raw
 * numbers from the same underlying signals:
 *   - live_signals (LiveSignal, signalsApi.ts) — the homepage/board lineage
 *   - CanonicalSituation (situationsApi.ts) — the /story lineage
 * Each has its own adapter (`evidenceFromLiveSignal` /
 * `evidenceFromCanonical`) that maps its real fields into the shared
 * `VerificationEvidence` shape, so the decision logic lives in exactly one
 * place and both lineages reach a real "Verified" state on the same rules.
 *
 * This module is framework-agnostic (mirrors the pattern in
 * @shared/pro-utils) and is safe to import from both client and server via
 * the "@shared/*" path alias. The adapters take minimal structural input
 * shapes so this module never depends on client- or server-only types; the
 * real LiveSignal / CanonicalSituation objects satisfy those shapes
 * structurally.
 *
 * NOTE: this is the engine only. Wiring the 11 percentage-display sites onto
 * this word is a separate, later step.
 */

/** The three public-facing verification words. Nothing else may reach the UI. */
export type VerificationStateWord = "Verified" | "Escalating" | "Developing";

/** Result of a verification-state derivation: the word plus a plain-language basis. */
export interface VerificationStateResult {
  readonly state: VerificationStateWord;
  /** Human-readable justification for the chosen state (for tooltips / detail cards). */
  readonly basis: string;
}

/**
 * Lineage-agnostic evidence bundle. Both adapters produce this; the decision
 * function consumes only this. Every field is a settled boolean/string so the
 * decision never touches a raw confidence number.
 */
export interface VerificationEvidence {
  /** Contradicting evidence is on record — suppresses the state regardless of anything else. */
  readonly contradicted: boolean;
  /** An official league/team source has confirmed the situation. */
  readonly officialConfirmation: boolean;
  /** Normalized primary verdict. "confirmed" is the promotable verdict. */
  readonly verdict: string;
  /** Two or more independent sources corroborate (source count >= 2 or a consensus tier). */
  readonly independentCorroboration: boolean;
  /** Confirmation-strength tier: "Consensus" | "Corroborated" | "Developing" | "Official" | "Unverified". */
  readonly confirmationTier: string;
  /** Market / line movement is attached to the situation. */
  readonly marketReaction: boolean;
}

/**
 * The core decision. Pure, deterministic, and the only place the state words
 * are chosen. Order matters — earlier branches win:
 *
 *   1. contradicted                                              -> Developing
 *   2. officialConfirmation                                      -> Verified
 *   3. verdict "confirmed" + (official OR independent corrob.)   -> Verified
 *   4. verdict "confirmed" alone                                 -> Escalating
 *   5. Corroborated tier OR independent corrob. OR market react. -> Escalating
 *   6. otherwise                                                 -> Developing
 */
export function deriveVerificationState(evidence: VerificationEvidence): VerificationStateResult {
  if (evidence.contradicted) {
    return { state: "Developing", basis: "Contradicting evidence is on record; held as developing until it resolves." };
  }

  if (evidence.officialConfirmation) {
    return { state: "Verified", basis: "An official source has confirmed this situation." };
  }

  if (evidence.verdict === "confirmed" && (evidence.officialConfirmation || evidence.independentCorroboration)) {
    return { state: "Verified", basis: "Confirmed verdict backed by independent corroboration." };
  }

  if (evidence.verdict === "confirmed") {
    return { state: "Escalating", basis: "Confirmed by a single source; independent corroboration still building." };
  }

  if (evidence.confirmationTier === "Corroborated") {
    return { state: "Escalating", basis: "Multiple sources corroborate; not yet confirmed." };
  }
  if (evidence.independentCorroboration) {
    return { state: "Escalating", basis: "Independent sources corroborate; not yet confirmed." };
  }
  if (evidence.marketReaction) {
    return { state: "Escalating", basis: "Market has reacted; verification is still developing." };
  }

  return { state: "Developing", basis: "Evidence is still forming; awaiting corroboration or confirmation." };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Adapter: live_signals lineage (LiveSignal)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Minimal structural slice of a LiveSignal (signalsApi.ts) that bears on
 * verification. A real LiveSignal satisfies this structurally.
 */
export interface LiveSignalEvidenceInput {
  readonly verdict: string;
  readonly confirmation_strength: string;
  readonly source_count: number;
  readonly line_movement?: { readonly direction?: string | null; readonly delta?: number | null } | null;
}

/**
 * Map a live signal into shared evidence.
 *
 * Rationale for the promotion rules (approved design): verdict "confirmed" is
 * driven by official-source identity, so a confirmed verdict backed by
 * corroboration (>= 2 sources OR a Consensus tier) is a genuine "Verified".
 */
export function evidenceFromLiveSignal(signal: LiveSignalEvidenceInput): VerificationEvidence {
  const verdict = (signal.verdict ?? "").toLowerCase().trim();
  const strength = (signal.confirmation_strength ?? "").toLowerCase().trim();
  const sourceCount = signal.source_count ?? 0;

  const confirmationTier = normalizeConfirmationTier(strength);
  const consensusTier = confirmationTier === "Consensus";
  const officialConfirmation = verdict.includes("official") || strength.includes("official");

  return {
    contradicted: verdict.includes("contradicted") || verdict.includes("contradict"),
    officialConfirmation,
    verdict: verdict.includes("confirmed") ? "confirmed" : verdict,
    independentCorroboration: sourceCount >= 2 || consensusTier,
    confirmationTier,
    marketReaction: Boolean(signal.line_movement),
  };
}

/** Map a raw confirmation_strength string onto the canonical tier vocabulary. */
function normalizeConfirmationTier(strengthLower: string): string {
  if (strengthLower.includes("consensus") || strengthLower.includes("confirmed")) return "Consensus";
  if (strengthLower.includes("corroborated")) return "Corroborated";
  if (strengthLower.includes("official")) return "Official";
  if (strengthLower.includes("developing")) return "Developing";
  return "Unverified";
}

/* ─────────────────────────────────────────────────────────────────────────
 * Adapter: canonical situation lineage (CanonicalSituation)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Minimal structural slice of a CanonicalSituation (situationsApi.ts) that
 * bears on verification. A real CanonicalSituation satisfies this
 * structurally. This lineage carries a native lifecycle state that already
 * reaches real Verified states, plus an explicit confidence-factor breakdown.
 */
export interface CanonicalSituationEvidenceInput {
  readonly lifecycleState: string;
  readonly publicConfirmation?: string | null;
  readonly sourceCount?: number;
  readonly confidenceFactors?: {
    readonly scores?: {
      readonly official_confirmation?: number;
      readonly independent_confirmations?: number;
      readonly market_alignment?: number;
      readonly contradiction_penalty?: number;
    };
  };
  readonly latestEvidence?: ReadonlyArray<{ readonly marketImpact?: string | null }>;
}

/**
 * Map a canonical situation into shared evidence. The lifecycle state is the
 * primary signal; the confidence-factor breakdown and a recorded public
 * confirmation refine it.
 */
export function evidenceFromCanonical(situation: CanonicalSituationEvidenceInput): VerificationEvidence {
  const lifecycle = (situation.lifecycleState ?? "").toLowerCase().trim();
  const scores = situation.confidenceFactors?.scores ?? {};
  const sourceCount = situation.sourceCount ?? 0;
  const hasPublicConfirmation = Boolean(situation.publicConfirmation);
  const marketImpactAttached = (situation.latestEvidence ?? []).some((event) => Boolean(event?.marketImpact));

  const isOfficial = lifecycle === "official" || (scores.official_confirmation ?? 0) > 0;
  const isConfirmed = lifecycle === "confirmed" || lifecycle === "official";

  return {
    contradicted: lifecycle === "invalidated" || (scores.contradiction_penalty ?? 0) > 0,
    officialConfirmation: isOfficial,
    verdict: isConfirmed ? "confirmed" : lifecycle,
    independentCorroboration:
      sourceCount >= 2 || (scores.independent_confirmations ?? 0) > 0 || hasPublicConfirmation,
    confirmationTier: canonicalConfirmationTier(lifecycle, sourceCount),
    marketReaction: (scores.market_alignment ?? 0) > 0 || marketImpactAttached,
  };
}

/** Derive the confirmation tier for a canonical situation from its lifecycle + source depth. */
function canonicalConfirmationTier(lifecycle: string, sourceCount: number): string {
  if (lifecycle === "confirmed" || lifecycle === "official") return "Consensus";
  if (lifecycle === "escalating" || sourceCount >= 2) return "Corroborated";
  if (lifecycle === "developing" || lifecycle === "emerging" || lifecycle === "watching") return "Developing";
  return "Unverified";
}
