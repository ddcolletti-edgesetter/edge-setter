/**
 * Edge Setter - ESPN NFL Transactions Adapter
 *
 * Source: https://site.api.espn.com (free, no key required)
 * Provides: NFL roster moves when ESPN exposes current transaction rows.
 */

import { insertRawEvent, getRawEvents } from "../store";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const CURRENT_TRANSACTION_MAX_AGE_DAYS = 14;
let lastTransactionFetchReachable = false;

interface ESPNTransactionAthlete {
  displayName?: string;
  position?: { abbreviation?: string };
}

interface ESPNTeamRef {
  abbreviation?: string;
  displayName?: string;
}

interface ESPNTransactionItem {
  athlete?: ESPNTransactionAthlete;
  type?: string;
  description?: string;
  date?: string;
  team?: ESPNTeamRef;
}

interface ESPNTransactionGroup {
  team?: ESPNTeamRef;
  items?: ESPNTransactionItem[];
  athlete?: ESPNTransactionAthlete;
  type?: string;
  description?: string;
  date?: string;
}

interface ESPNTransactionsResponse {
  transactions?: ESPNTransactionGroup[];
}

export interface ESPNTransactionDiagnostics {
  source_reachable: boolean;
  payload_rows_seen: number;
  rows_normalized: number;
  rows_skipped_stale: number;
  rows_skipped_missing_required: number;
  raw_events_created: number;
}

const TYPE_FROM_DESCRIPTION: Array<[RegExp, string]> = [
  [/\btraded?\b/i, "Trade"],
  [/\bsigned\b/i, "Signed"],
  [/\breleased\b/i, "Released"],
  [/\bwaived\b/i, "Waived"],
  [/\bclaimed\b/i, "WaivedClaimed"],
  [/\bselected\b|\bdraft/i, "Draft"],
];

function confidenceFor(type: string): number {
  if (type === "Draft" || type === "Trade") return 90;
  if (type === "Signed" || type === "WaivedClaimed") return 84;
  return 78;
}

function notesFor(player: string | null, team: string, type: string, description?: string): string {
  if (description) return description;
  const subject = player ?? team;
  return `${subject} - ${type} transaction confirmed by ESPN.`;
}

function actionFor(type: string, player: string | null): string {
  const subject = player ?? "the affected roster";
  if (type === "Trade") return `Reassess role projections for ${subject}; roster construction changed.`;
  if (type === "Signed" || type === "WaivedClaimed") return `Monitor depth chart impact for ${subject}.`;
  if (type === "Released" || type === "Waived") return `Watch follow-on roster moves tied to ${subject}.`;
  return `Monitor roster construction impact from ${type}.`;
}

function inferTransactionType(description?: string, explicitType?: string): string {
  if (explicitType) return explicitType;
  for (const [pattern, type] of TYPE_FROM_DESCRIPTION) {
    if (pattern.test(description ?? "")) return type;
  }
  return "RosterMove";
}

export function isCurrentESPNTransaction(date: string | undefined, maxAgeDays = CURRENT_TRANSACTION_MAX_AGE_DAYS, now = new Date()): boolean {
  if (!date) return false;
  const time = Date.parse(date);
  if (!Number.isFinite(time)) return false;
  const ageMs = now.getTime() - time;
  return ageMs >= 0 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

export function normalizeESPNNFLTransactionRows(rows: ESPNTransactionGroup[] = []): ESPNTransactionItem[] {
  const normalized: ESPNTransactionItem[] = [];
  for (const row of rows) {
    if (Array.isArray(row.items)) {
      for (const item of row.items) {
        normalized.push({ ...item, team: item.team ?? row.team });
      }
      continue;
    }
    normalized.push({
      athlete: row.athlete,
      type: row.type,
      description: row.description,
      date: row.date,
      team: row.team,
    });
  }
  return normalized;
}

async function fetchNFLTransactions(): Promise<ESPNTransactionItem[]> {
  try {
    const resp = await fetch(`${ESPN_BASE}/transactions`);
    if (!resp.ok) {
      lastTransactionFetchReachable = false;
      console.error(`[espn-nfl-tx] HTTP ${resp.status} fetching transactions`);
      return [];
    }
    lastTransactionFetchReachable = true;
    const data = await resp.json() as ESPNTransactionsResponse;
    return normalizeESPNNFLTransactionRows(data.transactions);
  } catch (err: any) {
    lastTransactionFetchReachable = false;
    console.error("[espn-nfl-tx] Fetch error:", err.message);
    return [];
  }
}

export async function ingestNFLTransactions(): Promise<{ created: number; skipped: number; diagnostics: ESPNTransactionDiagnostics }> {
  const transactions = await fetchNFLTransactions();
  let created = 0;
  let skipped = 0;
  const diagnostics: ESPNTransactionDiagnostics = {
    source_reachable: lastTransactionFetchReachable,
    payload_rows_seen: transactions.length,
    rows_normalized: transactions.length,
    rows_skipped_stale: 0,
    rows_skipped_missing_required: 0,
    raw_events_created: 0,
  };

  const recentEvents = getRawEvents({ league: "NFL", limit: 1000 });
  const existingKeys = new Set(
    recentEvents
      .filter(e => e.event_type === "transaction")
      .map(e => `${e.team}_${e.player ?? "team"}_${(e.payload as any).transaction_type}_${(e.payload as any).date ?? ""}_${(e.payload as any).description_hash ?? ""}`)
  );

  for (const item of transactions) {
    const txDate = item.date;
    const team = item.team?.abbreviation ?? "UNK";
    const description = item.description;
    const playerName = item.athlete?.displayName ?? null;

    if (!description && !playerName) {
      diagnostics.rows_skipped_missing_required++;
      skipped++;
      continue;
    }
    if (!isCurrentESPNTransaction(txDate)) {
      diagnostics.rows_skipped_stale++;
      skipped++;
      continue;
    }

    const txType = inferTransactionType(description, item.type);
    const descriptionHash = Buffer.from(description ?? playerName ?? "").toString("base64").slice(0, 24);
    const key = `${team}_${playerName ?? "team"}_${txType}_${txDate?.slice(0, 10) ?? ""}_${descriptionHash}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    const confidence = confidenceFor(txType);
    const notes = notesFor(playerName, team, txType, description);

    insertRawEvent({
      source_id: "espn",
      source_type: "api",
      league: "NFL",
      game_id: null,
      team,
      player: playerName,
      event_type: "transaction",
      payload: {
        transaction_type: txType,
        date: txDate?.slice(0, 10) ?? "",
        occurred_at: txDate,
        event_time: txDate,
        description_hash: descriptionHash,
        position: item.athlete?.position?.abbreviation ?? "",
        notes,
        action_note: actionFor(txType, playerName),
        why_it_matters: `${txType} changes roster availability and may affect depth chart expectations.`,
        confidence,
        confirmation: "Developing",
        source_types: ["sports_api"],
        source_labels: ["ESPN NFL"],
        source_count: 1,
        sources: [{ name: "ESPN NFL", type: "sports_api" }],
      },
    }, { eventTime: txDate });

    created++;
    diagnostics.raw_events_created++;
    existingKeys.add(key);
  }

  console.log(`[espn-nfl-tx] NFL transactions diagnostics: ${JSON.stringify(diagnostics)}`);
  return { created, skipped, diagnostics };
}
