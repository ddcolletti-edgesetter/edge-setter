/**
 * Transactional email via Resend.
 * Falls back to console log if RESEND_API_KEY is not set.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL = process.env.FROM_EMAIL ?? "Edge Setter <hello@edgesetter.com>";
const BASE_URL = process.env.BASE_URL ?? "https://edgesetter.net";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log(`[email] RESEND_API_KEY not set — would send to ${opts.to}: ${opts.subject}`);
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[email] Resend error:", err);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] sendEmail failed:", e);
    return false;
  }
}

export async function sendWaitlistConfirmation(email: string): Promise<void> {
  const signalBoardUrl = `${BASE_URL}/#/signals`;
  await sendEmail({
    to: email,
    subject: "You're on the Edge Setter list",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080706;font-family:'Arial Narrow',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080706;padding:40px 20px">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#0C0A08;border-top:2px solid #C9A84C;border-radius:2px;padding:40px 36px">
        <tr><td>
          <p style="margin:0 0 4px;font-family:'Arial Narrow',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#C9A84C">Edge Setter</p>
          <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:28px;font-weight:900;color:#F0E8D6;line-height:1.1">You're on the list.</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#B8AD98;line-height:1.6">
            You're on the early-access list for Edge Setter.<br>
            We'll send your invite as soon as your spot opens.<br>
            In the meantime, you can preview the signal board here.
          </p>
          <a href="${signalBoardUrl}" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#080706;font-family:'Arial Narrow',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;text-decoration:none;border-radius:1px">
            Preview Signal Board →
          </a>
          <hr style="margin:32px 0;border:none;border-top:1px solid #242018">
          <p style="margin:0;font-size:12px;color:#6E6458">
            You're receiving this because you signed up at edgesetter.com. 
            Reply to unsubscribe.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

export async function sendProWelcome(email: string): Promise<void> {
  const proUrl = `${BASE_URL}/#/pro`;
  await sendEmail({
    to: email,
    subject: "Pro access activated — Edge Setter",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#080706;font-family:'Arial Narrow',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080706;padding:40px 20px">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#0C0A08;border-top:2px solid #C9A84C;padding:40px 36px">
        <tr><td>
          <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#3DAE72">Pro Access Active</p>
          <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;font-weight:900;color:#F0E8D6">Welcome to Edge Setter Pro.</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#B8AD98;line-height:1.6">
            Your Pro access is active at $19/month. You now have full access to the verified signal board — confidence scores, source notes, verdict detail, and the complete feed.
          </p>
          <a href="${proUrl}" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#080706;font-family:'Arial Narrow',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;text-decoration:none">
            Open Pro Board →
          </a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

export async function sendBillingRetryEmail(email: string, attemptCount: number): Promise<void> {
  const portalUrl = `${BASE_URL}/#/pro`;
  await sendEmail({
    to: email,
    subject: `Action needed: payment failed — Edge Setter Pro`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#080706;font-family:'Arial Narrow',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080706;padding:40px 20px">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#0C0A08;border-top:2px solid #D4932A;padding:40px 36px">
        <tr><td>
          <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#D4932A">Billing Notice</p>
          <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:24px;font-weight:900;color:#F0E8D6">Payment attempt ${attemptCount} failed.</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#B8AD98;line-height:1.6">
            We couldn't process your Edge Setter Pro payment. Your access remains active while we retry — but please update your payment method to avoid interruption.
          </p>
          <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#D4932A;color:#080706;font-family:'Arial Narrow',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;text-decoration:none">
            Update Payment Method →
          </a>
          <hr style="margin:32px 0;border:none;border-top:1px solid #242018">
          <p style="margin:0;font-size:12px;color:#6E6458">
            Your subscription will be canceled automatically after all retry attempts fail.
            Reply to this email if you need help.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
