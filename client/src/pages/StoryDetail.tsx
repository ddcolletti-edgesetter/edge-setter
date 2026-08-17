import V2Shell from "../components/V2Shell";
import { useCanonicalSituation, type CanonicalSituationLifecycleState } from "../lib/situationsApi";
import { publicConfidenceLabel } from "../lib/storyLanguage";

function displayState(state: CanonicalSituationLifecycleState) {
  if (state === "confirmed" || state === "official") {
    return {
      label: "Verified",
      colorClass: "text-green-500",
      bgClass: "bg-green-500/10 border-green-500/30",
    };
  }
  if (state === "escalating") {
    return {
      label: "Escalating",
      colorClass: "text-[#E6B450]",
      bgClass: "bg-[#E6B450]/10 border-[#E6B450]/30",
    };
  }
  return {
    label: "Developing",
    colorClass: "text-[#3B82F6]",
    bgClass: "bg-[#3B82F6]/10 border-[#3B82F6]/30",
  };
}

function BackButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = "/";
        }
      }}
      className="mb-6 text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      ← Back
    </button>
  );
}

function StoryDetailInner({ id }: { id: string }) {
  const { situation, loading, notFound, error, refresh } = useCanonicalSituation(id);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="es-skeleton mb-6 h-4 w-16 rounded" />
        <div className="es-skeleton mb-3 h-8 w-3/4 rounded" />
        <div className="es-skeleton h-24 rounded" />
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <BackButton />
        <h1 className="text-2xl font-bold text-foreground">Story not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This story is not available. On the live server this is expected after a dyno restart — the pipeline database is ephemeral on Render.
        </p>
      </main>
    );
  }

  if (error || !situation) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <BackButton />
        <p className="text-sm text-muted-foreground">{error ?? "Story unavailable."}</p>
      </main>
    );
  }

  const state = displayState(situation.lifecycleState);
  const isVerified = situation.lifecycleState === "confirmed" || situation.lifecycleState === "official";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <BackButton />

      {/* 1. Headline + summary */}
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${state.bgClass} ${state.colorClass}`}>
            {state.label}
          </span>
          <span className="text-xs font-semibold text-muted-foreground">
            {situation.league} · {situation.situationType}
          </span>
        </div>
        <h1 className="text-2xl font-bold leading-snug text-foreground sm:text-3xl">{situation.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{situation.summary}</p>
        {situation.lifecycleExplanation && situation.lifecycleExplanation !== situation.summary && (
          <p className="mt-2 text-sm text-muted-foreground/80">{situation.lifecycleExplanation}</p>
        )}
      </div>

      {/* 2. Source trail */}
      {situation.latestEvidence.length > 0 && (
        <section className="mb-6 rounded-md border border-border bg-card/60 p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-primary">Source Trail</h2>
          <div className="grid gap-3">
            {situation.latestEvidence.map((ev, idx) => (
              <div key={idx} className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-foreground">{ev.sourceType ?? ev.eventType}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {ev.validatorAgreement && (
                    <span className="rounded bg-muted/30 px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">
                      {ev.validatorAgreement}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{ev.summary}</p>
                {ev.marketImpact && (
                  <p className="text-xs font-medium text-[#E6B450]">{ev.marketImpact}</p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {situation.sourceCount} {situation.sourceCount === 1 ? "source" : "sources"} tracked · {situation.evidenceCount} evidence events
          </p>
        </section>
      )}

      {/* 3. Agent consensus */}
      <section className="mb-6 rounded-md border border-border bg-card/60 p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-primary">ES Agent Consensus</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${state.colorClass}`}>
              {isVerified ? "Verified" : publicConfidenceLabel(situation.confidence)}
            </span>
            <span className="text-sm text-muted-foreground">{situation.confidenceLabel}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {situation.sourceCount} {situation.sourceCount === 1 ? "source" : "sources"} tracked
          </div>
        </div>
        {situation.confidenceFactors.evidenceThatMattersMost.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground">What drives confidence:</p>
            <ul className="mt-1 space-y-1">
              {situation.confidenceFactors.evidenceThatMattersMost.map((factor, idx) => (
                <li key={idx} className="text-xs text-muted-foreground">· {factor}</li>
              ))}
            </ul>
          </div>
        )}
        {situation.confidenceFactors.whatRemainsUncertain.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold text-muted-foreground">What remains uncertain:</p>
            <ul className="mt-1 space-y-1">
              {situation.confidenceFactors.whatRemainsUncertain.map((item, idx) => (
                <li key={idx} className="text-xs text-muted-foreground/70">· {item}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 4. Timing advantage callout — mandatory when detectionLeadMinutes exists */}
      {situation.detectionLeadMinutes != null && (
        <section
          data-testid="timing-advantage-callout"
          className="mb-6 rounded-md border border-[#E6B450]/30 bg-[#E6B450]/5 p-4"
        >
          <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-[#E6B450]">Timing Advantage</h2>
          {situation.publicConfirmation ? (
            <p className="text-sm font-semibold text-foreground">
              ES Agents verified {new Date(situation.firstSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {" · "}Wire pickup {new Date(situation.publicConfirmation).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {" — "}{situation.detectionLeadMinutes} min later
            </p>
          ) : (
            <p className="text-sm font-semibold text-foreground">
              ES Agents verified · {new Date(situation.firstSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            EdgeSetter detected this story {situation.detectionLeadMinutes}{" "}
            {situation.detectionLeadMinutes === 1 ? "minute" : "minutes"} before wire pickup.
          </p>
        </section>
      )}

      {/* 5. Fantasy / betting impact — always last */}
      {(!!situation.calibrationSummary || !!situation.weakeningSignals?.length || !!situation.confirmationSignals?.length) && (
        <section className="mb-6 rounded-md border border-border bg-card/60 p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-primary">Fantasy / Betting Impact</h2>
          {situation.calibrationSummary && (
            <p className="text-sm text-muted-foreground">{situation.calibrationSummary}</p>
          )}
          {situation.confirmationSignals && situation.confirmationSignals.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-foreground">Watch for:</p>
              <ul className="mt-1 space-y-1">
                {situation.confirmationSignals.map((sig, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground">· {sig}</li>
                ))}
              </ul>
            </div>
          )}
          {situation.weakeningSignals && situation.weakeningSignals.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-muted-foreground">Weakening signals:</p>
              <ul className="mt-1 space-y-1">
                {situation.weakeningSignals.map((sig, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground/70">· {sig}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="flex items-center justify-between border-t border-border/40 pt-4 text-xs text-muted-foreground/60">
        <span>First detected {new Date(situation.firstSeenAt).toLocaleString()}</span>
        <button type="button" onClick={refresh} className="hover:text-muted-foreground">
          Refresh
        </button>
      </div>
    </main>
  );
}

export default function StoryDetail({ params }: { params?: { id?: string } }) {
  const id = params?.id ?? "";
  return (
    <V2Shell>
      <StoryDetailInner id={id} />
    </V2Shell>
  );
}
