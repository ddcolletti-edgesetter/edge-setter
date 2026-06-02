import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MyEdge from "@/pages/MyEdge";
import { useAuth } from "@/context/AuthContext";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);

describe("subscriber-aware UI state", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shows active Pro subscriber state on My Edge without upgrade CTAs", () => {
    mockUseAuth.mockReturnValue({
      email: "subscriber@example.com",
      isPro: true,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<MyEdge />);

    expect(screen.getByText("Pro access active - My Edge preview")).toBeInTheDocument();
    expect(screen.getAllByText("Pro Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Manage Billing").length).toBeGreaterThan(0);
    expect(screen.queryByText("Go Pro - $19/mo")).not.toBeInTheDocument();
    expect(screen.queryByText("PRO - $19/MO")).not.toBeInTheDocument();
  });

  it("keeps upgrade CTAs visible for non-subscribers on My Edge", () => {
    mockUseAuth.mockReturnValue({
      email: null,
      isPro: false,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<MyEdge />);

    expect(screen.getByText("Personal watchlist coming soon")).toBeInTheDocument();
    expect(screen.getByText("Go Pro - $19/mo")).toBeInTheDocument();
    expect(screen.getByText("PRO - $19/MO")).toBeInTheDocument();
  });
});
