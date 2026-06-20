# EdgeSetter × Subnet 44 (Score): Deep-Dive Research

**Compiled June 2026 — Tech & Research Analysis**
*Based on: Score Technologies whitepaper, published methodology, Manako product documentation, Bittensor subnet architecture documentation, and cross-referenced against the EdgeSetter North Star.*

---

## What Subnet 44 Actually Is

Subnet 44 is called **Score** — built by Score Technologies (wearescore.com). It is a decentralized computer vision network running on the Bittensor blockchain. It does not run AI models centrally. Instead, it runs a **competitive marketplace** where hundreds of independent miners around the world compete continuously to produce the most accurate computer vision models. The best models win. The worst get replaced. Nobody manages the improvement cycle — the competition drives it automatically.

Score has two distinct layers:

**Score Vision** — the infrastructure layer. Decentralized miners process sports footage (currently football/soccer, expanding to cricket and other sports). They watch video and return structured data: player positions, ball positions, pitch lines, game events — all expressed as bounding boxes and keypoints in a JSON file. This is what makes video into data.

**Manako** — the product layer built on top of Score Vision. Manako takes the same decentralized vision infrastructure and makes it accessible to anyone: describe what you want a camera to watch for in plain language, and Manako deploys a Vision Agent that monitors that camera, detects that event, and triggers an action the moment it happens. It runs at stadiums, warehouses, fuel stations, and retail environments. It won overall winner at Start in Block 2026 at Paris Blockchain Week out of 1,000+ applicants.

---

## How the Pipeline Works — In Technical Detail

Score Vision's full pipeline, as published in their April 2025 whitepaper:

**Step 1 — Clip & filter.** A full match is sliced into 30-second clips. A lightweight CLIP scan drops non-action footage (crowd shots, halftime) and keeps only on-field content.

**Step 2 — Open job board.** Clean clips hit Subnet 44. Any miner anywhere — running a consumer-grade gaming laptop or desktop GPU — can grab clips from the job board and process them locally.

**Step 3 — Miner processing.** The miner's model watches the clip and returns a slim JSON file containing: player bounding boxes, ball positions, pitch keypoints, and event tags — all frame-by-frame.

**Step 4 — Dual validation.** Validators sample each miner's submission using two fast checks: a CLIP semantic check (do the labels actually match the visual content?) and a homography geometric check (do the coordinates sit on a plausible pitch?). These checks are intentionally lightweight — they don't need to run expensive full models to validate.

**Step 5 — Score & pay.** Miners are scored and paid using this formula:

> **Reward_total = Reward_regular × (1 + α × G)**

Where:
- **Reward_regular = w1 × E + w2 × A − w3 × T**
  - E = accuracy of outputs
  - A = availability / reliability
  - T = processing time (penalized — speed matters)
  - w1, w2, w3 = adjustable weights
- **G = benchmark score** (0 to 1, from tougher challenge tasks)
- **α = scaling factor** controlling how much benchmarks amplify the daily reward

In plain English: miners are paid for being accurate, reliable, and fast. But they can earn extra by excelling at harder benchmark tasks. This creates **two simultaneous competition loops**: one driving cost down, one driving performance up.

**Step 6 — Assembly.** The validator stitches approved clips into a full match timeline. A 30-second clip gets processed in 3 seconds. An entire match takes minutes, not days. The claimed improvement: 1,000× faster and 100× cheaper than manual annotation.

---

## The Manako Vision Agent Model — Why It Matters More Than the Sports Pipeline

Manako is what Score alluded to becoming, and it's the layer most directly applicable to EdgeSetter.

A Vision Agent is simple to describe: **watch for this specific event → understand when it occurs → trigger an action immediately.** Manako's claim: enterprises act on less than 2% of what their cameras capture. A Vision Agent fixes that by making every camera an intelligent sensor rather than a passive recorder.

The critical architecture point: **Manako doesn't need operator management.** Because Score Subnet 44 runs continuous competitive improvement, the model powering a Vision Agent today is automatically better than the one from six months ago. The network handles updates. The operator sets the task once. Score's own framing: "the Vision Agent watching your loading bay today is more accurate than the one from six months ago, without you touching a setting."

Manako's interface is deliberately plain-language: describe what to detect, provide images or video, and the system handles optimization, deployment, and execution. The internal model architecture is abstracted entirely.

---

## The Five Things EdgeSetter Can Take From This

---

### 1. The Vision Agent Pattern Applied to Sports Broadcast Feeds

**What Score/Manako does:** A Vision Agent watches a camera feed, detects a specific event, and triggers an action immediately — before any human notices and writes about it.

**What EdgeSetter can do:** Apply the same pattern to sports broadcast footage and stadium cameras as a new class of signal source.

EdgeSetter's current pipeline is entirely text-based: SID posts, beat writer tweets, wire pickups, X accounts. But the physical event happens before anyone writes about it. A player limps off the field before the injury report is filed. A player doesn't show up to a press conference before anyone tweets his absence. A player walks out of a facility before any reporter covers it.

A Vision Agent watching a broadcast feed or a stadium's publicly available camera stream would detect these events as they happen — not when someone writes about them. This is an entirely new class of primary source that doesn't exist in EdgeSetter's pipeline today. It would expand the timing advantage from "before the wire" to "before the reporter even sees it."

**Specific applications:**
- Practice absence detection: Vision Agent watching facility entrance cameras detects a player isn't present before practice reports surface on social media
- Injury detection from broadcast: Vision Agent watching game broadcasts detects a player on the injury cart or being attended to by trainers before any sideline reporter tweets
- Press conference presence/absence: Vision Agent watching press conference room cameras detects who showed up and who didn't before media quotes surface
- Stadium activity: Vision Agent watching stadium cam feeds detects unusual player activity (early arrivals, facility lockdowns, equipment loading for travel)

**North Star connection:** This adds a new source type above SID posts on the trust hierarchy — a direct visual primary source that predates any human report. The timing gap callout becomes "EdgeSetter detected 31 minutes before first text report."

---

### 2. Decentralized Miner Competition as EdgeSetter's Self-Improving Model Layer

**What Score/Manako does:** Instead of Score managing AI model updates centrally, it runs a competitive marketplace. Miners improve their own models to stay competitive. The network automatically selects the best models and deprioritizes worse ones. Improvement is continuous and autonomous.

**What EdgeSetter can do:** Rather than EdgeSetter updating its signal-detection and classification models manually (the current approach, which required manual North Star document revisions after the Sorsby case), it could adopt the same competitive model layer architecture.

In practice this would mean: EdgeSetter defines the scoring criteria (accuracy against verified outcomes, latency, availability) and opens an API where independent model providers compete to produce the best signal classification outputs. The best models get more weight in the consensus engine. Worse models get less weight. No manual updates required — the competition drives improvement.

This is the Tier 3 self-improving monitor agent described in the working document — but implemented at network scale rather than as a single internal agent. The distinction is significant: an internal monitor agent is still a single point of failure that EdgeSetter operates. A competitive marketplace is self-sustaining.

**Score's reward formula adapted for EdgeSetter ES Agents:**

> **Agent_weight = w1 × Accuracy + w2 × Availability − w3 × Latency**
> **Final_weight = Agent_weight × (1 + α × Benchmark_score)**

Where Benchmark_score is measured against historical verified outcomes — the equivalent of Score's benchmark challenge tasks. Agents that are consistently first and consistently right earn more weight in the consensus. Agents that are slow or wrong lose weight automatically.

**North Star connection:** The North Star currently defines multipliers by hand (eligibility_ruling ×1.35, injury_update ×0.4 offseason). The competitive marketplace approach means those multipliers emerge from actual agent performance data rather than editorial judgment.

---

### 3. Lightweight Validation — The Dual-Check Architecture

**What Score/Manako does:** Score's validators don't run expensive full models to check miner outputs. They use two fast, cheap checks: a semantic check (does the label match the content?) and a geometric check (are the coordinates plausible?). This keeps validation cost low while maintaining accuracy, allowing the subnet to scale to thousands of clips without the validation layer becoming a bottleneck.

**What EdgeSetter can do:** EdgeSetter's current confidence scoring requires a full agent pass on every signal to advance the confidence state. As signal volume grows (more leagues, more signal types, more sources), this will become a bottleneck. Score's lightweight dual-check architecture solves this.

The EdgeSetter equivalent:
- **Semantic check:** Does this signal text actually contain the claimed entity (player name, team, event type)? A lightweight NER (named entity recognition) pass, not a full LLM verification.
- **Plausibility check:** Is this signal consistent with known context? (Is this player on this team? Is this the right league? Is this signal type plausible for this time of year?) A fast lookup against a context database, not an agent reasoning pass.

Only signals that pass both lightweight checks advance to the full ES Agent verification pipeline. Everything else is rejected at the gate with a low confidence score. This is the architectural equivalent of Score's CLIP + homography gate — it keeps the expensive processing reserved for signals that have already passed basic plausibility.

**North Star connection:** The North Star's `isRoutineRosterMove` suppression logic does something similar at the output end. Score's dual-check does it at the input end. Both are needed — input filtering reduces the load before it enters the pipeline; output suppression controls what surfaces to the user.

---

### 4. The Three-Phase Intelligence Pipeline — A Direct Architecture Mirror

**What Score/Manako does:** Score's full system runs in three phases:

- **Phase 1 — Annotation:** Raw video → structured data (who is where, what is happening, frame by frame)
- **Phase 2 — Event Recognition:** Structured data → event tags (tackle, goal, injury, etc.) with confidence scores
- **Phase 3 — Predictive Insight:** Event history + real-time data → forward-looking predictions (player availability, tactical tendency, match outcome probabilities)

**What EdgeSetter can do:** EdgeSetter's existing pipeline already mirrors this structure at a conceptual level, but making the phase boundaries explicit would unlock each phase's potential independently.

Phase 1 for EdgeSetter is **signal ingestion and structuring:** raw text from X posts, wire services, SID accounts → structured signal objects (entity, event type, source tier, timestamp, raw text). This is already happening.

Phase 2 is **event classification and confidence assignment:** structured signals → event type identified, source quality assessed, agent consensus reached, confidence score assigned. This is EdgeSetter's core pipeline.

Phase 3 is what EdgeSetter is positioned to add: **predictive intelligence.** Once you have a rich dataset of signals (when they were detected, what their confidence paths looked like, how they resolved) you can predict: what is the probability this ESCALATING signal becomes VERIFIED in the next 30 minutes? Which signal types tend to resolve quickly vs. stay in DEVELOPING for extended periods? Which leagues produce signals that are more reliable at the same confidence threshold?

Score built this pipeline for football video. EdgeSetter is building the same pipeline for sports information. The architecture is identical; the input modality is different.

**North Star connection:** Phase 3 is the capability the North Star doesn't yet define — the predictive layer that makes EdgeSetter forward-looking, not just real-time. Score's three-phase model makes it clear that annotation infrastructure (Phase 1) and event recognition (Phase 2) are prerequisites for prediction (Phase 3). EdgeSetter is already through phases 1 and 2.

---

### 5. The "Describe What to Detect" Interface — Natural Language Agent Deployment

**What Score/Manako does:** Manako's most user-facing innovation is its interface. Users don't specify model architectures or write detection logic. They describe what they want to see detected in plain language. The system handles the rest: model selection, optimization, deployment, and execution. The user interacts only with outcomes.

**What EdgeSetter can do:** Apply this same pattern to EdgeSetter's internal agent configuration layer, and eventually to an API or developer interface.

Today, EdgeSetter's signal types (eligibility_ruling, injury_update, transfer_portal_entry, etc.) are defined by the North Star document and coded manually. A Manako-style interface would let EdgeSetter's team — or eventually, partners and developers — define new signal types in plain language: "Watch for any CFB player from a Power Four school who announces a transfer portal entry with a remaining year of eligibility." The system handles the detection logic, source taxonomy, and confidence scoring framework automatically.

The deeper implication: as EdgeSetter expands to new leagues, new signal types, and new partnerships (team analytics departments, media partners, DFS platforms), a natural language agent deployment interface removes the manual bottleneck. New coverage areas don't require a North Star document revision — they require a plain-language description of what to watch for.

**North Star connection:** The North Star is currently the human-authored definition of what the system watches for and how it scores signals. Manako's architecture suggests the eventual path: the North Star becomes the governance document for how the natural language interface generates detection logic, rather than the detection logic itself.

---

## The Deeper Architecture Parallel — Why This Matters

Score and EdgeSetter are solving the same fundamental problem in different modalities.

Score's problem: sports video is a stream of continuous data. Manual analysts can watch a fraction of it. They miss things, arrive late, and can't scale. Score's solution: decentralized agents (miners) process the full stream in parallel, continuously. They detect events automatically. The best models get more weight. The timing advantage is inherent — the agents are watching everything, all the time.

EdgeSetter's problem: sports information is a stream of continuous text signals. Manual journalists can cover a fraction of it. They miss things, arrive late, and can't scale. EdgeSetter's solution: decentralized ES Agents monitor the full stream in parallel, continuously. They detect signals automatically. The timing advantage is the product.

**These are the same architecture applied to different input modalities.** Score inputs video frames. EdgeSetter inputs text signals. Both output structured intelligence with confidence scores. Both prove value through timing advantage over manual human analysts.

The distinction that makes this actionable: Score's visual intelligence layer produces evidence that predates text reports. A player injured on a field is captured by Score's Vision Agent before any reporter writes about it. That visual signal, fed into EdgeSetter's confidence pipeline, becomes an upstream source — one that advances the timing advantage beyond what text monitoring alone can achieve.

The combination is: **Score Vision generates the upstream visual signal → EdgeSetter's ES Agent pipeline receives it, cross-references it against text sources, builds consensus, and assigns confidence.** The timing advantage increases because the first detection happens at the physical event rather than the first report of the physical event.

---

## What Score Has That EdgeSetter Doesn't Yet (And Should)

| Score/Manako capability | EdgeSetter equivalent | Gap |
|---|---|---|
| Decentralized competitive model marketplace | ES Agent pool | EdgeSetter agents are internal; no external competition driving improvement |
| Lightweight dual-check gate (CLIP + homography) | `isRoutineRosterMove` suppression | EdgeSetter suppresses at output; Score gates at input — both needed |
| Three-phase pipeline with explicit phase boundaries | Implicit in pipeline | Phase 3 (predictive) not yet defined or built |
| Visual primary source (camera → structured event) | Text primary source (SID post → structured signal) | No visual input modality |
| Plain-language agent deployment interface | North Star document (manual) | New signal types require manual engineering |
| Self-improving via competition (no operator intervention) | Manual North Star revisions | Improvement is reactive, not continuous |
| Benchmark challenge tasks for model quality | None documented | No equivalent to Score's harder benchmark tasks for ES Agent quality |
| Per-agent performance weighting formula | Confidence multipliers (hand-set) | Multipliers are editorial, not data-derived |
| 400K+ match database with structured annotations | Signal history (growing) | EdgeSetter's dataset is newer and smaller; prediction layer requires volume |

---

## Recommended Integration Path for EdgeSetter

**Immediate (no new infrastructure):**
Adopt Score's dual-check input gate architecture. Before any signal enters the full ES Agent pipeline, run two fast checks: semantic (does this text contain the claimed entity?) and plausibility (is this signal type consistent with known context for this entity?). Reject at the gate with minimal compute. Reserve full ES Agent passes for signals that pass both checks.

**Near-term (new pipeline work):**
Formalize the three-phase boundary. Phase 1 (ingestion → structured object) and Phase 2 (classification → confidence score) are built. Define Phase 3 explicitly: a predictive layer that uses historical signal resolution data to produce forward-looking confidence estimates. This is the layer that makes EdgeSetter forward-looking, not just reactive.

**Medium-term (significant infrastructure):**
Build the per-agent performance weighting formula modeled on Score's reward function. Accuracy + Availability − Latency, amplified by benchmark performance against historical outcomes. This replaces hand-set multipliers with data-derived weights and creates continuous improvement without manual North Star revisions.

**Strategic (partnership / build):**
Explore a direct integration with Score/Manako to add visual signal sources to EdgeSetter's pipeline. Score's Vision Agent watching broadcast feeds or publicly available stadium cameras for specific events (player absences, injury incidents, press conference presences) would add a pre-text primary source layer. The timing advantage callout becomes: "First detected via visual feed at 9:14am — first text report at 9:41am — ESPN at 10:45am."

---

## Source Index

| Source | URL | Key contribution |
|---|---|---|
| Score Technologies — Deep Dive (Medium, May 2025) | medium.com/wearescore | Full pipeline architecture, reward formula, three-phase system |
| Score Vision GitHub (score-technologies/score-vision) | github.com/score-technologies/score-vision | Lightweight validation research paper, technical requirements |
| Manako Vision Agents — tao.media (May 2026) | tao.media/what-are-manakos-vision-agents | Vision Agent model, self-improvement without operator intervention |
| Score — Subnet Alpha interview (mid-2025 recording) | subnetalpha.ai/subnet/score | Three-phase system description, football analytics application |
| Bittensor Weekly Recap (SimplyTao, Jan 2026) | simplytao.ai | Manako launch details, CrunchDAO super-miner model |
| TaoWeave backs Manako (SimplyTao, June 2026) | simplytao.ai | Enterprise deployment, Business Operations World Model |
| SubnetEdge Briefing (Jan 2026) | subnetedge.substack.com | Manako as $100M ARR milestone, Subnet 44 strategic position |
| Astrid Intelligence (Proactive Investors, March 2026) | proactiveinvestors.com | Institutional investment, Score's real-world revenue validation |
| Bittensor123 SN44 overview | bittensor123.com/subnets/sn44 | Score Predict app, validator mechanics, base model details |

---

*This document is a living research file. Update when Score publishes new whitepaper versions or Manako expands to sports-specific Vision Agent deployments.*
