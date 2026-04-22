/**
 * Transactional email via Resend.
 * Falls back to console log if RESEND_API_KEY is not set.
 */
import type { Signal } from "@shared/schema";

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

/* ─────────────────────────────────────────────────────────────────────────────
 * Daily Digest — Today's Top Signal
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Free-tier email:
 *   - Header: "Today's Top Signal" branding
 *   - #1 signal: full — title, player/team, confidence, verdict, action takeaway
 *   - Signals #2 and #3: locked teaser rows (blurred title, locked badge, Go Pro CTA)
 *   - Footer: unsubscribe link
 *
 * Colour palette matches the site:
 *   bg #0A0B0D  surface #111317  gold #CAA85A  text #F3EFE6  muted #B7AFA0
 */

/** Verdict colour mapping — matches the site's VerdictBadge colours. */
function verdictColor(verdict: string): string {
  switch (verdict.toLowerCase()) {
    case "confirmed":    return "#3DAE72";
    case "likely":       return "#CAA85A";
    case "rumor":        return "#B7AFA0";
    case "contradicted": return "#D94B4B";
    default:             return "#7E776A";
  }
}

/** Confidence score colour — matches Dashboard.tsx thresholds. */
function confColor(score: number): string {
  if (score >= 88) return "#3DAE72";
  if (score >= 75) return "#CAA85A";
  return "#B7AFA0";
}

/** Capitalise the first letter of a string. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build the full HTML for the free-tier daily digest.
 *
 * @param topSignal      The #1 signal shown in full.
 * @param teaserSignals  Signals 2 and 3 — shown as locked teasers (1–2 items).
 * @param unsubToken     Per-subscriber unsubscribe token.
 * @param dateLabel      Human-readable date for the subject line, e.g. "April 22, 2026".
 */
export function buildDailyDigestHtml(
  topSignal: Signal,
  teaserSignals: Signal[],
  unsubToken: string,
  dateLabel: string,
): string {
  const signalBoardUrl = `${BASE_URL}/#/dashboard`;
  const proUrl         = `${BASE_URL}/#/pro`;
  const unsubUrl       = `${BASE_URL}/api/digest/unsubscribe?token=${unsubToken}`;

  const conf     = topSignal.confidence_score ?? 80;
  const vColor   = verdictColor(topSignal.verdict);
  const cColor   = confColor(conf);

  // Locked teaser rows for signals 2–3
  const teaserRows = teaserSignals.slice(0, 2).map((s) => `
    <tr>
      <td style="padding:16px 0;border-top:1px solid #1B1F25">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <!-- Blurred / locked label row -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:2px 8px;background:#1B1F25;border:1px solid #2A2620;border-radius:2px">
                    <span style="font-family:'Arial Narrow',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#CAA85A">
                      🔒 Pro Only
                    </span>
                  </td>
                </tr>
              </table>
              <!-- Blurred title -->
              <p style="margin:8px 0 4px;font-family:Georgia,serif;font-size:15px;font-weight:700;color:#F3EFE6;line-height:1.3;
                         filter:blur(4px);-webkit-filter:blur(4px);user-select:none;pointer-events:none;">
                ${s.title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
              </p>
              <p style="margin:0;font-family:'Arial Narrow',Arial,sans-serif;font-size:11px;font-weight:700;
                         letter-spacing:0.14em;text-transform:uppercase;color:#CAA85A;
                         filter:blur(3px);-webkit-filter:blur(3px);">
                ${(s.player_name + " · " + s.team).replace(/</g, "&lt;").replace(/>/g, "&gt;")}
              </p>
            </td>
            <td align="right" valign="top" style="white-space:nowrap;padding-left:16px">
              <span style="font-family:Georgia,serif;font-size:22px;font-weight:900;color:#7E776A;
                            filter:blur(3px);-webkit-filter:blur(3px);">
                ${conf}
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Today's Top Signal — Edge Setter</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#0A0B0D;font-family:'Arial Narrow',Arial,'Helvetica Narrow',Helvetica,sans-serif;-webkit-text-size-adjust:100%;mso-line-height-rule:exactly">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#0A0B0D;padding:32px 16px">
    <tr><td align="center">

      <!-- Email card -->
      <table width="580" cellpadding="0" cellspacing="0" role="presentation"
             style="background:#111317;border-top:2px solid #CAA85A;border-radius:2px;max-width:580px;width:100%">
        <tr><td style="padding:0">

          <!-- ── Header ──────────────────────────────────────────────── -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="background:#111317;border-bottom:1px solid #1B1F25;padding:20px 32px">
            <tr>
              <td>
                <!-- Wordmark -->
                <p style="margin:0 0 4px;font-family:'Arial Narrow',Arial,sans-serif;font-size:11px;font-weight:700;
                           letter-spacing:0.22em;text-transform:uppercase;color:#CAA85A">
                  Edge Setter
                </p>
                <p style="margin:0;font-family:'Arial Narrow',Arial,sans-serif;font-size:9px;font-weight:700;
                           letter-spacing:0.18em;text-transform:uppercase;color:#7E776A">
                  NFL Intelligence · ${dateLabel}
                </p>
              </td>
              <td align="right" valign="middle">
                <!-- Live pulse indicator -->
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:4px 10px;background:#0F1810;border:1px solid rgba(61,174,114,0.30);border-radius:2px">
                      <span style="font-family:'Arial Narrow',Arial,sans-serif;font-size:9px;font-weight:700;
                                   letter-spacing:0.16em;text-transform:uppercase;color:#3DAE72">
                        ● Live · 2026 Offseason
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- ── Eyebrow ─────────────────────────────────────────────── -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="padding:28px 32px 0">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-family:'Arial Narrow',Arial,sans-serif;font-size:10px;font-weight:700;
                           letter-spacing:0.22em;text-transform:uppercase;color:#7E776A">
                  Today's Top Signal
                </p>
                <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-size:24px;font-weight:900;
                            color:#F3EFE6;line-height:1.15;letter-spacing:-0.01em">
                  ${topSignal.title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                </h1>
              </td>
            </tr>
          </table>

          <!-- ── Player + confidence strip ──────────────────────────── -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="padding:16px 32px;border-bottom:1px solid #1B1F25">
            <tr>
              <td valign="middle">
                <p style="margin:0;font-family:'Arial Narrow',Arial,sans-serif;font-size:12px;font-weight:700;
                           letter-spacing:0.16em;text-transform:uppercase;color:#CAA85A">
                  ${(topSignal.player_name + " · " + topSignal.team).replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                </p>
              </td>
              <td align="right" valign="middle" style="padding-left:16px;white-space:nowrap">
                <!-- Confidence score -->
                <span style="font-family:Georgia,serif;font-size:34px;font-weight:900;color:${cColor};line-height:1">
                  ${conf}
                </span>
                <span style="font-family:'Arial Narrow',Arial,sans-serif;font-size:9px;font-weight:700;
                              letter-spacing:0.12em;text-transform:uppercase;color:#7E776A;display:block;margin-top:2px">
                  Confidence
                </span>
              </td>
            </tr>
          </table>

          <!-- ── Verdict + body ─────────────────────────────────────── -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="padding:20px 32px 0">
            <tr>
              <td>
                <!-- Verdict pill -->
                <table cellpadding="0" cellspacing="0" style="margin-bottom:14px">
                  <tr>
                    <td style="padding:3px 10px;background:#1B1F25;border:1px solid ${vColor}40;border-radius:2px">
                      <span style="font-family:'Arial Narrow',Arial,sans-serif;font-size:9px;font-weight:700;
                                   letter-spacing:0.16em;text-transform:uppercase;color:${vColor}">
                        ${cap(topSignal.verdict)}
                      </span>
                    </td>
                  </tr>
                </table>
                <!-- Summary -->
                <p style="margin:0 0 16px;font-size:15px;color:#B7AFA0;line-height:1.65">
                  ${topSignal.summary.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                </p>
              </td>
            </tr>
          </table>

          <!-- ── Action Takeaway ────────────────────────────────────── -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="padding:0 32px 24px">
            <tr>
              <td style="background:#16191E;border-left:3px solid #CAA85A;padding:14px 18px;border-radius:0 2px 2px 0">
                <p style="margin:0 0 4px;font-family:'Arial Narrow',Arial,sans-serif;font-size:9px;font-weight:700;
                           letter-spacing:0.16em;text-transform:uppercase;color:#CAA85A">
                  Action Takeaway
                </p>
                <p style="margin:0;font-size:14px;color:#F3EFE6;line-height:1.55">
                  ${topSignal.action_takeaway.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                </p>
              </td>
            </tr>
          </table>

          <!-- ── View in Signal Board CTA ───────────────────────────── -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="padding:0 32px 28px">
            <tr>
              <td>
                <a href="${signalBoardUrl}?highlight=${topSignal.id}"
                   style="display:inline-block;padding:11px 22px;background:#CAA85A;color:#0A0B0D;
                          font-family:'Arial Narrow',Arial,sans-serif;font-size:10px;font-weight:700;
                          letter-spacing:0.18em;text-transform:uppercase;text-decoration:none;border-radius:2px">
                  View in Signal Board →
                </a>
              </td>
            </tr>
          </table>

          <!-- ── Gold rule ──────────────────────────────────────────── -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="padding:0 32px">
            <tr>
              <td style="height:1px;background:#CAA85A;opacity:0.18;font-size:0;line-height:0">&nbsp;</td>
            </tr>
          </table>

          <!-- ── Locked signals teaser ──────────────────────────────── -->
          ${teaserRows.length > 0 ? `
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="padding:20px 32px 0">
            <tr>
              <td>
                <p style="margin:0 0 16px;font-family:'Arial Narrow',Arial,sans-serif;font-size:10px;font-weight:700;
                           letter-spacing:0.22em;text-transform:uppercase;color:#7E776A">
                  ${teaserSignals.length} more signal${teaserSignals.length !== 1 ? "s" : ""} today — Pro unlocks all of them
                </p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${teaserRows}
                </table>
              </td>
            </tr>
          </table>
          ` : ""}

          <!-- ── Pro upgrade CTA ────────────────────────────────────── -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="padding:24px 32px 32px">
            <tr>
              <td style="background:#16191E;border:1px solid rgba(202,168,90,0.22);border-radius:3px;padding:24px 24px">
                <p style="margin:0 0 6px;font-family:'Arial Narrow',Arial,sans-serif;font-size:10px;font-weight:700;
                           letter-spacing:0.20em;text-transform:uppercase;color:#CAA85A">
                  Edge Setter Pro · $19/month
                </p>
                <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:18px;font-weight:700;
                           color:#F3EFE6;line-height:1.25">
                  Stop chasing tweets. See what moves, the confidence, and the action in one place.
                </p>
                <table cellpadding="0" cellspacing="0" style="margin-bottom:16px">
                  <tr>
                    <td style="padding:4px 0">
                      <span style="font-size:13px;color:#B7AFA0">✓&nbsp;&nbsp;</span>
                      <span style="font-size:13px;color:#B7AFA0">Full live signals feed — no cap</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0">
                      <span style="font-size:13px;color:#B7AFA0">✓&nbsp;&nbsp;</span>
                      <span style="font-size:13px;color:#B7AFA0">Free Agency, Injury &amp; topic filters</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0">
                      <span style="font-size:13px;color:#B7AFA0">✓&nbsp;&nbsp;</span>
                      <span style="font-size:13px;color:#B7AFA0">2026 Draft Board + archive search</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0">
                      <span style="font-size:13px;color:#B7AFA0">✓&nbsp;&nbsp;</span>
                      <span style="font-size:13px;color:#B7AFA0">Action takeaway on every signal</span>
                    </td>
                  </tr>
                </table>
                <a href="${proUrl}"
                   style="display:inline-block;padding:12px 26px;background:#CAA85A;color:#0A0B0D;
                          font-family:'Arial Narrow',Arial,sans-serif;font-size:10px;font-weight:700;
                          letter-spacing:0.18em;text-transform:uppercase;text-decoration:none;border-radius:2px">
                  Go Pro · $19/month →
                </a>
              </td>
            </tr>
          </table>

          <!-- ── Footer ─────────────────────────────────────────────── -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="border-top:1px solid #1B1F25;padding:20px 32px">
            <tr>
              <td>
                <p style="margin:0 0 6px;font-size:12px;color:#7E776A;line-height:1.5">
                  You're receiving this because you signed up for the Edge Setter daily digest.
                </p>
                <p style="margin:0;font-size:12px;color:#7E776A">
                  <a href="${unsubUrl}" style="color:#7E776A;text-decoration:underline">Unsubscribe</a>
                  &nbsp;·&nbsp;
                  <a href="${signalBoardUrl}" style="color:#7E776A;text-decoration:underline">Open Signal Board</a>
                  &nbsp;·&nbsp;
                  <a href="${proUrl}" style="color:#CAA85A;text-decoration:underline">Go Pro</a>
                </p>
              </td>
            </tr>
          </table>

        </td></tr>
      </table>
      <!-- / email card -->

    </td></tr>
  </table>
  <!-- / outer wrapper -->

</body>
</html>`;
}

/**
 * Send the daily digest to a single subscriber.
 * isPro controls whether the teaser lock section is included.
 */
export async function sendDailyDigest(opts: {
  to: string;
  topSignal: Signal;
  teaserSignals: Signal[];
  unsubToken: string;
  dateLabel: string;
}): Promise<boolean> {
  const html = buildDailyDigestHtml(
    opts.topSignal,
    opts.teaserSignals,
    opts.unsubToken,
    opts.dateLabel,
  );
  return sendEmail({
    to: opts.to,
    subject: `Today's Top Signal: ${opts.topSignal.player_name} · Edge Setter`,
    html,
  });
}
