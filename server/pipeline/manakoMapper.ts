export interface ManakoEvent {
  event_id: string
  agent_id: string
  agent_label: string
  output_label: string
  detected_at: string
  confidence: number
  feed_source: string
  metadata: {
    frame_timestamp?: string
    bounding_boxes?: object[]
    additional_context?: string
  }
}

export type VisualSignalType =
  | 'injury_suspected_visual'
  | 'player_exit_visual'
  | 'presser_absence_visual'
  | 'practice_absence_visual'

export interface EdgeSetterVisualSignal {
  signalId: string
  detectedAt: Date
  sourceType: 'vision_agent'
  sourceTier: 'primary_visual'
  sourceName: string
  signalType: VisualSignalType
  rawConfidence: number
  rawPayload: ManakoEvent
  verificationState: 'DETECTED'
}

const OUTPUT_LABEL_MAP: Record<string, VisualSignalType> = {
  injury_suspected:        'injury_suspected_visual',
  player_exit_unscheduled: 'player_exit_visual',
  presser_no_show:         'presser_absence_visual',
  practice_absence:        'practice_absence_visual',
}

export function mapManakoEvent(event: ManakoEvent): EdgeSetterVisualSignal | null {
  const signalType = OUTPUT_LABEL_MAP[event.output_label]
  if (!signalType) return null
  return {
    signalId:          `vision_${event.event_id}`,
    detectedAt:        new Date(event.detected_at),
    sourceType:        'vision_agent',
    sourceTier:        'primary_visual',
    sourceName:        `Manako Vision Agent — ${event.agent_label}`,
    signalType,
    rawConfidence:     event.confidence,
    rawPayload:        event,
    verificationState: 'DETECTED',
  }
}
