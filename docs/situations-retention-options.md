# Retention and reclaim options for the `situation_*` tables — report, October 2026

**Report only. No code, no migration, no job, and nothing in this PR deletes a
row. `VACUUM` was NOT run against prod** — every number below comes from a
throwaway copy of a locally built fixture.

Prompted by the #81 boot report (2026-10-07 03:20 UTC):

| | prod |
|---|---:|
| `pipeline.db` | **5.02 GiB** |
| `page_size` | 4,096 |
| `page_count` | 1,316,531 |
| `freelist_count` | **467,430 (35.5%)** |
| live pages | 849,101 ≈ **3.24 GiB** |
| `situations` | ~7,100 |
| `situation_snapshots` | ~343,000 (≈48/situation) |
| `situation_events` | ~686,000 (≈97/situation) |
| `situation_state_history` | ~343,000 |
| `situation_confidence_history` | ~343,000 |

---

## 1. Where the bytes are

`dbstat` is compiled into this better-sqlite3 build (verified), so this is pages,
not estimates. Measured on the prod-row-count fixture (2,417 MiB total):

| | MiB | share |
|---|---:|---:|
| `situation_events` | 1,349 | **56%** |
| `situation_snapshots` | 445 | 18% |
| `situation_confidence_history` | 267 | 11% |
| `situation_state_history` | 147 | 6% |
| all `situation_*` indexes | 184 | 8% |

Payload vs keys, same fixture:

| Table | rows | JSON/text payload | ids + hashes |
|---|---:|---:|---:|
| `situation_events` | 688,700 | 1,051 MiB (`payload_json`) | 75 MiB |
| `situation_snapshots` | 340,800 | 361 MiB (`confidence_json` + `summary` + `evidence_event_ids_json`) | 19 MiB |
| `situation_confidence_history` | 340,800 | 214 MiB (`factor_breakdown_json` + `reasoning_json`) | 19 MiB |
| `situation_state_history` | 340,800 | 93 MiB (`metadata_json` + `transition_reason`) | 19 MiB |

Prod's live data is 3.24 GiB against this fixture's 2.36 GiB for the same row
counts, so prod rows average ~1.37× these. Scaling the shares:
`situation_events` ≈ 1.8 GiB, `situation_snapshots` ≈ 0.6 GiB,
`situation_confidence_history` ≈ 0.36 GiB, `situation_state_history` ≈ 0.2 GiB.

**`situation_events` is the only table where retention is worth real bytes, and
it is the one table where retention is not safe.** That is the whole shape of
this problem.

**Recommendation that costs nothing:** add the four `dbstat` sums to the boot
report (`db-diagnostics.ts`). It is one aggregate per table over a virtual table
that reads page headers — no `COUNT(*)`, no row reads — and it would replace
every scaled estimate above with prod's own numbers.

---

## 2. Two constraints that apply to all four tables

### Every one of them is append-only, by trigger

`ensureSituationSchema` installs `BEFORE UPDATE` and `BEFORE DELETE` triggers
that `RAISE(ABORT, '<table> is append-only')` on all eight `situation_*` tables
(16 triggers; verified on the fixture). A `DELETE` does not silently do nothing —
it throws.

So a retention job must drop the `_no_delete` trigger, delete, and restore it
**inside one transaction**, which is what `situation-bloat-cleanup.ts` already
does (`dropSituationCleanupDeleteGuards` / `restoreSituationCleanupDeleteGuards`,
plus a post-chunk `situationAppendOnlyGuardStatus` assertion). SQLite rolls DDL
back with everything else, so a crash mid-chunk restores the trigger along with
the rows.

### The existing cleanup deliberately refuses two of these tables

`SITUATION_CLEANUP_DELETABLE_TABLES` is exactly
`["situation_events", "situation_snapshots"]`, and the comment above it says why:

> Nothing else — in particular not `situation_confidence_history` /
> `situation_state_history`, which are the audit trail the cleanup exists to
> protect, nor `situation_founding_audit`, which is the record of what it did.

Pruning either history table therefore reverses a documented decision from
#74–#77, not just an omission. It needs Dom's sign-off as a decision, separately
from any measurement.

---

## 3. Per table: what the app reads, and what is safe

### `situation_snapshots` — ~0.6 GiB, 97.9% prunable, the best ratio

**Read on the request path:** the **latest row only.**
`listCanonicalSituations` and `listSituationsForMatching` join exactly one
snapshot per situation; `getLatestSituationSnapshot` (the engine, for
`previous_snapshot_hash`) reads one; `getCleanFoundingSituationConfidences`
reads the latest `confidence_score`; `situationsDataSignature` reads
`MAX(rowid)`; the insert path probes `replay_hash` for idempotency.

**Read anywhere else:** `listSituationSnapshots` returns all of a situation's
snapshots and is called from exactly one place —
`server/scripts/validate-canonical-situation-ingestion.ts`, a dev validation
script. No request path reads a non-latest snapshot.

**Customer-visible fields that come from it:** `summary`, `lifecycleState`,
`confidence`, `confidenceFactors`, `severity`, `escalationScore`,
`timingPressure`, `lastUpdatedAt`, and the snapshot `replayHash` — all from the
latest row, all unaffected by pruning older ones. `isUsableSituation` reads
`latest_snapshot.evidence_event_ids.length`, also from the latest row.

**Safe: keep the newest snapshot per situation.** 340,800 → 7,100 rows on the
fixture, 436 of 445 MiB; ~0.58 of ~0.6 GiB on prod.

**Three things that are not free about it:**

1. The surviving row's `previous_snapshot_hash` would point at a deleted row.
   Nothing in the app walks that chain — `verified_replay_hash` only requires
   that the latest snapshot has a `replay_hash` and that every event has one
   (`situations-comparable-corpus.ts:634`) — so no check breaks. But the lineage
   stops being walkable, which is an audit loss, not a no-op.
2. Each deleted snapshot has a `snapshot_created` event in `situation_events`
   announcing it. #74's plan treats that pair as indivisible for exactly this
   reason: deleting one side either orphans an event pointing at a missing
   snapshot or leaves a kept snapshot unannounced. A snapshot prune must take
   the paired events with it — which means it also moves `evidenceCount`
   (see `situation_events` below).
3. Replay-parity hashes computed over snapshot sequences would shift. The
   existing cleanup already accepts this for restatement snapshots; a
   keep-newest prune is strictly broader.

**Narrower option already built and merged:** the #74–#77 cleanup deletes only
snapshots that *restate* the previous kept snapshot's state. Less reclaim, no new
decision, and it has never been run against prod.

### `situation_state_history` — ~0.2 GiB, and "keep newest N" is NOT safe

**Two readers, with different appetites:**

- `stateHistoryPreview` (`situations-api.ts:395`) sorts DESC and takes **5**.
- `lifecyclePathFor` (`situations-comparable-corpus.ts:392`) reads the **whole**
  history, maps it to `new_state`, and passes it through `uniqueStates()`. That
  path feeds `comparableSummary` → `historicalCalibration` → customer-visible
  prose.

**So "keep the newest 5" would truncate the lifecycle path and change
`historicalCalibration` for every situation with more than 5 transitions —
which, at ~48 rows per situation, is all of them.**

**Safe and lossless for the path: collapse runs of consecutive rows with the
same `new_state`.** The path is deduped, so a run of 200 identical states
contributes exactly one entry whether 200 rows survive or one. The only thing
lost is the `transition_reason` text of the collapsed rows, and only the newest
5 rows' reasons are ever rendered.

**Not measured.** The fixture cycles `new_state` through eight values per
situation, so it contains no runs at all and cannot answer how much this
reclaims. What to measure on prod, read-only:

```sql
SELECT COUNT(*) AS rows_total,
       SUM(CASE WHEN new_state = prev_new_state THEN 1 ELSE 0 END) AS collapsible
FROM (SELECT situation_id, new_state,
             LAG(new_state) OVER (PARTITION BY situation_id
                                  ORDER BY created_at, history_id) AS prev_new_state
      FROM situation_state_history);
```

Given that the churn this table recorded was ESPN re-reporting one static injury
listing, `collapsible` is likely most of it — but "likely" is what measurement is
for. At 6% of the file it is also the least valuable of the four.

### `situation_confidence_history` — ~0.36 GiB, keep-newest-N works, but N > 5

**Readers:**

- `confidenceHistoryPreview`: newest **5**.
- `explainConfidenceFactors` (`situations-api.ts:407`): the newest **1**, for the
  "Confidence increased/decreased by N points" prose.
- `latestConfidenceDelta` (`situations-calibration.ts:30`): the newest **1**.
- `mapLatestEvidence` (`situations-api.ts:465`): builds a `Map` keyed on
  `event_id` over the **whole** history, then looks up the situation's **5 newest
  events**. Each hit supplies `confidenceDelta` and `validatorAgreement` on a
  customer-visible evidence row.

**That last one sets the floor.** The rows needed are not "the newest 5 by
`created_at`" but "the rows whose `event_id` is among the 5 newest events" — and
those usually coincide, but not necessarily: an event can be recorded with no
confidence row and a confidence row can carry an older `event_id`.

**Safe rule:** keep every row whose `event_id` is among the situation's 5 newest
events, **plus** the newest 5 by `created_at`. Pruning to exactly 5 by date
risks silently nulling `confidenceDelta` on a rendered evidence row — the
failure would be invisible in testing and visible to a customer.

**Reclaim at keep-20-per-situation:** 340,800 → 142,000 rows, ~156 of 267 MiB on
the fixture (~0.21 GiB on prod).

### `situation_events` — ~1.8 GiB, 56% of the file, and the one that is blocked

**Everything reads it, and two customer-visible *numbers* are derived from its
row count:**

| Reader | What it needs |
|---|---|
| `evidenceCount` (`situations-api.ts`) | `events.length` — **a displayed number** |
| `sourceCount` | distinct `source_id` across **all** events — **a displayed number** |
| `countFoundingRows(events)` | every `situation_created` row; feeds the corruption guard and so the *displayed confidence* |
| `mapLatestEvidence` | newest 5 |
| `signalIdsFor(events)` | lineage of every event → outcome linkage → calibration prose |
| `summarizeSituationEvidence` | distinct `(source_id, observed_at)` over evidentiary kinds |
| `verified_replay_hash` | every event must carry a `replay_hash` |
| `public-confirmation.ts:201` | the full event list, for detection-lead |
| `computeOperationalVisibilityScore` | `evidenceCount` → the boards' sort order |

**Any prune of this table moves `evidenceCount`, `sourceCount` and the board
ordering.** That is not a new finding: it is the open decision already recorded
against #74–#77, where the *narrow, dedup-only* cleanup was measured to move 6
response fields, 3 of them customer-visible prose, and has never been run
against prod for that reason. An age- or count-based retention policy is strictly
broader than that cleanup and so strictly more blocked.

**The honest recommendation here is not a retention policy.** It is one of:

- **Run the cleanup that already exists** (#74–#77, merged, never run), after
  Dom decides on the 6 fields. It targets exactly the ESPN churn that created
  this table's size and it moves the fewest fields of any option.
- **Shrink the payload rather than the row count.** `payload_json` is 1,051 of
  the table's 1,349 MiB and holds a whole `normalized_event` per row, including
  the raw payload. Dropping the raw payload from *stored* events after N days,
  while keeping the row, preserves `evidenceCount`, `sourceCount`,
  `replay_hash` and the founding count exactly — every number and every hash
  stays identical — and still reclaims most of the bytes. It would need
  `mapLatestEvidence` (newest 5) and `signalIdsFor` to keep working, so the
  fields they read must survive; the rest of the blob need not. **This is the
  option worth costing out, and it is not in the brief's list.**
- Nothing, and accept 5 GiB.

---

## 4. `VACUUM` and `auto_vacuum`

All measurements below are on a **copy** of the fixture, with 33.0% of its pages
freed first (204,403 of 618,693) to match prod's 35.5%. Deleting those rows
required dropping the 16 append-only triggers — the constraint from §2, in
practice.

### `PRAGMA auto_vacuum` is not available on this database. Measured.

```
before:  auto_vacuum=0
PRAGMA auto_vacuum = INCREMENTAL
after:   auto_vacuum=0            <-- silently ignored
PRAGMA incremental_vacuum(1000)   -> returned []; freelist unchanged at 204,403
```

`auto_vacuum` can only be changed on an empty database, or by a full `VACUUM`
afterwards. Confirmed from the other direction: after the `VACUUM` in the next
section, the same handle reported `auto_vacuum=2`. So:

- **`auto_vacuum` cannot reclaim prod's existing 467,430 free pages.** It is not
  an alternative to `VACUUM`; it is something you can only turn on *by* running
  one.
- Turning it on for the future costs a pointer map on every page and makes every
  commit that frees a page do work inline. For a database whose problem is a
  22-second read path, adding per-commit work to the ingestion writer is the
  wrong trade.

### `VACUUM` — 191.6s on 2.36 GiB, ~7 minutes extrapolated to prod

```
2.360 GiB, 618,693 pages, 204,403 free (33.0%)
  -> VACUUM: 191.6s
  -> 1.492 GiB, 390,998 pages, 0 free     (227,695 pages, 0.869 GiB reclaimed)
```

0.0123 GiB/s of source read. Prod's 5.02 GiB source → **~408s, about 7 minutes**,
on a laptop SSD. Render's disk is slower, so treat 7 minutes as a floor.

**Disk required:** `VACUUM` writes a complete new database, then replaces the
original. Peak is source + destination + journal ≈ **5.02 + 3.24 ≈ 8.3 GiB**, so
**at least ~3.3 GiB free beyond the current file**, and more for the WAL. The
disk was resized to 50 GB in #50; the current free figure is not in this
report's reach and must be read off Render before anyone runs this.

**How long writers are blocked: the entire 7 minutes.** `VACUUM` takes an
exclusive lock on the database for its whole duration — WAL does not help, since
`VACUUM` checkpoints and locks. And nothing in this process survives that:

- **On the main thread it is fatal.** better-sqlite3 is synchronous, so a 7-minute
  `VACUUM` is a 7-minute event-loop block. Render kills the instance after two
  consecutive 5s health-check failures — the exact failure mode of Oct 5 and
  Oct 7, 80× over.
- **From the situations worker it is also fatal, for a different reason.** The
  worker's own loop blocking is harmless, but the exclusive lock blocks the main
  thread's ingestion writes, and those are synchronous too. No `busy_timeout` is
  set anywhere in this repo, so better-sqlite3's 5,000 ms default applies: every
  ingestion write would block the main thread for 5s and then throw
  `SQLITE_BUSY`. 5s is the health-check budget.

**So `VACUUM` is not runnable from inside this service, in any thread, at this
size.** It is a maintenance operation on a stopped service.

### `VACUUM INTO` — 120.3s, and the only in-service option worth considering

```
2.360 GiB -> VACUUM INTO 'copy.db': 120.3s -> 1.492 GiB
peak disk during it: 3.852 GiB (source and destination both present)
```

0.0196 GiB/s — faster than in-place `VACUUM` because it only writes. Prod: **~256s,
about 4.5 minutes**, peak disk ≈ **5.02 + 3.24 ≈ 8.3 GiB**, same as `VACUUM`.

`VACUUM INTO` holds a **read** transaction on the source, not an exclusive lock.
In WAL mode a long reader does not block writers, so ingestion keeps running —
**but** it pins the WAL snapshot for the whole 4.5 minutes, and this repo sets no
`journal_size_limit` and only checkpoints inside the bloat-cleanup job. Four and
a half minutes of un-checkpointable ingestion writes is a WAL of unknown size on
a disk that has already filled once (Sept 2026, which silently relocated both
DBs to `/tmp`).

A viable sequence, for a maintenance window and not for a cron job:

1. Read free disk on the Render volume. Require ≥ 2× the current `pipeline.db`.
2. `VACUUM INTO '/var/data/pipeline.vacuumed.db'` — from the worker thread, so
   the 4.5 minutes do not block `/healthz`.
3. Verify the copy: `PRAGMA integrity_check`, row counts per table against the
   source, `situationAppendOnlyGuardStatus`.
4. Stop the service. Swap the files. Start it.
5. `wal_checkpoint(TRUNCATE)` on boot.

Step 4 is why this is a window, not an operation: swapping a file under a live
handle is how the Sept 2026 `/tmp` incident produced two-day-old empty databases
that looked like history.

### What reclaiming 35.5% would actually buy

Nothing on the read path, directly. A free page is not read. `VACUUM` would take
the file from 5.02 to ~3.24 GiB, which matters for three reasons and no others:

1. **Locality.** 3.24 GiB of live data currently scattered through 1.3M pages
   becomes 849k contiguous pages. The dominant cost on the situations read path
   is random fat-row fetches (see
   [`docs/situations-latest-snapshot-read.md`](./situations-latest-snapshot-read.md),
   §2), so this is the one that could plausibly move the 5.4s. **Unmeasured**, and
   not measurable on this fixture: its post-`VACUUM` state is also its warm
   state.
2. **Disk headroom**, against a volume that has filled before.
3. **Backup and restore time.**

It does **not** reduce row counts, so it does not touch the 1,438 fat-row
fetches per board request. Retention and `VACUUM` are complementary and neither
substitutes for the query rewrite.

---

## 5. Ranked, with the cost of being wrong

| Option | Reclaim | Moves a customer-visible field? | Blocked on |
|---|---:|---|---|
| `dbstat` in the boot report | 0 | no | nothing — do it |
| Keep newest snapshot per situation | ~0.58 GiB | no (but takes paired events, which do) | the paired-event question |
| Strip `payload_json` raw payload after N days | ~1 GiB+ | **no** — counts and hashes unchanged | costing out which fields must survive |
| Run the merged #74–#77 cleanup | ~1.1 GiB (its own dry-run estimate) | yes — 6 fields, 3 prose | **Dom's decision, open since Oct** |
| `confidence_history` keep-20 | ~0.21 GiB | no, if the `event_id` floor is respected | reversing the #74 "audit trail" decision |
| `state_history` collapse same-state runs | unmeasured, ≤0.2 GiB | no | measurement + same reversal |
| `VACUUM INTO` + file swap | 1.78 GiB of file | no | a maintenance window and a disk check |
| In-place `VACUUM` from the service | — | — | **not viable at any size — do not** |
| `PRAGMA auto_vacuum` | **0** | — | **not available on a populated DB** |

The two biggest wins are the two that are blocked on a decision rather than on
engineering: the `situation_events` churn cleanup that has been merged and unrun
since early October, and the payload-stripping variant of it that nobody has
costed. Everything in the "safe" column adds up to under a gigabyte.
