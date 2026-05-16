import fs from "node:fs";
import path from "node:path";
import { exportReplayParityReport } from "../pipeline/replay-validation";

const outputDir = path.resolve(process.cwd(), "server/fixtures/replay");
const outputFile = path.join(outputDir, "replay-parity-baseline.json");

fs.mkdirSync(outputDir, { recursive: true });

const report = exportReplayParityReport();

fs.writeFileSync(
  outputFile,
  JSON.stringify(report, null, 2) + "\n",
  "utf8",
);

console.log(`Exported replay parity fixture: ${outputFile}`);
console.log(`Total: ${report.total}`);
console.log(`Matched: ${report.matched}`);
console.log(`Mismatched: ${report.mismatched}`);