/**
 * Smoke tests: ?highlight= deep-link behaviour
 *
 * Covers the exact logic that lives in Dashboard.tsx:
 *   1. getHashParam("highlight") parses the signal ID from the URL hash
 *   2. When a matching signal-card element exists → scrollIntoView is called
 *      and the gold ring styles are applied
 *   3. The ring styles are removed after 2 200 ms (no style leaks)
 *   4. When no highlight param is present → no scroll, no style mutation
 *   5. When highlight param is present but the element is absent → graceful skip
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Pure helper: extracted verbatim from Dashboard.tsx ─────────────────────

function getHashParam(key: string): string {
  try {
    const hash = window.location.hash;
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return "";
    const search = hash.slice(qIdx + 1);
    return new URLSearchParams(search).get(key) ?? "";
  } catch {
    return "";
  }
}

/**
 * The highlight effect body, extracted verbatim from the useEffect in
 * Dashboard.tsx so we can unit-test it without mounting the component.
 *
 * Returns the setTimeout handle so tests can control timing.
 */
function runHighlightEffect(id: string): ReturnType<typeof setTimeout> | null {
  if (!id) return null;

  const tryScroll = () => {
    const el = document.querySelector(
      `[data-testid="signal-card-${id}"]`
    ) as HTMLElement | null;
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    el.style.transition = "box-shadow 0.3s ease, border-color 0.3s ease";
    el.style.boxShadow = "0 0 0 2px #F5B841, 0 0 24px rgba(245,184,65,0.35)";
    el.style.borderLeftColor = "#F5B841";

    setTimeout(() => {
      el.style.boxShadow = "";
      el.style.borderLeftColor = "";
    }, 2200);
  };

  return setTimeout(tryScroll, 120);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("getHashParam", () => {
  afterEach(() => {
    // Reset hash to a clean state between tests
    window.location.hash = "";
  });

  it("extracts highlight ID from a full hash route", () => {
    window.location.hash = "#/dashboard?highlight=signal-abc-123";
    expect(getHashParam("highlight")).toBe("signal-abc-123");
  });

  it("extracts highlight when combined with other params", () => {
    window.location.hash = "#/dashboard?topic=free_agency&highlight=xyz-456";
    expect(getHashParam("highlight")).toBe("xyz-456");
  });

  it("returns empty string when highlight param is absent", () => {
    window.location.hash = "#/dashboard?topic=injury";
    expect(getHashParam("highlight")).toBe("");
  });

  it("returns empty string when hash has no query string at all", () => {
    window.location.hash = "#/dashboard";
    expect(getHashParam("highlight")).toBe("");
  });

  it("returns empty string when hash is empty", () => {
    window.location.hash = "";
    expect(getHashParam("highlight")).toBe("");
  });
});

describe("highlight effect — valid signal ID", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("scrolls to and applies gold ring when element exists", () => {
    // Arrange: create a fake signal card in the DOM
    const card = document.createElement("div");
    card.setAttribute("data-testid", "signal-card-signal-001");
    card.style.borderLeftColor = "rgba(61,174,114,0.50)";
    document.body.appendChild(card);

    const scrollSpy = vi.fn();
    card.scrollIntoView = scrollSpy;

    // Act: run the effect and advance past the 120ms debounce
    runHighlightEffect("signal-001");
    vi.advanceTimersByTime(120);

    // Assert: scrollIntoView called with correct options
    expect(scrollSpy).toHaveBeenCalledOnce();
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });

    // Assert: gold ring styles applied.
    // jsdom normalises hex colours to rgb() on read-back, so we match either form.
    expect(card.style.boxShadow).toBeTruthy();
    expect(card.style.borderLeftColor).toMatch(/f5b841|rgb\(245,\s*184,\s*65\)/i);
    expect(card.style.transition).toBe(
      "box-shadow 0.3s ease, border-color 0.3s ease"
    );
  });

  it("removes gold ring styles after 2 200 ms — no style leak", () => {
    // Arrange
    const card = document.createElement("div");
    card.setAttribute("data-testid", "signal-card-signal-002");
    document.body.appendChild(card);
    card.scrollIntoView = vi.fn();

    // Act: trigger effect and advance past debounce
    runHighlightEffect("signal-002");
    vi.advanceTimersByTime(120);

    // Confirm ring is on — jsdom normalises hex to rgb() on read-back
    expect(card.style.boxShadow).not.toBe("");
    expect(card.style.borderLeftColor).toMatch(/f5b841|rgb\(245,\s*184,\s*65\)/i);

    // Advance past the 2 200 ms clear timer
    vi.advanceTimersByTime(2200);

    // Assert: ring cleared — no style leaks
    expect(card.style.boxShadow).toBe("");
    expect(card.style.borderLeftColor).toBe("");
  });
});

describe("highlight effect — missing or invalid ID", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("returns null and touches nothing when ID is empty string", () => {
    // Arrange: a card that must NOT be mutated
    const card = document.createElement("div");
    card.setAttribute("data-testid", "signal-card-some-id");
    card.scrollIntoView = vi.fn();
    document.body.appendChild(card);

    // Act
    const handle = runHighlightEffect("");
    vi.advanceTimersByTime(500);

    // Assert: no timer scheduled, card untouched
    expect(handle).toBeNull();
    expect(card.scrollIntoView).not.toHaveBeenCalled();
    expect(card.style.boxShadow).toBe("");
  });

  it("skips gracefully when element is not in the DOM", () => {
    // No matching element in the DOM — must not throw
    expect(() => {
      runHighlightEffect("non-existent-id");
      vi.advanceTimersByTime(500);
    }).not.toThrow();
  });

  it("does not mutate unrelated signal cards when targeting a specific ID", () => {
    // Arrange: two cards — only signal-003 is the target
    const targetCard = document.createElement("div");
    targetCard.setAttribute("data-testid", "signal-card-signal-003");
    targetCard.scrollIntoView = vi.fn();

    const bystanderCard = document.createElement("div");
    bystanderCard.setAttribute("data-testid", "signal-card-signal-999");
    bystanderCard.scrollIntoView = vi.fn();

    document.body.appendChild(targetCard);
    document.body.appendChild(bystanderCard);

    // Act
    runHighlightEffect("signal-003");
    vi.advanceTimersByTime(120);

    // Assert: only target was scrolled and styled
    expect(targetCard.scrollIntoView).toHaveBeenCalledOnce();
    expect(bystanderCard.scrollIntoView).not.toHaveBeenCalled();
    // Bystander must have no box-shadow and no coloured border applied
    expect(bystanderCard.style.boxShadow).toBe("");
    // borderLeftColor on a fresh element is empty string in jsdom
    expect(bystanderCard.style.borderLeftColor).toBe("");
  });
});
