import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MyEdge from "@/pages/MyEdge";
import ProPage from "@/pages/ProPage";
import LoginPage from "@/pages/LoginPage";
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

function signedOutAuth(login = vi.fn()) {
  return {
    email: null,
    user: null,
    isPro: false,
    authLoading: false,
    login,
    logout: vi.fn(),
  };
}

function signedInNonProAuth(login = vi.fn()) {
  return {
    email: "free@example.com",
    user: {
      email: "free@example.com",
      plan: "free",
      access_status: "free",
      billing_status: null,
      stripe_customer_id: null,
      is_pro: false,
    },
    isPro: false,
    authLoading: false,
    login,
    logout: vi.fn(),
  };
}

function activeProAuth(logout = vi.fn()) {
  return {
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
  };
}

async function submitLogin(email = "subscriber@example.com") {
  fireEvent.change(screen.getByTestId("input-login-email"), {
    target: { value: email },
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("button-login-submit"));
  });
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
    mockUseAuth.mockReturnValue(activeProAuth(logout));

    render(<MyEdge />);

    expect(screen.getByRole("heading", { name: "My Edge" })).toBeInTheDocument();
    expect(screen.getAllByText("Pro access active").length).toBeGreaterThan(0);
    expect(screen.getByText(/Choose leagues, teams, and players to prioritize your EdgeSetter feed/i)).toBeInTheDocument();
    expect(screen.getByText("Followed leagues")).toBeInTheDocument();
    expect(screen.getByText("Followed teams")).toBeInTheDocument();
    expect(screen.getByText("Watchlist")).toBeInTheDocument();
    expect(screen.getByText("Alert preferences")).toBeInTheDocument();
    expect(screen.getAllByText("Manage Billing").length).toBeGreaterThan(0);
    expect(screen.queryByText(/My Edge preview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/personalization is still a preview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/examples below remain preview-only/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pro Active - Preview/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("sidebar-manage-billing")).toHaveTextContent("MANAGE BILLING");
    expect(screen.getByTestId("sidebar-sign-out")).toHaveTextContent("SIGN OUT");
    expect(screen.getByTestId("topbar-manage-billing")).toHaveTextContent("Manage Billing");
    expect(screen.getByTestId("topbar-sign-out")).toHaveTextContent("Sign Out");
    fireEvent.click(screen.getByTestId("sidebar-sign-out"));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Go Pro - $19/mo")).not.toBeInTheDocument();
    expect(screen.queryByText("PRO - $19/MO")).not.toBeInTheDocument();
    expect(screen.queryByText(/preview-only/i)).not.toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/\bpreview\b/i);
    expect(screen.queryByText("Q3 2026")).not.toBeInTheDocument();
    expect(screen.queryByText("Q4 2026")).not.toBeInTheDocument();
  });

  it("opens the active Pro sidebar billing portal with session refresh retry", async () => {
    mockUseAuth.mockReturnValue(activeProAuth());
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
    mockUseAuth.mockReturnValue(signedOutAuth());

    render(<MyEdge />);

    expect(screen.getByText("Personal watchlist coming soon")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-sign-in")).toHaveTextContent("Sign In");
    expect(screen.getByTestId("sidebar-sign-in")).toHaveTextContent("SIGN IN");
    expect(screen.getAllByText(/Get Pro/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Go Pro - $19/mo")).toBeInTheDocument();
    expect(screen.queryByText("PRO - $19/MO")).not.toBeInTheDocument();
    expect(screen.getByText("GET PRO / $19 MONTH")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-manage-billing")).not.toBeInTheDocument();
    expect(screen.queryByText("MANAGE BILLING")).not.toBeInTheDocument();
    expect(screen.queryByText("Q3 2026")).not.toBeInTheDocument();
    expect(screen.queryByText("Q4 2026")).not.toBeInTheDocument();
  });

  it("routes signed-out topbar Sign In to login with next=currentPath instead of the Pro sales page", () => {
    window.history.pushState({}, "", "/my-edge");
    mockUseAuth.mockReturnValue(signedOutAuth());

    render(<MyEdge />);

    act(() => {
      fireEvent.click(screen.getByTestId("topbar-sign-in"));
    });

    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toBe("?next=%2Fmy-edge");
    expect(window.location.pathname).not.toBe("/pro");
  });

  it("routes signed-out sidebar Sign In to login with next=currentPath", () => {
    window.history.pushState({}, "", "/my-edge");
    mockUseAuth.mockReturnValue(signedInNonProAuth());

    render(<MyEdge />);

    act(() => {
      fireEvent.click(screen.getByTestId("sidebar-sign-in"));
    });

    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toBe("?next=%2Fmy-edge");
  });

  it("routes signed-out shell Get Pro to the Pro sales page", () => {
    window.history.pushState({}, "", "/my-edge");
    mockUseAuth.mockReturnValue(signedOutAuth());

    render(<MyEdge />);

    act(() => {
      fireEvent.click(screen.getByText("GET PRO / $19 MONTH"));
    });

    expect(window.location.pathname).toBe("/pro");
  });

  it("/login is a restore-access page, not a checkout sales page", () => {
    mockUseAuth.mockReturnValue(signedOutAuth());

    render(<LoginPage />);

    expect(screen.getByText("Already a subscriber?")).toBeInTheDocument();
    expect(screen.getByText("Sign in to restore access")).toBeInTheDocument();
    expect(screen.getByTestId("button-login-submit")).toHaveTextContent("Sign In");
    expect(screen.queryByTestId("button-checkout")).not.toBeInTheDocument();
    expect(screen.queryByText("Edge Setter Pro")).not.toBeInTheDocument();
    expect(mockApiRequest).not.toHaveBeenCalledWith("POST", "/api/checkout", expect.anything());
  });

  it.each([
    ["/login?next=/my-edge", "/my-edge"],
    ["/login?next=/tools", "/tools"],
    ["/login", "/"],
    ["/login?next=https://evil.com", "/"],
    ["/login?next=/pro", "/pro"],
  ])("successful login from %s navigates to %s", async (initialPath, expectedPath) => {
    const login = vi.fn().mockResolvedValue(null);
    window.history.pushState({}, "", initialPath);
    mockUseAuth.mockReturnValue(signedOutAuth(login));

    render(<LoginPage />);

    await submitLogin();

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith("subscriber@example.com");
      expect(window.location.pathname).toBe(expectedPath);
    });
    expect(mockApiRequest).not.toHaveBeenCalledWith("POST", "/api/checkout", expect.anything());
  });

  it("/pro renders an existing-subscriber sign-in module that routes to restore access without checkout", () => {
    mockUseAuth.mockReturnValue(signedOutAuth());

    render(<ProPage />);

    expect(screen.getByText("Already a subscriber?")).toBeInTheDocument();
    expect(screen.getByText("Sign in to restore your Pro access.")).toBeInTheDocument();
    expect(screen.getByText(/Stop decoding raw feeds/i)).toBeInTheDocument();
    expect(screen.getByText(/See what changed before the market fully catches up/i)).toBeInTheDocument();
    expect(screen.queryByText(/2026 NFL Draft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Full Draft Board/i)).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId("button-pro-sign-in"));
    });

    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toBe("?next=%2F");
    expect(mockApiRequest).not.toHaveBeenCalledWith("POST", "/api/checkout", expect.anything());
  });

  it("logout returns the shell to signed-out state with Sign In visible", () => {
    let active = true;
    const logout = vi.fn(() => {
      active = false;
    });
    mockUseAuth.mockImplementation(() => active ? activeProAuth(logout) : signedOutAuth());

    const { rerender } = render(<MyEdge />);

    fireEvent.click(screen.getByTestId("sidebar-sign-out"));
    expect(logout).toHaveBeenCalledTimes(1);

    rerender(<MyEdge />);

    expect(screen.getByTestId("sidebar-sign-in")).toHaveTextContent("SIGN IN");
    expect(screen.getByTestId("topbar-sign-in")).toHaveTextContent("Sign In");
    expect(screen.getAllByText(/Get Pro/i).length).toBeGreaterThan(0);
  });
});
