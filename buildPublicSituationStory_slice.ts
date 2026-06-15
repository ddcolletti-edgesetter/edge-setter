// ─────────────────────────────────────────────────────────────────────────────
// PASTE THIS INTO CLAUDE CODE (after the North Star doc)
// This is the self-contained slice of LiveIntelligenceHome.tsx
// needed to rewrite copy variation in buildPublicSituationStory.
// ─────────────────────────────────────────────────────────────────────────────

// ── TYPE SHAPE (abbreviated — full type lives in intelligenceSituationsApi.ts) ──

type IntelligenceSituation = {
  id: string;
  league: string; // "NBA" | "MLB" | "NFL" | "CFB"
  headline: string;
  currentRead: string;
  whyItMatters: string;
  actionWindow: string | null;
  priority: number;
  escalationState: string;
  signalType: string;
  confidence: { current: number; delta: number | null; explanation: string };
  sourceSummary: { count: number; convergence: string | null };
  timing: { window: string; firstSeen: string; freshnessLabel: string };
  subject: {
    player: string | null;
    team: string | null;
    matchup: string | null;
  };
  raw: {
    signal_type: string;
    injury_designation: string | null; // "OUT" | "QUESTIONABLE" | "DOUBTFUL" | null
    lineup_status: string | null;
    weather_note: string | null;
    betting_relevance: boolean;
    fantasy_relevance: boolean;
    body: string | null;
    action_note: string | null;
    headline: string;
    why_it_matters: string | null;
    urgency_reason: string | null;
    score_explanation: string | null;
  };
  marketReaction: {
    open: string | null;
    current: string | null;
    delta: string | null;
    note: string | null;
  } | null;
  implications: string[];
  timeline: Array<{ at: string; label: string; detail: string; state: string }>;
  validators: { agreement: string };
};

// ── PATTERN ──────────────────────────────────────────────────────────────────

const INJURY_TYPE_PATTERN =
  /(hamstring|ankle|knee|quad(?:ricep)?|calf|groin|shoulder|lower back|back|hip|foot|wrist|hand|elbow|concussion|achilles|oblique|illness|toe|rib|neck|forearm|finger|thumb|acl|mcl|ucl|pectoral|lat|hernia|abdominal)/i;

// ── CLASSIFICATION HELPERS ────────────────────────────────────────────────────

function isAvailabilitySituation(situation: IntelligenceSituation) {
  const text = `${situation.raw.signal_type} ${situation.raw.injury_designation ?? ""} ${situation.headline} ${situation.currentRead}`.toLowerCase();
  return (
    Boolean(situation.raw.injury_designation) ||
    /(injury|availability|questionable|doubtful|out|practice|limited|dnp|status)/i.test(text)
  );
}

function isRosterMoveSituation(situation: IntelligenceSituation) {
  const text = `${situation.raw.signal_type} ${situation.headline} ${situation.currentRead}`.toLowerCase();
  return /(roster|waived|claimed|optioned|recalled|assigned|activated|injured list|practice squad)/i.test(text);
}

function isLineupSituation(situation: IntelligenceSituation) {
  const text = `${situation.raw.signal_type} ${situation.raw.lineup_status ?? ""} ${situation.headline} ${situation.currentRead}`.toLowerCase();
  return (
    Boolean(situation.raw.lineup_status) ||
    /(lineup|starter|starting|pitcher|bullpen|scratch|rotation)/i.test(text)
  );
}

function isDepthChartSituation(situation: IntelligenceSituation) {
  const text = `${situation.raw.signal_type} ${situation.headline} ${situation.currentRead}`.toLowerCase();
  return /(depth|qb1|role|snap|practice rep|rotation)/i.test(text);
}

// ── STATUS / SUMMARY HELPERS ──────────────────────────────────────────────────

function publicAvailabilityStatus(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "OUT") return "OUT";
  if (normalized === "QUESTIONABLE") return "QUESTIONABLE";
  if (normalized === "DOUBTFUL") return "DOUBTFUL";
  return value.trim();
}

function publicSituationType(situation: IntelligenceSituation) {
  const type = situation.raw.signal_type.toLowerCase();
  if (isAvailabilitySituation(situation)) return "Availability watch";
  if (isRosterMoveSituation(situation)) return "Roster move";
  if (isLineupSituation(situation))
    return situation.league === "MLB" ? "Lineup/pitcher watch" : "Lineup watch";
  if (isDepthChartSituation(situation)) return "Depth chart watch";
  if (situation.marketReaction || type.includes("line") || type.includes("odds"))
    return "Market movement";
  if (situation.raw.weather_note || type.includes("weather"))
    return "Weather/game environment";
  if (type.includes("transaction")) return "Transaction watch";
  return "Team news";
}

function publicWatchNext(situation: IntelligenceSituation) {
  if (isAvailabilitySituation(situation))
    return "Watch for confirmed reports, practice participation, roster adjustments, and market or fantasy movement.";
  if (isLineupSituation(situation))
    return "Watch for official lineup cards, late scratches, pitcher confirmation, and market movement.";
  if (isRosterMoveSituation(situation))
    return "Watch for official transactions, depth-chart changes, practice roles, and follow-on reports.";
  if (situation.marketReaction)
    return "Watch whether the move is confirmed by trusted reports and whether prices or projections keep adjusting.";
  return situation.actionWindow || "Watch for confirmation, source support, and downstream impact.";
}

function publicSourceSummary(value?: string | null) {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("official")) return "Official trail checked";
  if (
    normalized.includes("corroborated") ||
    normalized.includes("confirmed") ||
    normalized.includes("consensus")
  )
    return "Multiple sources tracking";
  if (normalized.includes("single")) return "One source flagged so far";
  if (normalized.includes("awaiting")) return "Source trail still developing";
  return "Source trail checked";
}

// ── TEAM NAME HELPERS (abbreviated) ──────────────────────────────────────────

function displayTeamName(value?: string | null, league?: string) {
  // Full LEAGUE_TEAM_NAMES map lives in the file; abbreviated here for context.
  // Returns resolved nickname ("Lakers") or raw value if unresolved.
  return String(value ?? "").trim();
}

function splitMatchup(matchup?: string | null): string[] {
  if (!matchup) return [];
  return matchup
    .split(/\s+(?:@|vs\.?|at)\s+/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function teamPossessive(team: string) {
  return /s$/i.test(team) ? `${team}'` : `${team}'s`;
}

function teamContextNoun(situation: IntelligenceSituation) {
  if (situation.league === "NFL" || situation.league === "CFB") return "passing-game plan";
  if (situation.league === "NBA") return "rotation plan";
  if (situation.league === "MLB") return "lineup plan";
  return "team plan";
}

function compactIntelPhrase(value?: string) {
  if (!value) return undefined;
  const firstSentence = value.split(/[.!?]/)[0]?.trim();
  const phrase = (firstSentence || value.trim())
    .replace(/\((\d+(\.\d+)?)\/100\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (phrase.length <= 72) return phrase;
  return `${phrase.slice(0, 69).trim()}...`;
}

// ── generateHeadline (unchanged — rewrite target is buildPublicSituationStory only) ──

function headlineSourceTier(situation: IntelligenceSituation) {
  const convergence = (situation.sourceSummary.convergence ?? "").toLowerCase();
  if (convergence.includes("official")) return "official sources";
  if (situation.sourceSummary.count >= 2) return "multiple reports";
  return "source reports";
}

function generateHeadline(situation: IntelligenceSituation): string | null {
  const player = situation.subject.player?.trim() || null;
  const matchupTeams = splitMatchup(situation.subject.matchup);
  const rawTeam = situation.subject.team ?? matchupTeams[0] ?? null;
  const team = rawTeam ? displayTeamName(rawTeam, situation.league) : null;
  if (!player && !team) return null;

  const type = situation.raw.signal_type.toLowerCase();
  const text =
    `${situation.raw.signal_type} ${situation.headline} ${situation.currentRead}`.toLowerCase();
  const opponent =
    rawTeam && team
      ? matchupTeams
          .map((side) => displayTeamName(side, situation.league))
          .find((side) => side.toLowerCase() !== team.toLowerCase()) ?? null
      : null;

  if (
    type.includes("eligibility") ||
    /\b(eligibility|eligible|waiver|reinstate|cleared to play)\b/.test(text)
  ) {
    if (player && team) return `${player} cleared — ${team} confirms eligibility`;
    if (player) return `${player} cleared — eligibility confirmed`;
    return `${team} eligibility ruling confirmed`;
  }

  if (type.includes("coaching") || /\bcoach(?:ing|es)?\b/.test(text)) {
    const action = /\b(hired|named|joins)\b/.test(text)
      ? "hired"
      : /\b(fired|dismissed|parts ways|resigns?|resigned)\b/.test(text)
      ? "fired"
      : null;
    if (action && player && team) return `${player} ${action} at ${team}`;
    if (action && (player || team))
      return `${player ?? team} — coaching ${action === "hired" ? "hire" : "change"} confirmed`;
  }

  if (/\btraded?\b/.test(text) && player && team) {
    return `${player} traded to ${team}, per ${headlineSourceTier(situation)}`;
  }

  const status = publicAvailabilityStatus(situation.raw.injury_designation);
  if (status) {
    const injury = text.match(INJURY_TYPE_PATTERN)?.[1] ?? null;
    const subject = player ?? `${team}`;
    return injury ? `${subject} (${injury}) — ${status}` : `${subject} — ${status}`;
  }

  if (situation.raw.lineup_status && player && team) {
    const lineupStatus = situation.raw.lineup_status.toLowerCase();
    const role =
      text.match(/\b(starter|starting pitcher|qb1|leadoff|cleanup|closer)\b/)?.[1] ?? "starter";
    const action = /scratch/.test(lineupStatus) ? "scratched" : `confirmed ${role}`;
    return opponent
      ? `${player} ${action} for ${team} vs ${opponent}`
      : `${player} ${action} for ${team}`;
  }

  const reaction = situation.marketReaction;
  if (
    reaction?.open &&
    reaction?.current &&
    reaction.open !== reaction.current &&
    (team || situation.subject.matchup)
  ) {
    return `${team ?? situation.subject.matchup} line moves ${reaction.open} → ${reaction.current}`;
  }

  return null;
}

// ── THE REWRITE TARGET ────────────────────────────────────────────────────────
// buildPublicSituationStory — CURRENT IMPLEMENTATION (replace availability branch only)
//
// PROBLEM:
// The availability branch (isAvailabilitySituation) produces the same
// sentence skeleton for every story — only the player/team name changes.
// Examples of what currently comes out:
//   "Ja Morant (hamstring) is out. Grizzlies will need to adjust rotation
//    and minutes distribution. Monitor practice reports for timeline."
//   "Kyrie Irving (ankle) is out. Mavericks will need to adjust rotation
//    and minutes distribution. Monitor practice reports for timeline."
// These are identical structures. The North Star explicitly prohibits
// template copy that reads as AI-generated.
//
// GOAL:
// Rewrite the availability branch so deck, shortDeck, whatHappened, and
// whyItMatters vary meaningfully across ALL of these axes independently:
//
//   1. DESIGNATION: OUT vs DOUBTFUL vs QUESTIONABLE vs unlabeled
//
//   2. INJURY TYPE — each type implies different things:
//      - hamstring / achilles / knee / ACL/MCL/UCL: load-bearing,
//        often multi-game, return timeline murky
//      - concussion: protocol-driven, unpredictable timeline, safety angle
//      - illness: day-to-day, can clear quickly, different urgency
//      - shoulder / elbow / wrist / forearm: affects throwing/shooting —
//        relevant to position (QB, pitcher, PG) more than others
//      - back / lower back: chronic risk, minutes limits, rest days
//      - ankle / foot / toe / calf: affects mobility, playing through it common
//      - oblique / rib / abdominal: MLB-specific concern, affects swing/throw
//
//   3. LEAGUE context:
//      - NBA: rotation minutes, usage rate, next-man-up in the lineup,
//        back-to-back scheduling
//      - MLB: lineup spot, batting order, pitcher replacement, bullpen depth
//      - NFL: depth chart, snap share, role in scheme, target share
//      - CFB: QB room depth, scholarship implications, position scarcity
//
//   4. PLAYER ROLE — infer from available signals:
//      Star signals: marketReaction exists, betting_relevance=true,
//        fantasy_relevance=true, "MVP"/"All-Star"/"ace"/"franchise" in text
//      Role player signals: no market reaction, single source, no fantasy flag
//
//   5. TIMING WINDOW:
//      - "Early": uncertainty copy, situational watch tone
//      - "Developing": momentum building, coming into focus
//      - "Widely Known": confirmation frame, what happens next
//
// RULES:
// — No two injury types should produce identical deck sentences.
// — No two designations should produce identical deck sentences.
// — The sentence structure itself must vary, not just the noun slot.
// — Do not change the return shape:
//   { headline, shortHeadline, deck, shortDeck, detail, whatHappened,
//     whyItMatters, watchNext }
// — Do not touch generateHeadline.
// — Keep all non-availability branches exactly as written below.
// — watchNext can remain formulaic — it's a scan prompt, not editorial copy.
//
// ─────────────────────────────────────────────────────────────────────────────

function buildPublicSituationStory(situation: IntelligenceSituation) {
  const player = situation.subject.player?.trim();
  const team = displayTeamName(
    situation.subject.team ?? splitMatchup(situation.subject.matchup)[0] ?? situation.league,
    situation.league,
  );
  const specificHeadline = generateHeadline(situation);
  const teamContext = team ? `${team} ${teamContextNoun(situation)}` : `${situation.league} context`;
  const status = publicAvailabilityStatus(situation.raw.injury_designation);
  const hasPlayer = Boolean(player);
  const marketPhrase = situation.marketReaction
    ? " Books, fantasy markets, and team context are already reacting."
    : "";

  if (isAvailabilitySituation(situation)) {
    const rawText =
      `${situation.raw.signal_type} ${situation.headline} ${situation.currentRead} ${situation.raw.body ?? ""} ${situation.raw.action_note ?? ""}`.toLowerCase();
    const injuryPart = rawText.match(INJURY_TYPE_PATTERN)?.[1] ?? null;
    const lastName = player ? player.split(" ").slice(-1)[0] : null;

    // ── REPLACE EVERYTHING IN THIS BLOCK ────────────────────────────────────
    // The deck / shortDeck / whatHappened / whyItMatters variables below
    // are what need variation. detail and watchNext can stay formulaic.

    let deck: string;
    if (hasPlayer) {
      if (status === "OUT") {
        const injurySuffix = injuryPart ? ` (${injuryPart})` : "";
        deck = `${player}${injurySuffix} is out. ${team} will need to adjust rotation and minutes distribution. Monitor practice reports for timeline.`;
      } else if (status === "DOUBTFUL") {
        deck = `${player} is listed doubtful. ${team} should plan around a likely absence. Watch final injury reports before lock.`;
      } else if (status === "QUESTIONABLE") {
        deck = `${player} is questionable and could miss time. ${team} situations and matchup prep are in flux until a final call.`;
      } else {
        deck = `${player}'s availability is under review. ${team} usage, roles, and matchup prep could shift if the status changes.`;
      }
    } else {
      deck = `${team} has a key availability update. Role distribution and matchup prep could shift until the situation clarifies.`;
    }

    let detail: string;
    if (status && lastName) {
      detail = injuryPart
        ? `${lastName} listed ${status} — ${injuryPart.charAt(0).toUpperCase() + injuryPart.slice(1)}`
        : `${lastName} listed ${status}`;
    } else if (status && team) {
      detail = `${team} — ${status}`;
    } else {
      detail = `${team} availability update`;
    }

    const headline =
      specificHeadline ??
      (hasPlayer
        ? `${player} availability puts ${team} ${teamContextNoun(situation)} in focus`
        : `${team} availability puts ${teamContextNoun(situation)} in focus`);

    return {
      headline,
      shortHeadline: headline,
      deck,
      shortDeck: hasPlayer
        ? `${player}'s status brings ${teamContext} into focus.`
        : `${team}'s availability picture remains under review.`,
      detail,
      whatHappened: hasPlayer
        ? `${player}'s availability status changed, putting ${teamPossessive(team)} role and matchup plan back on the board.`
        : `${team}'s availability context changed and remains the team situation to monitor.`,
      whyItMatters:
        `The ${teamContext}, target distribution, and opponent prep can shift if the status holds or changes again.${marketPhrase}`.trim(),
      watchNext: `Watch for confirmed beat reports, practice participation, roster adjustments, and any movement in fantasy or betting markets.`,
    };
    // ── END REPLACE BLOCK ────────────────────────────────────────────────────
  }

  // ── NON-AVAILABILITY BRANCHES — DO NOT TOUCH ─────────────────────────────

  if (isRosterMoveSituation(situation)) {
    const subject = player ?? team;
    const headline = specificHeadline ?? `${subject} roster move could change ${team} depth-chart plan`;
    return {
      headline,
      shortHeadline: headline,
      deck: `${team}'s roster picture changed, which can alter depth, roles, and next-man usage. Watch for this to develop into a larger team-context shift.`,
      shortDeck: `${team}'s roster picture changed and the role impact is still developing.`,
      detail: "Roster context changed",
      whatHappened: `${subject} is tied to a roster update that changes the ${team} context.`,
      whyItMatters: `Roster movement can change depth charts, usage, fantasy relevance, and how opponents prepare for ${team}.`,
      watchNext: "Watch for official roster moves, practice roles, depth-chart updates, and follow-on reports.",
    };
  }

  if (isLineupSituation(situation)) {
    const subject = player ?? team;
    const headline = specificHeadline ?? `${subject} lineup update could shape ${team} pregame plan`;
    return {
      headline,
      shortHeadline: headline,
      deck: `${team}'s lineup context is active, and one confirmed change can move roles, matchup plans, and market assumptions. Watch for the next official card or report trail.`,
      shortDeck: `${team}'s lineup context remains active before the next confirmation.`,
      detail: "Lineup context updated",
      whatHappened: `${team}'s lineup or pitcher context changed enough to keep the slate under review.`,
      whyItMatters: "Lineup and pitcher changes can alter game environment, role expectations, fantasy exposure, and late pricing.",
      watchNext: "Watch for official lineup cards, pitcher confirmations, scratches, weather updates, and market movement.",
    };
  }

  if (isDepthChartSituation(situation)) {
    const subject = player ?? team;
    const headline = specificHeadline ?? `${subject} depth-chart update puts ${team} roles in focus`;
    return {
      headline,
      shortHeadline: headline,
      deck: `${team}'s depth chart is still developing. Watch for reports, practice usage, or roster signals to confirm a real role change.`,
      shortDeck: `${team}'s depth chart is still developing.`,
      detail: "Depth chart context updated",
      whatHappened: `${team}'s depth or role context changed enough to keep monitoring.`,
      whyItMatters: "Role changes can alter usage, matchup plans, fantasy projections, and team preparation.",
      watchNext: "Watch for practice reports, snap or rotation notes, roster updates, and official depth-chart confirmation.",
    };
  }

  if (situation.marketReaction) {
    const subject = player ?? situation.subject.matchup ?? team;
    const headline = specificHeadline ?? `${subject} line movement follows late ${team} context`;
    return {
      headline,
      shortHeadline: headline,
      deck: `Market context is reacting around ${subject}. Watch for team news or source support to back the move.`,
      shortDeck: `Market reaction is moving around ${subject}.`,
      detail: "Books/fantasy/team context reacting",
      whatHappened: `${subject} is tied to movement that changed the ${team} read.`,
      whyItMatters: "Market movement can signal that team news, matchup context, or availability assumptions are changing before the public story is settled.",
      watchNext: "Watch for the report trail behind the move, confirmation from trusted sources, and whether prices or projections continue to adjust.",
    };
  }

  if (situation.raw.weather_note) {
    const headline = `${team} game environment could shift weather and matchup plans`;
    return {
      headline,
      shortHeadline: headline,
      deck: `Game environment is part of the current ${team} read. Watch for weather, field conditions, or timing changes to alter projections.`,
      shortDeck: `${team} game environment remains part of the live read.`,
      detail: "Game environment updated",
      whatHappened: `${team}'s game environment has a weather or conditions note attached.`,
      whyItMatters: "Weather and conditions can alter pace, scoring, substitution patterns, and market assumptions.",
      watchNext: "Watch for updated forecasts, official game notes, lineup changes, and total or prop movement.",
    };
  }

  // Generic fallback
  const subject = player ?? situation.subject.matchup ?? team;
  const development = compactIntelPhrase(
    situation.timeline.at(-1)?.detail ?? situation.currentRead,
  );
  const hasNamedSubject = Boolean(player || situation.subject.team || situation.subject.matchup);
  const headline =
    specificHeadline ??
    (hasNamedSubject && development
      ? `${subject} — ${development}`
      : `${subject} update remains on the ${situation.league} watch`);
  return {
    headline,
    shortHeadline: headline,
    deck: `${situation.league} context is still developing around ${subject}. Watch for the source trail, timing, and impact to develop before the read elevates further.`,
    shortDeck: `${situation.league} context is still developing around ${subject}.`,
    detail: "Story context updated",
    whatHappened: `${subject} is attached to a developing ${situation.league} story read.`,
    whyItMatters:
      compactIntelPhrase(situation.whyItMatters) ??
      "The update can change team, fantasy, market, or matchup context if more support arrives.",
    watchNext: publicWatchNext(situation),
  };
}
