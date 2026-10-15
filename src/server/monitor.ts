import type { Prisma, Source } from '@prisma/client';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { logger, errMsg } from '@/lib/logger';
import { enqueue, PermanentError } from './queue';
import { fetchSource, sourceHeaders } from './sources/adapters';
import { fetchArticlePage } from './sources/extract-page';
import { FetchError, isAllowedByRobots } from './http';
import { cleanText, contentHash, detectInjection, normalizeUrl, simhash, wordCount } from './text';
import { findStoryMatch } from './dedupe';
import { getEmbedder } from './ai/provider';
import { sendAlert } from './alerts';

/* ---------------------------------------------------------------- check_source */
export async function checkSource(sourceId: string): Promise<{ detected: number; skipped: number; error?: string }> {
  const source = await db.source.findUnique({ where: { id: sourceId } });
  if (!source || !source.enabled) return { detected: 0, skipped: 0 };
  const s = await getSettings();
  const now = new Date();
  try {
    if (!source.termsAcknowledged) throw new FetchError('Source terms/licence not acknowledged by an administrator — monitoring paused for this source.', undefined, false);
    if (source.respectRobots && source.type !== 'JSON_API') {
      const r = await isAllowedByRobots(source.feedUrl);
      if (!r.allowed) throw new FetchError(r.reason ?? 'Feed blocked by robots.txt', undefined, false);
    }
    const feed = await fetchSource(source);
    if (feed.notModified) {
      await db.source.update({ where: { id: source.id }, data: { lastCheckedAt: now, lastSuccessAt: now, lastError: null, consecutiveFailures: 0 } });
      return { detected: 0, skipped: 0 };
    }
    const result = await ingest(source, feed.items, now);
    await db.source.update({
      where: { id: source.id },
      data: { lastCheckedAt: now, lastSuccessAt: now, lastError: null, consecutiveFailures: 0, etag: feed.etag ?? null, lastModified: feed.lastModified ?? null, itemsDetectedTotal: { increment: result.detected } },
    });
    if (result.detected) await logger.info('monitor', `${source.name}: ${result.detected} new item(s)`, { skipped: result.skipped });
    return result;
  } catch (e) {
    const msg = errMsg(e);
    const updated = await db.source.update({ where: { id: source.id }, data: { lastCheckedAt: now, lastError: msg.slice(0, 500), consecutiveFailures: { increment: 1 } } });
    await logger.warn('monitor', `${source.name} check failed (${updated.consecutiveFailures}x): ${msg}`);
    if (updated.consecutiveFailures === s.alerts.sourceFailureThreshold) {
      await sendAlert(`source:${source.id}`, `Source failing: ${source.name}`, `${updated.consecutiveFailures} consecutive failures. Last error: ${msg}`);
    }
    return { detected: 0, skipped: 0, error: msg };
  }
}

async function ingest(source: Source, raw: Awaited<ReturnType<typeof fetchSource>>['items'], now: Date) {
  const cutoff = now.getTime() - source.maxAgeHours * 3600_000;
  const prepared = raw
    .map((r) => {
      try { return { r, norm: normalizeUrl(r.url), url: new URL(r.url).toString() }; } catch { return null; }
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const seen = new Set<string>();
  const unique = prepared.filter((p) => (seen.has(p.norm) ? false : (seen.add(p.norm), true)));
  const existing = new Set((await db.sourceItem.findMany({ where: { normalizedUrl: { in: unique.map((u) => u.norm) } }, select: { normalizedUrl: true } })).map((e) => e.normalizedUrl));
  const fresh = unique.filter((u) => !existing.has(u.norm)).sort((a, b) => (b.r.publishedAt?.getTime() ?? now.getTime()) - (a.r.publishedAt?.getTime() ?? now.getTime()));

  let detected = 0, skipped = 0;
  for (const { r, norm, url } of fresh) {
    const tooOld = r.publishedAt && r.publishedAt.getTime() < cutoff;
    if (!tooOld && detected >= source.maxItemsPerRun) continue; // leave for the next run (still in the feed)
    try {
      const created = await db.sourceItem.create({
        data: {
          sourceId: source.id, url, normalizedUrl: norm, guid: r.guid, title: cleanText(r.title).slice(0, 500),
          summary: r.summary ? cleanText(r.summary).slice(0, 4000) : null,
          contentText: r.contentText ? cleanText(r.contentText).slice(0, 20000) : null,
          author: r.author?.slice(0, 200), imageUrl: r.imageUrl, publishedAt: r.publishedAt,
          status: tooOld ? 'SKIPPED' : 'DETECTED', statusReason: tooOld ? `Older than ${source.maxAgeHours}h at first sight` : null,
          meta: (r.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      if (tooOld) { skipped++; continue; }
      detected++;
      await enqueue('extract_item', { itemId: created.id }, { dedupeKey: `extract:${created.id}` });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e; // unique violation == already known URL (race): fine
    }
  }
  return { detected, skipped };
}

/* ---------------------------------------------------------------- extract_item */
export async function extractItem(itemId: string): Promise<void> {
  const item = await db.sourceItem.findUnique({ where: { id: itemId }, include: { source: true } });
  if (!item || item.status !== 'DETECTED') return; // idempotent
  const { source } = item;
  const s = await getSettings();
  const meta = (item.meta ?? {}) as Record<string, unknown>;

  let body = item.contentText ?? '';
  let imageUrl = item.imageUrl ?? undefined;
  let author = item.author ?? undefined;
  let publishedAt = item.publishedAt ?? undefined;

  if (source.fetchMode === 'FULL_PAGE' && source.termsAcknowledged && body.length < 3000) {
    try {
      const page = await fetchArticlePage(item.url, { respectRobots: source.respectRobots, headers: sourceHeaders(source) });
      if (page.text.length > body.length) body = page.text;
      imageUrl ??= page.imageUrl; author ??= page.author; publishedAt ??= page.publishedAt;
    } catch (e) {
      if (e instanceof FetchError && e.retryable) throw e; // transient: let the queue retry with backoff
      meta.pageFetchError = errMsg(e); // permanent (robots/403/etc): continue with feed data only
    }
  }
  const summary = item.summary ?? '';
  if (summary && !body.includes(summary.slice(0, 80))) body = body ? `${summary}\n\n${body}` : summary;
  body = cleanText(body).slice(0, 14_000);

  const injectionFlags = detectInjection(`${item.title}\n${body}`);
  const thin = body.length < s.quality.minSourceChars;
  const force = meta.forceProcess === true;
  if (thin && !force) {
    await db.sourceItem.update({ where: { id: item.id }, data: { status: 'SKIPPED', statusReason: `Source content too thin (${body.length} < ${s.quality.minSourceChars} chars). Use "Process anyway" to force.`, contentText: body, meta: meta as Prisma.InputJsonValue } });
    return;
  }
  meta.injectionFlags = injectionFlags;
  meta.thin = thin;

  const hash = contentHash(`${item.title} ${body}`);
  const sim = simhash(body || item.title);
  let embedding: number[] = [];
  try {
    const emb = getEmbedder(s);
    if (emb) embedding = (await emb.embed([`${item.title}\n${body.slice(0, 2000)}`], s.ai.embeddings.model))[0] ?? [];
  } catch (e) { await logger.warn('dedupe', `Embedding failed (continuing lexically): ${errMsg(e)}`); }

  const cand = { id: item.id, title: item.title, text: body, contentHash: hash, simhash: sim, embedding };
  let enqueueGenerate = false;
  let recheckArticleId: string | null = null;

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(727001)`; // serialise story clustering
    const match = await findStoryMatch(cand, s);
    const base = { contentText: body, contentHash: hash, simhash: sim, embedding, imageUrl, author, publishedAt, meta: meta as Prisma.InputJsonValue };
    if (match) {
      const story = await tx.story.findUnique({ where: { id: match.storyId }, include: { article: { select: { id: true } } } });
      await tx.sourceItem.update({ where: { id: item.id }, data: { ...base, status: 'DUPLICATE', storyId: match.storyId, statusReason: `Same story as ${match.itemId} — ${match.via}` } });
      if (story?.article) {
        await tx.articleSource.upsert({
          where: { articleId_url: { articleId: story.article.id, url: item.url } },
          create: { articleId: story.article.id, itemId: item.id, sourceName: source.name, url: item.url, title: item.title, publishedAt: publishedAt ?? null },
          update: {},
        });
        recheckArticleId = story.article.id;
      }
    } else {
      const story = await tx.story.create({ data: { headline: item.title, embedding, keywords: [] } });
      await tx.sourceItem.update({ where: { id: item.id }, data: { ...base, status: 'EXTRACTED', storyId: story.id } });
      enqueueGenerate = true;
    }
  }, { timeout: 25_000, maxWait: 15_000 });

  if (enqueueGenerate) await enqueue('generate_item', { itemId: item.id }, { dedupeKey: `generate:${item.id}`, maxAttempts: 3 });
  if (recheckArticleId) await enqueue('recheck_story', { articleId: recheckArticleId }, { dedupeKey: `recheck:${recheckArticleId}:${item.id}`, maxAttempts: 2 });
}

export { PermanentError };
export const _wordCount = wordCount;
