/**
 * Shared urgency-label logic.
 *
 * WHY THIS EXISTS: scorer.ts historically computed urgency_label once, at score
 * time, and stored it. It was never re-evaluated as a signal aged or its game
 * finished — so a line_move for a game that ended hours ago could still read as
 * URGENT/WATCH on the board. The thresholds now live in ONE pure function so
 * both scorer.ts (write time) and the delivery path (read time) agree, and so a
 * finished/expired game is always demoted to NOTE.
 *
 * computeUrgency() is the single source of truth for the thresholds.
 * recomputeUrgency() adapts a stored LiveSignal + current game state onto it.
 */

import type { LiveSignal, UrgencyLabel } from "./types";

/** A game is treated as done (no live edge) once it is final or this many
 *  minutes past its scheduled start. Also used by the settlement archive sweep. */
export const GAME_COMPLETED_GRACE_MIN = 240; // 4 hours

/** Game is >1h away (or unknown): the betting decision window is still open. */
const DECISION_WINDOW_MIN = 60;

export interface UrgencyInputs {
  totalScore: number;
  ageMinutes: number;
  /** minutes until game start; negative = past; null = no game time known */
  minutesToGame: number | null;
  bettingRelevance: boolean;
  lineMovementDelta: number;
  injuryDesignation?: string | null;
  /** current game.status === "final" */
  gameFinal?: boolean;
}

export interface UrgencyResult {
  label: UrgencyLabel;
  reason: string;
}

/**
 * The single source of truth for urgency thresholds. Pure — no clock, no DB.
 *
 * The game-completed override is checked FIRST: for a fresh signal (write time)
 * the game is neither final nor hours past kickoff, so the override is inert and
 * behaviour is identical to the original scorer.ts logic. At read time a
 * finished/expired game short-circuits to NOTE.
 */
export function computeUrgency(i: UrgencyInputs): UrgencyResult {
  const gameCompleted =
    i.gameFinal === true ||
    (i.minutesToGame !== null && i.minutesToGame < -GAME_COMPLETED_GRACE_MIN);
  if (gameCompleted) {
    return { label: "NOTE", reason: "Game completed" };
  }

  const decisionWindowOpen =
    i.minutesToGame === null || i.minutesToGame > DECISION_WINDOW_MIN;
  const delta = i.lineMovementDelta ?? 0;
  const isBreakingInjury =
    (i.injuryDesignation === "OUT" || i.injuryDesignation === "IL-60") &&
    i.ageMinutes < 60;

  if ((i.totalScore >= 80 && i.ageMinutes < 30) || isBreakingInjury) {
    return {
      label: "LIVE",
      reason: isBreakingInjury
        ? `Breaking: ${i.injuryDesignation} confirmed within 60 minutes — adjust bets immediately`
        : "Real-time edge — line may still be moving, act within the next 15 minutes",
    };
  }

  if (
    i.totalScore >= 65 &&
    i.ageMinutes < 120 &&
    (i.bettingRelevance || delta > 0) &&
    decisionWindowOpen
  ) {
    return {
      label: "URGENT",
      reason:
        delta > 0
          ? `Line moved ${delta} pts — sharp money still flowing, window closing`
          : "High-confidence signal — decision window open now",
    };
  }

  if (i.totalScore >= 48 && decisionWindowOpen) {
    return {
      label: "WATCH",
      reason: "Actionable signal — monitor for confirmation or market movement",
    };
  }

  return {
    label: "NOTE",
    reason: "Context signal — low urgency or closed decision window",
  };
}

/** Minimal game state the read-time recompute needs. */
export interface UrgencyGameState {
  status?: string | null;
  game_time?: string | null;
}

/**
 * Recompute urgency for a stored signal using the CURRENT clock and game state.
 * Age is anchored on created_at (≈ the received_at scorer.ts used at write time).
 */
export function recomputeUrgency(
  signal: Pick<
    LiveSignal,
    "score" | "created_at" | "betting_relevance" | "line_movement" | "injury_designation"
  >,
  game: UrgencyGameState | null,
  now: number = Date.now(),
): UrgencyResult {
  const createdMs = Date.parse(signal.created_at);
  const ageMinutes = Number.isFinite(createdMs) ? (now - createdMs) / 60000 : 999;

  const gameTimeMs = game?.game_time ? Date.parse(game.game_time) : NaN;
  const minutesToGame = Number.isFinite(gameTimeMs) ? (gameTimeMs - now) / 60000 : null;

  return computeUrgency({
    totalScore: signal.score,
    ageMinutes,
    minutesToGame,
    bettingRelevance: Boolean(signal.betting_relevance),
    lineMovementDelta: signal.line_movement?.delta ?? 0,
    injuryDesignation: signal.injury_designation,
    gameFinal: game?.status === "final",
  });
}
