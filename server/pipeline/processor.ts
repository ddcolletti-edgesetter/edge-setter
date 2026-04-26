/**
 * Edge Setter — Event Processor  (Sprint 7)
 *
 * Reads unprocessed RawEvents, routes them by event_type, populates
 * Signal fields, calls the scorer, and upserts the LiveSignal.
 *
 * Event type handlers:
 *   injury_update    → injury_designation, body, action_note
 *   lineup_confirm   → lineup_status, body
 *   lineup_change    → lineup_status, why_it_matters
 *   line_move        → line_movement, isSharpMoney
 *   weather_update   → weather_note
 *   scheme_note      → schemeNote, contextScore
 *   transaction      → injury_designation / lineup_status, high-impact
 *   manual           → pass-through (operator fills all fields)
 */

import { randomUUID } from "crypto";
import {
  getUnprocessedRawEvents, markRawEventProcessed,
  upsertLiveSignal, getLiveSignal,
} from "./store";
import { scoreSignal } from "./scorer";
import type { RawEvent, LiveSignal, League, SignalType, LineMovement } from "./types";

/* ─── Helper ────────────────────────────────────────────── */

function now() { return new Date().toISOString(); }

function buildMatchup(team: string | null, game?: { home_team: string; away_team: string }): string | null {
  if (!game) return team;
  return `${game.away_team} @ ${game.home_team}`;
}

/* ─── Handler: injury_update ────────────────────────────── */

function handleInjuryUpdate(raw: RawEvent): Partial<LiveSignal> {
  const p = raw.payload as any;
  const designation: string = p.designation ?? p.status ?? "Questionable";
  const bodyPart: string = p.body_part ?? p.injury ?? "undisclosed";
  const isOut = designation === "OUT" || designation === "IL-60" || designation === "DNP";
  return {
    signal_type: "injury_update",
    headline: `${raw.player ?? "Player"} (${bodyPart}) — ${designation}`,
    body: p.notes ?? `${raw.player} listed ${designation} — ${bodyPart} issue.`,
    action_note: isOut
      ? `Adjust roster exposure immediately. Line implications for ${raw.team} games.`
      : `Monitor status. ${designation} designation may change before game time.`,
    why_it_matters: isOut
      ? `${raw.player} is a confirmed scratch — direct market impact expected.`
      : `${raw.player}'s status is uncertain; wait for a final designation before committing.`,
    injury_designation: designation,
    betting_relevance: true,
    fantasy_relevance: true,
    confidence: isOut ? 88 : 65,
    verdict: isOut ? "confirmed" : "likely",
    confirmation_strength: p.confirmation ?? (isOut ? "Consensus" : "Developing"),
  };
}

/* ─── Handler: lineup_confirm / lineup_change ───────────── */

function handleLineup(raw: RawEvent, isChange: boolean): Partial<LiveSignal> {
  const p = raw.payload as any;
  const status: string = p.status ?? (isChange ? "scratched" : "confirmed");
  return {
    signal_type: isChange ? "lineup_change" : "lineup_confirm",
    headline: `${raw.player ?? raw.team ?? "Player"} ${isChange ? "scratched" : "confirmed"} — ${status}`,
    body: p.notes ?? `${raw.player ?? "Player"} ${status} in today's lineup.`,
    action_note: isChange
      ? `Reassess roster/betting exposure — ${raw.player} is out.`
      : `${raw.player} locked in — lineups confirmed, proceed with confidence.`,
    why_it_matters: isChange
      ? `Lineup change creates market inefficiency — check if books have adjusted.`
      : `Confirmed starters reduce uncertainty for pre-game bets.`,
    lineup_status: status,
    betting_relevance: true,
    fantasy_relevance: true,
    confidence: isChange ? 82 : 75,
    verdict: "confirmed",
    confirmation_strength: p.confirmation ?? "Corroborated",
  };
}

/* ─── Handler: line_move ────────────────────────────────── */

function handleLineMove(raw: RawEvent): Partial<LiveSignal> {
  const p = raw.payload as any;
  const openLine: number = p.open_line ?? p.open ?? 0;
  const currentLine: number = p.current_line ?? p.current ?? 0;
  const delta = Math.abs(currentLine - openLine);
  const direction: LineMovement["direction"] = currentLine > openLine ? "up" : currentLine < openLine ? "down" : "flat";
  const lm: LineMovement = { open: openLine, current: currentLine, delta, direction };
  const isSharp: boolean = p.sharp_money === true || p.sharp_percentage > 60;
  const sharpPct: number | undefined = p.sharp_percentage;

  return {
    signal_type: "line_move",
    headline: `${raw.team ?? "Market"}: ${openLine > 0 ? "+" : ""}${openLine} → ${currentLine > 0 ? "+" : ""}${currentLine} — ${isSharp ? "sharp action" : "line movement"}`,
    body: p.notes ?? `Line moved ${delta.toFixed(1)} points ${direction} from open. ${isSharp && sharpPct ? `${sharpPct}% of sharp tickets on ${raw.team}.` : ""}`,
    action_note: delta >= 2
      ? `Significant movement — if you like this side, take it now before further movement.`
      : `Monitor. Line may continue moving if sharp money is one-sided.`,
    why_it_matters: isSharp
      ? `Sharp money diverging from public — classic steam move signal.`
      : `Market inefficiency detected — line adjusting toward true probability.`,
    line_movement: lm,
    betting_relevance: true,
    fantasy_relevance: false,
    confidence: Math.min(90, 60 + delta * 8 + (isSharp ? 10 : 0)),
    verdict: "likely",
    confirmation_strength: delta >= 2 ? "Corroborated" : "Developing",
  };
}

/* ─── Handler: weather_update ───────────────────────────── */

function handleWeather(raw: RawEvent): Partial<LiveSignal> {
  const p = raw.payload as any;
  const windMph: number = p.wind_mph ?? 0;
  const tempF: number | undefined = p.temp_f;
  const conditions: string = p.conditions ?? "clear";
  const isHighImpact = windMph >= 15;

  return {
    signal_type: "weather_update",
    headline: `${raw.team ?? "Game"} weather: ${windMph} MPH winds — ${conditions}`,
    body: p.notes ?? `Weather forecast: ${windMph} MPH winds${tempF !== undefined ? `, ${tempF}°F` : ""}. Conditions: ${conditions}.`,
    action_note: isHighImpact
      ? `Favour unders — wind above 15 MPH consistently suppresses scoring.`
      : `Weather is a minor factor today; no large adjustment needed.`,
    why_it_matters: isHighImpact
      ? `High winds directly impact passing games and totals markets.`
      : `Mild weather — conditions should not materially affect game.`,
    weather_note: `${windMph} MPH winds, ${tempF !== undefined ? `${tempF}°F, ` : ""}${conditions}`,
    betting_relevance: isHighImpact,
    fantasy_relevance: isHighImpact,
    confidence: isHighImpact ? 78 : 55,
    verdict: "likely",
    confirmation_strength: p.confirmation ?? "Corroborated",
  };
}

/* ─── Handler: scheme_note (manual / CFB/NFL) ───────────── */

function handleSchemeNote(raw: RawEvent): Partial<LiveSignal> {
  const p = raw.payload as any;
  return {
    signal_type: "scheme_note",
    headline: p.headline ?? `${raw.team ?? "Team"} — schematic edge`,
    body: p.body ?? p.notes ?? "",
    action_note: p.action_note ?? "Evaluate for props and team totals.",
    why_it_matters: p.why_it_matters ?? "Schematic mismatch creates exploitable edge.",
    betting_relevance: true,
    fantasy_relevance: true,
    confidence: p.confidence ?? 65,
    verdict: p.verdict ?? "likely",
    confirmation_strength: p.confirmation ?? "Developing",
  };
}

/* ─── Handler: transaction ──────────────────────────────── */

function handleTransaction(raw: RawEvent): Partial<LiveSignal> {
  const p = raw.payload as any;
  const txType: string = p.transaction_type ?? "roster move";
  const designation: string | undefined = p.designation ?? p.il_type;
  return {
    signal_type: "transaction",
    headline: `${raw.player ?? raw.team ?? "Roster"} — ${txType}`,
    body: p.notes ?? `${raw.player ?? "Player"} — ${txType} confirmed.`,
    action_note: p.action_note ?? `Reassess market exposure — ${txType} changes expected value.`,
    why_it_matters: p.why_it_matters ?? `${txType} creates direct line impact.`,
    injury_designation: designation,
    betting_relevance: true,
    fantasy_relevance: true,
    confidence: p.confidence ?? 85,
    verdict: "confirmed",
    confirmation_strength: p.confirmation ?? "Consensus",
  };
}

/* ─── Handler: manual ───────────────────────────────────── */

function handleManual(raw: RawEvent): Partial<LiveSignal> {
  const p = raw.payload as any;
  return {
    signal_type: (p.signal_type as SignalType) ?? "manual",
    headline: p.headline ?? "Operator signal",
    body: p.body ?? "",
    action_note: p.action_note ?? "",
    why_it_matters: p.why_it_matters ?? "",
    injury_designation: p.injury_designation,
    lineup_status: p.lineup_status,
    weather_note: p.weather_note,
    line_movement: p.line_movement ?? null,
    betting_relevance: p.betting_relevance ?? false,
    fantasy_relevance: p.fantasy_relevance ?? false,
    confidence: p.confidence ?? 70,
    verdict: p.verdict ?? "review",
    confirmation_strength: p.confirmation_strength ?? "Developing",
  };
}

/* ─── Routing ───────────────────────────────────────────── */

function routeEventToFields(raw: RawEvent): Partial<LiveSignal> {
  switch (raw.event_type) {
    case "injury_update":  return handleInjuryUpdate(raw);
    case "lineup_confirm": return handleLineup(raw, false);
    case "lineup_change":  return handleLineup(raw, true);
    case "line_move":      return handleLineMove(raw);
    case "weather_update": return handleWeather(raw);
    case "scheme_note":    return handleSchemeNote(raw);
    case "transaction":    return handleTransaction(raw);
    case "manual":         return handleManual(raw);
    default:               return handleManual(raw);
  }
}

/* ─── Build scoring inputs from Signal fields ────────────── */

function buildScoreInputs(league: League, fields: Partial<LiveSignal>, raw: RawEvent) {
  const p = raw.payload as any;
  const lm = fields.line_movement;

  return {
    sport: league as any,
    signalType: fields.signal_type ?? raw.event_type,
    verdict: fields.verdict ?? "review",
    confidence: fields.confidence ?? 60,
    sourceTypes: p.source_types ?? ["wire_service"],
    sourceLabels: p.source_labels ?? [],
    sourceCount: fields.source_count ?? p.source_count ?? 1,
    confirmationStrength: fields.confirmation_strength ?? "Developing",
    isoTimestamp: raw.received_at,
    lineMovementDelta: lm ? lm.delta : (p.line_delta ?? 0),
    isSharpMoney: p.sharp_money === true || (p.sharp_percentage > 60),
    crossedKeyNumber: p.crossed_key_number === true,
    isHighImpactType: ["injury_update", "transaction", "lineup_change"].includes(raw.event_type),
    injuryDesignation: fields.injury_designation ?? undefined,
    bettingRelevance: fields.betting_relevance ?? false,
    fantasyRelevance: fields.fantasy_relevance ?? false,
    hasMatchupEdge: !!p.matchup_edge,
    hasRotationNote: !!p.rotation_note,
    hasSchemeNote: !!p.scheme_note || raw.event_type === "scheme_note",
    hasPitcherMatchup: !!p.pitcher_matchup,
    hasLineupStatus: !!fields.lineup_status,
    hasWeatherNote: !!fields.weather_note,
  };
}

/* ─── Main process function ─────────────────────────────── */

export async function processRawEvents(): Promise<{ processed: number; errors: number }> {
  const pending = getUnprocessedRawEvents(50);
  let processed = 0;
  let errors = 0;

  for (const raw of pending) {
    try {
      // Route event to Signal fields
      const fields = routeEventToFields(raw);
      const league = raw.league as League;
      const p = raw.payload as any;

      // Score the signal
      const scoreInputs = buildScoreInputs(league, fields, raw);
      const scoreResult = scoreSignal(scoreInputs, p.game_time ?? undefined);

      // Derive sources array
      const sources = (p.sources as Array<{ name: string; type: string }> | undefined) ?? [
        { name: raw.source_id, type: raw.source_type },
      ];

      const signalId = p.signal_id ?? randomUUID(); // allow idempotent upsert

      // Merge into LiveSignal
      const signal: LiveSignal = {
        id: signalId,
        league,
        game_id: raw.game_id,
        signal_type: (fields.signal_type ?? "manual") as SignalType,
        headline: fields.headline ?? "Signal",
        body: fields.body ?? "",
        action_note: fields.action_note ?? "",
        why_it_matters: fields.why_it_matters ?? "",
        team: raw.team,
        player: raw.player,
        matchup: p.matchup ?? null,
        sources,
        source_count: sources.length,
        verdict: (fields.verdict ?? "review") as any,
        confidence: fields.confidence ?? 60,
        confirmation_strength: fields.confirmation_strength ?? "Developing",
        line_movement: fields.line_movement ?? null,
        injury_designation: fields.injury_designation ?? null,
        lineup_status: fields.lineup_status ?? null,
        weather_note: fields.weather_note ?? null,
        betting_relevance: fields.betting_relevance ?? false,
        fantasy_relevance: fields.fantasy_relevance ?? false,
        // Scoring results
        score: scoreResult.totalScore,
        score_band: scoreResult.band,
        urgency_label: scoreResult.urgencyLabel,
        urgency_reason: scoreResult.urgencyReason,
        trust_label: scoreResult.trustLabel,
        score_explanation: scoreResult.scoreExplanation,
        breakdown: scoreResult.breakdown,
        raw_event_ids: [raw.id],
        signal_time: raw.received_at,
        created_at: now(),
        updated_at: now(),
        outcome_id: null,
      };

      upsertLiveSignal(signal);
      markRawEventProcessed(raw.id);
      processed++;
    } catch (err: any) {
      console.error(`[pipeline/processor] Error processing raw event ${raw.id}:`, err.message);
      errors++;
      // Still mark processed so we don't loop on bad data
      markRawEventProcessed(raw.id);
    }
  }

  return { processed, errors };
}

/* ─── Convenience: process a single raw event immediately ── */

export async function processOne(raw: RawEvent): Promise<LiveSignal | null> {
  try {
    const fields = routeEventToFields(raw);
    const league = raw.league as League;
    const p = raw.payload as any;
    const scoreInputs = buildScoreInputs(league, fields, raw);
    const scoreResult = scoreSignal(scoreInputs, p.game_time ?? undefined);

    const sources = (p.sources as Array<{ name: string; type: string }> | undefined) ?? [
      { name: raw.source_id, type: raw.source_type },
    ];
    const signalId = p.signal_id ?? randomUUID();

    const signal: LiveSignal = {
      id: signalId,
      league,
      game_id: raw.game_id,
      signal_type: (fields.signal_type ?? "manual") as SignalType,
      headline: fields.headline ?? "Signal",
      body: fields.body ?? "",
      action_note: fields.action_note ?? "",
      why_it_matters: fields.why_it_matters ?? "",
      team: raw.team,
      player: raw.player,
      matchup: p.matchup ?? null,
      sources,
      source_count: sources.length,
      verdict: (fields.verdict ?? "review") as any,
      confidence: fields.confidence ?? 60,
      confirmation_strength: fields.confirmation_strength ?? "Developing",
      line_movement: fields.line_movement ?? null,
      injury_designation: fields.injury_designation ?? null,
      lineup_status: fields.lineup_status ?? null,
      weather_note: fields.weather_note ?? null,
      betting_relevance: fields.betting_relevance ?? false,
      fantasy_relevance: fields.fantasy_relevance ?? false,
      score: scoreResult.totalScore,
      score_band: scoreResult.band,
      urgency_label: scoreResult.urgencyLabel,
      urgency_reason: scoreResult.urgencyReason,
      trust_label: scoreResult.trustLabel,
      score_explanation: scoreResult.scoreExplanation,
      breakdown: scoreResult.breakdown,
      raw_event_ids: [raw.id],
      signal_time: raw.received_at,
      created_at: now(),
      updated_at: now(),
      outcome_id: null,
    };

    upsertLiveSignal(signal);
    markRawEventProcessed(raw.id);
    return signal;
  } catch (err: any) {
    console.error("[pipeline/processor] processOne error:", err.message);
    return null;
  }
}
