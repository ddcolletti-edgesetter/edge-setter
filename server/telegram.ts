/**
 * Telegram Bot API poster
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *
 * TELEGRAM_CHAT_ID may be a @username or numeric ID.
 * We resolve @usernames to their numeric ID via getChat before sending,
 * because sendMessage rejects usernames with "chat not found" in some
 * channel configurations even when the bot is an admin.
 */

export function canPostTelegram(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

async function resolveChat(token: string, chatId: string): Promise<string> {
  if (!chatId.startsWith("@")) return chatId;

  const resp = await fetch(
    `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`,
  );
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`getChat failed (${resp.status}): ${body}`);
  }
  const data = (await resp.json()) as { ok: boolean; result?: { id: number } };
  if (!data.ok || !data.result?.id) {
    throw new Error(`getChat returned unexpected payload: ${JSON.stringify(data)}`);
  }
  return String(data.result.id);
}

export async function postToTelegram(text: string): Promise<boolean> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const rawId  = process.env.TELEGRAM_CHAT_ID;
  if (!token || !rawId) return false;

  try {
    const chatId = await resolveChat(token, rawId);
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[telegram] Post failed (${resp.status}):`, body);
      return false;
    }
    console.log("[telegram] Posted successfully");
    return true;
  } catch (err: any) {
    console.error("[telegram] postToTelegram error:", err.message);
    return false;
  }
}
