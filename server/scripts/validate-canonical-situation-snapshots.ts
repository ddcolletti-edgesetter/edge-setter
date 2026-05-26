import fs from "node:fs";
import path from "node:path";

const validationDir = path.resolve("C:/tmp/edgesetter-canonical-situation-snapshots-validation");
fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

async function main(): Promise<void> {
  const { validateSnapshotIntegrity, validateAppendOnlyVerification } = await import("../pipeline/situations-validation");

  const results = [validateSnapshotIntegrity(), validateAppendOnlyVerification()];
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name} ${JSON.stringify(result.details)}`);
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

void main();
