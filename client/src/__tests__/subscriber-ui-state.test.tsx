import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MyEdge from "@/pages/MyEdge";
import ProPage from "@/pages/ProPage";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";

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

const mockUseAuth = vi.mocked(useAuth);
const mockApiRequest = vi.mocked(apiRequest);

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

describe("subscriber-aware UI state", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shows active Pro subscriber state on My Edge without upgrade CTAs", () => {
    const logout = vi.fn();
    mockUseAuth.mockReturnValue({
      email: "subscriber@example.com",
      user: {
        email: "subscriber@example.com",
        plan: "pro",
        access_status: "active",
        billing_status: "active",
        stripe_customer_id: "cus_test",
        is_pro: true,
      },
      isPro: true,
      authLoading: false,
      login: vi.fn(),
      logout,
    });

    render(<MyEdge />);

    expect(screen.getByText("Pro access active - My Edge preview")).toBeInTheDocument();
    expect(screen.getAllByText("Pro Active").length).toBeGreaterThan(0);
    expect(screen.getByTestId("sidebar-manage-billing")).toHaveTextContent("MANAGE BILLING");
    expect(screen.getByTestId("sidebar-sign-out")).toHaveTextContent("SIGN OUT");
    expect(screen.getByTestId("topbar-manage-billing")).toHaveTextContent("Manage Billing");
    expect(screen.getByTestId("topbar-sign-out")).toHaveTextContent("Sign Out");
    fireEvent.click(screen.getByTestId("sidebar-sign-out"));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Go Pro - $19/mo")).not.toBeInTheDocument();
    expect(screen.queryByText("PRO - $19/MO")).not.toBeInTheDocument();
    expect(screen.queryByText("Q3 2026")).not.toBeInTheDocument();
    expect(screen.queryByText("Q4 2026")).not.toBeInTheDocument();
  });

  it("opens the active Pro sidebar billing portal with session refresh retry", async () => {
    mockUseAuth.mockReturnValue({
      email: "subscriber@example.com",
      user: {
        email: "subscriber@example.com",
        plan: "pro",
        access_status: "active",
        billing_status: "active",
        stripe_customer_id: "cus_test",
        is_pro: true,
      },
      isPro: true,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockApiRequest
      .mockRejectedValueOnce(new Error("401"))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ url: null }));

    render(<MyEdge />);

    fireEvent.click(screen.getByTestId("sidebar-manage-billing"));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenNthCalledWith(1, "POST", "/api/billing/portal", { email: "subscriber@example.com" });
      expect(mockApiRequest).toHaveBeenNthCalledWith(2, "POST", "/api/billing/session", { email: "subscriber@example.com" });
      expect(mockApiRequest).toHaveBeenNthCalledWith(3, "POST", "/api/billing/portal", { email: "subscriber@example.com" });
    });
  });

  it("keeps upgrade CTAs visible for non-subscribers on My Edge", () => {
    mockUseAuth.mockReturnValue({
      email: null,
      user: null,
      isPro: false,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<MyEdge />);

    expect(screen.getByText("Personal watchlist coming soon")).toBeInTheDocument();
    expect(screen.getAllByText("Sign In").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Get Pro/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Go Pro - $19/mo")).toBeInTheDocument();
    expect(screen.queryByText("PRO - $19/MO")).not.toBeInTheDocument();
    expect(screen.getByText("GET PRO / $19 MONTH")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-manage-billing")).not.toBeInTheDocument();
    expect(screen.queryByText("MANAGE BILLING")).not.toBeInTheDocument();
    expect(screen.queryByText("Q3 2026")).not.toBeInTheDocument();
    expect(screen.queryByText("Q4 2026")).not.toBeInTheDocument();
  });

  it("routes signed-out shell Sign In to login instead of the Pro sales page", () => {
    mockUseAuth.mockReturnValue({
      email: null,
      user: null,
      isPro: false,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<MyEdge />);

    act(() => {
      fireEvent.click(screen.getByTestId("topbar-sign-in"));
    });

    expect(window.location.pathname).toBe("/login");
    expect(window.location.pathname).not.toBe("/pro");
  });

  it("routes signed-out shell Get Pro to the Pro sales page", () => {
    mockUseAuth.mockReturnValue({
      email: null,
      user: null,
      isPro: false,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<MyEdge />);

    act(() => {
      fireEvent.click(screen.getByText("GET PRO / $19 MONTH"));
    });

    expect(window.location.pathname).toBe("/pro");
  });

  it("/pro renders an existing-subscriber sign-in module that does not trigger checkout", () => {
    mockUseAuth.mockReturnValue({
      email: null,
      user: null,
      isPro: false,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<ProPage />);

    expect(screen.getByText("Already a subscriber?")).toBeInTheDocument();
    expect(screen.getByText("Sign in to restore your Pro access.")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId("button-pro-sign-in"));
    });

    expect(window.location.pathname).toBe("/login");
    expect(mockApiRequest).not.toHaveBeenCalledWith("POST", "/api/checkout", expect.anything());
  });

  it("logout returns the shell to signed-out state with Sign In visible", () => {
    let active = true;
    const logout = vi.fn(() => {
      active = false;
    });
    mockUseAuth.mockImplementation(() => active ? {
      email: "subscriber@example.com",
      user: {
        email: "subscriber@example.com",
        plan: "pro",
        access_status: "active",
        billing_status: "active",
        stripe_customer_id: "cus_test",
        is_pro: true,
      },
      isPro: true,
      authLoading: false,
      login: vi.fn(),
      logout,
    } : {
      email: null,
      user: null,
      isPro: false,
      authLoading: false,
      login: vi.fn(),
      logout,
    });

    const { rerender } = render(<MyEdge />);

    fireEvent.click(screen.getByTestId("sidebar-sign-out"));
    expect(logout).toHaveBeenCalledTimes(1);

    rerender(<MyEdge />);

    expect(screen.getByTestId("sidebar-sign-in")).toHaveTextContent("SIGN IN");
    expect(screen.getByTestId("topbar-sign-in")).toHaveTextContent("Sign In");
    expect(screen.getAllByText(/Get Pro/i).length).toBeGreaterThan(0);
  });
});
