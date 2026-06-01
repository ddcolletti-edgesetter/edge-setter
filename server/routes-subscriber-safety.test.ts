import { afterEach, describe, expect, it } from "vitest";
import {
  checkoutSessionHasPaidSubscription,
  checkoutSessionMatchesRequestedEmail,
  getAutoSeedOwnerEmail,
  getConfiguredAdminPassword,
} from "./routes";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe("subscriber safety configuration", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("does not auto-seed a Pro owner in production", () => {
    process.env.NODE_ENV = "production";
    process.env.OWNER_EMAIL = "owner@example.com";

    expect(getAutoSeedOwnerEmail()).toBeNull();
  });

  it("does not fall back to a personal owner email", () => {
    process.env.NODE_ENV = "development";
    delete process.env.OWNER_EMAIL;

    expect(getAutoSeedOwnerEmail()).toBeNull();
  });

  it("requires ADMIN_PASSWORD to be explicitly configured", () => {
    delete process.env.ADMIN_PASSWORD;

    expect(getConfiguredAdminPassword()).toBeNull();
  });

  it("uses an explicitly configured admin password", () => {
    process.env.ADMIN_PASSWORD = "configured-secret";

    expect(getConfiguredAdminPassword()).toBe("configured-secret");
  });

  it("requires checkout session email to match the requested subscriber email", () => {
    const session = {
      metadata: { email: "buyer@example.com" },
      customer_email: "fallback@example.com",
    };

    expect(checkoutSessionMatchesRequestedEmail(session, "buyer@example.com")).toBe(true);
    expect(checkoutSessionMatchesRequestedEmail(session, "other@example.com")).toBe(false);
  });

  it("only treats completed paid subscription checkout sessions as Pro-granting", () => {
    expect(checkoutSessionHasPaidSubscription({
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
      subscription: "sub_123",
    })).toBe(true);

    expect(checkoutSessionHasPaidSubscription({
      mode: "subscription",
      status: "open",
      payment_status: "paid",
      subscription: "sub_123",
    })).toBe(false);

    expect(checkoutSessionHasPaidSubscription({
      mode: "subscription",
      status: "complete",
      payment_status: "unpaid",
      subscription: "sub_123",
    })).toBe(false);
  });
});
