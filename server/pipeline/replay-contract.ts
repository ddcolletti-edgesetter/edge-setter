export interface ReplayApiResponse {
  version: number;
  generated_at: string;
  game_id: string;
  as_of: string;
  integrity_hash: string;
  timeline_hash: string;
  snapshots: ReplaySnapshotContract[];
  signals: ReplaySignalContract[];
  timeline: ReplayTimelineEvent[];
  clv_states: ReplayClvContract[];
}

export interface ReplaySnapshotContract {
  id: string;
  snapshot_at: string;
  spread_line: number | null;
  total_line: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
}

export interface ReplaySignalContract {
  signal_id: string;
  created_at: string;
  signal_type: string | null;
  market: string | null;
  confidence: number | null;
  line_at_signal: number | null;
}

export interface ReplayTimelineEvent {
  ts: string;
  type:
    | "snapshot"
    | "signal_created"
    | "signal_updated"
    | "signal_settled";
  entity_id: string;
  payload: Record<string, unknown>;
}

export interface ReplayClvContract {
  signal_id: string;
  market: string;
  line_at_signal: number | null;
  closing_line: number | null;
  clv: number | null;
}