/**
 * Team Story trigger classifier — NFL only, MEASUREMENT ONLY.
 *
 * Tags an existing raw event with the Team Story triggers it looks like:
 * coach hire, coach fire, front-office change, trade, season-ending injury,
 * suspension, retirement. Each tag says what evidence produced it: a
 * structured field from an official feed, or a text pattern in the headline or
 * notes, and which pattern matched.
 *
 * NOTHING IN THE LIVE PATH CALLS THIS. It exists so a read-only census
 * (server/scripts/team-story-trigger-census.ts) can count, per trigger, how
 * many events we already ingest, what situation type they became, and how
 * many reached situation_public_confirmations — before anything is built on
 * top of it. A test asserts no non-test, non-script module imports it.
 *
 * SCOPE. NFL only. NBA (ESPN injuries) and MLB (StatsAPI IL moves) have no
 * text sourcing, so there is nothing to classify there; CFB is out of scope.
 * Any other league returns [].
 *
 * PATTERNS. Every pattern is word-bounded. Each trigger also has rejections
 * for its known false positives ("fired up", "retires the side", "sits out",
 * "out for the season opener", "trade deadline", ...). A rejection only
 * blocks the field it matched in, and only for that trigger. Text matching
 * misfires; the census measures that rather than hiding it.
 *
 * KNOWN LIMITS (read before trusting a number):
 *   - ESPN NFL IR is at least four games, not necessarily the season. A
 *     structured IR tag is an UPPER BOUND on season-ending injuries.
 *   - espn-nfl-transactions writes transaction_type "Trade" both from ESPN's
 *     own type field and, when that is absent, from a /traded?/ test on the
 *     description. The payload does not say which, so a structured "Trade"
 *     tag may itself rest on text.
 *   - One event can carry several triggers ("fires head coach and GM").
 */

export type TeamStoryTrigger =
  | "coach_hire"
  | "coach_fire"
  | "front_office"
  | "trade"
  | "season_ending_injury"
  | "suspension"
  | "retirement";

export const TEAM_STORY_TRIGGERS: readonly TeamStoryTrigger[] = [
  "coach_hire", "coach_fire", "front_office", "trade", "season_ending_injury", "suspension", "retirement",
];

export interface TeamStoryTriggerMatch {
  trigger: TeamStoryTrigger;
  evidence: "structured_field" | "text_pattern";
  /** Payload field the evidence came from, e.g. "payload.designation", "payload.headline". */
  field: string;
  /** Stable pattern id, so the census can report which pattern fired. */
  pattern: string;
  /** The matched text (or field value), trimmed to 80 chars. */
  matched: string;
}

export interface TeamStoryTriggerInput {
  league: string;
  source_id: string;
  source_type: string;
  event_type: string;
  payload: unknown;
}

interface TextRule {
  id: string;
  re: RegExp;
}

interface TriggerRules {
  trigger: TeamStoryTrigger;
  patterns: TextRule[];
  /** If any of these matches the same field, that field does not count for this trigger. */
  rejections: RegExp[];
}

const COACH = String.raw`(?:(?:head|interim|assistant)\s+coach|(?:offensive|defensive|special\s+teams)\s+coordinator|coach(?:ing\s+staff)?)`;
const FRONT_OFFICE = String.raw`(?:general\s+manager|team\s+president|president\s+of\s+football\s+operations|executive\s+vice\s+president|director\s+of\s+player\s+personnel)`;

const RULES: TriggerRules[] = [
  {
    trigger: "coach_fire",
    patterns: [
      { id: "fire_coach", re: new RegExp(String.raw`\bfire[sd]?\s+(?:\w+\s+){0,3}?${COACH}\b`, "i") },
      { id: "coach_fired", re: new RegExp(String.raw`\b${COACH}\b[^.!?]{0,60}?\b(?:fired|dismissed|relieved\s+of\s+(?:his|her)\s+duties)\b`, "i") },
      { id: "parts_ways_coach", re: new RegExp(String.raw`\bpart(?:s|ed)?\s+ways\s+with\s+(?:\w+\s+){0,3}?${COACH}\b`, "i") },
    ],
    rejections: [
      /\bfire[sd]?\s+(?:up|back|off)\b/i,
    ],
  },
  {
    trigger: "coach_hire",
    patterns: [
      { id: "hire_coach", re: new RegExp(String.raw`\bhire[sd]?\s+(?:\w+\s+){0,3}?(?:as\s+)?(?:(?:its|their|the)\s+)?(?:new\s+)?${COACH}\b`, "i") },
      { id: "named_coach", re: new RegExp(String.raw`\bnamed\s+(?:the\s+)?(?:new\s+)?(?:\w+\s+)?${COACH}\b`, "i") },
      { id: "coach_hired", re: new RegExp(String.raw`\b${COACH}\b[^.!?]{0,40}?\bhired\b`, "i") },
    ],
    rejections: [
      /\bcoach\s+of\s+the\s+(?:week|month|year)\b/i,
    ],
  },
  {
    trigger: "front_office",
    patterns: [
      { id: "fo_title_change", re: new RegExp(String.raw`\b${FRONT_OFFICE}\b[^.!?]{0,60}?\b(?:fired|hired|named|dismissed|resign(?:s|ed)?|steps?\s+down|stepped\s+down|part(?:s|ed)?\s+ways)\b`, "i") },
      { id: "fo_change_title", re: new RegExp(String.raw`\b(?:fire[sd]?|hire[sd]?|names?|named|dismiss(?:es|ed)?|part(?:s|ed)?\s+ways\s+with)\s+(?:\w+\s+){0,3}?${FRONT_OFFICE}\b`, "i") },
      // "GM" is case-sensitive so "gm" in a URL or "GMT" never counts.
      { id: "gm_change", re: /\bGM\b[^.!?]{0,60}?\b(?:fired|hired|named|dismissed|resigns?|resigned|steps?\s+down|stepped\s+down)\b|\b(?:[Ff]ire[sd]?|[Hh]ire[sd]?|[Nn]ames?|[Nn]amed)\s+(?:\w+\s+){0,3}?GM\b/ },
    ],
    rejections: [],
  },
  {
    trigger: "trade",
    patterns: [
      { id: "traded", re: /\btraded\b/i },
      { id: "in_a_trade", re: /\bin\s+(?:a|the)\s+trade\b/i },
      { id: "trade_for_away", re: /\btrades?\s+(?:for|away)\b/i },
      { id: "trade_sends", re: /\btrade\s+(?:sends|lands|brings)\b/i },
    ],
    rejections: [
      /\btraded?\s+(?:deadline|rumou?rs?|talks?|speculation|request|market|candidates?|targets?|interest|partners?|block)\b/i,
    ],
  },
  {
    trigger: "season_ending_injury",
    patterns: [
      // "season" not followed by opener/finale/debut/high/low: "out for the season opener" is one game.
      { id: "out_for_season", re: /\b(?:out|done|lost|sidelined|miss(?:es)?|ruled\s+out)\s+for\s+(?:the\s+)?(?:rest\s+of\s+the\s+|remainder\s+of\s+the\s+)?season\b(?!\s*[-']?\s*(?:opener|finale|debut|high|low|ticket))/i },
      { id: "season_ending", re: /\bseason[-\s]ending\s+(?:\w+\s+){0,2}?(?:injury|surgery|tear)\b/i },
      { id: "torn_acl_achilles", re: /\btorn\s+(?:his\s+)?(?:acl|achilles)\b|\b(?:acl|achilles)\s+tear\b/i },
    ],
    rejections: [],
  },
  {
    trigger: "suspension",
    patterns: [
      { id: "suspended", re: /\bsuspend(?:ed|s)?\b/i },
      { id: "suspension", re: /\bsuspension\b/i },
    ],
    // "sits out" is never evidence of a suspension, and no pattern reads it.
    // A suspended game or practice (weather) is not a player suspension.
    rejections: [
      /\b(?:game|play|practice|match)\s+(?:was\s+|is\s+|has\s+been\s+)?suspended\b/i,
    ],
  },
  {
    trigger: "retirement",
    patterns: [
      { id: "retires", re: /\bretire[sd]?\b/i },
      { id: "retirement", re: /\bretirement\b/i },
      { id: "retiring", re: /\bretiring\b/i },
    ],
    rejections: [
      /\bretire[sd]?\s+(?:the\s+side|(?:\d+|the\s+next\s+\d+)\s+(?:straight|consecutive|batters?|hitters?))\b/i,
      // "to retire Tom Brady's No. 12": up to three words (names, possessives) before the number.
      /\bretire[sd]?\s+(?:[\w'’.]+\s+){0,3}?(?:jersey|number|no\.)/i,
      /\bretired\s+(?:jersey|number|no\.)/i,
    ],
  },
];

const TEXT_FIELDS = ["headline", "notes"] as const;

function trimMatch(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 80 ? `${t.slice(0, 77)}...` : t;
}

function structuredMatches(raw: TeamStoryTriggerInput, payload: Record<string, unknown>): TeamStoryTriggerMatch[] {
  const out: TeamStoryTriggerMatch[] = [];
  // Only ESPN's NFL api feed is a structured source here (espn-nfl.ts injuries,
  // espn-nfl-transactions.ts). RSS/X put free text in the same keys.
  if (raw.source_id !== "espn" || raw.source_type !== "api") return out;

  if (raw.event_type === "injury_update" && payload.designation === "IR") {
    out.push({ trigger: "season_ending_injury", evidence: "structured_field", field: "payload.designation", pattern: "espn_nfl_ir", matched: "IR" });
  }
  if (raw.event_type === "transaction" && payload.transaction_type === "Trade") {
    out.push({ trigger: "trade", evidence: "structured_field", field: "payload.transaction_type", pattern: "espn_nfl_trade", matched: "Trade" });
  }
  return out;
}

/**
 * Every Team Story trigger the event looks like, at most one match per
 * trigger. A structured match wins over a text match for the same trigger.
 * Non-NFL events return [].
 */
export function classifyTeamStoryTrigger(raw: TeamStoryTriggerInput): TeamStoryTriggerMatch[] {
  if (raw.league !== "NFL") return [];
  const payload = (raw.payload && typeof raw.payload === "object" ? raw.payload : {}) as Record<string, unknown>;

  const byTrigger = new Map<TeamStoryTrigger, TeamStoryTriggerMatch>();
  for (const m of structuredMatches(raw, payload)) byTrigger.set(m.trigger, m);

  for (const rules of RULES) {
    if (byTrigger.has(rules.trigger)) continue;
    fields: for (const field of TEXT_FIELDS) {
      const text = payload[field];
      if (typeof text !== "string" || !text.trim()) continue;
      if (rules.rejections.some(r => r.test(text))) continue;
      for (const rule of rules.patterns) {
        const m = rule.re.exec(text);
        if (m) {
          byTrigger.set(rules.trigger, {
            trigger: rules.trigger,
            evidence: "text_pattern",
            field: `payload.${field}`,
            pattern: rule.id,
            matched: trimMatch(m[0]),
          });
          break fields;
        }
      }
    }
  }

  return TEAM_STORY_TRIGGERS.flatMap(t => byTrigger.get(t) ?? []);
}
