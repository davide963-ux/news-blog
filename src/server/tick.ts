import { db } from '@/lib/db';
import { getSettings, type Settings } from '@/lib/settings';
import { logger, errMsg } from '@/lib/logger';
import { drainQueue, enqueue, type Handler, type JobType, sweepDeadJobs } from './queue';
import { checkSource, extractItem } from './monitor';
import { generateItem, recheckStory } from './pipeline';
import { releaseQueuedArticles } from './publish';

export const handlers: Partial<Record<JobType, Handler>> = {
  check_source: async (p) => { await checkSource(String(p.sourceId)); },
  extract_item: async (p) => { await extractItem(String(p.itemId)); },
  generate_item: async (p) => { await generateItem(String(p.itemId)); },
  recheck_story: async (p) => { await recheckStory(String(p.articleId)); },
};

/** Enqueue a check job for every enabled source whose interval has elapsed. */
export async function scheduleDueSources(s: Settings, now = Date.now()): Promise<number> {
  const sources = await db.source.findMany({ where: { enabled: true, termsAcknowledged: true } });
  let n = 0;
  for (const src of sources) {
    const interval = Math.max(5, src.checkIntervalMinutes || s.automation.defaultIntervalMinutes) * 60_000;
    if (src.lastCheckedAt && now - src.lastCheckedAt.getTime() < interval - 45_000) continue;
    const bucket = Math.floor(now / interval);
    if (await enqueue('check_source', { sourceId: src.id }, { dedupeKey: `check:${src.id}:${bucket}`, maxAttempts: 2 })) n++;
  }
  return n;
}

/**
 * The heartbeat, invoked by Vercel Cron every 5 minutes (or any external scheduler hitting /api/cron/tick):
 * 1) schedule due sources, 2) drain the durable queue within the time budget, 3) release limit-queued drafts.
 */
export async function runTick(opts: { budgetMs?: number } = {}) {
  const started = Date.now();
  const deadline = started + (opts.budgetMs ?? 270_000);
  const run = await db.cronRun.create({ data: { kind: 'tick' } });
  try {
    const s = await getSettings(true);
    const scheduled = s.automation.monitoringEnabled ? await scheduleDueSources(s) : 0;
    const swept = await sweepDeadJobs();
    const q = await drainQueue(handlers, { deadline, concurrency: s.automation.jobsPerTickConcurrency });
    const released = await releaseQueuedArticles();
    const stats = { scheduled, ...q, released, swept, ms: Date.now() - started };
    await db.cronRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: true, stats } });
    return stats;
  } catch (e) {
    await db.cronRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: false, error: errMsg(e).slice(0, 500) } });
    await logger.error('tick', `Tick failed: ${errMsg(e)}`);
    throw e;
  }
}
