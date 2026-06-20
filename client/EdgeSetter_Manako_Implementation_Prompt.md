# EdgeSetter × Manako Vision API — Implementation Prompt

**Drop this entire prompt into Claude Code or hand to your developer as a complete spec.**

---

## Context

EdgeSetter is a real-time sports intelligence platform. Autonomous ES Agents monitor text sources (SID posts, beat writer tweets, wire services), cross-reference signals, build confidence scores, and surface verified sports information with a provable timing advantage over wire services.

The current pipeline is entirely text-based. The earliest possible detection is a text signal — a tweet, a SID post, a wire item. But the physical event (injury, player exit, press conference absence) happens before anyone writes about it.

We are integrating Manako Vision Agents as a new upstream signal source. When a Manako Vision Agent detects a sports event in a broadcast feed or camera, that structured event enters EdgeSetter's pipeline as a new source type with higher confidence weight than any text source — because it predates any text signal entirely.

**Source hierarchy after this integration:**
1. `primary_visual` — Manako Vision Agent (broadcast / camera feed) ← NEW, highest weight
2. `primary_text` — SID post, official team account, player account
3. `secondary_text` — verified beat writer, credentialed outlet
4. `wire` — AP, ESPN, The Athletic pickup

---

## Competitive Context — What We Are Disrupting and Why This Builds the Moat

Every implementation decision in this document should be understood against this backdrop. EdgeSetter is not building a better version of ESPN. It is building a categorically different product that makes the ESPN model obsolete for anyone who needs to know first.

---

### How the incumbents currently operate — and where they break

**ESPN**
ESPN's breaking news model is reporter-dependent. A reporter sees or hears something, files a story or tweets it, and ESPN's editorial layer picks it up. Their fastest possible detection is human reaction time — the moment a reporter's fingers hit a keyboard. On a major story, ESPN's wire pickup routinely arrives 30–90 minutes after the primary source. Their "breaking news" alerts are not breaking — they are confirmation of what primary sources said earlier. ESPN has no autonomous agent pipeline. They have no confidence scoring. They have no source transparency. They do not show you how they know what they know. They just tell you.

**The Athletic**
The Athletic produces deep, credentialed sports journalism. Their beat writers are often the primary source — they break stories because they have relationships and access. But that model has an inherent ceiling: a human beat writer can only be in one place at one time, can only monitor so many sources, and files stories on a human schedule. The Athletic does not have a real-time intelligence pipeline. They cannot monitor hundreds of sources simultaneously. They do not show confidence scores or source agreement. A subscriber reads The Athletic for analysis and depth — not to know first.

**PFF (Pro Football Focus)**
PFF's product is post-hoc performance grading — 0–100 scores on every player on every play, built from manual charting and AI-assisted tagging after the fact. Their AI Key Insights tool (launched January 2025) generates plain-language narratives from matchup data. PFF is genuinely excellent at what they do, but their domain is game performance data, not news intelligence. They do not detect real-time signals. They do not verify transactions, injury reports, or roster moves as they happen. Their data is deep but backward-looking. PFF is not a competitor in the real-time intelligence space — but their 0–100 trust model is what EdgeSetter's confidence scoring must achieve for news signals.

**Rotoworld / Rotowire / NFL.com injury reports**
These are human-edited news feeds. Editors monitor sources and manually enter player status updates. The model is: human editor sees tweet → human editor enters update → feed updates. There is no autonomous pipeline, no confidence scoring, no source transparency, no verification layer. Speed is limited by editor availability and shift schedules. A Rotoworld update at 2am on a Sunday is slower than at noon on a Tuesday. EdgeSetter's pipeline never sleeps and does not have shift schedules.

**Sleeper / Underdog Fantasy**
Sleeper has excellent UX for player news delivery and is the best consumer product for real-time fantasy-relevant alerts. But Sleeper is fully dependent on wire services and human-edited feeds for its underlying data. Their speed is the wire's speed. They add no verification layer, no confidence scoring, no source transparency. They are a great delivery mechanism for information they did not originate. EdgeSetter originates the intelligence.

---

### The gap every incumbent shares — and what Manako closes permanently

Every platform above has the same fundamental constraint: **their earliest possible detection is a text signal.** A tweet. A wire item. A reporter's filing. The pipeline starts the moment someone writes something down.

The physical event — the injury, the player walking off the court, the empty seat at the press conference — happens before any of that. It exists as observable reality in a camera feed before any human processes it and translates it into text.

That gap between physical event and first text report is the window EdgeSetter is attacking with this integration. Manako's Vision Agents watch the camera feed. They detect the event at the moment it occurs. That detection enters EdgeSetter's pipeline before any reporter has filed, before any wire has moved, before Sleeper has updated, before The Athletic has published, before ESPN has broken anything.

The result is a new proof point that no incumbent can match without rebuilding their entire architecture:

> "Visual feed detected 9:14am · First text report 9:41am · ESPN 10:45am"

That is not incremental improvement. That is a categorically different evidence chain.

---

### What this means for every implementation decision in this document

**The webhook endpoint (Step 2)** must be low-latency. A visual signal that sits in a queue for 3 minutes has lost its advantage. The endpoint should acknowledge and ingest in under 500ms.

**The confidence scoring (Step 5)** must reflect that visual signals are upstream evidence, not corroborating evidence. A Manako injury detection at 9:14am is not "supporting" a text report that arrives at 9:41am — it preceded and predicted it. The source hierarchy and confidence weights must encode this directional relationship.

**The timing display (Step 6)** is the product proof point. The three-timestamp display — visual detection, first text report, wire pickup — is what EdgeSetter shows the world as evidence of the moat. Every story card where a visual signal was the first detection must display all three timestamps. This is non-negotiable in the UI.

**The North Star rules (Step 8)** do not change. VERIFIED still requires ES Agent consensus across signal types including at least one text corroboration. Visual signals alone reach ESCALATING. The discipline of not calling VERIFIED on a single source — even a visual one — is what protects the trust that makes the timing claim credible. ESPN gets things wrong sometimes. EdgeSetter does not, because it does not call VERIFIED until it has earned it.

---

## Step 1: Register and Configure Manako

Before writing any code, complete these steps at manako.ai:

1. Register for early access at https://www.manako.ai
2. Create a workspace for EdgeSetter
3. Define the following four Vision Agents using Manako's plain-language interface:

**Agent 1 — injury_on_field**
Description for Manako: "Detect when a player is lying on the ground and being attended to by medical or training staff for more than 20 seconds during a live sports broadcast. Flag immediately when this occurs."
Output label: `injury_suspected`

**Agent 2 — player_early_exit**
Description for Manako: "Detect when a player leaves the playing field, court, or bench area and does not return within 3 minutes during an active game. Applies to any sport. Flag when the exit is confirmed."
Output label: `player_exit_unscheduled`

**Agent 3 — presser_absence**
Description for Manako: "Detect when a scheduled press conference or media availability begins and a named expected participant (provide roster image set) is not visible in the room. Flag within 2 minutes of session start."
Output label: `presser_no_show`

**Agent 4 — practice_attendance**
Description for Manako: "Monitor practice session footage. Detect and log which players are present and which are absent from the active drill group. Flag any player absence that was not present in the previous session."
Output label: `practice_absence`

4. For each agent, set the action destination to: **Webhook → your EdgeSetter endpoint** (see Step 2 below)
5. Upload test footage for each agent and validate detection before going live

---

## Step 2: Build the Webhook Receiver

Create a new API endpoint in EdgeSetter's backend to receive Manako structured event payloads.

```typescript
// /api/signals/vision — POST endpoint

import { NextRequest, NextResponse } from 'next/server'
import { ingestVisualSignal } from '@/lib/pipeline/ingest'
import { mapManakoEventToSignal } from '@/lib/pipeline/manako-mapper'
import { verifyManakoWebhookSecret } from '@/lib/auth/manako'

export async function POST(req: NextRequest) {
  // Verify the request is from Manako
  const signature = req.headers.get('x-manako-signature')
  if (!verifyManakoWebhookSecret(signature, process.env.MANAKO_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await req.json()

  // Map Manako event to EdgeSetter signal schema
  const signal = mapManakoEventToSignal(payload)

  if (!signal) {
    // Event type not mapped — log and discard
    console.log('[Manako] Unmapped event type:', payload.event_type)
    return NextResponse.json({ status: 'discarded' }, { status: 200 })
  }

  // Inject into the ES Agent pipeline
  await ingestVisualSignal(signal)

  return NextResponse.json({ status: 'accepted' }, { status: 200 })
}
```

---

## Step 3: Build the Manako Event Mapper

Map Manako's structured event payload to EdgeSetter's internal signal schema.

```typescript
// /lib/pipeline/manako-mapper.ts

export interface ManakoEvent {
  event_id: string
  agent_id: string
  agent_label: string       // e.g. "injury_on_field"
  output_label: string      // e.g. "injury_suspected"
  detected_at: string       // ISO 8601 timestamp
  confidence: number        // 0–1 from Manako's model
  feed_source: string       // camera/broadcast feed identifier
  metadata: {
    frame_timestamp?: string
    bounding_boxes?: object[]
    additional_context?: string
  }
}

export interface EdgeSetterSignal {
  signalId: string
  detectedAt: Date
  sourceType: 'vision_agent'
  sourceTier: 'primary_visual'
  sourceName: string
  signalType: EdgeSetterSignalType
  rawConfidence: number
  leagueContext: string | null
  playerContext: string | null
  rawPayload: ManakoEvent
  verificationState: 'DETECTED'
}

type EdgeSetterSignalType =
  | 'injury_suspected_visual'
  | 'player_exit_visual'
  | 'presser_absence_visual'
  | 'practice_absence_visual'

const OUTPUT_LABEL_TO_SIGNAL_TYPE: Record<string, EdgeSetterSignalType> = {
  injury_suspected: 'injury_suspected_visual',
  player_exit_unscheduled: 'player_exit_visual',
  presser_no_show: 'presser_absence_visual',
  practice_absence: 'practice_absence_visual',
}

export function mapManakoEventToSignal(
  event: ManakoEvent
): EdgeSetterSignal | null {
  const signalType = OUTPUT_LABEL_TO_SIGNAL_TYPE[event.output_label]
  if (!signalType) return null

  return {
    signalId: `vision_${event.event_id}`,
    detectedAt: new Date(event.detected_at),
    sourceType: 'vision_agent',
    sourceTier: 'primary_visual',
    sourceName: `Manako Vision Agent — ${event.agent_label}`,
    signalType,
    rawConfidence: event.confidence,
    leagueContext: null,   // enrich downstream from feed_source mapping
    playerContext: null,   // enrich downstream from bounding box metadata
    rawPayload: event,
    verificationState: 'DETECTED',
  }
}
```

---

## Step 4: Build the Visual Signal Ingestor

Wire the mapped signal into the ES Agent pipeline with the correct starting confidence score.

```typescript
// /lib/pipeline/ingest.ts  (add to existing ingest module)

import { EdgeSetterSignal } from './manako-mapper'
import { calculateVisualSignalConfidence } from './confidence'
import { db } from '@/lib/db'
import { triggerESAgentConsensus } from './agents'

export async function ingestVisualSignal(signal: EdgeSetterSignal) {
  // Calculate starting confidence
  // Visual signals start HIGHER than text signals because
  // they are direct observational evidence with no intermediary
  const startingConfidence = calculateVisualSignalConfidence(signal)

  // Persist to signals table
  const persisted = await db.signal.create({
    data: {
      ...signal,
      confidence: startingConfidence,
      firstDetectedAt: signal.detectedAt,
      verificationState: 'DETECTED',
      sourceTier: 'primary_visual',
    },
  })

  // Trigger ES Agent consensus pipeline immediately
  // Visual signals skip the initial 'is this worth escalating?' gate
  // because they have already passed Manako's detection threshold
  await triggerESAgentConsensus(persisted.signalId, {
    skipInitialGate: true,
    priorityOverride: 'HIGH',
  })

  console.log(
    `[Vision Signal Ingested] ${signal.signalType} at ${signal.detectedAt.toISOString()}`
  )
}
```

---

## Step 5: Update Confidence Scoring Rules

Add visual signal confidence rules to the North Star scoring system.

```typescript
// /lib/pipeline/confidence.ts  (add to existing confidence module)

import { EdgeSetterSignal } from './manako-mapper'

// Visual signal confidence starting points
// These are HIGHER than text sources because visual signals
// are direct observational evidence that predates any text report.
// North Star rule: primary_visual outranks primary_text (SID post)
// because it predates all text signals, not just wires.

const VISUAL_SIGNAL_BASE_CONFIDENCE: Record<string, number> = {
  injury_suspected_visual: 72,    // High — direct observation, but injury severity unknown
  player_exit_visual: 68,          // High — direct observation, reason unknown
  presser_absence_visual: 78,      // Very high — binary observation, no ambiguity
  practice_absence_visual: 65,     // Moderate — requires context (planned rest vs. unexpected)
}

// Manako model confidence multiplier
// Manako reports a 0–1 confidence score from their vision model.
// Apply as a modifier on top of the base signal confidence.
// A Manako confidence of 0.95 on an injury signal → 72 × 1.08 ≈ 78
function manakoConfidenceMultiplier(manakoConfidence: number): number {
  if (manakoConfidence >= 0.90) return 1.08
  if (manakoConfidence >= 0.80) return 1.04
  if (manakoConfidence >= 0.70) return 1.00
  if (manakoConfidence >= 0.60) return 0.94
  return 0.85  // Below 0.60 — Manako itself is uncertain, discount accordingly
}

export function calculateVisualSignalConfidence(signal: EdgeSetterSignal): number {
  const base = VISUAL_SIGNAL_BASE_CONFIDENCE[signal.signalType] ?? 60
  const multiplier = manakoConfidenceMultiplier(signal.rawConfidence)
  return Math.min(Math.round(base * multiplier), 89)
  // Cap at 89 — visual signals advance to ESCALATING but not VERIFIED alone.
  // VERIFIED requires at least one corroborating text source or
  // ES Agent consensus across both visual and text signals.
}
```

---

## Step 6: Update Source Transparency Display

The North Star requires source agreement to be visible on every card without interaction. Update the source display to surface visual signals correctly.

```typescript
// /lib/display/source-transparency.ts  (update existing module)

export function formatSourceLabel(sourceTier: string, sourceName: string): string {
  switch (sourceTier) {
    case 'primary_visual':
      return `Visual: ${sourceName}`          // "Visual: Manako Vision Agent — injury_on_field"
    case 'primary_text':
      return `Primary: ${sourceName}`         // "Primary: Texas A&M SID"
    case 'secondary_text':
      return `Confirmed: ${sourceName}`       // "Confirmed: Billy Liucci · TexAgs"
    case 'wire':
      return `Wire: ${sourceName}`            // "Wire: ESPN"
    default:
      return sourceName
  }
}

export function formatTimingAdvantage(
  firstDetectedAt: Date,
  firstTextDetectedAt: Date | null,
  wirePickupAt: Date | null
): string {
  // NEW: when a visual signal exists, show the full chain
  if (firstTextDetectedAt && wirePickupAt) {
    const visualToText = Math.round(
      (firstTextDetectedAt.getTime() - firstDetectedAt.getTime()) / 60000
    )
    const visualToWire = Math.round(
      (wirePickupAt.getTime() - firstDetectedAt.getTime()) / 60000
    )
    return `Visual feed ${visualToText} min before first report · ${visualToWire} min before wire`
  }

  // Fallback: text-only timing (existing behavior)
  if (wirePickupAt) {
    const leadMinutes = Math.round(
      (wirePickupAt.getTime() - firstDetectedAt.getTime()) / 60000
    )
    return `${leadMinutes} min before wire`
  }

  return 'Monitoring'
}
```

---

## Step 7: Update Environment Variables

Add to your `.env` file:

```bash
# Manako Vision Agent Integration
MANAKO_WEBHOOK_SECRET=your_manako_webhook_secret_here
MANAKO_API_KEY=your_manako_api_key_here
MANAKO_WORKSPACE_ID=your_manako_workspace_id_here
MANAKO_WEBHOOK_ENDPOINT=https://yourdomain.com/api/signals/vision
```

---

## Step 8: Testing Checklist

Before going live with real broadcast feeds, test each agent with uploaded footage:

- [ ] Manako webhook endpoint is live and returns 200 OK
- [ ] Webhook signature verification works correctly
- [ ] Each Manako output_label maps to the correct EdgeSetter signal type
- [ ] Visual signals appear in the pipeline with `sourceTier: "primary_visual"`
- [ ] Confidence scores calculate correctly for each signal type
- [ ] Visual signals appear on story cards with correct source label formatting
- [ ] Timing advantage display shows the full visual → text → wire chain when all three exist
- [ ] Visual-only signals (no corroborating text yet) correctly stay at ESCALATING, not VERIFIED
- [ ] A visual signal + one corroborating text source correctly advances to VERIFIED

---

## North Star Reference — Rules Visual Signals Must Follow

These rules from the EdgeSetter North Star apply to visual signals exactly as they apply to text signals:

1. A visual signal alone does not reach VERIFIED. It advances to ESCALATING at most. VERIFIED requires ES Agent consensus across signal types, including at least one text corroboration.

2. Source transparency must be visible on every card without interaction. Visual source label must appear alongside text sources: "Visual: Manako Vision Agent — injury_on_field · 3 sources / 2 agree, 1 pending"

3. The timing advantage display must always be visible on verified stories. If a visual signal is the first detection, the timing callout reflects that: "Visual feed 27 min before first text report · 58 min before ESPN"

4. VERIFIED = 100%. Never a percentage when verified. This applies whether the first detection was visual or text.

5. `detectionLeadMinutes` is now measured from `firstVisualDetectedAt` when a visual signal exists — not from `firstTextDetectedAt`. The visual feed is the true first detection.

---

## What This Unlocks

After this implementation, EdgeSetter's timing advantage display changes from:

> "47 min before ESPN"

To:

> "Visual feed detected 9:14am · First text report 9:41am · ESPN 10:45am"

No text-based competitor can replicate this. The physical event is the new first detection.
