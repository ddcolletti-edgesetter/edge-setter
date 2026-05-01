/**
 * Telegram Bot API poster
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

export function canPostTelegram(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function postToTelegram(
  text: string,
): Promise<boolean> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const resp = await fetch(url, {
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
