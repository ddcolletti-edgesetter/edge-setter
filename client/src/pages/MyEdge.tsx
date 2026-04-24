import V2Shell from "../components/V2Shell";
import { Link } from "wouter";
import { ArrowRight, Star, Bell, TrendingUp, Users, Bookmark, Lock } from "lucide-react";

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
  orange:     "#D98A42",
};

interface FeatureCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  timeline: string;
  status: "planned" | "coming" | "soon";
}

const FEATURES: FeatureCard[] = [
  {
    icon: <Star size={18} />,
    title: "Watchlist",
    description: "Save players, teams, and bets/angles you're tracking. Everything in one place, always fresh.",
    timeline: "Q3 2026",
    status: "coming",
  },
  {
    icon: <Bell size={18} />,
    title: "Personalized Alerts",
    description: "Get notified the moment a signal drops on a player or team you're watching. Real-time edge delivery.",
    timeline: "Q3 2026",
    status: "coming",
  },
  {
    icon: <TrendingUp size={18} />,
    title: "My Bets / Angles",
    description: "Log the bets and angles you're building. Track how your signal-based decisions perform over time.",
    timeline: "Q4 2026",
    status: "planned",
  },
  {
    icon: <Users size={18} />,
    title: "Saved Teams",
    description: "Follow specific teams across all sports. Your board surfaces their signals first, every morning.",
    timeline: "Q3 2026",
    status: "coming",
  },
  {
    icon: <Bookmark size={18} />,
    title: "Saved Signals",
    description: "Bookmark signals you want to revisit. Export to CSV or share directly with your betting group.",
    timeline: "Q4 2026",
    status: "planned",
  },
  {
    icon: <Lock size={18} />,
    title: "Pro Edge Digest",
    description: "A daily personalized brief, delivered at 7 AM. Your watchlist, your sport, your angle — curated.",
    timeline: "Q4 2026",
    status: "planned",
  },
];

const TIMELINE_STYLE: Record<string, { color: string; bg: string }> = {
  coming:  { color: T.gold,    bg: "rgba(202,168,90,0.1)" },
  soon:    { color: T.green,   bg: "rgba(76,175,130,0.1)" },
  planned: { color: T.textFaint, bg: "rgba(126,119,106,0.1)" },
};

export default function MyEdge() {
  return (
    <V2Shell>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 28px 60px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36, borderBottom: `1px solid ${T.goldDim}`, paddingBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Star size={14} style={{ color: T.gold }} />
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint }}>
              My Edge — Personalization
            </span>
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, fontWeight: 700, color: T.text, margin: "0 0 10px" }}>
            Your Personalized Research Hub
          </h1>
          <p style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, color: T.textMuted, margin: 0, lineHeight: 1.7, maxWidth: 560, letterSpacing: "0.04em" }}>
            My Edge is being built as the personalization layer of Edge Setter — your saved players, saved bets, watchlists, 
            and a daily digest tailored to your research workflow. Everything launching below is actively in development.
          </p>
        </div>

        {/* Status banner */}
        <div style={{ padding: "14px 18px", background: "rgba(202,168,90,0.05)", border: `1px solid rgba(202,168,90,0.18)`, borderRadius: 5, marginBottom: 36, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.gold, flexShrink: 0, marginTop: 5 }} />
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.gold, marginBottom: 5 }}>
              In Development — Launching Q3 2026
            </div>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textMuted, lineHeight: 1.6, letterSpacing: "0.04em" }}>
              Pro subscribers will get early access to My Edge features as they roll out. Watchlist and player alerts launch first, 
              followed by angle tracking and the personalized daily digest.
            </div>
          </div>
        </div>

        {/* Feature grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 40 }}>
          {FEATURES.map(feature => {
            const ts = TIMELINE_STYLE[feature.status];
            return (
              <div
                key={feature.title}
                data-testid={`my-edge-feature-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}
                style={{
                  padding: "20px 18px", background: T.surface1, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 5,
                  display: "flex", flexDirection: "column", gap: 10, opacity: 0.85,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ color: T.gold, opacity: 0.7 }}>{feature.icon}</div>
                  <span style={{ padding: "2px 7px", borderRadius: 2, background: ts.bg, color: ts.color, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 }}>
                    {feature.timeline}
                  </span>
                </div>
                <div>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                    {feature.title}
                  </div>
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textMuted, lineHeight: 1.6, letterSpacing: "0.03em" }}>
                    {feature.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* What you can do now */}
        <section style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, marginBottom: 16 }}>
            Available Now
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {[
              { label: "NBA Board", desc: "Live signal stream. Playoff intel.", href: "/v2/nba", color: T.gold },
              { label: "MLB Board", desc: "Regular season. Pitcher and lineup.", href: "/v2/mlb", color: "#4AA8C8" },
              { label: "Tools Hub", desc: "All current + upcoming tools.", href: "/v2/tools", color: T.gold },
              { label: "Source Leaderboard", desc: "Track source reliability.", href: "/leaderboard", color: T.textMuted },
            ].map(item => (
              <Link key={item.label} href={item.href}>
                <div
                  style={{ padding: "14px 16px", background: T.surface1, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 4, cursor: "pointer", transition: "border-color 0.12s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(202,168,90,0.22)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: item.color }}>
                      {item.label}
                    </div>
                    <ArrowRight size={11} style={{ color: T.textFaint }} />
                  </div>
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.04em" }}>
                    {item.desc}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Pro CTA */}
        <div style={{ padding: "22px 22px", background: "linear-gradient(135deg, rgba(202,168,90,0.07) 0%, transparent 70%)", border: `1px solid rgba(202,168,90,0.28)`, borderRadius: 5, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: T.gold }} />
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 16, fontWeight: 700, color: T.gold, marginBottom: 8 }}>
            Get Pro — Early Access to My Edge
          </div>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textMuted, lineHeight: 1.7, letterSpacing: "0.04em", marginBottom: 16, maxWidth: 500 }}>
            Pro subscribers get first access to every My Edge feature as it ships, plus real-time alerts, full signal archive, 
            and all Beta tools across NBA, MLB, and NFL.
          </div>
          <Link href="/pro">
            <button style={{ background: T.gold, color: T.bg, border: "none", borderRadius: 3, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", padding: "10px 24px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Go Pro · $19/mo <ArrowRight size={12} />
            </button>
          </Link>
        </div>
      </div>
    </V2Shell>
  );
}
