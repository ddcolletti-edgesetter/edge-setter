-- ═══════════════════════════════════════════════════════════════════════════
-- Extract everything needed to replay scoreCandidate() on a failed-to-merge pair
-- Run on Render:  sqlite3 /var/data/pipeline.db < client/score-pair-extract.sql
-- Default pair = tyler warren (0.0h apart). Swap the two ids in :A / :B below.
-- Column names verified against situations-store.ts CREATE TABLE (schema @ #20).
-- ═══════════════════════════════════════════════════════════════════════════
.mode list
.headers off

-- ── (1) CANDIDATE SIDE: the situation ROW identity fields scoreCandidate reads.
--     Paste each JSON line into the harness as CANDIDATE_A / CANDIDATE_B.
--     latest_snapshot_at feeds timing_proximity's candidate timestamp.
SELECT json_object(
  'situation_id', s.situation_id,
  'league', s.league, 'sport', s.sport, 'situation_type', s.situation_type,
  'game_id', s.game_id,
  'players', json(s.players_json),
  'teams', json(s.teams_json),
  'semantic_fingerprint', s.semantic_fingerprint,
  'created_at', s.created_at,
  'latest_snapshot_at',
    (SELECT MAX(created_at) FROM situation_snapshots ss WHERE ss.situation_id=s.situation_id)
)
FROM situations s
WHERE s.situation_id IN ('sit_6f45197c4d8c7a12f0080ef8','sit_9488338b8602d28d5c1f7343');

-- ── (2) INCOMING SIDE: the founding normalized_event for each (full
--     NormalizedEvent). This is what actually flows into matchSituation as the
--     incoming arg. Paste as INCOMING_A / INCOMING_B.
SELECT s.situation_id || '  =>  ' || json_extract(e.payload_json,'$.normalized_event')
FROM situations s
JOIN situation_events e USING (situation_id)
WHERE s.situation_id IN ('sit_6f45197c4d8c7a12f0080ef8','sit_9488338b8602d28d5c1f7343')
  AND e.kind='situation_created';

-- ── (3) isUsableSituation GATE (situations-store.ts:452-459): a candidate is
--     DROPPED before scoring if it has no snapshot, or confidence<15 & evidence<=1.
--     If either row prints usable=0, the match was impossible regardless of 0.62.
SELECT s.situation_id,
       ss.snapshot_id,
       ss.confidence_score,
       json_array_length(ss.evidence_event_ids_json) AS evidence_count,
       CASE WHEN ss.snapshot_id IS NULL THEN 0
            WHEN ss.confidence_score < 15
             AND json_array_length(ss.evidence_event_ids_json) <= 1 THEN 0
            ELSE 1 END AS usable,
       substr(ss.summary,1,60) AS summary_head
FROM situations s
LEFT JOIN situation_snapshots ss ON ss.situation_id = s.situation_id
WHERE s.situation_id IN ('sit_6f45197c4d8c7a12f0080ef8','sit_9488338b8602d28d5c1f7343')
  AND ss.created_at = (SELECT MAX(created_at) FROM situation_snapshots x WHERE x.situation_id=s.situation_id);

-- ── (4) ORDERING PROBE: at 0.0h apart, was A committed BEFORE B was processed?
--     If created_at are identical / B precedes A, A wasn't a visible candidate
--     when B ran -> match impossible (a race, not a threshold problem).
SELECT situation_id, created_at
FROM situations
WHERE situation_id IN ('sit_6f45197c4d8c7a12f0080ef8','sit_9488338b8602d28d5c1f7343')
ORDER BY created_at ASC, situation_id ASC;

-- ── (5) Did either row already merge anything? (event kind census)
SELECT s.situation_id, e.kind, COUNT(*) AS n
FROM situations s JOIN situation_events e USING (situation_id)
WHERE s.situation_id IN ('sit_6f45197c4d8c7a12f0080ef8','sit_9488338b8602d28d5c1f7343')
GROUP BY s.situation_id, e.kind
ORDER BY s.situation_id, e.kind;
