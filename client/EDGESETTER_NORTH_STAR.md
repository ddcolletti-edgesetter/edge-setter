# EdgeSetter North Star — Version 2.1
**Date: June 20, 2026**
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
  - NOTE: `pipeline.db` lives in `/tmp` on Render and is wiped on every dyno restart.
    Situation data does not persist across server restarts on the live deployment.
    This is a known infrastructure gap — persistent storage for pipeline.db is a
    future requirement before subscriber launch.
- Optional Supabase sync — falls back to SQLite if env vars absent
- Ingestion scheduler active hours: currently 7am–1am ET
  OPEN QUESTION: These hours do not cover overnight trades, early morning injury
  reports, or late-night roster moves. Whether to extend or run 24/7 is a product
  decision to be made before subscriber launch.

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
validate in the next active sports period.

### 3.6 Known data gap — team resolution

Transaction-type situations return `teams: ["UNK"]` because ingestion adapters do
not resolve team abbreviations from player transaction event payloads. This is a
pipeline gap, not a display gap.

NOTE: Team logos DO resolve correctly when team identity exists — CFB matchup
situations (e.g. Michigan vs Ohio State) render real team logos because the matchup
adapter supplies team identity directly. The UNK problem is specific to
transaction-type and injury-type situations where team must be derived from player
name lookup. Team logos, team-contextual copy, and future team routing all depend
on this being fixed for those situation types.

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
`official` to any other label is incorrect and must be fixed immediately.

Verified stories never show a percentage. Display "Verified" and the timing advantage.
Sub-100% percentages on a Verified story communicate doubt on a settled fact.
This destroys trust. Never do it.

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

The confidence journey timeline is partially built and rendering on the homepage.
It currently shows DETECTED and ESCALATING with real timestamps. The VERIFIED segment
exists but grays out until a story reaches confirmed/official state. The wire pickup
third point requires `insertSituationPublicConfirmation()` to fire on a live story.

This is correct behavior. What remains is connecting the third point.

Full spec for story detail page:
```
[First detected: 9:14am] ————— [Verified: 9:58am] ————— [Wire pickup: 10:45am]
```

- Always shown when both detection and verification timestamps exist
- Never hidden behind a toggle or expand
- Mobile: compress to single text line
  "Detected 9:14am → Verified 9:58am → Wire pickup 10:45am"
- The timing advantage references the gap from `firstDetected` to wire pickup —
  not from `verifiedAt` to wire pickup

**Confidence floor rule:** The journey never surfaces a sub-70% confidence number on
a story that is currently Verified. Show the timing gap without the early number.

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

NOTE: The NBA and MLB Watch Desk fallback cards still show raw "monitoring" in the
Verification State field. This surface was not covered by the Priority 1 fix and
requires a separate targeted pass — see Priority 2B below.

---

## PART 5 — WHAT NEEDS TO BE BUILT

Listed in priority order. Do not build lower-priority items before higher-priority
items are complete unless explicitly parallelizable.

### Priority 1 — Fix display mapping ✓ COMPLETE
`confirmed` and `official` now map to "verified" in `boardAdapters.ts`.
`consensus-forming` no longer exists anywhere in the codebase.
tsc and vitest both exit 0. Committed June 20, 2026.

### Priority 2 — Fix team resolution for transaction/injury situations

**Gap:** Transaction-type and injury-type situations return `teams: ["UNK"]` because
ingestion adapters do not resolve team from player name in those event types.
Matchup-type situations already resolve correctly.

**Fix:** In each ingestion adapter that produces player transaction or injury events,
add a player-to-team lookup step that resolves team abbreviation before the event
is written to pipeline.db. Cross-reference against lookup tables in `espnAssets.ts`
and `teamColors.ts`.

**Test:** NFL injury and MLB transaction situations resolve to real team abbreviations.
Team logos render without hitting the catch-all fallback square.

### Priority 2B — Fix "monitoring" leak on NBA/MLB Watch Desk fallback cards

**Gap:** NBA and MLB boards show raw "monitoring" text in the Verification State field
of their Watch Desk fallback cards. This is a different surface from canonical
situation cards and was not covered by Priority 1.

**Fix:** Apply `mapVerificationDisplayState()` to the Watch Desk fallback card
template. "monitoring" → "Developing" per the mapping table in section 4.5.

**Test:** NBA and MLB boards show no raw pipeline state strings anywhere.

### Priority 3 — Build story detail page (critical UX gap)

**Gap:** Clicking a lead story on the homepage navigates to the league board, not to
the story itself. The "Open Story" button on cards does not route correctly or the
story detail page does not exist. This breaks the core user flow — a user who sees
an interesting story has no way to get more information about it.

**What the story detail page must contain (in order):**
1. Full headline and story narrative — beat reporter voice, no template language
2. Complete confidence journey timeline — detected → escalating → verified →
   wire pickup (when available)
3. Every source tracked — name, tier, what they reported, agreement status
4. All ES Agent findings — what each agent detected and when
5. Evidence trail — full, not truncated
6. Timing advantage callout — mandatory when detectionLeadMinutes exists
7. Fantasy / betting impact — below all of the above, never before
8. Watch Next — what would change this story

**Routing:**
- Homepage lead story click → story detail page for that situation
- "Open Story" button on any card → story detail page for that situation
- URL pattern: `/story/[situation_id]`
- Back navigation returns to the board or page the user came from

**This is the most important UX gap before subscriber launch.** A product that
generates verified intelligence but cannot show users the full story is incomplete.

### Priority 4 — Build the Critic Agent (pipeline integrity)

**Gap:** No code checks for primary source presence before confidence advances past
Developing. The Sorsby failure class is not structurally prevented.

**Definition:** The Critic Agent runs before any situation advances from Developing to
Escalating. It asks three questions:

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

**This is a required build. It cannot be skipped under any circumstances.**

### Priority 5 — Validate timing gap callout with live data

**Gap:** `insertSituationPublicConfirmation()` has never fired in production.
The timing advantage callout has never appeared on a real story.

**Action:** During next active sports period, monitor `processor.ts` logs to confirm
`maybeRecordPublicConfirmation()` is being evaluated on incoming events. Check whether
guard conditions in `public-confirmation.ts` are too restrictive for current ingestion
volume.

**Test:** One real situation with EdgeSetter detection timestamp earlier than wire
pickup timestamp, with the timing gap displayed on the story card and story detail page.

### Priority 6 — Standardize all board and page layouts

**The standard:** NBA board, MLB board, and Homepage define the visual standard.
Dark navy background, amber/gold accent color, story-first center layout, signal feed
right rail, ticker full-width at top.

**Editorial structure on every page (matches ESPN/On3 familiarity):**
- Headline first — large, clear, immediately readable
- Brief story intro — one to two sentences of beat reporter context
- EdgeSetter intelligence layer underneath — confidence state, agents, timing,
  evidence. This layer is what differentiates EdgeSetter. It follows the story,
  never leads it.

**Pages that need alignment to this standard:**
- NFL board — currently uses split-panel layout (left card + right story). Move to
  story-first center layout matching NBA/MLB pattern.
- CFB board — conference tabs sit above the board header. Move tabs into header row.
  Align color treatment and component patterns to standard.
- Sources page — needs visual alignment to standard nav, header, and color treatment
- Alerts page — needs visual alignment to standard
- My Edge page — needs visual alignment to standard

**Rule:** Each league can have its own identity within the standard framework
(CFB conference tabs, NBA Tonight branding, MLB Today branding). The skeleton,
color treatment, nav pattern, and component hierarchy must be consistent across
all pages. A user clicking between pages should feel they are on one product.

### Priority 7 — Connect alerts delivery backend

**Gap:** The Alerts page UI is complete and well-built. Users can set sport
preferences, signal type filters, minimum confidence thresholds, and delivery
channels. Email delivery and push notifications both show "PAUSED — not active yet."
The preferences can be saved but alerts are never sent.

**What needs to be built:**
- Email delivery: wire saved alert preferences to `server/email.ts` (Resend is already
  imported). When a situation reaches Verified and matches a user's saved preferences,
  send an alert email with the story headline, confidence state, and timing advantage.
- Push notifications: implement web push or mobile push delivery channel.
- Alert routing: on every verified situation, check all subscribed users whose
  preferences match (league, signal type, confidence threshold) and trigger delivery.

**Test:** A subscribed user with NBA + Injuries + 80+ confidence preference receives
an email when an NBA injury situation reaches Verified.

### Priority 8 — Complete My Edge page

**What it is:** Personal intelligence layer. Users follow teams, players, and leagues.
Their feed filters and prioritizes accordingly. Alert thresholds configurable and
linked to the Alerts page delivery settings.

**Why it matters:** This is the primary retention mechanism. A user who has
customized EdgeSetter has a reason to return every day. It converts a curious visitor
into a paying subscriber.

**Build after:** Story detail page (Priority 3) and Alerts delivery (Priority 7) are
complete. My Edge is only valuable when stories can be read in full and alerts fire.

### Priority 9 — Build CFB timing callout with source type naming

**Spec:** CFB verified stories must name the source type in the timing callout:
```
[Source type] · [N] min before wire pickup
```
Source taxonomy exists in `cfb-school-sources.ts`. Non-CFB leagues fall back to
generic timing gap callout until equivalent source taxonomy is built for those leagues.

### Priority 10 — Kill V2Home stub data

**Gap:** `V2Home.tsx` renders mock data from `v2MockData.ts` including stub entries
with placeholder team tokens. Must be gated behind a dev flag or removed entirely
before subscriber launch. Stub data must never reach a user.

### Priority 11 — Manako visual signal integration

**What it is:** Vision Agents watching cameras detect physical events before any text
signal exists. Visual signals enter the pipeline as the highest evidence tier.

**Status:** `manakoMapper.ts` and `visualIngest.ts` written. `ingestVisualSignal()`
never called from `runIngestionCycle()`. Spec-complete, not live.

**Dependency:** Archie Grant call (scheduled) to confirm webhook format, camera access
for US sports, and commercial terms. Build sprint begins after that call.

**Source tier when live:**
```
Tier 0 — primary_visual (sourceType: "vision_agent")
  Weight: highest. Predates all text signals.
  Rule: visual signals advance to Escalating at most.
        Verified requires at least one corroborating text signal.
        Visual evidence alone is never sufficient for Verified.
```

**Timing callout when live:**
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
sports story is clear. Any feature proposal that surfaces fantasy, betting, or DFS
recommendations above items 1–4 must be rejected regardless of how it is framed.

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
- Never name specific outlets in timing callouts. Tier language only:
  "wire pickup," "wire service," "national media," "public confirmation"

---

## PART 8 — PRODUCT SURFACES (CURRENT STATE)

### Live and functional
- **Homepage** — Lead story, signal feed, today's games, live ticker. Visual standard.
- **NBA board** — Watch Desk layout. Part of the visual standard.
- **MLB board** — Watch Desk layout. Part of the visual standard.
- **NFL board** — Story-first split-panel layout. Needs alignment to standard (P6).
- **CFB board** — Story-first layout with conference tabs. Needs alignment to standard (P6).
- **Sources page** — Source reliability tiers, tracked accuracy, timing edge, weakened
  rate. Populates from live pipeline on deployed server. Empty locally — expected.
  This is a product feature. Keep it.
- **Pro page** — Subscription flow, $19/month.

### Built but incomplete
- **Story detail page** — "Open Story" button exists on cards but routing is broken
  or page does not exist. Highest-priority UX gap (Priority 3).
- **Alerts page** — UI complete. Sport, signal type, confidence threshold, delivery
  channel preferences all built. Email and push delivery not connected (Priority 7).
- **My Edge page** — Placeholder UI and example cards exist. Functionality not built
  (Priority 8).

### Not in scope until Priorities 1–5 are complete
- Team-level routing (/nba/teams/lakers etc.)
- Manako visual signal integration (Priority 11)
- Self-improving monitor agent
- Story clustering
- Multi-panel power-user layout
- Subnet 44 validator node
- pipeline.db persistent storage on Render

---

## PART 9 — SUBSCRIBER-READY DEFINITION

EdgeSetter is subscriber-ready for the attention campaign only when all criteria
below are true simultaneously. Do not launch until all are met.

| # | Criterion | Current status |
|---|---|---|
| 1 | User understands "knows things before other sites" within 5 seconds | Needs user test |
| 2 | At least one story with visible timing advantage callout | Blocked — timing gap never fired in production |
| 3 | Confidence scores display correctly (Developing/Escalating/Verified) | **FIXED June 20** — monitor for regressions |
| 4 | No broken logos, no placeholder imagery | Partial — matchup logos work, transaction/injury UNK |
| 5 | Source count visible on lead story without clicking | Needs UI audit |
| 6 | Verified story shows confidence journey with wire pickup point | Partial — detected/escalating render, verified + wire pickup not yet |
| 7 | CFB timing callout names source type | Not built |
| 8 | All league boards and pages match visual standard | Partial — NFL/CFB/Sources/Alerts/My Edge need alignment |
| 9 | Story detail page opens from any card or lead story click | Not built / broken routing |
| 10 | Alerts delivery fires on verified stories matching user preferences | Not built |

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

6. The Critic Agent (Priority 4) cannot be skipped under time pressure. It is a
   required pipeline component. Any session that proposes skipping it must be rejected.

7. V2Home.tsx stub data must never reach a user. Gate it or remove it (Priority 10).

8. Never name a specific outlet in timing advantage copy. Tier language only.

9. When `confirmed` or `official` appears in lifecycle_state, it maps to Verified
   in the display. No intermediate states exist in the user-facing product.

10. Public confirmation is evidence, not authority. ES Agents verify. Wire pickup
    proves EdgeSetter was first. These are different things.

11. The story detail page is the full intelligence dossier. It follows the hierarchy
    in Part 6 without exception. Fantasy and betting impact are always last.

12. Every "Open Story" button and every lead story click must route to the story
    detail page for that specific situation. Navigation to a league board is not
    acceptable as a substitute.

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
subscriber-ready criteria in Part 9 are met — not before, not after additional
features are added.

---

*EdgeSetter North Star — Version 2.1*
*June 20, 2026*
*Supersedes Version 2.0 and all previous versions and amendments.*
*Update this document when pipeline architecture changes, display rules are revised,*
*subscriber-ready criteria change, or priorities are completed.*
*Do not let the code diverge from this document.*