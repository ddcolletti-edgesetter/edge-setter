import type { BoardSituation } from "@/lib/boardSituations";
import { signalAgeMinutes, type BoardSignalLike } from "@/lib/signalBoardUx";
import { publicConfidenceLabel } from "@/lib/storyLanguage";

const STALE_THRESHOLD_MINUTES = 48 * 60;

const SIGNAL_RAIL_CSS = `
.board-signal-rail {
  display: grid;
  align-content: start;
  gap: 0;
}
.board-signal-rail .sidebar-block {
  display: grid;
  gap: 9px;
  padding: 12px;
  border: 1px solid rgba(82,101,122,0.18);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(9,16,25,0.82), rgba(5,8,12,0.68));
  box-shadow: 0 18px 44px rgba(0,0,0,0.18);
}
.board-signal-rail .sidebar-block-bloomberg {
  padding: 10px;
}
.board-signal-rail .bloomberg-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--es-gold, #d9a441);
  font-family: var(--font-mono);
  font-size: 0.60rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  border-bottom: 1px solid rgba(245,184,65,0.14);
  padding-bottom: 7px;
  margin-bottom: 2px;
}
.board-signal-rail .bloomberg-feed {
  display: grid;
  gap: 0;
}
.board-signal-rail .bloomberg-row {
  display: grid;
  grid-template-columns: minmax(0,1fr) 64px 44px;
  align-items: center;
  gap: 4px;
  padding: 5px 4px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.board-signal-rail .bloomberg-row:last-child {
  border-bottom: none;
}
.board-signal-rail .bloomberg-topic {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #cdd7e3;
  font-size: 0.68rem;
  font-weight: 500;
}
.board-signal-rail .bloomberg-topic small {
  display: block;
  color: #475569;
  font-size: 0.58rem;
  margin-top: 1px;
}
.board-signal-rail .bloomberg-status {
  padding: 2px 4px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  text-transform: uppercase;
}
.board-signal-rail .bloomberg-status.is-verified {
  background: rgba(24,212,123,0.12);
  color: #18D47B;
  border: 1px solid rgba(24,212,123,0.28);
}
.board-signal-rail .bloomberg-status.is-escalating {
  background: rgba(230,180,80,0.12);
  color: var(--es-amber, #d9a441);
  border: 1px solid rgba(230,180,80,0.28);
}
.board-signal-rail .bloomberg-status.is-developing {
  background: rgba(59,130,246,0.10);
  color: #60a5fa;
  border: 1px solid rgba(59,130,246,0.24);
}
.board-signal-rail .bloomberg-status.is-watch {
  background: rgba(100,116,139,0.10);
  color: #94a3b8;
  border: 1px solid rgba(100,116,139,0.22);
}
.board-signal-rail .bloomberg-conf {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  text-align: right;
}
.board-signal-rail .bloomberg-conf.is-verified { color: #18D47B; }
.board-signal-rail .bloomberg-conf.is-strong { color: var(--es-amber, #d9a441); }
.board-signal-rail .bloomberg-conf.is-developing { color: #64748b; }
.board-signal-rail .bloomberg-conf.is-forming { color: #475569; }
.board-signal-rail .bloomberg-empty {
  margin: 0;
  padding: 6px 4px;
  color: #475569;
  font-family: var(--font-mono);
  font-size: 0.66rem;
}
`;

function statusBadge(lane: string, confidence: number): { label: string; cls: string } {
  const s = lane.toLowerCase();
  if (s === "confirmed") return { label: "Verified", cls: "is-verified" };
  if (s === "escalating") return { label: "Escalating", cls: "is-escalating" };
  if (s === "live" || s === "decision") return { label: "Developing", cls: "is-developing" };
  // "background" and any other unmapped lane: derive from confidence threshold
  if (confidence >= 70) return { label: "Escalating", cls: "is-escalating" };
  return { label: "Developing", cls: "is-developing" };
}

function confTone(score: number): string {
  if (score >= 85) return "is-verified";
  if (score >= 70) return "is-strong";
  if (score >= 50) return "is-developing";
  return "is-forming";
}

function isStale(s: BoardSituation): boolean {
  if (!s.signal) return false;
  const age = signalAgeMinutes(s.signal as BoardSignalLike);
  return age !== null && age > STALE_THRESHOLD_MINUTES;
}

function pluralTypeLabel(label: string): string {
  if (/\binjury$/.test(label)) return label.slice(0, -6) + "injuries";
  return label + "s";
}

function dedupeBySignalType(situations: BoardSituation[]): BoardSituation[] {
  const groups = new Map<string, BoardSituation[]>();
  for (const s of situations) {
    const key = s.signalType ?? s.title;
    const group = groups.get(key) ?? [];
    group.push(s);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const best = group.sort((a, b) => b.confidence - a.confidence)[0];
    if (group.length <= 1) return best;
    const typeLabel = (best.signalType ?? best.title).replace(/_/g, " ");
    return { ...best, id: `summary-${best.signalType ?? best.title}`, signalType: `${group.length} ${pluralTypeLabel(typeLabel)}`, player: undefined, team: undefined };
  });
}

function SignalRow({ s }: { s: BoardSituation }) {
  const rawTopic = s.signalType ?? "update";
  const topic = /^\d/.test(rawTopic)
    ? rawTopic.replace(/_/g, " ")
    : rawTopic.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const subject = s.player ?? s.team ?? "";
  const conf = Math.round(s.confidence);
  const { label, cls } = statusBadge(s.lane, conf);
  return (
    <div className="bloomberg-row">
      <span className="bloomberg-topic">
        {topic}
        {subject && <small>{subject}</small>}
      </span>
      <span className={`bloomberg-status ${cls}`}>{label}</span>
      <span className={`bloomberg-conf ${confTone(conf)}`}>{publicConfidenceLabel(conf)}</span>
    </div>
  );
}

export function BoardSignalRail({ situations, className }: { situations: BoardSituation[]; className?: string }) {
  const feed = dedupeBySignalType(situations.filter((s) => !isStale(s))).slice(0, 7);
  return (
    <>
      <style>{SIGNAL_RAIL_CSS}</style>
      <aside className={`board-signal-rail${className ? ` ${className}` : ""}`} aria-label="Signal feed">
        <section className="sidebar-block sidebar-block-bloomberg">
          <header className="bloomberg-header">
            <span className="es-live-dot es-live-pulse" aria-hidden="true" />
            Signal Feed
          </header>
          <div className="bloomberg-feed">
            {feed.length === 0 ? (
              <p className="bloomberg-empty">ES Agents monitoring — no active signals</p>
            ) : (
              feed.map((s) => <SignalRow key={s.id} s={s} />)
            )}
          </div>
        </section>
      </aside>
    </>
  );
}
