# The statement that killed two warm-up builds — report, October 2026

**Report only. No code change ships with this document, no index was created
outside a throwaway fixture, and nothing was run against prod.** The settlement
fix and the warm-up timeout are separate commits; this is the measurement for
the third thing the Oct 8 boot named.

From the prod log of 2026-10-08 05:20 UTC, the first boot carrying #82's
in-flight statement reporting:

```
SELECT league, situation_type, confidence_score FROM ( SELECT s.league AS league,
s.situation_type AS situation_type, ( SELECT ss.confidence_score FROM
situation_snapshots ss WHERE ss.situation_id = s...
```

in flight at over 25s and over 29s when two warm-up builds were terminated at
`SITUATIONS_BUILD_TIMEOUT_MS`. The third build of the same run took 3.9s; the
#81 boot's equivalent took 5.4s.

**Headline: the diagnosis in the brief is right about the index and wrong about
the cost.** `idx_situation_snapshots_situation` does not carry
`confidence_score`, exactly as suspected — and that term is **146ms of a
15,279ms statement**. The cost is the other correlated subquery, a `COUNT` over
`situation_events` filtered on a column no index carries: **15,186ms, 97%**. A
0.12 MiB partial index on `situation_events` takes the statement from 15,279ms
to 197ms. The snapshot covering index the brief proposes is worth nothing on
this statement, and the variant it specifies is not even chosen by the planner.

## Fixture and method

`scratchpad/prod-shape-fixture.ts`, rebuilt for this report (the copy behind
`docs/situations-latest-snapshot-read.md` had been cleaned up):

| | fixture | prod |
|---|---:|---:|
| `situations` | 7,100 | ~7,100 |
| `situation_snapshots` | 340,800 | ~343,000 |
| `situation_events` | 688,700 | ~686,000 |
| `situation_founding_audit` | 547 (seeded for this report) | unknown |
| file | 2.34 GiB | 5.02 GiB (35.5% freelist) |

`sqlite_stat1` does not exist (nothing in this repo runs `ANALYZE`), so **the
plans are prod's plans**. Timings are warm best-of-two or -three on a laptop
NVMe; prod is a cold network disk, and the one cold-ish number taken on this
fixture family was ~100x its warm figure. Where an arm looked like a regression
I re-measured it interleaved rather than sequentially, because a 15s index build
churns the page cache and a sequential before/after reads that churn as a result.

---

## 1. The statement, its callers, and whether it can be shared

### The SQL

`getCleanFoundingSituationConfidences`, `server/pipeline/situations-store.ts:605`:

```sql
SELECT league, situation_type, confidence_score FROM (
  SELECT
    s.league AS league,
    s.situation_type AS situation_type,
    (
      SELECT ss.confidence_score
      FROM situation_snapshots ss
      WHERE ss.situation_id = s.situation_id
      ORDER BY ss.created_at DESC, ss.snapshot_id ASC
      LIMIT 1
    ) AS confidence_score
  FROM situations s
  WHERE (
    SELECT COUNT(*)
    FROM situation_events se
    WHERE se.situation_id = s.situation_id
      AND se.kind = 'situation_created'
  ) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM situation_founding_audit a
    WHERE a.situation_id = s.situation_id
      AND a.founding_row_count > 1
  )
)
WHERE confidence_score IS NOT NULL
```

It takes **no parameters**. Three correlated subqueries, one per situation, over
every row of `situations`.

### Who calls it

```
getCleanFoundingSituationConfidences   situations-store.ts:605
  └─ buildConfidenceBaselines          situations-confidence-guard.ts:64
       └─ cachedConfidenceBaselines    situations-api.ts:189
            └─ listCanonicalSituationApiResponses  situations-api.ts:229
                 └─ every /api/v2/situations build, i.e. every warm-up shape
```

The baselines are the per-(league, situation_type) median confidence of the
clean single-founding cohort, and they cap a corrupted situation's headline
confidence. One per build, after the `records.length === 0` early return.

There is also a **latent per-record call**: `situations-api.ts:280` gives
`mapCanonicalSituationToApiResponse` a default parameter of
`buildConfidenceBaselines()`. The list path always passes the cached map, so the
default never fires today — but anything that calls the mapper directly, per
record, would run this statement per record. Worth deleting the default rather
than leaving it.

### Identical across all six warm-up shapes? Yes

`WARMUP_SHAPES` (`situations-cache.ts:511`) varies league, limit, activeOnly and
orderBy. This statement references none of them and takes no parameters: the six
shapes run **the same statement over the same 7,100 situations** six times.

### Can it be computed once and shared? It already is — and that is why prod paid it three times anyway

`cachedConfidenceBaselines` (`situations-api.ts:189`) memoises the map on
`{ sig, at }`, where `sig` is `MAX(rowid) FROM situation_snapshots`
(`:168`) and the entry is valid for `BUILD_CACHE_TTL_MS = 45_000` (`:163`).
Three things defeat it on a cold boot, and each is visible in the prod log:

1. **It is module state in the worker process.** A build killed by the timeout
   takes `dropWorker` with it, and the replacement worker starts with an empty
   cache. Prod's first two attempts were killed before they could populate it,
   so attempt three started from scratch — paying the cold read a third time and
   keeping the result once. **The 120s warm-up budget already fixes this case**,
   and it is the cheapest of the three fixes because it is only a number.
2. **The TTL is 45s.** A cold warm-up of six shapes, at prod's measured 3.9–5.4s
   per *warm* build, is already close to 45s and well past it when cold — so the
   later shapes recompute even when nothing has changed.
3. **The key is `MAX(rowid)` of an append-only table that ingestion writes to.**
   One snapshot written by a fast-tier cycle mid-warm-up invalidates every
   remaining shape's baseline.

So the honest answer is: it is shared in principle, not in practice, and the
share is worth ~15.3s per shape on this fixture. Three ways to make it real,
cheapest first:
- compute it once per `warmSituationsCache` run and pass it down, so the six
  shapes cannot each pay for it whatever the sig does (the warm-up is a known
  batch; it does not need a heuristic cache);
- give the warm-up its own TTL, or bump `BUILD_CACHE_TTL_MS` to cover a cold run;
- make the cost small enough not to care, which is section 2.

They compose, and the last one is the only one that also fixes a cold *request*.

---

## 2. Plans, indexes, and what actually costs the 15 seconds

### The plan as shipped

```
SCAN s
CORRELATED SCALAR SUBQUERY 2
  SEARCH se USING INDEX idx_situation_events_situation (situation_id=?)
CORRELATED SCALAR SUBQUERY 3
  SEARCH a USING INDEX sqlite_autoindex_situation_founding_audit_1 (situation_id=?)
CORRELATED SCALAR SUBQUERY 1
  SEARCH ss USING INDEX idx_situation_snapshots_situation (situation_id=?)
CORRELATED SCALAR SUBQUERY 1
  SEARCH ss USING INDEX idx_situation_snapshots_situation (situation_id=?)
```

Note subquery 1 appearing **twice** — the snapshot lookup is evaluated once for
the projection and once for the outer `IS NOT NULL` filter. Section 2d measures
what removing that is worth (nothing).

### 2a. Does `idx_situation_snapshots_situation` cover it? No — and it does not matter

`ON situation_snapshots(situation_id, created_at DESC, snapshot_id ASC)`
(`situations-store.ts:122`). The subquery selects `ss.confidence_score`, which
is not in it, so each of the 7,100 lookups finds its snapshot in the index and
then **fetches the snapshot row** to read one REAL. That is the same shape as
this fixture's earlier finding — 93% of the latest-snapshot read was the fat-row
fetch, not finding the row.

Each term measured on its own, over the same 7,100 situations:

| term | plan | first touch | warm |
|---|---|---:|---:|
| snapshot subquery → `confidence_score` | `SEARCH ss USING INDEX idx_situation_snapshots_situation` | 1,402ms | **146ms** |
| the same → `snapshot_id` (index-only control) | `SEARCH ss USING COVERING INDEX …` | 77ms | 68ms |
| `situation_events` COUNT on `kind` | `SEARCH se USING INDEX idx_situation_events_situation` | 15,461ms | **15,186ms** |
| `founding_audit` NOT EXISTS | `SEARCH a USING sqlite_autoindex…` | 10ms | 11ms |
| **whole statement** | | **16,210ms** | **15,587ms** |

The snapshot term is **0.9%** of the statement. Making it covering can save at
most ~78ms of 15,587ms. The brief's diagnosis of the index is correct and the
conclusion drawn from it is not.

### 2b. Where the 15 seconds are: `kind` is in no index

`idx_situation_events_situation ON situation_events(situation_id, recorded_at
ASC, event_id ASC)` (`situations-store.ts:101`) does not carry `kind`. So
`COUNT(*) … WHERE situation_id = ? AND kind = 'situation_created'` seeks to the
situation, then **fetches every one of its ~97 event rows** to test `kind` —
and `situation_events.payload_json` is the single biggest thing in this
database (56% of the file; 1,051 of 1,349 MiB on this fixture's own `dbstat`).
7,100 situations x ~97 events = **688,700 fat row fetches to produce 7,100
integers.**

### 2c. The candidates, measured

Each built on the fixture, swept, then dropped:

| | build | size | target statement |
|---|---:|---:|---:|
| **B** `snapshots(situation_id, created_at DESC, confidence_score)` — as specified in the brief | 12.49s | 14.4 MiB | 14,786 → **14,786ms (not chosen)** |
| **C** `snapshots(situation_id, created_at DESC, snapshot_id ASC, confidence_score)` | 13.34s | 18.5 MiB | 14,786 → **14,834ms (1.00x)** |
| **D** `events(situation_id, kind)` | 15.28s | 23.07 MiB | 15,279 → **218.7ms (70x)** |
| **E** `events(situation_id) WHERE kind='situation_created'` | 14.59s | **0.12 MiB** | 15,279 → **196.8ms (78x)** |
| **C + D** | 29.81s | 41.6 MiB | 14,786 → 194.1ms |

**B is not chosen.** The subquery's `ORDER BY ss.created_at DESC, ss.snapshot_id
ASC` needs `snapshot_id` as the tiebreak, B does not carry it, and the planner
keeps the existing index. The statement does not move at all. B is not a
covering index for this statement — C is, and C buys 0.3%.

**E is the fix**, and it is 0.12 MiB because only 7,100 of 688,700 event rows
are founding rows. D is the general form, 190x larger, and slightly slower here
because its entries are wider.

### 2d. The no-index alternative, measured and rejected

Rewriting the statement so the snapshot subquery is evaluated once rather than
twice (a `JOIN` on the latest `snapshot_id` instead of a projected subselect,
multiset-identical output verified, 6,690 rows both ways):

**15,279ms → 15,849ms.** No improvement, slightly worse. The double evaluation
is real and it is irrelevant: both evaluations are 1% terms. There is no
rewrite that avoids the `kind` filter, because the rows have to be read to know
their `kind`. **This statement cannot be fixed without an index**, which is the
thing that makes section 3's deployment question unavoidable.

### 2e. Plan-regression sweep — every statement touching `situation_snapshots`

Baseline is main's index set. "Changed" means the plan text changed.

| statement | baseline | B | C | D | E |
|---|---:|---|---|---|---|
| `getCleanFoundingSituationConfidences` | 14,786ms | not chosen | **changed**, 1.00x | **changed**, 0.01x | **changed**, 0.01x |
| `listCanonicalSituations` (default order) | 207.9ms | same, 0.77x | **changed**, 0.79x | same | same |
| `listCanonicalSituations` (escalation order) | 224.1ms | same, 0.69x | **changed**, 0.64x | same | same |
| `listSituationsForMatching` (ingestion) | 53.7ms | same | **changed**, 0.83x | same | same |
| `getLatestSituationSnapshot` | 0.3ms | same, 0.21x | **changed**, 0.17x | same | same |
| `listSituationSnapshots` | 0.5ms | **changed**, 0.92x | **changed**, 1.22x | same | same |
| `situationsDataSignature` (`MAX(rowid)`) | 0.1ms | same | same | same | same |
| snapshot insert `replay_hash` probe | 0.1ms | same | same | same | same |
| bloat-plan snapshot page | 0.1ms | same | **changed**, 1.04x | same | same |

The flip on `getCleanFoundingSituationConfidences` that
`docs/situations-latest-snapshot-read.md` predicted and refused to ship
unmeasured is now measured: **it is neutral** (1.00x). That report's rule stands
and was worth following — the flip was harmless, but three of #78/#79/#80's
flips were not, and only measuring tells them apart.

C is a real but modest **request-path** win (the escalation-ordered board 224 →
144ms, 0.64x) and no help at all to this statement. It belongs with the
two-stage board rewrite that report recommends, not here.

### 2f. Plan-regression sweep — every statement touching `situation_events`

Both candidate indexes sit on that table, so it gets the same treatment:

| statement | baseline | D | E |
|---|---:|---:|---:|
| `getCleanFounding` (target) | 15,279ms | **changed**, 218.7ms | **changed**, 196.8ms |
| `listSituationEvents` | 0.7ms | same, 0.6ms | same, 0.8ms |
| `situationEventsByIds` (request path, 100 ids) | 118.4ms | same, 119.5ms | same, 112.3ms |
| `summarizeSituationEvidence` | 0.3ms | **changed**, 0.3ms | same, 0.3ms |
| bloat-rows event page | 0.2ms | same | same |
| bloat-cleanup delete by `event_id` | 0.0ms | same | same |
| admin RSS founding join (`routes.ts:772`) | **13,735ms** | **changed**, 82.8ms | **changed**, 9.0ms |
| admin multi-hit group (`routes.ts:533`) | 160.0ms | **changed**, 100.4ms | same, 179.0ms |

Two notes on this table.

**The request-path numbers are interleaved, not sequential.** A first pass read
`situationEventsByIds` as 109.6 → 288.5ms under E **with no plan change**, which
would have been a 2.6x regression on `GET /api/v2/situations`. Re-measured
interleaved, best of 7, with each arm pinned by `INDEXED BY`: main's index
118.4ms, D 119.5ms, unpinned-with-both 112.8ms, E-only 112.3ms, and the plan
never leaves `idx_situation_events_situation`. The 288ms was page-cache churn
from the index build that had just run. **A sequential before/after on a 2.4 GiB
file is not a measurement**; this is the second time that has nearly produced a
false finding in this fixture family.

**`summarizeSituationEvidence` cannot use E** — it filters
`kind IN ('situation_created','situation_matched')`, which the partial index's
`WHERE` does not imply. It is 0.3ms either way, so nothing is lost, but it is
the reason to prefer E only if `situation_created` is the only `kind` predicate
worth indexing. Today it is: the other two are this one and `snapshot_created`
in a CASE expression.

**Found along the way, not in scope:** the admin RSS founding join at
`routes.ts:772` and `:780` is **13.7s on main** — the same `kind` filter, the
same 688,700 fat-row fetches, on an admin debug route. E takes it to 9.0ms. It
is the same defect as the target statement and it would be fixed by the same
index.

### 2g. `CREATE INDEX` on the 5 GB prod file, and the port-bind question

**Measured:** 14.59s for E on the 2.34 GiB fixture, **warm**, on a laptop NVMe.
The build is read-bound, not size-bound — a partial index over 7,100 rows still
has to evaluate `kind` against all 688,700, which is the same 1.35 GiB of
`payload_json` the statement itself reads. Prod has the same event row count in
a file 2.1x larger, 35.5% of it freelist, on a network disk, cold. **I did not
measure that and cannot from here.** The one cold-vs-warm number on this fixture
family was ~100x, which would put a cold build in minutes, not seconds; a laptop
NVMe to a Render disk is itself a multiplier. Anything I quote for prod would be
a guess, and this is the fourth report in a row to say the missing number is a
cold one.

**Where the cost would land is the part that is knowable, and it is not where
the brief assumes.** The pre-listen sequence (`server/index.ts`):

```
:113  await registerRoutes(...)
:117  startIngestionScheduler()          // timers only
:122  void trackJob(… runSettlementBacklogMigration())
          └─ its synchronous prefix calls getPipelineDb() → initSchema
             → every CREATE INDEX IF NOT EXISTS on pipeline.db
:247  httpServer.listen(...)             // port bind
```

So an index in `initSchema` (`store.ts`) is pre-listen — that is where the
settlement commit's `idx_live_signals_settleable_nullgame` goes, at a measured
0.95–3.7s. **But E belongs to the situations schema, and
`ensureSituationSchema` is not in that path.** It runs on the first
situations-store call of the process. With #82's warm-up gate in place, the first
such call is the boot ingestion cycle's situations engine — **on the main
thread, 45s after listen, inside the cycle that already blocked 16.8s on Oct 8.**
A 15s-plus index build there is a health-check kill, not a delayed deploy. That
is strictly worse than pre-listen, and it is the trap in shipping E as a schema
line.

Three ways to place it, and what each costs:

1. **By hand on prod, out of band**, then add it to `ensureSituationSchema` so
   fresh databases get it and the live one sees a no-op `IF NOT EXISTS`. This is
   what was done for `idx_outcomes_signal_created` before #78 merged, and it is
   the only option that pays the cold build with nothing waiting on it.
2. **In `initSchema`, pre-listen**, accepting an unknown-but-minutes-possible
   delay to port bind. Render's zero-downtime deploy keeps the old instance
   serving until the new one is healthy, so the failure mode is a failed deploy
   rather than an outage — but I cannot tell you Render's port-bind timeout from
   here and will not guess at it. Note also that `healthCheckPath` is
   `/api/signals` (`render.yaml`), which runs
   `SELECT * FROM live_signals ORDER BY created_at DESC LIMIT 100` — the health
   check is itself a cold fat-row read, so the budget after listen is not free
   either.
3. **In the worker, before the warm-up**, where 15s of CPU and disk costs the
   event loop nothing — `situations-worker.ts:144` already calls
   `ensureSituationSchema(getPipelineDb())` in the worker's boot, off the main
   thread, after listen. The catch is the write lock: `CREATE INDEX` holds one
   for the whole build, nothing in this repo sets `busy_timeout`, and
   better-sqlite3's 5,000ms default is exactly the health-check budget — so any
   main-thread write during the build blocks for 5s and then throws
   `SQLITE_BUSY`. That is the VACUUM finding again, at a fifteenth of the
   duration.

**Recommendation: (1).** It is the only one whose worst case is "nothing
happens", and the precedent exists.

---

## 3. What I measured and what I did not

**Measured:** every number in this document, on a locally built fixture at
prod's row counts, warm. The term decomposition. Four candidate indexes, their
build times and sizes. Two full plan-regression sweeps (nine statements on
`situation_snapshots`, eight on `situation_events`). The no-index rewrite, and
that it does not work. An interleaved re-measure of the one apparent regression,
which was cache churn.

**Not measured, and it matters:**
- **Any cold number.** Everything here is warm. Prod's 25s and 29s kills are
  cold; my 15.3s is warm; the gap is the disk and I have no instrument for it on
  this machine. The shape of the fix (78x, from reading 7,100 index entries
  instead of 688,700 fat rows) should survive a cold disk better than the status
  quo does, because it is reading two orders of magnitude less — but "should" is
  not "did".
- **`CREATE INDEX` on prod's actual file.** See 2g.
- **Whether prod's `situation_founding_audit` is populated.** I seeded 547 rows
  to keep the `NOT EXISTS` term honest; it is an 11ms term either way, so the
  result does not turn on it.
- **The `situations` table's own scan.** `SCAN s` over 7,100 rows is in every
  arm and I did not try to narrow it; at 197ms post-fix it is now a visible
  share of what is left, and the next thing to look at if 197ms is still too
  much.
- **Nothing was run against prod**, including Render's API: the port-bind
  timeout in 2g is explicitly not quoted because I did not look it up.
