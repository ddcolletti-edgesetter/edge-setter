import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeBillingPortalAccess,
  checkoutSessionHasPaidSubscription,
  checkoutSessionMatchesRequestedEmail,
  createBillingPortalIdentityToken,
  getAutoSeedOwnerEmail,
  getConfiguredAdminPassword,
  verifyBillingPortalIdentityToken,
} from "./routes";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe("subscriber safety configuration", () => {
  beforeEach(() => {
    process.env.BILLING_AUTH_SECRET = "test-billing-auth-secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("rejects billing portal access when auth identity is missing", () => {
    const result = authorizeBillingPortalAccess("subscriber@example.com", null, () => undefined);

    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("does not create billing auth tokens in production without BILLING_AUTH_SECRET", () => {
    process.env.NODE_ENV = "production";
    delete process.env.BILLING_AUTH_SECRET;
    process.env.SESSION_SECRET = "session-secret-must-not-sign-billing";
    process.env.ADMIN_PASSWORD = "admin-password-must-not-sign-billing";
    process.env.STRIPE_WEBHOOK_SECRET = "stripe-webhook-secret-must-not-sign-billing";

    expect(createBillingPortalIdentityToken("subscriber@example.com")).toBeNull();
  });

  it("uses BILLING_AUTH_SECRET for billing auth tokens in production when present", () => {
    process.env.NODE_ENV = "production";
    process.env.BILLING_AUTH_SECRET = "production-billing-auth-secret";
    process.env.SESSION_SECRET = "session-secret-must-not-sign-billing";
    process.env.ADMIN_PASSWORD = "admin-password-must-not-sign-billing";
    process.env.STRIPE_WEBHOOK_SECRET = "stripe-webhook-secret-must-not-sign-billing";

    const token = createBillingPortalIdentityToken("subscriber@example.com");

    expect(token).toEqual(expect.any(String));
    expect(verifyBillingPortalIdentityToken(token)).toBe("subscriber@example.com");
  });

  it("rejects billing portal access for non-subscribers", () => {
    const token = createBillingPortalIdentityToken("free@example.com");
    const result = authorizeBillingPortalAccess("free@example.com", token, email => ({
      id: "user_free",
      email,
      plan: "free",
      access_status: "active",
      stripe_customer_id: "cus_free",
    } as any));

    expect(result).toMatchObject({ ok: false, status: 404, error: "Billing account not found" });
  });

  it("rejects billing portal access for unknown emails without exposing subscription state", () => {
    const token = createBillingPortalIdentityToken("unknown@example.com");
    const result = authorizeBillingPortalAccess("unknown@example.com", token, () => undefined);

    expect(result).toMatchObject({ ok: false, status: 404, error: "Billing account not found" });
  });

  it("rejects billing portal access when requested email does not match verified identity", () => {
    const token = createBillingPortalIdentityToken("subscriber@example.com");
    const result = authorizeBillingPortalAccess("other@example.com", token, () => {
      throw new Error("should not look up mismatched users");
    });

    expect(result).toMatchObject({ ok: false, status: 403, error: "Forbidden" });
  });

  it("allows a subscriber to open their own billing portal when a Stripe customer ID exists", () => {
    const token = createBillingPortalIdentityToken("Subscriber@Example.com");
    const result = authorizeBillingPortalAccess("subscriber@example.com", token, email => ({
      id: "user_subscriber",
      email,
      plan: "pro",
      access_status: "active",
      stripe_customer_id: "cus_subscriber",
    } as any));

    expect(result).toMatchObject({
      ok: true,
      email: "subscriber@example.com",
      user: { stripe_customer_id: "cus_subscriber" },
    });
  });

  it("does not authorize a portal URL for an unrelated email", () => {
    const token = createBillingPortalIdentityToken("subscriber@example.com");
    const result = authorizeBillingPortalAccess("unrelated@example.com", token, () => undefined);

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("url");
  });

  it("does not print billing auth secrets while creating or verifying identity tokens", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const token = createBillingPortalIdentityToken("subscriber@example.com");
    expect(verifyBillingPortalIdentityToken(token)).toBe("subscriber@example.com");

    const consoleOutput = [
      ...logSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...warnSpy.mock.calls,
    ].flat().join(" ");

    expect(consoleOutput).not.toContain("test-billing-auth-secret");
  });
});
