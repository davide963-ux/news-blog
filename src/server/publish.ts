import { db } from '@/lib/db';
import { audit, logger } from '@/lib/logger';
import { getSettings } from '@/lib/settings';
import { publishCapacity } from './policy';

/** Refresh the cached public pages. Safe to call from non-Next runtimes (scripts/tests): it just no-ops. */
export async function revalidatePublic(slug?: string) {
  try {
    const { revalidateTag, revalidatePath } = await import('next/cache');
    revalidateTag('articles');
    revalidatePath('/sitemap.xml');
    revalidatePath('/news-sitemap.xml');
    revalidatePath('/rss.xml');
    if (slug) revalidatePath(`/article/${slug}`);
  } catch {
    /* not running inside Next */
  }
}

/**
 * Idempotent publish: the conditional UPDATE guarantees exactly one transition to PUBLISHED, so a retried
 * job or double click can never publish twice or move publishedAt.
 */
export async function publishArticle(id: string, actor = 'system', opts: { ignoreLimits?: boolean } = {}): Promise<{ published: boolean; reason?: string }> {
  if (!opts.ignoreLimits) {
    const cap = await publishCapacity(await getSettings());
    if (!cap.ok) return { published: false, reason: cap.reason };
  }
  const s = await getSettings();
  const art = await db.article.findUnique({ where: { id }, select: { isBreaking: true, sourcePublishedAt: true } });
  if (!art) return { published: false, reason: 'not found' };
  const now = new Date();
  const breaking = art.isBreaking && (!art.sourcePublishedAt || now.getTime() - art.sourcePublishedAt.getTime() < s.automation.breakingWindowMinutes * 60_000);
  const res = await db.article.updateMany({
    where: { id, status: { not: 'PUBLISHED' } },
    data: { status: 'PUBLISHED', publishedAt: now, reviewReason: null, reviewCode: null, isBreaking: breaking },
  });
  if (res.count === 0) return { published: false, reason: 'already published' };
  const a = await db.article.findUnique({ where: { id }, select: { slug: true, title: true } });
  await audit(actor, 'article.publish', 'Article', id, { title: a?.title });
  await logger.info('publish', `Published: ${a?.title}`, { articleId: id, actor });
  await revalidatePublic(a?.slug);
  return { published: true };
}

export async function unpublishArticle(id: string, actor: string) {
  const a = await db.article.update({ where: { id }, data: { status: 'UNPUBLISHED' }, select: { slug: true, title: true } });
  await audit(actor, 'article.unpublish', 'Article', id, { title: a.title });
  await revalidatePublic(a.slug);
}

/** Publish drafts that were held back only by the daily/hourly limit, oldest first. */
export async function releaseQueuedArticles(max = 20): Promise<number> {
  const queued = await db.article.findMany({ where: { status: 'DRAFT', reviewCode: 'DAILY_LIMIT' }, orderBy: { generatedAt: 'asc' }, take: max, select: { id: true } });
  let n = 0;
  for (const q of queued) {
    const r = await publishArticle(q.id, 'system');
    if (!r.published) break;
    n++;
  }
  return n;
}
