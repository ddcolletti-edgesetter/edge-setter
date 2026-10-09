# CFB games never settle, because two feeds spell the same team differently

Phase 1: canonicalise inside `findGameByTeams`. No write path, no id, no replay
hash, no situations change, and `shortCode()` in the odds adapter is untouched.

## The fault

A `games` row for CFB is written in one vocabulary and read back in another.

**Write** — `server/pipeline/adapters/the-odds-api.ts` inserts every game as

```ts
home_team: shortCode(ag.home_team)      // ag.home_team is The Odds API's team name
...
function shortCode(name: string): string {
  return NAME_TO_CODE[name] ?? name.split(" ").pop()?.slice(0, 3).toUpperCase() ?? ...
}
```

`NAME_TO_CODE` has 48 CFB entries. For every other school the fallback branch
runs, and it reads the **last word** — the mascot. `Memphis Tigers` is stored as
`TIG`. `Houston Cougars` as `COU`. `SMU Mustangs` as `MUS`.

**Read** — `server/pipeline/adapters/espn-cfb.ts` resolves ESPN's completed
scoreboard onto that row with ESPN's own spelling: `MEM`, `HOU`, `SMU`.

`findGameByTeams` requires `home_team = ? AND away_team = ? AND date(...)`, so
**both** sides have to agree. Nothing resolves, `updateGameFinal` is never
called, the game stays `status != 'final'`, `getSettleable()` never returns it,
and its signals never settle. This is the "Fault D candidate" that
`server/scripts/backfill-situation-game-resolution.ts` logs and declines to fix.

### Measured

Against ESPN's own 2025 FBS data and the real 2025 schedule
(`groups=80`, regular-season weeks 1–15):

| | |
|---|---|
| FBS teams | 136 |
| covered by `NAME_TO_CODE` | 48 |
| of those 48, stored code ≠ ESPN's abbreviation | **4** — `TAMU`/`TA&M`, `NCST`/`NCSU`, `BSU`/`BOIS`, `AFA`/`AF` |
| the other 88, stored as a mascot token | ESPN's abbreviation matches **1** of them (`ILL`, by coincidence) |
| **teams whose two spellings agree** | **45 of 136** |
| games weeks 1–15 | 902, across 64 dates |
| **games the exact-token lookup can resolve** | **141 / 902 — 15.6%** |
| games resolvable with the alias + the uniqueness guard | **893 / 902 — 99.0%** |
| refused as ambiguous | 9, all of them conference-championship placeholders ESPN sends as `TBD @ TBD` |

So 84% of CFB games could never go final. The remaining 1% is not a real
collision; it is ESPN's own placeholder rows.

## The fix

### Which way the translation runs, and why

`findGameByTeams` is handed ESPN's side and has to produce the stored token.
That direction is deterministic **only from the full team name**: `shortCode`'s
fallback is a pure function of the name's last word, so a name forward-
translates to exactly one stored token. An abbreviation does not — `MEM` carries
nothing that could produce `TIG`, and guessing a school from three letters is
the mistake this whole fault is made of.

So `espn-cfb.ts` now passes `home.team.displayName ?? home.team.abbreviation`.
`displayName` is present on every competitor the scoreboard returns (verified
against the live endpoint); the abbreviation stays as the fallback, and it still
resolves, because ESPN's abbreviation is a key into ESPN's own team record.

### The generated map

`npm run generate:cfb-logos` now writes two files from one ESPN run, so they
cannot drift:

- `client/src/lib/cfbTeamLogos.generated.ts` — unchanged, abbreviation → logo id
- `server/pipeline/cfb-espn-teams.generated.ts` — **new**: ESPN team id →
  `{ name, abbr, stored, fbs }`, plus a lookup-key map and the ambiguity list

Identity is ESPN's **numeric team id**, never an abbreviation, which is what
makes `{AF, AFA}` and `{BOIS, BSU}` resolve to one school instead of two.

`stored` is derived in two branches, matching `shortCode` exactly: the mapped
code where the ESPN display name is a `NAME_TO_CODE` key, the mascot token
otherwise. The second branch is only sound if the two feeds agree on the mascot
word, so **the generator refuses to write the file unless they agree on all 48
names it can check** — they do, 48/48. That agreement is the only evidence the
derivation is right for the 88 schools no odds name is on record for; see
*Not measured* below.

Lookup keys are assigned in two precedence tiers, and the order is load-bearing:

1. **identity** — every abbreviation spelling the maps carry, plus each team's
   display name, location, short name, slug and mascot, normalised
2. **derived** — the stored token, but only for a key tier 1 left alone

ESPN's abbreviation for Florida is `FLA`, which is also the mascot token Kent
State's Golden Flashes and Liberty's Flames both derive to. Letting tier 2
compete drops `FLA` as contested and leaves Florida unresolvable from ESPN's own
spelling — which is exactly what the first draft of this change did, and what
the "resolves all 136 from ESPN's own abbreviation" test caught.

Within a tier, a key two schools both claim is dropped rather than pointed at
one of them (37 such keys, listed in `CFB_DROPPED_KEYS`).

### The uniqueness guard

16 stored tokens are shared by two or more schools:

```
BEA  Cincinnati Bearcats / Missouri State Bears / Oregon State Beavers / Sam Houston Bearkats
BOB  Ohio Bobcats / Texas State Bobcats
BUL  Buffalo Bulls / Fresno State Bulldogs / Louisiana Tech Bulldogs / South Florida Bulls
COU  BYU Cougars / Houston Cougars / Washington State Cougars
EAG  Boston College / Eastern Michigan / Georgia Southern / Southern Miss
FLA  Kent State Golden Flashes / Liberty Flames
GAM  Jacksonville State / South Carolina Gamecocks
HUR  Miami Hurricanes / Tulsa Golden Hurricane
HUS  Northern Illinois Huskies / UConn Huskies
KNI  Rutgers Scarlet Knights / UCF Knights
MIN  Massachusetts Minutemen / UTEP Miners
OWL  Florida Atlantic / Kennesaw State / Rice / Temple Owls
PAN  Florida International / Georgia State Panthers
RAI  Middle Tennessee Blue Raiders / Texas Tech Red Raiders
WAR  Hawai'i Rainbow Warriors / UL Monroe Warhawks
WIL  Kentucky Wildcats / Northwestern Wildcats
```

**The date plus both teams is not a proof.** Measured: all **256 of 256**
ordered token pairs drawn from those 16 tokens are reachable by more than one
FBS matchup — `(BUL, COU)` alone describes twelve. What saves it in practice is
the schedule: across all 902 games on 64 dates, **no two real matchups on one
date shared a token pair**. But "no instance this season" is not "cannot
happen", and the failure mode is silent — the wrong game's final score settles
real customer-facing outcomes.

So the guard is structural, not probabilistic. The widened lookup runs with
`LIMIT 3` instead of `LIMIT 1`, and if it lands on more than one distinct
`games` row it is **refused and logged**, never resolved to the newest. The test
`refuses a widened lookup two same-date matchups both satisfy` constructs
exactly that case and asserts the newest row is not returned.

The exact-token lookup runs first and is byte-identical to before, so every
league other than CFB, and every CFB game that already matched, takes the path
it always took.

## The first cycle after this deploys

### How far "retroactive" actually reaches

Narrower than it sounds, in two ways.

1. **`fetchCFBFinalScores` reads `GET /scoreboard?groups=80` with no week or
   date parameter — the current week only.** Completed games from earlier weeks
   are not in that response, so they are not promoted to final by this change at
   all. The retroactive reach of a single deploy is one ESPN week, and it drains
   one week per week after that. `getCompletedUnfinalGames` exists but nothing
   calls it; a real historical sweep is `espn-cfb-historical.ts`, a manual CLI.

2. **Null-game signals already parked are not coming back.** The parking is
   `live_signals.settlement_expired = 1`, set by `expireNullGameSignal` when a
   signal's team found no final game inside the league window (CFB: 8 days).
   `UNSETTLED_NULLGAME_SQL` filters `settlement_expired = 0`, so a parked signal
   is never scanned again — it will not settle when CFB games finally start
   going final, and `runSettlementBacklogMigration` won't revisit it either
   because PR #69 persists a completion marker that short-circuits the whole
   body on later boots. Unparking them is a deliberate decision, not a
   side effect, and it is not in this PR.

   (That parking came from **#67** "Fix/settlement stale matches" plus **#69**,
   not from #77 — #77 is `situation_events` plan reads and has no settlement
   rows in it.)

   Signals that *do* carry a `game_id` are unaffected: `getSettleable()` does not
   filter on `settlement_expired`, so a CFB signal of any age settles as soon as
   its game goes final. That is where the retroactive win lands.

### Measured on a fixture

A full Saturday: 65 completed FBS games, 2 betting-relevant signals each,
`games` rows seeded in the odds vocabulary, `global fetch` stubbed so the real
`fetchCFBFinalScores` → `findGameByTeams` path is what runs.

| | |
|---|---|
| resolved, exact-token only | 10 / 65 |
| resolved with the alias | 65 / 65 — `direct=0 alias=65 ambiguous=0 unmatched=0` |
| signals settled, uncapped | 130 / 130 in one cycle |
| cycle wall clock, uncapped | ~306–426ms |

Spans, sampler running, best of five:

**These are strongly machine-dependent, so both machines are reported:**

| | `settlement:settle-linked` wall | worst attributed block |
|---|---|---|
| GitHub runner, capped at 25 | **19ms** | 0–17ms |
| GitHub runner, uncapped (65 games) | **44ms** | 0ms |
| dev laptop, capped at 25 | **~64ms** | 57–153ms |
| dev laptop, uncapped (65 games) | **~249ms** | 200–309ms |

On the runner the whole uncapped cycle finishes inside the sampler's 10ms
attribution threshold, so nothing is charged as a block at all. On the laptop
the uncapped run pins every span to `LOOP_SPAN_BUDGET_MS` (200ms), which is
`forEachBounded` doing its job rather than failing.

**So the uncapped batch is not a demonstrated loop hazard.** The honest reading
is that this work costs tens of milliseconds on a fast core and a couple of
hundred on a slow or loaded one. Render's starter is 0.5 CPU — slower than
either machine measured here, and **not measured**. The cap is justified by
total cycle wall clock and by not handing the accuracy recompute a season in one
batch, not by a loop block anyone has observed.

### The cap

`SETTLEMENT_MAX_NEW_FINALS_PER_CYCLE`, **default 25**, bounds how many games are
promoted from non-final to final per settlement cycle.

Why 25 and not 65: the cap is not protecting the event loop — `forEachBounded`
already does that, and on a GitHub runner the uncapped cycle never blocks at
all. It keeps one `ingest:settlement` span well inside the 15-minute cycle on a
0.5-CPU Render starter, and stops the hourly accuracy recompute being handed a
season in one batch. 25 is where `settle-linked` drops to roughly 40% of its
uncapped wall clock on both machines measured, while still draining a 130-game
ESPN week in 6 cycles, about 90 minutes. It is one env var away from any other
number, and if prod logs show the span is comfortable it should be raised.

Nothing is dropped: ESPN returns the same completed game every cycle, so the
next cycle takes the next slice, and the remainder is logged:

```
[settlement] New finals capped at 25 this cycle; 40 completed game(s) still waiting (SETTLEMENT_MAX_NEW_FINALS_PER_CYCLE)
```

## Sizing the win from prod logs

One line per settlement cycle, before the cap line:

```
[settlement] CFB game resolution: direct=0 alias=65 ambiguous=0 unmatched=0
```

- `direct` — resolved by the exact-token lookup, i.e. would have worked before
- `alias` — resolved **only** because of this change
- `ambiguous` — refused by the uniqueness guard, with a `[store]` warning naming
  both game ids and the tokens tried
- `unmatched` — no `games` row either way, usually a game the odds feed never
  priced

Also on `AutoSettleResult` as `cfb_game_resolution` and `new_finals_deferred`,
so `POST /api/admin/settle` returns them too.

## What changes in the published numbers

Today CFB has essentially no settled outcomes, because no CFB game goes final.
Every number below is currently empty or a prior, and starts becoming real.

- **`GET /api/stats/track-record?league=CFB`** — `TRACK_RECORD_OVERALL_SQL` and
  `TRACK_RECORD_BY_TYPE_SQL` count `outcomes` joined to `live_signals` where
  `hit IS NOT NULL AND excluded_stale = 0`. CFB goes from ~0 rows to real
  wins/losses and a per-`signal_type` breakdown. **The published CFB hit rate
  will move on its own, with no scoring change behind it.**

- **CLV** — `settleSignal` returns `clv: null` for `injury_update`,
  `lineup_change`, `lineup_confirm` and `weather_update`. Only `line_move`
  computes CLV, and only when both `getLatestSnapshotBefore` and
  `getClosingSnapshot` have a row for the game. So CFB `avg_clv` will be driven
  entirely by `line_move` signals and stays `null` until one settles — a CFB
  track record with hundreds of settled injuries and a null `avg_clv` is the
  expected shape, not a bug.

- **`verified_count` on `/api/leaderboard`** — `getVerifiedCountBySource()`
  counts `settled_outcomes` grouped by source name and is **not league-scoped**.
  Any source name that appears in CFB signals and also in NFL/NBA/MLB signals
  (the generic `beat_writer`-style names do) will see its count rise from CFB
  settlements, mixed in with everything else. The cached leaderboard refreshes
  within `LEADERBOARD_CACHE_TTL_MS` (60s default).

- **The leaderboard's accuracy column** — still the hardcoded blended priors.
  `confidence` on `live_signals` is a prior, and the source-accuracy pass has
  never actually run in prod (empty accuracy ledger,
  `calibration_available: false`). This change is plausibly the thing that first
  makes `signalsSettled > 0` for CFB and therefore fires
  `computeSourceAccuracy()` + `syncAccuracyToStorageDb()` on the hourly debounce
  for the first time. **So the leaderboard's two columns will visibly disagree:
  a real, rising `verified_count` next to a fabricated accuracy percentage.**
  That disagreement is pre-existing and is tracked separately; this PR makes it
  legible rather than causing it. Worth watching the first time the accuracy
  recompute runs on real rows.

## Not measured

- **The Odds API's actual CFB team-name strings.** Calling it costs credits
  against a quota the repo already guards, so the `stored` token for the 88
  schools outside `NAME_TO_CODE` is derived from ESPN's display name. The
  evidence it is right: the two feeds agree on the mascot word for 48/48 of the
  names we *do* have on record, and the generator refuses to write the file if
  that ever stops being true. If a school's odds-feed mascot word differs from
  ESPN's, that one school silently keeps not matching — the guard means it
  cannot match *wrongly*.
- **Prod `games` row counts for CFB**, and which CFB games the odds feed
  actually priced. Nothing was run against prod. The 15.6% → 99.0% figures are
  ESPN's schedule, not our table.
- **The span cost on Render's 0.5-CPU starter.** Measured on a GitHub runner and
  a dev laptop, which differ from each other by ~5x on this work; prod is slower
  than both. The per-step 300ms budget is an upper bound the tests assert, not a
  prediction of what prod will show.
- **Cold-disk cost.** The fixture runs warm. This repo runs `ANALYZE` nowhere,
  so the plans transfer, but the disk cost does not. Both the direct and the
  widened lookup scan the league slice of `games` under
  `idx_games_league_time` — `games` is small and grows with the schedule, and no
  index is added here.

## Out of scope, named

- `espn-cfb-historical.ts` passes an abbreviation and keeps doing so. Its
  `findGameByTeams` call now resolves through the alias, which means it will
  update the existing odds row instead of inserting a duplicate `cfb_hist_*`
  row — an improvement in the direction that file already intends. Its write
  path is untouched, and it is a manual CLI.
- `findNextFinalGameForTeam` (settlement's null-game fallback) and
  `checkLineReaction` in `server/retrieval.ts` match on **one** team column and
  are not canonicalised. Both are fed odds-vocabulary tokens today, so they read
  correctly; the test
  `holds the inventory of single-team games reads, which Phase 1 leaves alone`
  pins the inventory so a new one is a decision somebody makes on purpose.
- Unparking the already-expired CFB null-game signals.
- `espn-cfb-transactions.ts` and the `CFB_DISPLAY_TO_ABBR` map in
  `server/pipeline/cfb-team-lookup.ts` are a third vocabulary again (`CHAR`,
  `ARKST`, `UCONN` where ESPN says `CLT`, `ARST`, `CONN`). Nothing in this PR
  touches them.
