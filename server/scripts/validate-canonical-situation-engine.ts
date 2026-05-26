import fs from "node:fs";
import path from "node:path";

const validationDir = path.resolve("C:/tmp/edgesetter-canonical-situation-engine-validation");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

async function main(): Promise<void> {
  const { runAllSituationValidations } = await import("../pipeline/situations-validation");

  const results = runAllSituationValidations();
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name} ${JSON.stringify(result.details)}`);
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

void main();
