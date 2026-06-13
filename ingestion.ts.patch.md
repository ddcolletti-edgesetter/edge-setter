/**
 * INGESTION.TS — TWO CHANGES REQUIRED
 *
 * This file shows the exact lines to add/change. Do not paste this whole file —
 * apply the two diffs below to your existing ingestion.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CHANGE 1: Add import at top of file (after existing CFB imports, line ~13)
 *
 * BEFORE:
 *   import { ingestCFBTransactions } from "./adapters/espn-cfb-transactions";
 *
 * AFTER:
 *   import { ingestCFBTransactions } from "./adapters/espn-cfb-transactions";
 *   import { ingestCFBSchoolSIDFeeds } from "./adapters/cfb-school-sid";
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CHANGE 2: Add return type field + polling step inside runIngestionCycle()
 *
 * In the return type of runIngestionCycle(), add:
 *   cfb_sid: { created: number; skipped: number };
 *
 * Inside the function body, after the cfb_transactions block (step 5), add:
 *
 *   // ── 5b. CFB School SID feeds (eligibility rulings, roster decisions) ──
 *   // Closes the Sorsby gap. School SIDs are primary source — ESPN picks up
 *   // these events 20–60 minutes later. Year-round: covers spring ball,
 *   // summer eligibility rulings, fall roster decisions.
 *   let cfbSIDError: string | undefined;
 *   const cfb_sid = await ingestCFBSchoolSIDFeeds().catch(e => {
 *     cfbSIDError = e.message;
 *     console.error("[ingestion] CFB SID feeds error:", e.message);
 *     return { created: 0, skipped: 0 };
 *   });
 *
 *   logIngestion(
 *     "CFBSchoolSID",
 *     runId,
 *     "cfb-school-sources",
 *     `SID feeds: ${cfb_sid.created} created / ${cfb_sid.skipped} skipped across ${POWER4_SOURCES.length} schools`,
 *     cfbSIDError,
 *   );
 *
 * Then add cfb_sid to the return statement at the bottom of the try block:
 *   return {
 *     ...existingFields,
 *     cfb_sid,
 *   };
 *
 * And add a zero-value default in the early-return (_running guard) block:
 *   cfb_sid: { created: 0, skipped: 0 },
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CHANGE 3: Add POWER4_SOURCES import (needed for the log line above)
 *
 * BEFORE:
 *   import { ingestCFBSchoolSIDFeeds } from "./adapters/cfb-school-sid";
 *
 * AFTER:
 *   import { ingestCFBSchoolSIDFeeds } from "./adapters/cfb-school-sid";
 *   import { POWER4_SOURCES } from "./adapters/cfb-school-sources";
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * That is all. The SID adapter runs year-round inside the existing 15-minute
 * cycle. No new scheduler needed — eligibility rulings are rare enough that
 * per-cycle polling is appropriate and per-school fetches are fast (8s timeout,
 * fully concurrent across all schools).
 */

// ─── For reference: the complete block as it should look after patching ───────

/*
    // ── 5. NFL + CFB transactions (year-round: Draft, signings, cuts, transfers) ─
    let nflTxError: string | undefined;
    const nfl_transactions = await ingestNFLTransactions().catch(...);
    let cfbTxError: string | undefined;
    const cfb_transactions = await ingestCFBTransactions().catch(...);

    logIngestion("NFLCFBTransactions", ...);

    // ── 5b. CFB School SID feeds (eligibility rulings, roster decisions) ───────
    // Primary source for eligibility rulings. Wire services pick these up
    // 20–60 minutes later. This is the timing advantage for CFB.
    let cfbSIDError: string | undefined;
    const cfb_sid = await ingestCFBSchoolSIDFeeds().catch(e => {
      cfbSIDError = e.message;
      console.error("[ingestion] CFB SID feeds error:", e.message);
      return { created: 0, skipped: 0 };
    });

    logIngestion(
      "CFBSchoolSID",
      runId,
      "cfb-school-sources",
      `SID feeds: ${cfb_sid.created} created / ${cfb_sid.skipped} skipped across ${POWER4_SOURCES.length} schools`,
      cfbSIDError,
    );

    // ── 6. Process all new RawEvents ──────────────────────────────────────────
    ...
*/
