/**
 * Seed 5 sample signals for the MVP launch board.
 * Run once on startup if no signals exist.
 */
import { storage } from "./storage";

export async function seedSignals() {
  if (storage.signalExists()) return;

  const signals = [
    {
      id: "sig-001",
      title: "Mahomes full go after mid-week ankle scare",
      slug: "mahomes-full-go-ankle",
      player_name: "Patrick Mahomes",
      team: "KC Chiefs",
      signal_type: "Injury status",
      status_tag: "verified" as const,
      confidence_score: 92,
      source_count: 12,
      verdict: "Confirmed",
      summary:
        "Multiple KC beat writers confirm full participation in Friday practice after early-week limited tags.",
      action_takeaway: "Treat as full-go; downgrade mobility concern only.",
      published_at: new Date().toISOString(),
      is_featured: true,
      is_public: true,
    },
    {
      id: "sig-002",
      title: "WR1 snap share quietly overtakes veteran starter",
      slug: "wr1-snap-share-atl",
      player_name: "Example WR",
      team: "ATL",
      signal_type: "Role change",
      status_tag: "verified" as const,
      confidence_score: 88,
      source_count: 8,
      verdict: "Verified trend",
      summary:
        "Routes and snaps jump sharply over the last two games and coach quotes support the role shift.",
      action_takeaway: "Upgrade for DFS and deep leagues.",
      published_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      is_featured: false,
      is_public: true,
    },
    {
      id: "sig-003",
      title: "RB goal-line role now locked",
      slug: "rb-goalline-role-pit",
      player_name: "Example RB",
      team: "PIT",
      signal_type: "Usage shift",
      status_tag: "verified" as const,
      confidence_score: 86,
      source_count: 7,
      verdict: "Confirmed",
      summary:
        "Inside-the-5 workload is strongly skewed over the last three games.",
      action_takeaway: "Raise TD expectation; lower primary back ceiling.",
      published_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      is_featured: false,
      is_public: true,
    },
    {
      id: "sig-004",
      title: "Star WR active but carrying real re-injury risk",
      slug: "wr-reinjury-risk-sf",
      player_name: "Example WR",
      team: "SF",
      signal_type: "Injury risk",
      status_tag: "high-risk" as const,
      confidence_score: 84,
      source_count: 9,
      verdict: "Elevated concern",
      summary:
        "Limited lateral work and local medical concern suggest a decoy or reduced-load game.",
      action_takeaway: "Fade overs and reduce DFS exposure.",
      published_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      is_featured: false,
      is_public: true,
    },
    {
      id: "sig-005",
      title: "QB bench watch after bye",
      slug: "qb-bench-watch-lv",
      player_name: "Example QB",
      team: "LV",
      signal_type: "Depth chart risk",
      status_tag: "speculative" as const,
      confidence_score: 78,
      source_count: 6,
      verdict: "Elevated speculation",
      summary:
        "Reports suggest split reps and non-committal coach language.",
      action_takeaway: "Prepare contingency moves in superflex formats.",
      published_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      is_featured: false,
      is_public: true,
    },
  ];

  for (const s of signals) {
    try {
      storage.createSignal(s);
    } catch (e) {
      // already exists
    }
  }

  // Add source notes for the featured signal (Pro-only detail)
  const notes = [
    {
      signal_id: "sig-001",
      source_name: "Adam Schefter",
      source_type: "reporter",
      trust_score: 95,
      note: "Full practice participation confirmed. No mobility limitation observed.",
    },
    {
      signal_id: "sig-001",
      source_name: "NFL Network",
      source_type: "official",
      trust_score: 90,
      note: "Official injury report: full participant Friday.",
    },
    {
      signal_id: "sig-001",
      source_name: "KC Star Beat",
      source_type: "reporter",
      trust_score: 80,
      note: "Mahomes ran routes at full speed. No protective gear visible.",
    },
  ];

  for (const n of notes) {
    try {
      storage.createSourceNote({ ...n, id: `note-${n.signal_id}-${n.source_name.replace(/\s/g, "")}` });
    } catch (e) {}
  }

  console.log("[seed] 5 signals seeded");
}
