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
  game_time: string;                // ISO 8601
  status: "scheduled" | "live" | "final" | "postponed";
  // Primary market snapshot (updated live)
  spread_line: number | null;       // favourite perspective, e.g. -5.5
  spread_team: string | null;       // which team is favoured
  total_line: number | null;        // e.g. 214
  moneyline_home: number | null;    // American odds
  moneyline_away: number | null;
  // Open-market values (for CLV computation later)
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
  | "scheme_note"    // CFB/NFL manual notes
  | "transaction"    // roster moves, IL activations, trades
  | "odds_open"      // opening line for a new game
  | "manual";        // operator-entered

export interface RawEvent {
  id: string;                       // UUID
  source_id: string;                // e.g. "the_odds_api", "balldontlie", "mlb_statsapi", "operator"
  source_type: "api" | "manual" | "scrape";
  league: League;
  game_id: string | null;           // FK → Game.id (if applicable)
  team: string | null;              // short code
  player: string | null;
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
  | "sharp_money"
  | "manual";

export type UrgencyLabel = "LIVE" | "URGENT" | "WATCH" | "NOTE";
export type ScoreBand = "Elite" | "Strong" | "Watchlist" | "Informational";
export type TrustLabel = "Consensus" | "Corroborated" | "Developing" | "Unverified";

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
  injury_designation: string | null; // "OUT" | "Doubtful" | "Questionable" | "IL-60"
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
  market: "spread" | "total" | "moneyline";
  line_at_signal: number | null;   // line when Signal was generated
  closing_line: number | null;     // line at game start (for CLV)
  actual_result: number | null;    // final score difference or total
  // Derived (populate later)
  hit: boolean | null;             // did the signal's recommended side win?
  clv: number | null;              // closing line value (+ is good)
  // Meta
  recorded_at: string | null;
  created_at: string;
}
