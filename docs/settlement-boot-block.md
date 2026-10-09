# The `ingest:settlement` boot block — report, October 2026

**Report only. No code changes, no index created outside a throwaway fixture,
and nothing was run against prod.** Every number below comes from a fresh copy
of the locally built prod-shaped fixture used for PR #80.

Prompted by the prod boot of 2026-10-08 05:18 UTC (first boot after #82):

| step (nesting as logged) | prod |
|---|---:|
| `ingest:settlement` | **16.8s** |
| `settlement:compute-accuracy` | 10.1s |
| ↳ `settlement:accuracy-compute` | 8.9s |
| ↳ `settlement:accuracy-sync` | 1.3s |
| `settlement:read-nullgame` | 6.4s |

The same step blocked 6.8s on the #81 boot (6.66s of it in `read-nullgame`, no
accuracy at all) and did not block on the #80 boot. Section 2 explains why.

## Fixture and method

`$TMPDIR/es-req-audit-fixture`, the #80 fixture, copied fresh per run and opened
through `getPipelineDb()` so `initSchema` brings it to **main's exact index
set** (6.6s of index building on a copy that has none — a cost already
documented in `store.ts`).

| | rows |
|---|---:|
| `live_signals` | 150,000 (37,500 per league) |
| `outcomes` | 75,000 (6,000 qualifying per league) |
| `settled_outcomes` (storage.db) | 75,000, of which **18,000** qualify |
| null-game settlement candidates | 8,333 (of 16,667 with `game_id IS NULL AND outcome_id IS NULL`) |
| `pipeline.db` / `edge_setter.db` | 722 MB / 41 MB |

`sqlite_stat1` does not exist (no `ANALYZE` anywhere in this repo), so **the
fixture's plans are prod's plans** regardless of row count.

**All timings are warm, best of 3.** A just-copied 722MB file sits in the OS
page cache, so nothing here is a cold measurement; prod's cold-disk multiplier
sits on top of every number. Where cache state is itself the finding, I say so.

One fixture artifact to know about: the seeder correlates league with the
`hit IS NULL` pattern, so **NFL has 0 qualifying outcomes**. NFL is therefore
the zero-row floor for the accuracy statements — and it still costs ~290ms as
shipped, which is rather the point.

---

## 1. SQL, plans, timings

### 1a. `settlement:read-nullgame` — `getUnsettledSignalsWithoutGameId`

`store.ts:1375`, called unconditionally every cycle at `settlement.ts:372`:

```sql
SELECT * FROM live_signals
WHERE game_id IS NULL AND betting_relevance = 1 AND outcome_id IS NULL
  AND team IS NOT NULL AND settlement_expired = 0
ORDER BY created_at ASC LIMIT 500
```

Plan on main:

```
SEARCH live_signals USING INDEX idx_live_signals_game_outcome (game_id=? AND outcome_id=?)
USE TEMP B-TREE FOR ORDER BY
```

**The partial index built for this query is not the one chosen.**
`idx_live_signals_unsettled_nullgame` (`store.ts:615`) exists, and its comment
says it is there so parked rows "stop being re-scanned every cycle"; the planner
prefers the two-column equality seek on `(game_id, outcome_id)` instead. Two
consequences:

- `LIMIT 500` buys nothing. The whole `NULL`/`NULL` set is fetched, filtered,
  sorted in a temp b-tree, and only then are 500 rows taken.
- **Every `SETTLEMENT_EXPIRED` row is still read on every cycle**, fat row and
  all. `settlement_expired` is not in the driving index, so it can only be
  evaluated after the table fetch. The backlog the #77 migration parked in order
  to stop this scan is still being scanned.

Measured:

| variant | plan | ms |
|---|---|---:|
| as shipped | `SEARCH (game_id,outcome_id)` + temp b-tree | **121–157** |
| as shipped, `SELECT id` only | same | 116.8 |
| `INDEXED BY idx_live_signals_unsettled_nullgame` | `SCAN` the partial index, no sort | **9.8** |
| same, `SELECT id` only | same | 0.6 |

The projection is not the cost — dropping `SELECT *` for `SELECT id` saves 4ms
of 121ms. The cost is fetching all 16,667 candidate rows to evaluate three
predicates that the partial index already encodes.

**In prod's post-#77 shape** (same fixture, oldest 7,733 of the 8,333
candidates parked, 600 left settleable):

| variant | ms |
|---|---:|
| as shipped | 127 (unchanged — it reads parked rows either way) |
| pinned to the existing partial index | **64.8** (walks 7,733 parked entries, one table fetch each) |
| pinned to a new partial index carrying `settlement_expired = 0` | **9.0** |

That new index — `(created_at) WHERE game_id IS NULL AND outcome_id IS NULL AND
betting_relevance=1 AND settlement_expired=0` — built in 3.7s once and is 24KB
on this fixture. **Neither partial index is chosen without `INDEXED BY`**:
adding the new index and leaving the statement alone changes nothing (measured,
still 124ms on the same plan). A plan check over `findExistingSignal`, the
pinned delivery feed, `getUnsettledSignalsForGame` and `archiveOldLiveSignals`
showed no plan change from its presence.

### 1b. `settlement:accuracy-compute` — `computeSourceAccuracy` (`settlement.ts:505`)

Three statements per league, four leagues: twelve statements per call. All three
share the shape `FROM outcomes o JOIN live_signals s ON s.id = o.signal_id WHERE
s.league = ? AND o.hit IS NOT NULL AND o.excluded_stale = 0` — a **bare league
filter on the joined table**, which is exactly the landmine flagged in
`docs/request-path-query-audit.md`.

Plans as shipped. All three drive from `live_signals`, i.e. 37,500 fat rows per
league, each probed into `outcomes`:

| pass | plan |
|---|---|
| 1 overall (`:513`) | `SEARCH s USING INDEX idx_live_signals_league (league=?)` → `SEARCH o USING COVERING INDEX idx_outcomes_settled_signal` |
| 2 by `signal_type` (`:527`) | `SEARCH s USING INDEX` **`idx_live_signals_injury_dedup`** `(league=?)` → `SEARCH o USING COVERING INDEX idx_outcomes_settled_signal` |
| 3 per source (`:546`) | `SEARCH s USING INDEX idx_live_signals_league (league=?)` → `SEARCH o USING COVERING INDEX idx_outcomes_settled_signal` |

**Confirmed: #79's `idx_live_signals_injury_dedup` is chosen for the bare
`s.league = ?` filter** — a four-column index on
`(league, signal_type, player, injury_designation)` serving a one-column
predicate, because its leading column is `league`. It is picked for pass 2 only
(pass 2 also needs `s.signal_type`, which that index covers), and pass 2 is the
slowest of the three in every league.

With `CROSS JOIN` substituted for `JOIN` — identical row set, loop order pinned,
per the rationale already written out at `store.ts:2249`:

| pass | pinned plan |
|---|---|
| 1 | `SCAN o USING COVERING INDEX idx_outcomes_settled_signal` → `SEARCH s USING COVERING INDEX idx_live_signals_id_league_type (id=? AND league=?)` |
| 2 | same, plus `USE TEMP B-TREE FOR GROUP BY` |
| 3 | same, but `s` is not covering — `s.sources` forces the row |

Timings, ms:

| statement | shipped | pinned |
|---|---:|---:|
| pass 1 overall — NBA / MLB / NFL / CFB | 293.1 / 260.0 / 286.2 / 271.5 | 9.1 / 10.8 / 14.3 / 12.0 |
| pass 2 by type — NBA / MLB / NFL / CFB | 380.3 / 403.9 / 419.2 / 400.2 | 11.7 / 14.7 / 9.6 / 15.7 |
| pass 3 per source — NBA / MLB / NFL / CFB | 300.8 / 303.1 / 277.3 / 294.4 | 75.7 / 81.1 / 9.3 / 89.1 |
| **all 12** | **3,890** | **353** |
| `computeSourceAccuracy()` end to end | 3,905 (first call 4,122) | 343 (reads only) |

Two further fresh-copy runs, in both orderings, to rule out cache ordering:
shipped 3,881 / 3,810 / 3,802 then pinned 347 / 332; and pinned 365 / 396 / 433
then shipped 4,425 / 4,361. **~11x, consistently, in either order.**

Pass 3 is the one that still costs something when pinned (76–89ms) because it
projects `s.sources` and must touch the row. Passes 1 and 2 become index-only.

**Why this family is the cache-sensitive step.** As shipped it materialises
37,500 fat `live_signals` rows per league — 150,000 per call, the whole table,
every call. Pinned, it scans 6,000 covering index entries per league and touches
18,000 table rows in total (pass 3 only). An 8.3x difference in rows read off
disk, against an 11x difference in warm time. One uncontrolled run, in which an
intervening experiment had churned the page cache, measured the shipped path at
**24.1s** (best of 3) against 3.9s warm. I cannot call that a controlled
measurement, but it is the right direction and the right order of magnitude for
prod's 8.9s sitting above my 3.9s warm.

### 1c. `settlement:accuracy-sync` — `syncAccuracyToStorageDb` (`settlement.ts:648`)

Reads `storage.ts:1420`, against `edge_setter.db`:

```sql
SELECT signal_id, league, signal_type, sources, hit, clv
FROM settled_outcomes WHERE hit IS NOT NULL AND excluded_stale = 0
```

Plan: `SCAN settled_outcomes`. There is no index on `settled_outcomes` beyond
its two implicit ones, so all 75,000 rows are scanned, 18,000 kept, and the fat
`sources` column is read throughout.

| | ms |
|---|---:|
| the read | 108.9–116.7 (18,000 rows) |
| whole function | 200–377 |
| ⇒ the 40 `upsertSourceScore` writes | ~90–260 (each its own implicit WAL transaction) |

A covering index here would have to carry `sources` — duplicating the fat column
in a second index in a second database, the same trade the #80 audit already
declined. At 1.3s on prod it is the smallest of the three; leave it, and revisit
if it grows.

---

## 2. Why the block varies between boots

Two independent variables, one per step.

**`read-nullgame` runs every cycle, unconditionally** — `settlement.ts:372`, no
gate. Its cost tracks the size of the whole null-game backlog (including every
parked row, per 1a) and the page-cache state of `live_signals`; it does not
track how much settlement work exists. That is why it was 6.66s on the #81 boot,
where the situations warm-up fired at 12s and hit the same cold 5GB file from
the worker (`ingestion.ts:645` documents exactly this), 6.4s on the Oct 8 boot,
and invisible on the #80 boot, which had no warm-up to contend with.

**The accuracy family is gated, and at boot the gate is a coin toss**
(`settlement.ts:464`):

```js
if (signalsSettled > 0 && Date.now() - lastAccuracyComputeAt >= ACCURACY_DEBOUNCE_MS) {
```

- `ACCURACY_DEBOUNCE_MS` is one hour (`:321`) and `lastAccuracyComputeAt` is
  initialised to `0` at module load (`:322`). At boot `Date.now() - 0` always
  exceeds an hour, so **the debounce never gates the first cycle**.
- The only gate left is `signalsSettled > 0`. That counter is incremented in
  `settle-linked` (`:368`, one per signal settled against a game that just went
  final) and in `settle-nullgame` (`:455`).
- So accuracy runs on the boot cycle **iff at least one signal settles in that
  cycle**, which depends on whether any game went final between the last
  pre-restart cycle and the boot cycle — the hour of the deploy and the sports
  calendar. Nothing in the code decides it.

That accounts for all three boots: Oct 8 = `read-nullgame` (always) + accuracy
(≥1 signal settled) = 16.8s; #81 = `read-nullgame` only, so nothing settled;
#80 = neither blocked.

**And the gate puts the work in the worst possible cycle.** Once accuracy runs,
`lastAccuracyComputeAt` is set and it cannot run again for an hour — so the one
cycle it does run in is the boot cycle: the coldest disk of the instance's life,
inside the cycle the #82 warm-up gate is waiting on, against Render's 5s health
check.

---

## 3. Options, ranked by risk

### (a) `CROSS JOIN` pin on the accuracy statements, `INDEXED BY` on read-nullgame — lowest risk, largest measured effect

The follow-up already filed in `docs/request-path-query-audit.md`. `CROSS JOIN`
in SQLite is an inner join that forbids loop reordering: identical rows, pinned
order. The pattern, the rationale and a plan-regression test already exist on
main for the track-record pair (`store.ts:2249`,
`request-path-query-plans.test.ts:517`).

- accuracy: **3,890ms → 353ms** across the 12 statements; end to end 3.9s →
  0.34s plus the ~184 upserts.
- read-nullgame: **122ms → 9.8ms** with the existing index, or 9.0ms with a new
  `settlement_expired`-aware partial index — which is what prod's parked shape
  actually needs, since the existing index degrades to 64.8ms there.
- If prod holds the ratio, that is 8.9s → ~0.8s and 6.4s → ~0.5s: the 16.8s
  block becomes ~2.6s, inside the health-check budget.

What it does not fix: `accuracy-sync`'s 1.3s scan (different database, no join
to pin); accuracy still running inside the boot cycle; the cold-disk multiplier
on everything else in the cycle; the per-signal `findNextFinalGameForTeam` work
in `settle-nullgame`. It also makes two indexes load-bearing — an `INDEXED BY`
pin raises "no such index" if the index is ever dropped, the same deliberate
trade as `idx_live_signals_active_score`.

### (b) Defer the accuracy family out of the boot cycle — low risk, zero measured effect on the work itself

Worth being precise about what "defer" means here: the cycle is **already** 45s
after `listen` (`INGESTION_INITIAL_DELAY_MS`, `ingestion.ts:674`). The block is
not "too early", it is "the first cycle has the coldest disk and the most queued
work". So (b) means skipping accuracy specifically on the boot cycle — seeding
`lastAccuracyComputeAt` at module load, or an explicit boot gate — and letting
it land on a standard cycle 15 minutes later.

- Measured effect on the fixture: **0ms.** It moves 10.2s of identical work out
  of the window where the health check is tightest. That is all it does, and it
  may well be enough.
- What it does not fix: the work itself; and `read-nullgame`'s 6.4s, which is
  ungated and stays in the boot cycle.
- **Interaction to respect:** #82's warm-up now waits for `ingestion-initial`
  plus a 120s floor (`situations-cache.ts:625`). Deferring accuracy to "just
  after the boot cycle" would put it on the same disk as the warm-up — the exact
  collision #82 was built to remove. The deferral target has to be a later
  cycle, not the gap right after boot.

### (c) Chunk read-nullgame and accuracy-compute to ~300ms spans — most effort, and it measured backwards

I tried it. Keyset-chunking pass 3 over `idx_outcomes_settled_signal`, 2,000
rows per chunk:

| | rows | spans | worst span | total |
|---|---:|---:|---:|---:|
| NBA | 6,000 | 4 | **474ms** | 1,251ms |
| CFB | 6,000 | 4 | **458ms** | 1,214ms |

Against 75.7ms unchunked-and-pinned for the same 6,000 rows. The keyset
predicate plus the league filter defeats the covering scan and re-seeks per
chunk — the same shape as the `ORDER BY rowid` keyset finding from the
`situation_events` cleanup. It also misses the stated goal: 474ms > 300ms.

Passes 1 and 2 are single aggregates; chunking them means rewriting them as
incremental tallies in JS, trading 12 statements for ~38 and moving the
aggregation out of SQLite. And after (a) the worst single statement on the
fixture is 89ms, so there is nothing left to chunk.

What (c) would fix that (a) does not: it bounds the span on a **cold** disk,
where (a)'s 89ms could still be seconds. If that bound is wanted, the cheap
version is `forEachBounded` over the four leagues — yield between leagues, three
statements per span — not keyset pagination inside a statement.
`read-nullgame`'s chunking, meanwhile, is the `LIMIT 500` the plan is currently
ignoring; (a) is what makes it real.

### (d) Move accuracy-compute to the worker — highest risk, and it breaks a stated invariant

- The situations worker's handle is read-write, but the documented reason that is
  safe is that "nothing on the path it runs writes" (`situations-worker.ts:34`).
  `computeSourceAccuracy` does ~184 upserts into `pipeline.db`, and the sync does
  40 into `edge_setter.db`, which the worker does not open at all today.
- Measured effect on wall clock: **0ms.** A worker buys a second thread, not a
  second disk — the #81 boot proved that, where the warm-up running *in the
  worker* is what made `read-nullgame` block 6.66s on the main thread.
- It puts a **writer** in the worker. WAL keeps a long reader from blocking a
  writer, but two writers contend, and `busy_timeout` is the better-sqlite3
  default of 5,000ms (measured; `store.ts:58` sets only `journal_mode`). 5s is
  the entire health-check budget.
- It competes with what the worker exists for: builds are serialised by
  `exclusive()` behind `MAX_QUEUED_BUILDS = 4`, and `buildInWorker`'s 30s
  timeout terminates the thread — so an accuracy run in there could be killed
  mid-statement, or could push a situations build into that timeout.

What (d) uniquely buys: it is the only option that takes this work off the event
loop entirely, so even a 24s cold accuracy run could not trip the health check.
That is a real property. But it belongs after (a), applied to 353ms of work
rather than 3.9s, with a write path designed rather than inherited.

**Ranking:** (a) now. (b) next — cheap, scheduling only, nothing in the query
path. (c) only in its "yield between leagues" form, and only if cold-disk spans
still bite after (a). (d) not yet.

---

## 4. What the 30s timeout can kill: none of these steps

- The 30s timeout is `SITUATIONS_BUILD_TIMEOUT_MS` in `buildInWorker`
  (`situations-cache.ts:77`, `:327`). It is a `setTimeout` on the main thread
  armed against **one pending `{id, query}` situations-build message**, and what
  it does on expiry is terminate the worker. It has no relationship to
  `trackJob` spans, to settlement, or to anything outside that message.
- `trackJob` (`event-loop-monitor.ts:135`) has no timeout. It records start and
  end and attributes blocks; it cannot interrupt its callback.
- The in-flight SharedArrayBuffer publishing is installed **only in the
  worker**, deliberately: "installed only where it pays for itself — in the
  worker … and never on the main thread" (`sql-accounting.ts:207`). For a
  main-thread step there is no in-flight statement published, so there is
  nothing to read and nothing to act on.
- `loop-watchdog.ts` is report-only by construction — a parked thread writing
  "still blocked Ns" lines to fd 1 (`BLOCK_MS` 3,000; milestones 10s/30s/60s).
  It observes; it has no kill path.

Mechanically it could not be otherwise. All three steps are synchronous
better-sqlite3 calls on the main thread, and **a main-thread timer cannot fire
while the main thread is inside SQLite** — which is the whole reason #82 needed
shared memory to report on a wedged worker. Terminating the thread is the only
way to stop a synchronous SQLite call (`situations-cache.ts:329`), and the main
thread is not a thread that can be terminated.

So: had `accuracy-compute` taken 30s on the Oct 8 boot instead of 8.9s, nothing
in the process would have stopped it; Render's health check would have killed
the instance. The only way any of these steps becomes killable is to move it
into the worker — option (d) — and then the 30s build timeout would apply to it
by inheritance, which is itself an argument for giving accuracy its own budget
rather than borrowing the build's.

Nothing here is invisible, to be clear: all three steps complete, and all three
are logged by `trackJob`, which is why the Oct 8 report exists at all. What is
missing is not visibility. It is a kill switch, and on the main thread there
is none.
