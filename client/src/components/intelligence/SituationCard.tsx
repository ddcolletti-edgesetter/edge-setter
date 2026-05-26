import { Activity, ChevronDown, Clock3, Link2, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import type { EscalationState, IntelligenceSituation } from "@/lib/intelligenceSituationsApi";

const stateTone: Record<EscalationState, string> = {
  Monitoring: "#94A3B8",
  Emerging: "#00B7FF",
  Escalating: "#FF8A00",
  Significant: "#FF5252",
  Confirming: "#F5B841",
  Official: "#00E676",
};

export function EscalationBadge({ state }: { state: EscalationState }) {
  const color = stateTone[state];
  const stateClass =
    state === "Escalating" || state === "Significant" ? " es-state-escalated" :
    state === "Official" ? " es-state-official" :
    state === "Confirming" || state === "Emerging" ? " es-state-developing" :
    " es-state-monitoring";
  return (
    <span className={`live-intel-escalation${stateClass}`} style={{ borderColor: `${color}55`, background: `${color}14`, color }}>
      <span className={state === "Official" ? "es-live-dot es-live-dot-subtle" : ""} style={{ background: color, boxShadow: state === "Monitoring" ? "none" : `0 0 8px ${color}` }} />
      {state}
    </span>
  );
}

export function ConfidenceMovement({ situation }: { situation: IntelligenceSituation }) {
  const { current, delta, explanation } = situation.confidence;
  const color = delta === null ? "#F5B841" : delta > 0 ? "#00E676" : delta < 0 ? "#FF5252" : "#94A3B8";
  const icon = delta === null || delta === 0
    ? <Activity size={13} />
    : delta > 0
      ? <TrendingUp size={13} />
      : <TrendingDown size={13} />;
  const label = delta === null ? "Initial read" : delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : "No change";

  return (
    <div className={delta === null || delta === 0 ? "live-intel-confidence" : `live-intel-confidence ${delta > 0 ? "es-confidence-up" : "es-confidence-down"}`}>
      <div style={{ color }}>
        {icon}
        <strong>{label}</strong>
        <span>{current}%</span>
      </div>
      <p>{explanation}</p>
    </div>
  );
}

export function SourceChainMini({ situation }: { situation: IntelligenceSituation }) {
  const sources = situation.sources.slice(0, 4);
  return (
    <div className={situation.sourceSummary.count > 1 ? "live-intel-source-chain es-source-confirm" : "live-intel-source-chain"} aria-label="Source chain">
      <div>
        <Link2 size={13} />
        <strong>{situation.sourceSummary.convergence}</strong>
        <span>{situation.sourceSummary.count} source{situation.sourceSummary.count === 1 ? "" : "s"}</span>
      </div>
      <div className="live-intel-source-dots">
        {(sources.length ? sources : [{ name: "Pending", type: "Source", status: "Pending" }]).map((source, index) => (
          <span key={`${source.name}-${index}`} title={`${source.name} - ${source.type}`} />
        ))}
      </div>
    </div>
  );
}

export function TimelinePreview({ situation }: { situation: IntelligenceSituation }) {
  const events = situation.timeline.slice(-3);
  return (
    <div className="live-intel-timeline">
      {events.map((event) => (
        <div key={`${event.at}-${event.label}`}>
          <time>{formatTime(event.at)}</time>
          <span />
          <p>
            <strong>{event.label}</strong>
            {event.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

export function SituationCard({ situation, featured = false }: { situation: IntelligenceSituation; featured?: boolean }) {
  const [expanded, setExpanded] = useState(featured);
  const subject = [situation.subject.player, situation.subject.team, situation.subject.matchup].filter(Boolean).join(" / ");

  return (
    <article className={`live-intel-card ${featured ? "is-featured" : ""}`}>
      <header className="live-intel-card-header">
        <div>
          <div className="live-intel-kicker">
            <span>{situation.league}</span>
            <span>{formatSignalType(situation.signalType)}</span>
            <span>{situation.timing.freshnessLabel}</span>
          </div>
          <h2>{situation.headline}</h2>
          {subject && <p className="live-intel-subject">{subject}</p>}
        </div>
        <EscalationBadge state={situation.escalationState} />
      </header>

      <div className="live-intel-read-grid">
        <div>
          <span className="live-intel-label">What is happening</span>
          <p>{situation.currentRead}</p>
        </div>
        <div>
          <span className="live-intel-label">Why it matters</span>
          <p>{situation.whyItMatters}</p>
        </div>
      </div>

      <div className="live-intel-evidence-row">
        <ConfidenceMovement situation={situation} />
        <SourceChainMini situation={situation} />
        <div className="live-intel-timing">
          <Clock3 size={13} />
          <strong>{situation.timing.window}</strong>
          <span>{situation.actionWindow}</span>
        </div>
      </div>

      <div className="live-intel-validator-row">
        <div>
          <ShieldCheck size={14} />
          <span>{situation.validators.agreement}</span>
        </div>
        {situation.marketReaction && (
          <div>
            <TrendingUp size={14} />
            <span>
              Market {situation.marketReaction.open} to {situation.marketReaction.current} ({situation.marketReaction.delta})
            </span>
          </div>
        )}
      </div>

      {expanded && <TimelinePreview situation={situation} />}

      <footer className="live-intel-card-footer">
        <div>
          {situation.implications.slice(0, 2).map((implication) => (
            <span key={implication}>{implication}</span>
          ))}
        </div>
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? "Hide timeline" : "Show timeline"}
          <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }} />
        </button>
      </footer>
    </article>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time pending";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatSignalType(type: string) {
  return type.replace(/_/g, " ");
}
