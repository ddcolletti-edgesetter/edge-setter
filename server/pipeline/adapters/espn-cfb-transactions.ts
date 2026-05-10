/**
 * Edge Setter — ESPN CFB Transactions Adapter
 *
 * Source: https://site.api.espn.com  (free, no key required)
 * Provides: CFB transfer portal moves, signings, depth chart transactions
 *
 * NOTE: This endpoint is untested. ESPN's college-football/transactions
 * response shape may differ from the NFL equivalent, and it is unclear
 * whether transfer portal entries are included or only official roster
 * moves. If the endpoint returns empty or 404, ingest silently no-ops.
 *
 * Runs year-round — transfer portal activity peaks Jan–Apr and May–Jul.
 *
 * Maps each transaction to a `transaction` RawEvent consumed by
 * processor.ts → handleTransaction().
 */

import { insertRawEvent, getRawEvents } from "../store";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";

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
  "Transfer",
  "TransferPortal",
  "Signed",
  "NationalLetterOfIntent",
  "Committed",
  "Decommitted",
  "GrayshirtCommitment",
  "WalkOn",
  "Released",
]);

function confidenceFor(type: string): number {
  if (type === "Transfer" || type === "TransferPortal") return 88;
  if (type === "NationalLetterOfIntent" || type === "Signed") return 92;
  if (type === "Committed") return 75;
  if (type === "Decommitted") return 85;
  return 78;
}

function notesFor(player: string, team: string, type: string, description?: string): string {
  if (description) return description;
  const labels: Record<string, string> = {
    Transfer:              `${player} entering transfer portal — destination TBD.`,
    TransferPortal:        `${player} in transfer portal, ${team} listed as destination.`,
    Signed:                `${player} signed with ${team}.`,
    NationalLetterOfIntent:`${player} signed National Letter of Intent with ${team}.`,
    Committed:             `${player} committed to ${team}.`,
    Decommitted:           `${player} decommitted — now open to other programs.`,
    GrayshirtCommitment:   `${player} signed greyshirt agreement with ${team}.`,
    WalkOn:                `${player} joining ${team} as walk-on.`,
    Released:              `${player} released from scholarship by ${team}.`,
  };
  return labels[type] ?? `${player} — ${type} (${team})`;
}

function actionFor(type: string, player: string, team: string): string {
  if (type === "Transfer" || type === "TransferPortal")
    return `Monitor ${player}'s destination — landing spot determines immediate fantasy/DFS value.`;
  if (type === "NationalLetterOfIntent" || type === "Signed")
    return `${player} locks in at ${team} — evaluate early-enroll potential and spring depth chart impact.`;
  if (type === "Committed")
    return `Soft commitment — track until NLI signing. Decommitment risk remains.`;
  if (type === "Decommitted")
    return `${player} back on the board — top programs likely to pursue immediately.`;
  return `Monitor roster construction impact from ${type} at ${team}.`;
}

/* ─── Fetch transactions ──────────────────────────────────── */

async function fetchCFBTransactions(): Promise<ESPNTransactionGroup[]> {
  try {
    const resp = await fetch(`${ESPN_BASE}/transactions`);
    if (!resp.ok) {
      // 404 is expected if ESPN doesn't support this endpoint for CFB — silent no-op
      if (resp.status !== 404) {
        console.error(`[espn-cfb-tx] HTTP ${resp.status} fetching transactions`);
      }
      return [];
    }
    const data = await resp.json() as ESPNTransactionsResponse;
    return data.transactions ?? [];
  } catch (err: any) {
    console.error("[espn-cfb-tx] Fetch error:", err.message);
    return [];
  }
}

/* ─── Ingest CFB transactions ─────────────────────────────── */

export async function ingestCFBTransactions(): Promise<{ created: number; skipped: number }> {
  const groups = await fetchCFBTransactions();
  let created = 0;
  let skipped = 0;

  if (groups.length === 0) {
    console.log("[espn-cfb-tx] No CFB transactions returned (endpoint may not support this league)");
    return { created: 0, skipped: 0 };
  }

  // Dedup against recent unprocessed transaction events
  const recentEvents = getRawEvents({ league: "CFB", processed: false, limit: 500 });
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
        league:      "CFB",
        game_id:     null,
        team,
        player:      playerName,
        event_type:  "transaction",
        payload: {
          transaction_type:  txType,
          date:              txDate,
          position,
          notes,
          action_note:       actionFor(txType, playerName, team),
          why_it_matters:    `${txType} directly impacts ${playerName}'s role and team depth chart heading into next season.`,
          confidence,
          confirmation:      "Consensus",
          source_types:      ["official report"],
          source_labels:     ["ESPN / NCAA Official"],
          source_count:      1,
          sources:           [{ name: "ESPN", type: "official report" }],
        },
      });

      created++;
      existingKeys.add(key);
    }
  }

  console.log(`[espn-cfb-tx] CFB transactions: ${created} created, ${skipped} skipped`);
  return { created, skipped };
}
