# The latest-snapshot read on `/api/v2/situations` — report, October 2026

**Report only. No index is shipped by this PR and no code is changed by this
document.** The brief's condition for shipping an index — a measured before/after
on a fixture whose `situation_snapshots`, history-table and `situation_events`
row counts match prod — is met below for the candidates evaluated, and the
conclusion is that **no index is the right fix**. The fix that measures well is a
query rewrite, which is a separate change with its own equivalence surface.

Prompted by the #81 deploy (2026-10-07 03:20 UTC), where the slow-statement log
named a correlated subquery over `situation_snapshots` at **5.4s**, a situation
list join at **2.6s**, and `IN (…)` reads of `situation_state_history` (1.7s) and
`situation_confidence_history` (1.7s / 0.7s).

---

## 1. The statement

Two functions in `server/pipeline/situations-store.ts` contain the same
correlated subquery. The one in the request path is `listCanonicalSituations`
(`situations-store.ts:687`); `listSituationsForMatching`
(`situations-store.ts:439`) is the ingestion-side twin and carries an identical
join without the `games` filter.

```sql
SELECT
  s.*,
  latest.snapshot_id,
  latest.lifecycle_state,
  latest.confidence_score,
  latest.confidence_json,
  latest.summary,
  latest.escalation_score,
  latest.timing_pressure,
  latest.evidence_event_ids_json,
  latest.replay_hash AS snapshot_replay_hash,
  latest.previous_snapshot_hash,
  latest.created_at AS snapshot_created_at,
  r.resolved_game_id
FROM situations s
LEFT JOIN situation_snapshots latest
  ON latest.snapshot_id = (
    SELECT ss.snapshot_id
    FROM situation_snapshots ss
    WHERE ss.situation_id = s.situation_id
    ORDER BY ss.created_at DESC, ss.snapshot_id ASC
    LIMIT 1
  )
LEFT JOIN situation_game_resolution r ON r.situation_id = s.situation_id
LEFT JOIN games g ON g.id = COALESCE(s.game_id, r.resolved_game_id)
WHERE s.league = ?
  AND (COALESCE(s.game_id, r.resolved_game_id) IS NULL OR g.game_time > datetime('now'))
ORDER BY COALESCE(latest.escalation_score, 0) DESC,
         COALESCE(latest.created_at, s.created_at) DESC,
         s.situation_id ASC
LIMIT ?
```

### It runs twice per cold request, with two different shapes

`listCanonicalSituationApiResponses` (`situations-api.ts:205`) maps the client's
`orderBy=operational_visibility_score` to `order_by: "escalation_score"` and a
candidate pool of `max(limit, 100)` — the `ORDER BY` above. It then calls
`buildComparableSituationCorpus()`, which issues a **second**
`listCanonicalSituations({ limit: 500 })` with the *default* `created_at`
ordering. Both are the statement above; only `WHERE` and `ORDER BY` differ.

| Caller | Shape | Default ordering? |
|---|---|---|
| `listCanonicalSituationApiResponses` (the four boards) | `league=?`, `limit=100` | no — `escalation_score` |
| `listCanonicalSituationApiResponses` (homepage) | no league, `limit=15` → pool 100 | no — `escalation_score` |
| `buildComparableSituationCorpus()` | no league, `limit=500` | **yes** — `created_at` |
| `/api/v2/situations/:id` | no league, `limit=500` | **yes** — `created_at` |

---

## 2. The plan

```
SEARCH s USING INDEX idx_situations_league_type (league=?)
SEARCH latest USING INDEX sqlite_autoindex_situation_snapshots_1 (snapshot_id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 1
  SEARCH ss USING COVERING INDEX idx_situation_snapshots_situation (situation_id=?)
SEARCH r USING INDEX sqlite_autoindex_situation_game_resolution_1 (situation_id=?) LEFT-JOIN
SEARCH g USING INDEX sqlite_autoindex_games_1 (id=?) LEFT-JOIN
USE TEMP B-TREE FOR ORDER BY
```

With no league (`limit=500`) the first line becomes `SCAN s`; everything else is
identical.

**Read the third and fourth lines together.** `CORRELATED SCALAR SUBQUERY 1`
resolves through `SEARCH ss USING **COVERING** INDEX
idx_situation_snapshots_situation (situation_id=?)`. The existing index is

```sql
CREATE INDEX idx_situation_snapshots_situation
  ON situation_snapshots(situation_id, created_at DESC, snapshot_id ASC);
```

`situation_snapshots` has a `TEXT PRIMARY KEY`, so it is a rowid table with a
separate unique index on `snapshot_id`; the index above therefore carries
`(situation_id, created_at, snapshot_id, rowid)`. The subquery's `WHERE`, its
`ORDER BY` and its one selected column are all in that index.

So the answer to the brief's question — *what index would let it read only the
latest snapshot per situation* — is: **the existing one already does.** The
subquery descends one B-tree, reads one entry, and stops. It never touches a
second snapshot, and it never touches the table.

### Where the time actually goes

Measured on the prod-shaped fixture (section 4), 7,100 situations:

| | ms |
|---|---:|
| the correlated subquery, 7,100 times, nothing else | **85.9** |
| the same, plus fetching the snapshot row it names | **1,242.8** |

**93.1% of the cost is materialising the snapshot row, not finding it.** Line 2
of the plan is the expensive one: `sqlite_autoindex_situation_snapshots_1` is a
second B-tree descent to a rowid, then a row fetch — and the row is fat.
`confidence_json`, `summary` and `evidence_event_ids_json` push these rows onto
overflow pages, so each fetch is several random reads of a 5GB file.

This is the same shape as the track-record finding in #80: the scan was not the
cost, the fat-row primary-key probe was.

### And it does that for every candidate, not for `LIMIT` of them

`ORDER BY` depends on `latest.*`, so the `TEMP B-TREE FOR ORDER BY` cannot start
until every candidate row has been built. Measured candidate counts on the
fixture:

| Shape | Candidates admitted by `WHERE` | Fat snapshot rows fetched | Rows returned |
|---|---:|---:|---:|
| `league=NFL`, `limit=100` | 1,438 | **1,438** | 100 |
| no league, `limit=500` | 3,604 | **3,604** | 500 |
| no league, `limit=15` (pool 100) | 3,604 | **3,604** | 15 |

---

## 3. Candidates evaluated

### 3a. A wider covering index — measured, does not help on its own

```sql
CREATE INDEX idx_situation_snapshots_latest_wide
  ON situation_snapshots(situation_id, created_at DESC, snapshot_id ASC,
                         escalation_score, confidence_score, lifecycle_state);
```

Build cost on the fixture: **13.3s**, and the file did not shrink or grow
measurably at 3 decimal places (2.360GiB either way).

With it present, the plan for today's statement is **byte-for-byte unchanged** —
the planner does not pick it, because the subquery it would serve is already
covered by the narrower index. Timings (best of 7, arms interleaved, the `today`
arm repeated after as a noise floor):

| | today | with wide index | noise floor |
|---|---:|---:|---:|
| `league=NFL&limit=100`, escalation order | 55.9ms | 59.7ms | 2.4–3.5ms |

No index helps, and that is not a tuning accident: an index cannot make a fat row
cheaper to fetch, and fetching fat rows is 93% of the cost.

### 3b. A denormalised `situations.latest_snapshot_id` — measured, marginal

Simulated with a side table carrying one row per situation, which removes the
correlated subquery entirely:

```
SEARCH sl USING INDEX sqlite_autoindex_sit_latest_1 (situation_id=?) LEFT-JOIN
SEARCH latest USING INDEX sqlite_autoindex_situation_snapshots_1 (snapshot_id=?) LEFT-JOIN
```

| Shape | correlated subquery | denormalised pointer |
|---|---:|---:|
| `league=NFL&limit=100` | 9.6ms | 8.6ms |
| no league, `limit=500` | 54.8ms | 50.9ms |

It removes one of three B-tree descents and leaves the fat fetch, so it buys
~7%. For that it would want a new column, a backfill over 7,100 situations, and a
write-path invariant that the pointer always matches what the ordering would
pick. Not worth it as a standalone change.

### 3c. Two-stage: order and LIMIT against the covering index, then fetch — measured, this is the one

Pick the survivors using only columns the covering index carries, then fetch fat
snapshot rows for `LIMIT` of them instead of for every candidate:

```sql
WITH picked AS (
  SELECT s.situation_id AS sid,
         (SELECT ss.snapshot_id FROM situation_snapshots ss
          WHERE ss.situation_id = s.situation_id
          ORDER BY ss.created_at DESC, ss.snapshot_id ASC LIMIT 1) AS snap,
         (SELECT ss.created_at  FROM situation_snapshots ss
          WHERE ss.situation_id = s.situation_id
          ORDER BY ss.created_at DESC, ss.snapshot_id ASC LIMIT 1) AS snap_at
  FROM situations s
  LEFT JOIN situation_game_resolution r ON r.situation_id = s.situation_id
  LEFT JOIN games g ON g.id = COALESCE(s.game_id, r.resolved_game_id)
  WHERE …
  ORDER BY COALESCE(snap_at, s.created_at) DESC, s.situation_id ASC
  LIMIT ?
)
SELECT s.*, latest.…, r.resolved_game_id
FROM picked p
JOIN situations s ON s.situation_id = p.sid
LEFT JOIN situation_snapshots latest ON latest.snapshot_id = p.snap
LEFT JOIN situation_game_resolution r ON r.situation_id = s.situation_id
ORDER BY COALESCE(latest.created_at, s.created_at) DESC, s.situation_id ASC
```

**Default (`created_at`) ordering — no index change needed.** Best of 7,
interleaved, `today` repeated after as the noise floor:

| Shape | today | two-stage | today again | fat rows fetched |
|---|---:|---:|---:|---|
| `league=NFL&limit=100` | 51.4ms | **17.6ms** | 47.3ms (floor 4.1ms) | 1,438 → 100 (14.4×) |
| no league, `limit=500` | 147.4ms | **63.8ms** | 153.9ms (floor 6.5ms) | 3,604 → 500 (7.2×) |
| no league, `limit=15` | 129.3ms | **46.5ms** | 128.2ms (floor 1.2ms) | 3,604 → 15 (240×) |

SQLite's own page cache emptied (a fresh connection per measurement, arms
alternating which goes first; the OS cache stays warm, so this is a **lower
bound** on the cold gap, not a cold-disk number):

| Shape | today best / median | two-stage best / median |
|---|---:|---:|
| `league=NFL&limit=100` | 63.4 / 76.2ms | **34.5 / 37.3ms** |
| no league, `limit=500` | 160.2 / 183.6ms | **80.0 / 93.6ms** |

**`escalation_score` ordering — needs the wide index to be worth much.** Stage 1
must read `escalation_score`, which the existing index does not carry, so the
plan degrades from `SEARCH … USING COVERING INDEX` to `SEARCH … USING INDEX` and
fetches the row anyway:

| `league=NFL&limit=100`, escalation order | today | two-stage | today again |
|---|---:|---:|---:|
| existing indexes | 55.9ms | 43.1ms | 52.4ms |
| with `idx_situation_snapshots_latest_wide` | 59.7ms | **36.8ms** | 54.4ms |

So the wide index is worthless alone (3a) and worth ~15% **in combination with**
the rewrite. The two must be evaluated together or not at all.

**Equivalence.** For all three shapes the two forms return the same number of
rows, the same column set, the same order, and cell-for-cell identical values —
asserted by comparing every key of every row, including `snapshot_id`.

---

## 4. The fixture these numbers come from

Built to the row counts in the #81 boot report:

| Table | prod (boot report) | fixture |
|---|---:|---:|
| `situations` | ~7,100 | 7,100 |
| `situation_snapshots` | ~343,000 | 340,800 |
| `situation_events` | ~686,000 | 688,700 |
| `situation_state_history` | ~343,000 | 340,800 |
| `situation_confidence_history` | ~343,000 | 340,800 |
| `games` | — | 8,000 |

**Where it differs from prod, and it matters.** The fixture is **2.36GiB in
612,958 pages with no freelist**. Prod is **5.02GiB in 1,316,531 pages with
467,430 free (35.5%)**, i.e. ~3.24GiB of live data. So prod's rows average
roughly 1.4× the fixture's, and prod's live pages are scattered through a file
1.6× bigger — both of which make random fat-row fetches worse there than here.

`sqlite_stat1` does not exist on either (nothing in this repo runs `ANALYZE`), so
**the plans above are prod's plans** regardless of row count. The timings are
not: they are warm, in-process, single-machine numbers, reported so that the two
arms of each comparison are comparable **to each other**. The first touch of the
`league=NFL&limit=100` statement after the fixture was written took **1,254ms**
against 11–56ms warm — a ~100× cold multiplier on a laptop SSD, which is the gap
between these numbers and prod's 5.4s.

---

## 5. Plan-regression sweep for the wide index

Every statement in the repo touching `situation_snapshots`, planned with
`idx_situation_snapshots_latest_wide` present:

| Statement | Plan change |
|---|---|
| `listCanonicalSituations` (request path) | none |
| `listSituationsForMatching` (ingestion) | none |
| `getLatestSituationSnapshot` | none |
| `listSituationSnapshots` | none |
| `situationsDataSignature` (`MAX(rowid)`) | none |
| snapshot insert's `replay_hash` probe | none (`idx_situation_snapshots_replay`) |
| **`getCleanFoundingSituationConfidences`** | **FLIPPED** — `idx_situation_snapshots_situation` → `idx_situation_snapshots_latest_wide` |

The flip stays a `COVERING INDEX` search on the same leading column, so it should
be neutral or marginally worse (a wider index means fewer entries per page). It
is **not timed here**, and #78/#79/#80 produced three separate planner flips that
each read as neutral and were not — `idx_live_signals_injury_dedup` is still
costing settlement accuracy 77ms on main today. Any PR shipping this index owes
this statement a timing, not an argument.

---

## 6. The other slow statements from the same log

The `IN (…)` history reads named at 1.7s / 1.7s / 0.7s are already optimally
planned — the batched readers from #80 hit the `(situation_id, created_at,
history_id)` indexes with no temp b-tree:

```
SEARCH situation_state_history      USING INDEX idx_situation_state_history_situation (situation_id=?)
SEARCH situation_confidence_history USING INDEX idx_situation_confidence_history_situation (situation_id=?)
SEARCH situation_events             USING INDEX idx_situation_events_situation (situation_id=?)
```

Measured on the fixture for a 100-id batch: state_history 178ms / 4,800 rows,
confidence_history 290ms / 4,800 rows, situation_events 316ms / 9,700 rows. These
are **volume**, not plans: ~48 history rows and ~97 event rows per situation,
every column selected (`SELECT *`), 100 situations at a time. The request path
needs the newest 5 of each for the previews. Cutting them is a retention
question, not an index question — see
[`docs/situations-retention-options.md`](./situations-retention-options.md).

---

## 7. Recommendation

1. **Do not add an index.** `idx_situation_snapshots_situation` already reads
   exactly one snapshot per situation, covering. 3a measured no change in plan
   and no change in time.
2. **The change worth making is the two-stage rewrite**, for the two
   default-ordered callers first: `buildComparableSituationCorpus()` and
   `/api/v2/situations/:id`. 2.3–2.8× warm, ~2× with SQLite's cache cold, no
   schema change, equivalence verified cell-for-cell.
3. **The escalation-ordered board shape is a second, bigger PR**, because it
   needs `idx_situation_snapshots_latest_wide` to pay (36.8ms vs 55.9ms) and that
   index flips `getCleanFoundingSituationConfidences`. Index and rewrite must be
   measured together.
4. **Before any of it ships**, a cold-disk number. Everything here is warm, and
   the one cold-ish observation on this fixture was 100× the warm figure. A
   change that is 2.8× warm could be 2.8× or 20× cold, and only prod knows. The
   in-flight statement logging added by this PR is what will say.
5. Two cheap wins visible in passing, not measured:
   - the two-stage form above runs the latest-snapshot subquery **twice**
     (`snap` and `snap_at`); one subquery returning both would be strictly
     better. The numbers in 3c are *with* the duplication.
   - the fat columns are selected unconditionally. `confidence_json`, `summary`
     and `evidence_event_ids_json` are the overflow-page columns; if the corpus
     build does not need all three, not selecting them is free.
