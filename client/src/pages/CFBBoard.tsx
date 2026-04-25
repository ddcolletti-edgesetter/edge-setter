import React from "react";
import V2Shell, { SportBadge, useShellTheme } from "../components/V2Shell";
import { Zap } from "lucide-react";

const T = {
  bg:       "#0A0B0D",
  surface1: "#111317",
  surface2: "#16191E",
  gold:     "#CAA85A",
  goldDim:  "rgba(202,168,90,0.18)",
  text:     "#F3EFE6",
  textMuted:"#B7AFA0",
  textFaint:"#7E776A",
  cyan:     "#4AA8C8",
  orange:   "#D98A42",
};

function CFBBoardInner() {
  const darkMode = useShellTheme();
  const TH = {
    bg:        darkMode ? T.bg        : "#F0ECE4",
    surface1:  darkMode ? T.surface1  : "#FFFFFF",
    surface2:  darkMode ? T.surface2  : "#F5F1EB",
    goldDim:   darkMode ? T.goldDim   : "rgba(202,168,90,0.25)",
    text:      darkMode ? T.text      : "#1A1712",
    textMuted: darkMode ? T.textMuted : "#4A443C",
    textFaint: darkMode ? T.textFaint : "#8C8277",
  };

  /* Coming-soon panels for planned modules */
  const modules = [
    { label: "QB Battles",         desc: "Real-time depth chart battles, camp reports, and starter locks",        color: T.orange },
    { label: "Transfer Portal",    desc: "High-impact transfers with destination and eligibility tracking",        color: T.cyan   },
    { label: "Power Rating Moves", desc: "Week-over-week shifts in SP+, PFF, and internal power ratings",         color: T.gold   },
    { label: "Coaching Changes",   desc: "Coordinator hires, OC/DC scheme installs, and staff impact signals",    color: T.cyan   },
    { label: "Signal Stream",      desc: "Full signal table — injuries, line moves, matchup edges, sharp money",  color: T.gold   },
  ];

  return (
    <div style={{ minHeight: "100%", background: TH.bg }}>
      {/* Header */}
      <div style={{
        padding: "24px 32px 20px",
        borderBottom: `1px solid ${TH.goldDim}`,
        background: TH.surface1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 24, fontWeight: 700, color: TH.text, margin: 0, lineHeight: 1.2,
          }}>CFB Intelligence Board</h1>
          <SportBadge status="BUILDING" />
        </div>
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 14, color: TH.textFaint, letterSpacing: "0.07em",
        }}>
          AP rankings · QB battles · Transfer intel · Line movement
        </div>
      </div>

      {/* Progress banner */}
      <div style={{
        margin: "24px 32px 0",
        background: `${T.orange}12`,
        border: `1px solid ${T.orange}44`,
        borderRadius: 5, padding: "14px 18px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.orange, flexShrink: 0,
          animation: "shellPulse 2s ease-in-out infinite" }} />
        <div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 15, fontWeight: 700, color: T.orange, letterSpacing: "0.08em",
            textTransform: "uppercase", marginBottom: 2,
          }}>
            Board in progress — launching before fall camp 2026
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 13, color: TH.textMuted,
          }}>
            NFL Board launched first. CFB follows the same pattern: full signal stream, QB battles, transfer portal, power ratings, and line movement.
          </div>
        </div>
      </div>

      {/* Module preview cards */}
      <div style={{ padding: "24px 32px" }}>
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 11, fontWeight: 700, color: TH.textFaint,
          letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 14,
        }}>
          Coming modules
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}>
          {modules.map(m => (
            <div key={m.label} style={{
              background: TH.surface1,
              border: `1px solid ${m.color}33`,
              borderLeft: `3px solid ${m.color}`,
              borderRadius: 4, padding: "14px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <Zap size={13} color={m.color} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 14, fontWeight: 700, color: TH.text, letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}>{m.label}</span>
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, color: TH.textMuted, lineHeight: 1.5,
              }}>
                {m.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top conferences preview */}
      <div style={{ padding: "0 32px 32px" }}>
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 11, fontWeight: 700, color: TH.textFaint,
          letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 14,
        }}>
          Coverage scope
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["SEC", "Big Ten", "Big 12", "ACC", "Pac-12", "AAC", "Mountain West", "Sun Belt"].map(conf => (
            <span key={conf} style={{
              padding: "5px 12px", borderRadius: 2,
              background: `${T.gold}12`, border: `1px solid ${T.gold}30`,
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 13, fontWeight: 700, color: T.gold,
              letterSpacing: "0.07em", textTransform: "uppercase",
            }}>
              {conf}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CFBBoard() {
  return (
    <V2Shell boardsMode>
      <CFBBoardInner />
    </V2Shell>
  );
}
