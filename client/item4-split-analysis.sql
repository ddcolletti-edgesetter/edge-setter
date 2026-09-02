-- item-4 PR #36 deploy-cutoff split — SELF-CONTAINED.
-- Rebuilds the live-population `gaps` table + `cfg`, then runs blocks (5)-(8).
-- Safe to paste into a fresh sqlite3 session (no dependency on the main file).
--
-- Question: is the LIVE 24h injury_update dedup window working, or missing pairs
-- it should merge?  The collected distribution (min_h≈4.0, zero pairs <4h) is
-- shaped by dedup HISTORY (old 4h window already merged anything <4h), so it is
-- NOT a natural gap distribution.  The test that matters: do pairs created AFTER
-- the 24h window went live still fork under 24h?
--
-- Cutoff = PR #36 merge to main (c541494), GitHub mergedAt = 2026-08-29T03:03:26Z.
-- Render deploys from main, so the 24h window went live AT OR AFTER this instant.
-- NOT 2026-08-27 — that is only the feature-branch authoring date of 03bb769.
-- Read-only: TEMP tables only, never written to the db file.

.headers on
.mode column

-- Live-population gaps: for each injury_update row b, the single prior row a that
-- findExistingSignal() WOULD return (closest match, within 48h). is_archived=0 on
-- both sides mirrors the population production actually dedups against.
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
   -- live population only (both sides): mirrors findExistingSignal()'s is_archived=0
   AND a.is_archived = 0
   AND b.is_archived = 0
   AND ( a.created_at <  b.created_at
         OR (a.created_at = b.created_at AND a.id < b.id) )
   AND (b.jd - a.jd) * 24.0 <= 48.0
   -- team: production drops the team condition when b.team is null/''
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

-- (5a) Deploy cutoff, defined once so you edit it in ONE place. If you get the
--      exact Render deploy-complete time, put it here; treat any post-deploy
--      "miss" whose b_created is within ~15 min of the cutoff as deploy-lag noise.
CREATE TEMP TABLE cfg AS SELECT '2026-08-29T03:03:26Z' AS deploy_cutoff;

-- (5) Split the gaps by the cutoff, on b_created (the LATER row = the event that
--     should have merged onto the earlier live row under the 24h window).
--     pre_deploy  : processed under the OLD 4h window — a <24h fork is EXPECTED.
--     post_deploy : processed under the LIVE 24h window — a <24h fork should NOT exist.
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
--     window works, this is at or near zero (both rows live, gap < 24h, same key,
--     b processed after the window went live => production SHOULD have collapsed
--     them into ONE row). A meaningful count (after discounting near-cutoff
--     deploy-lag) => live dedup is BROKEN right now, a bigger problem than width.
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

-- (7) Example rows from the post-deploy under-24h bucket (smallest gaps first).
--     Every pair in `gaps` already passed the EXACT match key, so a_player=b_player
--     and a_team=b_team by construction — these are GENUINE same-key dedup misses,
--     NOT "Patrick Mahomes" vs "P. Mahomes" string divergence (that never pairs
--     here; see block (8)).
SELECT b_id, league,
       a_team, b_team, a_player, b_player,
       a_created, b_created,
       ROUND(gap_hours, 3) AS gap_hours
FROM gaps
WHERE julianday(b_created) >= julianday((SELECT deploy_cutoff FROM cfg))
  AND gap_hours > 0.001 AND gap_hours < 24
ORDER BY gap_hours ASC
LIMIT 10;

-- (8) COMPANION probe for the "near-miss string divergence" hypothesis, on the
--     population where it can occur (rows that DON'T pair in gaps because the
--     player string differs). Live, post-deploy, same league+team, gap < 24h, but
--     DIFFERENT non-null player strings.
--     CAVEAT — eyeball-only, NOT a bug count: two genuinely different players on
--     one team injured within 24h is normal, so nonzero is fine. Only pairs where
--     a_player and b_player are obviously the SAME person spelled differently
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
