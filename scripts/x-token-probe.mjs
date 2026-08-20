#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// X (Twitter) bearer-token probe
//
// Answers Task 1 directly: is TWITTER_BEARER_TOKEN present, and does X accept it?
// Makes ONE app-only-auth request and classifies the response so the failure
// mode is unambiguous (invalid token vs billing cap vs rate limit vs OK).
//
// It NEVER prints the token — only its length and a short SHA-256 fingerprint so
// you can confirm *which* token is loaded without exposing it.
//
// Run on the Render shell (env var already set there):
//     node scripts/x-token-probe.mjs
// Or locally (reads .env if present):
//     node scripts/x-token-probe.mjs
//
// Exit codes: 0 = token valid (200), 2 = token missing, 3 = X rejected it,
//             4 = other non-2xx, 5 = network error.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Lightweight .env loader (only for local runs; Render injects env directly).
function loadDotEnv() {
  try {
    const txt = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* no .env — fine, use real env */ }
}
loadDotEnv();

const token = process.env.TWITTER_BEARER_TOKEN;

if (!token) {
  console.error("✗ TWITTER_BEARER_TOKEN is NOT set in this environment.");
  console.error("  → On Render: Dashboard → service → Environment → add/verify the var.");
  process.exit(2);
}

const fp = createHash("sha256").update(token).digest("hex").slice(0, 12);
console.log(`token present: length=${token.length}, sha256[:12]=${fp} (value NOT shown)`);

// App-only-auth endpoint; a user lookup is cheap and validates the bearer token.
const url = "https://api.twitter.com/2/users/by/username/nflnetwork";

let res;
try {
  res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
} catch (err) {
  console.error(`✗ Network error reaching api.twitter.com: ${err.message}`);
  process.exit(5);
}

const rl = {
  limit: res.headers.get("x-rate-limit-limit"),
  remaining: res.headers.get("x-rate-limit-remaining"),
  reset: res.headers.get("x-rate-limit-reset"),
};
let bodyText = "";
try { bodyText = await res.text(); } catch { /* ignore */ }

console.log(`HTTP ${res.status} ${res.statusText}`);
console.log(`rate-limit: limit=${rl.limit ?? "?"} remaining=${rl.remaining ?? "?"} ` +
  `reset=${rl.reset ? new Date(Number(rl.reset) * 1000).toISOString() : "?"}`);
console.log(`body: ${bodyText.slice(0, 500)}`);

// ── Verdict ──
const s = res.status;
if (s === 200) {
  console.log("\n✓ VALID — X accepted the token. Ingestion auth is not the problem.");
  process.exit(0);
}
if (s === 401) {
  console.log("\n✗ INVALID / EXPIRED (401 Unauthorized) — regenerate the bearer token:");
  console.log("  developer.x.com → Projects & Apps → your app → Keys and tokens →");
  console.log("  'Bearer Token' → Regenerate, then update TWITTER_BEARER_TOKEN in Render.");
  process.exit(3);
}
if (s === 403) {
  console.log("\n✗ FORBIDDEN (403) — token authenticates but lacks access. Likely the app");
  console.log("  is suspended or on the wrong access tier (recent search needs a paid tier).");
  console.log("  Check developer.x.com app status & product access.");
  process.exit(3);
}
if (s === 402 || /usage.?cap/i.test(bodyText)) {
  console.log("\n✗ USAGE CAP / BILLING (402) — monthly post-read cap hit or billing lapsed.");
  console.log("  Token is valid; access is throttled at the account level. Check billing/usage.");
  process.exit(4);
}
if (s === 429) {
  console.log("\n⚠ RATE LIMITED (429) — token is valid; you hit the request window.");
  console.log("  Wait for the reset above and re-run. Not a token problem.");
  process.exit(4);
}
console.log(`\n✗ Unexpected status ${s}. See body above.`);
process.exit(4);
