import { loadConfig } from './config.js';

const NOTIFY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between repeat alerts
let lastNotifiedAt = 0;
let lastNotifiedUtilization = 0;

export async function maybeSendLiquidityAlert(bridgeBalance: number): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.telegramBotToken || cfg.telegramChatIds.length === 0) return;
  if (cfg.maxLiquidityUsd <= 0) return;

  const utilPct = (bridgeBalance / cfg.maxLiquidityUsd) * 100;
  const now = Date.now();

  // Only notify when crossing 90% threshold; re-notify after cooldown if still above 90%
  const isAboveThreshold = utilPct >= 90;
  const cooledDown = now - lastNotifiedAt > NOTIFY_COOLDOWN_MS;
  // Also re-arm: if utilization dropped below 80% since last notify, allow next alert sooner
  const reArmed = lastNotifiedUtilization > 0 && lastNotifiedUtilization >= 90 && utilPct < 80;
  if (reArmed) {
    lastNotifiedAt = 0;
    lastNotifiedUtilization = 0;
  }

  if (!isAboveThreshold || !cooledDown) return;

  lastNotifiedAt = now;
  lastNotifiedUtilization = utilPct;

  const emoji = utilPct >= 100 ? '🔴' : '🟡';
  const message =
    `${emoji} *MChain Bridge Liquidity Alert*\n\n` +
    `Bridge balance has reached *${utilPct.toFixed(1)}%* of the cap.\n\n` +
    `• Balance: \`$${bridgeBalance.toFixed(2)}\`\n` +
    `• Cap: \`$${cfg.maxLiquidityUsd.toLocaleString()}\`\n\n` +
    `Log into the admin panel to adjust the cap or withdraw liquidity.`;

  await sendToAll(cfg.telegramBotToken, cfg.telegramChatIds, message);
}

export async function sendTestMessage(botToken: string, chatIds: string[]): Promise<{ ok: boolean; errors: string[] }> {
  const message =
    `✅ *MChain Bridge — Test Alert*\n\nTelegram notifications are configured correctly.`;
  return sendToAll(botToken, chatIds, message);
}

async function sendToAll(
  botToken: string,
  chatIds: string[],
  text: string,
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  await Promise.all(
    chatIds.map(async (chatId) => {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId.trim(), text, parse_mode: 'Markdown' }),
          },
        );
        if (!res.ok) {
          const body = await res.text();
          errors.push(`Chat ${chatId}: ${body}`);
        }
      } catch (err) {
        errors.push(`Chat ${chatId}: ${String(err)}`);
      }
    }),
  );
  return { ok: errors.length === 0, errors };
}
