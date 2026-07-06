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
  upsertLiveSignal, getLiveSignal, findExistingSignal,
  insertSignalDetection,
} from "./store";
import { scoreSignal } from "./scorer";
import { runConsensus } from "./consensus-engine";
import { rawEventToNormalizedEvent, confidenceInputFromRawEvent } from "./situations-adapter";
import { evolveCanonicalSituation } from "./situations-engine";
import { matchConfirmationSource, maybeRecordPublicConfirmation } from "./public-confirmation";
import { sourceScorerOnOutcome } from "../agents";
import { storage } from "../storage";
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
  const defaultConfidence = isOut ? 88 : 65;
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
    confidence: p.confidence ?? defaultConfidence,
    verdict: isOut ? "confirmed" : "likely",
    confirmation_strength: p.confirmation ?? (isOut ? "Consensus" : "Developing"),
  };
}

/* ─── Handler: lineup_confirm / lineup_change ───────────── */

function handleLineup(raw: RawEvent, isChange: boolean): Partial<LiveSignal> {
  const p = raw.payload as any;
  const status: string = p.status ?? (isChange ? "scratched" : "confirmed");
  const defaultConfidence = isChange ? 82 : 75;
  return {
    signal_type: isChange ? "lineup_change" : "lineup_confirm",
    headline: `${raw.player ?? raw.team ?? "Player"} ${isChange ? "scratched" : "confirmed"} — ${status}`,
    body: p.notes ?? `${raw.player ?? "Player"} ${status} in today's lineup.`,
    action_note: isChange
      ? `Reassess roster and availability context — ${raw.player} is out.`
      : `${raw.player} confirmed — lineups confirmed, monitor as verified context.`,
    why_it_matters: isChange
      ? `Lineup change alters team context, role availability, and downstream market signals.`
      : `Confirmed starters reduce uncertainty for pre-game roster and game context.`,
    lineup_status: status,
    betting_relevance: true,
    fantasy_relevance: true,
    confidence: p.confidence ?? defaultConfidence,
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
    headline: `${raw.team ?? "Market"}: ${openLine > 0 ? "+" : ""}${openLine} → ${currentLine > 0 ? "+" : ""}${currentLine} — ${isSharp ? "source-backed market move" : "market movement"}`,
    body: p.notes ?? `Line moved ${delta.toFixed(1)} points ${direction} from open. ${isSharp && sharpPct ? `${sharpPct}% of sharp tickets on ${raw.team}.` : ""}`,
    action_note: delta >= 2
      ? `Significant movement detected. Treat the market move as supporting context and wait for confirmation.`
      : `Monitor. Market may continue moving if source pressure is one-sided.`,
    why_it_matters: isSharp
      ? `Professional market activity diverges from public consensus and may confirm a team or game-context change.`
      : `Market movement may be reacting to new sports context before full public confirmation.`,
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
    headline: p.headline ?? `${raw.team ?? "Team"} — schematic matchup`,
    body: p.body ?? p.notes ?? "",
    action_note: p.action_note ?? "Evaluate for props and team totals.",
    why_it_matters: p.why_it_matters ?? "Schematic mismatch changes player role, usage, and game-context expectations.",
    betting_relevance: true,
    fantasy_relevance: true,
    confidence: p.confidence ?? 65,
    verdict: p.verdict ?? "likely",
    confirmation_strength: p.confirmation ?? "Developing",
  };
}

/* ─── Handler: coaching_change ──────────────────────────────── */

function handleCoachingChange(raw: RawEvent): Partial<LiveSignal> {
  const p = raw.payload as any;
  const team = raw.team ?? p.team ?? "Team";
  const player = raw.player ?? p.player ?? null;
  const isHire = /hired|named|joins/i.test(p.headline ?? "");
  const isFire = /fired|parts\s+ways|resign/i.test(p.headline ?? "");
  const changeType = isHire ? "hire" : isFire ? "firing" : "change";

  return {
    signal_type: "transaction",
    headline: player
      ? `${player} (${team}) — coaching ${changeType}`
      : `${team} — coaching ${changeType}`,
    body: p.notes ?? p.headline ?? `${team} coaching staff change reported.`,
    action_note: p.action_note ?? `Coaching changes affect scheme, depth chart, and team context. Monitor for downstream roster impact.`,
    why_it_matters: p.why_it_matters ?? `Coaching changes have direct impact on player roles, usage, and team betting context.`,
    betting_relevance: true,
    fantasy_relevance: true,
    confidence: p.confidence ?? 82,
    verdict: p.verdict ?? "confirmed",
    confirmation_strength: p.confirmation ?? "Corroborated",
  };
}

/* ─── Handler: eligibility_ruling ──────────────────────── */

function handleEligibilityRuling(raw: RawEvent): Partial<LiveSignal> {
  const p = raw.payload as any;
  const player = raw.player ?? "Player";
  const team = raw.team ?? "Team";
  return {
    signal_type: "eligibility_ruling",
    headline: `${player} (${team}) — eligibility ruling: cleared to play`,
    body: p.notes ?? `${player} has been granted eligibility by the NCAA. Immediate roster and lineup impact expected.`,
    action_note: p.action_note ?? `${player} is immediately eligible — update DFS, props, and depth chart exposure now.`,
    why_it_matters: p.why_it_matters ?? `Eligibility rulings have direct, immediate fantasy and betting impact. ${player} activates roster availability that was previously uncertain.`,
    betting_relevance: true,
    fantasy_relevance: true,
    confidence: p.confidence ?? 90,
    verdict: "confirmed",
    confirmation_strength: p.confirmation ?? "Corroborated",
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
    action_note: p.action_note ?? `Reassess roster, availability, and game context — ${txType} changes expected roles.`,
    why_it_matters: p.why_it_matters ?? `${txType} changes roster availability and may affect downstream market signals.`,
    injury_designation: designation,
    betting_relevance: true,
    fantasy_relevance: true,
    confidence: p.confidence ?? 85,
    verdict: "confirmed",
    confirmation_strength: p.confirmation ?? "Consensus",
  };
}

/* ─── Handler: odds_open ────────────────────────────────── */

function handleOddsOpen(raw: RawEvent): Partial<LiveSignal> {
  const p = raw.payload as any;
  const spread: number | null = p.open_spread ?? null;
  const total: number | null  = p.open_total  ?? null;
  const spreadStr = spread !== null ? `${spread > 0 ? "+" : ""}${spread}` : "N/A";
  const totalStr  = total  !== null ? String(total)  : "N/A";
  return {
    signal_type: "line_move",
    headline: `${p.matchup ?? raw.team ?? "Game"}: Opening line ${spreadStr} | O/U ${totalStr}`,
    body: `Opening spread: ${spreadStr}. Total: ${totalStr}. Market baseline established — monitor for sharp movement.`,
    action_note: "Opening line only. No confirmed timing advantage yet — watch for source-backed movement from this number.",
    why_it_matters: "Opening lines set the market baseline. Movement away from open is supporting context until tied to team or game news.",
    line_movement: spread !== null ? { open: spread, current: spread, delta: 0, direction: "flat" } : null,
    betting_relevance: true,
    fantasy_relevance: false,
    confidence: 52,
    verdict: "review",
    confirmation_strength: "Developing",
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

export function routeEventToFields(raw: RawEvent): Partial<LiveSignal> {
  switch (raw.event_type) {
    case "injury_update":      return handleInjuryUpdate(raw);
    case "lineup_confirm":     return handleLineup(raw, false);
    case "lineup_change":      return handleLineup(raw, true);
    case "line_move":          return handleLineMove(raw);
    case "weather_update":     return handleWeather(raw);
    case "scheme_note":        return handleSchemeNote(raw);
    case "transaction":        return handleTransaction(raw);
    case "coaching_change":    return handleCoachingChange(raw);
    case "eligibility_ruling": return handleEligibilityRuling(raw);
    case "odds_open":          return handleOddsOpen(raw);
    case "manual":             return handleManual(raw);
    default: {
      // Unknown event type: emit a low-confidence signal for human review
      // rather than dropping silently. A story at 25% that climbs to VERIFIED
      // is the product. A story that never appears is not.
      const p = raw.payload as any;
      console.warn(`[processor] Unknown event_type "${raw.event_type}" — emitting low-confidence unknown signal for review`);
      return {
        signal_type: "manual",
        headline: p.headline ?? `Unclassified signal — ${raw.player ?? raw.team ?? raw.league}`,
        body: p.notes ?? p.body ?? `Signal type "${raw.event_type}" has no classifier. Flagged for human review.`,
        action_note: "Review required — unrecognized signal type.",
        why_it_matters: "Unknown signal type detected. May represent a novel event category requiring classifier update.",
        betting_relevance: false,
        fantasy_relevance: false,
        confidence: 25,
        verdict: "review",
        confirmation_strength: "Unverified",
      };
    }
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

/* ─── Evidence merge ────────────────────────────────────────
 * Combines an existing signal's evidence with the incoming event's.
 * Sources are deduped by identity (name, falling back to id) so a
 * re-poll of the same feed never counts as corroboration; confidence
 * gets +3 per distinct corroborating source beyond the first, capped
 * at 92 (never below the base evaluation itself). raw_event_ids
 * accumulates instead of being overwritten, preserving provenance.
 */
function mergeSignalEvidence(
  existing: LiveSignal | null,
  incomingSources: Array<{ id?: string; name: string; type: string }>,
  rawEventId: string,
  baseConfidence: number,
): Pick<LiveSignal, "sources" | "source_count" | "raw_event_ids" | "confidence"> {
  const merged: LiveSignal["sources"] = [];
  const seen = new Set<string>();
  const add = (entry: unknown) => {
    // Rows written before the dedup fix hold JSON strings instead of
    // objects — parse them so identity dedup still applies.
    let src = entry;
    if (typeof src === "string") { try { src = JSON.parse(src); } catch { return; } }
    const s = src as { id?: string; name?: string; type?: string };
    const key = String(s.name ?? s.id ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push({ ...s, name: s.name ?? s.id ?? "unknown", type: s.type ?? "unknown" });
  };
  for (const e of existing?.sources ?? []) add(e);
  for (const e of incomingSources) add(e);

  const raw_event_ids = existing
    ? Array.from(new Set([...existing.raw_event_ids, rawEventId]))
    : [rawEventId];
  const confidence = Math.max(
    baseConfidence,
    Math.min(92, baseConfidence + 3 * Math.max(0, merged.length - 1)),
  );
  return { sources: merged, source_count: merged.length, raw_event_ids, confidence };
}

/* ─── Main process function ─────────────────────────────── */

export async function processRawEvents(): Promise<{ processed: number; errors: number }> {
  const pending = getUnprocessedRawEvents(500);
  let processed = 0;
  let errors = 0;

  if (pending.length > 0) {
    const byKey: Record<string, number> = {};
    for (const e of pending) {
      const k = `${e.league ?? "null"}/${e.event_type}`;
      byKey[k] = (byKey[k] ?? 0) + 1;
    }
    console.log(
      `[processor] cycle: ${pending.length} queued — ` +
      Object.entries(byKey).map(([k, v]) => `${k}×${v}`).join(", "),
    );
  }

  for (const raw of pending) {
    try {
      // Route event to Signal fields
      const fields = routeEventToFields(raw);
      const league = raw.league as League;
      const p = raw.payload as any;

      // Consensus evaluation — N independent evaluators score the same event
    const mutableFields = { ...fields };
    const consensus = runConsensus(raw, mutableFields);
    mutableFields.confidence = consensus.blendedConfidence;
    mutableFields.confirmation_strength = consensus.confirmationStrength;

      // Score the signal
      const scoreInputs = buildScoreInputs(league, mutableFields, raw);
      const scoreResult = scoreSignal(scoreInputs, p.game_time ?? undefined);

      // Derive sources array
      const sources = (p.sources as Array<{ id?: string; name: string; type: string }> | undefined) ?? [
        { id: raw.source_id, name: raw.source_id, type: raw.source_type },
      ];

      // Fingerprint lookup: reuse existing signal id if the same league/team/type
      // was seen within the last 4 hours so the upsert merges rather than creates.
      const signalType = (fields.signal_type ?? "manual") as SignalType;
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      const existingByFingerprint = p.signal_id
        ? null
        : findExistingSignal({ league, team: raw.team ?? null, player: raw.player ?? null, signal_type: signalType, since: fourHoursAgo });
      const existingSignal = p.signal_id ? getLiveSignal(p.signal_id) : existingByFingerprint;
      const signalId = p.signal_id ?? existingByFingerprint?.id ?? randomUUID();
      const signalFirstSeenAt = existingSignal?.first_seen_at ?? now();
      const evidence = mergeSignalEvidence(existingSignal, sources, raw.id, fields.confidence ?? 60);

      // Merge into LiveSignal
      const signal: LiveSignal = {
        id: signalId,
        league,
        game_id: raw.game_id,
        signal_type: signalType,
        headline: fields.headline ?? "Signal",
        body: fields.body ?? "",
        action_note: fields.action_note ?? "",
        why_it_matters: fields.why_it_matters ?? "",
        team: raw.team,
        player: raw.player,
        matchup: p.matchup ?? null,
        sources: evidence.sources,
        source_count: evidence.source_count,
        verdict: (fields.verdict ?? "review") as any,
        confidence: evidence.confidence,
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
        raw_event_ids: evidence.raw_event_ids,
        signal_time: raw.received_at,
        first_seen_at: signalFirstSeenAt,
        created_at: now(),
        updated_at: now(),
        outcome_id: null,
      };

      upsertLiveSignal(signal);
      insertSignalDetection(signal, raw);  // T1 logging — new signal detection
      storage.recordSignalStateTransition(
        signal.id,
        signal.verdict,
        signal.confidence,
        raw.source_id ?? null,
      );
      if (process.env.CANONICAL_SITUATIONS_ENABLED === "true") {
        processCanonicalSituationSafe(raw, signal, consensus.validatorAgreement);
      }
      markRawEventProcessed(raw.id);
      console.log(`[processor] marked processed: id=${raw.id.slice(0, 8)} league=${raw.league}`);
      console.log(`[processor] ${raw.league}/${raw.event_type} → ${signal.signal_type} conf:${signal.confidence} verdict:${signal.verdict} id:${signal.id.slice(0, 8)}`);
      processed++;
    } catch (err: any) {
      console.error(`[pipeline/processor] Error processing raw event ${raw.id}:`, err.message);
      errors++;
      // Still mark processed so we don't loop on bad data
      markRawEventProcessed(raw.id);
      console.log(`[processor] marked processed (error path): id=${raw.id.slice(0, 8)} league=${raw.league}`);
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

const mutableFields = { ...fields };
const consensus = runConsensus(raw, mutableFields);
mutableFields.confidence = consensus.blendedConfidence;
mutableFields.confirmation_strength = consensus.confirmationStrength;

const scoreInputs = buildScoreInputs(league, mutableFields, raw);
    const scoreResult = scoreSignal(scoreInputs, p.game_time ?? undefined);

    const sources = (p.sources as Array<{ name: string; type: string }> | undefined) ?? [
      { name: raw.source_id, type: raw.source_type },
    ];

    // Fingerprint lookup: reuse existing signal id if the same league/team/type
    // was seen within the last 4 hours so the upsert merges rather than creates.
    const signalType = (fields.signal_type ?? "manual") as SignalType;
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const existingByFingerprint = p.signal_id
      ? null
      : findExistingSignal({ league, team: raw.team ?? null, player: raw.player ?? null, signal_type: signalType, since: fourHoursAgo });
    const existingSignal = p.signal_id ? getLiveSignal(p.signal_id) : existingByFingerprint;
    const signalId = p.signal_id ?? existingByFingerprint?.id ?? randomUUID();
    const signalFirstSeenAt = existingSignal?.first_seen_at ?? now();
    const evidence = mergeSignalEvidence(existingSignal, sources, raw.id, fields.confidence ?? 60);

    const signal: LiveSignal = {
      id: signalId,
      league,
      game_id: raw.game_id,
      signal_type: signalType,
      headline: fields.headline ?? "Signal",
      body: fields.body ?? "",
      action_note: fields.action_note ?? "",
      why_it_matters: fields.why_it_matters ?? "",
      team: raw.team,
      player: raw.player,
      matchup: p.matchup ?? null,
      sources: evidence.sources,
      source_count: evidence.source_count,
      verdict: (fields.verdict ?? "review") as any,
      confidence: evidence.confidence,
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
      raw_event_ids: evidence.raw_event_ids,
      signal_time: raw.received_at,
      first_seen_at: signalFirstSeenAt,
      created_at: now(),
      updated_at: now(),
      outcome_id: null,
    };

    upsertLiveSignal(signal);
    insertSignalDetection(signal, raw);  // T1 logging — new signal detection
    storage.recordSignalStateTransition(
      signal.id,
      signal.verdict,
      signal.confidence,
      raw.source_id ?? null,
    );
    if (process.env.CANONICAL_SITUATIONS_ENABLED === "true") {
      processCanonicalSituationSafe(raw, signal, consensus.validatorAgreement);
    }
    markRawEventProcessed(raw.id);
    return signal;
  } catch (err: any) {
    console.error("[pipeline/processor] processOne error:", err.message);
    return null;
  }
}

function processCanonicalSituationSafe(raw: RawEvent, signal: LiveSignal, validatorAgreement = 0): void {
  try {
    const normalized = rawEventToNormalizedEvent(raw, signal);
    // Confirmation sources (official feeds, tier1 wires) close the verification
    // loop — drive the lifecycle to "official" instead of generic evidence_added.
    const confirmationSource = matchConfirmationSource(raw);
    const evolution = evolveCanonicalSituation({
      event: normalized,
      confidence_input: confidenceInputFromRawEvent(raw, signal, validatorAgreement),
      lifecycle_trigger: confirmationSource ? "official_confirmation" : undefined,
    });

    console.log(
      `[pubconf:diag] raw=${raw.id.slice(0, 8)}` +
      ` league=${raw.league}` +
      ` event_type=${raw.event_type}` +
      ` matched=${evolution.matched}` +
      ` situation=${evolution.situation.situation_id.slice(0, 8)}` +
      ` confirmation_source=${confirmationSource?.name ?? "null"}` +
      ` confirmation_reason=${confirmationSource?.reason ?? "null"}` +
      ` source_tier=${(raw.payload as any)?.source_tier ?? "none"}` +
      ` published_at=${(raw.payload as any)?.published_at ?? "none"}` +
      ` received_at=${raw.received_at}`
    );

    // North Star timing advantage: if this situation was detected earlier by
    // EdgeSetter and this event is its first mainstream pickup, stamp
    // publicConfirmation + detectionLeadMinutes (insert-once, never overwritten).
    maybeRecordPublicConfirmation(raw, evolution);

    // Non-blocking source rescore after every situation update.
    // When scores accumulate, the scorer will naturally compute higher
    // accuracy for sources whose signals reach confirmed/verified.
    sourceScorerOnOutcome(signal.id, raw.team ?? null).catch((err: Error) =>
      console.warn("[pipeline/processor] Source rescore failed — non-blocking:", err.message)
    );
  } catch (err: any) {
    console.error(`[SITUATION_FATAL] raw=${raw.id} league=${raw.league} event_type=${raw.event_type} error=${err.message} stack=${err.stack}`);
  }
}

