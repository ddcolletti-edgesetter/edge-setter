/**
 * Injury designations: fold a stored value into a label, and decide whether a
 * surface may show it. A leaf module (no imports), so lib code, pages and the
 * board adapters all read one gate. boardAdapters re-exports both functions.
 */

/**
 * Fold a raw designation into the short tag the card shows.
 *
 * Only the four words with a single unambiguous reading are expanded. Anything
 * else — the practice-participation codes DNP/LP/FP, "IL-60", a value this feed
 * has not sent before — passes through uppercased, because inventing a longer
 * label for a code we have not verified is how "LP" becomes a claim about a
 * player's availability that no source made. `D` and `Q` are read as Doubtful
 * and Questionable to match signalScorer, which already scores them that way.
 */
const INJURY_DESIGNATION_LABELS: Readonly<Record<string, string>> = {
  O: "OUT",
  OUT: "OUT",
  D: "DOUBTFUL",
  DOUBTFUL: "DOUBTFUL",
  Q: "QUESTIONABLE",
  QUESTIONABLE: "QUESTIONABLE",
  P: "PROBABLE",
  PROBABLE: "PROBABLE",
};

export function normalizeInjuryDesignation(raw?: string | null): string | undefined {
  const key = String(raw ?? "").trim().toUpperCase();
  if (!key) return undefined;
  return INJURY_DESIGNATION_LABELS[key] ?? key;
}

/* ── Which designations we are willing to put on screen ──────────────────────
 *
 * Until this change, `server/pipeline/processor.ts` handleInjuryUpdate built
 * every injury signal with
 *
 *     const designation: string = p.designation ?? p.status ?? "Questionable";
 *
 * and five of the ten injury producers — sports-rss, x-twitter, 247sports, on3
 * and cfb-school-sid — send a payload carrying neither key (see
 * `sports-rss.ts:395`, whose payload is headline/notes/source_url/...). So
 * every injury signal from a text-classified source was stored as
 * "Questionable" whether or not any source said anything about availability.
 *
 * ESPN NFL, CFB and NBA do report a real "Questionable", and the stored string
 * is byte-identical in both cases. Nothing on the client can tell a reported
 * designation from an invented one, so there is no test we could write here
 * that keeps the true badges and drops the false ones. A badge is a claim about
 * whether a player will play; we withhold the whole class rather than show a
 * coin flip as a fact.
 *
 * The server default is gone: handleInjuryUpdate now stores NULL when the
 * payload has no designation or status, so NEW rows no longer carry an invented
 * "Questionable". QUESTIONABLE is still withheld, deliberately, because:
 *   - rows written before that change still hold the default, byte-identical to
 *     a real one, and are not rewritten; and
 *   - even a non-default "Questionable" can come from a payload whose `status`
 *     was set by something other than an official injury report (the manual
 *     /ingest endpoint takes any payload).
 * Releasing it needs a stored marker of where the designation came from. Until
 * then this gate is the only thing standing between a guess and a badge.
 */
const UNPROVABLE_DESIGNATIONS: ReadonlySet<string> = new Set(["QUESTIONABLE"]);

/**
 * Phrases that contradict any availability badge at all.
 *
 * The processor overwrites `headline` but not `body`, so a text-sourced
 * signal's own prose survives into `row.subtitle` — which means a story whose
 * reporting says the player came OFF the injury report can still carry a stored
 * designation saying he is on it. When the prose and the badge disagree we
 * trust the prose and drop the badge, for every designation including OUT.
 *
 * Deliberately blunt: /\bcleared\b/ also fires on "has not been cleared", which
 * suppresses a badge that was arguably right. That is the safe direction of
 * error — the cost is a missing tag, not a false claim — so it is left alone
 * rather than papered over with negation-matching we cannot test against real
 * copy.
 */
const DESIGNATION_CONTRADICTIONS: readonly RegExp[] = [
  /\b(?:off|removed from|not on)\s+the\s+injury\s+report\b/i,
  /\bfull\s+partic/i,
  /\bclear(?:ed|ance)\b/i,
  /\bactivated\b/i,
  /\bno\s+longer\s+listed\b/i,
];

/**
 * The designation a surface may render, or undefined.
 *
 * Kept separate from {@link normalizeInjuryDesignation} on purpose: that
 * function's job is to fold a raw code into a label and it still has to do that
 * faithfully for QUESTIONABLE, because the drawer, the scorer and the tests all
 * depend on the mapping. This is the display gate layered on top.
 *
 * @param raw      the stored `live_signals.injury_designation`
 * @param bodyText the signal's own prose — pass title + subtitle together
 */
export function badgeableInjuryDesignation(
  raw?: string | null,
  bodyText?: string,
): string | undefined {
  const designation = normalizeInjuryDesignation(raw);
  if (!designation) return undefined;
  if (UNPROVABLE_DESIGNATIONS.has(designation)) return undefined;
  if (bodyText && DESIGNATION_CONTRADICTIONS.some((pattern) => pattern.test(bodyText))) {
    return undefined;
  }
  return designation;
}
