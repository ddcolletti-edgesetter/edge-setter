// ─────────────────────────────────────────────────────────────────────────────
// FILE: server/pipeline/ingestion.ts
//
// Wire the X adapter into the ingestion cycle.
// THREE changes — import, calls, return type + value.
// ─────────────────────────────────────────────────────────────────────────────

// ── CHANGE 1 — Add import after the 247sports import (line 25) ───────────────

import { ingestXTier1, ingestXTier2 } from "./adapters/x-twitter";


// ── CHANGE 2 — Add to return type of runIngestionCycle() ─────────────────────
// Find where on3 and sports247 are in the return type and add after sports247:

  x_tier1: { created: number; skipped: number; noise: number; rate_limited: boolean };
  x_tier2: { created: number; skipped: number; noise: number; rate_limited: boolean } | null;


// ── CHANGE 3 — Add calls inside runIngestionCycle() ──────────────────────────
// Find the 247Sports logIngestion call (step 5d). Add this block AFTER it,
// BEFORE step 6 (Process all new RawEvents):

    // ── 5e. X/Twitter — Tier 1 nationals (every cycle) ────────────────────────
    let xTier1Error: string | undefined;
    const x_tier1 = await ingestXTier1().catch(e => {
      xTier1Error = e.message;
      console.error("[ingestion] X tier1 error:", e.message);
      return { created: 0, skipped: 0, noise: 0, rate_limited: false };
    });

    logIngestion(
      "XTier1",
      runId,
      "x.com",
      `X Tier1: ${x_tier1.created} created / ${x_tier1.skipped} skipped / ${x_tier1.noise} noise${x_tier1.rate_limited ? " [RATE LIMITED]" : ""}`,
      xTier1Error,
    );

    // ── 5f. X/Twitter — Tier 2 beats (active hours only, every other cycle) ───
    // Only run tier2 during active hours to conserve Basic tier rate budget.
    const hourET = (new Date().getUTCHours() - 5 + 24) % 24; // UTC-5 approx ET
    const isTier2Window = hourET >= 8 && hourET < 24;

    let x_tier2: { created: number; skipped: number; noise: number; rate_limited: boolean } | null = null;
    if (isTier2Window && !x_tier1.rate_limited) {
      let xTier2Error: string | undefined;
      x_tier2 = await ingestXTier2().catch(e => {
        xTier2Error = e.message;
        console.error("[ingestion] X tier2 error:", e.message);
        return { created: 0, skipped: 0, noise: 0, rate_limited: false };
      });

      logIngestion(
        "XTier2",
        runId,
        "x.com",
        `X Tier2: ${x_tier2.created} created / ${x_tier2.skipped} skipped / ${x_tier2.noise} noise${x_tier2.rate_limited ? " [RATE LIMITED]" : ""}`,
        xTier2Error,
      );
    }


// ── CHANGE 4 — Update early-exit return (the _running guard at top) ──────────
// Find the early return block. After sports247: { created: 0, skipped: 0 }, add:

      x_tier1: { created: 0, skipped: 0, noise: 0, rate_limited: false },
      x_tier2: null,


// ── CHANGE 5 — Update main return statement ───────────────────────────────────
// After sports247, add:

      x_tier1,
      x_tier2,


// ── CHANGE 6 — Update recordPipelineHealth call ───────────────────────────────
// After sports247_created, add:

      x_tier1_created: x_tier1.created,
      x_tier2_created: x_tier2?.created ?? 0,
