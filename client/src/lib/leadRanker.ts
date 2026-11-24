// ─────────────────────────────────────────────────────────────────────────────
// EdgeSetter — Lead Ranker
//
// Canonical lead selection for the homepage and board pages.
//
// selectHomepageLead — canonical situations, Gate 1 (storyTypeTiers) +
//   Gate 2 (age cap) + scoring (confidence × proximity × recency + verification).
//   NOT what the live homepage calls: LiveIntelligenceHome ranks
//   IntelligenceSituation[] (live_signals) with its own scorer, and has since
//   before this note. That page takes its candidate pool from
//   homepageLeadPool and its ages from homepageLeadAgeIso, both below, so the
//   rules that decide what may lead live here even though the scorer does not.
// selectFeaturedSituation — board pages, re-exported from boardSituations
//
// Both surfaces agree on which situation leads because they share the same
// compareLeadRank comparator (via boardSituations).
// ─────────────────────────────────────────────────────────────────────────────

import type { CanonicalSituationRecord } from "../types/situation";
import type { IntelligenceSituation } from "./intelligenceSituationsApi";
import type { BoardSituation } from "./boardSituations";
import { isLeadEligible } from "./storyTypeTiers";
import { gameProximityScore } from "./gameProximityScore";
import { ageHoursFrom } from "./storyAge";
import { dropStoriesNoLongerLive, type StoryGameRow } from "./boardStoryGame";
import { opponentFromMatchup } from "./signalsApi";
import { kickoffIsTrustedForLeague } from "../components/board/boardAdapters";

export { selectFeaturedSituation } from "./boardSituations";

/** Hard cap: situations older than this never lead the homepage. */
export const LEAD_MAX_AGE_HOURS = 7 * 24;

// ageHoursFrom lives in the storyAge leaf module so boardSituations can share it
// without importing back from here (this module re-exports selectFeaturedSituation
// from boardSituations, so the reverse import would be a cycle). Re-exported to
// keep leadRanker the single import site for ranking callers.
export { ageHoursFrom } from "./storyAge";

/**
 * Selects the homepage lead from a pool of canonical situation records.
 *
 * Gate 1 — story type: only LEAD_ELIGIBLE signal types qualify (storyTypeTiers).
 * Gate 2 — age cap: situations older than LEAD_MAX_AGE_HOURS are excluded.
 *
 * Scoring (higher = leads):
 *   confidenceScore × gameProximity × recency + verificationBoost
 *
 * Fresh pool preference: if any situation is < 24 hours old, older situations
 * are excluded from the final sort. This ensures a verified 24h-old story
 * doesn't permanently block a fresh developing story.
 *
 * @param referenceTime  Injectable "now" (ms since epoch). Defaults to Date.now().
 *   Pass a fixed value in tests for deterministic results.
 */
export function selectHomepageLead(
  situations: CanonicalSituationRecord[],
  referenceTime: number = Date.now(),
): CanonicalSituationRecord | null {
  const eligible = situations.filter((s) => {
    if (!isLeadEligible(s.signalType)) return false;
    const ageH = ageHoursFrom(s.firstDetected, referenceTime);
    return ageH <= LEAD_MAX_AGE_HOURS;
  });

  if (eligible.length === 0) return null;

  const freshPool = eligible.filter(
    (s) => ageHoursFrom(s.firstDetected, referenceTime) <= 24,
  );
  const pool = freshPool.length > 0 ? freshPool : eligible;

  return [...pool].sort((a, b) => {
    const scoreDiff = _leadScore(b, referenceTime) - _leadScore(a, referenceTime);
    if (scoreDiff !== 0) return scoreDiff;
    return (
      new Date(b.firstDetected).getTime() - new Date(a.firstDetected).getTime()
    );
  })[0] ?? null;
}

function _leadScore(s: CanonicalSituationRecord, referenceTime: number): number {
  const proximity = gameProximityScore(s.gameDate, referenceTime);
  const ageH = ageHoursFrom(s.firstDetected, referenceTime);
  const recency =
    ageH <= 1 ? 2.0
    : ageH <= 6 ? 1.5
    : ageH <= 24 ? 1.0
    : 0.6;
  const verificationBoost =
    s.verificationState === "verified" ? 20
    : s.verificationState === "escalating" ? 10
    : 0;
  return s.confidenceScore * proximity * recency + verificationBoost;
}

/**
 * The homepage's lead candidates, minus every story whose game is over.
 *
 * Same filter, same matching rules as the boards (dropStoriesNoLongerLive in
 * boardStoryGame): a signal's own game_id first, then the unordered team pair,
 * then — outside CFB — its one team's next same-league game at or after the
 * story last changed. Final drops in every league; started drops only where
 * the stored kickoff is trusted (NFL, NBA).
 *
 * The homepage holds IntelligenceSituation, the boards BoardSituation, so each
 * story is projected onto the handful of fields that filter reads. The values
 * are the ones the boards' own signal adapters (adaptToNFLSignal and friends)
 * produce from the same live_signals row: team as served, opponent from the
 * matchup string, gameId from game_id, and signal_time ?? created_at as the
 * last-changed time. Anything else on BoardSituation is unread by the filter.
 *
 * A CFB story that names one team and no opponent is never placed — one CFB
 * code can belong to several schools — so it stays in the pool even when a
 * game under that code is final. That is the boards' rule, kept on purpose.
 *
 * @param gamesTable Every league's whole games table (fetchGamesTable), not
 *   the windowed slate: yesterday's final is exactly the row this needs.
 */
export function homepageLeadPool(
  situations: readonly IntelligenceSituation[],
  gamesTable: readonly StoryGameRow[],
  now: number = Date.now(),
): IntelligenceSituation[] {
  const byLeague = new Map<string, IntelligenceSituation[]>();
  for (const situation of situations) {
    byLeague.set(situation.league, [...(byLeague.get(situation.league) ?? []), situation]);
  }
  const keep = new Set<string>();
  byLeague.forEach((members, league) => {
    const projected = members.map(toStoryGameProbe);
    const games = gamesTable.filter((game) => String(game.league ?? "").toUpperCase() === league);
    for (const survivor of dropStoriesNoLongerLive(projected, games, { kickoffTrusted: kickoffIsTrustedForLeague(league), now })) {
      keep.add(survivor.id);
    }
  });
  return situations.filter((situation) => keep.has(situation.id));
}

function toStoryGameProbe(situation: IntelligenceSituation): BoardSituation {
  const raw = situation.raw;
  return {
    id: situation.id,
    kind: "signal",
    league: situation.league,
    title: situation.headline,
    team: raw.team ?? undefined,
    opponent: opponentFromMatchup(raw.matchup, raw.team),
    signal: { gameId: raw.game_id ?? undefined, isoTimestamp: raw.signal_time ?? raw.created_at },
  } as BoardSituation;
}

/**
 * The time a homepage story's age is measured from.
 *
 * A line move is dated by `line_move_first_received_at`: when we first received
 * the line its game and market are on now. Not `timing.firstSeen` — that is
 * when the signal row was founded, and every later move on the same game is
 * folded into that row, so a row founded days ago still carries its founding
 * day after today's move. Not the game's start either. When the server could
 * not work the time out, this is null and the story has no age, which every
 * caller treats as too old to lead rather than borrowing the founding time.
 *
 * Every other story keeps `timing.firstSeen`.
 */
export function homepageLeadAgeIso(situation: IntelligenceSituation): string | null {
  if (situation.raw.signal_type === "line_move") return situation.raw.line_move_first_received_at ?? null;
  return situation.timing.firstSeen;
}

/** Hours since {@link homepageLeadAgeIso}; Infinity when there is none. */
export function homepageLeadAgeHours(situation: IntelligenceSituation, now: number = Date.now()): number {
  const iso = homepageLeadAgeIso(situation);
  return iso ? ageHoursFrom(iso, now) : Number.POSITIVE_INFINITY;
}
