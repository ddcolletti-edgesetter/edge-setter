/**
 * Edge Setter — publicConfirmation auto-detection
 *
 * The North Star timing advantage ("EdgeSetter flagged 47 min before public
 * confirmation") needs the moment a mainstream source picks up a story
 * EdgeSetter already has. This module detects that moment in the processor
 * pipeline and records it once per situation.
 *
 * A confirmation source is:
 *   - an official source (league/team official feeds, "official report"
 *     source types), OR
 *   - a tier1 national wire reporter / outlet from the known list below.
 *
 * Rules (all enforced in maybeRecordPublicConfirmation):
 *   - The FIRST signal for a situation is EdgeSetter's own detection
 *     (firstSeenAt), never a public confirmation.
 *   - If the situation was created by a confirmation source to begin with
 *     (Schefter broke it), there is no timing advantage to record.
 *   - The first mainstream pickup is canonical — never overwritten.
 */

import type Database from "better-sqlite3";
import { getPipelineDb } from "./store";
import type { Situation, SituationPublicConfirmation } from "./situations-contract";
import {
  getSituationPublicConfirmation,
  insertSituationPublicConfirmation,
  listSituationEvents,
} from "./situations-store";
import type { RawEvent } from "./types";

/** National wire reporters and outlets whose pickup counts as public confirmation. */
const WIRE_CONFIRMATION_SOURCES = [
  "adam schefter",
  "ian rapoport",
  "shams charania",
  "adrian wojnarowski",
  "ken rosenthal",
  "jeff passan",
  "jon heyman",
  "tom pelissero",
  "jay glazer",
  "jeremy fowler",
  "espn nfl",
  "espn nba",
  "espn mlb",
  "ap sports",
  "nfl network",
] as const;

/**
 * Source types EdgeSetter assigns to its OWN polling ingestion (ESPN NFL/CFB
 * → sports_api; ESPN NBA / MLB StatsAPI → league_api). These are detection
 * feeds, not independent public pickups, so they can never count as a public
 * confirmation. Gating on the TYPE is what stops our own re-ingestion from
 * masquerading as a wire: a feed label like "ESPN NFL" would otherwise match
 * WIRE_CONFIRMATION_SOURCES and structurally disqualify the situation it
 * created (via situationOriginatedFromConfirmationSource).
 */
const OWN_INGESTION_SOURCE_TYPES = new Set(["league_api", "sports_api"]);

export interface ConfirmationSourceMatch {
  readonly name: string;
  readonly reason: "official" | "tier1_wire";
}

interface RawEventSourceFields {
  readonly source_id?: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Identity signature EdgeSetter's own scheduled RSS feeds (the sports-rss
 * adapter) stamp on every event: a `rss_<label>` source_id, a `rss_feed` label,
 * and `rss_`-prefixed source entries. These are OUR ingestion, not an
 * independent public pickup — the same as the api feeds above — but they arrive
 * with source_type "rss" (not league_api/sports_api), so the type gate misses
 * them. An ESPN feed's "ESPN NFL"/"ESPN NBA"/"ESPN MLB" label would otherwise
 * match the wire list and structurally disqualify the situation it created.
 * We gate on the feed-config IDENTITY (not the "rss" source_type) so a genuine
 * third-party RSS wire — which carries no `rss_` scheduler signature — still
 * passes on name.
 */
function isOwnScheduledRssFeed(raw: RawEventSourceFields, p: Record<string, any>): boolean {
  if (typeof raw.source_id === "string" && raw.source_id.startsWith("rss_")) return true;
  if (typeof p.rss_feed === "string" && p.rss_feed.trim().length > 0) return true;
  const sourceEntries: Array<{ id?: unknown }> = Array.isArray(p.sources) ? p.sources : [];
  return sourceEntries.some((source) => typeof source?.id === "string" && source.id.startsWith("rss_"));
}

/**
 * Decide whether the event came from a confirmation source, using the source
 * metadata adapters attach to payloads: `sources` ({name, type}), `source_types`,
 * `source_labels`, `author` and `source_tier` (X adapter).
 */
export function matchConfirmationSource(raw: RawEventSourceFields): ConfirmationSourceMatch | null {
  const p = (raw.payload ?? {}) as Record<string, any>;
  const sourceEntries: Array<{ name?: unknown; type?: unknown }> = Array.isArray(p.sources) ? p.sources : [];

  const names = [
    p.author,
    ...sourceEntries.map((source) => source?.name),
    ...(Array.isArray(p.source_labels) ? p.source_labels : []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const types = [
    ...(Array.isArray(p.source_types) ? p.source_types : []),
    ...sourceEntries.map((source) => source?.type),
  ].filter((value): value is string => typeof value === "string");

  const officialName = names.find((name) => /\bofficial\b/i.test(name));
  if (types.some((type) => /^official$|^official_source$|^team_official$|^league_official$/i.test(type)) || officialName) {
    return { name: officialName ?? names[0] ?? raw.source_id ?? "official source", reason: "official" };
  }

  // EdgeSetter's own polling feeds (ESPN, MLB StatsAPI) arrive tagged
  // league_api/sports_api. They are our detection, not a public confirmation —
  // gate them out by TYPE so a feed label like "ESPN NFL" can't match the wire
  // list below. (Genuinely official league/team feeds are handled above.)
  if (types.some((type) => OWN_INGESTION_SOURCE_TYPES.has(type.toLowerCase()))) return null;

  // Same principle as the type gate, keyed on the RSS feed-config identity:
  // EdgeSetter's own scheduled RSS feeds (e.g. espn_nfl_rss) arrive as source_type
  // "rss" — not league_api/sports_api — so the type gate above misses them. Their
  // "ESPN NFL" label matches the wire list below, so without this gate our own
  // re-ingestion counts as a public confirmation and disqualifies the situation it
  // created (~7% of ESPN NFL events leak in via this path).
  if (isOwnScheduledRssFeed(raw, p)) return null;

  // Wire reporters must be tier1 when the adapter supplies a tier; third-party
  // wires without tier metadata (RSS with no feed-config identity) pass on name alone.
  const tier = String(p.source_tier ?? p.tier ?? p.trust_tier ?? "");
  if (tier && tier !== "tier1") return null;
  const wireName = names.find((name) =>
    WIRE_CONFIRMATION_SOURCES.some((wire) => name.toLowerCase().includes(wire)),
  );
  return wireName ? { name: wireName, reason: "tier1_wire" } : null;
}

/** The public confirmation moment: the source's published_at, else receipt time. */
export function confirmationTimestamp(raw: RawEvent): string {
  const published = (raw.payload as Record<string, any>)?.published_at;
  if (typeof published === "string" && Number.isFinite(Date.parse(published))) return published;
  return raw.received_at;
}

export interface PublicConfirmationEvolution {
  readonly matched: boolean;
  readonly situation: Situation;
}

/**
 * Record publicConfirmation when a confirmation source reports a story
 * EdgeSetter already has. Returns the recorded confirmation, or null when
 * any guard rejects (first signal, original detector was a wire source,
 * already confirmed, timestamp not after detection, non-confirmation source).
 */
export function maybeRecordPublicConfirmation(
  raw: RawEvent,
  evolution: PublicConfirmationEvolution,
  db: Database.Database = getPipelineDb(),
): SituationPublicConfirmation | null {
  // First signal for a situation is EdgeSetter's detection, not public confirmation.
  if (!evolution.matched) return null;

  const match = matchConfirmationSource(raw);
  if (!match) return null;

  const situation = evolution.situation;
  if (getSituationPublicConfirmation(situation.situation_id, db)) return null;

  const firstSeenMs = Date.parse(situation.created_at);
  if (!Number.isFinite(firstSeenMs)) return null;

  const confirmedAt = confirmationTimestamp(raw);
  const confirmedMs = Date.parse(confirmedAt);
  if (!Number.isFinite(confirmedMs) || confirmedMs <= firstSeenMs) return null;

  // If a wire/official source broke the story, there is no timing advantage.
  if (situationOriginatedFromConfirmationSource(situation.situation_id, db)) return null;

  const confirmation: SituationPublicConfirmation = {
    situation_id: situation.situation_id,
    confirmed_at: confirmedAt,
    detection_lead_minutes: Math.round((confirmedMs - firstSeenMs) / 60_000),
    source_name: match.name,
    confirmation_reason: match.reason,
    raw_event_id: raw.id ?? null,
    created_at: new Date().toISOString(),
  };

  if (!insertSituationPublicConfirmation(confirmation, db)) return null;

  console.log(
    `[publicConfirmation] ${confirmation.situation_id} lead: ${confirmation.detection_lead_minutes}m source: ${confirmation.source_name}`,
  );
  return confirmation;
}

function situationOriginatedFromConfirmationSource(situationId: string, db: Database.Database): boolean {
  const events = listSituationEvents(situationId, db);
  const created = events.find((event) => event.kind === "situation_created") ?? events[0];
  if (!created) return false;
  const normalized = created.payload?.normalized_event as Record<string, any> | undefined;
  const rawPayload = normalized?.payload?.raw_payload as Record<string, unknown> | undefined;
  if (!rawPayload) return false;
  return matchConfirmationSource({ source_id: created.source_id ?? undefined, payload: rawPayload }) !== null;
}
