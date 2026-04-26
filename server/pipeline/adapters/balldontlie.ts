/**
 * Edge Setter — BallDontLie NBA Adapter  (Sprint 7)
 *
 * Source: https://www.balldontlie.io  (free tier, no key required for basic endpoints)
 * Provides: player injury reports, game status, player stats
 *
 * Env: BALLDONTLIE_API_KEY  (optional — free tier works without)
 *
 * Fetches active NBA injuries and normalizes them into RawEvents
 * of type "injury_update".
 */

import { insertRawEvent, getRawEvents } from "../store";

const BASE_URL = "https://api.balldontlie.io/v1";
const API_KEY  = process.env.BALLDONTLIE_API_KEY ?? "";

interface BDLInjury {
  id: number;
  player: { id: number; first_name: string; last_name: string; team_id: number };
  team: { id: number; abbreviation: string; full_name: string };
  status: string;           // "Out" | "Day-To-Day" | "Questionable"
  comment: string | null;
  created_at: string;
  updated_at: string;
}

interface BDLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  team: { id: number; abbreviation: string };
}

/* ─── Fetch all active injuries ──────────────────────────── */

export async function fetchNBAInjuries(): Promise<BDLInjury[]> {
  try {
    const headers: Record<string, string> = API_KEY ? { Authorization: API_KEY } : {};
    const resp = await fetch(`${BASE_URL}/player_injuries?per_page=100`, { headers });
    if (!resp.ok) {
      console.error(`[balldontlie] HTTP ${resp.status} fetching injuries`);
      return [];
    }
    const data = await resp.json() as { data: BDLInjury[] };
    return data.data ?? [];
  } catch (err: any) {
    console.error("[balldontlie] Fetch error:", err.message);
    return [];
  }
}

/* ─── Normalize BDL status → our designation ─────────────── */

function normalizeDesignation(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("out"))           return "OUT";
  if (s.includes("day-to-day"))    return "Questionable";
  if (s.includes("questionable"))  return "Questionable";
  if (s.includes("doubtful"))      return "Doubtful";
  if (s.includes("probable"))      return "Probable";
  return status;
}

/* ─── Ingest NBA injuries ─────────────────────────────────── */

export async function ingestNBAInjuries(): Promise<{ created: number; skipped: number }> {
  const injuries = await fetchNBAInjuries();
  let created = 0;
  let skipped = 0;

  // De-dup: check if we already have a recent RawEvent for this player+status
  const recentEvents = getRawEvents({ league: "NBA", processed: false, limit: 500 });
  const existingKeys = new Set(
    recentEvents
      .filter(e => e.event_type === "injury_update")
      .map(e => `${e.player}_${(e.payload as any).designation}`)
  );

  for (const inj of injuries) {
    const playerName = `${inj.player.first_name} ${inj.player.last_name}`;
    const team = inj.team.abbreviation;
    const designation = normalizeDesignation(inj.status);
    const key = `${playerName}_${designation}`;

    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    const isHighImpact = designation === "OUT" || designation === "Doubtful";
    const confidence = isHighImpact ? 85 : 65;

    insertRawEvent({
      source_id: "balldontlie",
      source_type: "api",
      league: "NBA",
      game_id: null,
      team,
      player: playerName,
      event_type: "injury_update",
      payload: {
        designation,
        status: inj.status,
        body_part: inj.comment ?? "undisclosed",
        notes: inj.comment ?? `${playerName} listed ${designation}.`,
        confidence,
        confirmation: isHighImpact ? "Corroborated" : "Developing",
        source_types: ["official report"],
        source_labels: ["BallDontLie / Team Official"],
        source_count: 1,
        sources: [{ name: "BallDontLie", type: "official report" }],
        bdl_injury_id: inj.id,
        updated_at: inj.updated_at,
      },
    });
    created++;
    existingKeys.add(key); // prevent duplicates within the same batch
  }

  console.log(`[balldontlie] NBA injuries: ${created} created, ${skipped} skipped`);
  return { created, skipped };
}

/* ─── Fetch today's NBA lineups (starter confirmations) ───── */

export async function fetchNBALineups(gameId: string): Promise<{ starters: BDLPlayer[]; bench: BDLPlayer[] }> {
  // BallDontLie free tier doesn't expose live lineup confirmations yet.
  // This is a placeholder for when the endpoint is available or a premium key is used.
  // For now: return empty and rely on operator manual entries.
  console.log(`[balldontlie] Lineup fetch for game ${gameId} — endpoint requires premium key (stub)`);
  return { starters: [], bench: [] };
}
