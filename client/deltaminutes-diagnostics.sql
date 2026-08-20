-- ═══════════════════════════════════════════════════════════════════════════
-- EdgeSetter deltaMinutes (lead-time advantage) diagnostics — August 19, 2026
-- READ-ONLY. Measures OUR detection speed vs wire/official confirmation.
-- Independent of the X API — official feeds (statsapi, league/team official,
-- RSS wires like "ESPN NFL", "AP Sports") count as confirmation on their own.
--
-- Run on Render shell:
--   sqlite3 /var/data/pipeline.db < deltaminutes-diagnostics.sql
-- Or paste sections individually into:
--   sqlite3 /var/data/pipeline.db
--
-- WHAT deltaMinutes IS, in code terms (server/pipeline/public-confirmation.ts):
--   T1 (our detection)   = situations.created_at
--                          (= received_at of the first event that opened the
--                           situation; server/pipeline/situations-engine.ts:104)
--   T2 (public confirm)  = situation_public_confirmations.confirmed_at
--                          (= confirmation source's published_at, else its
--                           received_at; public-confirmation.ts:97)
--   deltaMinutes         = situation_public_confirmations.detection_lead_minutes
--                          (ALREADY COMPUTED + PERSISTED as an INTEGER minute
--                           count — round((T2-T1)/60000), public-confirmation.ts:141)
--
-- So the real number needs NO reconstruction: it is a stored column. This file
-- reads it back, aggregated by league/signal_type. PART 0 first checks whether
-- the capture is actually running; PART 4 is the pre-capture historical
-- fallback only.
--
-- CAPTURE GATE — READ THIS FIRST:
--   maybeRecordPublicConfirmation() only runs inside processCanonicalSituation,
--   which is gated by  process.env.CANONICAL_SITUATIONS_ENABLED === "true"
--   (server/pipeline/processor.ts:590). If that env var is not "true" in
--   Render, the situations + situation_public_confirmations tables stay empty
--   and NO deltaMinutes is being captured. PART 0 tells you which world you are
--   in without needing shell access to the env.
-- ═══════════════════════════════════════════════════════════════════════════

.headers on
.mode column

-- ─── PART 0: CAPTURE HEALTH — is the canonical pipeline producing rows? ──────
-- If situations = 0 rows: CANONICAL_SITUATIONS_ENABLED is (or was) off. Nothing
--   to measure yet — flip the flag in Render, redeploy, then wait (see NOTES).
-- If situations > 0 but confirmations = 0: the pipeline runs, but no wire/
--   official source has yet confirmed one of OUR earlier detections (guards in
--   public-confirmation.ts reject: we-weren't-first, wire-broke-it, T2<=T1,
--   already-confirmed, unrecognized source). Longer window needed, or the
--   confirmation source list needs widening.

-- 0a. Do the canonical tables exist at all in this DB file?
SELECT name FROM sqlite_master
WHERE type='table'
  AND name IN ('situations','situation_public_confirmations','live_signals')
ORDER BY name;

-- 0b. Row counts + how long the capture has been live
SELECT 'situations'                    AS tbl, COUNT(*) AS rows,
       MIN(created_at)                  AS earliest, MAX(created_at) AS latest
FROM situations
UNION ALL
SELECT 'situation_public_confirmations', COUNT(*),
       MIN(created_at), MAX(created_at)
FROM situation_public_confirmations;

-- 0c. Confirmation freshness — most recent captures (are they still flowing?)
SELECT confirmed_at, detection_lead_minutes, source_name, confirmation_reason
FROM situation_public_confirmations
ORDER BY created_at DESC
LIMIT 15;


-- ─── PART 1: CANONICAL deltaMinutes — THE REAL NUMBER (all time) ─────────────
-- Direct read-back of the stored per-signal lead. detection_lead_minutes is
-- already >0 for every row (T2<=T1 rows are rejected at insert), so no filter
-- or julianday math is needed.

-- 1a. By league × signal_type (situation_type)
SELECT s.league,
       s.situation_type                              AS signal_type,
       COUNT(*)                                      AS n_confirmed,
       ROUND(AVG(c.detection_lead_minutes), 1)       AS avg_lead_min,
       MIN(c.detection_lead_minutes)                 AS min_lead_min,
       MAX(c.detection_lead_minutes)                 AS max_lead_min,
       -- lead-time distributions skew hard; report where the mass sits, not
       -- just the (outlier-inflated) mean:
       SUM(c.detection_lead_minutes <  5)            AS n_under_5m,
       SUM(c.detection_lead_minutes BETWEEN 5 AND 29)  AS n_5_to_29m,
       SUM(c.detection_lead_minutes BETWEEN 30 AND 119) AS n_30_to_119m,
       SUM(c.detection_lead_minutes >= 120)          AS n_2h_plus
FROM situation_public_confirmations c
JOIN situations s ON s.situation_id = c.situation_id
GROUP BY s.league, s.situation_type
ORDER BY n_confirmed DESC;

-- 1b. By league only (rolled up)
SELECT s.league,
       COUNT(*)                                AS n_confirmed,
       ROUND(AVG(c.detection_lead_minutes), 1) AS avg_lead_min,
       MIN(c.detection_lead_minutes)           AS min_lead_min,
       MAX(c.detection_lead_minutes)           AS max_lead_min
FROM situation_public_confirmations c
JOIN situations s ON s.situation_id = c.situation_id
GROUP BY s.league
ORDER BY n_confirmed DESC;

-- 1c. Median lead per league (SQLite 3.25+ window functions).
-- The mean is skewed by long tails; this is the honest headline number.
WITH ranked AS (
  SELECT s.league,
         c.detection_lead_minutes AS lead,
         ROW_NUMBER() OVER (PARTITION BY s.league ORDER BY c.detection_lead_minutes) AS rn,
         COUNT(*)    OVER (PARTITION BY s.league) AS cnt
  FROM situation_public_confirmations c
  JOIN situations s ON s.situation_id = c.situation_id
)
SELECT league,
       cnt                       AS n_confirmed,
       ROUND(AVG(lead), 1)       AS median_lead_min
FROM ranked
WHERE rn IN ((cnt + 1) / 2, (cnt + 2) / 2)   -- middle 1 (odd) or 2 (even) rows
GROUP BY league, cnt
ORDER BY n_confirmed DESC;

-- 1d. Split by HOW it was confirmed (official feed vs tier-1 wire).
-- "official" rows are fully X-independent; "tier1_wire" rows depend on whether
-- that wire reporter is ingested (X or RSS). Lets you read the X-free number.
SELECT c.confirmation_reason,
       COUNT(*)                                AS n,
       ROUND(AVG(c.detection_lead_minutes), 1) AS avg_lead_min
FROM situation_public_confirmations c
GROUP BY c.confirmation_reason
ORDER BY n DESC;


-- ─── PART 2: RECENT WINDOW (last 30 days) — current-pipeline number ──────────
-- The all-time number blends old and new behavior; this is what the pipeline is
-- doing NOW. If this returns nothing but PART 1 has rows, capture has stalled.
SELECT s.league,
       s.situation_type                        AS signal_type,
       COUNT(*)                                AS n_confirmed,
       ROUND(AVG(c.detection_lead_minutes), 1) AS avg_lead_min,
       MIN(c.detection_lead_minutes)           AS min_lead_min,
       MAX(c.detection_lead_minutes)           AS max_lead_min
FROM situation_public_confirmations c
JOIN situations s ON s.situation_id = c.situation_id
WHERE datetime(c.created_at) > datetime('now', '-30 days')
GROUP BY s.league, s.situation_type
ORDER BY n_confirmed DESC;


-- ─── PART 3: RAW SAMPLE — eyeball the actual pairs for sanity ────────────────
-- Confirm source_name looks like a real wire/official source and that
-- confirmed_at post-dates detection by a believable margin.
SELECT s.league,
       s.situation_type                        AS signal_type,
       s.created_at                            AS detected_at_T1,
       c.confirmed_at                          AS confirmed_at_T2,
       c.detection_lead_minutes                AS delta_min,
       c.confirmation_reason,
       substr(c.source_name, 1, 40)            AS source_name
FROM situation_public_confirmations c
JOIN situations s ON s.situation_id = c.situation_id
ORDER BY c.created_at DESC
LIMIT 40;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4: HISTORICAL FALLBACK — reconstruction from live_signals
-- ═══════════════════════════════════════════════════════════════════════════
-- USE ONLY IF PART 1 IS EMPTY (capture wasn't live for the period you care
-- about). This is the pre-capture, APPROXIMATE method carried over from
-- edgesetter-diagnostics.sql PART B. It does NOT measure the same thing as the
-- canonical column — read the warnings before quoting any number from it.
--
-- APPROXIMATION:
--   detected_at   = live_signals.first_seen_at (fallback created_at)
--   t2_at         = live_signals.signal_time    (fallback updated_at)
--                   ONLY for rows whose merged sources JSON contains a
--                   wire/official-tier source
--   delta_min     = (t2 - detected) in minutes, where t2 > detected
--
-- VALIDITY WARNINGS:
--   1. Measures OUR-ingestion-of-detection vs OUR-ingestion-of-the-wire-pickup,
--      NOT the wire's publication time. The 5-min poll interval quantizes
--      everything; results under ~10 min are noise-dominated.
--   2. After an upsert, signal_time = the LATEST merged event's time, so deltas
--      inflate whenever a non-wire event merged in after the wire one.
--   3. X/Twitter ingestion had outages; tier-1 journalist confirmations are
--      missing for those windows. Prefer official-tier matches here.

-- 4a. Reconstructed delta distribution, by league and signal_type
WITH wire_flagged AS (
  SELECT ls.id, ls.league, ls.signal_type,
         COALESCE(ls.first_seen_at, ls.created_at) AS detected_at,
         COALESCE(ls.signal_time, ls.updated_at)   AS t2_at,
         EXISTS (
           SELECT 1 FROM json_each(ls.sources) je
           WHERE lower(json_extract(je.value,'$.type'))
                   IN ('official','official_source','team_official','league_official','wire_service')
              OR lower(json_extract(je.value,'$.name')) LIKE '%associated press%'
              OR lower(json_extract(je.value,'$.name')) LIKE '%ap %'
              OR lower(json_extract(je.value,'$.name')) LIKE '%espn%'
              OR lower(json_extract(je.value,'$.name')) LIKE '%schefter%'
              OR lower(json_extract(je.value,'$.name')) LIKE '%rapoport%'
              OR lower(json_extract(je.value,'$.name')) LIKE '%statsapi%'
         ) AS has_wire
  FROM live_signals ls
)
SELECT league, signal_type,
       COUNT(*)                                                    AS n_with_wire_confirm,
       ROUND(AVG((julianday(t2_at)-julianday(detected_at))*1440),1) AS avg_delta_min,
       ROUND(MIN((julianday(t2_at)-julianday(detected_at))*1440),1) AS min_delta_min,
       ROUND(MAX((julianday(t2_at)-julianday(detected_at))*1440),1) AS max_delta_min,
       SUM(((julianday(t2_at)-julianday(detected_at))*1440) >= 10)  AS n_delta_ge_10min
FROM wire_flagged
WHERE has_wire = 1
  AND julianday(t2_at) > julianday(detected_at)
GROUP BY league, signal_type
ORDER BY n_with_wire_confirm DESC;

-- 4b. Denominator honesty: share of signals with ANY wire confirmation
WITH wire_flagged AS (
  SELECT ls.id,
         EXISTS (
           SELECT 1 FROM json_each(ls.sources) je
           WHERE lower(json_extract(je.value,'$.type'))
                   IN ('official','official_source','team_official','league_official','wire_service')
         ) AS has_wire
  FROM live_signals ls
)
SELECT SUM(has_wire=1) AS with_wire, SUM(has_wire=0) AS without_wire,
       ROUND(100.0*SUM(has_wire=1)/COUNT(*),1) AS pct_with_wire
FROM wire_flagged;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTES / NEXT STEP
--   * PART 1 non-empty  -> you have the real number now. Quote 1c (median) as
--     the headline; 1a for the per-market breakdown; 1d to separate the fully
--     X-independent ("official") lead from wire-dependent lead.
--   * PART 1 empty, PART 0b situations=0 -> capture is OFF. Smallest change to
--     start getting real numbers: set  CANONICAL_SITUATIONS_ENABLED=true  in
--     the Render service env and redeploy. No code change is required — the
--     recorder already exists and is wired into the processor
--     (processor.ts:629). Then re-run this file after a capture-and-wait period
--     (a few days of live traffic across a game slate) so confirmations accrue.
--   * PART 1 empty, PART 0b situations>0 but confirmations=0 -> pipeline runs
--     but nothing has confirmed our earlier detections yet. Widen the window,
--     or inspect [pubconf:diag] logs to see which guard is rejecting.
-- ═══════════════════════════════════════════════════════════════════════════
