/**
 * V2Sources — thin wrapper around the existing SourceLeaderboard
 * to surface it inside the new v2 shell navigation.
 */
import V2Shell from "../components/V2Shell";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowRight, ExternalLink } from "lucide-react";

const T = {
  bg:         "#0A0B0D",
  surface1:   "#111317",
  surface2:   "#16191E",
  gold:       "#CAA85A",
  goldDim:    "rgba(202,168,90,0.16)",
  text:       "#F3EFE6",
  textMuted:  "#B7AFA0",
  textFaint:  "#7E776A",
  green:      "#4CAF82",
  cyan:       "#4AA8C8",
};

interface Source {
  id: number;
  name: string;
  type: string;
  url?: string;
  signal_count?: number;
  accuracy_score?: number;
  verified?: boolean;
}

export default function V2Sources() {
  const { data: sources, isLoading } = useQuery<Source[]>({
    queryKey: ["/api/sources"],
    queryFn: () => apiRequest("GET", "/api/sources").then(r => r.json()),
    staleTime: 60000,
  });

  return (
    <V2Shell>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 28px 60px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.gold, display: "inline-block" }} />
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint }}>
              Intelligence Sources
            </span>
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 6px" }}>
            Source Leaderboard
          </h1>
          <p style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textMuted, margin: 0, lineHeight: 1.6, letterSpacing: "0.04em" }}>
            Track accuracy, volume, and reliability of all Edge Setter signal sources across sports.
          </p>
        </div>

        {/* Full leaderboard link */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <Link href="/leaderboard">
            <button style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid rgba(202,168,90,0.28)`, borderRadius: 3, color: T.gold, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "7px 14px", cursor: "pointer" }}>
              Full Leaderboard <ExternalLink size={11} />
            </button>
          </Link>
        </div>

        {/* Source table */}
        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 48, background: T.surface1, borderRadius: 4, opacity: 0.5 + i * 0.08 }} />
            ))}
          </div>
        )}

        {sources && sources.length > 0 && (
          <div style={{ border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 5, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 120px 80px 80px", gap: 0, padding: "8px 16px", background: T.surface2, borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
              {["#", "Source", "Type", "Signals", "Verified"].map(h => (
                <div key={h} style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint }}>
                  {h}
                </div>
              ))}
            </div>
            {sources.slice(0, 30).map((source, i) => (
              <div
                key={source.id}
                data-testid={`source-row-${source.id}`}
                style={{
                  display: "grid", gridTemplateColumns: "40px 1fr 120px 80px 80px", gap: 0,
                  padding: "11px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`,
                  transition: "background 0.1s", cursor: "default",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(202,168,90,0.025)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textFaint, fontVariantNumeric: "tabular-nums" }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: 13, color: T.text, fontWeight: 500, marginBottom: 1 }}>{source.name}</div>
                  {source.url && (
                    <a href={source.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, textDecoration: "none", letterSpacing: "0.04em" }}>
                      {source.url.replace(/^https?:\/\//, "").slice(0, 40)}
                    </a>
                  )}
                </div>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textFaint }}>
                  {source.type ?? "—"}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                  {source.signal_count ?? 0}
                </div>
                <div>
                  {source.verified ? (
                    <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.green }}>✓ YES</span>
                  ) : (
                    <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {sources && sources.length === 0 && (
          <div style={{ padding: "40px", textAlign: "center", color: T.textFaint, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, letterSpacing: "0.1em", border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 5 }}>
            No sources indexed yet. Signal ingestion will populate this list automatically.
          </div>
        )}

        {/* Link back to original leaderboard for full view */}
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <Link href="/leaderboard">
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textMuted, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
              View Full Leaderboard with Stats <ArrowRight size={11} />
            </span>
          </Link>
        </div>
      </div>
    </V2Shell>
  );
}
