import type { Category } from '@prisma/client';
import { db } from '@/lib/db';
import type { Settings } from '@/lib/settings';
import type { ValidationReport } from './validate';
import type { Sensitivity } from './sensitive';

export type Decision =
  | { action: 'publish' }
  | { action: 'review'; code: string; reason: string }
  | { action: 'queue'; code: 'DAILY_LIMIT'; reason: string }
  | { action: 'reject'; code: string; reason: string };

export async function publishCapacity(s: Settings): Promise<{ ok: boolean; reason?: string }> {
  const now = Date.now();
  const [day, hour] = await Promise.all([
    db.article.count({ where: { status: 'PUBLISHED', publishedAt: { gte: new Date(now - 24 * 3600_000) } } }),
    db.article.count({ where: { status: 'PUBLISHED', publishedAt: { gte: new Date(now - 3600_000) } } }),
  ]);
  if (s.automation.dailyPublishLimit > 0 && day >= s.automation.dailyPublishLimit) return { ok: false, reason: `Daily publication limit (${s.automation.dailyPublishLimit}) reached` };
  if (s.automation.hourlyPublishLimit > 0 && hour >= s.automation.hourlyPublishLimit) return { ok: false, reason: `Hourly publication limit (${s.automation.hourlyPublishLimit}) reached` };
  return { ok: true };
}

/** Number of independent publishers backing the story. */
export async function corroboratingSources(storyId: string | null): Promise<number> {
  if (!storyId) return 1;
  const rows = await db.sourceItem.findMany({ where: { storyId }, select: { sourceId: true }, distinct: ['sourceId'] });
  return Math.max(1, rows.length);
}

export async function decidePublication(opts: {
  settings: Settings;
  category: Category;
  report: ValidationReport;
  sensitivity: Sensitivity;
  storyId: string | null;
}): Promise<Decision> {
  const { settings: s, category, report, sensitivity } = opts;
  if (report.decision === 'reject') return { action: 'reject', code: 'COPY_RISK', reason: report.reasons.join(' • ') };
  if (report.decision === 'review') return { action: 'review', code: 'VALIDATION', reason: report.reasons.join(' • ') };
  if (!s.automation.autoPublish) return { action: 'review', code: 'AUTOPUBLISH_OFF', reason: 'Automatic publishing is disabled in settings.' };
  if (!category.autoPublish) return { action: 'review', code: 'CATEGORY_MANUAL', reason: `Category "${category.name}" requires manual approval.` };
  if (sensitivity.level === 2) {
    if (s.sensitive.policy === 'review') return { action: 'review', code: 'AI_FLAG', reason: `Sensitive topic (${sensitivity.topics.join(', ') || category.name}); policy requires manual review.` };
    const n = await corroboratingSources(opts.storyId);
    if (n < s.sensitive.minIndependentSources) {
      return { action: 'review', code: 'AWAITING_CORROBORATION', reason: `Sensitive topic (${sensitivity.topics.join(', ') || category.name}); ${n}/${s.sensitive.minIndependentSources} independent sources so far.` };
    }
  }
  const cap = await publishCapacity(s);
  if (!cap.ok) return { action: 'queue', code: 'DAILY_LIMIT', reason: cap.reason! };
  return { action: 'publish' };
}
