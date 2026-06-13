# Source Scorer Changes — Apply In Order

## Files in this folder

| File | What it is |
|------|-----------|
| `1-schema-change.ts` | 3 new columns for `source_scores` table in `shared/schema.ts` |
| `2-storage-additions.ts` | 2 new functions to add to `server/storage.ts` |
| `3-processor-wirein.ts` | Update `processCanonicalSituationSafe` in `server/pipeline/processor.ts` |
| `4-updated-source-scorer-agent.ts` | Replace `sourceScorerAgent` + add `sourceScorerOnOutcome` in `server/agents.ts` |

---

## Step 1 — `shared/schema.ts`

Open `shared/schema.ts`. Find the `source_scores` table.

The last three lines of the table currently look like this:

```ts
  false_positive_rate: numeric("false_positive_rate").default("0"),
  updated_at: text("updated_at").default(new Date().toISOString()),
});
```

Replace those with what's in `1-schema-change.ts`. You're adding three lines
between `false_positive_rate` and `updated_at`.

After saving, run your migration command (e.g. `npm run db:push` or `drizzle-kit push`)
to add the columns to the live database.

---

## Step 2 — `server/storage.ts`

Open `server/storage.ts` — the Drizzle-backed one, **not** `server/pipeline/store.ts`.

Find the function `upsertSourceScore`. Add the two functions from
`2-storage-additions.ts` directly below it.

The file shows two versions of each function — one for Drizzle syntax, one for
raw SQLite. Use whichever matches how the rest of your storage.ts is written.
Delete the version you don't need.

---

## Step 3 — `server/pipeline/processor.ts`

Two changes:

**Change 3a — import at top of file.**
In the import block, add:
```ts
import { sourceScorerOnOutcome } from "../agents";
```

**Change 3b — update `processCanonicalSituationSafe`.**
Find the function (it's near the bottom). Replace the entire function body
with the version in `3-processor-wirein.ts`.

Read the NOTE at the bottom of that file — if `evolveCanonicalSituation`
currently returns `void`, use the simpler fallback version shown there to
avoid touching `situations-engine.ts` right now.

---

## Step 4 — `server/agents.ts`

Find the `// ─── Source Scorer Agent ───` section. Replace the entire
`sourceScorerAgent` function with the contents of `4-updated-source-scorer-agent.ts`.
That file contains both `sourceScorerAgent` (the replacement) and
`sourceScorerOnOutcome` (new function). Add both.

---

## What to test after

1. Run the pipeline on a known signal. In agent_logs, the SourceScorer entry
   should now say `Skipped: only N resolved claim(s)` if there's no history yet —
   that means it's working correctly (not writing fake data).

2. Manually create a claim, run it through to a `confirmed` verdict, then call
   `sourceScorerAgent(source_id)` again. The log entry should now show real
   accuracy numbers.

3. Check `source_scores` in the DB. The `sample_size` column should be populated
   and `average_lead_time_minutes` should be NULL (not 0 or a random number)
   until `getSignalLeadTimesForClaims` is implemented.

---

## What's deferred (lead time)

Lead time computation needs one more storage method:
`getSignalLeadTimesForClaims(claim_ids[])` — joins claims → live_signals →
signal_state_history, finds VERIFIED state changes, and returns the delta
from `signal_time` to the VERIFIED timestamp in minutes.

This is the timing advantage metric. It's deferred to avoid scope creep here.
Until it's added, `average_lead_time_minutes` stores NULL, which the leaderboard
should render as `—`. That's correct — null is honest, fake is not.
