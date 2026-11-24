/**
 * Where a stored injury designation came from, and whether that source is an
 * official structured status from a league data feed.
 *
 * Shared by the server (processor: verdict, "confirmed scratch", the stored
 * column) and the client (the badge gate), so the two cannot disagree about
 * which sources count.
 *
 * `live_signals.injury_designation_source` holds
 *
 *     <source_type>:<source_id>:<league>:payload.<field>
 *
 * e.g. "api:espn:NBA:payload.designation". The processor writes it whenever it
 * stores a designation, from every producer, so the column records provenance
 * honestly even for sources the allowlist does not trust. Rows written before
 * the column existed read NULL, and NULL is never official.
 */

/** The four feeds whose injury designation is copied from a structured status field. */
export const OFFICIAL_DESIGNATION_FEEDS: ReadonlyArray<{ sourceId: string; league: string; label: string }> = [
  { sourceId: "espn", league: "NFL", label: "ESPN NFL" },
  { sourceId: "espn", league: "NBA", label: "ESPN NBA" },
  { sourceId: "balldontlie", league: "NBA", label: "balldontlie" },
  { sourceId: "mlb_statsapi", league: "MLB", label: "MLB StatsAPI" },
];

/**
 * The payload fields those feeds put the status in. `designation` is the
 * adapter's normalized value; `status` is the feed's raw string, which
 * payloadInjuryDesignation falls back to.
 */
const STRUCTURED_FIELDS: ReadonlySet<string> = new Set(["payload.designation", "payload.status"]);

export function formatInjuryDesignationSource(parts: {
  sourceType: string | null | undefined;
  sourceId: string | null | undefined;
  league: string | null | undefined;
  field: string;
}): string {
  return `${parts.sourceType ?? ""}:${parts.sourceId ?? ""}:${parts.league ?? ""}:payload.${parts.field}`;
}

/**
 * True only for a designation read from a structured field of one of the
 * {@link OFFICIAL_DESIGNATION_FEEDS}, delivered as source_type "api". ESPN CFB
 * is deliberately absent: its feed is sparse and lags the schools' own reports.
 * The operator /ingest endpoint writes source_type "manual", so it cannot pass
 * by naming a feed's source_id.
 */
export function isOfficialInjuryDesignationSource(source: string | null | undefined): boolean {
  if (!source) return false;
  const parts = source.split(":");
  if (parts.length !== 4) return false;
  const [sourceType, sourceId, league, field] = parts;
  if (sourceType !== "api" || !STRUCTURED_FIELDS.has(field)) return false;
  return OFFICIAL_DESIGNATION_FEEDS.some((f) => f.sourceId === sourceId && f.league === league);
}
