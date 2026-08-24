export function humanizeSignalType(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    injury: "Injury update",
    injury_update: "Injury update",
    lineup: "Lineup update",
    lineup_change: "Lineup change",
    lineup_confirm: "Lineup confirmed",
    rotation: "Rotation update",
    role_change: "Role change",
    line_move: "Market movement",
    line_moves: "Market movement",
    odds_move: "Market movement",
    odds_open: "Market movement",
    market: "Market movement",
    sharp: "Market movement",
    sharp_money: "Market movement",
    transaction: "Roster update",
    roster: "Roster update",
    weather: "Weather update",
  };
  if (!normalized) return "Story update";
  return map[normalized] ?? titleCase(normalized.replace(/_/g, " "));
}

export function publicStoryText(value?: string | number | null, league?: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const label = league?.toUpperCase();
  return raw
    .replace(/\bline_move\b/gi, "Market movement")
    .replace(/\binjury_update\b/gi, "Injury update")
    .replace(/\blineup_change\b/gi, "Lineup change")
    .replace(/\bodds_move\b/gi, "Market movement")
    .replace(/\bsource reliability tested\b/gi, "Source check complete")
    .replace(/\bsource reliability pending\b/gi, "Source check pending")
    .replace(/\btiming pattern compared\b/gi, "Timing check complete")
    .replace(/\btiming watch\b/gi, "Timing check pending")
    .replace(/\bverification still thin\b/gi, "Needs more confirmation")
    .replace(/\bsports context moving\b/gi, "Market is reacting")
    .replace(/\bcontext moving\b/gi, "Market reacting")
    .replace(/\bContext Moving\b/g, "Market reacting")
    .replace(/\bsports moving\b/gi, "Market is reacting")
    .replace(/\bsingle-source\b/gi, "Single source")
    .replace(/\bsource agreement\b/gi, "Reports aligned")
    .replace(/\bcorroborated\b/gi, "Multiple reports")
    .replace(/\bbefore full confirmed update\b/gi, "before public confirmation")
    .replace(/\bbefore full public confirmation\b/gi, "before public confirmation")
    .replace(/\bbefore a Confirmed update\b/g, "before a confirmed update")
    .replace(/\bfull confirmed update\b/gi, "public confirmation")
    .replace(/\bpublic confirmation\b/gi, "public confirmation")
    .replace(/\bofficial confirmation\b/gi, "official update")
    .replace(/\bstrong pattern match\b/gi, "Strong pattern match")
    .replace(/\bforming\b/gi, "Still forming")
    .replace(/\bthin\b/gi, "Needs more confirmation")
    .replace(/\bStill Still forming\b/gi, "Still forming")
    .replace(/Line moved ([+-]?\d+(?:\.\d+)?) points? (up|down) from open\.?/gi, (_match, points, direction) => {
      const leagueContext = label === "NBA" ? "pre-tip context" : label === "MLB" ? "lineup, pitching, injury, or weather context" : "sports context";
      return `The number has moved ${points} points ${direction} from the opener, suggesting the market is reacting before the full ${leagueContext} is clear.`;
    })
    .replace(/Moved ([+-]?\d+(?:\.\d+)?) pts/gi, "Moved $1 points from the opener")
    .trim();
}

export function sourceCountText(count?: number | null) {
  if (!count) return "Source check pending";
  return `${count} report check${count === 1 ? "" : "s"}`;
}

export function evidenceCountText(count?: number | null) {
  if (!count) return "Evidence pending";
  return `${count} report${count === 1 ? "" : "s"}`;
}

export function publicLifecycleLabel(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Developing";
  if (/context moving|market-reacting/i.test(normalized)) return "Market reacting";
  if (/urgent|breaking|live/i.test(normalized)) return "Urgent";
  if (/verified|confirmed|consensus|official/i.test(normalized)) return "Confirmed";
  if (/watch|review|likely/i.test(normalized)) return "Watch";
  if (/developing|emerging|escalating|elevated|monitoring/i.test(normalized)) return "Developing";
  if (/resolved|stale|cooling/i.test(normalized)) return "Cooling";
  if (/detected/i.test(normalized)) return "New watch";
  return publicStoryText(normalized);
}

/**
 * Source context that governs whether an evidence-strength label may read as
 * "strong". A lone, not-yet-verified source cannot honestly present as strong
 * evidence in a view that also shows "1 report" / "single-source".
 */
export interface EvidenceStrengthContext {
  readonly sourceCount?: number | null;
  readonly verified?: boolean | null;
}

/**
 * The single-source evidence-strength cap, in ONE place. Returns true when a
 * signal's evidence-strength wording must be held back from "strong"/multi-
 * source language: a single (or zero) source that has NOT reached a Verified /
 * official state. Verified stories and 2+ source stories are never capped.
 *
 * Every surface that renders an evidence-strength / confidence tier next to a
 * source count (board top card, stories-to-watch rows, the drawer, the
 * confidence narrative) routes through this predicate — via
 * `publicConfidenceLabel(value, context)` for tier labels, or directly for copy
 * it composes itself — so the card, the list, and the drawer can never disagree
 * about the same single-source story.
 */
export function shouldCapSingleSourceStrength(context?: EvidenceStrengthContext | null): boolean {
  if (!context) return false;
  if (context.verified) return false;
  return (context.sourceCount ?? 0) < 2;
}

export function publicConfidenceLabel(value?: string | number | null, context?: EvidenceStrengthContext | null) {
  const text = String(value ?? "").trim();
  const parsed = Number.parseFloat(text.replace("%", ""));
  const label = !Number.isNaN(parsed)
    ? parsed >= 85
      ? "Strong pattern match"
      : parsed >= 70
        ? "Strong support"
        : parsed >= 55
          ? "Still forming"
          : "Needs more confirmation"
    : publicStoryText(text || "Still forming");
  // A single, unverified source can't read as "Strong ..." in the same view that
  // shows its lone report count. Downgrade only that wording; everything else
  // (including callers that pass no context) is unchanged.
  if (shouldCapSingleSourceStrength(context) && /strong/i.test(label)) return "Still forming";
  return label;
}

export function publicTimingLabel(value?: string | null, league?: string) {
  if (value?.startsWith('visual:')) {
    return value.replace('visual:', '').trim()
  }
  const raw = String(value ?? "").trim();
  const text = publicStoryText(value, league).toLowerCase();
  if (!text) return "Timing check pending";
  // Market signals — "market is reacting", "market reaction", any market reference
  if (text.includes("market is reacting") || text.includes("market reaction") || text.includes("market"))
    return league?.toUpperCase() === "NBA" ? "Pre-tip market reaction" : "Early market reaction";
  if (text.includes("early")) return "Early watch";
  if (text.includes("developing")) return "Developing window";
  // Confirmed / officially settled
  if (text.includes("confirmed") || text.includes("official") || text.includes("consensus forming") || text.includes("widely known"))
    return "Confirmed update";
  // Cooling / priced out / stale
  if (text.includes("cooling") || text.includes("priced") || text.includes("stale signal") || text.includes("no remaining edge"))
    return "Cooling";
  // ES Agents verified
  if (raw === "ES Agents verified") return "ES Agents verified";
  // Internal pipeline labels that should not reach the UI as-is
  if (
    text.includes("context moving") ||
    text.includes("source pressure") ||
    text.includes("watch tightening") ||
    text.includes("monitoring only") ||
    text.includes("es agents")
  ) return "ES Agents monitoring";
  return titleCase(text);
}

export function publicUrgencyLabel(score?: number | null) {
  if (score == null) return "Watch";
  if (score >= 95) return "Urgent";
  if (score >= 78) return "Watch";
  if (score >= 58) return "Watch";
  return "Developing";
}

export function marketFocusHeadline(identity: string, league?: string) {
  const leagueLabel = league?.toUpperCase();
  const cleanedIdentity = identity.replace(/\s+/g, " ").trim();
  const hasMatchup = /[@/-]/.test(cleanedIdentity);
  if (leagueLabel === "NBA") {
    return hasMatchup
      ? `${cleanedIdentity} number moves before tip`
      : `Market shifts around ${cleanedIdentity} before tip`;
  }
  if (leagueLabel === "MLB") {
    return hasMatchup
      ? `${cleanedIdentity} line move draws attention before first pitch`
      : `Market shifts toward ${cleanedIdentity} before first pitch`;
  }
  return hasMatchup ? `${cleanedIdentity} market move draws attention` : `Market shifts around ${cleanedIdentity}`;
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
}
