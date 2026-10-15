import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { logger } from '@/lib/logger';
import { slugify, truncate } from '@/lib/utils';
import { PermanentError } from './queue';
import { hasAiKey } from './ai/provider';
import { generateArticle, verifyArticle } from './ai/generate';
import type { ArticleOutput, VerifierOutput } from './ai/schema';
import type { SourceMaterial } from './ai/prompts';
import { ensureAttribution, renderBody, stripMarkdown } from './render';
import { validateArticle, type ValidationReport } from './validate';
import { classifySensitivity } from './sensitive';
import { decidePublication } from './policy';
import { chooseImage } from './images';
import { publishArticle } from './publish';
import { errMsg } from '@/lib/logger';

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base, 70);
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await db.article.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** generate_item job: AI generation → validation → policy → image → persist → (auto)publish. Idempotent per story. */
export async function generateItem(itemId: string): Promise<void> {
  const item = await db.sourceItem.findUnique({ where: { id: itemId }, include: { source: true, story: { include: { article: { select: { id: true } } } } } });
  if (!item || item.status !== 'EXTRACTED') return;
  if (item.story?.article) {
    await db.sourceItem.update({ where: { id: item.id }, data: { status: 'DUPLICATE', statusReason: 'Story already has an article' } });
    return;
  }
  const s = await getSettings();
  if (!hasAiKey(s)) throw new PermanentError('No AI API key configured. Add one in Settings → AI (or env ANTHROPIC_API_KEY / OPENAI_API_KEY), then retry the job.');

  const meta = (item.meta ?? {}) as { injectionFlags?: string[]; thin?: boolean };
  const siblings = await db.sourceItem.findMany({ where: { storyId: item.storyId ?? '__none__', id: { not: item.id } }, include: { source: true }, take: 3 });
  const primary: SourceMaterial = { sourceName: item.source.name, url: item.url, title: item.title, publishedAt: item.publishedAt, author: item.author, text: item.contentText ?? item.summary ?? '' };
  const extra: SourceMaterial[] = siblings.map((x) => ({ sourceName: x.source.name, url: x.url, title: x.title, publishedAt: x.publishedAt, author: x.author, text: x.contentText ?? x.summary ?? '' }));
  const all = [primary, ...extra];
  const sourceText = all.map((m) => `${m.title}\n${m.text}`).join('\n\n');
  const sourceNames = [...new Set(all.map((m) => m.sourceName))];

  let out!: ArticleOutput;
  let body = '';
  let report!: ValidationReport;
  let verifier: VerifierOutput | null = null;
  let verifierError: string | null = null;
  let retryNote = '';
  let stricter = false;
  let attempts = 0;

  for (let attempt = 0; attempt < s.automation.maxGenerationAttempts; attempt++) {
    attempts = attempt + 1;
    out = await generateArticle({ settings: s, itemId: item.id, primary, extra, retryNote, stricterOriginality: stricter });
    body = ensureAttribution(out.body, sourceNames);
    const base = { settings: s, out, body, sourceText, sourceTitles: all.map((m) => m.title), sourceNames, siteName: s.site.name, publishedAt: item.publishedAt, injectionFlags: meta.injectionFlags ?? [], thin: !!meta.thin };
    report = validateArticle({ ...base, verifier: null, verifierError: 'not run yet' });
    const last = attempt === s.automation.maxGenerationAttempts - 1;
    const progScreen = report.checks.filter((c) => c.name !== 'ai_verification');
    const hardProblems = report.retryable.length > 0 && progScreen.some((c) => c.status === 'fail' || c.status === 'review');
    if (hardProblems && !last) { retryNote = report.retryable.join(' '); stricter = stricter || progScreen.some((c) => c.name === 'originality' && c.status === 'fail'); continue; }
    if (s.ai.verifyWithAi) {
      try { verifier = await verifyArticle(s, sourceText, out.headline, body, item.id); verifierError = null; }
      catch (e) { verifier = null; verifierError = errMsg(e); }
    }
    report = validateArticle({ ...base, verifier, verifierError });
    if (report.retryable.length && !last) { retryNote = report.retryable.join(' '); continue; }
    break;
  }

  // Category & sensitivity
  const slugCat = (await db.category.findUnique({ where: { slug: out.category } })) ?? (item.source.defaultCategory ? await db.category.findUnique({ where: { slug: item.source.defaultCategory } }) : null) ?? (await db.category.findUnique({ where: { slug: 'world' } }));
  if (!slugCat) throw new PermanentError('Categories are not seeded (run migrations).');
  const sens = classifySensitivity({ settings: s, title: item.title, leadText: primary.text, aiTopics: out.sensitivity.topics, categorySensitive: slugCat.sensitive, isBreaking: out.isBreaking });
  const decision = await decidePublication({ settings: s, category: slugCat, report, sensitivity: sens, storyId: item.storyId });

  // Image (not for rejected output)
  const img = decision.action === 'reject' ? null : await chooseImage({
    settings: s, title: out.headline, riskLevel: sens.level, searchQuery: out.image.searchQuery, altText: out.image.altText,
    illustrationPrompt: out.image.illustrationPrompt, source: item.source, sourceImageUrl: item.imageUrl, itemId: item.id,
  });

  const slug = await uniqueSlug(out.slug || out.headline);
  const tags = [...new Set(out.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 8);
  const status = decision.action === 'reject' ? 'REJECTED' : decision.action === 'review' ? 'PENDING_REVIEW' : 'DRAFT';
  // Articles that pass every check are created as a queued DRAFT and then published through the single idempotent publish path.
  const reviewCode = decision.action === 'publish' ? 'DAILY_LIMIT' : decision.code;
  const reviewReason = decision.action === 'publish' ? 'Queued for publication' : decision.reason;

  let articleId: string;
  try {
    const article = await db.$transaction(async (tx) => {
      const a = await tx.article.create({
        data: {
          slug, status, title: out.headline.trim(), dek: out.dek.trim() || null, excerpt: truncate(out.excerpt, 300), summary: truncate(out.summary, 260),
          bodyMd: body, bodyHtml: renderBody(body), seoTitle: truncate(out.seoTitle, 60), metaDescription: truncate(out.metaDescription, 160), tags,
          categoryId: slugCat.id, isBreaking: out.isBreaking, riskLevel: sens.level,
          reviewReason, reviewCode,
          imageKind: img?.kind ?? 'NONE', imageUrl: img?.url, imageSmallUrl: img?.smallUrl, imageAlt: img?.alt, imageCredit: img?.credit, imageCreditUrl: img?.creditUrl, imageIsAi: img?.isAi ?? false,
          validation: { report, sensitivity: sens, verifier, verifierError, attempts, keyFacts: out.keyFacts } as unknown as Prisma.InputJsonValue,
          similarityScore: report.metrics.overlapRatio, aiProvider: s.ai.provider, aiModel: s.ai.model,
          storyId: item.storyId, sourcePublishedAt: item.publishedAt,
        },
      });
      for (const m of all) {
        await tx.articleSource.create({ data: { articleId: a.id, itemId: m === primary ? item.id : siblings.find((x) => x.url === m.url)?.id, sourceName: m.sourceName, url: m.url, title: m.title, publishedAt: m.publishedAt ?? null } });
      }
      await tx.sourceItem.update({ where: { id: item.id }, data: { status: 'GENERATED', statusReason: null } });
      await tx.generationRun.updateMany({ where: { itemId: item.id, articleId: null }, data: { articleId: a.id } });
      return a;
    });
    articleId = article.id;
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') { // another worker created the story's article first
      await db.sourceItem.update({ where: { id: item.id }, data: { status: 'DUPLICATE', statusReason: 'Story already has an article (concurrent)' } });
      return;
    }
    throw e;
  }

  await logger.info('pipeline', `Article ${status} (${decision.action}): ${out.headline}`, { articleId, reason: reviewReason });
  if (decision.action === 'publish') await publishArticle(articleId, 'system');
}

/** recheck_story job: a new independent source joined an existing story; re-evaluate articles waiting for corroboration. */
export async function recheckStory(articleId: string): Promise<void> {
  const a = await db.article.findUnique({ where: { id: articleId }, include: { category: true } });
  if (!a || a.status !== 'PENDING_REVIEW' || a.reviewCode !== 'AWAITING_CORROBORATION') return;
  const v = a.validation as unknown as { report: ValidationReport; sensitivity: { level: 0 | 1 | 2; topics: string[] } } | null;
  if (!v) return;
  const s = await getSettings();
  const d = await decidePublication({ settings: s, category: a.category, report: v.report, sensitivity: v.sensitivity, storyId: a.storyId });
  if (d.action === 'publish') {
    await db.article.update({ where: { id: a.id }, data: { reviewCode: 'DAILY_LIMIT', reviewReason: 'Corroborated; queued for publication', status: 'DRAFT' } });
    await logger.info('pipeline', `Corroboration reached; publishing "${a.title}"`);
    await publishArticle(a.id, 'system');
  } else if (d.action === 'queue') {
    await db.article.update({ where: { id: a.id }, data: { status: 'DRAFT', reviewCode: 'DAILY_LIMIT', reviewReason: d.reason } });
  } else if (d.action === 'review') {
    await db.article.update({ where: { id: a.id }, data: { reviewReason: d.reason } });
  }
}

export const _stripMarkdown = stripMarkdown;
