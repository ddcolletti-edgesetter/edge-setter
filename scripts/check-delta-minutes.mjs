#!/usr/bin/env node
// ============================================================================
// check-delta-minutes.mjs
//
// SLO monitor for EdgeSetter's deltaMinutes (lead-time advantage).
//
// WHAT IT DOES
//   Calls the admin diagnostic endpoint
//     GET /api/pipeline/diagnostics/delta-minutes
//   on the running EdgeSetter service (which reads the SQLite pipeline.db on the
//   Render disk — a GitHub Actions runner cannot open that file directly, so we
//   poll over HTTPS instead). It then:
//     - logs the per-league distribution (median, p90, % under 10 min),
//     - asserts the SLO,
//     - exits non-zero on any error OR SLO breach so CI marks the run failed
//       (which is what triggers the alert).
//
// deltaMinutes = minutes EdgeSetter detected a situation BEFORE the public wire
// confirmed it. BIGGER IS BETTER — it is our edge. So the SLO is a FLOOR: we
// alert when the lead-time DROPS BELOW the threshold. (If you ever decide to
// treat it as a latency to cap instead, flip the comparator in checkSlo() and
// invert MIN_* below — see the note there.)
//
// HOW TO RUN AD-HOC (local, against prod):
//   EDGESETTER_BASE_URL="https://edge-setter.onrender.com" \
//   EDGESETTER_ADMIN_PASSWORD="<ADMIN_PASSWORD>" \
//   node scripts/check-delta-minutes.mjs
//
//   Override the SLO for a one-off run:
//   SLO_MIN_MEDIAN_MINUTES=5 SLO_MIN_P90_MINUTES=5 node scripts/check-delta-minutes.mjs
//
// EXIT CODES
//   0  all leagues meet the SLO (or warmup: capture healthy, nothing to fail on)
//   1  hard error (missing env, endpoint unreachable/non-200, endpoint reported
//      errors, capture not healthy) OR an SLO breach
//
// ENV
//   EDGESETTER_BASE_URL         required, e.g. https://edge-setter.onrender.com
//   EDGESETTER_ADMIN_PASSWORD   required, sent as `Authorization: Bearer <...>`
//   DELTA_MINUTES_ENDPOINT_PATH optional, default /api/pipeline/diagnostics/delta-minutes
//   SLO_MIN_MEDIAN_MINUTES      optional, default 10
//   SLO_MIN_P90_MINUTES         optional, default 10
//   SLO_SCOPE                   optional: "per_league" (default) | "overall"
//                               per_league: every league must meet the SLO
//                               overall:    only the ALL-leagues rollup is checked
// ============================================================================

// --- SLO configuration (see header for direction rationale) -----------------
const MIN_MEDIAN_MINUTES = numberEnv("SLO_MIN_MEDIAN_MINUTES", 10);
const MIN_P90_MINUTES = numberEnv("SLO_MIN_P90_MINUTES", 10);
const SLO_SCOPE = (process.env.SLO_SCOPE ?? "per_league").toLowerCase();

const BASE_URL = (process.env.EDGESETTER_BASE_URL ?? "").replace(/\/+$/, "");
const ADMIN_PASSWORD = process.env.EDGESETTER_ADMIN_PASSWORD ?? "";
const ENDPOINT_PATH = process.env.DELTA_MINUTES_ENDPOINT_PATH ?? "/api/pipeline/diagnostics/delta-minutes";

function numberEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) fail(`Env ${name}="${raw}" is not a number`);
  return n;
}

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

/**
 * Assert a single scope's (league or overall) stats against the SLO floor.
 * Returns an array of human-readable breach strings (empty = pass).
 *
 * DIRECTION: floor. A value BELOW the threshold is a breach.
 *   To treat deltaMinutes as a latency ceiling instead, change `< MIN_*` to
 *   `> MAX_*` here and rename the thresholds accordingly.
 */
function checkSlo(label, stats) {
  const breaches = [];
  if (stats.n === 0 || stats.median_minutes == null) {
    // No data for this scope — not a pass and not a value-breach; treat as a
    // soft skip. The capture-health gate already fails the run if the WHOLE
    // dataset is empty, so a single empty league here just means "no
    // confirmations for this league yet".
    return breaches;
  }
  if (stats.median_minutes < MIN_MEDIAN_MINUTES) {
    breaches.push(
      `${label}: median ${stats.median_minutes}m < ${MIN_MEDIAN_MINUTES}m floor`,
    );
  }
  if (stats.p90_minutes != null && stats.p90_minutes < MIN_P90_MINUTES) {
    breaches.push(
      `${label}: p90 ${stats.p90_minutes}m < ${MIN_P90_MINUTES}m floor`,
    );
  }
  return breaches;
}

function fmt(stats) {
  return (
    `n=${stats.n} ` +
    `median=${stats.median_minutes ?? "-"}m ` +
    `p90=${stats.p90_minutes ?? "-"}m ` +
    `min=${stats.min_minutes ?? "-"}m ` +
    `max=${stats.max_minutes ?? "-"}m ` +
    `%<10m=${stats.pct_under_10min ?? "-"}`
  );
}

async function main() {
  if (!BASE_URL) fail("EDGESETTER_BASE_URL is required (e.g. https://edge-setter.onrender.com)");
  if (!ADMIN_PASSWORD) fail("EDGESETTER_ADMIN_PASSWORD is required");

  const url = `${BASE_URL}${ENDPOINT_PATH}`;
  console.log(`▶ deltaMinutes SLO check`);
  console.log(`  endpoint : ${url}`);
  console.log(`  SLO floor: median >= ${MIN_MEDIAN_MINUTES}m, p90 >= ${MIN_P90_MINUTES}m (scope: ${SLO_SCOPE})`);

  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${ADMIN_PASSWORD}`, Accept: "application/json" },
      // Fail fast rather than hang a CI job on a cold/asleep Render instance.
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    fail(`Request to ${url} failed: ${err?.message ?? err}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    fail(`Endpoint returned HTTP ${res.status}. Body: ${body.slice(0, 500)}`);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    fail(`Endpoint did not return JSON: ${err?.message ?? err}`);
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    fail(`Endpoint reported errors: ${data.errors.join("; ")}`);
  }

  const capture = data.capture ?? {};
  console.log(`\n— capture health —`);
  console.log(`  generated_at       : ${data.generated_at ?? "?"}`);
  console.log(`  situations_rows    : ${capture.situations_rows ?? "?"}`);
  console.log(`  confirmations_rows : ${capture.confirmations_rows ?? "?"}`);
  console.log(`  healthy            : ${capture.healthy}`);
  console.log(`  note               : ${capture.note ?? ""}`);

  if (!capture.healthy) {
    fail(
      "Capture is not healthy — no deltaMinutes are being recorded yet. " +
      "Confirm CANONICAL_SITUATIONS_ENABLED=true in prod and allow a capture-and-wait period.",
    );
  }

  const leagues = Array.isArray(data.leagues) ? data.leagues : [];
  const overall = data.overall ?? { n: 0 };

  console.log(`\n— lead-time distribution —`);
  console.log(`  ALL       ${fmt(overall)}`);
  for (const lg of leagues) {
    console.log(`  ${String(lg.league).padEnd(8)}  ${fmt(lg)}`);
  }

  // --- SLO assertion ---
  let breaches = [];
  if (SLO_SCOPE === "overall") {
    breaches = checkSlo("ALL", overall);
  } else {
    for (const lg of leagues) breaches = breaches.concat(checkSlo(lg.league, lg));
  }

  if (breaches.length > 0) {
    console.error(`\n❌ SLO BREACH (${breaches.length}):`);
    for (const b of breaches) console.error(`   - ${b}`);
    process.exit(1);
  }

  console.log(`\n✅ deltaMinutes SLO met.`);
  process.exit(0);
}

main().catch((err) => fail(`Unexpected error: ${err?.stack ?? err}`));
