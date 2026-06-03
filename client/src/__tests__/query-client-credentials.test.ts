import { describe, expect, it, vi, beforeEach } from "vitest";

import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

vi.mock("@/lib/fetchWithTimeout", () => ({
  fetchWithTimeout: vi.fn(),
}));

const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

describe("query client credentials", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  it("sends cookies with api requests so billing auth cookies reach portal endpoints", async () => {
    mockFetchWithTimeout.mockResolvedValue(new Response("{}", { status: 200 }));

    await apiRequest("POST", "/api/billing/session", { email: "subscriber@example.com" });

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      "/api/billing/session",
      expect.objectContaining({ credentials: "include" }),
      4500,
    );
  });

  it("sends cookies with default query reads used by subscriber state", async () => {
    mockFetchWithTimeout.mockResolvedValue(new Response("{}", { status: 200 }));

    const queryFn = getQueryFn<Record<string, unknown>>({ on401: "throw" });
    await queryFn({ queryKey: ["/api/user?email=subscriber%40example.com"] } as any);

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      "/api/user?email=subscriber%40example.com",
      expect.objectContaining({ credentials: "include" }),
      4500,
    );
  });
});
