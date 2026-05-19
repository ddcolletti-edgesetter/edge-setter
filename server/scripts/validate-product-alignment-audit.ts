import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const AUDIT_DOC = path.join(ROOT, "docs", "EDGESETTER_PRODUCT_ALIGNMENT_AUDIT.md");
const RULES_DOC = path.join(ROOT, "docs", "EDGESETTER_PRODUCT_ALIGNMENT_RULES.md");

const REQUIRED_AUDIT_SECTIONS = [
  "Executive summary",
  "KEEP systems",
  "SIMPLIFY systems",
  "RENAME recommendations",
  "DEPRECATE recommendations",
  "REMOVE recommendations",
  "Product relevance score for each major subsystem, 0-5",
  "Risk assessment",
  "Recommended next 10 implementation priorities",
  "Files likely affected",
  "No-code-change cleanup plan",
  "Code-change cleanup plan",
] as const;

const REQUIRED_RULES_SECTIONS = [
  "Product Mission",
  "Required Product Impact",
  "Naming Rules",
  "Avoided Patterns",
  "Acceptance Standard",
  "Boundary Rules",
] as const;

const RISKY_TERMS = [
  "civilization",
  "geopolitical",
  "treaty",
  "diplomacy",
  "cold-war",
  "sanctions",
  "ideological",
  "empire",
  "species",
  "dynasty",
] as const;

type Classification = "allowed" | "needs_rename" | "needs_review" | "remove_candidate";

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly term: string;
  readonly classification: Classification;
  readonly text_hash: string;
}

const failures: string[] = [];

const audit = readRequired(AUDIT_DOC);
const rules = readRequired(RULES_DOC);

if (audit) verifySections(audit, REQUIRED_AUDIT_SECTIONS, AUDIT_DOC);
if (rules) verifySections(rules, REQUIRED_RULES_SECTIONS, RULES_DOC);

const findings = scanFiles([
  path.join(ROOT, "server", "pipeline"),
  path.join(ROOT, "server", "scripts"),
  path.join(ROOT, "docs"),
]);
const summary = summarize(findings);

const output = {
  ok: failures.length === 0,
  docs: {
    audit: relative(AUDIT_DOC),
    rules: relative(RULES_DOC),
  },
  required_sections: {
    audit: REQUIRED_AUDIT_SECTIONS.length,
    rules: REQUIRED_RULES_SECTIONS.length,
  },
  risky_terms: [...RISKY_TERMS],
  totals: summary,
  findings,
  failures,
};

console.log(JSON.stringify(output, null, 2));

if (failures.length > 0) {
  process.exit(1);
}

function readRequired(file: string): string | null {
  if (!fs.existsSync(file)) {
    failures.push(`Missing required doc: ${relative(file)}`);
    return null;
  }
  return fs.readFileSync(file, "utf8");
}

function verifySections(content: string, sections: readonly string[], file: string): void {
  for (const section of sections) {
    const pattern = new RegExp(`^##\\s+${escapeRegExp(section)}\\s*$`, "m");
    if (!pattern.test(content)) {
      failures.push(`Missing required section "${section}" in ${relative(file)}`);
    }
  }
}

function scanFiles(roots: readonly string[]): readonly Finding[] {
  const files = roots.flatMap((root) => listFiles(root))
    .filter((file) => /\.(ts|tsx|md)$/.test(file))
    .sort((left, right) => relative(left).localeCompare(relative(right)));
  const findings: Finding[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((lineText, index) => {
      const lower = lineText.toLowerCase();
      for (const term of RISKY_TERMS) {
        if (lower.includes(term)) {
          findings.push({
            file: relative(file),
            line: index + 1,
            term,
            classification: classify(file, lineText, term),
            text_hash: stableHash(`${relative(file)}:${index + 1}:${term}:${lineText.trim()}`),
          });
        }
      }
    });
  }
  return findings.sort((left, right) =>
    `${left.classification}:${left.term}:${left.file}:${left.line}`.localeCompare(`${right.classification}:${right.term}:${right.file}:${right.line}`),
  );
}

function listFiles(root: string): readonly string[] {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    if (entry.isFile()) return [full];
    return [];
  });
}

function classify(file: string, line: string, term: string): Classification {
  const rel = relative(file).replace(/\\/g, "/").toLowerCase();
  const text = line.toLowerCase();
  if (rel.startsWith("docs/")) return "allowed";
  if (rel.includes("validate-product-alignment-audit")) return "allowed";
  if (text.includes("translation") || text.includes("preferred")) return "allowed";
  if (["geopolitical", "treaty", "diplomacy", "cold-war", "sanctions", "ideological", "empire"].includes(term)) {
    return "remove_candidate";
  }
  if (["civilization", "species", "dynasty"].includes(term)) {
    return "needs_rename";
  }
  return "needs_review";
}

function summarize(findings: readonly Finding[]) {
  const byClassification: Record<Classification, number> = {
    allowed: 0,
    needs_rename: 0,
    needs_review: 0,
    remove_candidate: 0,
  };
  const byTerm = Object.fromEntries(RISKY_TERMS.map((term) => [term, 0])) as Record<typeof RISKY_TERMS[number], number>;
  for (const finding of findings) {
    byClassification[finding.classification] += 1;
    byTerm[finding.term as typeof RISKY_TERMS[number]] += 1;
  }
  return {
    findings: findings.length,
    by_classification: byClassification,
    by_term: byTerm,
  };
}

function relative(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
