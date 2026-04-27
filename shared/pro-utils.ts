/**
 * Edge Setter — Shared Pro-access utilities  (Sprint 10)
 *
 * Single source of truth for "does this user have Pro access?"
 *
 * Two valid paths to Pro:
 *   1. Stripe subscription:  plan === "pro" AND access_status === "active"
 *   2. Beta comp:            beta_until is set AND beta_until > now()
 *
 * Both paths are additive — having one doesn't affect the other.
 * If both are valid simultaneously (e.g., a paying user who was also granted
 * beta access), the result is still Pro. No conflicts.
 *
 * Usage:
 *   import { isProUser } from "@shared/pro-utils";
 *   const active = isProUser(user);
 *
 * The same logic must be mirrored in client/src/lib/proUtils.ts for use in
 * React pages (Drizzle User type is not available on the client).
 */

/** Minimal user shape needed to evaluate Pro status. */
export interface UserProShape {
  plan?: string | null;
  access_status?: string | null;
  /**
   * ISO 8601 datetime string.
   * If set and > now(), user has beta Pro access regardless of Stripe subscription.
   */
  beta_until?: string | null;
}

/**
 * Returns true if the user currently has Pro access.
 *
 * Stripe path:  plan === "pro"  AND  access_status === "active"
 * Beta path:    beta_until is a valid future ISO datetime
 *
 * @param user  User row or any object with plan / access_status / beta_until
 */
export function isProUser(user: UserProShape | null | undefined): boolean {
  if (!user) return false;

  // Path 1 — Stripe subscription
  if (user.plan === "pro" && user.access_status === "active") return true;

  // Path 2 — Beta comp window
  if (user.beta_until) {
    try {
      const expiry = new Date(user.beta_until).getTime();
      if (!isNaN(expiry) && expiry > Date.now()) return true;
    } catch {
      // malformed date → treat as no beta access
    }
  }

  return false;
}
