# The founding-row index: placement, plans, and the fixture-vs-prod gap — October 2026

Companion to the change in this PR. One index ships; the rest of this document
is measurement, including two numbers that corrected an earlier draft and one
question I could not answer from this machine.

**Nothing was run against prod.** Every number is from a locally built fixture
at prod's row counts (`situations` 7,100, `situation_events` 690,700 at 97.3 per
situation, `situation_snapshots` 340,800, file 2.34 GiB). `sqlite_stat1` does
not exist — nothing in this repo runs `ANALYZE` — so **the plans here are prod's
plans**.

---

## 1. Where the build goes, and why not the three obvious places

`CREATE INDEX IF NOT EXISTS idx_situation_events_founding ON
situation_events(situation_id) WHERE kind = 'situation_created'`.

### It is not in `ensureSituationSchema`

That is where a reader would put it, and it is the trap. `ensureSituationSchema`
is lazy: it runs on the first situations-store call of the process. On a
database that does not already carry this index, with #82's warm-up gate in
place, that first call is **the boot ingestion cycle's situations engine — main
thread, ~45s after listen, inside the cycle that already blocked 16.8s on Oct
8.** A 30–90s build there is a health-check kill, not a delayed deploy.

`situation-events-founding-index.test.ts` asserts `ensureSituationSchema` does
**not** create the index, so the DDL cannot migrate back there quietly.

### It is not hand-built on prod

A hand-build holds the write lock for the whole 30–90s while ingestion is live.
Nothing in this repo sets `busy_timeout`, so better-sqlite3's 5,000ms default
means each blocked main-thread write waits 5s and then throws `SQLITE_BUSY` —
and 5s is exactly Render's health-check budget. This is the same finding as the
VACUUM one, at a fifteenth of the duration.

### It is not in `initSchema`, even though that *is* the pre-listen schema path

`initSchema` (`store.ts`) runs inside `getPipelineDb()`, which is strictly
*before* any `ensureSituationSchema` call — so `situation_events` does not exist
yet at that point on a fresh database, and a `CREATE INDEX` on it would throw.
Ordering makes this placement impossible, not merely untidy.

### Where it actually goes

**`server/index.ts`, first statement inside the async IIFE** (the block begins at
what was line 113, immediately before `await registerRoutes(httpServer, app)`):

```
(async () => {
  { ensureSituationSchema(db); ensureSituationFoundingIndex(db); }   <-- new
  await registerRoutes(httpServer, app);
  registerPipelineRoutes(app);
  startIngestionScheduler();                       // timers only
  void trackJob(... runSettlementBacklogMigration())
  ...
  httpServer.listen(...)                           // port bind
```

First in the IIFE on purpose: ahead of `registerRoutes`, of
`startIngestionScheduler`, and of the settlement backlog migration, so no
handler, timer or migration can touch the database before the schema it expects
is in place. Nothing is serving and no ingestion is running, so the build's only
cost is a one-time delay to port bind.

Two properties worth stating explicitly:

- **The worker never builds it.** `situations-worker.ts:144` calls only
  `ensureSituationSchema`, and the index is not in it. The worker inherits the
  index from the file, built by the main thread before the worker exists.
- **The build is paid exactly once.** `IF NOT EXISTS` is a catalog no-op on
  every boot after the first. The boot log prints the schema and index times
  separately, so on the boot that builds it that line explains a slow port
  bind, and on every later boot it proves the build is not being repeated.

**One deviation from the brief, flagged:** the index build is wrapped in
try/catch and `ensureSituationSchema` is not. Without the index the
founding-cohort read is slow, not wrong, so a failed build logs loudly and the
process still binds the port. The situations tables are a hard requirement, so a
failure there should still stop the boot.

### Budget

Render gives the start command **15 minutes** (deploy docs; build command 120
minutes, pre-deploy 30). The build is estimated at **30–90s on prod's 0.5 CPU**
— see #83's report for the decomposition: a 1.35 GiB sequential scan measured at
99 MiB/s on a disk with 3.4x that in headroom, so it is CPU-bound. Render's
zero-downtime deploy keeps the old instance serving throughout, so the worst
case of a slow build is a failed deploy, not an outage.

On this fixture the build measured **14.20s**, consistent with the 13.59s in
#83's report.

---

## 2. Plans, the literal, insert cost, and the sweep

### 2a. The plan, for the statement as it is actually prepared

The test does not re-type the SQL. It reads the `kind`-filtered COUNT subquery
out of `situations-store.ts` with a regex and prepares *that*, so a rewrite
which loses the index fails the test rather than passing against a stale copy.

| | plan |
|---|---|
| with the index | `SEARCH se USING COVERING INDEX idx_situation_events_founding (situation_id=?)` |
| without | `SEARCH se USING INDEX idx_situation_events_situation (situation_id=?)` |

Covering, so the fat rows are never touched. The statement:
**15,076ms → 164ms, 92x**, identical multiset (6,690 rows both ways), for
**124 KiB** of index — only 7,100 of 690,700 event rows satisfy the predicate.

### 2b. Bound parameter vs literal `kind` — the brief's question, and it has a real answer

**SQLite plans partial-index eligibility from the bound VALUE, and re-plans when
it changes.** Measured on a small synthetic table, which is the only way to see
this cleanly:

| statement | plan |
|---|---|
| `kind = 'situation_created'` (literal) | `COVERING INDEX idx_f` |
| `kind = ?` bound to `'situation_created'` | `COVERING INDEX idx_f` |
| `kind = ?` bound to `'situation_matched'` | `idx_situation_events_situation` |
| `kind = ?` bound to a value with no rows | `idx_situation_events_situation` |

All four return correct counts — SQLite does not use the partial index where it
would be wrong. So **a bound parameter is not broken, it is conditional**: the
plan depends on the argument the caller passes. Timed on the full statement
shape, interleaved over six alternating runs, the bound form bound to
`'situation_created'` was **11.2ms against the literal's 14.2ms (0.79x)** — it
uses the index.

The literal is kept because it makes the plan *unconditional*, which is the
property worth having on a statement whose fallback is 15 seconds. That is a
weaker claim than "the literal is required", and it is the one the measurement
supports.

### 2c. Insert overhead — and a correction

**Below this fixture's noise floor.** Interleaved, four rounds, transaction
rolled back (`situation_events` carries append-only guards, so a `DELETE` of
probe rows throws and the rollback is the only cleanup):

| rows inserted | with index | without | ratio |
|---|---:|---:|---:|
| `kind = 'situation_matched'` (the ingestion hot path, 99% of writes) | 20ms | 34ms | 0.59x |
| `kind = 'situation_created'` | 35ms | 36ms | 0.97x |

`situation_matched` rows do not satisfy the predicate, so they never enter the
index; the sub-1.0 ratios are noise, not a speed-up.

**An earlier probe of mine said 9x, and it was wrong.** That run created and
dropped the index immediately next to the timed transaction, so it measured
`CREATE INDEX` write amplification and WAL state rather than index maintenance.
A second attempt using one fresh 2.34 GiB copy per arm was worse — runs of
8,067ms, 1,498ms and 4,993ms for the same arm. This is precisely the trap #83's
report named, and I walked into it twice before using a small fixture with the
arms interleaved on one handle.

### 2d. Plan-regression sweep — every statement touching `situation_events`

Thirteen statements: every `FROM situation_events` in `server/` outside tests,
plus the bloat-job readers. Interleaved arms, best-of-two, because an index
build churns the page cache.

| statement | baseline | with index | plan |
|---|---:|---:|---|
| `listSituationEvents` (single) | 5.0ms | 5.3ms | same |
| `listSituationEventsForIds` (batch) | 6.0ms | 7.8ms | same |
| `countSituationEvidence` (`kind IN (...)`) | 3.7ms | 5.4ms | same |
| founding COUNT (**the target**) | 0.1ms | 0.1ms | **CHANGED** → covering partial |
| lineage probe | 0.1ms | 0.6ms | same |
| event insert PK probe | 0.9ms | 0.7ms | same |
| bloat-rows page (index order) | 4.1ms | 3.8ms | same |
| bloat-plan founding group | 15,314ms | **2.4ms** | **CHANGED** |
| admin cross-type join | 13,179ms | **10.6ms** | **CHANGED** |
| admin debug-db `multiHitRows` | 15,383ms | 15,862ms | same |
| admin `eventsBySource` | 13,807ms | 13,577ms | same |

**Zero regressions.** Three plans changed and all three got faster. The
sub-millisecond ratios (lineage probe 9.03x on 0.1 → 0.6ms) are noise at that
scale with an unchanged plan.

Two unasked-for wins worth naming, because they are large: the bloat job's
founding-row scan goes **15,314ms → 2.4ms**, and the admin cross-type join
**13,179ms → 10.6ms**.

The two admin statements that did *not* improve (`multiHitRows`,
`eventsBySource`) scan the whole events table irrespective of `kind`, so a
founding-only index cannot help them. They are pre-existing 14–16s reads on
admin-gated routes, reported here and not fixed.

---

## 3. `routes.ts:772` — admin-gated, not public

Line 772 falls inside **`GET /api/admin/cross-type-audit`**, declared at
`routes.ts:743`, whose first line is `if (!requireAdmin(req, res)) return;`. It
is **not public**. (`GET /api/admin/rss-headline-audit` at `:703` is gated the
same way.)

`requireAdmin` (`routes.ts:1501`) returns 503 when `ADMIN_PASSWORD` is unset,
and otherwise accepts either an `Authorization: Bearer <password>` header **or**
`?password=` in the query string. The query-string form is a real if minor
exposure — it puts the admin password into URLs, and into anything that records
them — and it is pre-existing, not introduced here.

### What it does cold

Three statements, measured on the fixture with the new index present:

| statement | time | plan |
|---|---:|---|
| `crossTypePairs` (self-join) | **2,290ms** | `SCAN s1 \| SEARCH s2 USING idx_situations_league_type (league=?) \| TEMP B-TREE FOR GROUP BY \| TEMP B-TREE FOR ORDER BY` |
| `rssEmptyPlayers` | 1,581ms | `SCAN se USING idx_situation_events_founding \| SEARCH s \| SEARCH re` |
| `rssPlayerSample` | 100ms | same join, plus `TEMP B-TREE FOR ORDER BY` |

~4.0s total, on the main thread, with no pagination — it is a hand-run
diagnostic and it blocks the loop for as long as it takes.

**The honest caveat: this fixture has `raw_events` = 0.** Both RSS statements
join `raw_events`, so their prod cost is **not measured** — they return almost
nothing here and their 1,581ms is the `situation_events` side alone. Only
`crossTypePairs` is independent of `raw_events`, and its 2,290ms is the one
number here that should carry over. Note also that both RSS statements join on
`se.kind = 'situation_created'` and therefore now use the new index; without it
the generic form of that join measured 13,179ms.

---

## 4. The gap: fixture 15.3s "warm" vs prod 3.9–5.4s "warm"

**Explained, and the explanation is that the two numbers are not the same
quantity.** The 15.3s is the cost of the *first* warm-up shape. Prod's 3.9–5.4s
are later shapes, which never run the statement at all.

Measured: the six `WARMUP_SHAPES` in order, with the real build cache live.

| shape | without the index | with it |
|---|---:|---:|
| `limit 15` (FlagshipHome) | **18,756ms** | **8,939ms** |
| NFL `limit 100` | 1,224ms | 2,267ms |
| NBA `limit 100` | 1,148ms | 2,006ms |
| MLB `limit 100` | 1,072ms | 1,593ms |
| CFB `limit 100` | 1,244ms | 1,596ms |
| `limit 500` (story page) | 3,271ms | 5,033ms |
| **total** | **26.7s** | **21.4s** |

Only shape 1 pays `getCleanFoundingSituationConfidences`. Shapes 2–6 hit
`cachedConfidenceBaselines` (`situations-api.ts:189`), keyed on
`MAX(rowid) FROM situation_snapshots` with a 45s TTL. So:

- prod's **>25s and >29s** kills were shape 1, cache-cold;
- prod's **3.9s and 5.4s** were later shapes, cache-warm, which skipped the
  statement entirely;
- the fixture's 15.3s is the statement, which appears once, in shape 1.

**Cross-check against the figure from the Oct 9 boot: 6/6 shapes in 76s.** That
boot did not have this index, so the comparable fixture total is 26.7s.
76 / 26.7 = **2.8x**, which is about what prod's 0.5 CPU, cold network disk and
2.1x-larger file should cost. Fixture and prod agree once the same quantity is
compared; there was no discrepancy to explain, only a mismatched comparison —
mine, in the #83 report.

### What this means for the index's actual value, stated plainly

**The end-to-end warm-up win is ~20%, not 92x.** 26.7s → 21.4s on the fixture,
because five of six shapes never ran the statement in the first place. Quoting
92x as the warm-up improvement would be dishonest.

The value is concentrated where it matters: **shape 1 goes 18,756ms → 8,939ms.**
That is the build that was being killed at 30s, and it is also what a cold
*request* pays when the cache is empty. Scaled by the 2.8x prod factor, ~53s →
~25s.

**And one real cost, which the per-shape table shows:** shapes 2–6 got *slower*
with the index (1,224 → 2,267ms and so on). The likely mechanism is that in the
baseline arm shape 1 scanned the whole events table and incidentally warmed the
page cache for everything after it; with the index, shape 1 reads 124 KiB
instead and that free warming no longer happens. It is a page-cache artifact
rather than a plan change — every one of those shapes has an unchanged plan —
and it is why the net is 20% rather than the 37% the shape-1 saving alone would
suggest. I did not isolate it further.

---

## 5. Measured and not measured

**Measured:** the build time and index size. The plan for the shipped subquery,
read out of the source. Literal vs bound-parameter planning, including the
correctness of all four cases. Insert overhead, interleaved, after two bad
attempts. A 13-statement plan-regression sweep over every `situation_events`
statement in `server/`. The three `cross-type-audit` statements and their plans.
The six warm-up shapes in order, with and without the index.

**Not measured, and it matters:**

- **`raw_events` is empty in this fixture** (section 3). The two RSS statements
  in `cross-type-audit` cannot be costed for prod from here. `crossTypePairs`
  can.
- **Render's disk throughput**, still. It is the full width of the 30–90s build
  estimate and cannot be had from this machine.
- **`CREATE INDEX` on prod's actual file.** Not run. The estimate is built from
  volume and throughput.
- **Any genuinely cold number.** This machine has 7.9 GiB of RAM against a 2.34
  GiB fixture, so "warm" overstates every timing here.
- **The page-cache interaction in section 4** is a hypothesis consistent with
  the plans being unchanged, not something I isolated.
- **Prod's own row counts** are taken from earlier `db-diagnostics` output, not
  re-verified for this report.
