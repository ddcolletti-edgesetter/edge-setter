import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const BOUNDARY_DOC = path.join(ROOT, "docs", "EDGESETTER_ARCHITECTURE_BOUNDARIES.md");
const REMOVE_DOC = path.join(ROOT, "docs", "EDGESETTER_REMOVE_CANDIDATES.md");
const ALIAS_FILE = path.join(ROOT, "server", "pipeline", "replay-product-alignment-aliases.ts");

const REQUIRED_BOUNDARY_SECTIONS = [
  "Executive summary",
  "Core sports intelligence runtime",
  "Validator intelligence infrastructure",
  "Experimental simulation systems",
  "Boundary rules",
  "Import and route policy",
  "Naming and compatibility policy",
  "Validation expectations",
  "Migration path",
] as const;

const REQUIRED_REMOVE_SECTIONS = [
  "Executive summary",
  "Remove-candidate table",
  "Recommended actions",
  "Dependency notes",
  "Validation policy",
] as const;

const EXPECTED_DEPRECATED_FILES = [
  "server/pipeline/replay-historical-autonomous-league-contract.ts",
  "server/pipeline/replay-historical-autonomous-league.ts",
  "server/pipeline/replay-historical-autonomous-civilization-contract.ts",
  "server/pipeline/replay-historical-autonomous-civilization.ts",
  "server/pipeline/replay-civilization-meta-selection-contract.ts",
  "server/pipeline/replay-civilization-meta-selection.ts",
  "server/pipeline/replay-meta-civilization-governance-contract.ts",
  "server/pipeline/replay-meta-civilization-governance.ts",
] as const;

const EXPECTED_ALIASES = [
  "ReplayValidatorClusterSnapshot",
  "ReplayValidatorCohortSurvivalScore",
  "ReplaySpecializationProfileDivergenceRecord",
  "ReplayValidatorRetirementPrediction",
  "ReplayLiveRuntimeEligibilityGate",
  "ReplaySpecializationAdjustmentAnalytic",
  "ReplayConsensusCoordinationStabilityForecast",
  "ReplayValidatorClusterConsensusPolicySnapshot",
] as const;

interface SectionResult {
  readonly file: string;
  readonly required: readonly string[];
  readonly present: readonly string[];
  readonly missing: readonly string[];
}

const failures: string[] = [];

const boundaryDoc = readIfExists(BOUNDARY_DOC);
const removeDoc = readIfExists(REMOVE_DOC);
const aliasFile = readIfExists(ALIAS_FILE);

const boundarySections = verifySections(BOUNDARY_DOC, boundaryDoc, REQUIRED_BOUNDARY_SECTIONS);
const removeSections = verifySections(REMOVE_DOC, removeDoc, REQUIRED_REMOVE_SECTIONS);
const deprecatedAnnotations = verifyDeprecatedAnnotations();
const aliases = verifyAliases(aliasFile);

const output = {
  ok: failures.length === 0,
  docs: {
    architecture_boundaries: {
      file: relative(BOUNDARY_DOC),
      exists: boundaryDoc !== null,
    },
    remove_candidates: {
      file: relative(REMOVE_DOC),
      exists: removeDoc !== null,
    },
  },
  sections: {
    architecture_boundaries: boundarySections,
    remove_candidates: removeSections,
  },
  deprecated_annotations: deprecatedAnnotations,
  product_aligned_aliases: aliases,
  failures,
};

console.log(JSON.stringify(output, null, 2));

if (failures.length > 0) {
  process.exit(1);
}

function readIfExists(file: string): string | null {
  if (!fs.existsSync(file)) {
    failures.push(`Missing required file: ${relative(file)}`);
    return null;
  }
  return fs.readFileSync(file, "utf8");
}

function verifySections(file: string, content: string | null, required: readonly string[]): SectionResult {
  const present: string[] = [];
  const missing: string[] = [];
  if (content === null) {
    return { file: relative(file), required: [...required], present, missing: [...required] };
  }
  for (const section of required) {
    const sectionPattern = new RegExp(`^##\\s+${escapeRegExp(section)}\\s*$`, "m");
    if (sectionPattern.test(content)) {
      present.push(section);
    } else {
      missing.push(section);
      failures.push(`Missing required section "${section}" in ${relative(file)}`);
    }
  }
  return { file: relative(file), required: [...required], present, missing };
}

function verifyDeprecatedAnnotations() {
  const present: string[] = [];
  const missing: string[] = [];
  for (const relativeFile of EXPECTED_DEPRECATED_FILES) {
    const file = path.join(ROOT, relativeFile);
    if (!fs.existsSync(file)) {
      missing.push(relativeFile);
      failures.push(`Missing expected deprecated file: ${relativeFile}`);
      continue;
    }
    const content = fs.readFileSync(file, "utf8");
    if (content.includes("@deprecated")) {
      present.push(relativeFile);
    } else {
      missing.push(relativeFile);
      failures.push(`Missing @deprecated annotation in ${relativeFile}`);
    }
  }
  return {
    expected: [...EXPECTED_DEPRECATED_FILES],
    expected_count: EXPECTED_DEPRECATED_FILES.length,
    present,
    present_count: present.length,
    missing,
  };
}

function verifyAliases(content: string | null) {
  const present: string[] = [];
  const missing: string[] = [];
  if (content === null) {
    return {
      file: relative(ALIAS_FILE),
      expected: [...EXPECTED_ALIASES],
      present,
      missing: [...EXPECTED_ALIASES],
    };
  }
  for (const alias of EXPECTED_ALIASES) {
    if (content.includes(`export type ${alias}`)) {
      present.push(alias);
    } else {
      missing.push(alias);
      failures.push(`Missing product-aligned alias: ${alias}`);
    }
  }
  return {
    file: relative(ALIAS_FILE),
    expected: [...EXPECTED_ALIASES],
    present,
    missing,
  };
}

function relative(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
