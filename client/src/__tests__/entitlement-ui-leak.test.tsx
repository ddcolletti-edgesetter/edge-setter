import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ToolsHub from "@/pages/ToolsHub";
import SignalsPage from "@/pages/SignalsPage";
import MLBBoard from "@/pages/MLBBoard";
import { useAuth } from "@/context/AuthContext";
import { useSignalGate } from "@/context/SignalGate";
import { openBillingPortal } from "@/lib/billingPortal";

const mockUseAuth = vi.mocked(useAuth);
const mockUseSignalGate = vi.mocked(useSignalGate);
const mockOpenBillingPortal = vi.mocked(openBillingPortal);

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/context/SignalGate", () => ({
  FREE_LIMIT: 3,
  useSignalGate: vi.fn(),
}));

vi.mock("@/lib/billingPortal", () => ({
  billingPortalUnavailableMessage: { title: "Billing portal unavailable", description: "Try again." },
  openBillingPortal: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: [
        testSignal(1, true),
        testSignal(2),
        testSignal(3),
        testSignal(4),
      ],
      isLoading: false,
      refetch: vi.fn(),
    })),
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
    })),
  };
});

vi.mock("@/hooks/useSignals", () => ({
  useMLBSignals: vi.fn(() => ({ signals: [], loading: false, refresh: vi.fn() })),
  useNBASignals: vi.fn(() => ({ signals: [], loading: false, pendingCount: 0, flushPending: vi.fn(), refresh: vi.fn() })),
}));

vi.mock("@/lib/situationsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/situationsApi")>();
  return {
    ...actual,
    filterCanonicalSituations: vi.fn((situations: unknown[]) => situations),
    useCanonicalSituations: vi.fn(() => ({ situations: [], loading: false, error: null, refresh: vi.fn() })),
  };
});

vi.mock("@/lib/fetchWithTimeout", () => ({
  fetchWithTimeout: vi.fn(() => Promise.resolve({ json: async () => ({ games: [] }) })),
}));

function testSignal(id: number, is_featured = false) {
  return {
    id,
    title: `Signal ${id}`,
    summary: `Signal ${id} summary`,
    action_takeaway: `Signal ${id} takeaway`,
    player_name: "Test Player",
    team: "NYY",
    signal_type: "lineup",
    confidence_score: 82,
    verdict: "review",
    status_tag: "review",
    source_count: 2,
    is_featured,
    created_at: "2026-06-03T12:00:00Z",
    updated_at: "2026-06-03T12:00:00Z",
    topic: "MLB",
  };
}

function authState(isPro: boolean) {
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
  };
}

function signalGateState(isPro: boolean) {
  return {
    viewedIds: new Set<string>(),
    freeCount: 0,
    isGated: !isPro,
    isPro,
    canView: vi.fn(() => true),
    rowIsFree: vi.fn((index: number) => isPro || index < 3),
    consumeSignal: vi.fn(),
    modalOpen: false,
    modalTrigger: "generic" as const,
    openModal: vi.fn(),
    closeModal: vi.fn(),
  };
}

function setEntitlement(isPro: boolean) {
  mockUseAuth.mockReturnValue(authState(isPro));
  mockUseSignalGate.mockReturnValue(signalGateState(isPro));
}

describe("entitlement UI leak coverage", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("active Pro does not see GET PRO ACCESS on /tools and sees billing management", () => {
    setEntitlement(true);
    mockOpenBillingPortal.mockResolvedValue(undefined);

    render(<ToolsHub />);

    expect(screen.queryByText(/Get Pro Access/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bLIMITED\b/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/\bINCLUDED\b/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Your Pro plan includes these workflows. Some tools may remain in watch mode while coverage, replay trails, and outcome tracking come online.")).toBeInTheDocument();
    expect(screen.getAllByText(/Manage Billing/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("topbar-manage-billing")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-sign-out")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tools-manage-billing"));
    expect(mockOpenBillingPortal).toHaveBeenCalledWith("subscriber@example.com");
  });

  it("non-Pro still sees upgrade CTA on /tools", () => {
    setEntitlement(false);

    render(<ToolsHub />);

    expect(screen.getByText(/Get Pro Access/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\bLIMITED\b/i).length).toBeGreaterThan(0);
  });

  it("active Pro does not see GO PRO, $19/MO, or Pro unlocks upsell on /signals", () => {
    setEntitlement(true);

    render(<SignalsPage />);

    expect(screen.queryByText(/Go Pro/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$19\/mo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pro unlocks/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Manage Alerts/i).length).toBeGreaterThan(0);
  });

  it("non-Pro still sees Go Pro CTA and Pro unlock messaging on /signals", () => {
    setEntitlement(false);

    render(<SignalsPage />);

    expect(screen.getAllByText(/Go Pro/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Pro unlocks full signal detail/i)).toBeInTheDocument();
  });

  it("active Pro does not see Get MLB alerts upsell on /mlb and sees alert management", async () => {
    setEntitlement(true);

    render(<MLBBoard />);

    expect(screen.queryByText("Get MLB alerts before first pitch")).not.toBeInTheDocument();
    expect(screen.queryByText("Get MLB alerts")).not.toBeInTheDocument();
    expect(await screen.findByText("Manage MLB alerts before first pitch")).toBeInTheDocument();
    expect(screen.getByText("Manage MLB alerts")).toBeInTheDocument();
  });

  it("non-Pro still sees league alert CTA on /mlb", async () => {
    setEntitlement(false);

    render(<MLBBoard />);

    expect(screen.getByText("Get MLB alerts before first pitch")).toBeInTheDocument();
    expect(screen.getByText("Get MLB alerts")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Slate context loading.")).not.toBeInTheDocument());
  });
});
