/**
 * Edge Setter - ESPN CFB Transactions Adapter
 *
 * Keeps CFB honest: ingest only current rows returned by ESPN. If ESPN exposes
 * no transactions, log diagnostics and leave live data empty.
 */

import { insertRawEvent, getRawEvents } from "../store";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
const CURRENT_TRANSACTION_MAX_AGE_DAYS = 14;
let lastTransactionFetchReachable = false;

const CFB_DISPLAY_TO_ABBR: Record<string, string> = {
  // SEC
  "alabama crimson tide": "ALA", "arkansas razorbacks": "ARK", "auburn tigers": "AUB",
  "florida gators": "FLA", "georgia bulldogs": "UGA", "kentucky wildcats": "UK",
  "lsu tigers": "LSU", "ole miss rebels": "MISS", "mississippi rebels": "MISS",
  "mississippi state bulldogs": "MSST", "missouri tigers": "MIZ", "oklahoma sooners": "OU",
  "south carolina gamecocks": "SC", "tennessee volunteers": "TENN", "texas longhorns": "TEX",
  "texas a&m aggies": "TAMU", "vanderbilt commodores": "VAN",
  // Big Ten
  "illinois fighting illini": "ILL", "indiana hoosiers": "IND", "iowa hawkeyes": "IOWA",
  "maryland terrapins": "MD", "michigan wolverines": "MICH", "michigan state spartans": "MSU",
  "minnesota golden gophers": "MINN", "nebraska cornhuskers": "NEB",
  "northwestern wildcats": "NU", "ohio state buckeyes": "OSU", "oregon ducks": "ORE",
  "penn state nittany lions": "PSU", "purdue boilermakers": "PUR",
  "rutgers scarlet knights": "RUT", "ucla bruins": "UCLA", "usc trojans": "USC",
  "washington huskies": "WASH", "wisconsin badgers": "WIS",
  // Big 12
  "arizona wildcats": "ARIZ", "arizona state sun devils": "ASU", "baylor bears": "BAY",
  "byu cougars": "BYU", "cincinnati bearcats": "CIN", "colorado buffaloes": "COL",
  "houston cougars": "HOU", "iowa state cyclones": "ISU", "kansas jayhawks": "KU",
  "kansas state wildcats": "KSU", "oklahoma state cowboys": "OKST",
  "tcu horned frogs": "TCU", "texas tech red raiders": "TTU", "ucf knights": "UCF",
  "utah utes": "UTAH", "west virginia mountaineers": "WVU",
  // ACC
  "boston college eagles": "BC", "california golden bears": "CAL",
  "clemson tigers": "CLEM", "duke blue devils": "DUKE",
  "florida state seminoles": "FSU", "georgia tech yellow jackets": "GT",
  "louisville cardinals": "LOU", "miami hurricanes": "MIA",
  "north carolina tar heels": "UNC", "nc state wolfpack": "NCST",
  "north carolina state wolfpack": "NCST", "pitt panthers": "PITT",
  "smu mustangs": "SMU", "stanford cardinal": "STAN", "syracuse orange": "SYR",
  "virginia cavaliers": "UVA", "virginia tech hokies": "VT",
  "wake forest demon deacons": "WAKE",
  // Independents
  "notre dame fighting irish": "ND", "uconn huskies": "UCONN",
  // AAC
  "army black knights": "ARMY", "charlotte 49ers": "CHAR", "ecu pirates": "ECU",
  "east carolina pirates": "ECU", "fau owls": "FAU",
  "florida atlantic owls": "FAU", "memphis tigers": "MEM",
  "navy midshipmen": "NAVY", "rice owls": "RICE", "temple owls": "TEMP",
  "tulane green wave": "TUL", "tulsa golden hurricane": "TULSA",
  "uab blazers": "UAB", "north texas mean green": "UNT",
  "usf bulls": "USF", "south florida bulls": "USF", "utsa roadrunners": "UTSA",
};

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

function confidenceFor(type: string): number {
  if (type === "EligibilityRuling") return 90;  // official rulings are nearly always confirmed
  if (type === "Transfer" || type === "TransferPortal") return 86;
  if (type === "NationalLetterOfIntent" || type === "Signed") return 88;
  if (type === "Committed") return 72;
  if (type === "Decommitted") return 82;
  return 74;
}

const ELIGIBILITY_PATTERN = /\beligib|\bwaiver\b|\breinstat|\bcleared to play\b|\bgranted eligibility\b|\bncaa approved\b|\btransfer waiver\b/i;

function inferTransactionType(description?: string, explicitType?: string): string {
  if (explicitType) return explicitType;
  const desc = description ?? "";
  if (ELIGIBILITY_PATTERN.test(desc)) return "EligibilityRuling";
  if (/\btransfer\b|\bportal\b/i.test(desc)) return "Transfer";
  if (/\bcommitted\b/i.test(desc)) return "Committed";
  if (/\bdecommitted\b/i.test(desc)) return "Decommitted";
  if (/\bsigned\b/i.test(desc)) return "Signed";
  return "RosterMove";
}

function actionFor(type: string, player: string | null, team: string): string {
  const subject = player ?? team;
  if (type === "EligibilityRuling") return `${subject} is immediately eligible — update depth chart exposure and DFS/betting lineups now.`;
  if (type === "Transfer" || type === "TransferPortal") return `Monitor ${subject} for depth chart and role impact.`;
  if (type === "Committed" || type === "Decommitted") return `Track recruiting status before treating ${subject} as stable roster context.`;
  return `Monitor roster construction impact from ${type}.`;
}

export function isCurrentESPNCFBTransaction(date: string | undefined, maxAgeDays = CURRENT_TRANSACTION_MAX_AGE_DAYS, now = new Date()): boolean {
  if (!date) return false;
  const time = Date.parse(date);
  if (!Number.isFinite(time)) return false;
  const ageMs = now.getTime() - time;
  return ageMs >= 0 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function resolveCFBTeamRef(ref: ESPNTeamRef | undefined): ESPNTeamRef | undefined {
  if (!ref) return undefined;
  if (ref.abbreviation) return ref;
  const abbr = CFB_DISPLAY_TO_ABBR[ref.displayName?.toLowerCase().trim() ?? ""];
  return abbr ? { ...ref, abbreviation: abbr } : ref;
}

export function normalizeESPNCFBTransactionRows(rows: ESPNTransactionGroup[] = []): ESPNTransactionItem[] {
  const normalized: ESPNTransactionItem[] = [];
  for (const row of rows) {
    const rowTeam = resolveCFBTeamRef(row.team);
    if (Array.isArray(row.items)) {
      for (const item of row.items) {
        normalized.push({ ...item, team: resolveCFBTeamRef(item.team) ?? rowTeam });
      }
      continue;
    }
    normalized.push({
      athlete: row.athlete,
      type: row.type,
      description: row.description,
      date: row.date,
      team: rowTeam,
    });
  }
  return normalized;
}

async function fetchCFBTransactions(): Promise<ESPNTransactionItem[]> {
  try {
    const resp = await fetch(`${ESPN_BASE}/transactions`);
    if (!resp.ok) {
      lastTransactionFetchReachable = false;
      if (resp.status !== 404) {
        console.error(`[espn-cfb-tx] HTTP ${resp.status} fetching transactions`);
      }
      return [];
    }
    lastTransactionFetchReachable = true;
    const data = await resp.json() as ESPNTransactionsResponse;
    return normalizeESPNCFBTransactionRows(data.transactions);
  } catch (err: any) {
    lastTransactionFetchReachable = false;
    console.error("[espn-cfb-tx] Fetch error:", err.message);
    return [];
  }
}

export async function ingestCFBTransactions(): Promise<{ created: number; skipped: number; diagnostics: ESPNTransactionDiagnostics }> {
  const transactions = await fetchCFBTransactions();
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

  if (transactions.length === 0) {
    console.log(`[espn-cfb-tx] CFB transactions diagnostics: ${JSON.stringify(diagnostics)}`);
    return { created: 0, skipped: 0, diagnostics };
  }

  const recentEvents = getRawEvents({ league: "CFB", limit: 1000 });
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
    if (!isCurrentESPNCFBTransaction(txDate)) {
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

    insertRawEvent({
      source_id: "espn",
      source_type: "api",
      league: "CFB",
      game_id: null,
      team,
      player: playerName,
      event_type: txType === "EligibilityRuling" ? "eligibility_ruling" : "transaction",
      payload: {
        transaction_type: txType,
        date: txDate?.slice(0, 10) ?? "",
        occurred_at: txDate,
        event_time: txDate,
        description_hash: descriptionHash,
        position: item.athlete?.position?.abbreviation ?? "",
        notes: description ?? `${playerName ?? team} - ${txType} transaction confirmed by ESPN.`,
        action_note: actionFor(txType, playerName, team),
        why_it_matters: `${txType} changes roster context and may affect depth chart expectations.`,
        confidence: confidenceFor(txType),
        confirmation: "Developing",
        source_types: ["sports_api"],
        source_labels: ["ESPN CFB"],
        source_count: 1,
        sources: [{ name: "ESPN CFB", type: "sports_api" }],
      },
    }, { eventTime: txDate });

    created++;
    diagnostics.raw_events_created++;
    existingKeys.add(key);
  }

  console.log(`[espn-cfb-tx] CFB transactions diagnostics: ${JSON.stringify(diagnostics)}`);
  return { created, skipped, diagnostics };
}
