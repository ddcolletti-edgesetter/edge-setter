import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MyEdge from "@/pages/MyEdge";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);
const mockApiRequest = vi.mocked(apiRequest);

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

describe("subscriber-aware UI state", () => {
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
    expect(screen.getByTestId("sidebar-sign-out")).toHaveTextContent("Sign Out");
    expect(screen.getByTestId("topbar-manage-billing")).toHaveTextContent("Manage Billing");
    expect(screen.getByTestId("topbar-sign-out")).toHaveTextContent("Sign Out");
    fireEvent.click(screen.getByTestId("sidebar-sign-out"));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Go Pro - $19/mo")).not.toBeInTheDocument();
    expect(screen.queryByText("PRO - $19/MO")).not.toBeInTheDocument();
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
    expect(screen.getByText("Go Pro - $19/mo")).toBeInTheDocument();
    expect(screen.getByText("PRO - $19/MO")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-manage-billing")).not.toBeInTheDocument();
    expect(screen.queryByText("MANAGE BILLING")).not.toBeInTheDocument();
  });
});
