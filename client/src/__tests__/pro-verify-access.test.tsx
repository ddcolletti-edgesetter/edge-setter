import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProPage from "@/pages/ProPage";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/context/AuthContext";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackProVisit: vi.fn(),
  trackCheckoutClick: vi.fn(),
}));

const mockApiRequest = vi.mocked(apiRequest);
const mockUseAuth = vi.mocked(useAuth);

function mockAuth(login = vi.fn()) {
  mockUseAuth.mockReturnValue({
    email: null,
    user: null,
    isPro: false,
    authLoading: false,
    login,
    logout: vi.fn(),
  });
  return login;
}

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

describe("Pro Verify Access", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("succeeds for active subscriber email and normalizes lookup", async () => {
    const login = mockAuth();
    mockApiRequest.mockResolvedValue(jsonResponse({
      email: "subscriber@example.com",
      plan: "pro",
      access_status: "active",
      billing_status: "active",
      is_pro: true,
    }));

    render(<ProPage />);

    fireEvent.change(screen.getByTestId("input-pro-email-check"), {
      target: { value: "  Subscriber@Example.COM  " },
    });
    fireEvent.click(screen.getByTestId("button-check-access"));

    await screen.findByText("Account Active");
    expect(mockApiRequest).toHaveBeenCalledWith("GET", "/api/user?email=subscriber%40example.com");
    expect(mockApiRequest).toHaveBeenCalledWith("POST", "/api/billing/session", { email: "subscriber@example.com" });
    expect(login).toHaveBeenCalledWith("subscriber@example.com");
    expect(screen.queryByText("No active Pro subscription found for that email.")).not.toBeInTheDocument();
  });

  it("fails clearly for non-subscriber verify access", async () => {
    mockAuth();
    mockApiRequest.mockResolvedValue(jsonResponse(null));

    render(<ProPage />);

    fireEvent.change(screen.getByTestId("input-pro-email-check"), {
      target: { value: "free@example.com" },
    });
    fireEvent.click(screen.getByTestId("button-check-access"));

    expect(await screen.findByText("No active Pro subscription found for that email.")).toBeInTheDocument();
  });

  it("fails clearly for canceled subscriber verify access", async () => {
    mockAuth();
    mockApiRequest.mockResolvedValue(jsonResponse({
      email: "subscriber@example.com",
      plan: "free",
      access_status: "canceled",
      billing_status: "canceled",
      is_pro: false,
    }));

    render(<ProPage />);

    fireEvent.change(screen.getByTestId("input-pro-email-check"), {
      target: { value: "subscriber@example.com" },
    });
    fireEvent.click(screen.getByTestId("button-check-access"));

    await waitFor(() => {
      expect(screen.getByText("No active Pro subscription found for that email.")).toBeInTheDocument();
    });
  });
});
