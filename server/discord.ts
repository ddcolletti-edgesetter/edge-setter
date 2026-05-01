/**
 * Discord webhook poster
 * Env: DISCORD_WEBHOOK_URL
 */

export function canPostDiscord(): boolean {
  return !!process.env.DISCORD_WEBHOOK_URL;
}

export async function postToDiscord(
  text: string,
): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return false;

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[discord] Post failed (${resp.status}):`, body);
      return false;
    }
    console.log("[discord] Posted successfully");
    return true;
  } catch (err: any) {
    console.error("[discord] postToDiscord error:", err.message);
    return false;
  }
}
