-- item-4 gap analysis: live_signals / signal_type='injury_update'
-- Mirrors production dedup: findExistingSignal() in server/pipeline/store.ts
-- Match key = league + team(dropped when null/'') + player(strict, null=null) + signal_type
--             + is_archived=0 + created_at within window.  NO source. NO game_id (not passed).
-- Ordering/window column = created_at (same column dedupSince and ORDER BY use).
--
-- is_archived=0 is hardcoded into findExistingSignal()'s WHERE clause
-- (store.ts:1242, `conds = ["league=?", "is_archived=0"]`) — it dedups only
-- against the LIVE population. Both sides of every pair are filtered to
-- is_archived=0 below so this mirrors that population, not archived history.
--
-- WINDOW: production's injury_update lookback is 24h (processor.ts:39-41,
-- SIGNAL_DEDUP_LOOKBACK_MS.injury_update = 24h). This query COLLECTS at 48h on
-- purpose, for parity with the situations proxy (measured at 48h). Because rn=1
-- always picks the closest prior, the buckets split cleanly:
--   zero_gap + under_24h = pairs production MERGES (closest prior <=24h)
--   h24_48               = pairs production FORKS  (closest prior 24-48h, outside
--                          the 24h lookback -> findExistingSignal returns null).
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
   -- live population only: findExistingSignal() searches is_archived=0 rows,
   -- and a freshly-processed event b is is_archived=0 at dedup time too.
   AND a.is_archived = 0
   AND b.is_archived = 0
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

-- (4) context: archival split (full population) + null/empty entity prevalence
--     restricted to the LIVE (is_archived=0) population that dedup actually runs on.
--     total_injury_rows/archived_rows/live_rows keep the full-population split
--     (this is where the ~95% archived figure comes from); the null/empty counts
--     are live-only so they describe the population findExistingSignal() searches.
SELECT
  COUNT(*)                                                                            AS total_injury_rows,
  SUM(CASE WHEN is_archived = 1 THEN 1 ELSE 0 END)                                    AS archived_rows,
  SUM(CASE WHEN is_archived = 0 THEN 1 ELSE 0 END)                                    AS live_rows,
  SUM(CASE WHEN is_archived = 0 AND (team   IS NULL OR team   = '') THEN 1 ELSE 0 END) AS live_null_or_empty_team,
  SUM(CASE WHEN is_archived = 0 AND (player IS NULL OR player = '') THEN 1 ELSE 0 END) AS live_null_or_empty_player
FROM live_signals
WHERE signal_type = 'injury_update';

-- ============================================================================
-- PR #36 deploy-cutoff analysis (added; blocks 0-4 above are unchanged).
-- Purpose: is the LIVE 24h dedup window currently working, or is it missing
-- pairs it should merge?  survivorship note: the collected distribution
-- (min_h≈4.0, zero pairs <4h) is shaped by dedup HISTORY — under the old 4h
-- window any pair <4h already merged and can't appear as two live rows — so the
-- distribution is not a "natural" gap distribution.  The test that matters is
-- whether pairs created AFTER the 24h window went live still fork under 24h.
-- ============================================================================

-- (5a) Deploy cutoff, defined once so you edit it in ONE place.
--   Value = PR #36 merge to main (c541494), GitHub mergedAt = 2026-08-29T03:03:26Z.
--   Render deploys from main, so the 24h window went live AT OR AFTER this instant.
--   This is NOT 2026-08-27 — that is only the feature-branch authoring date of
--   03bb769, which never ran in prod before the merge.
--   Deploy COMPLETES a few minutes after merge; if you can get the exact Render
--   deploy-complete time, put it here instead. Treat any post-deploy "miss" whose
--   b_created is within ~15 min of this cutoff as deploy-lag noise, not a real miss.
CREATE TEMP TABLE cfg AS SELECT '2026-08-29T03:03:26Z' AS deploy_cutoff;

-- (5) Split the SAME gaps used in report (1) by the deploy cutoff, on b_created
--     (the LATER row of each pair = the event that, when processed, should have
--     merged onto the earlier live row under the 24h window).
--     pre_deploy  : b processed under the OLD 4h window — a <24h fork here is
--                   EXPECTED and harmless (correctly unmerged at the time).
--     post_deploy : b processed under the LIVE 24h window — a <24h fork here
--                   should NOT exist if dedup is working.
SELECT
  CASE WHEN julianday(b_created) < julianday((SELECT deploy_cutoff FROM cfg))
       THEN 'pre_deploy' ELSE 'post_deploy' END                          AS cohort,
  COUNT(*)                                                               AS n_pairs,
  SUM(CASE WHEN gap_hours > 0.001 AND gap_hours < 24 THEN 1 ELSE 0 END)  AS under_24h,
  SUM(CASE WHEN gap_hours >= 24 THEN 1 ELSE 0 END)                       AS h24_48,
  ROUND(MIN(gap_hours), 3)                                               AS min_h,
  ROUND(MAX(gap_hours), 3)                                               AS max_h
FROM gaps
GROUP BY cohort
ORDER BY cohort;

-- (6) THE critical number. Post-deploy pairs with gap < 24h. If the live 24h
--     window works, this is at or near zero: both rows live, gap < 24h, same
--     match key, b processed after the window went live => production SHOULD have
--     collapsed them into ONE row. A meaningful count here (more than a small
--     handful, after discounting near-cutoff deploy-lag) => live dedup is BROKEN
--     right now, which is a bigger problem than the 24h-vs-48h width question.
SELECT
  COUNT(*)                                            AS post_deploy_under_24h_pairs,
  ROUND(MIN(gap_hours), 3)                            AS min_gap_h,
  ROUND(MAX(gap_hours), 3)                            AS max_gap_h,
  SUM(CASE WHEN julianday(b_created)
                - julianday((SELECT deploy_cutoff FROM cfg)) < (15.0/1440.0)
           THEN 1 ELSE 0 END)                         AS within_15min_of_cutoff_discount
FROM gaps
WHERE julianday(b_created) >= julianday((SELECT deploy_cutoff FROM cfg))
  AND gap_hours > 0.001 AND gap_hours < 24;

-- (7) Example rows from the post-deploy under-24h bucket (smallest gaps first —
--     a 5h post-deploy miss is far more damning than a 23.9h one, which could be
--     a window-edge/timing effect). NOTE: every pair in `gaps` already passed the
--     EXACT match key, so a_player = b_player and a_team = b_team by construction.
--     That means these are GENUINE same-key dedup misses — the "Patrick Mahomes"
--     vs "P. Mahomes" string-divergence explanation CANNOT apply here (divergent
--     names never form a pair in `gaps`; see block (8) for that hypothesis).
SELECT b_id, league,
       a_team, b_team, a_player, b_player,
       a_created, b_created,
       ROUND(gap_hours, 3) AS gap_hours
FROM gaps
WHERE julianday(b_created) >= julianday((SELECT deploy_cutoff FROM cfg))
  AND gap_hours > 0.001 AND gap_hours < 24
ORDER BY gap_hours ASC
LIMIT 10;

-- (8) COMPANION probe for the item-4 "near-miss string divergence" hypothesis,
--     on the population where it can actually occur (rows that DON'T pair in gaps
--     because the player string differs). Live, post-deploy, same league+team,
--     gap < 24h, but DIFFERENT non-null player strings.
--     CAVEAT — this is eyeball-only, NOT a bug count: two genuinely different
--     players on the same team injured within 24h is normal and expected, so a
--     nonzero count is fine. Only pairs where a_player and b_player are obviously
--     the SAME person spelled differently ("Patrick Mahomes" / "P. Mahomes")
--     indicate fragmentation from inconsistent naming rather than a broken window.
SELECT a.id AS a_id, b.id AS b_id, a.league, a.team,
       a.player AS a_player, b.player AS b_player,
       a.created_at AS a_created, b.created_at AS b_created,
       ROUND((julianday(b.created_at) - julianday(a.created_at)) * 24.0, 3) AS gap_hours
FROM live_signals a
JOIN live_signals b
  ON a.signal_type = 'injury_update' AND b.signal_type = 'injury_update'
 AND a.is_archived = 0 AND b.is_archived = 0
 AND a.league = b.league
 AND a.team = b.team AND a.team IS NOT NULL AND a.team <> ''
 AND a.player IS NOT NULL AND a.player <> ''
 AND b.player IS NOT NULL AND b.player <> ''
 AND a.player <> b.player
 AND a.created_at < b.created_at
 AND (julianday(b.created_at) - julianday(a.created_at)) * 24.0 < 24.0
 AND julianday(b.created_at) >= julianday((SELECT deploy_cutoff FROM cfg))
ORDER BY gap_hours ASC
LIMIT 10;
