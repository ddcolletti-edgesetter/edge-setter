/**
 * Edge Setter — what a line move is a move IN, and whether it is still a move
 * from the opener.
 *
 * ── The bug this exists to stop ──────────────────────────────────────────────
 *
 * `live_signals.line_movement` is `{ open, current, delta, direction }` and
 * nothing else. The odds adapter emits a `line_move` raw event for a SPREAD
 * move and another for a TOTAL move, and the payload says which — `market:
 * "spread"` / `market: "total"` — but `handleLineMove` in the processor never
 * carries that word onto the signal. So by the time the board reads the row,
 * the two markets are indistinguishable, and every downstream label treats the
 * number as a spread on the signal's `team`:
 *
 *     DAL: +48.5 → +54.5 — market movement      (an NFL TOTAL)
 *     MIL: +225.5 → +228.5 — market reaction    (an NBA TOTAL)
 *
 * A 48.5-point Cowboys spread is not a thing. The number is right and the
 * sentence around it is false, which is worse than printing nothing.
 *
 * ── Resolution order ─────────────────────────────────────────────────────────
 *
 * 1. CANONICAL `latestEvidence[].marketImpact`. The situations API builds it
 *    from `market_context`, which DOES keep the adapter's word, and renders it
 *    as "total moved 6 up" / "spread moved 2 down". When a row has one, it is
 *    the market the pipeline recorded, not an inference — so it wins.
 *
 *    Caveat worth knowing: `situations-adapter.ts` writes `market_context.market
 *    = payload.market ?? "spread"`. A line move from a producer that sends no
 *    `market` is therefore LABELLED spread rather than left unknown. Today only
 *    the odds adapter emits `line_move`, and it always sends the field, so every
 *    "spread" on a real row is a real spread. If another producer starts
 *    emitting them, that default is where a wrong word would come from.
 *
 * 2. EXACT OPENER MATCH. `games.open_spread` / `games.open_total` for the game
 *    the move sits on. If the move's `open` equals exactly one of them, that is
 *    the market it opened in. Equality, not proximity — a near miss is not
 *    evidence, and the two openers are far apart in every league anyway.
 *
 * 3. MAGNITUDE, and only to pick the label. See LEAGUE_BANDS: this is a guess
 *    from the size of the number, so it is last, and in the one league where
 *    the bands genuinely overlap it declines to guess (kind "unknown") and the
 *    label drops the market word instead of inventing one.
 *
 * ── The second claim: "from the opener" ──────────────────────────────────────
 *
 * The stored `open` is the opener as the adapter saw it when the move fired. It
 * can stop being the game's opener afterwards — #103 re-baselined 122 of 124
 * future NFL games off an August futures price, and 65 of 69 NFL moves standing
 * on prod right now carry an `open` that matches NEITHER of their game's
 * current openers because of it. "48.5 → 54.5" then reads as a move from a
 * number no longer on the board.
 *
 * So the arrow form is a claim about the opener, and it is only printed when
 * nothing contradicts it. When we HOLD the opener for the resolved market and
 * it disagrees, the claim is dropped and only the live number is printed:
 * "Total now 54.5". When we hold no opener at all we cannot contradict it, so
 * the arrow stays — absence of the games row is not evidence against the
 * signal's own record of its open.
 */

export type MarketKind = "spread" | "total" | "unknown";

export interface MarketMoveInput {
  /** `line_movement.open` — the opener as the move recorded it. */
  readonly open?: number | string | null;
  /** `line_movement.current`. */
  readonly current?: number | string | null;
  /** The signal's team token. Printed for a SPREAD; a total's team is just the home side. */
  readonly team?: string | null;
  readonly league?: string | null;
  /** Canonical `latestEvidence[].marketImpact`, one string or the whole list. */
  readonly marketImpact?: string | null | readonly (string | null | undefined)[];
  /** `games.open_spread` for this move's game. */
  readonly openSpread?: number | string | null;
  /** `games.open_total` for this move's game. */
  readonly openTotal?: number | string | null;
}

export interface MarketMove {
  readonly kind: MarketKind;
  /** How {@link kind} was decided — carried so tests and callers can tell a record from a guess. */
  readonly basis: "market-impact" | "opener-match" | "magnitude" | "undecided";
  /**
   * Whether the move may still be described as running FROM the opener. False
   * only when we hold the game's opener for this market and it disagrees.
   */
  readonly fromOpener: boolean;
  readonly open: number;
  readonly current: number;
  /** "Total 48.5 → 54.5" / "Total now 54.5" / "DAL −3.5 → −4.5" / "DAL −4.5 now". */
  readonly text: string;
}

/**
 * Where a league's spreads stop and its totals start, measured off the prod
 * `games` table on 2026-11-19 (every scheduled row, all four leagues):
 *
 *   NFL   spread |x| <=  16.5   total  37.5 –  54.5    clear gap
 *   CFB   spread  -58.5…+29.5   total  36.5 –  76.5    clear gap, positives only
 *   NBA   spread |x| <=  18.5   total 209.5 – 244.5    clear gap
 *   MLB   spread |x| <=   2.5   total   1.5 –  17.5    THEY OVERLAP
 *
 * Three rules come out of that.
 *
 *   • A NEGATIVE number is a spread in every league. A total is a sum of
 *     points; it is never below zero. This is the only part of step 3 that is
 *     a fact rather than a band, and it is why CFB's deep favourites (-58.5,
 *     well inside the CFB total range by magnitude) are never read as totals.
 *
 *   • A POSITIVE number at or above `totalAtOrAbove` is a total; at or below
 *     `spreadAtOrBelow` it is a spread. The two bounds are set inside the
 *     measured gap, not at its edges, so a league drifting a point or two does
 *     not start producing wrong words.
 *
 *   • BETWEEN the two bounds, nothing is printed. For NFL, CFB and NBA that
 *     band is empty in practice. For MLB it is where the markets genuinely
 *     share a range (a 2.5 run line and a 1.5 first-five total are both real),
 *     so there is no threshold that separates them and the honest answer is
 *     "unknown" — the label then drops the market word instead of guessing it.
 *
 * A league with no entry here resolves nothing positive, which is the same
 * answer as the undecided band and for the same reason: we have not measured
 * it.
 */
interface LeagueBand {
  /** A positive number this big or bigger is a total. */
  readonly totalAtOrAbove: number;
  /** A positive number this small or smaller is a spread. */
  readonly spreadAtOrBelow: number;
}

const LEAGUE_BANDS: Readonly<Record<string, LeagueBand>> = {
  NFL: { totalAtOrAbove: 30, spreadAtOrBelow: 25 },
  CFB: { totalAtOrAbove: 32, spreadAtOrBelow: 31 },
  NBA: { totalAtOrAbove: 60, spreadAtOrBelow: 40 },
  // No gap to sit in: 2.5 is the deepest run line prod has, 4 is below every
  // full-game total and above every run line. 2.5 < x < 4 stays unknown.
  MLB: { totalAtOrAbove: 4, spreadAtOrBelow: 2.5 },
};

const ARROW = "→"; // →
const MINUS = "−"; // − , not a hyphen: this is a number, not a dash

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/** "48.5", "3" — no sign, no trailing zeros. */
function digits(value: number): string {
  return String(Math.abs(value)).replace(/\.0+$/, "");
}

/** "+3.5" / "−4" — a spread always carries its side. */
function signed(value: number): string {
  return `${value < 0 ? MINUS : "+"}${digits(value)}`;
}

function kindFromMarketImpact(impact: MarketMoveInput["marketImpact"]): MarketKind | null {
  const list = impact == null ? [] : Array.isArray(impact) ? impact : [impact];
  const text = list.filter(Boolean).join(" ").toLowerCase();
  if (!text) return null;
  const total = /\btotals?\b|\bover\/under\b|\bo\/u\b/.test(text);
  const spread = /\bspreads?\b|\bhandicap\b/.test(text);
  // Both words in one blob says nothing; let the next step decide.
  if (total === spread) return null;
  return total ? "total" : "spread";
}

function kindFromOpeners(open: number, openSpread: number | null, openTotal: number | null): MarketKind | null {
  const matchesSpread = openSpread !== null && openSpread === open;
  const matchesTotal = openTotal !== null && openTotal === open;
  // Exactly one, or it is not an identification.
  if (matchesSpread === matchesTotal) return null;
  return matchesSpread ? "spread" : "total";
}

function kindFromMagnitude(open: number, current: number, league?: string | null): MarketKind {
  // A total is a sum of points. Neither end of a move in one can be negative.
  if (open < 0 || current < 0) return "spread";
  const band = LEAGUE_BANDS[String(league ?? "").toUpperCase()];
  if (!band) return "unknown";
  // The larger end decides, so a move that crosses a bound is read as the
  // market it can reach rather than the one it is leaving.
  const size = Math.max(open, current);
  if (size >= band.totalAtOrAbove) return "total";
  if (size <= band.spreadAtOrBelow) return "spread";
  return "unknown";
}

/**
 * The market a move happened in, and the sentence to print for it.
 *
 * Returns undefined when there is no move to describe — no numbers, or an open
 * and current that are the same price (an "opening line" row, which
 * `isOpeningLineOnlyBoardSignal` already drops from the board, but which also
 * reaches this through the canonical lane).
 */
export function resolveMarketMove(input: MarketMoveInput): MarketMove | undefined {
  const open = toNumber(input.open);
  const current = toNumber(input.current);
  if (open === null || current === null) return undefined;
  if (Math.abs(current - open) < 0.05) return undefined;

  const openSpread = toNumber(input.openSpread);
  const openTotal = toNumber(input.openTotal);

  const recorded = kindFromMarketImpact(input.marketImpact);
  const matched = recorded ? null : kindFromOpeners(open, openSpread, openTotal);
  const kind: MarketKind = recorded ?? matched ?? kindFromMagnitude(open, current, input.league);
  const basis: MarketMove["basis"] = recorded
    ? "market-impact"
    : matched
      ? "opener-match"
      : kind === "unknown"
        ? "undecided"
        : "magnitude";

  // The opener we can check this move against, if we hold one for its market.
  const storedOpener = kind === "total" ? openTotal : kind === "spread" ? openSpread : null;
  const fromOpener = storedOpener === null || storedOpener === open;

  const label = kind === "total" ? "Total" : kind === "spread" ? (input.team?.trim() || "Spread") : "";
  const render = kind === "total" ? digits : kind === "spread" ? signed : digits;
  const head = label ? `${label} ` : "";
  const text = fromOpener
    ? `${head}${render(open)} ${ARROW} ${render(current)}`
    : kind === "total" || !label
      ? `${head}now ${render(current)}`
      : `${head}${render(current)} now`;

  return { kind, basis, fromOpener, open, current, text };
}

/**
 * The team token and the two numbers out of a pipeline line-move summary.
 *
 * `handleLineMove` in server/pipeline/processor.ts builds exactly one shape:
 *
 *     `${team}: ${signed(open)} → ${signed(current)} — ${note}`
 *
 * and it is the string that reaches the canonical lane as `summary` on both the
 * situation and its `line_move` evidence. That lane is the ONLY one that knows
 * which market the move happened in (`marketImpact`), and the only one with no
 * `line_movement` object to read the numbers from — so for a canonical row the
 * numbers have to come back out of the sentence.
 *
 * This is a parser for one template this repository itself writes, not a
 * general number scraper: it is anchored at both ends, requires the arrow and
 * both signs, and returns undefined on anything else. A row it does not match
 * keeps its original copy rather than getting a guess.
 */
export function parsePipelineMoveSummary(
  value: string | null | undefined,
): { readonly team: string | null; readonly open: number; readonly current: number } | undefined {
  const match = String(value ?? "").match(
    /^\s*([A-Za-z]{2,5})\s*:\s*([+−-]?\d+(?:\.\d+)?)\s*→\s*([+−-]?\d+(?:\.\d+)?)\s*(?:—|-{1,2})/,
  );
  if (!match) return undefined;
  const open = toNumber(match[2]!.replace(MINUS, "-"));
  const current = toNumber(match[3]!.replace(MINUS, "-"));
  if (open === null || current === null) return undefined;
  return { team: match[1] ?? null, open, current };
}

/**
 * `games.open_spread` / `games.open_total` off a board game row.
 *
 * Two spellings each for the same reason the team-token fields have four: the
 * API serves snake_case rows and every board page re-maps them into its own
 * camelCase shape. Null on a row that carries neither, which every caller
 * treats as "we hold no opener for this game" — not as zero.
 */
export function gameOpeners(
  game:
    | {
        readonly openSpread?: number | string | null;
        readonly openTotal?: number | string | null;
        readonly open_spread?: number | string | null;
        readonly open_total?: number | string | null;
      }
    | null
    | undefined,
): { readonly openSpread: number | null; readonly openTotal: number | null } {
  return {
    openSpread: toNumber(game?.openSpread ?? game?.open_spread),
    openTotal: toNumber(game?.openTotal ?? game?.open_total),
  };
}

/**
 * The same thing for a caller that holds a signal rather than loose fields.
 * `lineMovement` is the shape every board adapter puts on a signal.
 */
export function resolveSignalMarketMove(
  signal: {
    readonly team?: string | null;
    readonly lineMovement?: unknown;
  } | null | undefined,
  context: {
    readonly league?: string | null;
    readonly marketImpact?: MarketMoveInput["marketImpact"];
    readonly openSpread?: number | string | null;
    readonly openTotal?: number | string | null;
  } = {},
): MarketMove | undefined {
  const movement = signal?.lineMovement as { open?: unknown; current?: unknown } | null | undefined;
  if (!movement || typeof movement !== "object") return undefined;
  return resolveMarketMove({
    open: movement.open as number | string | null | undefined,
    current: movement.current as number | string | null | undefined,
    team: signal?.team,
    league: context.league,
    marketImpact: context.marketImpact,
    openSpread: context.openSpread,
    openTotal: context.openTotal,
  });
}
