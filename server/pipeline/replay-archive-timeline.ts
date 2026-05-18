export interface ReplayArchiveTimelineEvent {
  event_id: string;
  replay_id: string;
  event_type: string;
  generated_at: string;
  payload: unknown;
}