/**
 * useTrackRecord — Sprint 9
 *
 * Fetches GET /api/stats/track-record?league=<LEAGUE> once on mount.
 * No polling — stats are cheap to recompute but rarely change between page visits.
 */
import { useState, useEffect } from "react";

export interface TrackRecordSlice {
  signal_type: string | null;
  total_signals: number;
  wins: number;
  losses: number;
  hit_rate: number | null;
  avg_clv_points: number | null;
}

export interface TrackRecordData {
  league: string;
  window: "all_time";
  overall: TrackRecordSlice;
  by_signal_type: TrackRecordSlice[];
}

interface UseTrackRecordResult {
  data: TrackRecordData | null;
  loading: boolean;
  error: string | null;
}

export function useTrackRecord(league: "NBA" | "MLB" | "NFL" | "CFB"): UseTrackRecordResult {
  const [data, setData] = useState<TrackRecordData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/stats/track-record?league=${league}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: TrackRecordData) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [league]);

  return { data, loading, error };
}
