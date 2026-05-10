/**
 * Edge Setter — ESPN NFL Transactions Adapter
 *
 * Source: https://site.api.espn.com  (free, no key required)
 * Provides: NFL Draft picks, free agent signings, cuts, waiver claims
 *
 * Runs year-round — covers Draft (Apr), undrafted free agent signings (May),
 * minicamp roster moves (Jun), and training camp cuts (Aug).
 *
 * Maps each transaction to a `transaction` RawEvent consumed by
 * processor.ts → handleTransaction().
 */

import { insertRawEvent, getRawEvents } from "../store";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

/* ─── Types ───────────────────────────────────────────────── */

interface ESPNTransactionAthlete {
  displayName?: string;
  position?: { abbreviation?: string };
}

interface ESPNTransactionItem {
  athlete?: ESPNTransactionAthlete;
  type?: string;
  description?: string;
  date?: string;
}

interface ESPNTransactionGroup {
  team?: { abbreviation?: string; displayName?: string };
  items?: ESPNTransactionItem[];
}

interface ESPNTransactionsResponse {
  transactions?: ESPNTransactionGroup[];
}

/* ─── Transaction types worth signalling ──────────────────── */

const SIGNAL_TYPES = new Set([
  "Draft",
  "Signed",
  "SignedToPracticeSquad",
  "Released",
  "Waived",
  "WaivedClaimed",
  "Trade",
]);

function confidenceFor(type: string): number {
  if (type === "Draft" || type === "Trade") return 92;
  if (type === "Signed" || type === "WaivedClaimed") return 88;
  return 82;
}

function notesFor(player: string, team: string, type: string, description?: string): string {
  if (description) return description;
  const labels: Record<string, string> = {
    Draft:               `${player} selected by ${team} in the NFL Draft.`,
    Signed:              `${player} signed by ${team}.`,
    SignedToPracticeSquad: `${player} signed to ${team} practice squad.`,
    Released:            `${player} released by ${team}.`,
    Waived:              `${player} waived by ${team}.`,
    WaivedClaimed:       `${player} claimed off waivers by ${team}.`,
    Trade:               `${player} traded to ${team}.`,
  };
  return labels[type] ?? `${player} — ${type} (${team})`;
}

function actionFor(type: string, player: string): string {
  if (type === "Draft")       return `Evaluate ${player}'s dynasty/rookie value — draft capital confirms team investment.`;
  if (type === "Trade")       return `Reassess target share and snap projections — roster construction changed.`;
  if (type === "Signed")      return `Monitor depth chart impact — new addition shifts role distribution.`;
  if (type === "WaivedClaimed") return `${player} changing teams — check usage opportunity on new roster.`;
  if (type === "Released" || type === "Waived") return `${player} now available — watch for follow-on signing impact.`;
  return `Monitor roster construction impact from ${type}.`;
}

/* ─── Fetch transactions ──────────────────────────────────── */

async function fetchNFLTransactions(): Promise<ESPNTransactionGroup[]> {
  try {
    const resp = await fetch(`${ESPN_BASE}/transactions`);
    if (!resp.ok) {
      console.error(`[espn-nfl-tx] HTTP ${resp.status} fetching transactions`);
      return [];
    }
    const data = await resp.json() as ESPNTransactionsResponse;
    return data.transactions ?? [];
  } catch (err: any) {
    console.error("[espn-nfl-tx] Fetch error:", err.message);
    return [];
  }
}

/* ─── Ingest NFL transactions ─────────────────────────────── */

export async function ingestNFLTransactions(): Promise<{ created: number; skipped: number }> {
  const groups = await fetchNFLTransactions();
  let created = 0;
  let skipped = 0;

  // Dedup against recent unprocessed transaction events
  const recentEvents = getRawEvents({ league: "NFL", processed: false, limit: 500 });
  const existingKeys = new Set(
    recentEvents
      .filter(e => e.event_type === "transaction")
      .map(e => `${e.player}_${(e.payload as any).transaction_type}_${(e.payload as any).date ?? ""}`)
  );

  for (const group of groups) {
    const team = group.team?.abbreviation ?? "UNK";

    for (const item of group.items ?? []) {
      const playerName = item.athlete?.displayName;
      if (!playerName) continue;

      const txType = item.type ?? "Unknown";
      if (!SIGNAL_TYPES.has(txType)) { skipped++; continue; }

      const txDate = item.date?.slice(0, 10) ?? "";
      const key = `${playerName}_${txType}_${txDate}`;
      if (existingKeys.has(key)) { skipped++; continue; }

      const position = item.athlete?.position?.abbreviation ?? "";
      const confidence = confidenceFor(txType);
      const notes = notesFor(playerName, team, txType, item.description);

      insertRawEvent({
        source_id:   "espn",
        source_type: "api",
        league:      "NFL",
        game_id:     null,
        team,
        player:      playerName,
        event_type:  "transaction",
        payload: {
          transaction_type:  txType,
          date:              txDate,
          position,
          notes,
          action_note:       actionFor(txType, playerName),
          why_it_matters:    `${txType} directly impacts ${playerName}'s role, target share, and market value.`,
          confidence,
          confirmation:      "Consensus",
          source_types:      ["official report"],
          source_labels:     ["ESPN / NFL Official"],
          source_count:      1,
          sources:           [{ name: "ESPN", type: "official report" }],
        },
      });

      created++;
      existingKeys.add(key);
    }
  }

  console.log(`[espn-nfl-tx] NFL transactions: ${created} created, ${skipped} skipped`);
  return { created, skipped };
}
