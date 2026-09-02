/**
 * Replay the REAL scoreCandidate() on a failed-to-merge pair.
 * Run from repo root:  npx tsx client/score-pair.ts
 *
 * Paste the JSON from client/score-pair-extract.sql:
 *   - CANDIDATE_* comes from query (1)  (the situation row)
 *   - INCOMING_*  comes from query (2)  (the founding normalized_event)
 * Then this prints match_confidence + the full reasoning_breakdown for the real
 * production direction (B arrived second, A already existed): scoreCandidate(incomingB, candidateA).
 * Nothing is pasted yet -> it prints SKIPPED and a self-check that the import works.
 */
import { scoreCandidate, matchSituation } from "../server/pipeline/situations-matching";

// ─── PASTE query (1) rows here ───────────────────────────────────────────────
const CANDIDATE_A: any = /* sit_6f45... row json */ null;
const CANDIDATE_B: any = /* sit_9488... row json */ null;

// ─── PASTE query (2) normalized_events here ──────────────────────────────────
const INCOMING_A: any = /* sit_6f45... normalized_event json */ null;
const INCOMING_B: any = /* sit_9488... normalized_event json */ null;

function show(label: string, incoming: any, candidate: any) {
  if (!incoming || !candidate) { console.log(`\n${label}: SKIPPED (paste the JSON first)`); return; }
  const r = scoreCandidate(incoming, candidate);
  console.log(`\n${label}`);
  console.log(`  match_confidence = ${r.match_confidence}  (threshold 0.62; null-game floor would be 0.55)`);
  for (const f of r.reasoning_breakdown) {
    console.log(`   ${f.factor.padEnd(18)} score=${String(f.score).padEnd(6)} w=${f.weight}  contrib=${f.contribution}  ${f.reason}`);
  }
  const m = matchSituation(incoming, [candidate]);
  console.log(`  matchSituation -> ${m.matched_situation ? "MATCHED" : "NO MATCH"} @ ${m.match_confidence}`);
}

console.log(`import self-check: scoreCandidate is ${typeof scoreCandidate}, matchSituation is ${typeof matchSituation}`);
// Production direction: B is the second event, A already exists as the candidate.
show("scoreCandidate(incomingB, candidateA)  [prod direction]", INCOMING_B, CANDIDATE_A);
// Reverse, for symmetry.
show("scoreCandidate(incomingA, candidateB)  [reverse]", INCOMING_A, CANDIDATE_B);
