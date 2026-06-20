import type { CanonicalSituation } from "@/lib/situationsApi";

const TICKER_CSS = `
.live-intel-ticker {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  min-height: 34px;
  border-bottom: 1px solid rgba(245,184,65,0.12);
  background:
    linear-gradient(90deg, rgba(245,184,65,0.08), transparent 28%),
    rgba(5,5,5,0.84);
  overflow: hidden;
}
.live-intel-ticker-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 16px 0 18px;
  border-right: 1px solid rgba(245,184,65,0.12);
  color: var(--es-gold, #d9a441);
  font-family: var(--font-cond);
  font-size: 0.64rem;
  font-weight: 950;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
}
.live-intel-ticker-window {
  min-width: 0;
  overflow: hidden;
  mask-image: linear-gradient(90deg, black 95%, transparent);
}
.live-intel-ticker-track {
  display: flex;
  width: max-content;
  animation: liveIntelTicker 68s linear infinite;
}
.live-intel-ticker-track span {
  position: relative;
  flex: 0 0 auto;
  padding: 0 34px;
  color: #cbd5e1;
  font-family: var(--font-cond);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 34px;
  white-space: nowrap;
}
.live-intel-ticker-track span::before {
  content: "";
  position: absolute;
  left: 10px;
  top: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(245,184,65,0.38);
  transform: translateY(-50%);
}
@keyframes liveIntelTicker {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .live-intel-ticker-track {
    animation: none;
  }
}
@media (max-width: 760px) {
  .live-intel-ticker {
    grid-template-columns: 1fr;
  }
  .live-intel-ticker-brand {
    min-height: 28px;
    padding-inline: 12px;
    border-right: 0;
    border-bottom: 1px solid rgba(245,184,65,0.12);
    font-size: 0.64rem;
  }
  .live-intel-ticker-track span {
    padding: 0 18px;
    font-size: 0.62rem;
    line-height: 28px;
  }
}
`;

export function LiveTicker({ items, className }: { items: string[]; className?: string }) {
  const visibleItems = items.length ? items : ["ES Agents monitoring — no verified breaks yet"];
  const doubled = [...visibleItems, ...visibleItems];
  return (
    <>
      <style>{TICKER_CSS}</style>
      <div className={`live-intel-ticker${className ? ` ${className}` : ""}`} aria-label="Live intelligence ticker">
        <div className="live-intel-ticker-brand">
          <span className="es-live-dot es-live-pulse" />
          EdgeSetter Live
        </div>
        <div className="live-intel-ticker-window">
          <div className="live-intel-ticker-track">
            {doubled.map((item, index) => (
              <span key={`${item}-${index}`}>{item}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function buildBoardTickerItems(situations: CanonicalSituation[]): string[] {
  const verified = situations
    .filter((s) => s.detectionLeadMinutes && s.detectionLeadMinutes >= 15 &&
      (s.lifecycleState === "confirmed" || s.lifecycleState === "official"))
    .slice(0, 2)
    .map((s) => {
      const mins = s.detectionLeadMinutes!;
      const lead = mins >= 60
        ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ""}`
        : `${mins}m`;
      const subject = s.players[0] ?? s.teams[0] ?? s.situationType.replace(/_/g, " ");
      return `⚡ ES Agents verified ${subject} — ${lead} before public confirmation`;
    });

  const escalating = situations
    .filter((s) => s.lifecycleState === "escalating" || s.lifecycleState === "emerging")
    .slice(0, 2)
    .map((s) => {
      const subject = s.players[0] ?? s.teams[0] ?? s.situationType.replace(/_/g, " ");
      return `${s.league}: ${subject} watch tightening`;
    });

  const multisource = situations
    .filter((s) => s.sourceCount >= 2 && s.lifecycleState === "developing")
    .slice(0, 2)
    .map((s) => `${s.league}: ${s.sourceCount} reports tracking ${s.situationType.replace(/_/g, " ")}`);

  return [...verified, ...escalating, ...multisource].filter(Boolean).slice(0, 8);
}
