import fs from "node:fs";
import path from "node:path";
import { exportReplayParityReport } from "../pipeline/replay-validation";
import { diffReplayResponses } from "../pipeline/replay-diff";

const fixturePath = path.resolve(
  process.cwd(),
  "server/fixtures/replay/replay-parity-baseline.json",
);

if (!fs.existsSync(fixturePath)) {
  throw new Error(`Missing fixture: ${fixturePath}`);
}

const baseline = JSON.parse(
  fs.readFileSync(fixturePath, "utf8"),
);

const current = exportReplayParityReport();

const diff = diffReplayResponses(
  baseline,
  current,
);

if (!diff.identical) {
  console.error("Replay fixture mismatch detected.");
  console.error(
    JSON.stringify(diff.differences.slice(0, 20), null, 2),
  );

  process.exit(1);
}

console.log("Replay fixture validation passed.");
console.log(`Integrity match: ${diff.integrity_match}`);
console.log(`Timeline match: ${diff.timeline_match}`);