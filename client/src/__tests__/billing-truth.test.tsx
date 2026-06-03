import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Billing from "@/pages/Billing";
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

function mockActiveSubscriber() {
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
}

describe("Billing subscriber truth", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shows active Pro billing state without fabricated zero amount or inactive status", () => {
    mockActiveSubscriber();

    render(<Billing />);

    expect(screen.getByText("PRO - ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("EdgeSetter Pro")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Managed in Stripe")).toBeInTheDocument();
    expect(screen.getByText("Managed in Stripe portal")).toBeInTheDocument();
    expect(screen.getByText("Open Billing Portal")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  });

  it("opens billing portal directly when billing auth is valid", async () => {
    mockActiveSubscriber();
    mockApiRequest.mockResolvedValue(jsonResponse({ url: null }));

    render(<Billing />);

    fireEvent.click(screen.getByText("Open Billing Portal"));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith("POST", "/api/billing/portal", { email: "subscriber@example.com" });
    });
    expect(mockApiRequest).not.toHaveBeenCalledWith("POST", "/api/billing/session", expect.anything());
  });

  it("refreshes missing billing auth before retrying portal open", async () => {
    mockActiveSubscriber();
    mockApiRequest
      .mockRejectedValueOnce(new Error("401"))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ url: null }));

    render(<Billing />);

    fireEvent.click(screen.getByText("Open Billing Portal"));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenNthCalledWith(1, "POST", "/api/billing/portal", { email: "subscriber@example.com" });
      expect(mockApiRequest).toHaveBeenNthCalledWith(2, "POST", "/api/billing/session", { email: "subscriber@example.com" });
      expect(mockApiRequest).toHaveBeenNthCalledWith(3, "POST", "/api/billing/portal", { email: "subscriber@example.com" });
    });
  });

  it("shows upgrade state for non-Pro users", () => {
    mockUseAuth.mockReturnValue({
      email: null,
      user: null,
      isPro: false,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<Billing />);

    expect(screen.getByText("FREE PLAN")).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
    expect(screen.queryByText("Open Billing Portal")).not.toBeInTheDocument();
    expect(screen.queryByText("PRO - ACTIVE")).not.toBeInTheDocument();
  });

  it("shows canceled subscriber state without Pro active or billing portal access", () => {
    mockUseAuth.mockReturnValue({
      email: "subscriber@example.com",
      user: {
        email: "subscriber@example.com",
        plan: "free",
        access_status: "canceled",
        billing_status: "canceled",
        stripe_customer_id: "cus_test",
        is_pro: false,
      },
      isPro: false,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<Billing />);

    expect(screen.getByText("PRO - CANCELED")).toBeInTheDocument();
    expect(screen.getByText("Canceled")).toBeInTheDocument();
    expect(screen.getAllByText("Not active").length).toBeGreaterThan(0);
    expect(screen.getByText(/Resubscribe to restore subscriber features/i)).toBeInTheDocument();
    expect(screen.queryByText("PRO - ACTIVE")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Billing Portal")).not.toBeInTheDocument();
  });
});
