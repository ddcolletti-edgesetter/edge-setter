-- item-4 POST-48h deploy-cutoff split — SELF-CONTAINED.
-- Rebuilds the live-population `gaps` table + `cfg`, then runs blocks (5)-(9).
-- Safe to paste into a fresh sqlite3 session (no dependency on the main file).
--
-- RE-RUN CONTEXT (2026-09-02): PR #41 widened the injury_update dedup window
-- from 24h to 48h. This file was originally tuned to the 24h-era cutoff (PR #36,
-- 2026-08-29); it has now been re-pointed to the 48h deploy. The prior 24h
-- version is preserved in git history — do not reconstruct it here.
--
-- Question: is the LIVE 48h injury_update dedup window working, or missing pairs
-- it should merge?  The collected distribution (min_h≈4.0, zero pairs <4h) is
-- shaped by dedup HISTORY (old 4h window already merged anything <4h), so it is
-- NOT a natural gap distribution.  The test that matters: do pairs whose LATER
-- row was created AFTER the 48h window went live still fork within 48h?
--
-- IMPORTANT — retroactivity: widening the window does NOT merge rows that already
-- forked. The ~473 historical 24-48h forks were created under the 24h window and
-- REMAIN two separate rows forever; they show up in the pre_deploy cohort below
-- and are EXPECTED, not a regression. The fix only prevents NEW forks going
-- forward, so Q1 ("do the 473 now merge?") is answered by the post_deploy cohort,
-- not by the historical pairs.
--
-- CAVEAT — window age: PR #41 merged to main 2026-09-02T06:03:17Z, i.e. only
-- hours before this re-run. The post_deploy cohort may be very small; a tiny or
-- empty post_deploy count means "not enough live-window data yet", NOT "verified
-- clean". State the post_deploy n explicitly when reporting.
--
-- Cutoff = PR #41 merge to main (54da4e4), GitHub mergedAt = 2026-09-02T06:03:17Z.
-- Render deploys from main, so the 48h window went live AT OR AFTER this instant.
-- (Prior 24h-era cutoff was PR #36 / c541494 / 2026-08-29T03:03:26Z.)
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
CREATE TEMP TABLE cfg AS SELECT '2026-09-02T06:03:17Z' AS deploy_cutoff;

-- (5) Split the gaps by the cutoff, on b_created (the LATER row = the event that
--     should have merged onto the earlier live row under the 48h window).
--     pre_deploy  : b processed under the OLD <=24h window — a 24-48h fork is
--                   EXPECTED (this is where the ~473 historical forks live).
--     post_deploy : b processed under the LIVE 48h window — ANY same-key fork
--                   within 48h should NOT exist. Answers Q1 (new pairs merge?)
--                   and Q3 (post-fix misses).
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

-- (6) THE critical number (Q1 + Q3). Post-deploy pairs with gap < 48h. If the
--     live 48h window works, this is at or near zero: both rows live, same key,
--     gap < 48h, b processed after the window went live => production SHOULD have
--     collapsed them into ONE row. A meaningful count (after discounting the
--     near-cutoff deploy-lag column) => live 48h dedup is still leaking. The
--     under_24h split isolates any residual that even the OLD window should have
--     caught (a stronger failure than a 24-48h miss).
SELECT
  COUNT(*)                                            AS post_deploy_under_48h_pairs,
  SUM(CASE WHEN gap_hours < 24 THEN 1 ELSE 0 END)     AS of_which_under_24h,
  ROUND(MIN(gap_hours), 3)                            AS min_gap_h,
  ROUND(MAX(gap_hours), 3)                            AS max_gap_h,
  SUM(CASE WHEN julianday(b_created)
                - julianday((SELECT deploy_cutoff FROM cfg)) < (15.0/1440.0)
           THEN 1 ELSE 0 END)                         AS within_15min_of_cutoff_discount
FROM gaps
WHERE julianday(b_created) >= julianday((SELECT deploy_cutoff FROM cfg))
  AND gap_hours > 0.001 AND gap_hours < 48;

-- (7) Example rows from the post-deploy under-48h miss bucket (Q3 investigation,
--     smallest gaps first). Every pair in `gaps` already passed the EXACT match
--     key, so a_player=b_player and a_team=b_team by construction — these are
--     GENUINE same-key dedup misses, NOT "Patrick Mahomes" vs "P. Mahomes" string
--     divergence (that never pairs here; see block (8)). injury_designation is
--     surfaced on both sides so you can eyeball whether the miss is a real
--     same-injury revision (Q3) vs two different injuries that happen to share the
--     match key (would instead be a merge risk — see block (9)).
SELECT g.b_id, g.league,
       g.a_team, g.b_team, g.a_player, g.b_player,
       la.injury_designation AS a_designation,
       lb.injury_designation AS b_designation,
       g.a_created, g.b_created,
       ROUND(g.gap_hours, 3) AS gap_hours
FROM gaps g
LEFT JOIN live_signals la ON la.id = (
  SELECT id FROM live_signals x
  WHERE x.signal_type='injury_update' AND x.league=g.league AND x.created_at=g.a_created
    AND (x.player=g.a_player OR (x.player IS NULL AND g.a_player IS NULL)) LIMIT 1)
LEFT JOIN live_signals lb ON lb.id = g.b_id
WHERE julianday(g.b_created) >= julianday((SELECT deploy_cutoff FROM cfg))
  AND g.gap_hours > 0.001 AND g.gap_hours < 48
ORDER BY g.gap_hours ASC
LIMIT 10;

-- (8) COMPANION probe for the "near-miss string divergence" hypothesis, on the
--     population where it can occur (rows that DON'T pair in gaps because the
--     player string differs). Live, post-deploy, same league+team, gap < 48h, but
--     DIFFERENT non-null player strings.
--     CAVEAT — eyeball-only, NOT a bug count: two genuinely different players on
--     one team injured within 48h is normal, so nonzero is fine. Only pairs where
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
 AND (julianday(b.created_at) - julianday(a.created_at)) * 24.0 < 48.0
 AND julianday(b.created_at) >= julianday((SELECT deploy_cutoff FROM cfg))
ORDER BY gap_hours ASC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════════════
-- (9) Q2 — NEW-LEAK SURFACER: unrelated same-player injuries 24-48h apart that
--     the wider window now MERGES incorrectly. This is the accepted-but-unmeasured
--     tradeoff called out in processor.ts. It CANNOT be counted like a fork,
--     because a wrong merge collapses the two events into ONE surviving row and
--     upsertLiveSignal OVERWRITES injury_designation/body with the newer event
--     (store.ts:1149) — the earlier injury's content is gone from live_signals.
--     The only retained trail is raw_event_ids (all merged raw events accumulate
--     on the survivor). So this surfaces CANDIDATES for manual judgment; it is
--     NOT a bug count.
--
--     Heuristic: a live post-deploy injury_update row whose merge history spans
--     24-48h (first_seen_at/created_at to last update ~a day+ apart) AND that
--     absorbed >1 raw event. For each, pull the raw_events so you can read the
--     injury designations over time and decide: same injury story (correct merge)
--     vs two different injuries to the same player (a Q2 leak).
--
--     NOTE: run block (9b) after eyeballing (9) to dump the per-event designations
--     for a specific survivor id. Requires raw_events(id, payload_json/event_type,
--     received_at) — adjust column names to your schema if they differ.
SELECT s.id,
       s.league, s.team, s.player,
       s.injury_designation      AS latest_designation,
       s.source_count,
       json_array_length(s.raw_event_ids) AS n_raw_events,
       s.created_at, s.first_seen_at, s.updated_at,
       ROUND((julianday(s.updated_at) - julianday(COALESCE(s.first_seen_at, s.created_at))) * 24.0, 3)
                                  AS span_hours
FROM live_signals s
WHERE s.signal_type = 'injury_update'
  AND s.is_archived = 0
  AND s.player IS NOT NULL AND s.player <> ''
  AND json_array_length(s.raw_event_ids) > 1
  AND julianday(s.updated_at) >= julianday((SELECT deploy_cutoff FROM cfg))
  AND (julianday(s.updated_at) - julianday(COALESCE(s.first_seen_at, s.created_at))) * 24.0 BETWEEN 24.0 AND 48.0
ORDER BY span_hours DESC
LIMIT 25;

-- (9b) FORENSIC per-survivor: read the actual injury designations that merged into
--      one row, oldest first, to classify a (9) candidate as same-injury (correct)
--      vs different-injury (a real Q2 leak). Paste a survivor id from (9) below.
--      Column names are best-effort against raw_events; adjust if your schema names
--      differ (this block is a template, hence the placeholder id).
SELECT re.id, re.received_at, re.event_type,
       json_extract(re.payload, '$.injury_designation') AS designation,
       substr(COALESCE(json_extract(re.payload, '$.body'),
                       json_extract(re.payload, '$.headline'),
                       json_extract(re.payload, '$.description'), ''), 1, 80) AS text_head
FROM raw_events re
WHERE re.id IN (
  SELECT value FROM live_signals s, json_each(s.raw_event_ids)
  WHERE s.id = 'PASTE_SURVIVOR_ID_FROM_BLOCK_9'
)
ORDER BY re.received_at ASC;
