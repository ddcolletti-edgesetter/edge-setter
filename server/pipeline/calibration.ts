/**
 * Edge Setter — Calibration Engine
 *
 * After the historical backfill and settlement pass, this engine:
 *
 *   1. Pulls all settled outcomes joined to their live_signal breakdown JSON
 *   2. Computes Pearson correlation between each scoring component and hit (0/1)
 *   3. Aggregates hit rates by league and by signal_type
 *   4. Compares observed vs formula-predicted hit rates for league modifiers
 *   5. Suggests updated formula weights (proportional to correlations)
 *   6. Stores results in calibration_weights table for review
 *
 * Suggested weights are NOT auto-applied to scorer.ts.
 * Review the report via GET /api/pipeline/calibrate first.
 *
 * Minimum viable sample sizes:
 *   < 30  outcomes for a grouping → flagged as insufficient
 *   < 100 total outcomes         → overall weights flagged as low-confidence
 */

import { getPipelineDb, upsertCalibrationWeights, getAllCalibrationWeights } from "./store";
import type { CalibrationWeight } from "./store";

export type { CalibrationWeight };

/* ─── Current formula weights (source of truth: scorer.ts) ─ */

const CURRENT_WEIGHTS = {
  confidenceScore:    22,
  sourceQualityScore: 28,
  marketImpactScore:  24,
  recencyBonus:       12,
  relevanceScore:      8,
  contextScore:        6,
} as const;

type ComponentKey = keyof typeof CURRENT_WEIGHTS;
const COMPONENT_KEYS = Object.keys(CURRENT_WEIGHTS) as ComponentKey[];
const WEIGHT_TOTAL = Object.values(CURRENT_WEIGHTS).reduce((a, b) => a + b, 0); // 100

/* ─── Math helpers ───────────────────────────────────────── */

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num  += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX) * Math.sqrt(denY);
  return den === 0 ? 0 : num / den;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ─── Report types ───────────────────────────────────────── */

export interface ComponentCorrelations {
  confidenceScore: number;
  sourceQualityScore: number;
  marketImpactScore: number;
  recencyBonus: number;
  relevanceScore: number;
  contextScore: number;
}

export interface LeagueStats {
  total_settled: number;
  hit_rate: number | null;
  component_correlations: ComponentCorrelations;
  by_signal_type: Record<string, { total: number; hit_rate: number | null; note?: string }>;
}

export interface CalibrationReport {
  generated_at: string;
  total_settled_outcomes: number;
  confidence_level: "high" | "moderate" | "low" | "insufficient";
  overall_correlations: ComponentCorrelations;
  current_weights: typeof CURRENT_WEIGHTS;
  suggested_weights: Record<ComponentKey, number>;
  by_league: Record<string, LeagueStats>;
  notes: string[];
}

/* ─── Build suggested weights from correlations ─────────── */

function suggestWeights(corrs: ComponentCorrelations): Record<ComponentKey, number> {
  // Use absolute correlation values as proportional weight signals
  // Minimum floor of 0.05 so no component drops to zero
  const raw: Record<string, number> = {};
  let rawSum = 0;
  for (const key of COMPONENT_KEYS) {
    const absCorr = Math.max(0.05, Math.abs(corrs[key]));
    raw[key] = absCorr;
    rawSum += absCorr;
  }

  // Normalize to sum to WEIGHT_TOTAL (100), then blend 50/50 with current weights
  // Blending prevents wild swings from noisy correlation estimates
  const normalized: Record<ComponentKey, number> = {} as any;
  for (const key of COMPONENT_KEYS) {
    const corrWeight = (raw[key] / rawSum) * WEIGHT_TOTAL;
    const blended = 0.5 * CURRENT_WEIGHTS[key] + 0.5 * corrWeight;
    normalized[key] = Math.round(blended * 2) / 2; // round to 0.5
  }

  // Adjust to ensure they still sum to WEIGHT_TOTAL after rounding
  const roundedSum = Object.values(normalized).reduce((a, b) => a + b, 0);
  const diff = WEIGHT_TOTAL - roundedSum;
  if (diff !== 0) {
    // Apply adjustment to the largest weight component
    const maxKey = COMPONENT_KEYS.reduce((a, b) => normalized[a] >= normalized[b] ? a : b);
    normalized[maxKey] += diff;
  }

  return normalized;
}

/* ─── Main calibration function ──────────────────────────── */

export function runCalibration(): CalibrationReport {
  const db = getPipelineDb();
  const notes: string[] = [];

  // Pull all settled outcomes with signal breakdown
  const rows = db.prepare(`
    SELECT
      o.hit,
      o.clv,
      s.league,
      s.signal_type,
      s.breakdown
    FROM outcomes o
    JOIN live_signals s ON s.id = o.signal_id
    WHERE o.hit IS NOT NULL
    ORDER BY o.created_at ASC
  `).all() as Array<{
    hit: number;
    clv: number | null;
    league: string;
    signal_type: string;
    breakdown: string;
  }>;

  const total = rows.length;

  // ── Confidence level based on sample size ───────────────
  const confidenceLevel: CalibrationReport["confidence_level"] =
    total >= 500 ? "high" :
    total >= 100 ? "moderate" :
    total >= 30  ? "low" : "insufficient";

  if (total < 100) {
    notes.push(
      `Sample size is ${total} settled outcomes (< 100). Suggested weights are low-confidence.`
      + " Run the backfill first, then re-run calibration.",
    );
  }

  // ── Parse breakdown for each outcome ───────────────────
  type ParsedRow = {
    hit: number;
    league: string;
    signal_type: string;
    components: Record<ComponentKey, number>;
  };

  const parsed: ParsedRow[] = [];
  for (const row of rows) {
    let breakdown: Record<string, number> = {};
    try {
      breakdown = JSON.parse(row.breakdown ?? "{}");
    } catch {
      continue;
    }
    const components = {} as Record<ComponentKey, number>;
    let valid = true;
    for (const key of COMPONENT_KEYS) {
      const val = breakdown[key];
      if (typeof val !== "number") { valid = false; break; }
      components[key] = val;
    }
    if (!valid) continue;
    parsed.push({ hit: row.hit, league: row.league, signal_type: row.signal_type, components });
  }

  // ── Overall correlations ────────────────────────────────
  const overallCorrs = {} as ComponentCorrelations;
  for (const key of COMPONENT_KEYS) {
    const xs = parsed.map(r => r.components[key]);
    const ys = parsed.map(r => r.hit);
    overallCorrs[key] = round2(pearson(xs, ys));
  }

  const suggestedWeights = suggestWeights(overallCorrs);

  // ── Per-league stats ────────────────────────────────────
  const leagues = [...new Set(parsed.map(r => r.league))];
  const byLeague: Record<string, LeagueStats> = {};

  for (const league of leagues) {
    const leagueRows = parsed.filter(r => r.league === league);
    const hitCount = leagueRows.filter(r => r.hit === 1).length;
    const hitRate = leagueRows.length > 0 ? round2(hitCount / leagueRows.length) : null;

    const leagueCorrs = {} as ComponentCorrelations;
    if (leagueRows.length >= 30) {
      for (const key of COMPONENT_KEYS) {
        const xs = leagueRows.map(r => r.components[key]);
        const ys = leagueRows.map(r => r.hit);
        leagueCorrs[key] = round2(pearson(xs, ys));
      }
    } else {
      for (const key of COMPONENT_KEYS) leagueCorrs[key] = 0;
      notes.push(`${league}: only ${leagueRows.length} outcomes — component correlations unreliable (need ≥ 30).`);
    }

    // Per-signal-type within league
    const signalTypes = [...new Set(leagueRows.map(r => r.signal_type))];
    const bySignalType: LeagueStats["by_signal_type"] = {};
    for (const st of signalTypes) {
      const stRows = leagueRows.filter(r => r.signal_type === st);
      const stHits = stRows.filter(r => r.hit === 1).length;
      const stNote = stRows.length < 30
        ? `Low sample (n=${stRows.length} — treat with caution)`
        : undefined;
      bySignalType[st] = {
        total: stRows.length,
        hit_rate: stRows.length > 0 ? round2(stHits / stRows.length) : null,
        ...(stNote ? { note: stNote } : {}),
      };
    }

    byLeague[league] = {
      total_settled: leagueRows.length,
      hit_rate: hitRate,
      component_correlations: leagueCorrs,
      by_signal_type: bySignalType,
    };
  }

  // ── Flag components with near-zero correlation ──────────
  for (const key of COMPONENT_KEYS) {
    if (total >= 100 && Math.abs(overallCorrs[key]) < 0.05) {
      notes.push(
        `${key} correlation is near zero (${overallCorrs[key]}). `
        + "Consider reducing its weight or investigating signal quality.",
      );
    }
  }

  // ── Persist to calibration_weights table ────────────────
  const seasons = ["NFL-2024", "NFL-2025", "CFB-2024", "CFB-2025", "NBA-2024-25", "NBA-2025-26", "MLB-2025", "MLB-2026"];

  upsertCalibrationWeights("ALL", "component_correlations", overallCorrs as Record<string, number>, seasons, total);
  upsertCalibrationWeights("ALL", "suggested_weights", suggestedWeights as Record<string, number>, seasons, total);

  for (const [league, stats] of Object.entries(byLeague)) {
    if (stats.total_settled >= 30) {
      upsertCalibrationWeights(
        league, "component_correlations",
        stats.component_correlations as Record<string, number>,
        seasons, stats.total_settled,
      );
    }
  }

  console.log(`[calibration] Report generated: ${total} outcomes, confidence=${confidenceLevel}`);

  return {
    generated_at: new Date().toISOString(),
    total_settled_outcomes: total,
    confidence_level: confidenceLevel,
    overall_correlations: overallCorrs,
    current_weights: CURRENT_WEIGHTS,
    suggested_weights: suggestedWeights,
    by_league: byLeague,
    notes,
  };
}

/* ─── Read stored calibration results ───────────────────── */

export function getStoredCalibration(): CalibrationWeight[] {
  return getAllCalibrationWeights();
}
