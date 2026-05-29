import fs from "node:fs";
import path from "node:path";
import type { NormalizedEvent } from "../pipeline/situations-contract";

const validationDir = path.resolve("C:/tmp/edgesetter-canonical-situation-calibration-corpus-validation");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

async function main(): Promise<void> {
  const { evolveCanonicalSituation } = await import("../pipeline/situations-engine");
  const {
    buildComparableSituationCorpus,
    buildComparableSituationCorpusRecord,
    matchComparableSituations,
  } = await import("../pipeline/situations-comparable-corpus");
  const { createOutcome } = await import("../pipeline/store");
  const { listCanonicalSituationApiResponses } = await import("../pipeline/situations-api");
  const {
    listCanonicalSituations,
    listSituationEvents,
    listSituationStateHistory,
  } = await import("../pipeline/situations-store");

  evolveComparableSituation(evolveCanonicalSituation, createOutcome, "target", "Target Guard", "pending");

  const targetRawInitial = listCanonicalSituations({ limit: 20 }).find((record) => record.players.includes("Target Guard"));
  const fallbackCorpus = buildComparableSituationCorpus();
  const fallbackTarget = buildComparableSituationCorpusRecord({
    record: required(targetRawInitial, "target missing"),
    events: listSituationEvents(targetRawInitial!.situation_id),
    stateHistory: listSituationStateHistory(targetRawInitial!.situation_id),
  });
  const fallbackSummary = matchComparableSituations({ target: fallbackTarget, corpus: fallbackCorpus });

  evolveComparableSituation(evolveCanonicalSituation, createOutcome, "alpha", "Alpha Guard", "clv");
  evolveComparableSituation(evolveCanonicalSituation, createOutcome, "beta", "Beta Guard", "outcome");
  evolveComparableSituation(evolveCanonicalSituation, createOutcome, "gamma", "Gamma Guard", "replay");

  const corpus = buildComparableSituationCorpus();
  const corpusAgain = buildComparableSituationCorpus();
  const targetRaw = required(listCanonicalSituations({ limit: 20 }).find((record) => record.players.includes("Target Guard")), "target missing after corpus");
  const target = buildComparableSituationCorpusRecord({
    record: targetRaw,
    events: listSituationEvents(targetRaw.situation_id),
    stateHistory: listSituationStateHistory(targetRaw.situation_id),
  });
  const targetEvents = listSituationEvents(targetRaw.situation_id);
  const summary = matchComparableSituations({ target, corpus });
  const summaryAgain = matchComparableSituations({ target, corpus: corpusAgain });
  const apiTarget = listCanonicalSituationApiResponses({ league: "NBA", limit: 20 })
    .find((item) => item.players.includes("Target Guard"));

  const checks = [
    result("missing_corpus_uses_honest_fallback", fallbackSummary.sample_status === "missing_corpus" &&
      fallbackSummary.support_level === "none" &&
      fallbackSummary.limitations.some((item) => item.includes("Missing corpus data")) &&
      fallbackSummary.limitations.some((item) => item.includes("No exact win rate or prediction accuracy")), {
      fallbackSummary,
    }),
    result("corpus_is_deterministic", stableJson(corpus) === stableJson(corpusAgain), {
      corpusIds: corpus.map((record) => record.corpus_id),
    }),
    result("matching_is_deterministic", stableJson(summary) === stableJson(summaryAgain) && summary.matches.length >= 2, {
      summary,
    }),
    result("outcome_link_status_is_deterministic", summary.outcome_link_status === "clv_linked" &&
      summary.clv_support_status === "available" &&
      summary.calibration_sample_band === "limited_sample" &&
      stableJson(corpus.map((record) => ({
        id: record.situation_id,
        outcomeLinkStatus: record.outcomeLinkStatus,
        settlementStatus: record.settlementStatus,
        clvSupportStatus: record.clvSupportStatus,
        calibrationSampleBand: record.calibrationSampleBand,
      }))) === stableJson(corpusAgain.map((record) => ({
        id: record.situation_id,
        outcomeLinkStatus: record.outcomeLinkStatus,
        settlementStatus: record.settlementStatus,
        clvSupportStatus: record.clvSupportStatus,
        calibrationSampleBand: record.calibrationSampleBand,
      }))), {
      linkage: corpus.map((record) => ({
        player: record.players[0] ?? record.situation_id,
        outcomeLinkStatus: record.outcomeLinkStatus,
        settlementStatus: record.settlementStatus,
        clvSupportStatus: record.clvSupportStatus,
        calibrationSampleBand: record.calibrationSampleBand,
      })),
      summary: {
        outcome_link_status: summary.outcome_link_status,
        clv_support_status: summary.clv_support_status,
        calibration_sample_band: summary.calibration_sample_band,
      },
    }),
    result("signal_lineage_is_preserved_when_available", targetEvents.some((event) =>
      (event.payload.evidence_lineage as any)?.lineageStatus === "signal_linked" &&
      (event.payload.evidence_lineage as any)?.signalId === "sig_target" &&
      Boolean((event.payload.evidence_lineage as any)?.rawEventId)
    ) && target.outcomeCalibrationBasis?.some((basis) => basis.includes("signal IDs")) === true, {
      lineage: targetEvents.map((event) => event.payload.evidence_lineage ?? null),
      basis: target.outcomeCalibrationBasis,
    }),
    result("missing_outcome_and_clv_use_honest_language", corpus.some((record) =>
      record.players.includes("Gamma Guard") &&
      record.outcomeLinkStatus === "pending_outcome" &&
      record.clvSupportStatus === "unavailable" &&
      record.outcomeCalibrationLimitations?.some((limitation) => limitation.includes("CLV support unavailable"))
    ) && summary.limitations.some((limitation) => /CLV-linked comparison exists|CLV support unavailable|CLV support/.test(limitation)), {
      gamma: corpus.find((record) => record.players.includes("Gamma Guard")) ?? null,
      limitations: summary.limitations,
    }),
    result("matching_uses_safe_dimensions", summary.matches.every((match) =>
      match.matched_dimensions.includes("sport") &&
      match.matched_dimensions.includes("league") &&
      match.matched_dimensions.includes("situation type") &&
      match.matched_dimensions.every((dimension) => [
        "sport",
        "league",
        "situation type",
        "lifecycle path",
        "confidence band",
        "source depth band",
        "market reaction band",
        "timing profile",
      ].includes(dimension))
    ), {
      dimensions: summary.matches.map((match) => match.matched_dimensions),
    }),
    result("api_fields_use_comparable_corpus_without_route_breakage", Boolean(apiTarget) &&
      apiTarget!.historicalPatternBasis?.some((basis) => basis.includes("Comparable corpus matched")) === true &&
      /comparable replay pattern support|comparable support/.test(apiTarget!.calibrationSummary ?? "") &&
      apiTarget!.calibrationLimitations?.some((limitation) => limitation.includes("No exact win rate or prediction accuracy")) === true, {
      apiTarget,
    }),
    result("no_unsupported_exact_accuracy_claims", !stableJson({
      summary,
      apiTarget,
    }).match(/hit rate|prediction accuracy is [0-9]|win rate is [0-9]|positive CLV|prior-season count/i), {
      calibrationSummary: apiTarget?.calibrationSummary ?? null,
      limitations: apiTarget?.calibrationLimitations ?? null,
    }),
  ];

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name} ${JSON.stringify(check.details)}`);
  }

  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

function evolveComparableSituation(
  evolveCanonicalSituation: (input: any) => unknown,
  createOutcome: (input: any) => unknown,
  key: string,
  player: string,
  outcomeMode: "pending" | "replay" | "outcome" | "clv",
): void {
  const baseTime = `2026-05-2${key === "target" ? "0" : key === "alpha" ? "1" : key === "beta" ? "2" : "3"}T18:00:00.000Z`;
  const signalId = `sig_${key}`;
  evolveCanonicalSituation({
    event: normalizedEvent({
      normalized_event_id: `ne_${key}_injury_1`,
      source_id: `${key}-beat`,
      source_type: "scrape",
      sport: "basketball",
      league: "NBA",
      game_id: `nba_${key}`,
      teams: ["BOS", "NYK"],
      players: [player],
      event_type: "injury_update",
      situation_type: "injury",
      semantic_fingerprint: `${player.toLowerCase()} ankle questionable`,
      occurred_at: baseTime,
      received_at: addMinutes(baseTime, 2),
      summary: `${player} moved to questionable with ankle issue.`,
      payload: { validation: true, signal_id: signalId },
    }),
    confidence_input: confidenceInput(72, addMinutes(baseTime, 2)),
    lifecycle_trigger: "evidence_added",
  });

  evolveCanonicalSituation({
    event: normalizedEvent({
      normalized_event_id: `ne_${key}_injury_2`,
      source_id: `${key}-market`,
      source_type: "market",
      sport: "basketball",
      league: "NBA",
      game_id: `nba_${key}`,
      teams: ["BOS", "NYK"],
      players: [player],
      event_type: "market_reaction",
      situation_type: "injury",
      semantic_fingerprint: `${player.toLowerCase()} ankle questionable`,
      occurred_at: addMinutes(baseTime, 3),
      received_at: addMinutes(baseTime, 4),
      summary: `Market moved after ${player} injury reporting.`,
      payload: { validation: true, signal_id: signalId },
      market_context: {
        market: "spread",
        open: -4.5,
        current: -3.5,
        delta: 1,
        direction: "up",
        sportsbook: "validation-book",
      },
    }),
    confidence_input: confidenceInput(78, addMinutes(baseTime, 4)),
    lifecycle_trigger: "market_reaction",
  });

  if (outcomeMode === "pending" || outcomeMode === "replay") return;

  evolveCanonicalSituation({
    event: normalizedEvent({
      normalized_event_id: `ne_${key}_injury_3`,
      source_id: `${key}-official`,
      source_type: "api",
      sport: "basketball",
      league: "NBA",
      game_id: `nba_${key}`,
      teams: ["BOS", "NYK"],
      players: [player],
      event_type: "official_resolution",
      situation_type: "injury",
      semantic_fingerprint: `${player.toLowerCase()} ankle questionable`,
      occurred_at: addMinutes(baseTime, 20),
      received_at: addMinutes(baseTime, 22),
      summary: `${player} status resolved before tip.`,
      payload: { validation: true, signal_id: signalId },
    }),
    confidence_input: confidenceInput(86, addMinutes(baseTime, 22)),
    lifecycle_trigger: "resolution",
  });

  createOutcome({
    signal_id: signalId,
    game_id: `nba_${key}`,
    home_score: 108,
    away_score: 101,
    market: "spread",
    line_at_signal: -4.5,
    closing_line: outcomeMode === "clv" ? -3.5 : null,
    actual_result: 7,
    hit: outcomeMode === "clv" ? true : false,
    clv: outcomeMode === "clv" ? 1 : null,
    recorded_at: addMinutes(baseTime, 180),
  });
}

function normalizedEvent(overrides: Record<string, any>): NormalizedEvent {
  return {
    raw_event_id: `raw_${overrides.normalized_event_id}`,
    payload: { validation: true },
    market_context: undefined,
    roster_context: undefined,
    ...overrides,
  } as unknown as NormalizedEvent;
}

function confidenceInput(score: number, computedAt: string) {
  const caps = [22, 18, 16, 14, score >= 84 ? 20 : 0, 10] as const;
  let remaining = score;
  const values = caps.map((cap) => {
    const value = Math.min(cap, remaining);
    remaining -= value;
    return value;
  });
  return {
    source_reliability: values[0],
    independent_confirmations: values[1],
    market_alignment: values[2],
    validator_agreement: values[3],
    official_confirmation: values[4],
    freshness: values[5],
    contradiction_penalty: 0,
    computed_at: computedAt,
  };
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60000).toISOString();
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortJson((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
  }
  return value;
}

function required<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

function result(name: string, ok: boolean, details: Record<string, unknown>) {
  return { name, ok, details };
}

void main();
