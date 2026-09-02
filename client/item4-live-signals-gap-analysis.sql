-- item-4 gap analysis: live_signals / signal_type='injury_update'
-- Mirrors production dedup: findExistingSignal() in server/pipeline/store.ts
-- Match key = league + team(dropped when null/'') + player(strict, null=null) + signal_type
--             + is_archived=0 + created_at within window.  NO source. NO game_id (not passed).
-- Ordering/window column = created_at (same column dedupSince and ORDER BY use).
-- Read-only: uses TEMP table only (in-memory, never written to the db file).

.headers on
.mode column

-- (0) real schema, to confirm column names against this analysis
.schema live_signals

-- Build faithful dedup pairs into a TEMP table.
-- For each injury_update row b, find the single prior row a that findExistingSignal
-- WOULD return (most-recent match, ORDER BY created_at DESC LIMIT 1), within 48h.
-- Total order (created_at, id) makes each unordered pair count once (incl. zero-gap ties).
CREATE TEMP TABLE gaps AS
WITH inj AS (
  SELECT id, league, team, player, created_at, is_archived,
         julianday(created_at) AS jd
  FROM live_signals
  WHERE signal_type = 'injury_update'
),
matches AS (
  SELECT
    b.id AS b_id, b.league,
    b.team AS b_team, b.player AS b_player,
    a.team AS a_team, a.player AS a_player,
    b.created_at AS b_created, a.created_at AS a_created,
    (b.jd - a.jd) * 24.0 AS gap_hours,
    ROW_NUMBER() OVER (PARTITION BY b.id ORDER BY a.jd DESC, a.id) AS rn
  FROM inj b
  JOIN inj a
    ON a.league = b.league
   AND a.id <> b.id
   AND ( a.created_at <  b.created_at
         OR (a.created_at = b.created_at AND a.id < b.id) )
   AND (b.jd - a.jd) * 24.0 <= 48.0
   -- team: production drops the team condition when b.team is null/'' (over-match risk)
   AND ( (b.team IS NOT NULL AND b.team <> '' AND a.team = b.team)
         OR (b.team IS NULL OR b.team = '') )
   -- player: strict identity, null matches null, '' matches ''
   AND ( (b.player IS NULL AND a.player IS NULL)
         OR (b.player = '' AND a.player = '')
         OR (b.player IS NOT NULL AND b.player <> '' AND a.player = b.player) )
)
SELECT b_id, league, b_team, b_player, a_team, a_player,
       a_created, b_created, gap_hours
FROM matches
WHERE rn = 1;

-- (1) headline stats + bucket split  (compare to situations proxy: n=85, 39% <24h, 54% 24-48h)
SELECT
  COUNT(*)                                                              AS n_pairs,
  ROUND(MIN(gap_hours), 3)                                              AS min_h,
  ROUND(MAX(gap_hours), 3)                                              AS max_h,
  ROUND(AVG(gap_hours), 3)                                              AS avg_h,
  SUM(CASE WHEN gap_hours <= 0.001 THEN 1 ELSE 0 END)                   AS zero_gap,
  SUM(CASE WHEN gap_hours > 0.001 AND gap_hours < 24 THEN 1 ELSE 0 END) AS under_24h,
  SUM(CASE WHEN gap_hours >= 24 THEN 1 ELSE 0 END)                      AS h24_48
FROM gaps;

-- (2) median gap (SQLite middle-row trick)
SELECT ROUND(AVG(gap_hours), 3) AS median_h FROM (
  SELECT gap_hours FROM gaps ORDER BY gap_hours
  LIMIT 2 - (SELECT COUNT(*) FROM gaps) % 2
  OFFSET (SELECT (COUNT(*) - 1) / 2 FROM gaps)
);

-- (3) empty/null over-match check (analog of situations empty_players_pairs / empty_teams_pairs).
--     empty_team_pairs  : pair matched with b.team null/'' (team constraint dropped)
--     cross_team_pairs  : pair whose two rows have DIFFERENT teams (only possible via dropped constraint)
--     empty_player_pairs: pair matched with b.player null/'' (null=null strict-match collapse)
SELECT
  SUM(CASE WHEN (b_team IS NULL OR b_team = '')                 THEN 1 ELSE 0 END) AS empty_team_pairs,
  SUM(CASE WHEN (a_team IS NOT b_team)                         THEN 1 ELSE 0 END) AS cross_team_pairs,
  SUM(CASE WHEN (b_player IS NULL OR b_player = '')             THEN 1 ELSE 0 END) AS empty_player_pairs
FROM gaps;

-- (4) context: population + null/empty entity prevalence + archival split
SELECT
  COUNT(*)                                                    AS total_injury_rows,
  SUM(CASE WHEN team   IS NULL OR team   = '' THEN 1 ELSE 0 END) AS null_or_empty_team,
  SUM(CASE WHEN player IS NULL OR player = '' THEN 1 ELSE 0 END) AS null_or_empty_player,
  SUM(CASE WHEN is_archived = 1 THEN 1 ELSE 0 END)            AS archived_rows
FROM live_signals
WHERE signal_type = 'injury_update';
