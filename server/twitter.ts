/**
 * Edge Setter — Twitter / X API v2 client
 *
 * OAuth 1.0a implemented manually with Node.js built-in crypto.
 * No extra npm dependency required.
 *
 * Env vars required:
 *   TWITTER_API_KEY, TWITTER_API_SECRET,
 *   TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
 */

import crypto from "crypto";

/* ─── OAuth 1.0a helpers ─────────────────────────────────── */

function pct(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g,  "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g,  "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function buildSignature(
  method: string,
  url: string,
  oauthParams: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const paramStr = Object.entries(oauthParams)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${pct(k)}=${pct(v)}`)
    .join("&");

  const base = [method.toUpperCase(), pct(url), pct(paramStr)].join("&");
  const key  = `${pct(consumerSecret)}&${pct(tokenSecret)}`;

  return crypto.createHmac("sha1", key).update(base).digest("base64");
}

function authHeader(
  oauthParams: Record<string, string>,
  signature: string,
): string {
  const all = { ...oauthParams, oauth_signature: signature };
  const str = Object.entries(all)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
    .join(", ");
  return `OAuth ${str}`;
}

/* ─── Public API ─────────────────────────────────────────── */

export function canAutoPost(): boolean {
  if (process.env.SOCIAL_X_ENABLED !== "true") return false;
  return !!(
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_SECRET
  );
}

/**
 * Post a tweet. Returns { id, url } on success, null on failure.
 * Silently truncates text to 280 chars.
 */
export async function postTweet(
  text: string,
): Promise<{ id: string; url: string } | null> {
  const apiKey       = process.env.TWITTER_API_KEY       ?? "";
  const apiSecret    = process.env.TWITTER_API_SECRET    ?? "";
  const accessToken  = process.env.TWITTER_ACCESS_TOKEN  ?? "";
  const accessSecret = process.env.TWITTER_ACCESS_SECRET ?? "";

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;

  const tweetText = text.length > 280 ? text.slice(0, 277) + "…" : text;
  const url       = "https://api.twitter.com/2/tweets";

  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     apiKey,
    oauth_nonce:            crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            accessToken,
    oauth_version:          "1.0",
  };

  const signature = buildSignature("POST", url, oauthParams, apiSecret, accessSecret);
  const authorization = authHeader(oauthParams, signature);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization:  authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: tweetText }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[twitter] Post failed (${resp.status}):`, body);
      return null;
    }

    const data = (await resp.json()) as { data: { id: string; text: string } };
    const id = data.data?.id;
    if (!id) return null;

    console.log(`[twitter] Posted tweet ${id}`);
    return { id, url: `https://x.com/i/web/status/${id}` };
  } catch (err: any) {
    console.error("[twitter] postTweet error:", err.message);
    return null;
  }
}
