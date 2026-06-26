# EdgeSetter — Master Strategy & Execution Plan
**Compiled: June 24, 2026 | Source: Full Strategic Session**

---

## SECTION 1: WHAT EDGESETTER IS

### The Product Vision
EdgeSetter is a multi-agent AI system that scours the full spectrum of sports media — from small beat writers to wire services — recognizing signals that predict stories before confirmation. The pipeline is infrastructure. The agents are the product.

**Three outputs:**
1. Sports stories written autonomously, published before ESPN confirms them
2. An embedded prediction layer under each story — confidence score, fantasy impact, betting implication, EPA delta
3. A documented timing gap: EdgeSetter signals arrive 10+ minutes before competing sites

**The core positioning:**
> "EdgeSetter is the Adam Schefter of college football."

No centralized CFB breaking news authority exists. Information is fragmented across local beat writers, team sites, and conference reporters. That fragmentation is the opportunity. EdgeSetter owns it.

### The Five-Layer Architecture

| Layer | Function | Status |
|-------|----------|--------|
| 1 — Baseline Model | Elo team power ratings + EPA player value. The prior, not the edge. | Not built |
| 2 — Signal Detection (miners) | Crawl full source spectrum. Weight by tier and track record. Output: named player, signal type, timestamp, source tier. | Partially built (broken RSS sources) |
| 3 — Impact Calculation | Translate every signal into EPA delta, fantasy projection change, implied line move. | Not built |
| 4 — Verification (verifiers) | Yuma Consensus-inspired. Cross-check line movement, corroborate independent sources, apply source track record. Real confidence scores — not fabricated priors. | Scaffolded only (DST system uses hardcoded priors) |
| 5 — Output | Publisher agent writes the story. Prediction layer embedded underneath. | Scaffolded (distribution-draft.ts exists) |

### Autonomy Requirement — Non-Negotiable
EdgeSetter must operate without daily human involvement. The owner will answer questions when needed but will not manage daily operations. Every architectural decision must pass this test: **does this require human intervention to run?**

Current failure: EMAIL_ALERTS_ENABLED not set. System fails silently. Fix before launch.

---

## SECTION 2: WHAT'S BEEN BUILT (HONEST ASSESSMENT)

### Infrastructure — Deployed and Live
- Persistent database at `/var/data/pipeline.db` — survives restarts
- CFB G5 team resolution fix (47 programs, commit fa2e94f) — UNK bug eliminated
- `extractPlayer()` rewritten — handles possessives, parentheticals, prefix stripping
- SQLite-backed `rss_seen_hashes` table — replaces in-memory Set
- Processor batch size 500, drain loop, 8,700+ event backlog cleared

### What the Codebase Actually Contains
The agents exist in `server/agents.ts` but are **rule-based deterministic workflows**, not AI agents. The pipeline:
- `scoutAgent` → ingests raw text
- `clustererAgent` → groups into cluster
- `retrieverAgent` → gathers corroborating evidence
- `verifierAgent` → runs DST confidence (hardcoded priors, not learned)
- `publisherAgent` → writes alerts for confirmed verdicts
- `distribution-draft.ts` → posts to X/Twitter (currently broken — repetitive posting loop)
- `site-watch.ts` — health monitoring every 5 min
- `replay-agent.ts` — backtesting infrastructure (exists but not connected to testable predictions)

### Critical Gap: No Learning System Exists
The DST confidence engine uses hardcoded tier priors. There is no ML training, no learned weights, no pattern recognition on scheme or personnel. The gap between the product vision and current code is not a sprint — it's a different product requiring a different architecture.

### Open Bugs (Must Fix Before Launch)
1. **X posting loop** — repetitive NFL draft content posting. Fix `distribution-draft.ts` dedup logic. Likely cause: signal status not updated to "posted" after X auto-post, or stale draft-era signals re-entering eligible queue
2. **NFL ingest 404** — HEAD `/api/pipeline/ingest/nfl` returning 404
3. **Supabase pull signals** — TypeError: fetch failed
4. **EMAIL_ALERTS_ENABLED not set** — alerts suppressed, system fails silently
5. **RSS sources broken** — 12 team PR feeds, 6 Locked On podcast feeds, ESPN's own feed. Replace with real beat writers
6. **Cross-source situation merging** — `evolveCanonicalSituation()` filters by exact type match before scoring. "lineup" and "injury" never compete. `situation_public_confirmations = 0`
7. **V2Home stub data** — not killed
8. **`created_from_event_id` always null**

---

## SECTION 3: SPORT COVERAGE STRATEGY

### Priority Order
| Sport | Role | Timing |
|-------|------|--------|
| MLB | Backtesting laboratory only. Live daily signal volume, well-defined IL transactions. NOT the target market. | Now through Sept 27 |
| NFL | Primary product proving ground. Highest fantasy subscriber market (40M+ players). | Training camp July 22 — launch target |
| College Football (Power Four) | The strategic wedge. "Adam Schefter of CFB" positioning. Start SEC, Big Ten, Big 12, ACC. | Aug 28 season start |
| CFB expansion | Mid-majors, Group of Five | Season 2 |

### Why College Football Is the Wedge
- No Adam Schefter equivalent exists for CFB
- Information ecosystem is fragmented = larger timing gap opportunity than NFL
- Transfer portal, NIL, coaching changes, depth chart shifts — all underreported
- Passionate regional fanbases that feel underserved by national media

### In-Season CFB Signal Types (Portal is time-limited — NOT in-season)
Based on Phil Steele methodology — the most accurate CFB analyst for 30 years:
1. **Depth chart changes** — starter vs backup shifts (injury-caused or performance-caused)
2. **Experience rating shifts** — caused by injury, suspension, eligibility loss
3. **Coordinator/scheme changes** — and downstream impact on specific player production
4. **Practice participation reports** — limited/full/DNP designations
5. **Injury designations** — translated immediately into EPA delta and fantasy projection change

---

## SECTION 4: BACKTESTING PLAN

### The Rule
Backtesting is **not a gate before launch**. It runs in parallel. Don't wait for it to be done before going public.

### What "A Win" Means
EdgeSetter detects a named player signal at timestamp T1. ESPN API confirms same player + situation at T2. T1 < T2 by **10+ minutes**. That is the product's value proposition in one number.

### Timeline
- Use MLB now through September 27 as the testing environment
- 3-5 genuinely testable events per day (retroactive IL placements don't count)
- 100+ resolved events = enough to know if confidence scores are directionally honest
- 6-8 weeks = ~150-200 resolved events = system-level accuracy calibration
- This is enough to say "our early signals are roughly X% accurate" — not enough to guarantee anything

### What Needs to Happen in the Codebase
TClaude prompt: *"Connect the replay agent to the live MLB signal detection pipeline. For each resolved event: log the EdgeSetter detection timestamp T1, the ESPN API confirmation timestamp T2, the delta in minutes, and whether the signal named the correct player and situation. Output a running accuracy report."*

---

## SECTION 5: LAUNCH TIMELINE

### The Window That Cannot Be Missed
| Date | Event | Significance |
|------|-------|-------------|
| July 22-25 | NFL training camps open | Signal volume starts. Acquisition window opens. |
| August 1 | **Target public launch** | Peak fantasy draft acquisition period begins |
| August 6 | NFL preseason starts | First real game signals |
| August 28 | College football kickoff | CFB audience fully engaged |
| September 6 | NFL Week 1 | Season audience locked in to their tools |

Miss July 22 to September 6 and you're chasing an audience already committed to competitors for the season.

### Minimum Viable Product for July 22
Three things, and only three things, must work:

1. **Story generation** — agent detects signal about named player, publishes readable story automatically with honest confidence indicator attached. Not perfect. Just functional and honest.
2. **NFL beat writer sources** — replace broken RSS list with actual beat writers. One-day task once list is built. Building the list: two days.
3. **Public-facing page** — stories live somewhere findable, bookmarkable, shareable.

### The One Rule for Launch
Do not publish fabricated confidence scores. "Early signal — unconfirmed" vs "confirmed by multiple sources" is sufficient at launch. The sports audience will forgive early roughness. They will not forgive false accuracy claims when the first bad week hits.

---

## SECTION 6: EXPOSURE & AUDIENCE ACQUISITION

### The Core Principle
EdgeSetter's content IS the marketing. Every story that beats ESPN is a shareable proof point. The product markets itself if seeded into the right channels.

### Phase 1 — Start Now (Before Training Camp)
**X (Twitter) — Priority One**
- Account exists and has history — valuable, protect it
- IMMEDIATE FIX NEEDED: repetitive NFL draft posting loop must be stopped before any other exposure work
- Once fixed: post MLB early signals with timestamps every time EdgeSetter beats the wire
- Format: "We detected [Player X] signal at 2:14pm. ESPN confirmed at 2:31pm. 17-minute edge." Screenshot both. Post both.
- Do this 10-15 times over six weeks. Walk into training camp with receipts.

**SEO**
- Every story titled "[Player Name] injury update 2026" or "[Player Name] transfer portal 2026"
- High-intent searches. Google indexes fast. Zero cost. Compounds over time.

### Phase 2 — Training Camp Window (July 22 — September 6)
**Reddit**
- r/CFB (800k+ members), r/fantasyfootball (2M+ members), r/sportsbook
- One verified early signal posted with receipts drives more traffic than any ad campaign
- Contribute, don't spam. Earn the right to post by being genuinely useful.

**Fantasy Football Podcasts — Highest Single-Event ROI**
- Draft season peaks August 1-31
- One mention from a mid-sized fantasy podcast (50k-200k listeners) = thousands of new users
- Target podcasts covering CFB fantasy and dynasty leagues — underserved, higher loyalty
- Start outreach in July

**CFB Fan Forums**
- Rivals and 247Sports team forums for SEC, Big Ten, Big 12 programs
- Early signals about a specific team's depth chart = instant credibility with that fanbase
- Start with 2-3 programs: Georgia, Ohio State, Alabama, Texas

### Phase 3 — Season Running (September 6+)
**Free vs Paid Tier**
- Free: stories, basic signals, 24-hour delayed predictions
- Paid: real-time signals, confidence scores, fantasy/betting impact layer, alerts
- The free tier IS the marketing. Paywall the 10-minute edge specifically.

**Newsletter**
- Daily or 3x/week email digest
- Start building list at launch even with 100 subscribers
- Owned audience — not dependent on algorithm

### Channels Ranked by ROI
1. X (Twitter) — highest ROI, zero cost, audience already there
2. SEO — passive, compounds, zero cost
3. Reddit CFB + fantasy — high trust, organic spread if genuine
4. Fantasy podcasts — highest single-event volume driver
5. Newsletter — long-term retention
6. CFB fan forums — team-specific credibility

### What NOT to Do
- No paid advertising until product-market fit is proven
- No trying to cover everything — CFB wedge positioning first
- No generic sports content — every post needs the "we saw it X minutes before the wire" angle

---

## SECTION 7: PARTNERSHIPS & COLLABORATORS

### Chris Landry (landryfootball.com)
**Who he is:** Former NFL scout (Browns under Belichick, Oilers/Titans). Runs consulting firm for NFL teams and college programs. Publishes film room analysis, player transaction tracking, scheme breakdowns. Currently active — not just a media personality.

**His problem:** Exceptional analysis, limited distribution. One-man operation running consulting + media simultaneously. Manual player transaction tracking. Audience of serious fans who already know to look for him — no algorithmic reach.

**The pitch:** "Your analysis is better than anything on ESPN. EdgeSetter is building the infrastructure to be the Adam Schefter of CFB. We need your expertise as the human interpretation layer. We automate the grunt work — transaction tracking, depth chart monitoring — so you focus on what only you can do: film analysis and insider interpretation. We're not replacing you. We're the reason ten times more people find you."

**What to offer:** Content partnership with full attribution + traffic back to LandryFootball.com. Revenue share on subscribers who arrive through his content. Optional advisory/contributor role with equity if he wants deeper involvement.

**Contact:** Chris@LandryFootball.com | Business partnerships: info@brokencontrollermedia.com

**Critical:** Lead with his problem, not your technology. He's a scout — thinks in fits, roles, value. Don't open with "AI system." Open with "your expertise deserves a bigger audience."

### Phil Steele
**Who he is:** Most accurate preseason CFB analyst in history — 95% accuracy on AP top 25 predictions, independently tracked since 1993. His methodology IS the CFB signal framework EdgeSetter should replicate in real time.

**Role for EdgeSetter:** Not necessarily a direct partner — more a methodology source. His signal types (returning starters, experience charts, depth chart grades, scheme analysis, portal impact grades) define what EdgeSetter's agents should monitor. Study his methodology. Build agents that detect the inputs that drive his signals in real time.

**Potential:** If EdgeSetter proves itself, Steele is a credibility endorsement worth pursuing. He has ESPN history and went independent — similar positioning to what EdgeSetter is building.

### Score (SN44 — Bittensor)
**What they actually are:** Decentralized computer vision infrastructure. Sport-agnostic by design. Soccer is the training ground (chosen because it's the hardest sport for CV to annotate). Already expanding beyond sports — signed deal with European petroleum company for gas station monitoring.

**Current limitation:** All validated models are soccer-specific. Not yet trained on American football.

**Why Score referred to Mettle Data:** Mettle Data has existing American football computer vision capability. Score doesn't yet.

**The real opportunity:** Score's expansion into American football is inevitable — it's their largest untapped English-language market. EdgeSetter could be the product layer that makes American football their second sport.

**Conversation to have:** "What would it take to make American football your second sport? Would EdgeSetter as a launch partner make that investment worthwhile?"

**Keep relationship warm.** Don't push for immediate deliverable. Position as future strategic partner.

### Mettle Data (mettledata.ai)
**What they do:** Computer vision for on-field performance. Automated football match annotation, cricket ball tracking, snooker analytics. Referred by Score.

**Status:** Call was scheduled. Clarify exactly what American football capability they have before building anything around them. Their public site shows on-field performance data — may not be relevant to EdgeSetter's pre-wire signal detection use case.

---

## SECTION 8: BITTENSOR SUBNET MAP (RELEVANT TO EDGESETTER)

### Already In Contact
**Score (SN44)** — computer vision infrastructure. Soccer now, American football future. See Section 7.

### Highest Priority to Understand
**Djinn (SN103)** — Encrypted sports betting signal marketplace. Uses TLSNotary cryptographic proofs — attestations that a signal was published at a specific time from a specific source, stored on-chain permanently. This is the technology EdgeSetter needs to prove its timing gap claims. Not just "we published before ESPN" — cryptographic proof, verifiable forever.

**Almanac (SN41)** — Aggregates independent forecasts into collective intelligence meta-model. Blueprint for EdgeSetter's verifier consensus layer. Integrates with Polymarket for real liquidity.

### Architecture Inspiration
**Arbos / Constantinople (SN97 — Distil)** — An autonomous AI agent (Arbos) built, launched, and now operates its own Bittensor subnet. Climbed to #3 in emissions within days. Uses Chutes (SN64) for inference, purpose-built Rust CLI (agcli) for chain operations. Reads JSON, decides next action, calls CLI, repeats. This is the autonomy architecture model for EdgeSetter's autonomous operation layer.

**Ridges AI (SN62)** — Autonomous coding agents that compete to write, test, and deploy software. Decentralized marketplace for autonomous software agents.

### Also Relevant
**Bettensor** — Sports prediction network rewarding accurate outcome predictions. Potential signal source.
**Infinite Games (SN6)** — LLM-powered forecasting of future events. Self-improving forecast loop and Brier score mechanism is what EdgeSetter's confidence scoring should evolve toward.

---

## SECTION 9: THE YUMA CONSENSUS CONNECTION

Yuma Consensus is the architectural inspiration for EdgeSetter's verifier layer — not a blockchain requirement, but a design principle.

**How it maps:**
- Bittensor miners = EdgeSetter miner agents (crawl sources, produce signals)
- Bittensor validators = EdgeSetter verifier agents (score signals against ground truth)
- Stake-weighted consensus = source trust scores (sources that consistently beat wire and are accurate build higher trust scores over time)
- Weight copying = the anti-pattern to avoid (verifiers that just agree with consensus without independent evaluation produce confident nonsense)

**The key condition that makes it work for EdgeSetter:** Ground truth is well-defined. Did this signal precede wire confirmation by 10+ minutes AND was it accurate? That's verifiable. Better suited to Yuma-style consensus than most applications.

---

## SECTION 10: IMMEDIATE ACTION CHECKLIST

### This Week (Before Anything Else)
- [ ] Fix X posting loop — stop repetitive NFL draft content. Diagnose `distribution-draft.ts` dedup logic. Check signal status update after posting.
- [ ] Get beat writer RSS list built — real NFL beat writers, Power Four CFB beat writers. Replace podcast feeds and team PR feeds entirely.
- [ ] Connect replay agent to MLB live data — start backtesting clock running in background

### Before July 22 (Training Camp)
- [ ] Story generation working end to end — one signal type (injury update), one sport (NFL), publishes readable story automatically
- [ ] Public-facing page live — stories somewhere findable and shareable
- [ ] EMAIL_ALERTS_ENABLED set — system cannot fail silently
- [ ] Fix NFL ingest 404
- [ ] Fix Supabase pull signals TypeError
- [ ] Kill V2Home stub data
- [ ] Outreach to Chris Landry — email Chris@LandryFootball.com

### During Training Camp (July 22 — August 28)
- [ ] Post every early signal to X with timestamps — build the receipts
- [ ] Begin Reddit presence in r/CFB and r/fantasyfootball
- [ ] Outreach to fantasy football podcasts for August mentions
- [ ] CFB fan forum presence for 2-3 target programs

### Research Needed (Next TClaude Session)
- [ ] Djinn (SN103) TLSNotary infrastructure — can EdgeSetter use this to cryptographically prove timing gap?
- [ ] Score partnership conversation — ask about American football expansion timeline
- [ ] Almanac (SN41) aggregation model — blueprint for verifier consensus layer
- [ ] Arbos/SN97 architecture — blueprint for autonomous operation

---

## SECTION 11: THINGS NOT YET RESOLVED

These are open questions that need answers before the decisions that depend on them can be made:

1. **Primary in-season CFB signal type** — portal is time-limited. What is the #1 signal EdgeSetter bets on for the September-December CFB season? (Depth chart changes are the leading candidate based on Phil Steele methodology)

2. **Subscriber model** — free vs paid tier structure not fully defined. What specifically is behind the paywall? The 10-minute edge is the clear answer but needs to be formalized.

3. **Bittensor integration decision** — build EdgeSetter as standalone system using Yuma principles, OR actually build a Bittensor subnet. These are very different products with very different timelines. Standalone can launch in 28 days. A subnet cannot.

4. **Mettle Data call outcome** — what do they actually have relevant to EdgeSetter? Don't build anything around them until this is clear.

5. **"Prism" brand concept** — the CFB vertical brand name. Still being developed.

6. **Score American football timeline** — when are they expanding? Is early partnership viable?

---

*This document supersedes all earlier session notes for strategic planning purposes. Technical/infrastructure details remain in individual session memories in Ditto.*
