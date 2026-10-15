import { unstable_cache } from 'next/cache';
import { db } from './db';
import { DEFAULT_CATEGORIES } from './categories';
import { getSettings } from './settings';

/** Serializable card used across the public site (dates are ISO strings so results can sit in the Next data cache). */
export interface Card {
  id: string; slug: string; title: string; dek: string | null; summary: string; excerpt: string;
  categorySlug: string; categoryName: string; publishedAt: string; updatedAt: string;
  imageUrl: string | null; imageSmallUrl: string | null; imageAlt: string | null; imageCredit: string | null; imageIsAi: boolean;
  isBreaking: boolean; sourceName: string | null; tags: string[];
}

const cardSelect = {
  id: true, slug: true, title: true, dek: true, summary: true, excerpt: true, publishedAt: true, updatedAt: true, updatedContentAt: true,
  imageUrl: true, imageSmallUrl: true, imageAlt: true, imageCredit: true, imageIsAi: true, isBreaking: true, tags: true,
  category: { select: { slug: true, name: true } },
  sources: { select: { sourceName: true }, take: 1, orderBy: { createdAt: 'asc' as const } },
} as const;

type Row = Awaited<ReturnType<typeof fetchRows>>[number];
const fetchRows = (args: Parameters<typeof db.article.findMany>[0]) =>
  db.article.findMany({ ...args, select: cardSelect }) as unknown as Promise<Array<{
    id: string; slug: string; title: string; dek: string | null; summary: string; excerpt: string; publishedAt: Date | null; updatedAt: Date; updatedContentAt: Date | null;
    imageUrl: string | null; imageSmallUrl: string | null; imageAlt: string | null; imageCredit: string | null; imageIsAi: boolean; isBreaking: boolean; tags: string[];
    category: { slug: string; name: string }; sources: { sourceName: string }[];
  }>>;

export function toCard(r: Row): Card {
  return {
    id: r.id, slug: r.slug, title: r.title, dek: r.dek, summary: r.summary, excerpt: r.excerpt,
    categorySlug: r.category.slug, categoryName: r.category.name,
    publishedAt: (r.publishedAt ?? r.updatedAt).toISOString(), updatedAt: (r.updatedContentAt ?? r.updatedAt).toISOString(),
    imageUrl: r.imageUrl, imageSmallUrl: r.imageSmallUrl, imageAlt: r.imageAlt, imageCredit: r.imageCredit, imageIsAi: r.imageIsAi,
    isBreaking: r.isBreaking, sourceName: r.sources[0]?.sourceName ?? null, tags: r.tags,
  };
}

const pub = { status: 'PUBLISHED' as const, publishedAt: { not: null } };
const CACHE = { revalidate: 60, tags: ['articles'] };

export const getCategories = unstable_cache(async () => {
  try {
    const rows = await db.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true, description: true } });
    if (rows.length) return rows;
  } catch { /* DB unavailable (e.g. during build): use defaults */ }
  return DEFAULT_CATEGORIES.map((c) => ({ ...c, description: null as string | null }));
}, ['categories'], CACHE);

export const getSiteConfig = unstable_cache(async () => (await getSettings()).site, ['site-config'], { revalidate: 120, tags: ['articles', 'settings'] });

export const getBreaking = unstable_cache(async (): Promise<Card[]> => {
  const s = await getSettings();
  const since = new Date(Date.now() - s.automation.breakingWindowMinutes * 60_000);
  return (await fetchRows({ where: { ...pub, isBreaking: true, publishedAt: { gte: since } }, orderBy: { publishedAt: 'desc' }, take: 5 })).map(toCard);
}, ['breaking'], CACHE);

export const getLatest = unstable_cache(async (take = 12, skipIds: string[] = []): Promise<Card[]> =>
  (await fetchRows({ where: { ...pub, id: { notIn: skipIds } }, orderBy: { publishedAt: 'desc' }, take })).map(toCard), ['latest'], CACHE);

/** Trending = recent views with time decay; falls back to recency when there is little traffic. */
export const getTrending = unstable_cache(async (take = 6): Promise<Card[]> => {
  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT a."id" FROM "Article" a
    LEFT JOIN (SELECT "articleId", SUM("count") AS c FROM "ArticleView" WHERE "day" >= CURRENT_DATE - 2 GROUP BY "articleId") v ON v."articleId" = a."id"
    WHERE a."status" = 'PUBLISHED' AND a."publishedAt" > now() - interval '7 days'
    ORDER BY (COALESCE(v.c, 0) + 0.5) / POWER(EXTRACT(EPOCH FROM (now() - a."publishedAt")) / 3600 + 2, 1.25) DESC
    LIMIT ${take}`;
  if (!ids.length) return [];
  const rows = await fetchRows({ where: { id: { in: ids.map((i) => i.id) } } });
  return ids.map((i) => rows.find((r) => r.id === i.id)!).filter(Boolean).map(toCard);
}, ['trending'], CACHE);

export const getHome = unstable_cache(async () => {
  const [breaking, recent, trending, categories] = await Promise.all([getBreaking(), fetchRows({ where: pub, orderBy: { publishedAt: 'desc' }, take: 40 }).then((r) => r.map(toCard)), getTrending(6), getCategories()]);
  const withImage = recent.slice(0, 8).find((c) => c.imageUrl);
  const lead = breaking[0] ?? withImage ?? recent[0] ?? null;
  const rest = recent.filter((c) => c.id !== lead?.id);
  const secondary = rest.slice(0, 4);
  const latest = rest.slice(4, 16);
  const used = new Set([lead?.id, ...secondary.map((c) => c.id), ...latest.map((c) => c.id)]);
  const sections = categories
    .map((cat) => ({ category: cat, items: recent.filter((c) => c.categorySlug === cat.slug && !used.has(c.id)).slice(0, 4) }))
    .filter((s) => s.items.length >= 1);
  return { breaking, lead, secondary, latest, trending, sections, empty: recent.length === 0 };
}, ['home'], CACHE);

export const getCategoryPage = unstable_cache(async (slug: string, page: number, perPage = 18) => {
  const cat = await db.category.findUnique({ where: { slug }, select: { slug: true, name: true, description: true } });
  if (!cat) return null;
  const where = { ...pub, category: { slug } };
  const [total, rows] = await Promise.all([db.article.count({ where }), fetchRows({ where, orderBy: { publishedAt: 'desc' }, take: perPage, skip: (page - 1) * perPage })]);
  return { category: cat, total, pages: Math.max(1, Math.ceil(total / perPage)), items: rows.map(toCard) };
}, ['category-page'], CACHE);

export const getArticlePage = unstable_cache(async (slug: string) => {
  const a = await db.article.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: { category: true, sources: { orderBy: { createdAt: 'asc' } }, corrections: { orderBy: { createdAt: 'desc' } } },
  });
  if (!a) return null;
  const relatedRows = await fetchRows({
    where: { ...pub, id: { not: a.id }, OR: [{ categoryId: a.categoryId }, ...(a.tags.length ? [{ tags: { hasSome: a.tags } }] : [])] },
    orderBy: { publishedAt: 'desc' }, take: 24,
  });
  const scored = relatedRows.map((r) => ({ r, score: r.tags.filter((t) => a.tags.includes(t)).length * 2 + (r.category.slug === a.category.slug ? 1 : 0) })).sort((x, y) => y.score - x.score || +(y.r.publishedAt ?? 0) - +(x.r.publishedAt ?? 0));
  return {
    article: {
      id: a.id, slug: a.slug, title: a.title, dek: a.dek, excerpt: a.excerpt, bodyHtml: a.bodyHtml, seoTitle: a.seoTitle, metaDescription: a.metaDescription, tags: a.tags,
      category: { slug: a.category.slug, name: a.category.name },
      publishedAt: a.publishedAt!.toISOString(), updatedAt: (a.updatedContentAt ?? a.publishedAt!).toISOString(), isBreaking: a.isBreaking,
      imageUrl: a.imageUrl, imageAlt: a.imageAlt, imageCredit: a.imageCredit, imageCreditUrl: a.imageCreditUrl, imageIsAi: a.imageIsAi, imageKind: a.imageKind,
      sources: a.sources.map((s) => ({ name: s.sourceName, url: s.url, title: s.title, publishedAt: s.publishedAt?.toISOString() ?? null })),
      corrections: a.corrections.map((c) => ({ text: c.text, at: c.createdAt.toISOString() })),
    },
    related: scored.slice(0, 4).map((x) => toCard(x.r)),
  };
}, ['article-page'], CACHE);

export async function searchArticles(q: string, page = 1, perPage = 12) {
  const term = q.trim().slice(0, 120);
  if (term.length < 2) return { total: 0, items: [] as Card[], pages: 1 };
  const offset = (page - 1) * perPage;
  let ids = await db.$queryRaw<{ id: string; total: bigint }[]>`
    SELECT "id", count(*) OVER() AS total FROM "Article"
    WHERE "status"='PUBLISHED' AND "searchTsv" @@ websearch_to_tsquery('simple', ${term})
    ORDER BY ts_rank("searchTsv", websearch_to_tsquery('simple', ${term})) DESC, "publishedAt" DESC
    LIMIT ${perPage} OFFSET ${offset}`;
  if (!ids.length && page === 1) { // forgiving fallback for partial words
    const like = `%${term.replace(/[%_\\]/g, '\\$&')}%`;
    ids = await db.$queryRaw<{ id: string; total: bigint }[]>`
      SELECT "id", count(*) OVER() AS total FROM "Article" WHERE "status"='PUBLISHED' AND ("title" ILIKE ${like} OR "excerpt" ILIKE ${like})
      ORDER BY "publishedAt" DESC LIMIT ${perPage}`;
  }
  const total = ids.length ? Number(ids[0].total) : 0;
  const rows = ids.length ? await fetchRows({ where: { id: { in: ids.map((i) => i.id) } } }) : [];
  return { total, pages: Math.max(1, Math.ceil(total / perPage)), items: ids.map((i) => rows.find((r) => r.id === i.id)!).filter(Boolean).map(toCard) };
}

export const getFeedArticles = unstable_cache(async (take = 40) => db.article.findMany({
  where: pub, orderBy: { publishedAt: 'desc' }, take,
  select: { slug: true, title: true, excerpt: true, publishedAt: true, updatedAt: true, updatedContentAt: true, tags: true, category: { select: { name: true, slug: true } } },
}).then((rows) => rows.map((r) => ({ ...r, publishedAt: r.publishedAt!.toISOString(), updatedAt: (r.updatedContentAt ?? r.updatedAt).toISOString() }))), ['feed'], CACHE);

export const getSitemapArticles = unstable_cache(async () => db.article.findMany({
  where: pub, orderBy: { publishedAt: 'desc' }, take: 5000, select: { slug: true, publishedAt: true, updatedAt: true, updatedContentAt: true, title: true, tags: true },
}).then((rows) => rows.map((r) => ({ ...r, publishedAt: r.publishedAt!.toISOString(), updatedAt: (r.updatedContentAt ?? r.updatedAt).toISOString() }))), ['sitemap'], CACHE);
