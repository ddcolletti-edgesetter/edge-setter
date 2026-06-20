# EdgeSetter North Star — Version 2.0
**Date: June 19, 2026**
**Status: Active — read this at the start of every Claude Code session**

This document is the single source of truth for EdgeSetter. It reflects what is
actually built, what the agents actually do, and what needs to be completed. Every
feature, fix, and design decision must serve the core thesis or stay out of the product.

---

## PART 1 — WHAT EDGESETTER IS

EdgeSetter is an autonomous sports intelligence system that knows a story is real
before the public does.

While ESPN, On3, 247Sports, The Athletic, PFF, and Rotoworld wait for a reporter to
read something, write it up, and publish it — EdgeSetter's ES Agents are already
scanning the same sources, cross-referencing signals, building confidence, and
reaching a verdict. By the time the wire picks it up, EdgeSetter has already called it.

The product delivers three things no competitor has:

**Speed.** ES Agents detect and verify before national media publishes. The timing gap
between EdgeSetter's call and the wire pickup is the proof — shown on every verified
story.

**Transparency.** Users see exactly how the call was made. How many ES Agents detected
it, whether they agree or conflict, what sources they watched, and how confidence built
from first detection to verified. Not a black box. An auditable intelligence trail.

**Accuracy.** ES Agents reach consensus based on source quality and corroboration, not
just volume. A school SID post outweighs ten wire reposts. A primary source triggers
verification. The confidence score means something because it is earned, not assigned.

The target user already knows ESPN is late. They are canceling On3 because Twitter
beats it every time. EdgeSetter gives them what none of those platforms can: a system
that was right before anyone else was even looking, and can prove it.

---

## PART 2 — THE AGENTS ARE THE AUTHORITY

This is the most important principle in the document. Read it carefully.

EdgeSetter's ES Agents are the verification authority. Public confirmation — a wire
pickup, an ESPN report, an official announcement — is a data point that adds signal
weight. It is not what makes EdgeSetter right. It is proof that EdgeSetter was already
right before it happened.

**The verification sequence:**

1. ES Agents detect a signal from one or more sources
2. ES Agents cross-reference, weigh source quality, and build a confidence score
3. When agent consensus reaches the verified threshold → the story is VERIFIED
4. When wire services later confirm → EdgeSetter shows the timing gap as proof

Step 4 is evidence of EdgeSetter's advantage. It is never a prerequisite for step 3.

Any code, display logic, or pipeline rule that gates VERIFIED on public confirmation
is implementing the ESPN model, not the EdgeSetter model. That logic must be rejected
regardless of how it is framed.

---

## PART 3 — THE PIPELINE (WHAT ACTUALLY EXISTS)

### 3.1 Backend architecture

- Express + HTTP server — `server/index.ts`
- SQLite databases via better-sqlite3:
  - `edge_setter.db` — main app DB, Drizzle ORM (users, legacy signals, sources)
  - `pipeline.db` — pipeline DB, raw SQL, append-only (situations, snapshots, events)
- Optional Supabase sync — falls back to SQLite if env vars absent
- Ingestion scheduler runs on active hours (7am–1am ET)

### 3.2 Live data sources

Fast tier (every 5 min):
- X/Twitter API v2 — SID accounts and Tier 1 sources (`x-twitter.ts`)
- CFB school SID feeds (`cfb-school-sources.ts`)

Standard tier (every 15 min):
- ESPN APIs — NBA/NFL/CFB injuries (`espn-nba.ts`, `espn-nfl.ts`, `espn-cfb.ts`)
- MLB Stats API — schedule, pitchers, transactions (`mlb-statsapi.ts`)
- The Odds API — lines and market movement (`the-odds-api.ts`)
- Sports RSS — ProFootballTalk, Rotowire, ESPN, NFL.com (`sports-rss.ts`)
- On3, 247Sports feeds

### 3.3 Pipeline state model (internal)

Situations move through these states in `pipeline.db`:

```
watching → emerging → developing → escalating → confirmed → official
                                                          ↓
                                              cooling → resolved → archived
                                                          ↓
                                                      invalidated
```

State transitions are governed by `situations-lifecycle.ts`. Key thresholds:
- `confirmed`: confidence >= 88 AND evidence_count >= 3
- `official`: trigger = "official_confirmation" OR official source detected
- Decay: no new evidence for 24h+ degrades escalating/developing toward cooling
- Abandonment: 72h without advancing past developing → archived

### 3.4 Confidence scoring (what actually drives it)

Confidence is computed in `situations-confidence.ts` as a sum of components (0–100):

| Component | Max | How earned |
|---|---|---|
| source_reliability | 22 | Based on signal confidence × 0.22, floor 8 |
| independent_confirmations | 18 | Each additional source adds 6 pts |
| market_alignment | 16 | Line movement size and betting relevance |
| validator_agreement | 14 | Passed from validator param |
| official_confirmation | 20 | Official source detected: 12–18 pts |
| freshness | 10 | ≤1h: 10pts, ≤6h: 8pts, ≤24h: 5pts |
| contradiction_penalty | -40 | Deducted when contradicted verdict found |

Without an official source, max reachable score is 80. With official source: 100.
Reaching confirmed (88+) without official source requires strong market alignment
AND validator agreement in addition to maximum source reliability and freshness.

**Known gap:** There is no Critic Agent checking for primary source presence before
confidence advances. The Sorsby failure class (advancing without a primary source) is
not yet structurally prevented. The Critic Agent is a required build — see Part 5.

### 3.5 Public confirmation tracking

`insertSituationPublicConfirmation()` is wired into the live ingestion path via
`processor.ts → maybeRecordPublicConfirmation()`. It fires when:
- A qualifying mainstream wire source picks up a story
- EdgeSetter detected it first (wire timestamp after detection time)
- Not already confirmed for this situation

This function is live but has not yet fired on any situation in production. When it
fires, it enables the timing gap callout. This is the most important feature to
validate in the next active period of live data.

### 3.6 Known data gap — team resolution

All 250 current live situations return `teams: ["UNK"]`. The ingestion adapters are
not resolving team abbreviations from player transaction events. This is a pipeline
gap, not a display gap. Team logos, team-contextual copy, and future team routing all
depend on this being fixed. It is the highest-priority pipeline fix before subscriber
launch.

---

## PART 4 — DISPLAY RULES (NON-NEGOTIABLE)

### 4.1 Three display states — exactly three

Users see exactly three confidence states. No others reach the UI under any
circumstances. Pipeline-internal states are mapped before rendering.

| Display state | Color | Pipeline states that map to it |
|---|---|---|
| **Developing** | Info blue `#3B82F6` | `watching`, `emerging`, `developing` |
| **Escalating** | Amber `#E6B450` | `escalating` |
| **Verified** | Success green | `confirmed`, `official` |

**This mapping is the authoritative definition.** Any code that maps `confirmed` or
`official` to "consensus-forming," "market-reacting," "confirming," or any other
intermediate label is incorrect and must be fixed. Those internal visual states do not
exist in the user-facing product.

Verified stories never show a percentage. Display "Verified" and the timing advantage.
The percentage is implicit — Verified means agent consensus was reached.

Sub-100% percentages on a Verified story communicate doubt on a settled fact. This
destroys trust. Never do it.

### 4.2 The timing advantage display

The timing advantage callout is the single most important trust signal in the product.
It is proof that EdgeSetter was right before the wire confirmed it.

**Format when public confirmation exists:**
```
ES Agents verified [time] · Wire pickup [time] — [N] min later
```

**Format when no public confirmation yet:**
```
ES Agents verified · [timestamp]
```

**CFB format (primary source taxonomy exists):**
```
[Source type] · [N] min before wire pickup
Examples:
  School SID · 47 min before wire pickup
  Player account · 31 min before wire pickup
  Beat source · 22 min before wire pickup
```

**Rules:**
- Never name a specific outlet (ESPN, AP, The Athletic, Rotoworld). Use tier language:
  "wire pickup," "wire service," "national media," "public confirmation"
- Never show the timing gap as the verification trigger. ES Agents verified first.
  Wire pickup is the proof, not the cause.
- When `detectionLeadMinutes` exists, this callout is mandatory. It cannot be hidden,
  collapsed, or moved behind a toggle.

### 4.3 The confidence journey

Every verified story where a timing gap exists must show the confidence journey on the
story detail view. Minimum viable implementation:

```
[First detected: 9:14am] ————————— [Verified: 9:58am] ————— [Wire pickup: 10:45am]
```

- Always shown when both detection and verification timestamps exist
- Never hidden behind a toggle or expand
- Mobile: compress to single text line
  "Detected 9:14am → Verified 9:58am → Wire pickup 10:45am"
- The timing advantage references the gap from `firstDetected` to wire pickup —
  not from `verifiedAt` to wire pickup

**Confidence floor rule:** The journey never surfaces a sub-70% confidence number on
a story that is currently Verified. Early detection confidence below 70% is not shown
after verification — show the timing gap without the early number.

### 4.4 Agent transparency on every card

Every story card must show, without any user interaction:

**Lead card (minimum):**
- Source count
- ES Agent count
- Agreement or conflict status

**Format:**
```
[N] sources tracked · [N] ES Agents monitoring · [agree/conflict status]
```

**When agents disagree:**
```
[N] ES Agents · [X] agree · [Y] conflicting
```
Show the conflicting agent's source in the evidence narrative below.

**Story detail view:**
- Full source agreement breakdown
- Conflict flag with reason if present
- This is the most transparent surface in the product

### 4.5 Raw pipeline values that must never reach the UI

The following must be mapped before rendering. No exceptions:

| Raw value | Display value |
|---|---|
| `consensus-forming` | Verified |
| `market-reacting` | Escalating |
| `confirming` | Escalating |
| `monitoring` | Developing |
| `emerging` | Developing |
| `watching` | Developing |
| `cooling` | suppress or "Reviewing" |
| `resolved` | suppress |
| `archived` | suppress |
| `invalidated` | suppress |
| `Market is reacting` | Early market reaction |
| `Context moving` | ES Agents monitoring |
| `Source pressure` | ES Agents monitoring |
| `Stale signal` | suppress |
| `No remaining edge` | suppress |

---

## PART 5 — WHAT NEEDS TO BE BUILT

Listed in priority order. Do not build lower-priority items before higher-priority
items are complete unless they are explicitly parallelizable.

### Priority 1 — Fix display mapping (blocks subscriber-ready criteria 2, 3, 6)

**Gap:** `confirmed` and `official` pipeline states map to "consensus-forming" in
`boardAdapters.ts:421`. This means 250 live situations that have reached agent
consensus display as neither Escalating nor Verified. The ticker shows "no verified
breaks yet" on every board because VERIFIED never renders.

**Fix:** Update `lifecycleVisualState()` in `boardAdapters.ts`:
- `confirmed` → return "verified"
- `official` → return "verified"

Also audit every surface that renders a lifecycle label and apply the mapping table
in section 4.5. Run `mapVerificationDisplayState()` on all board surfaces, not only
the NBA board where it was originally applied.

**Test:** After fix, at least some of the 250 situations should render as Verified
on the boards and ticker should show verified stories.

### Priority 2 — Fix team resolution (blocks criteria 4, and all team display)

**Gap:** All live situations return `teams: ["UNK"]`. The ingestion adapters are not
resolving team abbreviations from transaction events.

**Fix:** Audit each ingestion adapter (ESPN, MLB Stats API, X, RSS) to identify where
team identity information is available in the raw payload and wire it into the
`teams_json` field on situation records. Cross-reference against team lookup tables
that already exist in `espnAssets.ts` and `teamColors.ts`.

**Test:** After fix, at least NFL and MLB situations should resolve to real team
abbreviations. Team logos should render from `teamLogoResolver.ts` without hitting
the catch-all fallback.

### Priority 3 — Build the Critic Agent (pipeline integrity, Sorsby prevention)

**Gap:** No code checks for primary source presence before confidence advances past
Developing. The Sorsby failure class — publishing a situation without a primary source
— is not structurally prevented.

**Definition:** The Critic Agent runs before any situation advances from Developing to
Escalating. It asks three questions in order:

1. Is there a primary source (Tier 0 visual or Tier 1 text), or only wire/secondary?
   — If only wire: return "gap — no primary source"
2. Are there unresolved conflicting signals?
   — If yes: return "gap — conflict unresolved"
3. Does source count meet minimum threshold for this signal type?
   — If no: return "gap — insufficient corroboration"

Outcomes:
- Any gap found → situation stays in Developing, agents continue monitoring
- No gaps → situation cleared to advance to Escalating

The Critic Agent is architecturally separate from the ES Agents that detected the
signal. It cannot be the same process reviewing its own output.

**This is a required build. It cannot be skipped.**

### Priority 4 — Validate timing gap callout with live data

**Gap:** `insertSituationPublicConfirmation()` is wired but has never fired in
production. The timing advantage callout — the core proof of EdgeSetter's value — has
never appeared on a real story.

**Action:** During the next active sports period (games running, transactions
happening), monitor `processor.ts` logs to confirm `maybeRecordPublicConfirmation()`
is being evaluated on incoming events. Identify why no qualifying wire pickup has been
recorded. Check whether the guard conditions in `public-confirmation.ts` are too
restrictive for current ingestion volume.

**Test:** One real situation where EdgeSetter detected first and wire confirmed later,
with the timing gap displayed on the story card.

### Priority 5 — Fix NBA/MLB board layout drift (criterion 8)

**Gap:** NBA and MLB boards use a Watch Desk layout with left-column tabs. NFL and CFB
use the story-first board layout. All four boards must match.

**Fix:** Rebuild NBA and MLB boards to use the same story-first layout pattern as NFL
and CFB — featured situation center, signal feed right rail, ticker full-width top.
The tab navigation (Today, Injuries, Lineup) moves to the board header row, not a
left column. No board gets its own layout pattern.

### Priority 6 — Kill V2Home stub data

**Gap:** `V2Home.tsx` is still active and rendering mock data from `v2MockData.ts`
including stub entries with placeholder team tokens. This page must be gated behind
a dev flag or removed entirely before subscriber launch.

### Priority 7 — Build confidence journey timeline component (criterion 6)

**Spec:** Amendment 6 of the previous North Star defines this. Horizontal timeline
with labeled milestones. Minimum two points (detected, verified). Third point
(wire pickup) when `public_confirmation` exists. Sits below headline, above evidence
block, never behind a toggle.

### Priority 8 — Build CFB timing callout with source type naming (criterion 7)

**Spec:** CFB verified stories must name the source type in the timing callout. Format:
```
[Source type] · [N] min before wire pickup
```
Source taxonomy exists in `cfb-school-sources.ts`. Non-CFB leagues fall back to
generic timing gap until equivalent taxonomy is built for those leagues.

### Priority 9 — Complete My Edge page

**What it is:** Personal intelligence layer. Users follow teams, players, and leagues.
Their feed filters and prioritizes accordingly. Alert thresholds configurable.

**Why it matters:** This is the retention mechanism. A user who customizes EdgeSetter
has a reason to come back every day. It converts a curious visitor into a paying
subscriber.

**Build after:** Core pipeline gaps (Priorities 1–4) are closed. My Edge is only
valuable when the underlying stories are real and verified.

### Priority 10 — Manako visual signal integration

**What it is:** Vision Agents watching cameras detect physical events (injury,
player exit, press conference absence, practice attendance) before any text signal
exists. Visual signals enter the pipeline as the highest evidence tier — above SID
posts.

**Status:** `manakoMapper.ts` and `visualIngest.ts` are written. `ingestVisualSignal()`
is never called from `runIngestionCycle()`. Integration is spec-complete, not live.

**Dependency:** Archie Grant call (scheduled) to confirm webhook format, camera
access for US sports, and commercial terms. Build sprint begins after that call.

**Source tier when live:**
```
Tier 0 — primary_visual (sourceType: "vision_agent")
  Weight: highest. Predates all text signals.
  Rule: visual signals advance to Escalating at most.
        Verified requires at least one corroborating text signal.
        Visual evidence alone is never sufficient for Verified.
```

**Timing callout when Manako is live:**
```
Visual feed detected 9:14am · First text report 9:41am · Wire pickup 10:45am
```

---

## PART 6 — THE HIERARCHY (NEVER INVERT THIS)

Every page, every card, every design decision must follow this order:

1. The sports story — what happened, who it involves
2. The evidence — what sources, what signals
3. The agent consensus — how many ES Agents agree, confidence score
4. The timing advantage — when EdgeSetter detected it vs. wire pickup
5. Fantasy / betting / DFS impact
6. Downstream context

Fantasy and betting value belong in the product. They must never appear before the
sports story is clear. A user who opens EdgeSetter and sees odds before context will
not trust the intelligence layer.

Any feature proposal that surfaces fantasy, betting, or DFS recommendations above
items 1–4 must be rejected regardless of how it is framed.

---

## PART 7 — COPY VOICE RULES

Every string that generates story body, WHY IT MATTERS, or WATCH NEXT copy must read
like a beat reporter on a radio hit. Read it out loud before committing. If it sounds
like a DFS tool, rewrite it.

**Banned words in all template generators:**
- market assumptions
- official card
- report trail
- fantasy exposure
- late pricing
- role expectations
- slate (in DFS context)

**Language standards:**

Source — an external human or organization that published information EdgeSetter
ingested. A beat writer, team official, SID account, wire service.

ES Agent — EdgeSetter's proprietary automated monitor. ES Agents watch sources,
cross-reference signals, build confidence scores, and reach consensus.

The relationship users must understand in 3 seconds:
```
Sources produce information → ES Agents analyze it → Agent consensus = confidence score
```

Rules:
- Always "ES Agent" — never "Agent" alone
- Never use "ES Agent" and "Source" interchangeably
- When showing both: "2 sources tracked / 4 ES Agents monitoring"
- Never name specific outlets in timing callouts. Use tier language:
  "wire pickup," "wire service," "national media," "public confirmation"

---

## PART 8 — PRODUCT SURFACES (WHAT EXISTS AND WHAT IT DOES)

### Live and functional
- **Homepage** — Lead story, signal feed, today's games, live ticker
- **NFL board** — Story-first layout, signal feed, developing stories
- **CFB board** — Story-first layout, conference tabs, signal stream
- **NBA board** — Watch Desk layout (needs alignment with NFL/CFB — Priority 5)
- **MLB board** — Watch Desk layout (needs alignment — Priority 5)
- **Sources page** — Source reliability tiers, tracked accuracy, timing edge, weakened
  rate. This is a product feature, not a dev tool. Keep it.
- **Pro page** — Subscription flow, $19/month

### Built but incomplete
- **My Edge page** — Placeholder UI exists, functionality not built (Priority 9)
- **Alerts** — Icon present, navigates to homepage instead of alerts page. Not built.

### Not in scope until Priorities 1–4 are complete
- Team-level routing (/nba/teams/lakers etc.)
- Manako visual signal integration (Priority 10)
- Self-improving monitor agent
- Story clustering
- Multi-panel power-user layout
- Subnet 44 validator node

---

## PART 9 — SUBSCRIBER-READY DEFINITION

EdgeSetter is subscriber-ready for the attention campaign only when all eight criteria
are true simultaneously. Do not launch until all eight are met.

| # | Criterion | Current status |
|---|---|---|
| 1 | User understands "knows things before other sites" within 5 seconds | Needs user test |
| 2 | At least one story with visible timing advantage callout | **Blocked — timing gap never fired** |
| 3 | Confidence scores display correctly (Developing/Escalating/Verified) | **Blocked — official maps to consensus-forming not Verified** |
| 4 | No broken logos, no placeholder imagery, boards match homepage | **Blocked — teams all UNK, no logos resolving** |
| 5 | Source count visible on lead story without clicking | Needs UI audit |
| 6 | Verified story shows confidence journey, not just Verified badge | Not built |
| 7 | CFB timing callout names source type (primary vs wire) | Not built |
| 8 | All league boards match homepage layout | Partial — NBA/MLB drift |

**Priority 1 (display mapping fix) unblocks criteria 3 immediately.**
**Priority 2 (team resolution) unblocks criterion 4.**
**Priority 4 (timing gap validation) unblocks criterion 2.**

Criteria 1, 5, 6, 7, 8 can be worked in parallel once 2, 3, 4 are clear.

---

## PART 10 — RULES FOR EVERY CLAUDE CODE SESSION

1. Read this document in full before touching any file.

2. The hierarchy in Part 6 is non-negotiable. Any change that inverts it must
   be rejected.

3. After every change: `npx tsc --noEmit && npx vitest run`. Both must exit 0.
   Do not move on if either fails.

4. The display mapping table in section 4.5 is authoritative. No pipeline state
   string ever renders as its raw value in any badge, label, or tooltip.

5. Before building any new feature, confirm all higher-priority items in Part 5
   are complete. Do not add surface area before the foundation is solid.

6. The Critic Agent (Priority 3) cannot be skipped under time pressure. It is a
   required pipeline component. Any session that proposes skipping it must be
   rejected.

7. V2Home.tsx stub data must never reach a user. Gate it or remove it.

8. Never name a specific outlet in timing advantage copy. Tier language only.

9. When `confirmed` or `official` appears in lifecycle_state, it maps to Verified
   in the display. No intermediate states exist in the user-facing product.

10. Public confirmation is evidence, not authority. ES Agents verify. Wire pickup
    proves EdgeSetter was first. These are different things.

---

## PART 11 — COMPETITIVE CONTEXT

EdgeSetter is disrupting a market where every incumbent has the same hard constraint:
their earliest possible detection is a text signal. A tweet. A wire item. A reporter's
filing. The physical event happens before any of that.

| Incumbent | Their model | EdgeSetter's advantage |
|---|---|---|
| ESPN | Breaking news = confirmation of what's already known | ES Agents called it before ESPN started writing |
| The Athletic | Best depth, best relationships, one beat writer per market | ES Agents monitor all markets simultaneously, no shift schedule |
| PFF | Best 0–100 grading on game performance | Same trust model applied to news signals, with evidence trail |
| On3 / 247Sports | Transfer portal and recruiting intel | Users publicly canceling because Twitter beats them every time |
| Rotoworld / Rotowire | Fastest human-edited injury and transaction feed | ES Agents never sleep, no editor bottleneck, no human delay |
| Sleeper | Best delivery mechanism for sports news | They distribute information they didn't originate. EdgeSetter originates it. |

The competitive window is open. On3 and 247Sports subscribers are publicly canceling.
ESPN users are rejecting opaque AI recommendations. PrizePicks users distrust a
platform that never explains why. These are trained, frustrated users who already
want exactly what EdgeSetter does.

This window will not stay open indefinitely. The attention campaign launches when all
eight subscriber-ready criteria are met — not before, not after additional features
are added.

---

*EdgeSetter North Star — Version 2.0*
*June 19, 2026*
*Supersedes all previous North Star versions and amendments.*
*Update this document when pipeline architecture changes, display rules are revised,*
*or subscriber-ready criteria change. Do not let the code diverge from this document.*
