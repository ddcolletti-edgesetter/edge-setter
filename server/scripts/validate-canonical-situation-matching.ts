import fs from "node:fs";
import path from "node:path";

const validationDir = path.resolve("C:/tmp/edgesetter-canonical-situation-matching-validation");
fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

async function main(): Promise<void> {
  const { validateCanonicalMatchingStability } = await import("../pipeline/situations-validation");

  const result = validateCanonicalMatchingStability();
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name} ${JSON.stringify(result.details)}`);
  if (!result.ok) process.exitCode = 1;
}

void main();
