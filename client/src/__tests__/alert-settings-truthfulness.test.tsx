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

  it("shows Pro state while making paused email delivery explicit", async () => {
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

    expect(await screen.findByText("Pro Alert Desk - Pro Active")).toBeInTheDocument();
    expect(screen.getByText("Alert delivery paused")).toBeInTheDocument();
    expect(screen.getAllByText(/Email delivery is currently disabled during launch QA/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Email delivery paused")).toBeDisabled();
    expect(screen.queryByText("Alerts enabled")).not.toBeInTheDocument();
    expect(screen.queryByText(/Send alerts to/i)).not.toBeInTheDocument();
  });
});
