/**
 * Edge Setter — Roster Gazetteer Matcher
 *
 * Matches an RSS headline against a team's active-roster names (the gazetteer),
 * producing a `player_candidate` for headlines the regex extractor in
 * sports-rss.ts misses (e.g. the Dimukeje null-player case).
 *
 * Two passes, high-confidence first:
 *   1. full_name — the player's full name appears as a contiguous run of tokens
 *      in the headline (the "sliding window", generalised to any name length so
 *      "Amon-Ra St. Brown" works as well as "Rashee Rice").
 *   2. last_name — a single rostered surname appears, used only as a fallback and
 *      flagged low-confidence. Guarded against the common-surname false positives
 *      the task calls out: the surname must be UNIQUE within the team's roster,
 *      be a real word (≥3 letters), not be a bare function word, and appear
 *      capitalised in the original headline (a proper-noun signal — "Long
 *      snapper" mid-sentence is lowercase and won't match a player named Long).
 *
 * IMPORTANT: this is team-scoped. The caller passes ONLY the roster of the feed's
 * own team, so a surname resolves within ~90 names, not ~1,700 league-wide — that
 * scoping is what makes the last-name fallback safe enough to keep.
 *
 * Pure and side-effect-free so it can be unit-tested without a DB.
 */

import type { RosterPlayer, RosterStaff } from "./store";

export type MatchConfidence = "full_name" | "last_name";

export interface RosterMatch {
  /** The canonical roster full name (not the headline substring). */
  name: string;
  confidence: MatchConfidence;
  /** ESPN athlete id when known — lets callers cross-check the matched player. */
  espn_id: string | null;
}

const GENERATIONAL_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

// Bare function words that could otherwise slip through the surname fallback.
// Deliberately tiny — real surnames (Rice, White, Long, Ward) are NOT listed,
// because when they're on the scoped team's roster a headline surname is far
// more likely a true reference than a coincidence. The low-confidence flag plus
// manual inspection are the intended mitigation for the residual ambiguity.
const FUNCTION_WORDS = new Set([
  "the", "and", "for", "with", "out", "off", "his", "her", "its", "not", "was",
  "are", "has", "had", "who", "why", "how", "all", "new", "one", "two", "get",
  "day", "win", "now", "vs", "per",
]);

/** Lowercase + strip diacritics + drop every non-letter character. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Split arbitrary text into normalized alphabetic tokens (apostrophes, hyphens,
 *  periods all act as separators — "Chiefs'", "Amon-Ra", "St." all split). */
function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** A player's name reduced to matchable tokens, generational suffix removed. */
function nameTokens(p: Pick<RosterPlayer, "full_name">): string[] {
  return tokenize(p.full_name).filter(t => !GENERATIONAL_SUFFIXES.has(t));
}

/** True if `needle` occurs as a contiguous run inside `hay`. */
function containsRun(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Match a headline against a team-scoped roster.
 * Returns the strongest match, or null.
 *
 * `staff` is the team's coaching/front-office staff. It is consulted ONLY to
 * suppress the low-confidence last-name fallback when the bare surname belongs
 * to a staff member (e.g. a headline "Campbell about Week 1" is the head coach,
 * not a rostered LB of the same surname). The full-name tier is untouched — a
 * player written out in full still matches even if a coach shares the surname.
 */
export function matchRosterPlayer(
  headline: string,
  roster: RosterPlayer[],
  staff: RosterStaff[] = [],
): RosterMatch | null {
  if (!headline || roster.length === 0) return null;
  const hayTokens = tokenize(headline);
  if (hayTokens.length === 0) return null;

  // ── Pass 1: full-name (contiguous token run). Prefer the longest name that
  // matches, so "Chris Jones" doesn't shadow a "Chris Jones Jr." style entry and
  // multi-token surnames win over coincidental shorter overlaps. ────────────────
  let best: { p: RosterPlayer; len: number } | null = null;
  for (const p of roster) {
    const nt = nameTokens(p);
    if (nt.length < 2) continue; // need at least first+last for a full-name match
    if (containsRun(hayTokens, nt)) {
      if (!best || nt.length > best.len) best = { p, len: nt.length };
    }
  }
  if (best) {
    return { name: best.p.full_name, confidence: "full_name", espn_id: best.p.espn_id };
  }

  // ── Pass 2: unique-surname fallback (low confidence) ─────────────────────────
  const lastCounts = new Map<string, number>();
  for (const p of roster) {
    const last = norm(p.last_name);
    if (last) lastCounts.set(last, (lastCounts.get(last) ?? 0) + 1);
  }
  const haySet = new Set(hayTokens);
  // Proper-noun signal: surname must appear capitalised somewhere in the raw text.
  const capitalisedWords = new Set(
    (headline.match(/\b[A-Z][a-zA-Z'’-]+/g) ?? []).map(w => norm(w)),
  );
  // Staff surnames to suppress in this tier (HC + coordinators/GMs for the team).
  const staffLastNames = new Set(staff.map(s => norm(s.last_name)).filter(Boolean));

  for (const p of roster) {
    const last = norm(p.last_name);
    if (last.length < 3) continue;
    if (FUNCTION_WORDS.has(last)) continue;
    if (staffLastNames.has(last)) continue;           // shared with a coach/GM → too ambiguous
    if ((lastCounts.get(last) ?? 0) !== 1) continue; // ambiguous within the team
    if (!haySet.has(last)) continue;
    if (!capitalisedWords.has(last)) continue;        // lowercase word usage → skip
    return { name: p.full_name, confidence: "last_name", espn_id: p.espn_id };
  }

  return null;
}
