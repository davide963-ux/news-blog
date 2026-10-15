import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { logger, errMsg } from '@/lib/logger';
import { assertPublicUrl } from './http';

/** Webhook alert (Slack / Discord / generic JSON). Cooldown per key prevents alert storms. */
export async function sendAlert(key: string, title: string, detail: string, cooldownMinutes = 360) {
  const s = await getSettings();
  await logger.warn('alert', `${title}: ${detail}`);
  if (!s.alerts.webhookUrl) return false;
  const k = `alert:${key}`;
  const prev = await db.setting.findUnique({ where: { key: k } });
  const last = (prev?.value as { at?: number } | null)?.at ?? 0;
  if (Date.now() - last < cooldownMinutes * 60_000) return false;
  try {
    await assertPublicUrl(s.alerts.webhookUrl);
    const text = `🚨 *${s.site.name}* — ${title}\n${detail}`;
    const res = await fetch(s.alerts.webhookUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, content: text, title, detail, site: s.site.name }),
    });
    await db.setting.upsert({ where: { key: k }, create: { key: k, value: { at: Date.now() } }, update: { value: { at: Date.now() } } });
    return res.ok;
  } catch (e) {
    await logger.error('alert', `Webhook failed: ${errMsg(e)}`);
    return false;
  }
}
