/**
 * Edge Setter — Real Source Retrieval
 *
 * Three evidence-gathering functions used by the Retriever agent.
 * All results are based on real data — no synthetic stances.
 *
 * 1. findCorroboratingEvents  — cross-references the live pipeline's raw_events
 *                               table for other sources reporting the same claim.
 *
 * 2. checkOfficialInjuryStatus — calls BallDontLie (NBA) or MLB StatsAPI (MLB)
 *                                to verify whether a player appears in the official
 *                                injury/transaction report with a matching status.
 *
 * 3. checkLineReaction         — checks the games table to see whether the spread
 *                                or total moved in the direction implied by the
 *                                claim, treating market movement as implicit evidence.
 */

import { getPipelineDb } from "./pipeline/store";
import { fetchNBAInjuries } from "./pipeline/adapters/balldontlie";
import { fetchMLBTransactions } from "./pipeline/adapters/mlb-statsapi";

/* ─── Types ──────────────────────────────────────────────── */

export interface CorroborationResult {
  supporting: number;       // distinct sources that agree
  contradicting: number;    // distinct sources that disagree
  sourceNames: string[];    // human-readable list of supporting sources
  contradictingNames: string[];
}

export interface OfficialStatusResult {
  checked: boolean;
  listed: boolean;                        // player found in official report
  officialDesignation: string | null;     // e.g. "OUT", "IL-10", "Probable"
  stance: "support" | "contradict" | "context" | null;
  notes: string;
}

export interface LineReactionResult {
  checked: boolean;
  openSpread: number | null;
  currentSpread: number | null;
  delta: number | null;                   // current - open (negative = moved against fav)
  stance: "support" | "context" | null;
  notes: string;
}

/* ─── Helpers ────────────────────────────────────────────── */

/** Case-insensitive substring name match — handles "Tatum" matching "Jayson Tatum". */
function nameMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const A = a.toLowerCase();
  const B = b.toLowerCase();
  return A.includes(B) || B.includes(A);
}

/** Return true if two injury designations are compatible (both bad, both fine, etc.). */
function designationsAgree(claimDesignation: string, officialDesignation: string): boolean {
  const badStatuses = ["out", "dnp", "il-10", "il-15", "il-60", "doubtful"];
  const uncertainStatuses = ["questionable", "day-to-day", "probable"];

  const c = claimDesignation.toLowerCase();
  const o = officialDesignation.toLowerCase();

  const claimIsBad = badStatuses.some(s => c.includes(s));
  const officialIsBad = badStatuses.some(s => o.includes(s));
  const claimIsUncertain = uncertainStatuses.some(s => c.includes(s));
  const officialIsUncertain = uncertainStatuses.some(s => o.includes(s));

  if (claimIsBad && officialIsBad) return true;
  if (claimIsUncertain && (officialIsUncertain || officialIsBad)) return true;
  return false;
}

/* ─── 1. Pipeline corroboration ──────────────────────────── */

/**
 * Search the pipeline's raw_events table for other sources that
 * reported on the same player+topic combination.
 *
 * "Same topic" = event_type matches the claim_type (e.g. claim_type="injury"
 * maps to event_type="injury_update") OR the same player appears in any
 * betting-relevant event from the same league.
 *
 * Window: events received in the 6 hours before and after the claim.
 */
export function findCorroboratingEvents(
  player: string | null,
  team: string | null,
  league: string | null,
  claimType: string | null,
  claimCreatedAt: string,
): CorroborationResult {
  const result: CorroborationResult = {
    supporting: 0, contradicting: 0,
    sourceNames: [], contradictingNames: [],
  };

  if (!player && !team) return result;

  let db: ReturnType<typeof getPipelineDb>;
  try {
    db = getPipelineDb();
  } catch {
    return result; // pipeline DB not available
  }

  // Window: ±6 hours around the claim timestamp
  const windowMs = 6 * 60 * 60 * 1000;
  const claimTs = new Date(claimCreatedAt).getTime();
  const windowStart = new Date(claimTs - windowMs).toISOString();
  const windowEnd   = new Date(claimTs + windowMs).toISOString();

  // Map claim_type → pipeline event_types that corroborate it
  const relevantTypes: Record<string, string[]> = {
    injury:     ["injury_update", "transaction"],
    trade:      ["transaction"],
    coaching:   ["transaction", "manual"],
    draft:      ["manual", "transaction"],
    depth_chart:["lineup_change", "lineup_confirm", "manual"],
    general:    ["injury_update", "transaction", "line_move", "lineup_change"],
  };
  const eventTypes = relevantTypes[claimType ?? "general"] ?? ["injury_update", "transaction"];
  const typePlaceholders = eventTypes.map(() => "?").join(", ");

  const rows = db.prepare(`
    SELECT source_id, event_type, player, team, payload
    FROM raw_events
    WHERE received_at BETWEEN ? AND ?
      AND (${league ? "league = ? AND " : ""}1=1)
      AND event_type IN (${typePlaceholders})
      AND processed = 1
    ORDER BY received_at ASC
    LIMIT 50
  `).all(
    windowStart, windowEnd,
    ...(league ? [league] : []),
    ...eventTypes,
  ) as any[];

  const seenSupportSources = new Set<string>();
  const seenContradictSources = new Set<string>();

  for (const row of rows) {
    // Must mention the same player or team
    const matchesPlayer = nameMatches(row.player, player);
    const matchesTeam = team && row.team &&
      row.team.toUpperCase() === team.toUpperCase();

    if (!matchesPlayer && !matchesTeam) continue;

    // Parse payload to check for contradictions (e.g. claim says OUT, row says Probable)
    let payload: any = {};
    try { payload = JSON.parse(row.payload ?? "{}"); } catch { /**/ }

    const rowDesignation: string = payload.designation ?? payload.status ?? "";
    let isContradiction = false;

    if (claimType === "injury" && rowDesignation) {
      const claimImpliesBad = ["out", "dnp", "il", "doubtful"].some(s =>
        (claimType ?? "").includes(s) || rowDesignation.toLowerCase().includes(s)
      );
      // If claim says OUT but a later raw_event says Probable, that's a contradiction
      if (claimImpliesBad && rowDesignation.toLowerCase().includes("probable")) {
        isContradiction = true;
      }
    }

    const sourceName = payload.source_labels?.[0] ?? row.source_id ?? "Unknown source";

    if (isContradiction) {
      if (!seenContradictSources.has(row.source_id)) {
        seenContradictSources.add(row.source_id);
        result.contradicting++;
        result.contradictingNames.push(sourceName);
      }
    } else {
      if (!seenSupportSources.has(row.source_id)) {
        seenSupportSources.add(row.source_id);
        result.supporting++;
        result.sourceNames.push(sourceName);
      }
    }
  }

  return result;
}

/* ─── 2. Official injury/transaction verification ─────────── */

/**
 * Calls the official sports data API (BDL for NBA, MLB StatsAPI for MLB)
 * and checks whether the player appears in the injury/transaction report.
 *
 * Returns null if the league has no adapter or the call fails.
 */
export async function checkOfficialInjuryStatus(
  player: string | null,
  league: string | null,
  claimDesignation: string | null,
): Promise<OfficialStatusResult> {
  const notChecked: OfficialStatusResult = {
    checked: false, listed: false,
    officialDesignation: null, stance: null,
    notes: "No official adapter for this league.",
  };

  if (!player || !league) return notChecked;

  try {
    if (league === "NBA") {
      const injuries = await fetchNBAInjuries();
      const match = injuries.find(inj =>
        nameMatches(`${inj.player.first_name} ${inj.player.last_name}`, player)
      );

      if (!match) {
        // Player not in official report — if claim says they're injured, that's weak contradiction
        return {
          checked: true, listed: false,
          officialDesignation: null,
          stance: claimDesignation ? "context" : null,
          notes: `${player} not found in BallDontLie injury report.`,
        };
      }

      const officialDesignation = match.status;
      const agrees = claimDesignation
        ? designationsAgree(claimDesignation, officialDesignation)
        : true;

      return {
        checked: true, listed: true,
        officialDesignation,
        stance: agrees ? "support" : "contradict",
        notes: `BallDontLie lists ${player} as: ${officialDesignation}.`,
      };
    }

    if (league === "MLB") {
      const transactions = await fetchMLBTransactions(2); // last 2 days
      const match = transactions.find(tx =>
        nameMatches(tx.person.fullName, player)
      );

      if (!match) {
        return {
          checked: true, listed: false,
          officialDesignation: null,
          stance: "context",
          notes: `${player} not found in MLB transactions (last 2 days).`,
        };
      }

      const officialDesignation = match.typeDesc ?? match.typeCode;
      const isILType = match.typeCode === "IL" || match.typeCode === "DFA";
      const agrees = claimDesignation
        ? (isILType && ["out", "il", "dnp"].some(s => claimDesignation.toLowerCase().includes(s)))
        : true;

      return {
        checked: true, listed: true,
        officialDesignation,
        stance: agrees ? "support" : "contradict",
        notes: `MLB StatsAPI: ${player} — ${match.description ?? officialDesignation}.`,
      };
    }

    return notChecked;
  } catch (err: any) {
    console.warn(`[retrieval] Official status check failed for ${player}:`, err.message);
    return {
      checked: false, listed: false,
      officialDesignation: null, stance: null,
      notes: `API call failed: ${err.message}`,
    };
  }
}

/* ─── 3. Market reaction check ───────────────────────────── */

/**
 * Looks up the team's game in the pipeline games table and checks
 * whether the spread or total moved since the opening line.
 *
 * For injury/negative-impact claims: if the team became a bigger underdog
 * (spread moved away from them), the market implicitly validated the claim.
 *
 * Returns null stance if there's no game data or no meaningful movement.
 */
export function checkLineReaction(
  team: string | null,
  league: string | null,
  claimType: string | null,
): LineReactionResult {
  const noData: LineReactionResult = {
    checked: false, openSpread: null, currentSpread: null,
    delta: null, stance: null, notes: "No game data for this team.",
  };

  if (!team || !league) return noData;

  let db: ReturnType<typeof getPipelineDb>;
  try {
    db = getPipelineDb();
  } catch {
    return noData;
  }

  // Find the team's most recently updated game
  const game = db.prepare(`
    SELECT spread_line, open_spread, total_line, open_total,
           home_team, away_team, spread_team
    FROM games
    WHERE league = ?
      AND (home_team = ? OR away_team = ?)
      AND status != 'final'
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(league, team.toUpperCase(), team.toUpperCase()) as any;

  if (!game) return noData;

  const openSpread   = game.open_spread  as number | null;
  const currentSpread = game.spread_line as number | null;

  if (openSpread == null || currentSpread == null) {
    return { ...noData, checked: true, notes: "Game found but no opening line recorded." };
  }

  const delta = currentSpread - openSpread;

  // Determine whether the movement validates an injury/negative claim:
  // Spread moves away from the team (they became a bigger underdog or smaller favourite)
  // means: if team == spread_team → spread_line became more negative (bigger fav)
  // actually if team has an injury claim, the spread should move AGAINST them (they get worse).
  //
  // Convention: spread_team is the favourite (spread_line is negative).
  // If the injured team IS the favourite: their spread_line should decrease (more negative) → delta < 0
  // If the injured team is NOT the favourite: spread_team (fav) should improve → delta > 0 (fav line goes up)
  //
  // Meaningful threshold: ≥0.5 point move
  const MEANINGFUL_DELTA = 0.5;
  const hasMoved = Math.abs(delta) >= MEANINGFUL_DELTA;

  if (!hasMoved) {
    return {
      checked: true, openSpread, currentSpread, delta,
      stance: "context",
      notes: `Line moved only ${delta.toFixed(1)} pts — not significant.`,
    };
  }

  const teamIsFav = game.spread_team?.toUpperCase() === team.toUpperCase();
  const isNegativeClaim = ["injury", "depth_chart", "trade"].includes(claimType ?? "");

  // For a negative claim (injury, etc.) about a team:
  // - If they're the favourite and the line got tighter (delta > 0, less negative), market validated the claim.
  // - If they're the underdog and the spread moved further against them (delta > 0), market validated.
  const marketValidated = isNegativeClaim && (
    (teamIsFav  && delta > 0) ||  // fav getting less credit
    (!teamIsFav && delta < 0)     // dog getting fewer points
  );

  return {
    checked: true, openSpread, currentSpread, delta,
    stance: marketValidated ? "support" : "context",
    notes: `${league} line moved ${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts from open (${openSpread} → ${currentSpread}).`,
  };
}
