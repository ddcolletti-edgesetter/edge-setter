# EdgeSetter: Research & Recommendations Working Document

**Version 2.0 — June 19, 2026**
*Compiled from deep research across comparable platforms. All recommendations are cross-referenced against the EdgeSetter North Star document. North Star Amendments v1.0 have been merged into the North Star directly and are not duplicated here.*

---

## Part 1: Capability Recommendations (Tiers 1–3)

Every capability below was extracted from a real, functioning platform. Nothing is invented. Traceability is listed for each item.

---

### TIER 1 — Builds directly on top of what already exists
*No new infrastructure needed. These use data the pipeline already has or enforce rules the North Star already states.*

---

#### 1.1 Conservative Bias Correction for the Confidence Ceiling
**Source:** PolyEdge AI (favourite-longshot bias correction) + Frontiers AI tobacco pipeline paper (measured +3.25 pt systematic conservative bias)

**What it is:** Both PolyEdge AI and peer-reviewed academic research independently discovered that AI pipelines drift toward middling scores and refuse to call extremes. PolyEdge applies a mathematical correction for this — when raw ensemble probability is 85%, the correction may push it to 88% because historical data shows AI models under-price high-confidence events. The tobacco pipeline paper measured this empirically: the system was biased +3.25 points toward "uncertain" and refused to classify any claim in the lowest tier even when human experts did.

**What it means for EdgeSetter:** The North Star already has the rule: *"A confirmed, publicly announced event with no conflicting sources is 100% confidence. Not 90%. Not 95%."* The upgrade formalizes this as an active pipeline correction — not just a display rule. When agent consensus reaches the verified threshold, a correction step actively overrides any residual sub-100% score before it surfaces. The bias correction is logged so it can be audited.

**North Star connection:** *"Sub-100% percentages communicate doubt. Never show doubt on settled facts. That destroys trust faster than any design problem."* — The rule exists. The enforcement mechanism doesn't.

---

#### 1.2 Per-Signal-Type Calibration Multipliers with Automatic Overnight Update
**Source:** PolyEdge AI (nightly CRPS recalibration loop with per-category multipliers)

**What it is:** PolyEdge maintains separate calibration multipliers for 8 market categories (Politics, Crypto, Sports, Economics, Tech, Culture, Science, Other) that recalculate every night based on Continuous Ranked Probability Score (CRPS) measured against resolved forecasts. If crypto forecasts were systematically overconfident — predicting 80% when the true rate was 73% — the nightly process detects that pattern and adjusts the crypto multiplier downward. The engine gets measurably more accurate over time without manual intervention.

**What it means for EdgeSetter:** The North Star already defines per-signal-type multipliers (eligibility_ruling ×1.35, injury_update ×0.4 offseason, leagueModifiers per league). These are currently set by hand and updated manually when failures surface (the Sorsby case created the eligibility_ruling type). The upgrade: a monitor agent that runs after each verification cycle, computes how well each signal type's confidence scores predicted eventual verification, and proposes multiplier adjustments. EdgeSetter retains human approval of changes; the agent surfaces the data and the recommendation. Manual remains the policy; automatic becomes the measurement.

**North Star connection:** The North Star defines `leagueModifiers` and `signalType` multipliers by hand. They are currently intuition-set, not data-validated.

---

#### 1.3 Agent Disagreement as an Explicit User-Facing Signal
**Source:** PolyRadar ("multiple independent AI models, model disagreement as a feature"), Polyseer (Critic agent surfaces gaps), PolyEdge AI ("5/6 models agree" badge displayed alongside every forecast)

**What it is:** All three prediction market platforms surface model/agent disagreement as a first-class feature rather than a warning or internal state. PolyRadar shows source transparency alongside confidence. PolyEdge displays "5/6 models agree" next to every forecast. Polyseer's Critic agent makes disagreement an explicit pipeline stage. The pattern across all three: disagreement is itself information — it tells the user how settled the evidence base is, not just what the score is.

**What it means for EdgeSetter:** EdgeSetter already tracks conflicting sources internally and logs them in the pipeline. The upgrade is surfacing the disagreement state visibly on every card without requiring any user interaction — specifically: "3 ES Agents agree / 1 conflicting" as a readable badge rather than buried in an overlay. When agents disagree, the confidence score should reflect it and the card should show why. When agents agree, the agreement count is itself a trust signal worth displaying.

**North Star connection:** *"Every story card must show in plain sight, without requiring any interaction: how many sources are tracking this situation, whether sources agree or conflict."* Already required by the North Star. Disagreement scoring makes it quantified and meaningful rather than binary.

---

#### 1.4 Confidence Journey Timeline on Story Detail View
**Source:** PolyRadar (timeline visualization of how confidence evolved from detection to resolution)

**What it is:** PolyRadar shows a timeline visualization for each event — not just the current confidence score but how it moved. When was it first detected, when did confidence cross each threshold, when did it reach consensus. The timeline is the proof that agents are doing something, not just outputting a number.

**What it means for EdgeSetter:** The North Star already mandates this: *"Every verified story where detectionLeadMinutes exists must show the confidence path on the story detail view. The minimum viable journey indicator is: detection timestamp + gap to verified."* The upgrade is implementing PolyRadar's specific design pattern — a visual two-point or multi-point timeline rather than a text callout. "First detected 8:14am → Escalating 8:31am → Verified 9:01am — 47 min before ESPN" rendered as a visible progression, not described in prose. The journey becomes a graphic, not a sentence.

**North Star connection:** *"A static VERIFIED badge with no journey context is better than showing doubt on a settled fact — but it is not the complete product."*

---

### TIER 2 — Fills documented gaps in the North Star
*Requires new pipeline work. High North Star alignment. The gaps are named in the document.*

---

#### 2.1 Critic Agent — Identifies Evidence Gaps, Triggers Re-Search
**Source:** Polyseer (5-agent pipeline: Planner → Researcher → Critic → Analyst → Reporter, with Critic sending Researcher back for second pass when evidence is incomplete)

**What it is:** Polyseer's pipeline includes a dedicated Critic agent whose only job is to review what the Researcher gathered and flag missing or insufficient evidence before the Analyst scores it. The Critic asks: Is this bilateral? Did we get evidence on both sides of the claim? Are there source types we haven't consulted? If gaps exist, it sends the Researcher back for another pass before allowing scoring to proceed.

**What it means for EdgeSetter:** EdgeSetter's current pipeline appears to make one ingestion pass per cycle. A Critic agent would ask, before the confidence score advances past DEVELOPING: "Do we have a primary source or only wire? Are there conflicting signals we haven't resolved? Is there a school SID account we haven't checked? Does the source count justify escalation?" This is the systemic fix for the Brendan Sorsby failure case — the Critic would have flagged "no primary source found yet" before the situation advanced to ESCALATING.

**North Star connection:** The Sorsby case created the `eligibility_ruling` signal type specifically because the pipeline missed a primary source. A Critic agent is the architectural fix; `eligibility_ruling` is the workaround.

---

#### 2.2 Primary vs. Secondary Source Taxonomy Extended to All Leagues
**Source:** Perigon (source quality classification with 150,000+ sources each tagged by type, authority, and credibility tier) + tobacco pipeline (hierarchical evidence gathering with explicit quality weights — systematic reviews outrank case reports)

**What it is:** Perigon classifies every source by type, credibility tier, and domain authority. The tobacco pipeline uses explicit source quality weights where higher-quality sources carry higher multipliers in the final score. Both systems require knowing not just *what* a source said but *how much to weight it* based on where it sits in the evidence hierarchy.

**What it means for EdgeSetter:** EdgeSetter has this for CFB only — school SID accounts are mapped as primary sources in `cfb-school-sources.ts`. The North Star explicitly says: *"Timing advantage source-naming language is CFB-specific until equivalent source taxonomy entries are added for NFL, NBA, and MLB."* This is the build. NFL team PR accounts, NBA beat writers credentialed by specific outlets, MLB transaction wires — each needs a primary/secondary taxonomy before the timing-advantage display can be accurate on those leagues. Without this, non-CFB stories can only show generic timing gaps, not the named source distinction that makes the callout meaningful.

**North Star connection:** *"On non-CFB stories, fall back to the generic timing gap callout rather than misattributing source type."* This is a known gap with a known fix path.

---

#### 2.3 Post-Resolution Confidence Calibration Review (Internal)
**Source:** Frontiers AI tobacco pipeline (Cohen's κ = 0.68 against expert human reviewers, 70% exact category agreement, 95% adjacent-level agreement) + PolyEdge AI (CRPS scores every forecast against resolved outcomes, published on Track Record page)

**What it is:** The tobacco paper validated their pipeline against expert humans using inter-rater agreement statistics. PolyEdge scores every forecast with CRPS against outcomes and publishes the full track record — including wrong calls — for anyone to verify. Both systems treat calibration measurement as a product feature, not an internal metric.

**What it means for EdgeSetter:** EdgeSetter has no equivalent. The timing-advantage display proves speed. It says nothing about whether a 70% confidence score at detection time was right 70% of the time across a large sample. An internal calibration review would: log every confidence score at each pipeline stage for every situation, compare against eventual `verificationState`, and compute how calibrated the scoring is per league and signal type. This becomes the data layer for the per-signal multiplier updates in Tier 1.2, and eventually becomes the basis for a public-facing track record ("EdgeSetter confidence scores have been right X% of the time across N situations").

**North Star connection:** EdgeSetter proves it was first. It has not yet proved its intermediate confidence scores are calibrated. That is a separate and valuable claim.

---

#### 2.4 Coordinated Signal / Anomaly Detection Layer
**Source:** Primer Command (detects narrative anomalies — clusters of sources converging on a claim in patterns inconsistent with organic reporting, provides early-warning signals hours ahead of traditional tools) + Cyabra (detects coordinated inauthentic activity at scale, produces evidence-backed confidence scores on narrative authenticity)

**What it is:** Primer Command, used by NSA analysts, surfaces early-warning signals by detecting when sources cluster around a narrative in anomalous patterns — too fast, too coordinated, from too many low-authority sources simultaneously. Cyabra monitors for coordinated inauthentic activity and produces authenticity scores alongside sentiment scores. Both are in the business of distinguishing organic corroboration from synthetic consensus.

**What it means for EdgeSetter:** In sports, false trade rumors get amplified, fake injury reports circulate, coordinated accounts push disinformation about player status. An anomaly detection layer would flag when a cluster of low-credibility accounts all post the same claim simultaneously — a signal that apparent "source agreement" may be manufactured rather than corroborated. This protects EdgeSetter's verification authority: if the agents reach consensus on a coordinated fake, the system catches it before VERIFIED gets stamped.

**North Star connection:** *"EdgeSetter's consensus engine is the verification authority."* Protecting that authority means detecting when apparent consensus is synthetic, not just measuring it.

---

### TIER 3 — Strategic, longer horizon
*High value but requires significant new infrastructure. Direct precedent in real, functioning platforms.*

---

#### 3.1 Self-Improving Monitor Agent (Post-Verification Review Loop)
**Source:** PolyEdge AI (dedicated Claude Opus 4.6 agent reviews every resolved forecast after each 6-hour cycle, identifies failure patterns, recalibrates multipliers, applies improvements automatically)

**What it is:** PolyEdge's most distinctive feature. After every resolution cycle, a monitor agent reviews every correct and incorrect forecast, identifies systemic failure patterns, recalibrates per-category multipliers, and applies improvements automatically. The engine gets measurably better overnight. The Track Record page documents every improvement cycle — including the wrong calls — so users can verify the engine is actually learning.

**What it means for EdgeSetter:** After a situation reaches VERIFIED or is abandoned, a monitor agent would review the full ingestion trail: which sources were seen first, which ES Agents flagged it, what the confidence curve looked like, how the timing gap compared to the league average. It surfaces patterns: "CFB eligibility rulings from Power Four conferences reach VERIFIED 22 minutes faster than G5 schools — consider separate multipliers." "Injury reports on Sundays have a 40% false-positive rate in week 1 — suppress until secondary source confirms." Proposals queue for human review before application. The pipeline is currently static between manual North Star updates. A monitor agent makes it self-improving within the bounds the North Star sets.

**North Star connection:** The pipeline is currently updated when failures are painful enough to surface (Sorsby case). A monitor agent systematizes what is currently reactive.

---

#### 3.2 Story Clustering — Related Situations as a Single Object
**Source:** Perigon ("story object" model — clustering engine groups related articles into one unified entity with auto-generated recap, citations, and aggregate confidence; reduces noise by an order of magnitude)

**What it is:** Perigon's clustering engine links related articles into one "story" object with a unified confidence score and auto-generated recap. Rather than surfacing 12 separate articles about the same developing situation, the platform produces one story with a source count, aggregate confidence, and timeline. The story object is the unit of intelligence, not the individual signal.

**What it means for EdgeSetter:** A player's injury report, practice participation report, and game-time decision are three signals about one story. Currently they may surface as three separate cards, each with its own confidence score. A story cluster would show a unified card with the confidence journey across all three signals — a cleaner timing advantage display, a richer evidence picture, and a more meaningful source count. "6 ES Agents monitoring / 5 sources agree" across the cluster is more informative than "2 ES Agents / 1 source" on any individual signal. The story becomes the unit, consistent with the North Star hierarchy: the sports story first.

**North Star connection:** *"The hierarchy of every page: 1. The sports story (what happened, who it involves). 2. The evidence."* Clustering is what makes a collection of signals into an actual story.

---
---

## Part 2: Visual Layout Research
*Sites researched for UI patterns that would benefit EdgeSetter and its users. Organized by what each contributes.*

---

### 2.1 Robinhood (robinhood.com) — Card Architecture & Escalating Color Language

**What they do well:**
Robinhood's core UI innovation is that all data is organized into modular, interactive card "blocks." Each card displays a stock, ETF, or crypto with just enough information to convey status at a glance — color communicates direction instantly (green = up, red = down) without the user reading a number. Tapping a card expands it into full detail: chart, news, buy flow. The hierarchy never inverts. Most importantly, Robinhood uses color as a functional language, not decoration — color communicates real-time data and status without alerts or popups.

**What EdgeSetter should borrow:**
- Color-as-state: DETECTED → amber/yellow, ESCALATING → orange, VERIFIED → green, CONFLICTING → red. The card border or left accent bar communicates verification state before the user reads a word.
- The expand pattern: compact card on the homepage shows sport, player, signal type, confidence score, timing gap, source count. Tapping expands to full evidence view, source breakdown, confidence journey timeline. The user never has to navigate away from the feed.
- Notifications as information, not engagement bait. Robinhood only pushes notifications that contain complete information — no "tap to find out more." EdgeSetter alerts should include the full timing advantage callout in the notification body.

**Relevant source:** Robinhood's design philosophy — *"color is used to quickly show what's going on. Just a quick look lets users see which stocks are going up, which are going down, and which are staying the same."*

---

### 2.2 Bloomberg Terminal / Robinhood Legend — Multi-Panel Intelligence Layout

**What they do well:**
The Bloomberg Terminal is the canonical example of information density done right. Multiple data streams run simultaneously in a structured grid. Each panel has a defined purpose. The user configures their layout once and it persists. Robinhood Legend brought this paradigm to a modern, consumer-friendly interface: customizable multi-panel layout, real-time data feeds, news panels, and watchlists running side by side. Legend supports up to 8 simultaneous charts, each updating in real time.

**What EdgeSetter should borrow:**
- The multi-panel layout for power users: a league board where the left panel shows the live situation feed (DETECTED → ESCALATING → VERIFIED), the center panel shows the lead story with full evidence, and the right panel shows source activity in real time (ES Agents currently monitoring X sources). This is the "this system knows something the other sites don't have yet" feeling the North Star describes — but made visible in the layout, not just described in copy.
- Persistent watchlist: users pin players or teams they care about and see a dedicated panel that escalates whenever an ES Agent detects movement on those situations.
- The keyboard-shortcut mindset: power users of sports intelligence (DFS, betting, fantasy) want speed. Bloomberg users navigate by command. EdgeSetter's power users should be able to move between league boards and drill into situations without a mouse.

---

### 2.3 Sleeper Fantasy App — Real-Time Feed with Instant Status Badges

**What they do well:**
Sleeper is the benchmark for sports news feed UX in the fantasy/DFS context. Their feed is fast, personalized, and status-coded. Player news surfaces instantly with clear visual status: injury reports have color-coded availability badges (Out, Questionable, Probable, Active) that update in real time. The feed is chronological and scannable. Notifications are precise — breaking news comes with enough context that the user doesn't need to open the app.

**What EdgeSetter should borrow:**
- The status badge pattern: every situation card should have an immediately readable state badge (DETECTED / ESCALATING / VERIFIED) in a consistent position on the card, with color encoding state. Sleeper's Out/Questionable/Probable maps almost exactly to EdgeSetter's DETECTED/ESCALATING/VERIFIED.
- Feed velocity signaling: Sleeper surfaces how fresh each update is (timestamps, "just now" labels). EdgeSetter's timing advantage display — "47 min before ESPN" — should be just as prominent as the timestamp, not hidden in detail views.
- Personalization layer: users follow specific players, teams, or leagues. Their feed filters and prioritizes accordingly. EdgeSetter's league boards are the current equivalent, but a player-level watchlist (as in Tier 3.2) would make this genuinely personal.

---

### 2.4 PolyRadar — Confidence Journey Timeline Visualization

**What they do well:**
PolyRadar shows a timeline visualization for every event — when each independent AI model weighed in, how confidence moved across time, where disagreement emerged and resolved. The timeline is the core UX. It answers not just "what is the confidence score" but "how did we get here" — which is the EdgeSetter value proposition stated in visual form.

**What EdgeSetter should borrow:**
- The confidence journey as a visual element, not a text element. A two-point timeline (first detected → verified) rendered as a horizontal bar with labeled milestones is faster to read than a sentence. A multi-point timeline (detected → first corroboration → agent consensus → public confirmation) tells the full story.
- Source transparency panel: PolyRadar shows exactly which sources are feeding its analysis and whether they agree. For EdgeSetter, this is the "3 sources / 2 agree, 1 conflicting" display the North Star already requires — but rendered as a small panel in the card detail view, not as text.
- Model disagreement as a visual: when agents disagree, PolyRadar shows the spread visually (not just a number). For EdgeSetter, this could be as simple as showing agent confidence scores as a small distribution rather than a single number when conflict exists.

---

### 2.5 Metaculus — Forecast Evolution Display & Resolution Criteria

**What they do well:**
Metaculus surfaces the evolution of a forecast over time as a core feature — not an afterthought. Every question shows a chart of how community confidence moved from opening through resolution. Resolution criteria are stated explicitly upfront so users know exactly what would cause the system to flip from DEVELOPING to VERIFIED. The platform "prioritizes information density and clarity over visual simplicity."

**What EdgeSetter should borrow:**
- Explicit resolution criteria on every card. Metaculus questions always state: "This resolves YES if [specific condition]." For EdgeSetter, every situation card should show what would advance the confidence score: "Advances to VERIFIED when: primary source confirms + no conflicting signals remain + agent consensus ≥ threshold." This is transparency, not complexity — it makes the confidence score legible.
- The forecast evolution chart: even a simple sparkline showing how confidence moved from detection to current state is more informative than a static number. Metaculus makes this the central visual element. EdgeSetter should make it the central element of the story detail view.

---

### 2.6 Cybersecurity SOC Dashboards — Alert Prioritization & Threat-First Layout

**What they do well:**
Security Operations Center dashboards (Splunk, Primer Command, IBM QRadar, custom SOC builds on Dribbble/Behance) have solved a problem EdgeSetter faces: how do you surface the most important signal in a continuous stream of data, without training analysts to ignore everything because alert volume is too high? SOC dashboards use: severity tiers (Critical / High / Medium / Low), mean time to detect (MTTD) as a headline metric, source-of-truth attribution for every alert, and a lead story layout that pins the highest-priority situation at the top regardless of recency.

**What EdgeSetter should borrow:**
- Alert fatigue prevention: not every signal should surface to the homepage. SOC dashboards use signal suppression for low-confidence or routine events. EdgeSetter already has `isRoutineRosterMove` suppression and `leagueActivityMultiplier`. The SOC design pattern validates this: suppress the noise, elevate the signal, and make the suppression logic visible to power users (a "suppressed" count showing how many signals were filtered).
- The lead story as a pinned top card: SOC dashboards always pin the highest-severity active incident at the top. EdgeSetter's homepage should always have a lead card — the single highest-priority situation currently in the pipeline — that stays pinned until it resolves or escalates.
- MTTD equivalent: Mean Time to Detect is the SOC's proof-of-value metric. EdgeSetter's equivalent is `detectionLeadMinutes` — the timing advantage. SOC dashboards put MTTD in the headline. EdgeSetter should put the timing advantage in the headline of every verified story, exactly as the North Star requires.

---

### 2.7 PFF (Pro Football Focus) — 0–100 Grading with Evidence-Layer Transparency

**What they do well:**
PFF's 0–100 player grade system is the sports intelligence industry benchmark for a confidence score that users trust. They achieved trust through two things: consistency (every player graded on every play using the same methodology) and transparency (the grade is explained — not just "82.3" but what drove it). Their AI Key Insights tool (launched Jan 2025) translates advanced matchup data into plain-language narratives explaining *why* a player holds an edge.

**What EdgeSetter should borrow:**
- The evidence narrative under every score. PFF doesn't just show 82.3 — it shows what contributed. EdgeSetter's confidence score should always be accompanied by a one-line evidence summary: "3 sources / 2 agree, 1 conflicting — primary source: SID post, 14 min ago." This is exactly what the North Star requires, and it's what PFF proved users will pay for.
- The 0–100 scale as a trust anchor. PFF trained users to read 0–100 as meaningful. EdgeSetter's 0–100 confidence scale can become similarly trusted if the score is always explained and never shows doubt on settled facts (the North Star's non-negotiable rule).
- Plain-language signal summaries. PFF Key Insights uses LLM-generated narratives explaining data-driven conclusions in plain English. EdgeSetter's story copy should follow the same principle: never template language, never AI-sounding copy, always written as sports intelligence language.

---

### 2.8 AI Confidence Visualization Patterns (aiuxdesign.guide) — UX Design Standards for Confidence Display

**What they do well:**
The AI design pattern community (aiuxdesign.guide, agentic-design.ai) has converged on a set of standards for displaying AI confidence to end users:
- Use 0–100% OR Low/Med/High — not both simultaneously
- Color-coded borders or fills: green for high confidence, amber for medium, red for low or conflicting
- Show what *drives* confidence, not just the number
- Provide confidence calibration with historical accuracy (tell users what 80% has meant in practice)
- Show uncertainty ranges, not just point estimates
- Use confidence indicators *only where the stakes of being wrong are meaningful* — don't over-indicate on every element or users stop reading them

**What EdgeSetter should borrow:**
- The "over-indication" warning is critical. The North Star already addresses this: show VERIFIED (not 90%) when verified; show the score only during the journey. The UX design standard agrees — once a confidence state resolves, show the label, not the number.
- Color-coded borders as the primary confidence signal on cards. A green left border = VERIFIED, amber = ESCALATING, gray = DETECTED. The user reads the card state before reading a word.
- Calibration disclosure: *"When EdgeSetter shows 80% confidence, what has that meant historically?"* Once the Tier 2.3 calibration review produces data, this disclosure becomes a genuine trust feature — not a disclaimer, but proof.

---
---

## Part 3: Consolidated Priority List

*Updated June 19, 2026 to reflect current build status against the 8 subscriber-ready criteria.*

---

### Subscriber-ready sprint — build these now

These map directly to the 8 subscriber-ready criteria. None are fully done as of June 19, 2026.

1. **Team image assets** — drop real photos at `public/sports/teams/[abbr].jpg` (no code, unblocks criterion 4 immediately)
2. **Confidence journey timeline** on story detail view — NOT BUILT, criterion 6 (PolyRadar + Metaculus + North Star Amendment 6)
3. **CFB timing callout with source type naming** — NOT BUILT, criterion 7 ("School SID · 47 min before ESPN", North Star Amendment 7)
4. **Agent disagreement pip display** on lead story — needs UI review, criterion 5 (PolyRadar + Polyseer + North Star Amendment 5)
5. **Color-as-state card borders** — needs UI review (Robinhood + AI confidence visualization patterns)
6. **NBA/MLB sidebar drift fix + ticker breakout** — partially done, criterion 8
7. **Conservative bias correction** in pipeline — not built (PolyEdge AI + tobacco pipeline)
8. **Expand-on-tap card pattern**: compact → full evidence (Robinhood)

### Post-subscriber-ready — pipeline work

9. Manako Vision Agent integration — implementation prompt written, Archie Grant call scheduled (see Part 4)
10. Critic agent — evidence gap detection before confidence advances, now defined in North Star (Polyseer)
11. NFL/NBA/MLB source taxonomy — extend primary/secondary classification from CFB (Perigon)
12. Post-resolution calibration review — internal scoring (PolyEdge AI + tobacco pipeline)
13. Coordinated signal anomaly detection (Primer Command + Cyabra)
14. Explicit resolution criteria visible on every card (Metaculus)

### Strategic builds — longer horizon

15. Self-improving monitor agent / overnight calibration routine (PolyEdge AI + loop engineering routines)
16. Story clustering — related signals as a unified object (Perigon)
17. Multi-panel power-user layout (Robinhood Legend + Bloomberg Terminal)
18. Player/team watchlist with dedicated feed panel (Sleeper)
19. Subnet 44 validator node — network participation (see Part 4, Path 3)

---

## Appendix: Source Index

| Platform / Source | Category | Key contribution |
|---|---|---|
| PolyEdge AI (polyedgeai.com) | Prediction markets | 6-model ensemble, overnight CRPS calibration loop, Opus monitor agent, favourite-longshot bias correction |
| PolyRadar (polymark.et/product/polyradar) | Prediction markets | Multi-model parallel analysis, timeline visualization, source transparency, disagreement scoring |
| Polyseer (polymark.et/product/polyseer) | Prediction markets | 5-agent pipeline with Critic, Bayesian aggregation, bilateral evidence gathering |
| Perigon (perigon.io) | News intelligence | Story object model, 150K+ source taxonomy, clustering engine, real-time ingestion |
| Primer Command (primer.ai) | Gov/defense intelligence | Speed-advantage as core value prop, narrative anomaly detection, early-warning signals hours ahead |
| Cyabra (cyabra.com) | Narrative intelligence | Coordinated inauthenticity detection, authenticity scoring, evidence-backed confidence |
| Frontiers AI tobacco pipeline (doi:10.3389/frai.2025.1659861) | Academic | 3-agent pipeline, 5-level credibility scale, source quality weighting, Cohen's κ = 0.68, conservative bias finding |
| MAFC framework (Nature Scientific Reports, 2026) | Academic | Multi-agent fact-checking, credibility scoring aggregation, unique-source agents |
| Robinhood (robinhood.com) | Financial trading | Card architecture, color-as-state, expand-on-tap, notification philosophy |
| Robinhood Legend (robinhood.com/legend) | Financial trading | Multi-panel layout, customizable watchlists, real-time data feed panels |
| Bloomberg Terminal | Financial trading | Information density standard, multi-panel grid, news + data simultaneous display |
| Sleeper (sleeper.com) | Fantasy/DFS | Real-time feed, status badge pattern, personalized alerts, feed velocity signaling |
| Metaculus (metaculus.com) | Forecasting | Forecast evolution chart, explicit resolution criteria, calibration disclosure |
| PFF (pff.com) | Sports analytics | 0–100 grading trust, evidence narrative under score, AI Key Insights plain-language summaries |
| SOC dashboards (Primer, Splunk, IBM QRadar) | Cybersecurity | Alert prioritization, lead story pinning, suppression count, MTTD as headline metric |
| AI confidence visualization patterns (aiuxdesign.guide) | UX design | Color-coded state borders, over-indication warning, calibration disclosure standard |
| Score Technologies / Subnet 44 (wearescore.com) | Decentralized vision AI | Decentralized miner competition, 3-phase pipeline, 60-day trial model, TEE data privacy, self-service API roadmap |
| Manako (manako.ai) | Vision Agent platform | Plain-language Vision Agent deployment, webhook output, Archie Grant (co-founder) contact |
| TaoWeave (Nasdaq: TWAV, taoweave.com) | North American Manako distributor | Distribution agreement signed May 28, 2026 — US/Canada commercial partner for Manako |
| Max Sebti — Hash Rate podcast transcript | Primary source | 60-day trial model, TEE architecture, 100% conversion rate, data privacy, self-service API roadmap, competitor analysis |
| Max Sebti — X post June 19, 2026 (@MaxScore) | Primary source | VLM development: distilling all SN44 miner skills into one small natural-language model, multi-teacher distillation |
| Loop Engineering overview (Addy Osmani, June 2026) | Architecture | 6-part loop framework, DOER/CHECKER principle, /goal command, worktree isolation concept, cap/guardrail rule |

---

## Companion Documents

These documents exist alongside this working doc and are referenced but not duplicated here:

| Document | Purpose | When to use |
|---|---|---|
| `EdgeSetter_NorthStar_Amendments.md` | 7 surgical additions to the North Star | Archived — amendments have been merged into the North Star |
| `EdgeSetter_Subnet44_Research.md` | Full technical deep-dive on Score/Manako/SN44 | Before the Archie Grant call; before Manako sprint begins |
| `EdgeSetter_Manako_Implementation_Prompt.md` | Complete developer spec for Manako webhook integration | Hand to developer or drop into Claude Code with /goal when Manako sprint starts |
| `EdgeSetter_ThisWeek_Actions.md` | Contact list and action checklist for Score/Manako outreach | Reference during outreach; archive once Archie call is complete |

---

*Document status: Living document. Version 2.0 — June 19, 2026. Update when new platform research is completed, North Star is revised, or build status changes.*

## Part 4: Subnet 44 (Score / Manako) — Leverage Strategy

*Research completed June 2026. Sources: Score Technologies whitepaper, Manako product documentation, TaoWeave press release (May 28, 2026), Hash Rate podcast transcript with Max Sebti (Founder/CEO), Bittensor subnet architecture documentation, Max Sebti X post June 19 2026 re: VLM development.*

---

### What Subnet 44 actually is

Subnet 44 is **Score Technologies** (wearescore.com) — a decentralized computer vision network running on Bittensor. Hundreds of miners worldwide compete continuously to produce the best sports vision AI models. The best win, the worst get replaced. Nobody manages the improvement cycle — competition drives it automatically. Their product **Manako** (manako.ai) sits on top of this network: describe what you want a camera to watch for in plain English, Manako deploys a Vision Agent that monitors 24/7, detects the event the instant it happens, and fires a structured signal to any webhook, Slack, or email. No new hardware, no engineers, no code.

Score's three-phase pipeline: (1) annotation — video into structured data; (2) event recognition — identifying what happened; (3) predictive insight — forward-looking analysis. EdgeSetter's text-based pipeline mirrors this exactly in a different modality. Score inputs video frames. EdgeSetter inputs text signals. Both output structured intelligence with confidence scores. Both prove value through timing advantage over manual human analysts.

---

### The core unlock — a new signal tier above SID posts

EdgeSetter's current earliest possible detection is a text signal — a tweet, a SID post, a wire item. The physical event (injury, player exit, press conference absence) happens before anyone writes about it.

Manako Vision Agents watching camera feeds detect that event at the moment it occurs — before any reporter processes it and translates it into text. That visual signal enters EdgeSetter's pipeline as `sourceType: "vision_agent"`, `sourceTier: "primary_visual"` — the highest evidence tier because it predates all text signals.

The timing advantage callout changes from:
> "47 min before ESPN"

To:
> "Visual feed detected 9:14am · First text report 9:41am · ESPN 10:45am"

No text-based competitor — ESPN, The Athletic, PFF, Rotoworld, Sleeper — can replicate this without rebuilding their entire architecture around camera access.

---

### What we learned from the founder interview (Hash Rate transcript, June 2026)

Max Sebti confirmed several things in the podcast transcript that matter directly for EdgeSetter's integration:

**The 60-day trial is their standard sales motion.** Every customer starts with a 60-day trial. Score's subnet competes against the customer's current human operators. If Score wins, the customer converts to a paid monthly subscription. 100% conversion rate so far. When Archie Grant gets on the call, he will likely propose this structure. It's low risk — Score proves value before EdgeSetter pays anything.

**Two tracks: public (open source) and private (TEE-protected).** For enterprise customers, Score runs processing inside Trusted Execution Environments on either Hugging Face or Targon. Customer data never touches a miner's machine directly. EdgeSetter's source taxonomy, signal data, and confidence scoring logic would be protected. This eliminates the "random miners seeing our data" objection entirely.

**Every customer signs a distribution agreement.** Score asks all trial customers to help distribute the product within their industry when it works well enough. Reading FC will help Score sell to other football clubs. The petroleum company will help expand to other gas station operators. When EdgeSetter becomes a customer, Score will want the same — EdgeSetter helps Score expand in the US sports intelligence market. This is a fair deal: Score gets US distribution, EdgeSetter gets first-mover access.

**The self-service API is the long-term product.** The 60-day enterprise trials are a data acquisition strategy as much as a revenue strategy. Score needs private data from different verticals to improve their models. EdgeSetter's sports intelligence signals are valuable training data for Score's sports-related models. The enterprise cycle ends with a swipe-your-credit-card self-service API — like AWS. The current sales cycle is transitional.

**Score's biggest competitors are ChatGPT and Claude.** Their advantage: lightweight, fast, specific. A general LLM handles one frame reasonably well but fails on video sequences. Score wins on video.

---

### The VLM development (Max Sebti X post, June 19, 2026)

Max posted this morning that he is distilling every specialized skill from every SN44 miner into a single small model that speaks natural language — a Vision Language Model (VLM). Key technical insight from the post: "a model that copies one teacher is capped at that teacher, so we get it to reconcile two instead and it beats both."

This matters for EdgeSetter specifically because the VLM outputs plain English, not structured bounding box data. Instead of a mapper translating a structured event object into EdgeSetter's schema, the VLM fires: "Player 23 appears to be holding his left knee, attended by two medical staff, has not stood up in 45 seconds." That is text. EdgeSetter's pipeline already processes text. The integration becomes near-trivial when the VLM ships.

Status: research phase, running on a single H100 via @lium_io. Not a shipped product. Timeline unknown. Ask Archie Grant about the roadmap on the call.

---

### The broadcast feed access question — the honest caveat

The most valuable signal sources (NFL, NBA, CFB, MLB broadcast feeds) are owned by ESPN, Fox, CBS, NBC, and Amazon. Accessing live broadcast streams programmatically involves rights agreements that Score does not currently have. Broadcast streams also have 30–60 second delays built in for rights management.

**This does not kill the concept. It redirects where to start.**

The cameras that matter most for EdgeSetter's specific signal types are team-controlled and always accessible:

- **Practice facility cameras** — teams own these. A walking boot at 10am fires 90 minutes before the official NFL injury report. This is the highest-value signal type for DFS/fantasy.
- **Press conference room cameras** — teams control these entirely. An empty seat at 1:01pm fires before any reporter finishes their notes.
- **Stadium warmup cameras** — in-venue cameras controlled by the team or a media partner. A WR leaving warmups with trainers at 10:46am fires 44 minutes before the official inactive list drops at 11:30am.

These three camera types cover the exact signal types EdgeSetter needs most and require no broadcast rights negotiations. Start here. The broadcast feed question is a legal problem to solve in a later phase.

---

### Outreach status (as of June 19, 2026)

**Manako (Archie Grant):**
Archie Grant (co-founder, Manako Labs) responded to outreach and has scheduled a call for next week. He confirmed they will "walk through everything." Archie is a co-founder — not a sales rep. This is a direct founding team conversation.

Key questions for the call:
- What camera feeds can Manako connect to for US sports specifically?
- What does the structured event payload look like — webhook format, latency, fields?
- How does the 60-day trial work and what data do they retain?
- Where does the VLM sit on the roadmap?
- How does the TaoWeave North American distribution deal affect a commercial arrangement?

**Score Technologies (Max Sebti):**
- Personal X: @MaxScore (active, posting technical updates)
- Secondary handle: @mxmsbt
- Company X: @webuildscore
- Discord: "max [τ,η] SN44" in discord.com/invite/wearescore

**TaoWeave (North American distributor):**
TaoWeave (Nasdaq: TWAV) signed the North American Technology License and Distribution Agreement with Manako Labs on May 28, 2026. They hold US and Canada rights with revenue sharing and referral fees built in. If a formal commercial arrangement in North America requires Manako's product layer, TaoWeave is the right commercial door. URL: taoweave.com

---

### Three paths to leverage

**Path 1: Manako API integration — first move**
Register at manako.ai, configure the four Vision Agents in plain English (injury on field, player early exit, press conference absence, practice attendance), wire events to EdgeSetter's pipeline via webhook as `sourceType: "vision_agent"` / `sourceTier: "primary_visual"`. Full implementation spec: `EdgeSetter_Manako_Implementation_Prompt.md`.

**Path 2: Score Technologies partnership**
EdgeSetter is the downstream intelligence layer that gives Score's visual detections meaning. Score provides the upstream visual layer that no text-based competitor can touch. EdgeSetter provides US sports market validation that Score doesn't have. The pitch, DM templates, and contact details are documented in `EdgeSetter_ThisWeek_Actions.md`.

**Path 3: Subnet 44 validator node — strategic**
Running a validator gives EdgeSetter direct access to raw structured annotation data across 400,000+ matches and 280+ leagues. This becomes the historical training set for Phase 3 of the pipeline (predictive intelligence). Score's reward formula — `Reward = (Accuracy + Availability − Latency) × (1 + α × Benchmark)` — adapts directly to EdgeSetter's ES Agent weighting, replacing hand-set North Star multipliers with data-derived weights.

---

### Execution timeline (updated)

| When | Action | Status |
|---|---|---|
| Done | Register Manako early access | Complete |
| Done | Contact Archie Grant (manako.ai) | Response received — call scheduled |
| This week | DM Max Sebti @MaxScore on X | Not sent yet |
| This week | Join Score Discord | Not done yet |
| Call week | Archie Grant call — full product walkthrough | Scheduled next week |
| Post-call | Build Manako webhook integration | Pending call outcomes |
| This quarter | Visual signals live in EdgeSetter pipeline | Pending |
| Strategic | Stand up Subnet 44 validator node | Queued |

---

## Part 5: Loop Engineering & Pipeline Architecture

*Research: June 2026. Source: Loop Engineering overview (Addy Osmani, June 2026), Claude Code /goal command documentation.*

---

### EdgeSetter is already a loop engineering system

Loop engineering is building a system that prompts your AI on a schedule and against a goal, instead of typing each prompt yourself. The six components of a loop and their EdgeSetter equivalents:

| Loop component | EdgeSetter equivalent | Status |
|---|---|---|
| Automations (timer starts the job) | ES Agents run continuously, no human trigger | Built |
| Goal / checker (AI works until finish line) | `verificationState: VERIFIED` is the finish line | Built |
| Skills (saved instructions for how to do the task) | The North Star document | Built |
| Connectors (plug-ins to real tools) | X, wire services, Manako (coming) | Built |
| Memory (notes file outside the chat) | Signal history + confidence log | Built |
| Sub-agents (one AI does work, another checks it) | ES Agent pool + Critic agent (Critic: North Star Amendment 3) | Partial |
| Worktrees (isolated work areas per agent) | Not explicitly defined — gap | Missing |

EdgeSetter was built as a loop engineering system without using that vocabulary. Five of six components are already there.

---

### Two gaps the loop engineering framework reveals

**Worktrees — the missing isolation layer.** Multiple ES Agents processing the same signal concurrently could write conflicting confidence scores to the same signal record. The worktree concept means each agent gets an isolated work area. North Star Amendment 4 defines the fix: a write lock or queue per signal ID so only one agent updates a record at a time. Race conditions in confidence scoring are a product integrity failure.

**The cap/guardrail rule.** The loop engineering principle is explicit: always cap the loop so it can't run forever. EdgeSetter's equivalent is the 72-hour abandonment rule (North Star Amendment 2): any signal not advancing past DEVELOPING in 72 hours is automatically ABANDONED. Without this, dead signals accumulate in the pipeline indefinitely as volume scales.

---

### Using /goal in Claude Code to build EdgeSetter

The `/goal` command in Claude Code gives the AI a finish line it can check and keeps working until it crosses it. This is directly applicable to building EdgeSetter features:

To implement the Manako integration (full spec in `EdgeSetter_Manako_Implementation_Prompt.md`):
```
/goal implement the Manako Vision Agent webhook integration per the spec
in EdgeSetter_Manako_Implementation_Prompt.md, keep going until the
webhook endpoint is live, all four Vision Agent types are mapped to the
correct signal types, confidence scoring is applied, and the test
checklist passes — do not modify any existing pipeline files outside the
spec, stop after 50 turns
```

To build the confidence journey timeline (subscriber-ready criterion 6):
```
/goal build the confidence journey timeline component per North Star
Amendment 6 spec, keep going until it renders correctly on a verified
CFB story with detectionLeadMinutes populated, stop after 30 turns
```

The overnight calibration review (Tier 1.2) and self-improving monitor agent (Tier 3.1) are both routines in loop engineering terms — schedule them in Claude Code's routine feature and they run themselves on a timer.

---

## Part 6: Build Status — June 19, 2026

*Snapshot. This section will go stale — treat it as context, not current truth.*

---

### What's done

- All banned DFS/market copy removed from `LiveIntelligenceHome.tsx`
- Gate 1 (story type eligibility tier table) — `storyTypeTiers.ts`
- Gate 2 (game proximity score) — `gameProximityScore.ts`
- `leadRanker.ts` rebuilt with both gates — 62 tests passing
- `mapVerificationDisplayState()` — fixes NBA board showing raw "monitoring"
- `teamLogoResolver.ts` — fixes SF Giants/49ers token collision
- `public/sports/nfl/featured.jpg` — stops NFL cards hitting catch-all
- 203 tests passing, 0 failing, TypeScript clean

### 8 subscriber-ready criteria — current status

| # | Criterion | Status |
|---|---|---|
| 1 | "Knows things before other sites" within 5 sec | Needs user test |
| 2 | At least one story with visible timing advantage callout | Needs live data |
| 3 | Confidence scores display correctly | Partial — full audit needed |
| 4 | No broken logos / placeholder imagery | **Blocked — team photo directory empty** |
| 5 | Source count visible on lead story without clicking | Needs UI review |
| 6 | Verified story shows confidence journey, not just VERIFIED badge | **Not built** |
| 7 | CFB timing callout names source type (primary vs wire) | **Not built** |
| 8 | All league boards match homepage layout | Partial — NBA/MLB sidebar drift |

**Zero of 8 fully clear as of June 19, 2026.**

### Immediate next actions

1. Drop team images at `public/sports/teams/[abbr].jpg` — no code, unblocks criterion 4 today. Priority: PIT, COL, LAA, ATH, TOR, CHC, CWS, DET
2. Build confidence journey timeline (criterion 6) — use `/goal` in Claude Code with Amendment 6 spec
3. Build CFB timing callout with source type naming (criterion 7) — Amendment 7 spec
4. Audit source count display (criterion 5)
5. Fix NBA/MLB sidebar drift (criterion 8)
6. User test criterion 1 with a neutral observer
7. Verify live data for criterion 2

### Not in scope until all 8 criteria pass

Manako integration, Source page, My Edge page, Team-level routing, Critic agent, validator node.

---

