/**
 * Edge Setter — useSignals hook  (Sprint 8)
 *
 * Fetches live signals for a given league (or all leagues) from
 * /api/v2/signals and adapts them to the board signal shape.
 *
 * Falls back to mock data if:
 *   - VITE_USE_MOCK_DATA=true (dev flag)
 *   - API returns 0 results
 *   - Network error / 5xx
 *
 * Refreshes every 60 seconds automatically.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchSignals, adaptToV2Signal, adaptToNFLSignal, adaptToCFBSignal } from "../lib/signalsApi";
import type { LiveSignal } from "../lib/signalsApi";
import type { V2Signal } from "../data/v2MockData";
import type { NFLSignal } from "../data/nflMockData";
import type { CFBSignal } from "../data/cfbMockData";
import type { SignalScore } from "../lib/signalScorer";

const REFRESH_MS = 60_000;

type SportAdapted<S extends "NBA" | "MLB"> = V2Signal & { _score: SignalScore; _live: true };

/* ── NBA / MLB ─────────────────────────────────────────────── */
export function useNBASignals(mockFallback: V2Signal[]) {
  return useLeagueSignals("NBA", mockFallback, (ls) => adaptToV2Signal(ls, "NBA"));
}
export function useMLBSignals(mockFallback: V2Signal[]) {
  return useLeagueSignals("MLB", mockFallback, (ls) => adaptToV2Signal(ls, "MLB"));
}
export function useNFLSignals(mockFallback: NFLSignal[]) {
  return useLeagueSignals("NFL", mockFallback as any[], (ls) => adaptToNFLSignal(ls));
}
export function useCFBSignals(mockFallback: CFBSignal[]) {
  return useLeagueSignals("CFB", mockFallback as any[], (ls) => adaptToCFBSignal(ls));
}

/* ── Combined home feed ────────────────────────────────────── */
export function useAllSignals(nbaMock: V2Signal[], mlbMock: V2Signal[]) {
  const [signals, setSignals] = useState<(V2Signal & { _score: SignalScore; _live?: true })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const live = await fetchSignals();
      if (live.length > 0) {
        const adapted = live.map(ls => {
          if (ls.league === "NBA") return adaptToV2Signal(ls, "NBA");
          if (ls.league === "MLB") return adaptToV2Signal(ls, "MLB");
          // NFL/CFB adapted as V2Signal-like (same base shape)
          return adaptToV2Signal({ ...ls, league: ls.league as "NBA" }, "NBA");
        });
        setSignals(adapted);
        setIsLive(true);
        setError(null);
      } else {
        useMocks();
      }
    } catch (e: any) {
      setError("Live data unavailable — showing last known state");
      useMocks();
    } finally {
      setLoading(false);
    }
  }, []);

  function useMocks() {
    setIsLive(false);
    const combined = [
      ...nbaMock.map(s => ({ ...s, sport: "NBA" as const })),
      ...mlbMock.map(s => ({ ...s, sport: "MLB" as const })),
    ];
    setSignals(combined as any);
  }

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  return { signals, loading, isLive, error };
}

/* ── Generic per-league ───────────────────────────────────── */
function useLeagueSignals<T>(
  league: string,
  mockFallback: T[],
  adapter: (ls: LiveSignal) => T,
): {
  signals: T[];
  loading: boolean;
  isLive: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [signals, setSignals] = useState<T[]>(mockFallback);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const live = await fetchSignals(league);
      if (live.length > 0) {
        setSignals(live.map(adapter));
        setIsLive(true);
        setError(null);
      } else {
        // API returned nothing — use mocks
        setSignals(mockFallback);
        setIsLive(false);
      }
    } catch (e: any) {
      setError("Live data unavailable — showing last known state");
      setSignals(mockFallback);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, [league]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  return { signals, loading, isLive, error, refresh: load };
}
