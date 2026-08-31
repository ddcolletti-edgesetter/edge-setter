-- item4-gap-analysis.sql  (corrected 2026-08-31)
-- Purpose: re-run injury same-source/same-entity founding-gap analysis on CLEAN data
--          (post matcher-dead fix, PR #34/#35) to confirm the 24h injury dedup window (PR #36).
--
-- Run against PROD:  sqlite3 /var/data/pipeline.db < item4-gap-analysis.sql
-- (or paste each report block interactively in Render Shell)
--
-- Schema facts verified from server/pipeline/situations-store.ts + situations-contract.ts:
--   * situations: NO entity_key / team / player columns. Entity identity lives in
--     teams_json + players_json (TEXT, stable-serialized via stableJson()) -> equality-joinable.
--   * founding event kind literal = 'situation_created'
--   * injury SituationType = 'injury'   (NB: 'injury_update' is a live_signals SignalType, NOT a situation_type)
--   * same-source key = situation_events.source_id
--   * gap timestamp = founding event recorded_at
--
-- REQUIRED GUARD (cartesian-explosion fix): dedupe situation_events to ONE canonical
-- 'situation_created' row per situation_id before joining. A situation can have multiple
-- duplicate founding events; joining without this produced 225 garbage rows for 1 real pair
-- in a prior session.

.headers on
.mode column

WITH founding AS (
  -- exactly one canonical founding row per situation
  SELECT situation_id, recorded_at, source_id, event_id
  FROM (
    SELECT
      situation_id, recorded_at, source_id, event_id,
      ROW_NUMBER() OVER (
        PARTITION BY situation_id
        ORDER BY recorded_at ASC, event_id ASC
      ) AS rn
    FROM situation_events
    WHERE kind = 'situation_created'
  )
  WHERE rn = 1
),
sit AS (
  -- one row per injury situation, carrying founding metadata + entity identity
  SELECT
    s.situation_id,
    s.league,
    s.situation_type,
    s.teams_json,
    s.players_json,
    f.source_id  AS source_id,
    f.recorded_at AS founded_at
  FROM situations s
  JOIN founding f ON f.situation_id = s.situation_id
  WHERE s.situation_type = 'injury'
),
pairs AS (
  -- distinct, unordered pairs of injury situations: same league, same entity, same source
  SELECT
    a.situation_id AS sit_a,
    b.situation_id AS sit_b,
    a.league        AS league,
    a.source_id     AS source_id,
    a.players_json  AS players_json,
    a.teams_json    AS teams_json,
    a.founded_at    AS founded_a,
    b.founded_at    AS founded_b,
    ABS(julianday(b.founded_at) - julianday(a.founded_at)) * 24.0 AS gap_hours
  FROM sit a
  JOIN sit b
    ON  a.league        = b.league
    AND a.situation_type = b.situation_type
    AND a.teams_json    = b.teams_json
    AND a.players_json  = b.players_json
    AND a.source_id     = b.source_id          -- same-source (NULL source_id never matches: intended)
    AND a.situation_id  < b.situation_id        -- distinct + unordered, no self-pair, no mirror dup
),
close_pairs AS (
  -- population ceiling = 48h, matching the original analysis buckets (<24h, 24-48h)
  SELECT * FROM pairs WHERE gap_hours <= 48.0
)

-- ============================================================
-- REPORT 1: full pair list (SANITY-CHECK THESE ROWS BY HAND)
-- ============================================================
SELECT sit_a, sit_b, league, source_id, players_json,
       founded_a, founded_b, ROUND(gap_hours, 2) AS gap_hours
FROM close_pairs
ORDER BY gap_hours ASC;

-- ============================================================
-- REPORT 2: n, min/max/avg (+ median) gap
-- ============================================================
SELECT
  COUNT(*)              AS n_pairs,
  ROUND(MIN(gap_hours),2) AS min_h,
  ROUND(MAX(gap_hours),2) AS max_h,
  ROUND(AVG(gap_hours),2) AS avg_h,
  ROUND((
    -- median (SQLite has no native percentile): avg of middle 1-2 ordered rows
    SELECT AVG(gap_hours) FROM (
      SELECT gap_hours,
             ROW_NUMBER() OVER (ORDER BY gap_hours) AS rn,
             COUNT(*)    OVER ()                    AS cnt
      FROM close_pairs
    ) WHERE rn IN ((cnt+1)/2, (cnt+2)/2)
  ),2) AS median_h
FROM close_pairs;

-- ============================================================
-- REPORT 3: bucket split (zero-gap is a subset of <24h)
-- ============================================================
SELECT
  SUM(CASE WHEN gap_hours = 0                       THEN 1 ELSE 0 END) AS zero_gap,
  SUM(CASE WHEN gap_hours <  24.0                   THEN 1 ELSE 0 END) AS under_24h,
  SUM(CASE WHEN gap_hours >= 24.0 AND gap_hours <= 48.0 THEN 1 ELSE 0 END) AS h24_to_48
FROM close_pairs;

-- ============================================================
-- REPORT 4: the zero-gap pairs (possible duplicate-ingestion bug)
-- ============================================================
SELECT sit_a, sit_b, league, source_id, players_json, founded_a, founded_b
FROM close_pairs
WHERE gap_hours = 0
ORDER BY league, players_json;
