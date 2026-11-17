/**
 * UI honesty batch 1
 *
 * Each case pins copy or state that previously told the visitor something the
 * product does not do: invented personal stats, Pro claims that promise an
 * unbuilt delivery channel, an internal Render failure note shown as customer
 * copy, Follow/Save framed as coverage review, and an Alerts page that bounced
 * non-Pro visitors to the homepage with no explanation.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MyEdge from "@/pages/MyEdge";
import ProPage from "@/pages/ProPage";
import StoryDetail from "@/pages/StoryDetail";
import AlertSettingsPage from "@/pages/AlertSettingsPage";
import { SignalDetailDrawer, type SignalDetailLike } from "@/components/SignalDetailDrawer";
import { useAuth } from "@/context/AuthContext";
import { useCanonicalSituation } from "@/lib/situationsApi";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackProVisit: vi.fn(),
  trackCheckoutClick: vi.fn(),
}));

vi.mock("@/lib/situationsApi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/situationsApi")>("@/lib/situationsApi");
  return { ...actual, useCanonicalSituation: vi.fn() };
});

const mockUseAuth = vi.mocked(useAuth);
const mockUseCanonicalSituation = vi.mocked(useCanonicalSituation);

function auth(isPro: boolean) {
  return {
    email: isPro ? "subscriber@example.com" : null,
    user: isPro
      ? {
          email: "subscriber@example.com",
          plan: "pro",
          access_status: "active",
          billing_status: "active",
          stripe_customer_id: "cus_test",
          is_pro: true,
        }
      : null,
    isPro,
    authLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>;
}

beforeEach(() => {
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("MyEdge personal stat tiles", () => {
  for (const isPro of [false, true]) {
    it(`does not invent personal feed counts (isPro=${isPro})`, () => {
      mockUseAuth.mockReturnValue(auth(isPro));

      render(<MyEdge />);

      expect(screen.queryByText("Feed Layers")).not.toBeInTheDocument();
      expect(screen.queryByText("Saved Sports")).not.toBeInTheDocument();
      expect(screen.queryByText("Alert Profile")).not.toBeInTheDocument();
      expect(screen.queryByText("NBA / MLB")).not.toBeInTheDocument();
      // "On-Active" was the paired value of the second tile.
      expect(screen.queryByText("On-Active")).not.toBeInTheDocument();
    });
  }

  it("keeps the development banner that says personalization is not active", () => {
    mockUseAuth.mockReturnValue(auth(false));

    render(<MyEdge />);

    expect(
      screen.getByText(/Followed teams, followed players, watched stories, and alert routing are not active yet/i)
    ).toBeInTheDocument();
  });
});

describe("ProPage feature claims", () => {
  it("promises no delivery channel and drops the self-referential launch-promise line", () => {
    mockUseAuth.mockReturnValue(auth(false));

    render(<ProPage />);

    expect(screen.queryByText(/delivery channels/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/without fake launch promises/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Set the sports, story types, and signal-strength thresholds you care about, and your account keeps them on file."
      )
    ).toBeInTheDocument();
  });

  it("describes league coverage without implying NFL and CFB are offseason-only", () => {
    mockUseAuth.mockReturnValue(auth(false));

    render(<ProPage />);

    expect(screen.queryByText(/offseason-only/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Every league board states its own coverage level, so a thin board reads as thin instead of looking like a quiet market."
      )
    ).toBeInTheDocument();
  });
});

describe("StoryDetail missing-story copy", () => {
  it("tells the visitor what to do instead of describing our hosting", () => {
    mockUseAuth.mockReturnValue(auth(false));
    mockUseCanonicalSituation.mockReturnValue({
      situation: null,
      loading: false,
      notFound: true,
      error: null,
      refresh: vi.fn(),
    } as unknown as ReturnType<typeof useCanonicalSituation>);

    render(<StoryDetail params={{ id: "missing-story" }} />);

    expect(
      screen.getByText("This story isn't available right now. Go back to the board and try again.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/ephemeral/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dyno/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Render/i)).not.toBeInTheDocument();
  });
});

describe("SignalDetailDrawer follow and save actions", () => {
  const signal: SignalDetailLike = {
    id: "follow-save-test",
    headline: "Starter status moving toward confirmation",
    detail: "Team source and market context are being monitored.",
    team: "DAL",
    player: "Sample Player",
    type: "availability",
    confidence: 74,
    source_count: 2,
    timestamp: "12m ago",
  };

  function renderDrawer() {
    return render(<SignalDetailDrawer open signal={signal} sport="NBA" onClose={() => undefined} />);
  }

  it("says the buttons are browser bookmarks, not alerts or account sync", () => {
    renderDrawer();

    expect(
      screen.getByText(
        "Follow and Save are bookmarks kept in this browser. They do not send alerts and do not sync to your account."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/marked for your next coverage review/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/for update tracking/i)).not.toBeInTheDocument();
  });

  it("persists the follow toggle to localStorage, which is all the handler claims to do", () => {
    renderDrawer();

    const follow = screen.getByRole("button", { name: /Follow story/i });
    expect(follow).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(follow);

    expect(JSON.parse(window.localStorage.getItem("edgesetter.followedSignals") ?? "[]")).toContain(
      "follow-save-test"
    );
    expect(screen.getByRole("button", { name: /Following/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("persists the save toggle to localStorage", () => {
    renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: /Save story/i }));

    expect(JSON.parse(window.localStorage.getItem("edgesetter.watchlistSignals") ?? "[]")).toContain(
      "follow-save-test"
    );
    expect(screen.getByRole("button", { name: /^Saved$/i })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AlertSettingsPage non-Pro visitors", () => {
  it("explains the Pro gate instead of silently redirecting to the homepage", () => {
    mockUseAuth.mockReturnValue(auth(false));

    render(<AlertSettingsPage />);

    expect(screen.getByRole("heading", { name: "Alerts are a Pro feature" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get Pro" })).toHaveAttribute("href", "/pro");
    expect(screen.getByRole("link", { name: "Back to the board" })).toHaveAttribute("href", "/");

    // The old behaviour was a setLocation("/") redirect from an effect.
    expect(window.location.pathname).toBe("/");
    expect(screen.queryByRole("heading", { name: "Saved Alert Preferences" })).not.toBeInTheDocument();
  });

  it("still renders the preference form for Pro visitors", async () => {
    mockUseAuth.mockReturnValue(auth(true));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          preferences: {
            leagues: ["NBA"],
            signal_types: [],
            min_confidence: 80,
            channels: ["email"],
            is_active: true,
          },
        }),
      }))
    );

    render(<AlertSettingsPage />);

    expect(await screen.findByRole("heading", { name: "Saved Alert Preferences" })).toBeInTheDocument();
    expect(screen.queryByText("Alerts are a Pro feature")).not.toBeInTheDocument();
  });
});
