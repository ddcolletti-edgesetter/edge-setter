// ─── Insider Signal Detector ──────────────────────────────────────────────────
// Detects whether a source is behaving like an insider on a specific claim,
// regardless of their global tier. A tier3 beat writer who is first to file
// on his specific team, uses insider language, and has a strong team-specific
// accuracy record should be treated as tier1 for that claim.
//
// Pure computation — no storage reads. All context is passed in.
// The caller (Verifier) is responsible for fetching the data and passing it.

export interface InsiderContext {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  league: string;
  team: string | null;
  player: string | null;
  claimText: string;
  isFirstReporterOnStory: boolean;
  teamAccuracyScore: number | null;
  globalAccuracyScore: number | null;
  teamSampleSize: number;
}

export interface InsiderSignalResult {
  isInsider: boolean;
  insiderScore: number;       // 0-1
  effectiveMassBoost: number; // additive boost to DST belief mass
  reasons: string[];
}

const INSIDER_LANGUAGE_PATTERNS = [
  /\bi('m| am) told\b/i,
  /\bper (my |a |multiple )?sources?\b/i,
  /\bsources? (tell|told|confirm|say|indicate)/i,
  /\blearned that\b/i,
  /\bexclusively\b/i,
  /\bbreaking\b/i,
  /\bfirst (to report|reported)\b/i,
  /\bconfirmed (with|by|to me)\b/i,
  /\bsource(s)? with (direct|knowledge|access|inside)\b/i,
];

const PROXIMITY_SOURCE_TYPES = new Set([
  "beat_reporter",
  "insider",
  "local",
  "team_official",
  "practice_observation",
]);

export function detectInsiderSignals(ctx: InsiderContext): InsiderSignalResult {
  const reasons: string[] = [];
  let insiderScore = 0;

  // 1. Source type proximity
  if (PROXIMITY_SOURCE_TYPES.has(ctx.sourceType.toLowerCase())) {
    insiderScore += 0.15;
    reasons.push(`source type "${ctx.sourceType}" indicates proximity`);
  }

  // 2. Insider language patterns
  const matchedPatterns = INSIDER_LANGUAGE_PATTERNS.filter(p => p.test(ctx.claimText));
  if (matchedPatterns.length >= 2) {
    insiderScore += 0.18;
    reasons.push("multiple insider language patterns detected");
  } else if (matchedPatterns.length === 1) {
    insiderScore += 0.10;
    reasons.push("insider language pattern detected");
  }

  // 3. First reporter on story
  if (ctx.isFirstReporterOnStory) {
    insiderScore += 0.12;
    reasons.push("first reporter on this story");
  }

  // 4. Team-specific accuracy track record (most powerful long-term signal)
  if (ctx.teamAccuracyScore !== null && ctx.teamSampleSize >= 5) {
    if (ctx.teamAccuracyScore >= 0.80) {
      insiderScore += 0.25;
      reasons.push(
        `team accuracy ${(ctx.teamAccuracyScore * 100).toFixed(0)}% on ${ctx.team} (n=${ctx.teamSampleSize})`
      );
    } else if (ctx.teamAccuracyScore >= 0.65) {
      insiderScore += 0.15;
      reasons.push(
        `solid team accuracy ${(ctx.teamAccuracyScore * 100).toFixed(0)}% on ${ctx.team} (n=${ctx.teamSampleSize})`
      );
    }
  } else if (ctx.teamAccuracyScore !== null && ctx.teamSampleSize >= 2) {
    if (ctx.teamAccuracyScore >= 0.80) {
      insiderScore += 0.10;
      reasons.push(
        `early team accuracy ${(ctx.teamAccuracyScore * 100).toFixed(0)}% on ${ctx.team} (n=${ctx.teamSampleSize}, small sample)`
      );
    }
  }

  // 5. Strong global accuracy as a floor boost
  if (ctx.globalAccuracyScore !== null && ctx.globalAccuracyScore >= 0.75) {
    insiderScore += 0.08;
    reasons.push(`strong global accuracy ${(ctx.globalAccuracyScore * 100).toFixed(0)}%`);
  }

  // Cap: even the strongest local insider shouldn't exceed a well-corroborated tier1
  insiderScore = Math.min(insiderScore, 0.60);

  // Translate score into a DST mass boost.
  // A tier3 source (base mass 0.40) with full insider boost (0.60) → effective 0.88 —
  // just under a lone tier1 (0.85). Correct ceiling: alone they can't VERIFIED,
  // but they can push a second supporting source over the threshold.
  const effectiveMassBoost = insiderScore * 0.50;
  const isInsider = insiderScore >= 0.20;

  return { isInsider, insiderScore, effectiveMassBoost, reasons };
}

export function hasInsiderLanguage(text: string): boolean {
  return INSIDER_LANGUAGE_PATTERNS.some(p => p.test(text));
}
