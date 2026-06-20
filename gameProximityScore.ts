// ─────────────────────────────────────────────────────────────────────────────
// EdgeSetter — Game Proximity Score  (Gate 2)
//
// Applies a multiplier to a situation's ranking score based on how far the
// relevant game is from now. A weather advisory for a game two months away
// must never outrank an injury that matters today.
//
// Multiplier table (from North Star session spec):
//   Game within 24 hours           → 1.0   (maximum urgency)
//   Game 2–7 days out              → 0.5–0.8 (linear interpolation)
//   Game more than 7 days out      → 0.1   (minimal — don't lead)
//   No game date available         → 0.6   (neutral — same as ~4 days out)
// ─────────────────────────────────────────────────────────────────────────────

const HOURS_PER_DAY = 24;
const ONE_DAY_HOURS = 1 * HOURS_PER_DAY;   // 24 h
const SEVEN_DAY_HOURS = 7 * HOURS_PER_DAY; // 168 h

const MULTIPLIER_WITHIN_24H = 1.0;
const MULTIPLIER_AT_7_DAYS = 0.5;
const MULTIPLIER_AT_2_DAYS = 0.8;
const MULTIPLIER_BEYOND_7_DAYS = 0.1;
const MULTIPLIER_NO_GAME_DATE = 0.6;

// Linear interpolation boundary values in hours
const NEAR_BOUNDARY_HOURS = 2 * HOURS_PER_DAY;  // 48 h — start of 0.5–0.8 band
const FAR_BOUNDARY_HOURS = SEVEN_DAY_HOURS;       // 168 h — end of 0.5–0.8 band

/**
 * Returns a proximity multiplier [0.1, 1.0] for a situation based on how
 * far its associated game is from `referenceTime` (defaults to Date.now()).
 *
 * @param gameDateISO - ISO timestamp of the game this situation affects.
 *   Pass undefined if no game date is known.
 * @param referenceTime - The "now" reference (ms since epoch). Defaults to
 *   Date.now(). Injectable for deterministic testing.
 */
export function gameProximityScore(
  gameDateISO: string | undefined,
  referenceTime: number = Date.now()
): number {
  if (!gameDateISO) return MULTIPLIER_NO_GAME_DATE;

  const gameMs = Date.parse(gameDateISO);
  if (isNaN(gameMs)) return MULTIPLIER_NO_GAME_DATE;

  const hoursUntilGame = (gameMs - referenceTime) / (1000 * 60 * 60);

  // Game is in the past — treat as immediate (the game already matters)
  if (hoursUntilGame <= 0) return MULTIPLIER_WITHIN_24H;

  // Within 24 hours
  if (hoursUntilGame <= ONE_DAY_HOURS) return MULTIPLIER_WITHIN_24H;

  // More than 7 days out
  if (hoursUntilGame > FAR_BOUNDARY_HOURS) return MULTIPLIER_BEYOND_7_DAYS;

  // 2–7 days: linear interpolation between 0.8 and 0.5
  // At 48h (2 days) → 0.8, at 168h (7 days) → 0.5
  const t =
    (hoursUntilGame - NEAR_BOUNDARY_HOURS) /
    (FAR_BOUNDARY_HOURS - NEAR_BOUNDARY_HOURS);

  return MULTIPLIER_AT_2_DAYS + t * (MULTIPLIER_AT_7_DAYS - MULTIPLIER_AT_2_DAYS);
}

/**
 * Convenience: clamps a value to [min, max].
 * Exported for use in ranking tests.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
