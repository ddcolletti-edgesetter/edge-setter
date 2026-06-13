import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { storage } from "../../storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SourceSeed {
  source_id: string;
  name: string;
  type: "sid" | "beat_reporter" | "local_news" | "national_reporter";
  prior_accuracy: number;
  prior_sample_size: number;
  notes?: string;
}

interface TeamSeed {
  team_key: string;
  conference: string;
  primary_sources: SourceSeed[];
}

export async function seedCFBSources(): Promise<void> {
  const seedPath = path.join(__dirname, "cfb-source-seed.json");
  const seeds: TeamSeed[] = JSON.parse(fs.readFileSync(seedPath, "utf8"));

  let totalSeeded = 0;
  let totalSkipped = 0;

  for (const team of seeds) {
    let teamSeeded = 0;

    for (const src of team.primary_sources) {
      // Ensure source_scores row exists before we try to update team_accuracies
      storage.upsertSourceScore({
        source_id: src.source_id,
        source_name: src.name,
        overall_accuracy: String(src.prior_accuracy),
        sample_size: 0,
        team_accuracies: "{}",
      });

      // Idempotency: skip if this team's sample is already at or above the prior
      const existing = storage.getSourceTeamAccuracy(src.source_id, team.team_key);
      if (existing && existing.sampleSize >= src.prior_sample_size) {
        totalSkipped++;
        continue;
      }

      // Seed the running average: correctRounds "true" calls then the rest "false"
      const correctRounds = Math.round(src.prior_accuracy * src.prior_sample_size);

      for (let i = 0; i < src.prior_sample_size; i++) {
        storage.updateSourceTeamAccuracy(src.source_id, team.team_key, i < correctRounds);
      }

      teamSeeded++;
      totalSeeded++;
    }

    console.log(`[seed] ${team.team_key}: seeded ${teamSeeded} sources`);
  }

  console.log(
    `[seed] CFB bootstrap complete: ${totalSeeded} sources seeded across ${seeds.length} teams` +
    (totalSkipped > 0 ? ` (${totalSkipped} already-seeded skipped)` : ""),
  );
}
