import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { hasAiKey } from './ai/provider';
import { sendAlert } from './alerts';
import { logger } from '@/lib/logger';

const DAY = 86400_000;

/** Hourly housekeeping + health alerts. */
export async function runMaintenance() {
  const s = await getSettings(true);
  const now = Date.now();
  const [jobs, logs, rl, cron, runs] = await Promise.all([
    db.job.deleteMany({ where: { status: 'DONE', updatedAt: { lt: new Date(now - 3 * DAY) } } }),
    db.eventLog.deleteMany({ where: { createdAt: { lt: new Date(now - 30 * DAY) } } }),
    db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now - DAY) } } }),
    db.cronRun.deleteMany({ where: { startedAt: { lt: new Date(now - 14 * DAY) } } }),
    db.generationRun.deleteMany({ where: { createdAt: { lt: new Date(now - 365 * DAY) } } }),
  ]);

  // Health alerts
  const alerts: string[] = [];
  if (s.automation.monitoringEnabled) {
    const lastTick = await db.cronRun.findFirst({ where: { kind: 'tick' }, orderBy: { startedAt: 'desc' } });
    if (!lastTick || now - lastTick.startedAt.getTime() > 20 * 60_000) {
      alerts.push('tick-stale');
      await sendAlert('tick-stale', 'Scheduler not running', `No tick in the last 20 minutes (last: ${lastTick?.startedAt.toISOString() ?? 'never'}). Check Vercel Cron / external trigger and CRON_SECRET.`, 120);
    }
  }
  const failedJobs = await db.job.count({ where: { status: 'FAILED', updatedAt: { gte: new Date(now - 3600_000) } } });
  if (failedJobs >= 5) { alerts.push('jobs-failing'); await sendAlert('jobs-failing', 'Many failed jobs', `${failedJobs} jobs failed permanently in the last hour. See Admin → Logs.`, 180); }
  if (!hasAiKey(s)) { alerts.push('no-ai-key'); await sendAlert('no-ai-key', 'No AI API key', 'Articles cannot be generated until an API key is configured.', 720); }
  if (s.alerts.notifyOnReviewQueue) {
    const pending = await db.article.count({ where: { status: 'PENDING_REVIEW' } });
    if (pending >= 10) await sendAlert('review-queue', 'Review queue growing', `${pending} articles are waiting for manual review.`, 720);
  }
  const stats = { deletedJobs: jobs.count, deletedLogs: logs.count, deletedRateLimits: rl.count, deletedCron: cron.count, deletedRuns: runs.count, alerts };
  await logger.info('maintenance', 'Maintenance complete', stats);
  return stats;
}
