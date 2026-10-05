# Request-path query audit — October 2026

Audit of the SQL every request-side handler runs, prompted by the cold-boot
numbers from prod on **2026-10-05**, just after the #77 deploy:

| Route | Prod, cold |
|---|---|
| `GET /api/v2/situations` | 30–46s |
| `GET /api/v2/signals` | 14.1s (on a 304) |
| `GET /api/stats/track-record` | 3.1s |
| `GET /api/leaderboard` | 1.25s |

## Method

`better-sqlite3` shares one `Statement` class across every `Database` handle, so
the audit hooks that prototype plus `Database#prepare` / `#exec` / `#pragma`
once and counts and times every statement the process runs — including the
schema DDL that a prepare-only hook cannot see. Each handler's data path was
then driven against a **prod-shaped fixture** and every distinct statement
`EXPLAIN QUERY PLAN`-ed.

Fixture: `live_signals` 150,000 rows with real-size `sources` / `breakdown` /
`raw_event_ids` JSON (722MB `pipeline.db`), `outcomes` 75,000, `situations`
3,700 at post-cleanup event depth (`situation_events` 29,600,
`situation_snapshots` 22,200, both history tables 18,500), `games` 8,000,
`settled_outcomes` 75,000 with source JSON (41MB `edge_setter.db`).

**No cold-disk timing claim is made from these numbers.** They are warm,
in-process, single-machine measurements, reported so the before and after of a
change are comparable to each other. The load-bearing results are the plans and
the statement counts.

**Why the plans are prod's plans.** Nothing in this repo runs `ANALYZE`, so
neither prod nor the fixture has a `sqlite_stat1` table and the planner works
from its built-in estimates. Plan selection therefore does not depend on the
fixture's row counts.

## Statement counts per request

| Request | Statements before | after | SQL ms before | after |
|---|---:|---:|---:|---:|
| `GET /api/v2/signals?limit=50` | 92 | **4** | 1,756 | **3.3** |
| `GET /api/v2/signals?band=Elite&limit=50` (over-fetches 500) | 2 | 2 | 774 | **17.2** |
| `GET /api/v2/situations?league=NFL&limit=100` (cold caches) | 30,644 | **154** | 31,649 | **390** |
| `GET /api/v2/situations?league=NFL&limit=100` (caches warm) | 8,616 | **88** | 5,429 | **59** |
| `GET /api/v2/situations?limit=250&order_by=operational_visibility_score` | 43,544 | **158** | 39,897 | **478** |
| `GET /api/stats/track-record?league=NFL` | 4 | 4 | 307 | **30.6** |
| `GET /api/signals?league=NFL` | 180 | **4** | 492 | 464 |
| `GET /api/v2/games?league=NFL` | 2 | 2 | 15 | 17 |
| `GET /api/v2/games` | 2 | 2 | 77 | 64 |
| `GET /api/sources` | 2 | 2 | 0.2 | 0.2 |
| `GET /api/leaderboard` | 4 | 4 | 166 | 168 |

"Statements" counts a `prepare` separately from the `run`/`get`/`all` that
follows it, and counts each `exec`/`pragma`, because that is the work the
process actually does. A route that prepares the same string 4,800 times pays
4,800 prepares.

The `/api/v2/situations` count is now a function of the number of id **chunks**,
not the number of situations: `?limit=250` costs 158 statements against
`?limit=100`'s 154.

## Statement inventory

### `GET /api/v2/signals` — `pipeline/routes.ts` → `getLiveSignals` + `applyReadTimeUrgency`

| × | Statement | Plan before | Plan after |
|---:|---|---|---|
| 1 | `SELECT * FROM live_signals WHERE is_archived = 0 [AND league=?] [AND created_at>=?] ORDER BY score DESC, created_at DESC LIMIT ?` | `SCAN live_signals \| USE TEMP B-TREE FOR ORDER BY` | `SEARCH live_signals USING INDEX idx_live_signals_active_score (is_archived=?)` |
| 45 → 1 | `SELECT * FROM games WHERE id=?` → batched `… WHERE id IN (…)` | `SEARCH games USING INDEX sqlite_autoindex_games_1 (id=?)` | same, once |

Every row of `live_signals` — 150k, each carrying ~1.2KB of breakdown JSON — was
read off disk and the whole unarchived set sorted, to return 50 rows. 742ms
unfiltered, 221ms with `?league=`.

`applyReadTimeUrgency` called `getGame()` once per distinct `game_id`: 45
statements at `limit=50`, up to 200 at the route's `limit=200` ceiling. Each one
is a cheap primary-key seek, so this is a count problem, not a plan problem.

### `GET /api/v2/situations` — `situations-api.listCanonicalSituationApiResponses`

Per 100-situation response, before:

| × | Statement | Plan |
|---:|---|---|
| 4,800 | `SELECT hit, clv FROM outcomes WHERE signal_id = ? ORDER BY created_at DESC` | `SCAN outcomes \| USE TEMP B-TREE FOR ORDER BY` |
| 1,503 | `ensureSituationSchema` — one `exec` of the full CREATE TABLE/INDEX script, one `PRAGMA table_info(situations)`, eight `exec`s of the append-only trigger pairs, one `exec` for `situation_game_resolution` | n/a (DDL) |
| 600 | `SELECT * FROM situation_events WHERE situation_id = ? ORDER BY recorded_at ASC, event_id ASC` | `SEARCH situation_events USING INDEX idx_situation_events_situation` |
| 600 | `SELECT * FROM situation_state_history WHERE situation_id = ?…` | `SEARCH … USING INDEX idx_situation_state_history_situation` |
| 100 | `SELECT * FROM situation_confidence_history WHERE situation_id = ?…` | `SEARCH … USING INDEX idx_situation_confidence_history_situation` |
| 100 | `SELECT … FROM situation_founding_audit WHERE situation_id = ?` | `SEARCH … USING INDEX sqlite_autoindex_situation_founding_audit_1` |
| 100 | `SELECT * FROM situation_public_confirmations WHERE situation_id = ?` | `SEARCH … USING INDEX sqlite_autoindex_situation_public_confirmations_1` |
| 2 | `listCanonicalSituations` (once for the response, once for the corpus) | `SCAN s` / `SEARCH s USING idx_situations_league_type` + snapshot/resolution/game seeks + `USE TEMP B-TREE FOR ORDER BY` |
| 1 | `getCleanFoundingSituationConfidences` | `SCAN s` + three correlated scalar subqueries, each an indexed seek |
| 1 | `SELECT MAX(rowid) AS m FROM situation_snapshots` | `SEARCH situation_snapshots` |

**Almost every plan here was already fine.** The 30–46s was the count: good
statements run thousands of times. Two fan-outs produced it —

1. **The per-situation reads.** Five tables read once per situation, in both the
   response mapper and the comparable-corpus build. Each of those functions
   opens with `ensureSituationSchema`, a ~12-call DDL script, which is where the
   1,503 repetitions come from.
2. **The per-signal outcome lookups.** Both the corpus and the per-response
   comparable scoring resolve outcome linkage by signal id, one statement per
   id: 4,000 from the corpus and 800 from the response path.

After: five batched readers keyed on the whole id set (one statement per 900
ids, `situation_id ASC` leading the `ORDER BY` so the existing
`(situation_id, …)` indexes still serve the sort) and one corpus-wide outcome
prefetch. `ensureSituationSchema` drops from 1,503 calls to 10 — the remaining
120 statements are those 10 DDL scripts, which is now the bulk of the 154 and
the obvious next thing to cache if it ever matters.

### `GET /api/stats/track-record` — `store.getTrackRecord`

Two aggregates, both before:

```
SCAN o | SEARCH s USING INDEX sqlite_autoindex_live_signals_1 (id=?)
```

the by-type one also carrying `USE TEMP B-TREE FOR GROUP BY | USE TEMP B-TREE FOR ORDER BY`.

The scan of 75k outcomes looks like the cost, and it is not. The cost is the
inner probe: for every outcome row, a primary-key lookup into `live_signals`
that pulls the whole row — headline, body, `sources`, `breakdown` — off disk to
read `league` and `signal_type`. Make both sides index-only and it collapses:

```
SCAN o USING COVERING INDEX idx_outcomes_settled_signal
  | SEARCH s USING COVERING INDEX idx_live_signals_id_league_type (id=? AND league=?)
```

148.5ms → **7.7ms** overall, 140.2ms → 7.9ms by type. Either index alone is
worth only ~10% (144.9 → 129.7ms); the win needs both, which is why a first
pass at this — a plain partial index on `signal_id` — read as a dead end.

The remaining temp b-tree groups on a column of the joined table; no index
removes it.

### `GET /api/signals`, `GET /api/signal` — `server/routes.ts`

| × | Statement | Plan | Change |
|---:|---|---|---|
| 1 | `SELECT * FROM live_signals WHERE league=? ORDER BY created_at DESC LIMIT 100` | `SEARCH live_signals USING INDEX idx_live_signals_league (league=?) \| USE TEMP B-TREE FOR ORDER BY` | **unchanged by choice** — below |
| 1 | `SELECT * FROM live_signals ORDER BY created_at DESC LIMIT 100` | `SCAN live_signals USING INDEX idx_live_signals_created_at` | already fine |
| 89 → 1 | `SELECT * FROM games WHERE id=?` (via `applyReadTimeUrgency`) | PK seek | batched |

The two routes carried byte-identical handler bodies; they now share one.

The `?league=` temp b-tree is the one `SCAN`/`TEMP B-TREE` in this audit that was
deliberately left alone. `live_signals(league, created_at DESC)` fixes it —
454ms → 1.4ms — and the plan-regression sweep then found it also re-plans
`findExistingSignal`, the matcher's dedup lookup run once per raw event in the
ingestion cycle, off its three-column equality seek and onto a league-slice
walk:

```
before: SEARCH live_signals USING INDEX idx_live_signals_type_archived_game
          (signal_type=? AND is_archived=? AND game_id=?)
          | USE TEMP B-TREE FOR ORDER BY                                      0.0ms
after:  SEARCH live_signals USING INDEX idx_live_signals_league_created
          (league=? AND created_at>?)                                       251.4ms
```

251ms per raw event on the ingestion hot path, to fix a 454ms query behind a
parameter no caller passes. Not shipped. Tests assert both halves of that
decision — that the index is absent, and that `findExistingSignal` still has its
seek — so the reason lives in CI rather than only in a comment.

### `GET /api/v2/games` — `store.getGames`

| Statement | Plan before | Plan after |
|---|---|---|
| `SELECT * FROM games WHERE league=? ORDER BY game_time ASC` | `SCAN games \| USE TEMP B-TREE FOR ORDER BY` | `SEARCH games USING INDEX idx_games_league_time (league=?)` |
| `SELECT * FROM games ORDER BY game_time ASC` | `SCAN games \| USE TEMP B-TREE FOR ORDER BY` | unchanged — see "Measured and rejected" |

### `GET /api/sources`, `GET /api/leaderboard` — `server/storage.ts` (`edge_setter.db`)

| × | Statement | Plan | ms |
|---:|---|---|---:|
| 1 | drizzle `select … from sources order by created_at desc` | `SCAN sources \| USE TEMP B-TREE FOR ORDER BY` | 0.2 |
| 1 | `SELECT ss.*, COALESCE(ss.source_name, s.name) … FROM source_scores ss LEFT JOIN sources s … ORDER BY ss.overall_accuracy DESC` | `SCAN ss \| SEARCH s USING INDEX sqlite_autoindex_sources_1 (id=?) LEFT-JOIN \| USE TEMP B-TREE FOR ORDER BY` | 0.4 |
| 1 | `SELECT json_extract(src.value,'$.name') …, COUNT(*) FROM settled_outcomes, json_each(sources) AS src WHERE hit IS NOT NULL AND excluded_stale = 0 GROUP BY …` | `SCAN settled_outcomes \| SCAN src VIRTUAL TABLE INDEX 1: \| USE TEMP B-TREE FOR GROUP BY` | 164 |

**Nothing shipped here.** The first two scan 40 rows. The third is the whole
1.25s prod number and does have a candidate index — measured below — but the
leaderboard's accuracy figures are themselves under an open suppress-or-reword
decision, so making the current numbers 1.6x faster to compute is premature.

## Changes

**Indexes** — added only where the plan showed a `SCAN` of a base table or a
`TEMP B-TREE`, each with a plan test asserting the exact string production
prepares:

| Index | Fixes | Measured | One-time build |
|---|---|---|---|
| `idx_live_signals_active_score (is_archived, score DESC, created_at DESC)` | the delivery feed | 742ms → 3.1ms unfiltered, 221ms → 2.8ms with `?league=` | 4.7s, +5.4MB |
| `idx_outcomes_settled_signal (signal_id, hit, clv) WHERE hit IS NOT NULL AND excluded_stale = 0` | track-record, outcomes side | 148.5ms → 7.7ms (with the next one) | 34ms |
| `idx_live_signals_id_league_type (id, league, signal_type)` | track-record, join probe | as above | 3.4s, +5MB |
| `idx_games_league_time (league, game_time)` | `?league=` games | plan: scan+sort → seek | 15ms |

Build costs are on the cold 722MB fixture and are read-bound — the covering
indexes touch columns spread across every table page. On every boot after the
first, `IF NOT EXISTS` is 0ms. Writes cost ~7% more with the `live_signals`
indexes present (5,000 inserts: 82ms → 88ms, best of two runs on separate fresh
copies). These are created in `initSchema`, which `getPipelineDb` runs before
handing out the handle, so they exist before any read can reach them.

**Batched reads**, replacing per-request fan-outs above ~50 statements:
`getGamesByIds`, `listSituationEventsForIds`,
`listSituationStateHistoryForIds`, `listSituationConfidenceHistoryForIds`,
`getSituationFoundingAuditForIds`, `getSituationPublicConfirmationsForIds`,
`outcomesForSignalIdsBatched`. All chunk at 900 bind parameters
(`SQLITE_MAX_VARIABLE_NUMBER` is 32,766 on the current build but 999 on older
SQLite, and nothing pins which build a deploy links against).

**Two plan pins**, because an index added for one query re-plans another:

- `getLiveSignals` uses `INDEXED BY idx_live_signals_active_score`. The planner
  picks that index on its own today, so this is armor — and this audit is the
  argument for it, having found two separate planner flips caused by adding an
  index for an unrelated query. It makes the index load-bearing: drop or rename
  it and these reads raise "no such index" rather than quietly returning to
  742ms, which is the better of the two failures.
- `getTrackRecord` uses `CROSS JOIN` (an inner join whose loop order the planner
  may not reorder) to keep outcomes outer. Measured, best of three each:

  | Indexes present | plain `JOIN` | `CROSS JOIN` |
  |---|---:|---:|
  | main, as-is | 139ms, `SCAN o \| SEARCH s (pk)` | 140ms, same |
  | main + #78 | **275ms**, `SEARCH s (idx_live_signals_league) \| SEARCH o` | 155ms, `SCAN o \| SEARCH s (pk)` |
  | this PR + #78 | **272ms**, loops inverted, covering indexes ignored | 7.7ms, both sides covering |

  So **#78 doubles this query's cost on its own**, driving from main's
  pre-existing `idx_live_signals_league`. Nothing in this PR causes that; the
  pin is what makes the two compose, and without it the covering indexes above
  would be ignored in exactly the case they were added for.

**Per-request SQL accounting** (`server/sql-accounting.ts`) appends
`sql=<statements>/<ms>` to the existing `[express]` request line for the audited
routes. A slow request now says which kind of slow it is:

```
[express] GET /api/v2/situations 200 in 1738ms sql=154/1446.2ms
[express] GET /api/v2/games 200 in 50ms sql=2/44.6ms
[express] GET /healthz 404 in 2ms
```

A single global counter is correct here because `better-sqlite3` is synchronous
and every accounted route is a synchronous handler, so the delta is that
request's own work. The route set is an explicit allowlist, not every `/api`
path, for exactly that reason. `SQL_ACCOUNTING=0` skips installation.

**No response shapes changed.** The test suite asserts the batched path and the
per-id path produce deep-equal output on the same fixture — whole
`/api/v2/situations` responses, comparable-corpus `corpus_id` hashes (so replay
hashes are stable), urgency labels, and every batched reader against its
single-id equivalent including the missing-id case.

## Measured and rejected

- **`live_signals(league, created_at DESC)`** — fixes `/api/signals?league=`
  (454ms → 1.4ms) and breaks `findExistingSignal` on the ingestion hot path
  (0.0ms → 251ms). Also re-plans the delivery feed's `league + since` shape onto
  itself with a temp b-tree (2.4ms → 191ms), the shape `distribution-draft.ts`
  runs every cycle. See above.
- **`idx_games_time (game_time)`** — removes the unfiltered `getGames()` temp
  b-tree, 65ms → 54ms on 8,000 games. The cost there is materializing every row,
  not the sort, and no caller passes the unfiltered form (every league board
  passes `?league=`). Not worth a third index on a table the ingestion cycle
  upserts into.
- **`idx_settled_outcomes_verified`** —
  `ON settled_outcomes(sources) WHERE hit IS NOT NULL AND excluded_stale = 0`,
  partial and covering, for the leaderboard's verified counts. 164ms → 95ms, and
  the plan is still a `SCAN` (of the index) with the `GROUP BY` temp b-tree
  intact, because it groups on a `json_extract` expression. Costs +9MB on a 41MB
  database and duplicates the whole `sources` JSON column. 1.6x for that, on
  numbers pending a suppression decision, is not worth it yet.

The plan-regression sweep behind these calls explains all 25 statements in the
codebase that touch `live_signals` / `outcomes` / `games`, on main's index set
and on the shipped set plus #78's, and reports every plan that changed. With the
shipped set, six changed and all six improved; nothing got slower by more than
20%.

## Not in scope, found along the way

- **`ensureSituationSchema` still re-runs its full DDL script per call** — 10
  calls and 120 statements of the remaining 154. Harmless now; it was 1,503.
  PR #78 already caches the `PRAGMA table_info` part of it.
- **`outcomes` has no index on `signal_id`** — PR #78's, and already created by
  hand on prod. The batched read above removes 4,794 of the 4,800 calls; the
  remaining chunked statements go from ~110ms to ~2ms once that index lands.
  Nothing here adds it.
- **`getLiveSignals({ includeArchived: true })`** has no `is_archived` term to
  seek on, so it cannot use the new index and stays at
  `SEARCH idx_live_signals_league | USE TEMP B-TREE FOR ORDER BY` (231ms). Only
  tests call it.
- **`listCanonicalSituations` keeps a `TEMP B-TREE FOR ORDER BY`** — it orders by
  `COALESCE(latest.created_at, s.created_at)`, an expression over a joined
  table, which no index can supply. 3,700 situations, 21–36ms.
- **The first boot after this deploys pays ~8.2s of index building** inside
  `initSchema`, on the first `getPipelineDb()`. That call is
  `runSettlementBacklogMigration`'s first line, reached synchronously from the
  `void trackJob(…)` in `server/index.ts` — an `async` body runs up to its first
  `await`, and `trackJob` evaluates `fn()` before suspending. So it lands
  **before `httpServer.listen`**: the first deploy binds its port ~8s later than
  it would have, and no live instance's event loop is blocked. Every boot after
  that is 0ms, because the index files persist on the Render disk.
