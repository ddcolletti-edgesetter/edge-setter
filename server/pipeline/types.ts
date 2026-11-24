import type { GradedSide, NoGradeReason, SettlementState } from "@shared/settlement-grading";
/**
 * Edge Setter — Live Pipeline Types  (Sprint 7)
 *
 * These are the server-side canonical types for the ingestion &
 * processing pipeline.  They live in server/pipeline/ and are
 * intentionally kept independent of the Drizzle schema so they
 * can be adapted to Supabase or any other store later.
 *
 * Design constraints:
 *   - Signal fields mirror the enriched mock data shape so the
 *     frontend can swap mock → live with zero changes.
 *   - RawEvent is the immutable inbound record; Signal is the
 *     mutable processed record (updated as events flow in).
 *   - Outcome is schema-only for now (no CLV math yet).
 */

/* ─── Sport / League ────────────────────────────────────── */

export type League = "NBA" | "MLB" | "NFL" | "CFB";

/* ─── Game / Market ─────────────────────────────────────── */

/**
 * A single scheduled game.  One Game may have many Markets (spread,
 * total, moneyline) but we flatten the most common ones here for
 * simplicity.  The `markets` field holds an array for exotic bets.
 */
export interface Game {
  id: string;                       // e.g. "nba_2026-04-26_bos_mia"
  league: League;
  home_team: string;                // short code, e.g. "BOS"
  away_team: string;
  /**
   * The team name exactly as the feed that created the row sent it — "Rice
   * Owls", "Kansas City Chiefs". Display only.
   *
   * WHY IT EXISTS. home_team/away_team hold shortCode() of the odds-API name,
   * which for 88 of 136 FBS teams is a three-letter slice of the MASCOT ("OWL"
   * for Rice Owls, "PAN" for Pittsburgh Panthers), and a CFB board printed
   * that at readers. The client can resolve some of those tokens back to a
   * school, but 16 are shared by more than one school and are unresolvable in
   * principle. The adapter had the real name in hand and threw it away; this
   * column keeps it.
   *
   * OPTIONAL, AND NULLABLE IN SQL, because it is a migration column:
   *   • every row written before this shipped reads back NULL;
   *   • the two writers that have no name to give — upsertHistoricalGame and
   *     ingestMLBSchedule — leave it alone, and the ON CONFLICT clauses
   *     COALESCE so neither erases a name the odds adapter stored.
   * Nothing grades, matches, settles or hashes on it. home_team/away_team stay
   * the identity columns and keep their exact current values.
   */
  home_team_name?: string | null;
  away_team_name?: string | null;
  game_time: string;                // ISO 8601
  status: "scheduled" | "live" | "final" | "postponed";
  // Primary market snapshot (updated live)
  /**
   * HOME perspective, always. Negative means the home team is favoured by
   * that many points, positive means they are the underdog.
   *
   * This said "favourite perspective" until 2026-11; it never was. The odds
   * adapter reads the point off the HOME outcome
   * (`outcomes.find(o => o.name === ag.home_team).point`) and writes
   * `spread_team: shortCode(ag.home_team)` beside it with no conditional. On
   * prod, spread_team equals home_team in all 2,056 rows that carry a spread,
   * and 47 NFL rows carry a positive spread_line — a home underdog, which the
   * old wording could not describe.
   */
  spread_line: number | null;
  /**
   * The team spread_line is quoted from — i.e. the HOME team, always. Named
   * for an intent the code never implemented; see spread_line above and the
   * note on teamIsFav in retrieval.ts.
   */
  spread_team: string | null;
  total_line: number | null;        // e.g. 214
  moneyline_home: number | null;    // American odds
  moneyline_away: number | null;
  /**
   * The opening line, in the SAME home perspective as spread_line — it is a
   * frozen copy of an earlier spread_line, written by the same upsertGame
   * call. Insert-only, with exactly one audited exception: rebaselineGameOpen
   * in odds-open-rebaseline.ts, which replaces an opener that is not on the
   * same run of observations as the current line.
   */
  open_spread: number | null;
  open_total: number | null;
  // Final scores (populated by settlement engine once game is complete)
  home_score: number | null;
  away_score: number | null;
  // Metadata
  source_game_id: string | null;    // id from the upstream API
  created_at: string;
  updated_at: string;
}

/* ─── RawEvent ───────────────────────────────────────────── */

/**
 * An immutable inbound event exactly as received from any source.
 * The processing layer reads these and converts them into Signals.
 */
export type RawEventType =
  | "injury_update"
  | "lineup_confirm"
  | "lineup_change"
  | "line_move"
  | "weather_update"
  | "scheme_note"         // CFB/NFL manual notes
  | "transaction"         // roster moves, IL activations, trades
  | "eligibility_ruling"  // NCAA/transfer eligibility decisions
  | "odds_open"           // opening line for a new game
  | "manual"              // operator-entered
  | "coaching_change";    // coaching hires, fires, resignations

export interface RawEvent {
  id: string;                       // UUID
  source_id: string;                // e.g. "the_odds_api", "balldontlie", "mlb_statsapi", "operator"
  source_type: "api" | "manual" | "scrape" | "rss" | "vision_agent";
  league: League;
  game_id: string | null;           // FK → Game.id (if applicable)
  team: string | null;              // short code
  player: string | null;
  /**
   * Roster-gazetteer fallback name for headlines the regex `player` extractor
   * misses (written by setPlayerCandidate on the RSS ingest path). Consumed by
   * the situations adapter ONLY as a fallback when `player` is empty — it never
   * overrides a successful regex extraction. Absent on non-RSS sources.
   */
  player_candidate?: string | null;
  player_candidate_confidence?: string | null;
  /** ESPN athlete id for {@link player_candidate}, when the roster match resolved
   *  one. Display passenger for the story-card headshot; absent on non-RSS sources. */
  player_candidate_espn_id?: string | null;
  /** Jersey number for {@link player_candidate}, when the roster supplied one.
   *  Second display passenger, carried parallel to player_candidate_espn_id. */
  player_candidate_jersey?: string | null;
  event_type: RawEventType;
  payload: Record<string, unknown>; // raw JSON from upstream
  processed: boolean;               // has this been turned into a Signal?
  processed_at: string | null;
  created_at: string;
  received_at: string;
}

/* ─── Signal ─────────────────────────────────────────────── */

/**
 * A processed, scored edge.  This is what the delivery API serves
 * and what the frontend boards consume.
 *
 * Field naming intentionally mirrors the enriched mock data so the
 * frontend needs zero changes to consume live signals.
 */
export type SignalVerdict = "confirmed" | "likely" | "rumor" | "contradicted" | "review";
export type SignalType =
  | "line_move"
  | "injury_update"
  | "lineup_confirm"
  | "lineup_change"
  | "weather_update"
  | "scheme_note"
  | "transaction"
  | "eligibility_ruling"
  | "sharp_money"
  | "manual";

export type UrgencyLabel = "LIVE" | "URGENT" | "WATCH" | "NOTE";
export type ScoreBand = "Elite" | "Strong" | "Watchlist" | "Informational";
export type TrustLabel = "Consensus" | "Corroborated" | "Developing" | "Unverified";

/**
 * Which market a line_move signal describes. Set once, by the handler, from the
 * odds adapter's payload.market; never inferred later. NULL for every other
 * signal type, for an opener with no spread, and for line_move rows written
 * before this column existed (their market lives only in raw_events.payload).
 */
export type LineMoveMarket = "spread" | "total";

export interface LineMovement {
  open: number;
  current: number;
  delta: number;         // current − open (positive = line went up)
  direction: "up" | "down" | "flat";
}

export interface SignalSource {
  name: string;
  type: string;
}

export interface ScoreBreakdown {
  confidenceScore: number;       // 0–22
  sourceQualityScore: number;    // 0–28
  marketImpactScore: number;     // 0–24
  recencyBonus: number;          // 0–12
  relevanceScore: number;        // 0–8
  contextScore: number;          // 0–6
  leagueModifierApplied: string;
  rawBeforeMods: number;
}

export interface LiveSignal {
  id: string;                        // UUID
  league: League;
  game_id: string | null;
  signal_type: SignalType;
  // Display content
  headline: string;                  // one-line summary
  body: string;                      // longer context paragraph
  action_note: string;               // what to do right now
  why_it_matters: string;            // brief plain-English edge explanation
  // Market context
  team: string | null;
  player: string | null;
  matchup: string | null;            // e.g. "BOS @ MIA"
  sources: SignalSource[];
  source_count: number;
  // Verdict + trust
  verdict: SignalVerdict;
  confidence: number;                // 0–100
  confirmation_strength: string;     // "Consensus" | "Corroborated" | "Developing" | "Unverified"
  // Market data
  line_movement: LineMovement | null;
  /** line_move only: the market the move is in. See LineMoveMarket. */
  market?: LineMoveMarket | null;
  /**
   * The side this signal's card copy claims, set by the handler that writes
   * the copy; NULL when the copy claims none. Settlement grades only on this.
   * See shared/settlement-grading.ts.
   */
  graded_side?: GradedSide | null;
  injury_designation: string | null; // "OUT" | "Doubtful" | "Questionable" | "Day-to-day" | "IL-60"
  /**
   * Where injury_designation came from: "<source_type>:<source_id>:<league>:payload.<field>"
   * (shared/injury-designation-source.ts). NULL when there is no designation,
   * and on every row written before the column existed. Optional so callers
   * that build a LiveSignal without one (alerts, fixtures) store NULL.
   */
  injury_designation_source?: string | null;
  lineup_status: string | null;
  weather_note: string | null;
  betting_relevance: boolean;
  fantasy_relevance: boolean;
  // Scoring (populated by processor)
  score: number;                     // 0–100
  score_band: ScoreBand;
  urgency_label: UrgencyLabel;
  urgency_reason: string;
  trust_label: TrustLabel;
  score_explanation: string;
  breakdown: ScoreBreakdown;
  // Provenance
  raw_event_ids: string[];           // which RawEvents produced this Signal
  // Timestamps
  signal_time: string;               // when the underlying event happened
  first_seen_at?: string;            // when signal was first created (for lead-time tracking)
  created_at: string;
  updated_at: string;
  // Outcome hook
  outcome_id: string | null;        // FK → Outcome.id once settled
}

/* ─── Outcome ────────────────────────────────────────────── */

/**
 * Schema-only for now.  No CLV calculation yet.
 * A Signal is "relevant" if it was betting_relevance=true.
 * Hit is true if the bet recommended by action_note won.
 * CLV = closing line value = (line at signal time) − (closing line).
 *
 * To compute later:
 *   1. Record final result for the game/market.
 *   2. For each relevant Signal, look up the line at signal_time
 *      (stored in game.open_spread / game.spread_line history).
 *   3. Compare to actual result → hit: bool.
 *   4. CLV = open_line − closing_line (positive = you got the better number).
 */
export interface Outcome {
  id: string;
  signal_id: string;               // FK → LiveSignal.id
  game_id: string;                 // FK → Game.id
  // Result
  home_score: number | null;
  away_score: number | null;
  /** v2 also writes "unknown" | "mixed" | "none" on ungraded rows (see grading-v2.ts OutcomeMarket). */
  market: "spread" | "total" | "moneyline" | "unknown" | "mixed" | "none";
  line_at_signal: number | null;   // line when Signal was generated
  closing_line: number | null;     // line at game start (for CLV)
  actual_result: number | null;    // final score difference or total
  // Derived (populate later)
  hit: boolean | null;             // did the signal's recommended side win?
  clv: number | null;              // closing line value (+ is good)
  /** "graded" | "no_grade". A no_grade row always has hit = null. Absent = "graded" (pre-v2 writer). */
  settlement_state?: SettlementState;
  no_grade_reason?: NoGradeReason | string | null;
  /** NULL for rows settled before v2. */
  grading_version?: string | null;
  // Meta
  recorded_at: string | null;
  created_at: string;
}
