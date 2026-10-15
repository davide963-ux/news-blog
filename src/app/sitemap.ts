import type { MetadataRoute } from 'next';
import { getCategories, getSitemapArticles } from '@/lib/queries';
import { abs } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, cats] = await Promise.all([getSitemapArticles().catch(() => []), getCategories()]);
  return [
    { url: abs('/'), changeFrequency: 'always', priority: 1 },
    { url: abs('/about'), changeFrequency: 'yearly', priority: 0.2 },
    ...cats.map((c) => ({ url: abs(`/category/${c.slug}`), changeFrequency: 'hourly' as const, priority: 0.7 })),
    ...articles.map((a) => ({ url: abs(`/article/${a.slug}`), lastModified: a.updatedAt, changeFrequency: 'weekly' as const, priority: 0.6 })),
  ];
}
