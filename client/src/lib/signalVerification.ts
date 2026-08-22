/**
 * Single client-side seam for turning a live/board signal into the shared,
 * evidence-grounded verification word ("Verified" / "Escalating" /
 * "Developing").
 *
 * Both the board story surfaces (FeaturedSituation / SituationStoryCard via
 * boardAdapters) and the SignalDetailDrawer read verification state through
 * THIS function, so the card and the drawer can never disagree for the same
 * underlying signal. The decision itself lives in @shared/verification-state;
 * this module only maps the (camelCase board / snake_case live) signal shapes
 * onto that engine's minimal input.
 */
import {
  deriveVerificationState,
  evidenceFromLiveSignal,
  type VerificationStateResult,
} from "@shared/verification-state";

/** Loose structural shape covering both AnyBoardSignal and SignalDetailLike. */
export interface VerifiableSignalLike {
  verdict?: string | null;
  status_tag?: string | null;
  confirmationStrength?: string | null;
  confirmation_strength?: string | null;
  sources?: number | string | ReadonlyArray<unknown> | null;
  source_count?: number | string | null;
  sourceLabels?: ReadonlyArray<unknown> | null;
  lineMovement?: unknown;
  line_movement?: unknown;
}

/**
 * Resolve a signal's source count. Kept identical to the counting the drawer
 * feeds its confidence/timing model so both lineages evaluate the same depth.
 */
export function readSignalSourceCount(signal?: VerifiableSignalLike | null): number {
  if (!signal) return 0;
  if (typeof signal.sources === "number") return signal.sources;
  if (Array.isArray(signal.sources)) return signal.sources.length;
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

/** Confirmation-strength labels that assert more than one independent source. */
const MULTI_SOURCE_STRENGTH = /consensus|corroborat|multiple|aligned|agreement/i;

/**
 * Reconcile a raw confirmation-strength label against the actual source count
 * for DISPLAY. A single (or zero) source can never truthfully read as
 * "Corroborated" / "Consensus" / "Multiple ..." — the pipeline derives that
 * label from inputs other than the count (e.g. line-movement delta), so those
 * words would overclaim the evidence shown in the same view. Non-multiplicity
 * labels (e.g. "Developing", "Official") pass through unchanged.
 *
 * The replacement deliberately avoids the exact word "corroborated" so it is not
 * rewritten back into "Multiple reports" by publicStoryText.
 */
export function honestConfirmationStrength(
  rawStrength?: string | null,
  sourceCount = 0,
): string {
  const raw = (rawStrength ?? "").trim();
  if (!raw || sourceCount >= 2) return raw;
  if (!MULTI_SOURCE_STRENGTH.test(raw)) return raw;
  return sourceCount === 1
    ? "Single source; corroboration still building"
    : "Awaiting corroboration";
}

/**
 * Canonical verification state for a signal-lineage story. The ONE place the
 * board card path and the drawer both call, so their state words match.
 */
export function deriveSignalVerificationState(
  signal?: VerifiableSignalLike | null,
): VerificationStateResult {
  return deriveVerificationState(
    evidenceFromLiveSignal({
      verdict: signal?.verdict ?? signal?.status_tag ?? "",
      confirmation_strength: signal?.confirmationStrength ?? signal?.confirmation_strength ?? "",
      source_count: readSignalSourceCount(signal),
      line_movement: (signal?.lineMovement ?? signal?.line_movement ?? null) as
        | { readonly direction?: string | null; readonly delta?: number | null }
        | null,
    }),
  );
}
