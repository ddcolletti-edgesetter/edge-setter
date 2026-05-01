/* Edge Setter — Signal Impact Compute Layer (Session 9)
 *
 * Derives structured DFS and Betting impact data from existing signal fields.
 * Works for all signal variants (V2Signal, NFLSignal, CFBSignal, LiveSignal).
 * No new API fields required — everything computed from fields already present.
 */

export interface ImpactMetric {
  label: string;
  value: string;
  alert?: boolean;
}

export interface DFSImpact {
  relevant: boolean;
  affectedPositions: string[];
  ownershipDirection?: "spike" | "drop" | "neutral";
  metrics: ImpactMetric[];
}

export interface BettingImpact {
  relevant: boolean;
  affectedMarkets: string[];
  metrics: ImpactMetric[];
}

export interface ComputedImpact {
  dfs: DFSImpact | null;
  betting: BettingImpact | null;
}

/* Minimal shape accepted by computeImpact — satisfied by all signal variants */
export interface SignalForImpact {
  type: string;
  player?: string;
  team?: string;
  opponent?: string;
  confidence?: number;
  detail?: string;
  lineMovement?: {
    open: string | number;
    current: string | number;
    direction: string;
    note?: string;
  };
  injuryDesignation?: string;
  bettingRelevance?: boolean;
  fantasyRelevance?: boolean;
  schemeNote?: string;
  matchupEdge?: string;
  lineupStatus?: string;
  confirmationStrength?: string;
  /* live-signal fields passed through adapters */
  weather_note?: string;
}

/* ─── Per-type handlers ─────────────────────────────────── */

function injuryImpact(s: SignalForImpact): ComputedImpact {
  const d      = s.injuryDesignation ?? "Q";
  const isOut  = ["OUT", "DNP", "IL-60", "IL-15", "IL-10"].includes(d);
  const isDoubt = d === "D" || d === "Doubtful";

  const dfs: DFSImpact = {
    relevant: true,
    affectedPositions: [],
    ownershipDirection: isOut || isDoubt ? "drop" : "neutral",
    metrics: [
      { label: "Designation",   value: d,                                                         alert: isOut || isDoubt },
      { label: "Ownership",     value: isOut ? "Likely drop" : isDoubt ? "Monitor / drop" : "Monitor" },
      { label: "Backup Value",  value: isOut || isDoubt ? "Elevated" : "Neutral" },
      ...(s.matchupEdge ? [{ label: "Context", value: s.matchupEdge.slice(0, 52) + (s.matchupEdge.length > 52 ? "…" : "") }] : []),
    ],
  };

  const betting: BettingImpact = {
    relevant: true,
    affectedMarkets: isOut ? ["spread", "total", "player props"] : ["player props"],
    metrics: [
      { label: "Market Impact", value: isOut ? "High — line likely moves" : isDoubt ? "Moderate" : "Low", alert: isOut },
      { label: "Spread",        value: isOut ? "1.5–2+ pt shift possible" : isDoubt ? "0.5–1 pt possible" : "Minimal" },
      { label: "Total",         value: isOut ? "Under pressure" : "Monitor" },
      { label: "Markets",       value: isOut ? "Spread, total, props" : "Player props" },
    ],
  };

  return { dfs, betting };
}

function lineMoveImpact(s: SignalForImpact): ComputedImpact {
  const lm      = s.lineMovement;
  const open    = lm ? String(lm.open) : "—";
  const current = lm ? String(lm.current) : "—";
  const note    = lm?.note ?? "—";
  const dir     = lm?.direction ?? "flat";
  const dirLabel = dir === "up"   ? "▲ Favorite pricing higher" :
                   dir === "down" ? "▼ Line trending opposite" : "Flat";
  const isSharp  = s.confirmationStrength === "consensus" || s.confirmationStrength === "corroborated";

  const betting: BettingImpact = {
    relevant: true,
    affectedMarkets: ["spread"],
    metrics: [
      { label: "Open Line",     value: open },
      { label: "Current",       value: current, alert: true },
      { label: "Movement",      value: note },
      { label: "Direction",     value: dirLabel },
      { label: "Sharp Signal",  value: isSharp ? "Yes — professional action" : "Market movement" },
    ],
  };

  return { dfs: null, betting };
}

function lineupImpact(s: SignalForImpact): ComputedImpact {
  const status  = s.lineupStatus ?? "";
  const isOut   = status.toLowerCase().includes("scratch") || s.type === "role_change";

  const dfs: DFSImpact = {
    relevant: true,
    affectedPositions: [],
    ownershipDirection: isOut ? "drop" : "neutral",
    metrics: [
      { label: "Status",     value: status || (isOut ? "Scratched" : "Confirmed"), alert: isOut },
      { label: "Usage",      value: isOut ? "Role opens — reassign" : "Confirmed starter" },
      { label: "Ownership",  value: isOut ? "Drop" : "Hold" },
    ],
  };

  const betting: BettingImpact = {
    relevant: isOut,
    affectedMarkets: isOut ? ["spread", "total"] : [],
    metrics: [
      { label: "Market Effect", value: isOut ? "Moderate — check spread" : "Minimal" },
      { label: "Game Total",    value: isOut ? "Possible adjustment" : "Stable" },
    ],
  };

  return { dfs, betting: isOut ? betting : null };
}

function weatherImpact(s: SignalForImpact): ComputedImpact {
  const raw       = s.weather_note ?? s.detail ?? s.lineMovement?.note ?? "";
  const windMatch = String(raw).match(/(\d+)\s*MPH/i);
  const tempMatch = String(raw).match(/(\d+)°F/);
  const windMph   = windMatch ? parseInt(windMatch[1]) : null;
  const tempF     = tempMatch ? parseInt(tempMatch[1]) : null;

  const isHigh  = windMph !== null && windMph >= 15;
  const isMajor = windMph !== null && windMph >= 25;
  const tier    = isMajor ? "Major" : isHigh ? "Moderate" : "Minor";

  if (!isHigh) return { dfs: null, betting: null };

  const dfs: DFSImpact = {
    relevant: true,
    affectedPositions: ["QB", "WR", "TE", "K"],
    metrics: [
      { label: "Wind Speed",   value: windMph !== null ? `${windMph} MPH` : "Elevated", alert: isMajor },
      ...(tempF !== null ? [{ label: "Temp", value: `${tempF}°F` }] : []),
      { label: "Passing Game", value: isMajor ? "Significantly suppressed" : "Reduced volume expected" },
      { label: "Run Game",     value: "Teams likely to lean run-heavy" },
      { label: "Kicker",       value: "Fade in DFS" },
    ],
  };

  const betting: BettingImpact = {
    relevant: true,
    affectedMarkets: ["total", "team totals", "passing props"],
    metrics: [
      { label: "O/U Impact",   value: isMajor ? "Major — under pressure" : "Moderate under lean", alert: isMajor },
      { label: "Impact Tier",  value: tier },
      { label: "Markets",      value: "Total, team totals, passing props" },
      { label: "Historical",   value: ">15 MPH: avg 4–6 fewer pts scored" },
    ],
  };

  return { dfs, betting };
}

function matchupImpact(s: SignalForImpact): ComputedImpact {
  const edge = s.matchupEdge ?? "";

  const dfs: DFSImpact = {
    relevant: true,
    affectedPositions: [],
    metrics: [
      { label: "Matchup Grade",     value: "Favorable",                                             alert: true },
      { label: "Target",            value: s.player ?? s.team ?? "—" },
      ...(s.opponent ? [{ label: "Opponent", value: s.opponent }] : []),
      ...(edge ? [{ label: "Edge Context", value: edge.slice(0, 55) + (edge.length > 55 ? "…" : "") }] : []),
      { label: "Usage Implication", value: "Increased volume expected" },
    ],
  };

  const betting: BettingImpact = {
    relevant: !!s.bettingRelevance,
    affectedMarkets: ["player props", "team totals"],
    metrics: [
      { label: "Spread",        value: "Check current line" },
      { label: "Implied Total", value: "Elevated for favored side" },
      { label: "Key Props",     value: s.player ? `${s.player} stats` : "Team totals" },
    ],
  };

  return { dfs, betting: s.bettingRelevance ? betting : null };
}

function propImpact(s: SignalForImpact): ComputedImpact {
  const dfs: DFSImpact = {
    relevant: !!s.fantasyRelevance,
    affectedPositions: [],
    metrics: [
      { label: "Player",      value: s.player ?? "—" },
      { label: "Correlated",  value: "Check salary vs implied production" },
      { label: "DFS Angle",   value: "Prop line movement = DFS signal" },
    ],
  };

  const betting: BettingImpact = {
    relevant: true,
    affectedMarkets: ["player props"],
    metrics: [
      { label: "Market",       value: "Player props" },
      { label: "Direction",    value: "Evaluate vs implied projection" },
      { label: "Correlation",  value: "Monitor for line adjustment" },
    ],
  };

  return { dfs: s.fantasyRelevance ? dfs : null, betting };
}

function schemeImpact(s: SignalForImpact): ComputedImpact {
  const note = s.schemeNote ?? "";

  const dfs: DFSImpact = {
    relevant: true,
    affectedPositions: [],
    metrics: [
      { label: "Scheme Edge",  value: note ? note.slice(0, 55) + (note.length > 55 ? "…" : "") : "Mismatch identified", alert: true },
      { label: "Snap Count",   value: "Elevated in favorable scheme" },
      { label: "Target Share", value: "Favorable projection" },
    ],
  };

  const betting: BettingImpact = {
    relevant: true,
    affectedMarkets: ["team totals", "player props"],
    metrics: [
      { label: "Team Total",  value: "Possible elevation" },
      { label: "Key Props",   value: "Target share, yards" },
      { label: "Spread",      value: "Marginal" },
    ],
  };

  return { dfs, betting };
}

function transactionImpact(s: SignalForImpact): ComputedImpact {
  const d    = s.injuryDesignation;
  const isIL = d?.includes("IL") ?? false;

  const dfs: DFSImpact = {
    relevant: true,
    affectedPositions: [],
    ownershipDirection: "drop",
    metrics: [
      { label: "Transaction",  value: isIL ? d! : "Roster move",           alert: true },
      { label: "Roster Spot",  value: "Opens for pickup" },
      { label: "Pickup Tier",  value: "Evaluate depth chart" },
      { label: "Budget",       value: "Reallocate salary" },
    ],
  };

  const betting: BettingImpact = {
    relevant: true,
    affectedMarkets: ["spread", "team totals"],
    metrics: [
      { label: "Line Impact",  value: "Direct — check current spread", alert: true },
      { label: "Market Move",  value: "Expected on confirmation" },
      { label: "Team Total",   value: "Likely adjustment" },
    ],
  };

  return { dfs, betting };
}

function depthImpact(s: SignalForImpact): ComputedImpact {
  const dfs: DFSImpact = {
    relevant: true,
    affectedPositions: [],
    ownershipDirection: "drop",
    metrics: [
      { label: "Role Change",     value: "Depth chart shift confirmed", alert: true },
      { label: "Usage",           value: "Redistribution expected" },
      { label: "Salary vs Role",  value: "Reassess vs opportunity" },
    ],
  };

  return {
    dfs,
    betting: s.bettingRelevance ? {
      relevant: true,
      affectedMarkets: ["player props"],
      metrics: [
        { label: "Prop Impact", value: "Stats props affected by role shift" },
      ],
    } : null,
  };
}

function trendImpact(s: SignalForImpact): ComputedImpact {
  return {
    dfs: s.fantasyRelevance ? {
      relevant: true,
      affectedPositions: [],
      metrics: [
        { label: "Trajectory",    value: "Monitor trend direction" },
        { label: "Usage Context", value: "Check recent snap/target data" },
      ],
    } : null,
    betting: s.bettingRelevance ? {
      relevant: true,
      affectedMarkets: ["player props"],
      metrics: [
        { label: "Trend Context", value: "Review recent performance" },
        { label: "Market",        value: "Player props / game props" },
      ],
    } : null,
  };
}

/* ─── Main export ───────────────────────────────────────────── */

export function computeImpact(signal: SignalForImpact): ComputedImpact {
  const t = signal.type;

  if (t === "injury" || t === "injury_update")                                         return injuryImpact(signal);
  if (t === "line_move" || t === "sharp" || t === "sharp_money")                       return lineMoveImpact(signal);
  if (["lineup", "lineup_confirm", "lineup_change", "rotation"].includes(t))           return lineupImpact(signal);
  if (t === "depth")                                                                    return depthImpact(signal);
  if (t === "role_change")                                                              return lineupImpact({ ...signal, lineupStatus: "Role change" });
  if (t === "weather" || t === "weather_update")                                        return weatherImpact(signal);
  if (t === "matchup" || t === "matchup_edge")                                          return matchupImpact(signal);
  if (t === "prop")                                                                     return propImpact(signal);
  if (t === "scheme" || t === "scheme_note")                                            return schemeImpact(signal);
  if (t === "transaction")                                                              return transactionImpact(signal);
  if (t === "trend" || t === "camp" || t === "rookie" || t === "portal" || t === "transfer" || t === "coaching" || t === "news") {
    return trendImpact(signal);
  }

  return { dfs: null, betting: null };
}
