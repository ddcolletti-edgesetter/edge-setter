/**
 * READ-ONLY. Team Story trigger census: NFL, last N days (default 30).
 *
 * For each trigger from classifyTeamStoryTrigger (coach hire / fire, front
 * office, trade, season-ending injury, suspension, retirement) it counts:
 *   1. detected  — NFL raw_events received in the window that the classifier
 *                  tags, split by evidence (structured field vs text pattern),
 *                  pattern id, source_type and event_type;
 *   2. situation — which situation type those events became, founded vs
 *                  matched into an existing one, and how many have no
 *                  situation row at all (unprocessed, or never built);
 *   3. public confirmation — how many landed in a situation that has a
 *                  situation_public_confirmations row, and how many of those
 *                  rows were written by this very event.
 * Plus up to 3 sample matches per pattern, to eyeball false positives.
 *
 * It changes nothing. The classifier is measurement-only and the live path
 * does not call it; this script is its only caller.
 *
 * It opens pipeline.db itself with readonly: true and fileMustExist: true. It
 * does NOT import pipeline/store: that opens the database read-write and runs
 * schema init.
 *
 *   node dist/team-story-trigger-census.cjs [--days N]
 *
 * Path: $PIPELINE_DATA_DIR (else $DATA_DIR, else /var/data)/pipeline.db, the
 * same env vars the app uses. The resolved path is printed first.
 *
 * Query plan notes (no new index):
 *   - raw_events: league = 'NFL' AND received_at >= ? → idx_raw_events_league_received.
 *   - situation_events has no raw_event_id index, so it is read per NFL
 *     situation through idx_situation_events_situation
 *     (situation_id, recorded_at, event_id) with recorded_at >= cutoff — only
 *     in-window rows are fetched, never the whole table.
 */
import Database from "better-sqlite3";
import path from "path";
import {
  classifyTeamStoryTrigger,
  TEAM_STORY_TRIGGERS,
  type TeamStoryTrigger,
} from "../pipeline/team-story-trigger";

type DB = Database.Database;

export interface Args { days: number }

export function parseArgs(argv: string[]): Args {
  let days = 30;
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === "--days") {
      const v = argv[++i];
      const n = Number(v);
      if (v === undefined || !Number.isInteger(n) || n < 1 || n > 365) throw new Error("--days needs an integer 1-365");
      days = n;
    } else {
      throw new Error(`Unknown argument ${f}`);
    }
  }
  return { days };
}

export function resolvePipelinePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.PIPELINE_DATA_DIR || env.DATA_DIR || "/var/data", "pipeline.db");
}

type Tally = Record<string, number>;
const bump = (t: Tally, k: string | null | undefined, n = 1) => { const key = String(k ?? "null"); t[key] = (t[key] ?? 0) + n; };

export interface TriggerCensus {
  detected: number;
  by_evidence: Tally;
  by_pattern: Tally;
  by_source_type: Tally;
  by_event_type: Tally;
  unprocessed: number;
  situation: {
    with_situation: number;
    no_situation: number;
    by_situation_type: Tally;
    founded: number;
    matched_existing: number;
    distinct_situations: number;
  };
  public_confirmation: {
    events_in_confirmed_situation: number;
    confirmed_by_this_event: number;
    distinct_confirmed_situations: number;
    by_confirmation_source: Tally;
  };
  samples: Record<string, Array<{ raw_event_id: string; source_id: string; field: string; matched: string; headline: string }>>;
}

export interface CensusResult {
  window: { days: number; cutoff: string; now: string };
  nfl_raw_events_in_window: number;
  nfl_raw_events_with_any_trigger: number;
  multi_trigger_events: number;
  situation_tables_present: boolean;
  triggers: Record<TeamStoryTrigger, TriggerCensus>;
}

function emptyTrigger(): TriggerCensus {
  return {
    detected: 0, by_evidence: {}, by_pattern: {}, by_source_type: {}, by_event_type: {}, unprocessed: 0,
    situation: { with_situation: 0, no_situation: 0, by_situation_type: {}, founded: 0, matched_existing: 0, distinct_situations: 0 },
    public_confirmation: { events_in_confirmed_situation: 0, confirmed_by_this_event: 0, distinct_confirmed_situations: 0, by_confirmation_source: {} },
    samples: {},
  };
}

const hasTable = (db: DB, t: string) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);

export function runCensus(db: DB, opts: { days: number; now?: Date }): CensusResult {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - opts.days * 86_400_000).toISOString();

  // 1. Classify every NFL raw event in the window.
  const hits = new Map<string, { source_id: string; source_type: string; event_type: string; processed: number; headline: string; matches: ReturnType<typeof classifyTeamStoryTrigger> }>();
  let inWindow = 0;
  let multi = 0;
  const rawRows = db.prepare(`
    SELECT id, source_id, source_type, event_type, processed, payload
      FROM raw_events
     WHERE league = 'NFL' AND received_at >= ?
  `).iterate(cutoff) as Iterable<{ id: string; source_id: string; source_type: string; event_type: string; processed: number; payload: string }>;
  for (const r of rawRows) {
    inWindow++;
    let payload: unknown = {};
    try { payload = JSON.parse(r.payload ?? "{}"); } catch { /* unparseable payload: classify as empty */ }
    const matches = classifyTeamStoryTrigger({ league: "NFL", source_id: r.source_id, source_type: r.source_type, event_type: r.event_type, payload });
    if (!matches.length) continue;
    if (matches.length > 1) multi++;
    const p = payload as Record<string, unknown>;
    const headline = String(p.headline ?? p.notes ?? "").replace(/\s+/g, " ").slice(0, 140);
    hits.set(r.id, { source_id: r.source_id, source_type: r.source_type, event_type: r.event_type, processed: r.processed, headline, matches });
  }

  // 2. Which situation each tagged event landed in.
  const situationTables = hasTable(db, "situations") && hasTable(db, "situation_events");
  const eventSituation = new Map<string, { situation_id: string; situation_type: string; kind: string }>();
  if (situationTables && hits.size) {
    const situations = db.prepare(`SELECT situation_id, situation_type FROM situations WHERE league = 'NFL'`).all() as Array<{ situation_id: string; situation_type: string }>;
    const eventsFor = db.prepare(`
      SELECT raw_event_id, kind
        FROM situation_events
       WHERE situation_id = ? AND recorded_at >= ?
         AND kind IN ('situation_created', 'situation_matched')
    `);
    for (const s of situations) {
      for (const e of eventsFor.all(s.situation_id, cutoff) as Array<{ raw_event_id: string | null; kind: string }>) {
        if (!e.raw_event_id || !hits.has(e.raw_event_id) || eventSituation.has(e.raw_event_id)) continue;
        eventSituation.set(e.raw_event_id, { situation_id: s.situation_id, situation_type: s.situation_type, kind: e.kind });
      }
    }
  }

  // 3. Public confirmations (one row per situation, PK situation_id).
  const confirmations = new Map<string, { raw_event_id: string | null; source_name: string }>();
  if (hasTable(db, "situation_public_confirmations")) {
    for (const c of db.prepare(`SELECT situation_id, raw_event_id, source_name FROM situation_public_confirmations`).all() as Array<{ situation_id: string; raw_event_id: string | null; source_name: string }>) {
      confirmations.set(c.situation_id, { raw_event_id: c.raw_event_id, source_name: c.source_name });
    }
  }

  const triggers = Object.fromEntries(TEAM_STORY_TRIGGERS.map(t => [t, emptyTrigger()])) as Record<TeamStoryTrigger, TriggerCensus>;
  const situationSets = new Map<TeamStoryTrigger, { all: Set<string>; confirmed: Set<string> }>(
    TEAM_STORY_TRIGGERS.map(t => [t, { all: new Set<string>(), confirmed: new Set<string>() }]),
  );

  for (const [rawId, h] of hits) {
    const sit = eventSituation.get(rawId);
    const conf = sit ? confirmations.get(sit.situation_id) : undefined;
    for (const m of h.matches) {
      const c = triggers[m.trigger];
      const sets = situationSets.get(m.trigger)!;
      c.detected++;
      bump(c.by_evidence, m.evidence);
      bump(c.by_pattern, m.pattern);
      bump(c.by_source_type, h.source_type);
      bump(c.by_event_type, h.event_type);
      if (!h.processed) c.unprocessed++;
      const samples = (c.samples[m.pattern] ??= []);
      if (samples.length < 3) samples.push({ raw_event_id: rawId, source_id: h.source_id, field: m.field, matched: m.matched, headline: h.headline });

      if (!sit) { c.situation.no_situation++; continue; }
      c.situation.with_situation++;
      bump(c.situation.by_situation_type, sit.situation_type);
      if (sit.kind === "situation_created") c.situation.founded++; else c.situation.matched_existing++;
      sets.all.add(sit.situation_id);

      if (conf) {
        c.public_confirmation.events_in_confirmed_situation++;
        if (conf.raw_event_id === rawId) c.public_confirmation.confirmed_by_this_event++;
        if (!sets.confirmed.has(sit.situation_id)) bump(c.public_confirmation.by_confirmation_source, conf.source_name);
        sets.confirmed.add(sit.situation_id);
      }
    }
  }
  for (const t of TEAM_STORY_TRIGGERS) {
    const sets = situationSets.get(t)!;
    triggers[t].situation.distinct_situations = sets.all.size;
    triggers[t].public_confirmation.distinct_confirmed_situations = sets.confirmed.size;
  }

  return {
    window: { days: opts.days, cutoff, now: now.toISOString() },
    nfl_raw_events_in_window: inWindow,
    nfl_raw_events_with_any_trigger: hits.size,
    multi_trigger_events: multi,
    situation_tables_present: situationTables,
    triggers,
  };
}

if (typeof require !== "undefined" && require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const dbPath = resolvePipelinePath();
    console.log(`pipeline.db: ${dbPath}`);
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      console.log(JSON.stringify(runCensus(db, { days: args.days }), null, 2));
    } finally {
      db.close();
    }
  } catch (err: any) {
    console.error(err?.message ?? err);
    process.exit(1);
  }
}
