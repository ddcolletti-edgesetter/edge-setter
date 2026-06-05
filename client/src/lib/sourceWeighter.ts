/* ────────────────────────────────────────────────────────────
   Edge Setter — Source Quality Weighter
   Converts source metadata on a signal into a numeric quality
   score (0–25) used by the signal scorer.

   Philosophy:
   - Reward high-quality, named, diverse sources
   - Reward official confirmation and named insiders
   - Reward consensus across independent sources
   - Penalize conflicting information
   - Do NOT simply reward "more sources" — quality > quantity
   ──────────────────────────────────────────────────────────── */

import type { ConfirmationStrength, Verdict } from "../data/v2MockData";

/* ── Per-type base quality points ─────────────────────────── */
const SOURCE_TYPE_QUALITY: Record<string, number> = {
  "official report":     3.5,   // League-mandated reports (highest trust)
  "beat reporter":       3.0,   // Full-time team access reporters
  "wire service":        2.5,
  "sportsbook":          2.5,   // Sharp-accepting books (Pinnacle, Circa)
  "sharp money":         2.0,
  sharp_money:           2.0,
  "line tracking":       2.0,
  line_tracking:         2.0,
  "analytics":           2.0,
  "tracking data":       2.0,
  tracking_data:         2.0,
  "fantasy platform":    1.5,
  fantasy_platform:      1.5,
  "broadcast":           1.5,
  "practice observation":1.5,
  practice_observation:  1.5,
  "rotational":          1.0,
  "social":              0.5,
  "weather service":     2.5,
  weather_service:       2.5,
  "transaction":         3.5,
};

/* ── Named insider bonus map ──────────────────────────────── */
const NAMED_INSIDER_BONUS: Record<string, number> = {
  "Woj":            2.0,
  "Shams":          2.0,
  "Schefter":       2.0,
  "Rapoport":       1.5,
  "Rotowire":       1.0,
  "The Athletic":   1.0,
  "Pinnacle":       1.5,   // Sharp-accepting book — line moves here = real signal
  "Circa Sports":   1.5,
  "Circa":          1.5,
  "Statcast":       1.0,
  "PFF":            0.75,
  "Action Network": 0.75,
  "NBA Official Injury Report": 2.0,
  "NFL Official Injury Report": 2.0,
  "MLB Transaction Wire":       2.0,
};

/* ── Confirmation strength bonus ─────────────────────────── */
const CONFIRMATION_BONUS: Record<ConfirmationStrength, number> = {
  consensus:     5.0,
  corroborated:  2.5,
  single:        0.0,
};

/* ── Verdict trust modifier ───────────────────────────────── */
const VERDICT_MODIFIER: Record<Verdict, number> = {
  confirmed:     1.0,
  likely:        0.85,
  review:        0.65,
  rumor:         0.50,
  contradicted: -4.0,  // active penalty for conflicting info
};

/* ── Max points per component ────────────────────────────── */
const MAX_TYPE_QUALITY   = 14.0;   // cap on source-type points
const MAX_INSIDER_BONUS  =  5.0;   // cap on named insider bonuses
const MAX_COUNT_BONUS    =  3.0;   // bonus for breadth of source count
const MAX_CONFIRMATION   =  5.0;
const SCORE_CAP          = 25.0;

/* ────────────────────────────────────────────────────────────
   Main scorer
   ──────────────────────────────────────────────────────────── */

export interface SourceQualityResult {
  score: number;          // 0–25
  breakdown: {
    typeQuality: number;
    insiderBonus: number;
    confirmationBonus: number;
    countBonus: number;
    verdictModifier: number;
  };
  explanation: string;
}

export function computeSourceQuality(opts: {
  sourceTypes?: string[];
  sourceLabels?: string[];
  sources: number;
  confirmationStrength?: ConfirmationStrength;
  verdict: Verdict;
}): SourceQualityResult {
  const { sourceTypes = [], sourceLabels = [], sources, confirmationStrength, verdict } = opts;

  /* 1. Source type quality — score each type, cap total */
  let typeQuality = 0;
  for (const t of sourceTypes) {
    typeQuality += SOURCE_TYPE_QUALITY[t] ?? 0.5;
  }
  // If no typed sources but we have a count, estimate based on count
  if (sourceTypes.length === 0 && sources > 0) {
    typeQuality = Math.min(sources * 1.2, MAX_TYPE_QUALITY * 0.6);
  }
  typeQuality = Math.min(typeQuality, MAX_TYPE_QUALITY);

  /* 2. Named insider / labeled source bonus */
  let insiderBonus = 0;
  for (const label of sourceLabels) {
    for (const [name, bonus] of Object.entries(NAMED_INSIDER_BONUS)) {
      if (label.includes(name)) {
        insiderBonus += bonus;
        break; // only once per label
      }
    }
  }
  insiderBonus = Math.min(insiderBonus, MAX_INSIDER_BONUS);

  /* 3. Source count breadth bonus (beyond quality, rewards independent verification) */
  // Logarithmic — more sources helps but diminishes fast
  const countBonus = sources >= 2
    ? Math.min(Math.log2(sources) * 1.2, MAX_COUNT_BONUS)
    : 0;

  /* 4. Confirmation strength bonus */
  const confirmationBonus = Math.min(
    CONFIRMATION_BONUS[confirmationStrength ?? "single"],
    MAX_CONFIRMATION
  );

  /* 5. Verdict trust modifier (multiplicative on the base) */
  const verdictMod = VERDICT_MODIFIER[verdict];

  /* Assemble raw score */
  const raw = (typeQuality + insiderBonus + countBonus + confirmationBonus) * Math.max(verdictMod, 0);
  const contradictionPenalty = verdict === "contradicted" ? VERDICT_MODIFIER.contradicted : 0;
  const score = Math.max(0, Math.min(raw + contradictionPenalty, SCORE_CAP));

  /* Build explanation */
  const parts: string[] = [];
  if (typeQuality >= 10) parts.push("high-quality source types");
  else if (typeQuality >= 6) parts.push("solid source types");
  else parts.push("limited source type diversity");

  if (insiderBonus >= 3) parts.push("named insiders (Woj/Shams/Schefter/Pinnacle)");
  else if (insiderBonus >= 1.5) parts.push("credentialed named sources");

  if (confirmationStrength === "consensus") parts.push("consensus across ≥3 independent sources");
  else if (confirmationStrength === "corroborated") parts.push("corroborated by 2+ sources");
  else parts.push("single-source — not yet corroborated");

  if (sources >= 10) parts.push(`${sources} total sources`);
  else if (sources >= 5) parts.push(`${sources} reports`);

  if (verdict === "contradicted") parts.push("PENALTY: contradicted verdict");
  else if (verdict === "rumor") parts.push("rumor status reduces trust");

  return {
    score: parseFloat(score.toFixed(2)),
    breakdown: {
      typeQuality: parseFloat(typeQuality.toFixed(2)),
      insiderBonus: parseFloat(insiderBonus.toFixed(2)),
      confirmationBonus: parseFloat(confirmationBonus.toFixed(2)),
      countBonus: parseFloat(countBonus.toFixed(2)),
      verdictModifier: verdictMod,
    },
    explanation: parts.join("; "),
  };
}
