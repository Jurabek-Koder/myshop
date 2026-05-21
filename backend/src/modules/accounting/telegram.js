import axios from 'axios';

function resolveChatTargets(employee) {
  const targets = [];
  const employeeChat = String(employee?.telegram_chat_id || '').trim();
  if (employeeChat) targets.push(employeeChat);
  const envTargets = String(process.env.ACCOUNTING_TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  for (const target of envTargets) {
    if (!targets.includes(target)) targets.push(target);
  }
  return targets;
}

export async function sendAccountingTelegramMessage({ employee = null, text }) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatIds = resolveChatTargets(employee);
  if (!token || !text || chatIds.length === 0) {
    return { ok: false, skipped: true };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  for (const chatId of chatIds) {
    try {
      await axios.post(
        url,
        {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        },
        {
          timeout: 10000,
        },
      );
    } catch (error) {
      console.warn('[accounting] telegram send failed:', error?.response?.data || error?.message || error);
    }
  }

  return { ok: true, skipped: false };
}
