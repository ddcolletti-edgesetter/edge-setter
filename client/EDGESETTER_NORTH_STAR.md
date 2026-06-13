# EdgeSetter North Star
## Permanent Product Principle Document
## Read this at the start of every Claude Code session

This document defines the non-negotiable core of EdgeSetter. 
Every feature, every fix, every design decision must serve this thesis 
or stay out of the product.

---

## THE ONE THING EDGESETTER DOES THAT NOBODY ELSE DOES

Every other sports intelligence site — ESPN, The Athletic, Rotoworld, 
PFF, DraftKings news, beat writers — reports after a human reads a 
source and writes a story.

That takes time.

EdgeSetter's autonomous agents monitor sources, cross-reference signals, 
and build confidence scores in parallel, continuously, without waiting 
for a human editor. The agents reach consensus on a situation before 
any single reporter has finished writing about it.

That means EdgeSetter should reach VERIFIED on confirmed events 
BEFORE mainstream sports media publishes.

This is not a feature. This is the product.

---

## THE TIMING ADVANTAGE IS THE MARKET DIFFERENTIATOR

The gap between:
  firstDetected (when EdgeSetter agents flagged the situation)
and
  publicConfirmation (when the situation became officially confirmed)

...is the proof of EdgeSetter's advantage.

This gap must be visible to users on every verified story where 
it exists. It is the single most important trust signal in the product.

Examples of what users should see:
- "EdgeSetter flagged 47 min before public confirmation"
- "EdgeSetter detected this before national pickup"
- "Confidence reached 80% before official announcement"

A user who sees this once will understand immediately why EdgeSetter 
is worth paying for. A user who never sees it has no reason to 
believe the agents are doing anything.

THIS DISPLAY MUST NEVER BE REMOVED. If a refactor touches story cards, 
detail panels, or the situation pipeline, verify that timing advantage 
display is preserved before shipping.

---

## CONFIDENCE SCORING RULES — NON-NEGOTIABLE

1. A confirmed, publicly announced event with no conflicting sources 
   is 100% confidence. Not 90%. Not 95%. 100% or VERIFIED.

2. Sub-100% percentages communicate doubt. Never show doubt on 
   settled facts. That destroys trust faster than any design problem.

3. The confidence journey — from first detection to consensus to 
   verification — is the story EdgeSetter tells. The journey should 
   be visible. The destination (VERIFIED) should be unambiguous.

4. When verificationState = "verified" AND publicConfirmation exists 
   AND no conflicting sources remain:
   → Display: VERIFIED (not a percentage)
   → Confidence score in pipeline: 100

## THE AGENTS ARE THE SOURCE — NOT PUBLIC CONFIRMATION

EdgeSetter's consensus engine is the verification authority.
Adam Schefter is not. ESPN is not. Public announcement is not.

The agents analyze all available signals in parallel. When agent 
consensus reaches the verified threshold, that IS confirmation.
The determination comes from the system, not from waiting for 
an external source to publish.

Public confirmation is a data point that adds signal weight.
It is not a prerequisite for EdgeSetter to call something verified.

This means:
- When the consensus engine determines verified: show VERIFIED / 100%
- When public sources later confirm: show "Public sources confirmed 
  X minutes after EdgeSetter"
- Never hold confidence below the consensus engine's determination 
  while waiting for a mainstream source to catch up

The pipeline confidence ceiling should reflect agent consensus,
not external publication status. Any logic that gates 100% on 
public confirmation is the ESPN model, not the EdgeSetter model.

---

## WHAT EDGESETTER MUST FEEL LIKE

A user should open EdgeSetter and immediately feel:
"This system knows something the other sites don't have yet."

That feeling comes from:
- Seeing confidence scores moving in real time
- Seeing timing advantage callouts on verified stories
- Seeing the agent consensus journey on every card
- Seeing situations escalate from DETECTED to VERIFIED

That feeling is destroyed by:
- 90% confidence on a confirmed public trade
- Template copy that reads as AI-generated
- Empty sections with placeholder text
- Generic icons that don't match their context
- Logo fallbacks that look unfinished
- Dashboard language instead of sports intelligence language

---

## HIERARCHY OF EVERY PAGE — NEVER INVERT THIS

1. The sports story (what happened, who it involves)
2. The evidence (what sources, what signals)
3. The agent consensus (how many agents agree, confidence score)
4. The timing advantage (when EdgeSetter detected it vs. public)
5. Fantasy / betting / DFS impact
6. Downstream context

Fantasy and betting value belong in the product. They must never 
appear before the sports story is clear. A user who opens EdgeSetter 
and sees odds before context will not trust the intelligence layer.

---

## AGENT TRANSPARENCY IS A TRUST LAYER, NOT A TECHNICAL DETAIL

Users do not need to understand how agents work.
Users do need to see that agents work.

The product should always show (in plain language):
- How many agents detected this signal
- Whether agents agree or conflict
- What confidence score the consensus produced
- When the situation was first detected
- What would confirm it further
- What would weaken it

These are not optional features for a future version. 
They are what makes EdgeSetter different from a sports news feed.

---

## DEFINITION OF SUBSCRIBER-READY

EdgeSetter is subscriber-ready only when a new user can:

1. Open the homepage and within 5 seconds understand 
   "this system knows things before other sites do"

2. See at least one story with a visible timing advantage callout
   showing EdgeSetter detected it before public confirmation

3. Open any story detail and see a confidence score that makes 
   intuitive sense (developing = under 70%, escalating = 70-89%, 
   verified = 100% / VERIFIED)

4. Trust the logos, the copy, and the data enough to not question 
   whether the product is finished

Until all four of these are true, the product is not ready for 
broad subscriber launch.

---

## HOW TO USE THIS DOCUMENT

Paste this into Claude Code at the start of every session.

When Claude Code proposes a change that would:
- Remove or hide the timing advantage display
- Change confidence scoring in a way that shows doubt on verified facts
- Add features before current trust issues are resolved
- Put fantasy/betting context above the sports story

...refer back to this document and reject the change.

This document does not prevent new features. It ensures every new 
feature serves the core thesis: EdgeSetter detects sports intelligence 
faster than anyone else, and users can see the proof.

---

## ESTABLISHED SIGNAL TYPES

This section documents signal types that have been formally established
in the pipeline. Each entry represents a verified, production-ready
signal type with confirmed behavior. New signal types must be added
here before they are considered production-ready.

### eligibility_ruling

Signal type name: eligibility_ruling
Confidence floor: 90
(Eligibility rulings are official determinations — nearly always confirmed
at source. A confidence floor of 90 reflects that these are not rumors
or developing situations; they are official statements.)

What triggers it:
  Keyword patterns in source text: "eligible", "eligibility", "waiver",
  "reinstate", "cleared to play", "granted eligibility", "NCAA approved",
  "transfer waiver". Any of these in a description field classifies the
  event as eligibility_ruling rather than a generic transaction.

Pipeline behavior:
  - Bypasses the isRoutineRosterMove suppression entirely. Eligibility
    rulings are categorically not routine roster moves. They have immediate
    fantasy, DFS, and betting impact and must always surface to the homepage.
  - In the CFB pipeline scorer, eligibility_ruling receives a market
    multiplier of ×1.35 and a context multiplier of ×1.2 — the highest
    multiplier of any CFB signal type after coaching and scheme.
  - In the leagueModifiers (client), eligibility_ruling: 1.35 in
    CFB_MODIFIERS.signalType.

Verdict and confirmation:
  verdict: "confirmed"
  confirmation_strength: "Corroborated" (default; can be overridden to
  "Consensus" by payload if multiple sources confirm)

Why this matters for the North Star:
  The Texas Tech QB Brendan Sorsby ruling was the failure case that
  created this signal type. The story published. The CFB board showed
  nothing. A school SID post is a primary source — not a rumor, not a
  secondary report. Any eligibility ruling with a school SID source
  should surface within the ingestion cycle and reach VERIFIED before
  national media writes the story.

Source coverage:
  Primary sources for eligibility rulings: school SID Twitter/X accounts,
  athletics department press release feeds, local beat writers.
  These are defined in server/pipeline/adapters/cfb-school-sources.ts.
  Wire services (ESPN, AP) pick up eligibility rulings 20–60 minutes
  after the SID post. The SID feed is the EdgeSetter advantage.


COMPETITIVE CONTEXT AND MARKET POSITION
On3 and 247Sports subscribers are publicly canceling and saying out loud that Twitter beats the platform every time. ESPN users are publicly rejecting opaque AI recommendations. PrizePicks users distrust a $1.6B platform because it never explains why outcomes happened.
These are not abstract market observations. These are active, frustrated users who have already been trained to want exactly what EdgeSetter does. They are looking for a product that proves it was first, shows its work, and treats them as intelligent adults who want evidence not recommendations.
This window will not stay open indefinitely. The attention campaign should launch as soon as all subscriber-ready criteria are met — not after additional features are built.
Rule: No new features are justified before all subscriber-ready criteria are met. The competitive window is a reason to move faster on what is already built, not a reason to expand scope.

THE TIMING ADVANTAGE DISPLAY — LANGUAGE REQUIREMENTS
The timing advantage callout must distinguish between source types when the data supports it. Generic "EdgeSetter flagged X minutes before public confirmation" is the minimum. The strongest version names the source type:

"EdgeSetter detected via SID post — wire pickup 34 min later"
"Primary source confirmed — national media 47 min behind"
"School athletic department post — ESPN picked up 61 min later"

This language directly addresses why On3 and 247Sports subscribers cancel. Power users already know SID posts are the real signal. When EdgeSetter names the primary source and shows the gap to wire pickup, it speaks directly to that user.
Rule: When publicConfirmationSource is a wire service (ESPN, AP, Rotoworld) and the original detection source was a primary source (SID, team official, athletic department), the timing advantage callout must reflect that distinction. Never collapse this to a generic label when the source data supports specificity.
Scope limitation: Primary vs. wire source taxonomy is currently production-ready for CFB only (school SID accounts, athletics department feeds — defined in server/pipeline/adapters/cfb-school-sources.ts). Timing advantage source-naming language is CFB-specific until equivalent source taxonomy entries are added to this document for NFL, NBA, and MLB pipelines. On non-CFB stories, fall back to the generic timing gap callout rather than misattributing source type.

SOURCE TRANSPARENCY IS A PRODUCT FEATURE, NOT A PIPELINE DETAIL
Users are rejecting ESPN's opaque AI recommendations specifically because there is no "why." EdgeSetter's agent count, source agreement status, and conflict detection already exist in the pipeline. They must be surfaced as a visible, readable feature — not buried in an overlay that requires a click to find.
Rule: Every story card must show in plain sight, without requiring any interaction:

How many sources are tracking this situation
Whether sources agree or conflict
What type of source first detected it (primary vs wire, where taxonomy exists)

This is not optional UI. It is the trust layer that differentiates EdgeSetter from every competitor. A user who sees "3 sources — 2 agree, 1 conflicting" understands immediately that EdgeSetter is doing something no other platform does.
Rule by card tier:

Lead card: Source count and agreement status must be readable without any interaction. No collapsed panels, no click required.
Rail and compact cards: May condense to a single source badge (e.g. "3 sources / conflict").
Story detail view: Must show full source agreement breakdown — count, convergence status, conflict flag if present. The detail view is where a user goes to verify their trust. It must be the most transparent surface in the product, not a slightly expanded version of the card.


THE CONFIDENCE JOURNEY MUST BE VISIBLE
Competitors show a static score or label. That communicates a destination but not a story. EdgeSetter's entire value proposition is that it detected something before public confirmation — which means there was a journey from first detection to verified. That journey is proof the agents are working.
Rule: Every verified story where detectionLeadMinutes exists must show the confidence path on the story detail view. The minimum viable journey indicator is: detection timestamp + gap to verified. A mini-timeline or two-point confidence progression (e.g. "First detected 8:14am → Verified 9:01am, 47 min before ESPN") is required. A static VERIFIED badge with no journey context is better than showing doubt on a settled fact — but it is not the complete product.
Confidence floor rule: The journey indicator must never surface a sub-70% confidence number on a story that is currently verified. Early detection confidence below 70% communicates doubt on a settled fact, which the North Star prohibits. The journey shows the detection timestamp and the gap to verified — it does not broadcast early uncertainty after the fact. If the only detection confidence on record is below 70%, show the timing gap without the confidence number.

THE HIERARCHY RULE — REINFORCED
ESPN partnered with IBM to serve AI-powered fantasy recommendations to 14 million users. The user backlash was immediate and public. Users do not want to be told what to think. They want to see the evidence and reach their own conclusions.
EdgeSetter must never become that product.
The hierarchy is non-negotiable:

The sports story
The evidence and sources
The agent consensus and confidence journey
The timing advantage
Fantasy / betting / DFS impact

Rule: Any feature proposal that surfaces fantasy impact, betting lines, or DFS recommendations above items 1–4 in the visual hierarchy must be rejected regardless of how it is framed. This is the ESPN mistake. Do not make it.

DEFINITION OF SUBSCRIBER-READY — UPDATED
The original four criteria are replaced by these eight. Criteria 4 and 8 are merged into a single visual standard criterion (now criterion 4) to eliminate overlap.
EdgeSetter is subscriber-ready only when a new user can:
1. Open the homepage and within 5 seconds understand "this system knows things before other sites do."
2. See at least one story with a visible timing advantage callout showing EdgeSetter detected it before public confirmation.
3. Open any story detail and see a confidence score that makes intuitive sense (developing = under 70%, escalating = 70–89%, verified = 100% / VERIFIED).
4. Trust the logos, copy, and data enough not to question whether the product is finished — specifically:

No broken or missing team logos anywhere on the site
No placeholder imagery on any story card or board page
Board pages (NBA, NFL, MLB, CFB) match the homepage visual treatment — story-first layout, consistent badges, league-appropriate imagery
No story card on any page looks unfinished or like a development placeholder

5. See, without clicking anything, how many sources are tracking the lead story and whether they agree.
6. Open a verified story detail and see the confidence journey — not just the VERIFIED badge, but at minimum the detection timestamp and the gap to public confirmation.
7. See a timing advantage callout on at least one CFB story that names the source type (primary source vs wire pickup), not just the time gap. Non-CFB stories use the generic timing gap callout until source taxonomy is production-ready for those leagues.
8. Open any league board and see the same intelligence-first layout as the homepage — no board should feel like a different product.
Until all eight criteria are true, the product is not ready for the attention campaign.
