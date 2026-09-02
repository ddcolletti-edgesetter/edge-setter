# deltaMinutes monitoring (lead-time advantage SLO)

Continuous, automated visibility into EdgeSetter's **deltaMinutes** — how many
minutes we detect a situation *before* a wire/official source publicly confirms
it. Bigger is better: it is our edge over the public market.

## What the metric is

`deltaMinutes` is the `detection_lead_minutes` column already computed and
persisted per situation in `situation_public_confirmations`
(`server/pipeline/public-confirmation.ts`):

| | Source |
|---|---|
| **T1 — our detection** | `situations.created_at` (received_at of the first event that opened the situation) |
| **T2 — public confirmation** | `situation_public_confirmations.confirmed_at` (the wire/official source's `published_at`, else its received_at) |
| **deltaMinutes** | `round((T2 − T1) / 60000)` — always `> 0` at insert time |

This is **partly independent of the X API**: team/league official feeds and RSS
wires (e.g. "ESPN NFL", "AP Sports", ProFootballTalk) count as confirmation on
their own, X-free. The endpoint's per-`confirmation_reason` data (in the SQL
companion) lets you read the fully X-free lead separately.

> **Not a confirmation source:** EdgeSetter's own polling APIs — MLB StatsAPI and
> the ESPN NFL/NBA/CFB API feeds — do **not** count as public confirmation. They
> are our *detection*, not an independent public pickup. StatsAPI stopped counting
> at commit `c6e39a9` (its `source_type` was renamed `official report` →
> `league_api` to stop an `official_confirmation` misfire), and
> `matchConfirmationSource` now gates out any `league_api`/`sports_api` source by
> type. Consequence: a league whose only ingested source is such an API cannot
> produce `deltaMinutes` rows — **MLB today has no wire/official feed ingested at
> all** (the X manifest and RSS feeds cover NFL + CFB only), so it captures nothing.

## Capture gate ⚠️

The recorder only runs when **`CANONICAL_SITUATIONS_ENABLED="true"`** in the
Render service env (`server/pipeline/processor.ts`). Until that flag is on and
live traffic accrues, there is nothing to measure — the endpoint reports
`capture.healthy=false` and the monitor fails with a clear message. That is the
expected warmup state, not a bug.

## Pieces

| Piece | Path | Role |
|---|---|---|
| Admin endpoint | `GET /api/pipeline/diagnostics/delta-minutes` (`server/pipeline/routes.ts`) | Runs the read-only query against `pipeline.db` on the Render disk, returns JSON. |
| Poller script | `scripts/check-delta-minutes.mjs` | Calls the endpoint, logs the distribution, asserts the SLO, exits non-zero on breach/error. |
| Workflow | `.github/workflows/delta-minutes-slo.yml` | Runs the poller daily + on demand; a failed run is the alert. |
| SQL companion | `client/deltaminutes-diagnostics.sql` | Same logic as raw SQL for ad-hoc Render-shell runs / deeper slicing. |

Why an endpoint instead of a script that opens the DB directly: `pipeline.db` is
a **SQLite file on the Render persistent disk** (`/var/data`). A GitHub Actions
runner lives in GitHub's cloud and cannot open that file, so the diagnostic runs
*inside* the service (where the disk is mounted) and CI polls it over HTTPS.

## Calling the endpoint ad-hoc

```bash
curl -s \
  -H "Authorization: Bearer $ADMIN_PASSWORD" \
  https://edge-setter.onrender.com/api/pipeline/diagnostics/delta-minutes | jq
```

Run the full poller locally against prod:

```bash
EDGESETTER_BASE_URL="https://edge-setter.onrender.com" \
EDGESETTER_ADMIN_PASSWORD="<ADMIN_PASSWORD>" \
node scripts/check-delta-minutes.mjs
```

## Interpreting the JSON

```jsonc
{
  "generated_at": "2026-08-19T13:10:04.512Z",
  "capture": {
    "canonical_tables_present": true,
    "situations_rows": 1842,        // total canonical situations seen
    "confirmations_rows": 96,       // situations a wire/official later confirmed
    "healthy": true,                // false => nothing to measure yet (see gate)
    "note": "Capturing deltaMinutes."
  },
  "leagues": [
    {
      "league": "NFL",
      "n": 41,                      // confirmed situations for this league
      "median_minutes": 23,         // typical lead — the headline number
      "p90_minutes": 68,            // 90th-percentile lead (the strong tail)
      "min_minutes": 3,
      "max_minutes": 140,
      "avg_minutes": 29.4,          // mean; skewed by the tail, prefer median
      "pct_under_10min": 17.1       // share of leads inside the ~poll-noise floor
    }
    // ... one row per league, most-confirmed first
  ],
  "overall": { "league": "ALL", "n": 96, "median_minutes": 19, "p90_minutes": 61, "pct_under_10min": 22.9, ... },
  "errors": []                      // non-empty => monitor fails
}
```

Reading guidance:
- **`median_minutes`** is the headline — lead-time distributions skew, so the
  mean overstates. Quote the median.
- **`p90_minutes`** shows the strong tail (our most impressive leads).
- **`pct_under_10min`** is a health signal: the 5-minute ingestion poll quantizes
  small gaps, so leads under ~10 min are noise-dominated. A high `pct_under_10min`
  means much of the "lead" is really just poll timing.
- **`capture.healthy=false`** or a non-empty **`errors`** array means the number
  is not trustworthy yet — the monitor fails on both.

## The SLO

`deltaMinutes` is a **lead-time advantage — bigger is better** — so the SLO is a
**floor**: the monitor fails when the median or p90 lead drops *below* the
threshold. Defaults are `10` minutes for both, set on the workflow step:

```yaml
# .github/workflows/delta-minutes-slo.yml
env:
  SLO_MIN_MEDIAN_MINUTES: "10"
  SLO_MIN_P90_MINUTES: "10"
  SLO_SCOPE: "per_league"   # "per_league" (each league) or "overall" (rollup only)
```

The monitor **always** fails on hard problems regardless of the numbers:
endpoint unreachable / non-200, `errors` present, or `capture.healthy=false`.

### Changing the SLO

- **Threshold:** edit `SLO_MIN_MEDIAN_MINUTES` / `SLO_MIN_P90_MINUTES` on the
  workflow step (or export them when running the script locally).
- **Scope:** `SLO_SCOPE=overall` checks only the ALL-leagues rollup; the default
  `per_league` requires every league to pass.
- **Direction:** the floor comparator lives in `checkSlo()` in
  `scripts/check-delta-minutes.mjs`. If you ever decide to treat `deltaMinutes`
  as a latency to *cap* instead of a lead to *floor*, flip `<` to `>` there and
  rename the thresholds — the header comment explains it.

> Recommendation: for the **first** read, treat this as warm-up. Leave the
> thresholds but expect the value checks to be informational until you've seen a
> few days of real numbers; the hard-error gates are what matter early. Once you
> have a baseline, set the floor to something you'd genuinely page on.

## Public "EdgeSetter Edge" showcase (story pages)

The same deltaMinutes measurement drives a customer-facing highlight. On a story
page, when a story qualifies, we show a prominent badge:

> **EdgeSetter Edge** — We reported this story _X_ minutes before the public wire.

**Showcase threshold: 10 minutes.** A story earns the badge only when **all** of:
- it originated from **our own early detection** — the server only records a lead
  (`detectionLeadMinutes`) when EdgeSetter saw the story before any wire/official
  source (`server/pipeline/public-confirmation.ts` guards), so a present value
  already means "we were first";
- the measured lead is **`>= 10` minutes**;
- it is backed by a **real public-confirmation timestamp** (never an estimate).

The eligibility rule lives in `isEdgeShowcaseEligible()` /
`EDGE_SHOWCASE_THRESHOLD_MINUTES` (`client/src/lib/situationsApi.ts`) and renders
in `client/src/pages/StoryDetail.tsx`.

### Why 10 — alignment with the internal SLO floor

The public showcase threshold is **deliberately the same value as the internal
deltaMinutes SLO floor** (the 10-minute floor the monitor alerts on, above). This
keeps public claims and internal benchmarks consistent: we never advertise a lead
we would not also hold ourselves to internally, and — because leads under ~10 min
sit within the 5-minute ingestion-poll noise floor — we don't showcase leads that
are really just poll timing. If you change one, change the other:

| Where | Constant |
|---|---|
| Public badge | `EDGE_SHOWCASE_THRESHOLD_MINUTES` (`client/src/lib/situationsApi.ts`) |
| SLO monitor | `SLO_MIN_MEDIAN_MINUTES` / `SLO_MIN_P90_MINUTES` (workflow) + `checkSlo()` default (`scripts/check-delta-minutes.mjs`) |

A client unit test (`client/src/lib/__tests__/edge-showcase.test.ts`) pins the
threshold at 10 so the two cannot silently drift.

### All stories still publish

The badge is **purely additive** — an extra highlight for significant leads. It
never gates or filters publishing: stories with a lead under 10 minutes, and
stories that did not come from our early detection, are posted exactly as normal,
just without the badge.

> The badge only appears once real capture is live (`CANONICAL_SITUATIONS_ENABLED=true`)
> and a wire/official source has confirmed one of our earlier detections. Until
> then, no story carries a `detectionLeadMinutes`, so no badge shows — by design,
> not fallback.

## Alerting

- **GitHub native email** (zero config): repo watchers are emailed when a
  scheduled run fails.
- **Slack** (optional): set the `SLACK_WEBHOOK_URL` repo secret and failures also
  post to Slack with a link to the failed run.

## Required repo config

Settings → Secrets and variables → Actions:

| Kind | Name | Notes |
|---|---|---|
| Secret | `EDGESETTER_ADMIN_PASSWORD` | Prod `ADMIN_PASSWORD` (the Bearer token). **Required.** |
| Secret | `SLACK_WEBHOOK_URL` | Optional; enables the Slack alert. |
| Variable | `EDGESETTER_BASE_URL` | Optional; defaults to `https://edge-setter.onrender.com`. |

## Rollout

1. Merge this PR.
2. Set `CANONICAL_SITUATIONS_ENABLED=true` in Render and redeploy — this starts
   the deltaMinutes capture.
3. Add the `EDGESETTER_ADMIN_PASSWORD` secret (and optionally `SLACK_WEBHOOK_URL`
   / `EDGESETTER_BASE_URL`).
4. After ~2–3 days of live traffic, manually trigger **delta-minutes-slo**
   (Actions → Run workflow) for the first full read.
5. If the numbers look good, leave it running daily and tune the SLO floor.
