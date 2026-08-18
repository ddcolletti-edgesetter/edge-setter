-- ═══════════════════════════════════════════════════════════════════════════
-- EdgeSetter — Entity-fragmentation diagnostics (2026-08-17)
--
-- Purpose: quantify, in PROD data, every entity-identity fault surfaced by the
-- fragmentation audit, so each behavior-changing fix can be justified by a real
-- number and prioritized by measured impact — not by hunch.
--
-- Run on the Render shell against the PIPELINE db:
--     sqlite3 /var/data/pipeline.db < diagnostics/entity-fragmentation.sql
-- (Section F is cross-database — see its note; it targets edge_setter.db.)
--
-- Fault map (see audit): each PART below measures one row of it.
--   A/B  findExistingSignal uses raw team/player verbatim  -> DUPLICATE signals
--   B    findExistingSignal never passes game_id           -> FALSE-MERGE signals
--   C    games identity is the id string, no UNIQUE guard  -> FORKED games
--   D    findGameByTeams: odds shortCode vs ESPN abbr      -> games never settle
--   G    null-game settlement via LIKE %team%              -> WRONG-game binding
--
-- HONESTY CAVEATS — read before trusting any number:
--   * raw_events may be pruned after processing. Sections B/D that join
--     live_signals.raw_event_ids -> raw_events UNDERCOUNT if old raw rows are
--     gone; treat their counts as a lower bound.
--   * Some deploys add live_signals.is_archived via migration. These queries do
--     NOT filter it, so archived rows are included (inflates raw counts). If the
--     column exists and you want live-only, add `AND is_archived=0`.
--   * The 4-hour merge window is a code constant (processor.ts); PART A groups
--     by normalized key regardless of window, so it also catches re-reports.
-- ═══════════════════════════════════════════════════════════════════════════

.headers on
.mode column

-- ─── PART A: DUPLICATE signals from unnormalized team/player (fault A/B) ─────
-- The fingerprint (league, team, player, signal_type) matches by EXACT,
-- case-sensitive string. Any spelling/casing variance forks a new signal row.
-- A normalized key collapses case + whitespace; groups where the normalized key
-- covers MORE THAN ONE distinct raw spelling are format-variance duplicates.

-- A1. How many normalized fingerprints are split across >1 raw spelling, by league.
--     `dup_signal_rows` = signals that would have merged under normalization.
WITH norm AS (
  SELECT id, league, signal_type,
         upper(trim(team))                   AS team_norm,
         upper(trim(coalesce(player,'')))    AS player_norm,
         trim(team)                          AS team_raw,
         trim(coalesce(player,''))           AS player_raw
  FROM live_signals
), grp AS (
  SELECT league, signal_type, team_norm, player_norm,
         COUNT(DISTINCT id)                                       AS rows_in_group,
         COUNT(DISTINCT team_raw   || '¦' || player_raw)          AS distinct_spellings
  FROM norm
  GROUP BY league, signal_type, team_norm, player_norm
)
SELECT league,
       SUM(CASE WHEN distinct_spellings > 1 THEN 1 ELSE 0 END)          AS fingerprints_with_variance,
       SUM(CASE WHEN distinct_spellings > 1 THEN rows_in_group ELSE 0 END) AS dup_signal_rows
FROM grp
GROUP BY league
ORDER BY dup_signal_rows DESC;

-- A2. Show the actual differing spellings (the "BOS vs Boston" / "L. James vs
--     LeBron James" evidence). Top 40 worst groups.
WITH norm AS (
  SELECT league, signal_type,
         upper(trim(team))                AS team_norm,
         upper(trim(coalesce(player,''))) AS player_norm,
         trim(team)                       AS team_raw,
         trim(coalesce(player,''))        AS player_raw
  FROM live_signals
)
SELECT league, signal_type, team_norm, player_norm,
       COUNT(*)                                          AS rows,
       COUNT(DISTINCT team_raw   || '¦' || player_raw)   AS variants,
       group_concat(DISTINCT team_raw   || ' / ' || player_raw) AS spellings
FROM norm
GROUP BY league, signal_type, team_norm, player_norm
HAVING variants > 1
ORDER BY variants DESC, rows DESC
LIMIT 40;

-- ─── PART B: FALSE-MERGE exposure (fault A: game_id omitted) ─────────────────
-- findExistingSignal supports game_id scoping but the call sites never pass it,
-- so signals are merged on (league, team, player, type) alone. We reconstruct
-- each live_signal's constituent games via its raw_event_ids.

WITH sig_games AS (
  SELECT ls.id AS signal_id, ls.league,
         COUNT(DISTINCT CASE WHEN re.game_id IS NOT NULL THEN re.game_id END) AS distinct_nonnull_games,
         SUM(CASE WHEN re.game_id IS NULL     THEN 1 ELSE 0 END)              AS null_game_events,
         SUM(CASE WHEN re.game_id IS NOT NULL THEN 1 ELSE 0 END)             AS nonnull_game_events
  FROM live_signals ls
  JOIN json_each(ls.raw_event_ids) je
  JOIN raw_events re ON re.id = je.value
  GROUP BY ls.id
)
-- B1. CURRENT HARM: single signals stitched from >1 distinct game.
--     These are exactly the rows game_id-scoping would (correctly) stop merging.
SELECT 'B1_false_merge_current_harm' AS metric, league,
       COUNT(*) AS signals_spanning_multiple_games
FROM sig_games
WHERE distinct_nonnull_games > 1
GROUP BY league
ORDER BY signals_spanning_multiple_games DESC;

-- B2. COLLATERAL RISK: merges that mix a null-game event with a real-game event.
--     Adding a game_id predicate could SPLIT these into duplicates unless we
--     also backfill game_id / normalize first. This is the number that decides
--     whether game_id-scoping is net-positive on its own or needs PART D first.
WITH sig_games AS (
  SELECT ls.id AS signal_id, ls.league,
         SUM(CASE WHEN re.game_id IS NULL     THEN 1 ELSE 0 END)  AS null_game_events,
         SUM(CASE WHEN re.game_id IS NOT NULL THEN 1 ELSE 0 END) AS nonnull_game_events
  FROM live_signals ls
  JOIN json_each(ls.raw_event_ids) je
  JOIN raw_events re ON re.id = je.value
  GROUP BY ls.id
)
SELECT 'B2_scoping_collateral_risk' AS metric, league,
       COUNT(*) AS merges_mixing_null_and_real_game
FROM sig_games
WHERE null_game_events > 0 AND nonnull_game_events > 0
GROUP BY league
ORDER BY merges_mixing_null_and_real_game DESC;

-- B3. BASELINE: how much does game_id-scoping even apply? Null vs set game_id.
SELECT 'B3_game_id_population' AS metric, league,
       COUNT(*)                                   AS signals,
       SUM(game_id IS NULL)                       AS game_id_null,
       ROUND(100.0*SUM(game_id IS NULL)/COUNT(*),1) AS pct_null
FROM live_signals
GROUP BY league
ORDER BY signals DESC;

-- ─── PART C: FORKED games (fault C: no UNIQUE guard on games) ────────────────
-- games identity is 100% the id string. Two id-generation paths for the same
-- real game = two rows. Group by the natural key the schema fails to enforce.

-- C1. Same (league, teams, date) under >1 distinct id — direct fork count.
SELECT league, upper(home_team) AS home, upper(away_team) AS away,
       date(game_time) AS gday,
       COUNT(*)                 AS row_count,
       COUNT(DISTINCT id)       AS distinct_ids,
       group_concat(DISTINCT id) AS ids
FROM games
GROUP BY league, upper(home_team), upper(away_team), date(game_time)
HAVING COUNT(DISTINCT id) > 1
ORDER BY row_count DESC
LIMIT 60;

-- C2. Fork summary by league.
WITH g AS (
  SELECT league, upper(home_team) AS h, upper(away_team) AS a, date(game_time) AS d,
         COUNT(DISTINCT id) AS ids
  FROM games GROUP BY league, upper(home_team), upper(away_team), date(game_time)
)
SELECT league,
       SUM(ids > 1)               AS forked_matchups,
       SUM(CASE WHEN ids > 1 THEN ids ELSE 0 END) AS forked_rows
FROM g GROUP BY league ORDER BY forked_rows DESC;

-- C3. The MLB legacy pattern generalized: lowercase 'mlb_<gamePk>' score rows
--     vs canonical 'MLB_<date>_<away>_<home>' odds rows still coexisting.
SELECT
  SUM(id GLOB 'mlb_[0-9]*')                       AS legacy_statsapi_style,
  SUM(id GLOB 'MLB_*_*_*')                        AS canonical_style,
  SUM(league='MLB')                              AS total_mlb_games
FROM games;

-- ─── PART D: games that never settle (fault D: code-vocabulary mismatch) ─────
-- findGameByTeams matches odds-adapter shortCode() against ESPN abbreviations.
-- Symptom: a game has odds AND a final score but produces no settled outcome —
-- i.e. the score landed on a different row (or the score row lacks odds).

-- D1. Games WITH odds and WITH a final score whose outcomes are unsettled/absent.
SELECT g.league,
       COUNT(*)                                             AS scored_games_with_odds,
       SUM(o.game_id IS NULL)                               AS no_outcome_row,
       SUM(o.hit IS NULL AND o.game_id IS NOT NULL)         AS outcome_row_unsettled
FROM games g
LEFT JOIN (
  SELECT game_id, MAX(hit IS NOT NULL) AS any_settled, MIN(hit) AS hit
  FROM outcomes GROUP BY game_id
) o ON o.game_id = g.id
WHERE g.spread_line IS NOT NULL
  AND g.home_score IS NOT NULL
GROUP BY g.league
ORDER BY scored_games_with_odds DESC;

-- D2. Team-code vocabulary drift: distinct home_team codes per league, with
--     length, to eyeball non-canonical codes (heuristic shortCode fallout).
SELECT league, home_team AS code, length(home_team) AS len, COUNT(*) AS games
FROM games
GROUP BY league, home_team
ORDER BY league, games DESC;

-- D3. Split identity generalized beyond MLB: same (league, teams, date) where
--     ONE row has odds-but-no-score and ANOTHER has score-but-no-odds. That is
--     the exact shape the MLB fix repaired — this finds it in NBA/NFL/CFB too.
WITH tagged AS (
  SELECT league, upper(home_team) AS h, upper(away_team) AS a, date(game_time) AS d,
         MAX(spread_line IS NOT NULL AND home_score IS NULL)  AS has_odds_only,
         MAX(spread_line IS NULL     AND home_score IS NOT NULL) AS has_score_only
  FROM games
  GROUP BY league, upper(home_team), upper(away_team), date(game_time)
)
SELECT league, COUNT(*) AS split_identity_matchups
FROM tagged
WHERE has_odds_only = 1 AND has_score_only = 1
GROUP BY league
ORDER BY split_identity_matchups DESC;

-- ─── PART E: wrong-game binding exposure (fault G) ──────────────────────────
-- Signals with game_id NULL that still got settled must have been bound via
-- findNextFinalGameForTeam's UPPER()+LIKE %team% matcher — the loosest path.
-- This counts the exposure surface (not proof of a wrong bind, but its ceiling).
SELECT league,
       COUNT(*)                                  AS null_game_signals,
       SUM(outcome_id IS NOT NULL)               AS settled_via_loose_team_match
FROM live_signals
WHERE game_id IS NULL
GROUP BY league
ORDER BY settled_via_loose_team_match DESC;

-- ─── PART F: orphan distribution_drafts (cross-database — edge_setter.db) ────
-- NOTE: distribution_drafts + signals live in edge_setter.db, NOT pipeline.db,
-- so this section canNOT run in the same sqlite3 session as the above. Run:
--     sqlite3 /var/data/edge_setter.db "SELECT COUNT(*) FROM distribution_drafts \
--       WHERE signal_id NOT IN (SELECT id FROM signals);"
-- The live API already exposes this as `distribution_drafts_orphaned` in the
-- admin diagnostics payload (server/routes.ts). Cross-check the two agree.
