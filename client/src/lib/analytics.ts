/**
 * analytics.ts — Plausible custom event helpers
 *
 * Plausible auto-tracks page views via the script tag in index.html.
 * This module adds named custom events for funnel tracking.
 *
 * Usage:
 *   import { track } from "@/lib/analytics";
 *   track("paywall_modal_open");
 *   track("checkout_click", { source: "signals_sidebar" });
 *
 * All events appear under "Custom Events" in the Plausible dashboard.
 * Plausible.io must have edgesetter.net added as a site for events to record.
 */

type PlausibleFn = (event: string, options?: { props?: Record<string, string | number | boolean> }) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn & { q?: unknown[] };
  }
}

export function track(
  event: string,
  props?: Record<string, string | number | boolean>,
): void {
  try {
    const p = window.plausible;
    if (typeof p === "function") {
      p(event, props ? { props } : undefined);
    }
  } catch {
    // Never throw — analytics must not break product
  }
}

// ─── Named events (7 required) ─────────────────────────────────────────────

/** Fired when the Landing page mounts */
export const trackLandingVisit = () => track("landing_visit");

/** Fired when the Signal Board (/#/signals) mounts */
export const trackSignalsVisit = () => track("signals_visit");

/** Fired when the Draft Board mounts */
export const trackDraftBoardVisit = () => track("draft_board_visit");

/** Fired when the Pro page mounts */
export const trackProVisit = () => track("pro_visit");

/** Fired when the paywall modal opens */
export const trackPaywallModalOpen = () => track("paywall_modal_open");

/** Fired when any Go Pro CTA triggers the checkout API call */
export const trackCheckoutClick = (source: string) =>
  track("checkout_click", { source });

/** Fired when the Success page mounts with a session_id present */
export const trackSuccessPageLoad = () => track("success_page_load");
