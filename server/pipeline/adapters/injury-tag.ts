/**
 * Edge Setter — Injury body-part tag extraction
 *
 * Some injury sources (BallDontLie's `comment`, ESPN's `shortComment` /
 * `longComment`) expose only free-text prose, not a structured body-part field.
 * When that prose is interpolated straight into a headline —
 * `${player} (${bodyPart}) — ${designation}` (server/pipeline/processor.ts) —
 * a whole sentence leaks into the parenthetical, e.g.
 *   "Henri Veesaar (Veesaar was diagnosed with a torn right ACL ... Monday.) — OUT"
 * instead of the intended
 *   "Henri Veesaar (ACL) — OUT".
 *
 * `shortInjuryTag` reduces such input to a safe short tag. It deliberately does
 * NOT try to parse arbitrary free text into a clean noun phrase — it either
 * finds a known injury/body-part term, accepts input that is already tag-like,
 * or falls back to "undisclosed". The one job is: never let a full sentence
 * reach a headline.
 */

/** Fallback tag when nothing safe can be extracted. */
export const UNDISCLOSED = "undisclosed";

// Known body-part / injury terms, multi-word first so "high ankle" wins over
// "ankle", "hip flexor" over "hip", etc. Matched case-insensitively as whole
// words against the free text.
const INJURY_TERMS: readonly string[] = [
  "rotator cuff", "plantar fascia", "high ankle", "turf toe", "hip flexor",
  "acl", "mcl", "pcl", "ucl",
  "achilles", "hamstring", "quadriceps", "quad", "groin", "calf", "ankle",
  "knee", "kneecap", "patella", "meniscus", "shoulder", "labrum", "elbow",
  "forearm", "wrist", "thumb", "finger", "hand", "biceps", "triceps",
  "pectoral", "oblique", "abdominal", "hip", "glute", "adductor", "back",
  "spine", "neck", "clavicle", "collarbone", "rib", "ribs", "chest", "heel",
  "shin", "thigh", "foot", "toe", "fibula", "tibia", "femur", "concussion",
  "illness", "fracture", "sprain", "strain",
];

/** Escape a term for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Injury acronyms that should render fully upper-case (ACL, not Acl). */
const ACRONYMS = new Set(["acl", "mcl", "pcl", "ucl"]);

/** Format a term: acronyms upper-case, everything else title-cased. */
function formatTerm(term: string): string {
  if (ACRONYMS.has(term.toLowerCase())) return term.toUpperCase();
  return term.charAt(0).toUpperCase() + term.slice(1);
}

/**
 * Reduce a possibly sentence-length injury string to a short body-part tag.
 *
 * @param raw     Free-text or already-short body-part string (may be null).
 * @param maxLen  Length cap above which raw passthrough is refused (default 30).
 * @returns       A short tag, or "undisclosed" when nothing safe can be derived.
 */
export function shortInjuryTag(raw: string | null | undefined, maxLen = 30): string {
  if (!raw) return UNDISCLOSED;
  const text = raw.trim();
  if (!text) return UNDISCLOSED;

  // 1) Prefer a known injury/body-part term extracted from the text. This turns
  //    "...diagnosed with a torn right ACL..." into "ACL".
  const lower = text.toLowerCase();
  for (const term of INJURY_TERMS) {
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
    if (re.test(lower)) return formatTerm(term);
  }

  // 2) No known term. Accept the value only if it is already tag-like: short,
  //    few words, and not a sentence. Otherwise refuse it.
  const words = text.split(/\s+/);
  const looksLikeSentence = /[.!?]/.test(text);
  if (text.length <= maxLen && words.length <= 4 && !looksLikeSentence) {
    return text;
  }

  return UNDISCLOSED;
}
