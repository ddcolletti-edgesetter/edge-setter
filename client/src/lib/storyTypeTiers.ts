// ─────────────────────────────────────────────────────────────────────────────
// EdgeSetter — Story Type Eligibility Tier Table  (Gate 1)
//
// North Star rule: Only LEAD_ELIGIBLE stories may appear in the lead slot on
// any board or the homepage. FEED_ONLY and SUPPRESSED types are a hard gate —
// not a weight, not a penalty.
//
// To add a new signal type:
//   1. Add it to the correct tier constant below.
//   2. Add a comment explaining the classification.
//   3. Update the North Star ESTABLISHED SIGNAL TYPES section.
//   4. Run tsc --noEmit to confirm no TypeScript errors.
// ─────────────────────────────────────────────────────────────────────────────

export type StoryTier = "LEAD_ELIGIBLE" | "FEED_ONLY" | "SUPPRESSED";

// ── LEAD_ELIGIBLE ─────────────────────────────────────────────────────────────
// Decision-relevant. Affects who plays, who is available, who moves teams.
// These stories change the picture for a specific upcoming game or season.
const LEAD_ELIGIBLE_TYPES = new Set<string>([
  // Injuries & availability
  "injury_update",
  "injury_report",
  "player_availability",
  "lineup_scratch",
  "dnp_designation",
  "questionable_tag",
  "return_timeline",
  "practice_participation",

  // Roster & personnel moves
  "transaction",
  "roster_move",
  "depth_chart_change",     // must be from a named source per North Star
  "trade",
  "waiver_claim",
  "waiver_wire",
  "release",
  "signing",
  "contract_extension",
  "contract_news",

  // Suspensions & discipline
  "suspension",
  "discipline",
  "fine",                   // if tied to game eligibility

  // Eligibility (CFB-primary per North Star but applies broadly)
  "eligibility_ruling",

  // Coaching/scheme when it directly affects upcoming game personnel
  "coaching_change",
  "starter_designation",
]);

// ── FEED_ONLY ─────────────────────────────────────────────────────────────────
// Contextual or ambient. Has some signal value but no direct decision impact
// on a specific game in the near term. May appear in the signal feed rail.
const FEED_ONLY_TYPES = new Set<string>([
  // Environmental / game conditions
  "weather_advisory",
  "weather_update",
  "weather_watch",
  "stadium_conditions",
  "field_conditions",
  "court_conditions",

  // Trend & context
  "trend",
  "general_context",
  "matchup_context",
  "historical_context",
  "team_trend",
  "player_trend",

  // Market & sentiment
  "market_reaction",
  "betting_line_move",
  "public_betting_trend",
  "odds_movement",

  // Offseason monitoring
  "offseason_watch",
  "draft_watch",
  "free_agent_watch",
  "contract_watch",

  // Report checks — signal tracked but unconfirmed, no actionable detail
  "report_check",
  "rumor_watch",
  "unverified_report",
]);

// ── SUPPRESSED ────────────────────────────────────────────────────────────────
// No decision relevance. Must not appear in the lead slot or signal feed rail.
// Stays in the pipeline for internal tracking only.
const SUPPRESSED_TYPES = new Set<string>([
  "stale_signal",
  "duplicate",
  "noise",
  "system_test",
  "pipeline_debug",
  "no_edge",               // corresponds to "No remaining edge" timing label
  "scheduled_preview",     // generic game preview with no new information
]);

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the eligibility tier for a given signal/story type.
 *
 * Unknown types fall back to FEED_ONLY rather than LEAD_ELIGIBLE — unknown
 * types should never get the lead slot by default. Add new types explicitly.
 */
export function getStoryTier(signalType: string): StoryTier {
  const normalized = signalType.toLowerCase().trim();

  if (LEAD_ELIGIBLE_TYPES.has(normalized)) return "LEAD_ELIGIBLE";
  if (SUPPRESSED_TYPES.has(normalized)) return "SUPPRESSED";
  if (FEED_ONLY_TYPES.has(normalized)) return "FEED_ONLY";

  // Unknown type: treat as FEED_ONLY (conservative — never promote unknown types)
  return "FEED_ONLY";
}

/**
 * Hard gate: returns true only for stories that may occupy the lead slot.
 * Use this at every lead-selection boundary.
 */
export function isLeadEligible(signalType: string): boolean {
  return getStoryTier(signalType) === "LEAD_ELIGIBLE";
}

/**
 * Returns true for types that should be suppressed entirely from display.
 */
export function isSuppressed(signalType: string): boolean {
  return getStoryTier(signalType) === "SUPPRESSED";
}
