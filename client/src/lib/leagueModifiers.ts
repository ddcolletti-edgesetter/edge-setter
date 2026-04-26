/* ────────────────────────────────────────────────────────────
   Edge Setter — League-Specific Scoring Modifiers
   Applied as multipliers on individual scoring components.
   One shared framework; each sport amplifies what matters most.

   Design principle:
   - NBA: injury status, rotation impact, closing lineups dominate
   - MLB: pitcher/starter changes and weather have outsized effect
   - NFL: injury designation, scheme mismatch, practice participation
   - CFB: scheme edge, starting QB news, sharp movement on spreads
   ──────────────────────────────────────────────────────────── */

export type Sport = "NBA" | "MLB" | "NFL" | "CFB";

export interface LeagueModifierSet {
  /* Signal type multipliers — applied to the full composite score
     when a signal's type matches the key.                          */
  signalType: Record<string, number>;

  /* Component-level multipliers — applied to individual score factors */
  components: {
    recencyWeight:      number;   // how much freshness matters in this sport
    marketImpactWeight: number;   // how much line movement matters
    sourceQualityWeight:number;   // how much source credibility weighs
    contextWeight:      number;   // how much scheme/matchup/rotation intel weighs
  };

  /* Urgency boost — added to total when signal is recent + betting-relevant */
  urgencyBoost: number;
}

const NBA_MODIFIERS: LeagueModifierSet = {
  signalType: {
    injury:       1.40,  // Star player out = enormous NBA impact
    rotation:     1.30,  // Closing lineup / minutes usage
    lineup:       1.30,
    prop:         1.10,
    sharp_money:  1.10,
    line_move:    1.10,
    matchup_edge: 1.05,
    trend:        0.90,
    news:         0.85,
  },
  components: {
    recencyWeight:       1.20,  // Status changes close to tip-off matter a lot
    marketImpactWeight:  1.10,
    sourceQualityWeight: 1.10,
    contextWeight:       1.15,  // Rotation + matchup intel highly actionable
  },
  urgencyBoost: 8,
};

const MLB_MODIFIERS: LeagueModifierSet = {
  signalType: {
    lineup:       1.50,  // Pitcher scratch / starter change = massive shift
    transaction:  1.50,  // IL activation/placement
    weather:      1.40,  // Wind / rain → total repricing
    injury:       1.20,
    sharp_money:  1.15,
    line_move:    1.20,
    matchup_edge: 1.00,
    prop:         1.05,
    trend:        0.85,
    rotation:     0.90,
    news:         0.80,
  },
  components: {
    recencyWeight:       1.15,  // Lineup confirmation windows are tight
    marketImpactWeight:  1.20,  // Spread moves after pitcher scratch are reliable signals
    sourceQualityWeight: 1.10,
    contextWeight:       0.95,  // Scheme less relevant; matchup stats matter
  },
  urgencyBoost: 7,
};

const NFL_MODIFIERS: LeagueModifierSet = {
  signalType: {
    injury:       1.40,  // DNP/LP designations drive huge market moves
    sharp_money:  1.15,
    line_move:    1.10,
    scheme:       1.30,  // Scheme mismatches are high-value for informed bettors
    matchup:      1.30,
    matchup_edge: 1.30,
    depth:        1.20,
    role_change:  1.20,
    prop:         1.10,
    weather:      1.20,
    camp:         0.85,
    trend:        0.80,
    news:         0.75,
  },
  components: {
    recencyWeight:       1.10,
    marketImpactWeight:  1.10,
    sourceQualityWeight: 1.15,
    contextWeight:       1.25,  // NFL scheme intelligence is highly differentiated
  },
  urgencyBoost: 6,
};

const CFB_MODIFIERS: LeagueModifierSet = {
  signalType: {
    transfer:     1.20,  // Starting QB uncertainty = massive market impact
    injury:       1.10,
    sharp_money:  1.25,  // CFB sharp moves are rarer → more signal value
    line_move:    1.30,
    scheme:       1.40,  // Scheme mismatch in CFB = biggest differentiated edge
    coaching:     1.40,
    matchup:      1.35,
    matchup_edge: 1.35,
    portal:       1.10,
    depth:        1.05,
    weather:      1.00,
    trend:        0.90,
    prop:         1.05,
    news:         0.75,
  },
  components: {
    recencyWeight:       1.00,
    marketImpactWeight:  1.30,  // CFB spreads move significantly on insider info
    sourceQualityWeight: 1.00,
    contextWeight:       1.35,  // Scheme + matchup intel is the #1 differentiator
  },
  urgencyBoost: 5,
};

export const LEAGUE_MODIFIERS: Record<Sport, LeagueModifierSet> = {
  NBA: NBA_MODIFIERS,
  MLB: MLB_MODIFIERS,
  NFL: NFL_MODIFIERS,
  CFB: CFB_MODIFIERS,
};

export function getLeagueModifiers(sport: Sport): LeagueModifierSet {
  return LEAGUE_MODIFIERS[sport];
}

/* ── Signal type normalizer ───────────────────────────────── */
// Normalizes signal type strings to the canonical keys used above
export function normalizeSignalType(type: string): string {
  const map: Record<string, string> = {
    "injury":       "injury",
    "line_move":    "line_move",
    "matchup_edge": "matchup_edge",
    "matchup":      "matchup_edge",
    "rotation":     "rotation",
    "lineup":       "lineup",
    "trend":        "trend",
    "prop":         "prop",
    "news":         "news",
    "sharp_money":  "sharp_money",
    "sharp":        "sharp_money",
    "coaching":     "coaching",
    "scheme":       "scheme",
    "weather":      "weather",
    "depth":        "depth",
    "portal":       "portal",
    "transfer":     "transfer",
    "transaction":  "transaction",
    "camp":         "camp",
    "role_change":  "role_change",
    "rookie":       "camp",
  };
  return map[type] ?? type;
}
