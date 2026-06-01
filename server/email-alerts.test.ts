import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PERSONAL_EMAIL = "ddcolletti@gmail.com";

async function loadEmailModule() {
  vi.resetModules();
  return import("./email");
}

function mockSuccessfulFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => "",
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

describe("alert email safety guard", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test_resend_key";
    process.env.FROM_EMAIL = "Edge Setter <alerts@example.com>";
    delete process.env.EMAIL_ALERTS_ENABLED;
    delete process.env.ALERT_EMAIL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.FROM_EMAIL;
    delete process.env.EMAIL_ALERTS_ENABLED;
    delete process.env.ALERT_EMAIL;
  });

  it("suppresses alert email by default", async () => {
    const fetchMock = mockSuccessfulFetch();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendAlertEmail } = await loadEmailModule();

    const sent = await sendAlertEmail({
      to: "ops@example.com",
      subject: "Site Watch Alert",
      html: "<p>test</p>",
    });

    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("alert suppressed"));
    expect(logSpy.mock.calls.flat().join(" ")).not.toContain("test_resend_key");
  });

  it("sends only when EMAIL_ALERTS_ENABLED is exactly true", async () => {
    const fetchMock = mockSuccessfulFetch();
    const { sendAlertEmail } = await loadEmailModule();

    for (const value of ["TRUE", "1", "yes", "false", ""]) {
      process.env.EMAIL_ALERTS_ENABLED = value;
      const sent = await sendAlertEmail({
        to: "ops@example.com",
        subject: `Suppressed ${value}`,
        html: "<p>test</p>",
      });
      expect(sent).toBe(false);
    }

    process.env.EMAIL_ALERTS_ENABLED = "true";
    const sent = await sendAlertEmail({
      to: "ops@example.com",
      subject: "Allowed",
      html: "<p>test</p>",
    });

    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe("https://api.resend.com/emails");
    expect(JSON.parse(request[1].body)).toMatchObject({
      from: "Edge Setter <alerts@example.com>",
      to: ["ops@example.com"],
      subject: "Allowed",
    });
  });

  it("does not default alert recipients to a personal email", async () => {
    const { getConfiguredAlertRecipients } = await loadEmailModule();

    expect(getConfiguredAlertRecipients()).toEqual([]);

    process.env.ALERT_EMAIL = "ops@example.com";
    expect(getConfiguredAlertRecipients()).toEqual(["ops@example.com"]);
    expect(getConfiguredAlertRecipients()).not.toContain(PERSONAL_EMAIL);
  });

  it("suppresses enabled alert email when recipients are empty", async () => {
    process.env.EMAIL_ALERTS_ENABLED = "true";
    const fetchMock = mockSuccessfulFetch();
    const { sendAlertEmail } = await loadEmailModule();

    await expect(sendAlertEmail({
      to: ["", "   "],
      subject: "No Recipients",
      html: "<p>test</p>",
    })).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
