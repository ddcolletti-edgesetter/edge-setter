import type { EdgeSetterVisualSignal, VisualSignalType } from './manakoMapper'
import { insertRawEvent } from './store'
import { processOne } from './processor'
import type { League, RawEventType } from './types'

const VISUAL_BASE_CONFIDENCE: Record<VisualSignalType, number> = {
  injury_suspected_visual:  72,
  player_exit_visual:       68,
  presser_absence_visual:   78,
  practice_absence_visual:  65,
}

function visualConfidence(signal: EdgeSetterVisualSignal): number {
  const base = VISUAL_BASE_CONFIDENCE[signal.signalType] ?? 60
  const m = signal.rawConfidence >= 0.9 ? 1.08
          : signal.rawConfidence >= 0.8 ? 1.04
          : signal.rawConfidence >= 0.7 ? 1.00
          : signal.rawConfidence >= 0.6 ? 0.94 : 0.85
  // Hard cap at 89 — visual signals reach ESCALATING, never VERIFIED alone
  return Math.min(Math.round(base * m), 89)
}

const VISUAL_TYPE_TO_EVENT_TYPE: Record<VisualSignalType, RawEventType> = {
  injury_suspected_visual:  'injury_update',
  player_exit_visual:       'injury_update',
  presser_absence_visual:   'manual',
  practice_absence_visual:  'manual',
}

export async function ingestVisualSignal(signal: EdgeSetterVisualSignal, league: League = 'NFL'): Promise<void> {
  const confidence = visualConfidence(signal)
  const eventType = VISUAL_TYPE_TO_EVENT_TYPE[signal.signalType]

  const raw = insertRawEvent({
    source_id:   signal.signalId,
    source_type: 'vision_agent',
    league,
    game_id:     null,
    team:        null,
    player:      null,
    event_type:  eventType,
    payload: {
      signalType:        signal.signalType,
      sourceTier:        signal.sourceTier,
      sourceName:        signal.sourceName,
      confidence,
      rawConfidence:     signal.rawConfidence,
      detectedAt:        signal.detectedAt.toISOString(),
      verificationState: signal.verificationState,
      feedSource:        signal.rawPayload.feed_source,
      additionalContext: signal.rawPayload.metadata.additional_context ?? null,
      // skipInitialGate + priorityOverride reserved for ES Agent consensus once wired
      skipInitialGate:   true,
      priorityOverride:  'HIGH',
    },
  })

  await processOne(raw)

  console.log(`[Vision Signal Ingested] ${signal.signalType} at ${signal.detectedAt.toISOString()} confidence=${confidence}`)
}
