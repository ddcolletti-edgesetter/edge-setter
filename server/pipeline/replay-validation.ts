import type { ReplayMarketState } from "../storage";
import { deriveReplayClvStates, getReplaySignals } from "./replay";
import { getClosingSnapshot, getOutcomes, getPipelineDb, getSnapshotHistory } from "./store";

export interface ReplayOutcomeValidation {
  signal_id: string;
  outcome_id: string | null;
  game_id: string | null;
  as_of: string | null;
  matched: boolean;
  replay_clv: number | null;
  outcome_clv: number | null;
  reason: string | null;
}

export interface ReplayParityValidation {
  scope: "game" | "league";
  id: string;
  total: number;
  matched: number;
  mismatched: number;
  validations: ReplayOutcomeValidation[];
}

export interface ReplayParityReport {
  generated_at: string;
  total: number;
  matched: number;
  mismatched: number;
  by_game: ReplayParityValidation[];
  by_league: ReplayParityValidation[];
}

export function validateReplayAgainstOutcome(
  signalId: string,
): ReplayOutcomeValidation {
  const outcome = getOutcomes(signalId)[0];

  if (!outcome) {
    return {
      signal_id: signalId,
      outcome_id: null,
      game_id: null,
      as_of: null,
      matched: false,
      replay_clv: null,
      outcome_clv: null,
      reason: "No outcome found for signal",
    };
  }

  const asOf = outcome.recorded_at ?? outcome.created_at;
  const snapshotHistory = getSnapshotHistory(outcome.game_id, 200, asOf);
  const replay: ReplayMarketState = {
    game_id: outcome.game_id,
    as_of: asOf,
    latest_snapshot: getClosingSnapshot(outcome.game_id),
    snapshot_history: snapshotHistory,
    signals: getReplaySignals(outcome.game_id, asOf),
    clv_states: [],
  };
  const clvStates = deriveReplayClvStates(replay);
  const replayClv = clvStates.find(
    state => state.signal_id === signalId && state.market === outcome.market,
  )?.clv ?? null;
  const matched = replayClv === outcome.clv;

  return {
    signal_id: signalId,
    outcome_id: outcome.id,
    game_id: outcome.game_id,
    as_of: asOf,
    matched,
    replay_clv: replayClv,
    outcome_clv: outcome.clv,
    reason: matched ? null : "Replay CLV does not match stored outcome CLV",
  };
}

export function printReplayParitySummary(): string {
  const report = exportReplayParityReport();
  const lines = [
    `Replay parity: ${report.matched}/${report.total} matched (${report.mismatched} mismatched)`,
    `Games checked: ${report.by_game.length}`,
    `Leagues checked: ${report.by_league.length}`,
  ];
  const summary = lines.join("\n");
  console.log(summary);
  return summary;
}

export function exportReplayParityReport(): ReplayParityReport {
  const db = getPipelineDb();
  const gameRows = db.prepare(`
    SELECT DISTINCT game_id
    FROM outcomes
    WHERE game_id IS NOT NULL
    ORDER BY game_id ASC
  `).all() as { game_id: string }[];
  const leagueRows = db.prepare(`
    SELECT DISTINCT s.league
    FROM outcomes o
    JOIN live_signals s ON s.id = o.signal_id
    WHERE s.league IS NOT NULL
    ORDER BY s.league ASC
  `).all() as { league: string }[];

  const byGame = gameRows.map(row => validateReplayParityForGame(row.game_id));
  const byLeague = leagueRows.map(row => validateReplayParityForLeague(row.league));
  const validations = dedupeValidations(byGame.flatMap(game => game.validations));
  const matched = validations.filter(validation => validation.matched).length;

  return {
    generated_at: new Date().toISOString(),
    total: validations.length,
    matched,
    mismatched: validations.length - matched,
    by_game: byGame,
    by_league: byLeague,
  };
}

export function validateReplayParityForGame(gameId: string): ReplayParityValidation {
  const db = getPipelineDb();
  const rows = db.prepare(`
    SELECT DISTINCT signal_id
    FROM outcomes
    WHERE game_id = ?
    ORDER BY signal_id ASC
  `).all(gameId) as { signal_id: string }[];

  return buildParityValidation(
    "game",
    gameId,
    rows.map(row => row.signal_id),
  );
}

function dedupeValidations(
  validations: ReplayOutcomeValidation[],
): ReplayOutcomeValidation[] {
  const seen = new Set<string>();

  return validations.filter(validation => {
    const key = validation.outcome_id ?? validation.signal_id;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function validateReplayParityForLeague(league: string): ReplayParityValidation {
  const db = getPipelineDb();
  const rows = db.prepare(`
    SELECT DISTINCT o.signal_id
    FROM outcomes o
    JOIN live_signals s ON s.id = o.signal_id
    WHERE s.league = ?
    ORDER BY o.signal_id ASC
  `).all(league) as { signal_id: string }[];

  return buildParityValidation(
    "league",
    league,
    rows.map(row => row.signal_id),
  );
}

function buildParityValidation(
  scope: ReplayParityValidation["scope"],
  id: string,
  signalIds: string[],
): ReplayParityValidation {
  const validations = signalIds.map(validateReplayAgainstOutcome);
  const matched = validations.filter(validation => validation.matched).length;

  return {
    scope,
    id,
    total: validations.length,
    matched,
    mismatched: validations.length - matched,
    validations,
  };
}
