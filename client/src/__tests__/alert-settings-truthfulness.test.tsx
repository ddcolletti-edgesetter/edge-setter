import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AlertSettingsPage from "@/pages/AlertSettingsPage";
import { useAuth } from "@/context/AuthContext";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);

describe("AlertSettingsPage delivery truthfulness", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows paused saved-preference state without claiming delivery is active", async () => {
    mockUseAuth.mockReturnValue({
      email: "subscriber@example.com",
      isPro: true,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
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
    })));

    render(<AlertSettingsPage />);

    expect(await screen.findByText("Pro access active")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Saved Alert Preferences" })).toBeInTheDocument();
    expect(screen.getByText("Alert delivery is not active yet. You can save preferences now.")).toBeInTheDocument();
    expect(screen.getByText(/These settings are saved preferences only/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved email: subscriber@example.com/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Email delivery paused")).toBeDisabled();
    expect(screen.queryByText(/Pro Alert Desk - Pro Active/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Watchlist Alerts$/i)).not.toBeInTheDocument();
  });
});
